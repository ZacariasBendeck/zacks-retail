import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Card, Col, Row, Select, Space, Spin, Table, Typography,
} from 'antd'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSalesPivot, useSalesDimensions, type SalesPivotArgs } from '../../hooks/useReports'
import type { PivotDimension, SalesPivotLeafRow } from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'
import DateRangeControl from '../../components/reports/DateRangeControl'
import { resolveDateSpec, type DateSpec } from '../../utils/dateSpec'
import ReportHeader from '../../components/reports/ReportHeader'
import FilterChips from '../../components/reports/FilterChips'
import ReportEmptyState from '../../components/reports/ReportEmptyState'
import CollapsibleFilterCard from '../../components/reports/CollapsibleFilterCard'
import { fmtMoney, fmtQty, DASH } from '../../utils/reportFormatters'
import { SkuLink } from '../../components/sku-link'
import SaveSnapshotButton from '../../components/reports/SaveSnapshotButton'

const { Text } = Typography

const DEFAULT_DATE_SPEC: DateSpec = { type: 'this_month' }

// Every dimension that can appear at level 1 or level 2.
const L1_L2_OPTIONS: Array<{ value: PivotDimension; label: string }> = [
  { value: 'buyer',      label: 'Buyer' },
  { value: 'sector',     label: 'Sector' },
  { value: 'department', label: 'Department' },
  { value: 'season',     label: 'Season' },
  { value: 'group',      label: 'Group' },
  { value: 'vendor',     label: 'Vendor' },
  { value: 'store',      label: 'Store' },
]

// Level 3 adds Category to the list.
const L3_OPTIONS: Array<{ value: PivotDimension; label: string }> = [
  ...L1_L2_OPTIONS,
  { value: 'category', label: 'Category' },
]

function dimLabel(dim: PivotDimension): string {
  switch (dim) {
    case 'buyer':      return 'Buyer'
    case 'sector':     return 'Sector'
    case 'department': return 'Department'
    case 'season':     return 'Season'
    case 'group':      return 'Group'
    case 'vendor':     return 'Vendor'
    case 'store':      return 'Store'
    case 'category':   return 'Category'
  }
}

/**
 * Extract the (code, description, unassigned-bucket-key) for a given SKU
 * leaf at a particular dimension. Nullable source fields fall back to a
 * single `__unassigned__` bucket per dimension so no leaf goes silently
 * missing; those buckets sort last in the tree.
 */
function dimKeyLabel(leaf: SalesPivotLeafRow, dim: PivotDimension): {
  keyPart: string
  label: string
  isUnassigned: boolean
  sortNumeric: number | null
} {
  const labelFor = (code: number | string | null, desc: string | null, fallback: string): string => {
    if (code != null && desc) return `${code} — ${desc}`
    if (code != null) return String(code)
    if (desc) return desc
    return fallback
  }
  const unassigned = (explicitLabel: string) => ({
    keyPart: '__unassigned__',
    label: explicitLabel,
    isUnassigned: true,
    sortNumeric: null,
  })
  switch (dim) {
    case 'buyer':
      return leaf.buyerCode
        ? {
            keyPart: leaf.buyerCode,
            label: labelFor(leaf.buyerCode, leaf.buyerLabel, leaf.buyerCode),
            isUnassigned: false,
            sortNumeric: null,
          }
        : unassigned('(Unassigned buyer)')
    case 'sector':
      return leaf.sector != null
        ? {
            keyPart: String(leaf.sector),
            label: labelFor(leaf.sector, leaf.sectorDesc, `Sector ${leaf.sector}`),
            isUnassigned: false,
            sortNumeric: Number(leaf.sector),
          }
        : unassigned('(No sector)')
    case 'department':
      return leaf.dept != null
        ? {
            keyPart: String(leaf.dept),
            label: labelFor(leaf.dept, leaf.deptDesc, `Dept ${leaf.dept}`),
            isUnassigned: false,
            sortNumeric: Number(leaf.dept),
          }
        : unassigned('(No department)')
    case 'season':
      return leaf.season
        ? {
            keyPart: leaf.season,
            label: labelFor(leaf.season, leaf.seasonDesc, leaf.season),
            isUnassigned: false,
            sortNumeric: null,
          }
        : unassigned('(No season)')
    case 'group':
      return leaf.groupCode
        ? {
            keyPart: leaf.groupCode,
            label: labelFor(leaf.groupCode, leaf.groupDesc, leaf.groupCode),
            isUnassigned: false,
            sortNumeric: null,
          }
        : unassigned('(No group)')
    case 'vendor':
      return leaf.vendorCode
        ? {
            keyPart: leaf.vendorCode,
            label: labelFor(leaf.vendorCode, leaf.vendorLabel, leaf.vendorCode),
            isUnassigned: false,
            sortNumeric: null,
          }
        : unassigned('(No vendor)')
    case 'store':
      return leaf.storeNumber != null
        ? {
            keyPart: String(leaf.storeNumber),
            label: labelFor(leaf.storeNumber, leaf.storeName, `Store ${leaf.storeNumber}`),
            isUnassigned: false,
            sortNumeric: Number(leaf.storeNumber),
          }
        : unassigned('(No store)')
    case 'category':
      return leaf.categ != null
        ? {
            keyPart: String(leaf.categ),
            label: labelFor(leaf.categ, leaf.categDesc, `Category ${leaf.categ}`),
            isUnassigned: false,
            sortNumeric: Number(leaf.categ),
          }
        : unassigned('(No category)')
  }
}

interface TreeNode {
  rowKey: string
  label: string
  skuCode?: string
  onHandQty: number
  onHandCostVal: number
  qtyTY: number
  netSalesTY: number
  profitTY: number
  qtyLY: number
  netSalesLY: number
  profitLY: number
  children?: TreeNode[]
}

type Measures = Omit<TreeNode, 'rowKey' | 'label' | 'children' | 'skuCode'>

function emptyMeasures(): Measures {
  return {
    onHandQty: 0, onHandCostVal: 0,
    qtyTY: 0, netSalesTY: 0, profitTY: 0,
    qtyLY: 0, netSalesLY: 0, profitLY: 0,
  }
}

function addMeasures(into: Measures, r: Measures): void {
  into.onHandQty += r.onHandQty
  into.onHandCostVal += r.onHandCostVal
  into.qtyTY += r.qtyTY
  into.netSalesTY += r.netSalesTY
  into.profitTY += r.profitTY
  into.qtyLY += r.qtyLY
  into.netSalesLY += r.netSalesLY
  into.profitLY += r.profitLY
}

/**
 * Generic tree builder: groups flat leaves by the three chosen dimensions.
 * Non-leaf nodes carry rolled-up measures. Rollup rows sort by Net Sales TY
 * descending (with "(Unassigned)" buckets pinned last); SKU leaves under
 * their deepest rollup sort by Net Sales TY descending as well.
 */
function buildTree(
  rows: SalesPivotLeafRow[],
  levels: [PivotDimension, PivotDimension, PivotDimension],
): TreeNode[] {
  interface Bucket {
    keyPart: string
    label: string
    isUnassigned: boolean
    sortNumeric: number | null
    // Nested bucket at the next level, keyed by its `keyPart`.
    children: Map<string, Bucket>
    // Leaves land at the bottom bucket only.
    leaves: SalesPivotLeafRow[]
  }

  const root = new Map<string, Bucket>()
  const ensure = (into: Map<string, Bucket>, id: ReturnType<typeof dimKeyLabel>): Bucket => {
    let b = into.get(id.keyPart)
    if (!b) {
      b = {
        keyPart: id.keyPart,
        label: id.label,
        isUnassigned: id.isUnassigned,
        sortNumeric: id.sortNumeric,
        children: new Map(),
        leaves: [],
      }
      into.set(id.keyPart, b)
    }
    return b
  }

  for (const leaf of rows) {
    const l1 = dimKeyLabel(leaf, levels[0])
    const l2 = dimKeyLabel(leaf, levels[1])
    const l3 = dimKeyLabel(leaf, levels[2])
    const b1 = ensure(root, l1)
    const b2 = ensure(b1.children, l2)
    const b3 = ensure(b2.children, l3)
    b3.leaves.push(leaf)
  }

  // Sort rollup buckets: numeric dimensions first by number, others by label;
  // in all cases unassigned buckets go last. We apply the same comparator to
  // every level for consistency.
  const cmp = (a: Bucket, b: Bucket): number => {
    if (a.isUnassigned && !b.isUnassigned) return 1
    if (!a.isUnassigned && b.isUnassigned) return -1
    if (a.sortNumeric != null && b.sortNumeric != null) return a.sortNumeric - b.sortNumeric
    return a.label.localeCompare(b.label)
  }
  // Secondary pass: re-sort by Net Sales TY desc after aggregation. We do
  // the numeric/alpha sort first so the initial order is deterministic for
  // any ties at zero sales.

  const buildL3 = (bucket: Bucket, path: string): TreeNode => {
    const node: TreeNode = {
      rowKey: `${path}/${levels[2]}:${bucket.keyPart}`,
      label: bucket.label,
      ...emptyMeasures(),
      children: [...bucket.leaves]
        .sort((a, z) => {
          if (z.netSalesTY !== a.netSalesTY) return z.netSalesTY - a.netSalesTY
          return a.sku.localeCompare(z.sku)
        })
        .map<TreeNode>((leaf) => {
          const skuLabel = leaf.skuDescription ? `${leaf.sku} — ${leaf.skuDescription}` : leaf.sku
          const leafNode: TreeNode = {
            rowKey: `${path}/${levels[2]}:${bucket.keyPart}/sku:${leaf.sku}`,
            label: skuLabel,
            skuCode: leaf.sku,
            ...emptyMeasures(),
          }
          addMeasures(leafNode, leaf)
          return leafNode
        }),
    }
    for (const ch of node.children!) addMeasures(node, ch)
    return node
  }

  const buildL2 = (bucket: Bucket, path: string): TreeNode => {
    const myPath = `${path}/${levels[1]}:${bucket.keyPart}`
    const children = [...bucket.children.values()].sort(cmp).map((b) => buildL3(b, myPath))
    // Then net-sales-desc on the aggregated subtree.
    children.sort((a, b) => {
      if (b.netSalesTY !== a.netSalesTY) return b.netSalesTY - a.netSalesTY
      return 0
    })
    const node: TreeNode = {
      rowKey: myPath,
      label: bucket.label,
      ...emptyMeasures(),
      children,
    }
    for (const ch of node.children!) addMeasures(node, ch)
    return node
  }

  const topNodes = [...root.values()].sort(cmp).map<TreeNode>((bucket) => {
    const myPath = `${levels[0]}:${bucket.keyPart}`
    const children = [...bucket.children.values()].sort(cmp).map((c) => buildL2(c, myPath))
    children.sort((a, b) => b.netSalesTY - a.netSalesTY)
    const node: TreeNode = {
      rowKey: myPath,
      label: bucket.label,
      ...emptyMeasures(),
      children,
    }
    for (const ch of node.children!) addMeasures(node, ch)
    return node
  })

  topNodes.sort((a, b) => b.netSalesTY - a.netSalesTY)
  return topNodes
}

const ZONE_BG = {
  onHand: 'rgba(140, 140, 140, 0.08)',
  ty: 'rgba(22, 119, 255, 0.08)',
  ly: 'rgba(250, 173, 20, 0.08)',
} as const

export default function SalesPivotCustomPage() {
  const qc = useQueryClient()

  const [dateSpec, setDateSpec] = useState<DateSpec>(DEFAULT_DATE_SPEC)
  const [selectedStores, setSelectedStores] = useState<number[]>([])
  const [selectedSectors, setSelectedSectors] = useState<number[]>([])
  const [selectedDepartments, setSelectedDepartments] = useState<number[]>([])
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>([])
  const [selectedBuyers, setSelectedBuyers] = useState<string[]>([])
  const [level1, setLevel1] = useState<PivotDimension>('buyer')
  const [level2, setLevel2] = useState<PivotDimension>('vendor')
  const [level3, setLevel3] = useState<PivotDimension>('category')
  const [query, setQuery] = useState<SalesPivotArgs | null>(null)
  const [filterOpen, setFilterOpen] = useState(true)

  const { data: dims, isLoading: dimsLoading } = useSalesDimensions()
  const { data, isFetching, error } = useSalesPivot(query)
  const running = query != null && isFetching

  useEffect(() => {
    if (query && data && !isFetching) setFilterOpen(false)
  }, [query, data, isFetching])

  const resultRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (query && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [query])

  // Prevent duplicates: disable an option in later dropdowns once it's
  // picked earlier. The operator still sees every choice at every level,
  // just greyed out for the ones that would collide.
  const disabledAt2 = new Set<PivotDimension>([level1])
  const disabledAt3 = new Set<PivotDimension>([level1, level2])
  const isValid = new Set<PivotDimension>([level1, level2, level3]).size === 3

  function onRun(): void {
    if (!isValid) return
    const { startDate, endDate } = resolveDateSpec(dateSpec)
    setQuery({
      startDate,
      endDate,
      stores: selectedStores.length ? selectedStores : undefined,
      variant: 'custom',
      levels: [level1, level2, level3],
      sectors: selectedSectors.length ? selectedSectors : undefined,
      departments: selectedDepartments.length ? selectedDepartments : undefined,
      seasons: selectedSeasons.length ? selectedSeasons : undefined,
      buyers: selectedBuyers.length ? selectedBuyers : undefined,
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['sales-pivot', query] })
  }

  const reportLevels = data?.levels ?? null
  const tree = useMemo(
    () => (data && reportLevels ? buildTree(data.rows, reportLevels) : []),
    [data, reportLevels],
  )

  const currentYear = data?.currentYear
  const priorYear = data?.priorYear

  const title = reportLevels
    ? `${dimLabel(reportLevels[0])} → ${dimLabel(reportLevels[1])} → ${dimLabel(reportLevels[2])} → SKU`
    : 'Custom Pivot Report'

  const columns = useMemo(() => {
    const moneyCell = (v: number) => (v === 0 ? DASH : fmtMoney(v))
    const qtyCell = (v: number) => (v === 0 ? DASH : fmtQty(v))
    const rightAlign = { align: 'right' as const }
    return [
      {
        title: 'Group',
        dataIndex: 'label',
        key: 'label',
        width: 440,
        fixed: 'left' as const,
        render: (_v: string, record: TreeNode) =>
          record.skuCode
            ? <SkuLink skuCode={record.skuCode}>{record.label}</SkuLink>
            : record.label,
      },
      {
        title: 'On Hand', key: 'onHand',
        onHeaderCell: () => ({ style: { background: ZONE_BG.onHand } }),
        children: [
          { title: 'Qty', dataIndex: 'onHandQty', key: 'onHandQty', width: 100, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.onHand } }), render: qtyCell },
          { title: 'Cost Val', dataIndex: 'onHandCostVal', key: 'onHandCostVal', width: 140, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.onHand } }), render: moneyCell },
        ],
      },
      {
        title: currentYear != null ? String(currentYear) : 'This Year',
        key: 'ty',
        onHeaderCell: () => ({ style: { background: ZONE_BG.ty } }),
        children: [
          { title: 'Qty', dataIndex: 'qtyTY', key: 'qtyTY', width: 100, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ty } }), render: qtyCell },
          { title: 'Net Sales', dataIndex: 'netSalesTY', key: 'netSalesTY', width: 140, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ty } }), render: moneyCell },
          { title: 'Profit', dataIndex: 'profitTY', key: 'profitTY', width: 140, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ty } }), render: moneyCell },
        ],
      },
      {
        title: priorYear != null ? String(priorYear) : 'Prior Year',
        key: 'ly',
        onHeaderCell: () => ({ style: { background: ZONE_BG.ly } }),
        children: [
          { title: 'Qty', dataIndex: 'qtyLY', key: 'qtyLY', width: 100, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ly } }), render: qtyCell },
          { title: 'Net Sales', dataIndex: 'netSalesLY', key: 'netSalesLY', width: 140, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ly } }), render: moneyCell },
          { title: 'Profit', dataIndex: 'profitLY', key: 'profitLY', width: 140, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ly } }), render: moneyCell },
        ],
      },
    ]
  }, [currentYear, priorYear])

  return (
    <div>
      <ReportHeader
        title={title}
        description="Pick any three dimensions — the report groups SKUs as Level 1 → Level 2 → Level 3 → SKU. SKUs inside each bottom bucket sort by Net Sales (this year) descending."
        breadcrumb={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Custom Pivot' },
        ]}
        rightMeta={data ? `${data.rows.length.toLocaleString()} leaf ${data.rows.length === 1 ? 'row' : 'rows'}` : undefined}
        actions={
          <SaveSnapshotButton
            reportType="sales-pivot"
            disabled={!data}
            getParamsJson={() => ({
              variant: 'custom',
              levels: query?.levels,
              startDate: query?.startDate,
              endDate: query?.endDate,
              stores: query?.stores,
              sectors: query?.sectors,
              departments: query?.departments,
              seasons: query?.seasons,
              buyers: query?.buyers,
              dateSpec,
              level1, level2, level3,
            })}
            getResultJson={() => data}
          />
        }
      />

      <CollapsibleFilterCard
        open={filterOpen}
        onOpenChange={setFilterOpen}
        running={running}
        canRun={isValid}
        onRun={onRun}
        actions={<RunReportControls running={running} hasRun={query != null} onRun={onRun} onStop={onStop} />}
      >
        <Row gutter={24}>
          <Col xs={24} md={14}>
            <Card size="small" title={<Text strong>Hierarchy</Text>}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Row gutter={8} align="middle">
                  <Col style={{ width: 72 }}><Text>Level 1</Text></Col>
                  <Col flex="auto">
                    <Select<PivotDimension>
                      value={level1}
                      onChange={setLevel1}
                      style={{ width: '100%' }}
                      options={L1_L2_OPTIONS}
                    />
                  </Col>
                </Row>
                <Row gutter={8} align="middle">
                  <Col style={{ width: 72 }}><Text>Level 2</Text></Col>
                  <Col flex="auto">
                    <Select<PivotDimension>
                      value={level2}
                      onChange={setLevel2}
                      style={{ width: '100%' }}
                      options={L1_L2_OPTIONS.map((o) => ({
                        ...o,
                        disabled: disabledAt2.has(o.value),
                      }))}
                    />
                  </Col>
                </Row>
                <Row gutter={8} align="middle">
                  <Col style={{ width: 72 }}><Text>Level 3</Text></Col>
                  <Col flex="auto">
                    <Select<PivotDimension>
                      value={level3}
                      onChange={setLevel3}
                      style={{ width: '100%' }}
                      options={L3_OPTIONS.map((o) => ({
                        ...o,
                        disabled: disabledAt3.has(o.value),
                      }))}
                    />
                  </Col>
                </Row>
                {!isValid && (
                  <Text type="warning" style={{ fontSize: 12 }}>
                    Each level must pick a distinct dimension.
                  </Text>
                )}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  SKUs always sit at the bottom of the tree. Category is available at level 3 only.
                </Text>
              </Space>
            </Card>
          </Col>
          <Col xs={24} md={10}>
            <Card size="small" title={<Text strong>Period</Text>}>
              <DateRangeControl value={dateSpec} onChange={setDateSpec} />
              <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                Prior-year columns cover the same window one year earlier.
              </Text>
            </Card>
            <Card size="small" title={<Text strong>Criteria</Text>} style={{ marginTop: 16 }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div>
                  <Text style={{ fontSize: 12 }}>Stores</Text>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="All stores"
                    loading={dimsLoading}
                    value={selectedStores}
                    onChange={setSelectedStores}
                    style={{ width: '100%' }}
                    options={(dims?.stores ?? []).map((s) => ({
                      value: s.number,
                      label: s.name ? `${s.number} — ${s.name}` : String(s.number),
                    }))}
                    optionFilterProp="label"
                  />
                </div>
                <div>
                  <Text style={{ fontSize: 12 }}>Sectors</Text>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="All sectors"
                    loading={dimsLoading}
                    value={selectedSectors}
                    onChange={setSelectedSectors}
                    style={{ width: '100%' }}
                    options={(dims?.sectors ?? []).map((s) => ({
                      value: s.number,
                      label: s.name ? `${s.number} — ${s.name}` : String(s.number),
                    }))}
                    optionFilterProp="label"
                  />
                </div>
                <div>
                  <Text style={{ fontSize: 12 }}>Departments</Text>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="All departments"
                    loading={dimsLoading}
                    value={selectedDepartments}
                    onChange={setSelectedDepartments}
                    style={{ width: '100%' }}
                    options={(dims?.departments ?? []).map((d) => ({
                      value: d.number,
                      label: d.name ? `${d.number} — ${d.name}` : String(d.number),
                    }))}
                    optionFilterProp="label"
                  />
                </div>
                <div>
                  <Text style={{ fontSize: 12 }}>Seasons</Text>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="All seasons"
                    loading={dimsLoading}
                    value={selectedSeasons}
                    onChange={setSelectedSeasons}
                    style={{ width: '100%' }}
                    options={(dims?.seasons ?? []).map((s) => ({
                      value: s.code,
                      label: s.description ? `${s.code} — ${s.description}` : s.code,
                    }))}
                    optionFilterProp="label"
                  />
                </div>
                <div>
                  <Text style={{ fontSize: 12 }}>Buyers</Text>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="All buyers"
                    loading={dimsLoading}
                    value={selectedBuyers}
                    onChange={setSelectedBuyers}
                    style={{ width: '100%' }}
                    options={(dims?.buyers ?? []).map((b) => ({
                      value: b.code,
                      label: b.label ? `${b.code} — ${b.label}` : b.code,
                    }))}
                    optionFilterProp="label"
                  />
                </div>
                <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                  Each criterion narrows the SKU set. Leave blank to include everything.
                </Text>
              </Space>
            </Card>
          </Col>
        </Row>
      </CollapsibleFilterCard>

      <div ref={resultRef} style={{ scrollMarginTop: 12 }}>
        {error && (
          <Alert
            type="error"
            message="Failed to load report"
            description={getErrorMessage(error)}
            style={{ marginBottom: 16 }}
          />
        )}

        {!query ? (
          <ReportEmptyState
            reason="idle"
            message="Pick your three dimensions and a period, then click Run Report."
          />
        ) : running ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" tip="Building pivot…" />
          </div>
        ) : data && data.rows.length === 0 ? (
          <ReportEmptyState
            reason="no-results"
            hint={`No sales or on-hand activity between ${query.startDate} and ${query.endDate} for the selected filters.`}
          />
        ) : data ? (
          <>
            <FilterChips
              chips={[
                reportLevels ? { label: 'Levels', value: reportLevels.map(dimLabel).join(' → ') } : null,
                { label: 'Period', value: `${query.startDate} → ${query.endDate}` },
                { label: 'Compare', value: `${data.currentYear} vs ${data.priorYear}` },
                query.stores?.length
                  ? { label: 'Stores', value: `${query.stores.length} selected` }
                  : { label: 'Stores', value: 'All' },
                query.sectors?.length ? { label: 'Sectors', value: `${query.sectors.length} selected` } : null,
                query.departments?.length ? { label: 'Depts', value: `${query.departments.length} selected` } : null,
                query.seasons?.length ? { label: 'Seasons', value: query.seasons.join(', ') } : null,
                query.buyers?.length ? { label: 'Buyers', value: query.buyers.join(', ') } : null,
              ]}
            />
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Table<TreeNode>
                dataSource={tree}
                columns={columns}
                rowKey="rowKey"
                size="small"
                pagination={false}
                scroll={{ x: 1160 }}
                bordered
                expandable={{ defaultExpandAllRows: false }}
                summary={() => {
                  const t = data.totals
                  return (
                    <Table.Summary fixed>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}><strong>Totals</strong></Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right">{fmtQty(t.onHandQty)}</Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right">{fmtMoney(t.onHandCostVal)}</Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right">{fmtQty(t.qtyTY)}</Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="right">{fmtMoney(t.netSalesTY)}</Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="right">{fmtMoney(t.profitTY)}</Table.Summary.Cell>
                        <Table.Summary.Cell index={6} align="right">{fmtQty(t.qtyLY)}</Table.Summary.Cell>
                        <Table.Summary.Cell index={7} align="right">{fmtMoney(t.netSalesLY)}</Table.Summary.Cell>
                        <Table.Summary.Cell index={8} align="right">{fmtMoney(t.profitLY)}</Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  )
                }}
              />
            </Space>
          </>
        ) : null}
      </div>
    </div>
  )
}
