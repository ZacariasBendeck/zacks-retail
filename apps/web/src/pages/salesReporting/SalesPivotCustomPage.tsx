import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Alert, Card, Checkbox, Col, Row, Select, Space, Spin, Table, Typography,
} from 'antd'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSalesPivot, useSalesDimensions, type SalesPivotArgs } from '../../hooks/useReports'
import type {
  PivotDimension,
  SalesPivotAttributeDimension,
  SalesPivotLeafRow,
  SalesPivotLevels,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'
import DateRangeControl from '../../components/reports/DateRangeControl'
import { briefDateSpec, resolveDateSpec, type DateSpec } from '../../utils/dateSpec'
import ReportHeader from '../../components/reports/ReportHeader'
import FilterChips from '../../components/reports/FilterChips'
import ReportEmptyState from '../../components/reports/ReportEmptyState'
import CollapsibleFilterCard from '../../components/reports/CollapsibleFilterCard'
import { fmtMoney, fmtQty, DASH } from '../../utils/reportFormatters'
import { SkuLink } from '../../components/sku-link'
import SaveSnapshotButton from '../../components/reports/SaveSnapshotButton'
import ReportThumbnail from '../../components/reports/ReportThumbnail'
import { buildRicsImageUrl } from '../../services/ricsImageUrl'
import { ReportCriteriaPanel, useReportCriteria } from '../../components/reports/ReportCriteriaPanel'
import {
  buildParentTotalsByRowKey,
  formatParentPercent,
  type SalesPivotMeasureKey,
  type SalesPivotMeasureRecord,
} from './salesPivotParentPercentages'

const { Text } = Typography

const DEFAULT_DATE_SPEC: DateSpec = { type: 'this_month' }

// Broad dimensions that can appear at the top of a custom hierarchy.
const L1_OPTIONS: Array<{ value: PivotDimension; label: string }> = [
  { value: 'buyer',      label: 'Buyer' },
  { value: 'sector',     label: 'Sector' },
  { value: 'department', label: 'Department' },
  { value: 'season',     label: 'Season' },
  { value: 'group',      label: 'Group' },
  { value: 'vendor',     label: 'Vendor' },
  { value: 'store',      label: 'Store' },
]

// Level 2 can include Category so operators can build Department -> Category -> Attribute.
const L2_OPTIONS: Array<{ value: PivotDimension; label: string }> = [
  ...L1_OPTIONS,
  { value: 'category', label: 'Category' },
]

// The deepest selected level can be a normal dimension, Category, or a dynamic SKU attribute.
const DEEPEST_OPTIONS: Array<{ value: PivotDimension; label: string }> = [
  ...L2_OPTIONS,
  { value: 'attribute', label: 'Attribute' },
]

function dimLabel(dim: PivotDimension | undefined, attributeLabel?: string | null): string {
  switch (dim) {
    case 'buyer':      return 'Buyer'
    case 'sector':     return 'Sector'
    case 'department': return 'Department'
    case 'season':     return 'Season'
    case 'group':      return 'Group'
    case 'vendor':     return 'Vendor'
    case 'store':      return 'Store'
    case 'category':   return 'Category'
    case 'attribute':  return attributeLabel || 'Attribute'
    default:           return ''
  }
}

/**
 * Extract the (code, description, unassigned-bucket-key) for a given SKU
 * leaf at a particular dimension. Nullable source fields fall back to a
 * single `__unassigned__` bucket per dimension so no leaf goes silently
 * missing; those buckets sort last in the tree.
 */
function dimKeyLabel(
  leaf: SalesPivotLeafRow,
  dim: PivotDimension,
  attributeDimension?: SalesPivotAttributeDimension | null,
): {
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
    case 'attribute': {
      const attributeLabel = attributeDimension?.label ?? 'attribute'
      const assignment = attributeDimension?.code
        ? leaf.attributeAssignments?.[attributeDimension.code]
        : null
      if (!assignment || assignment.valueLabels.length === 0) {
        return unassigned(`(No ${attributeLabel})`)
      }
      return {
        keyPart: assignment.valueCodes.length > 0
          ? assignment.valueCodes.join('|')
          : assignment.label,
        label: assignment.label,
        isUnassigned: false,
        sortNumeric: null,
      }
    }
  }
}

interface TreeNode {
  rowKey: string
  label: string
  skuCode?: string
  pictureFileName?: string | null
  onHandQty: number
  onHandCostVal: number
  onHandSkuCount: number
  onHandSkuKeys: Set<string>
  qtyTY: number
  netSalesTY: number
  profitTY: number
  qtyLY: number
  netSalesLY: number
  profitLY: number
  children?: TreeNode[]
}

type Measures = Pick<
  TreeNode,
  | 'onHandQty'
  | 'onHandCostVal'
  | 'onHandSkuCount'
  | 'onHandSkuKeys'
  | 'qtyTY'
  | 'netSalesTY'
  | 'profitTY'
  | 'qtyLY'
  | 'netSalesLY'
  | 'profitLY'
>

function emptyMeasures(): Measures {
  return {
    onHandQty: 0, onHandCostVal: 0, onHandSkuCount: 0, onHandSkuKeys: new Set<string>(),
    qtyTY: 0, netSalesTY: 0, profitTY: 0,
    qtyLY: 0, netSalesLY: 0, profitLY: 0,
  }
}

function addMeasures(into: Measures, r: Measures | SalesPivotLeafRow): void {
  into.onHandQty += r.onHandQty
  into.onHandCostVal += r.onHandCostVal
  if ('onHandSkuKeys' in r) {
    for (const sku of r.onHandSkuKeys) into.onHandSkuKeys.add(sku)
  } else if (r.onHandQty !== 0) {
    into.onHandSkuKeys.add(r.sku)
  }
  into.onHandSkuCount = into.onHandSkuKeys.size
  into.qtyTY += r.qtyTY
  into.netSalesTY += r.netSalesTY
  into.profitTY += r.profitTY
  into.qtyLY += r.qtyLY
  into.netSalesLY += r.netSalesLY
  into.profitLY += r.profitLY
}

/**
 * Generic tree builder: groups flat leaves by the chosen dimensions.
 * Non-leaf nodes carry rolled-up measures. Rollup rows sort by Net Sales TY
 * descending (with "(Unassigned)" buckets pinned last); SKU leaves under
 * their deepest rollup sort by Net Sales TY descending as well.
 */
function buildTree(
  rows: SalesPivotLeafRow[],
  levels: SalesPivotLevels,
  attributeDimension?: SalesPivotAttributeDimension | null,
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
    let into = root
    for (let index = 0; index < levels.length; index += 1) {
      const bucket = ensure(into, dimKeyLabel(leaf, levels[index]!, attributeDimension))
      if (index === levels.length - 1) {
        bucket.leaves.push(leaf)
      } else {
        into = bucket.children
      }
    }
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

  if (levels.length === 2) {
    const buildDeepest = (bucket: Bucket, path: string): TreeNode => {
      const node: TreeNode = {
        rowKey: `${path}/${levels[1]}:${bucket.keyPart}`,
        label: bucket.label,
        ...emptyMeasures(),
        children: [...bucket.leaves]
          .sort((a, z) => {
            if (z.netSalesTY !== a.netSalesTY) return z.netSalesTY - a.netSalesTY
            return a.sku.localeCompare(z.sku)
          })
          .map<TreeNode>((leaf) => {
            const skuLabel = leaf.skuDescription ? `${leaf.sku} - ${leaf.skuDescription}` : leaf.sku
            const leafNode: TreeNode = {
              rowKey: `${path}/${levels[1]}:${bucket.keyPart}/sku:${leaf.sku}`,
              label: skuLabel,
              skuCode: leaf.sku,
              pictureFileName: leaf.pictureFileName,
              ...emptyMeasures(),
            }
            addMeasures(leafNode, leaf)
            return leafNode
          }),
      }
      for (const ch of node.children!) addMeasures(node, ch)
      return node
    }

    const topNodes = [...root.values()].sort(cmp).map<TreeNode>((bucket) => {
      const myPath = `${levels[0]}:${bucket.keyPart}`
      const children = [...bucket.children.values()].sort(cmp).map((c) => buildDeepest(c, myPath))
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
            pictureFileName: leaf.pictureFileName,
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
  const { criteria, updateCriteria, compactCriteria } = useReportCriteria()
  const selectedStores = criteria.stores
  const selectedChains = criteria.chains
  const selectedSectors = criteria.sectors
  const selectedDepartments = criteria.departments
  const selectedSeasons = criteria.seasons
  const selectedBuyers = criteria.buyers
  const setSelectedStores = (next: number[]) => updateCriteria('stores', next)
  const setSelectedChains = (next: string[]) => updateCriteria('chains', next)
  const setSelectedSectors = (next: number[]) => updateCriteria('sectors', next)
  const setSelectedDepartments = (next: number[]) => updateCriteria('departments', next)
  const setSelectedSeasons = (next: string[]) => updateCriteria('seasons', next)
  const setSelectedBuyers = (next: string[]) => updateCriteria('buyers', next)
  const [hierarchyDepth, setHierarchyDepth] = useState<2 | 3>(3)
  const [level1, setLevel1] = useState<PivotDimension>('buyer')
  const [level2, setLevel2] = useState<PivotDimension>('vendor')
  const [level3, setLevel3] = useState<PivotDimension>('category')
  const [attributeDimensionCode, setAttributeDimensionCode] = useState<string | null>(null)
  const [showPercentOfParent, setShowPercentOfParent] = useState(false)
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
  const level2Options = hierarchyDepth === 2 ? DEEPEST_OPTIONS : L2_OPTIONS
  const selectedLevels = (hierarchyDepth === 2
    ? [level1, level2]
    : [level1, level2, level3]) as SalesPivotLevels
  const deepestLevelIndex = selectedLevels.length - 1
  const isValid =
    new Set<PivotDimension>(selectedLevels).size === selectedLevels.length &&
    selectedLevels.every((level, index) => {
      if (index === 0 && (level === 'category' || level === 'attribute')) return false
      if (level === 'attribute') return index === deepestLevelIndex
      return true
    })

  useEffect(() => {
    if (hierarchyDepth === 3 && level2 === 'attribute') {
      setLevel2(level1 === 'vendor' ? 'buyer' : 'vendor')
    }
  }, [hierarchyDepth, level1, level2])

  function onRun(): void {
    if (!isValid) return
    const { startDate, endDate } = resolveDateSpec(dateSpec)
    setQuery({
      startDate,
      endDate,
      variant: 'custom',
      levels: selectedLevels,
      ...compactCriteria,
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['sales-pivot', query] })
  }

  const reportLevels = data?.levels ?? null
  const attributeDimensions = data?.attributeDimensions ?? []
  const selectedAttributeDimension = useMemo<SalesPivotAttributeDimension | null>(() => {
    if (!reportLevels?.includes('attribute')) return null
    return attributeDimensions.find((dimension) => dimension.code === attributeDimensionCode)
      ?? attributeDimensions[0]
      ?? null
  }, [attributeDimensionCode, attributeDimensions, reportLevels])

  useEffect(() => {
    if (!reportLevels?.includes('attribute')) return
    if (attributeDimensions.length === 0) {
      if (attributeDimensionCode !== null) setAttributeDimensionCode(null)
      return
    }
    if (!selectedAttributeDimension) return
    if (attributeDimensionCode !== selectedAttributeDimension.code) {
      setAttributeDimensionCode(selectedAttributeDimension.code)
    }
  }, [attributeDimensionCode, attributeDimensions, reportLevels, selectedAttributeDimension])

  const tree = useMemo(
    () => (data && reportLevels ? buildTree(data.rows, reportLevels, selectedAttributeDimension) : []),
    [data, reportLevels, selectedAttributeDimension],
  )
  const totalOnHandSkuCount = useMemo(() => {
    if (!data) return 0
    const skus = new Set<string>()
    for (const row of data.rows) {
      if (row.onHandQty !== 0) skus.add(row.sku)
    }
    return skus.size
  }, [data])
  const parentTotalsByRowKey = useMemo(() => {
    if (!data) return new Map<string, SalesPivotMeasureRecord>()
    return buildParentTotalsByRowKey(tree, {
      onHandQty: data.totals.onHandQty,
      onHandCostVal: data.totals.onHandCostVal,
      onHandSkuCount: totalOnHandSkuCount,
      qtyTY: data.totals.qtyTY,
      netSalesTY: data.totals.netSalesTY,
      profitTY: data.totals.profitTY,
      qtyLY: data.totals.qtyLY,
      netSalesLY: data.totals.netSalesLY,
      profitLY: data.totals.profitLY,
    })
  }, [data, totalOnHandSkuCount, tree])

  const currentYear = data?.currentYear
  const priorYear = data?.priorYear
  const reportDimLabel = (dim: PivotDimension | undefined) =>
    dimLabel(dim, dim === 'attribute' ? selectedAttributeDimension?.label : null)
  const showAttributeSelector =
    selectedLevels.includes('attribute') || reportLevels?.includes('attribute') === true

  const displayTitle = reportLevels
    ? [...reportLevels.map(reportDimLabel), 'SKU'].join(' -> ')
    : 'Custom Pivot Report'
  const tableScrollX = showPercentOfParent ? 2125 : 1270

  const columns = useMemo(() => {
    const moneyCell = (v: number) => (v === 0 ? DASH : fmtMoney(v))
    const qtyCell = (v: number) => (v === 0 ? DASH : fmtQty(v))
    const rightAlign = { align: 'right' as const }
    const percentColumn = (metricKey: SalesPivotMeasureKey, background: string) => (
      showPercentOfParent
        ? [{
            title: '% Parent',
            dataIndex: metricKey,
            key: `${metricKey}PctParent`,
            width: 95,
            ...rightAlign,
            onCell: () => ({ style: { background } }),
            render: (_v: number, record: TreeNode) =>
              formatParentPercent(record[metricKey], parentTotalsByRowKey.get(record.rowKey)?.[metricKey]),
          }]
        : []
    )
    return [
      {
        title: 'Group',
        dataIndex: 'label',
        key: 'label',
        width: 440,
        fixed: 'left' as const,
        render: (_v: string, record: TreeNode) => {
          if (!record.skuCode) return record.label
          return (
            <Space size={8}>
              <ReportThumbnail
                url={buildRicsImageUrl(record.pictureFileName)}
                alt={record.skuCode}
                height={28}
                maxWidth={48}
              />
              <SkuLink skuCode={record.skuCode}>{record.label}</SkuLink>
            </Space>
          )
        },
      },
      {
        title: 'On Hand', key: 'onHand',
        onHeaderCell: () => ({ style: { background: ZONE_BG.onHand } }),
        children: [
          { title: 'Qty', dataIndex: 'onHandQty', key: 'onHandQty', width: 100, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.onHand } }), render: qtyCell },
          ...percentColumn('onHandQty', ZONE_BG.onHand),
          { title: 'Cost Val', dataIndex: 'onHandCostVal', key: 'onHandCostVal', width: 140, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.onHand } }), render: moneyCell },
          ...percentColumn('onHandCostVal', ZONE_BG.onHand),
          { title: 'SKU Count', dataIndex: 'onHandSkuCount', key: 'onHandSkuCount', width: 110, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.onHand } }), render: qtyCell },
          ...percentColumn('onHandSkuCount', ZONE_BG.onHand),
        ],
      },
      {
        title: currentYear != null ? String(currentYear) : 'This Year',
        key: 'ty',
        onHeaderCell: () => ({ style: { background: ZONE_BG.ty } }),
        children: [
          { title: 'Qty', dataIndex: 'qtyTY', key: 'qtyTY', width: 100, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ty } }), render: qtyCell },
          ...percentColumn('qtyTY', ZONE_BG.ty),
          { title: 'Net Sales', dataIndex: 'netSalesTY', key: 'netSalesTY', width: 140, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ty } }), render: moneyCell },
          ...percentColumn('netSalesTY', ZONE_BG.ty),
          { title: 'Profit', dataIndex: 'profitTY', key: 'profitTY', width: 140, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ty } }), render: moneyCell },
          ...percentColumn('profitTY', ZONE_BG.ty),
        ],
      },
      {
        title: priorYear != null ? String(priorYear) : 'Prior Year',
        key: 'ly',
        onHeaderCell: () => ({ style: { background: ZONE_BG.ly } }),
        children: [
          { title: 'Qty', dataIndex: 'qtyLY', key: 'qtyLY', width: 100, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ly } }), render: qtyCell },
          ...percentColumn('qtyLY', ZONE_BG.ly),
          { title: 'Net Sales', dataIndex: 'netSalesLY', key: 'netSalesLY', width: 140, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ly } }), render: moneyCell },
          ...percentColumn('netSalesLY', ZONE_BG.ly),
          { title: 'Profit', dataIndex: 'profitLY', key: 'profitLY', width: 140, ...rightAlign,
            onCell: () => ({ style: { background: ZONE_BG.ly } }), render: moneyCell },
          ...percentColumn('profitLY', ZONE_BG.ly),
        ],
      },
    ]
  }, [currentYear, parentTotalsByRowKey, priorYear, showPercentOfParent])

  return (
    <div>
      <ReportHeader
        title={displayTitle}
        description="Pick any three dimensions — the report groups SKUs as Level 1 → Level 2 → Level 3 → SKU. SKUs inside each bottom bucket sort by Net Sales (this year) descending."
        breadcrumb={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Custom Pivot' },
        ]}
        rightMeta={data ? `${data.rows.length.toLocaleString()} leaf ${data.rows.length === 1 ? 'row' : 'rows'}` : undefined}
        actions={
          <Space wrap>
            {reportLevels?.includes('attribute') && (
              <Space size={6}>
                <Text type="secondary">Attribute</Text>
                <Select<string>
                  value={selectedAttributeDimension?.code}
                  onChange={setAttributeDimensionCode}
                  style={{ width: 220 }}
                  disabled={!data || attributeDimensions.length === 0}
                  placeholder={data ? 'No attributes in result' : 'Run report to load attributes'}
                  options={attributeDimensions.map((dimension) => ({
                    value: dimension.code,
                    label: dimension.label,
                  }))}
                />
              </Space>
            )}
            <SaveSnapshotButton
              reportType="sales-pivot"
              disabled={!data}
              getParamsJson={() => ({
                variant: 'custom',
                levels: query?.levels,
                startDate: query?.startDate,
                endDate: query?.endDate,
                ...compactCriteria,
                dateSpec,
                hierarchyDepth, level1, level2, level3,
                attributeDimensionCode: selectedAttributeDimension?.code ?? attributeDimensionCode,
                showPercentOfParent,
              })}
              getResultJson={() => data}
              getDescriptor={() => {
                const lvls = query?.levels ?? selectedLevels
                const parts: string[] = [
                  `Custom: ${lvls.map(reportDimLabel).join(' → ')}`,
                ]
                const counts: string[] = []
                if (compactCriteria.stores?.length) counts.push(`stores ${compactCriteria.stores.length}`)
                if (compactCriteria.chains?.length) counts.push(`chains ${compactCriteria.chains.length}`)
                if (compactCriteria.sectors?.length) counts.push(`sectors ${compactCriteria.sectors.length}`)
                if (compactCriteria.departments?.length) counts.push(`depts ${compactCriteria.departments.length}`)
                if (compactCriteria.seasons?.length) counts.push(`seasons ${compactCriteria.seasons.length}`)
                if (compactCriteria.buyers?.length) counts.push(`buyers ${compactCriteria.buyers.length}`)
                if (counts.length) parts.push(counts.join(', '))
                parts.push(briefDateSpec(dateSpec))
                return parts.join(' · ')
              }}
            />
          </Space>
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
                  <Col style={{ width: 72 }}><Text>Levels</Text></Col>
                  <Col flex="auto">
                    <Select<2 | 3>
                      value={hierarchyDepth}
                      onChange={setHierarchyDepth}
                      style={{ width: '100%' }}
                      options={[
                        { value: 2, label: '2 levels' },
                        { value: 3, label: '3 levels' },
                      ]}
                    />
                  </Col>
                </Row>
                <Row gutter={8} align="middle">
                  <Col style={{ width: 72 }}><Text>Level 1</Text></Col>
                  <Col flex="auto">
                    <Select<PivotDimension>
                      value={level1}
                      onChange={setLevel1}
                      style={{ width: '100%' }}
                      options={L1_OPTIONS}
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
                      options={level2Options.map((o) => ({
                        ...o,
                        disabled: disabledAt2.has(o.value),
                      }))}
                    />
                  </Col>
                </Row>
                {hierarchyDepth === 3 && (
                  <Row gutter={8} align="middle">
                    <Col style={{ width: 72 }}><Text>Level 3</Text></Col>
                    <Col flex="auto">
                      <Select<PivotDimension>
                        value={level3}
                        onChange={setLevel3}
                        style={{ width: '100%' }}
                        options={DEEPEST_OPTIONS.map((o) => ({
                          ...o,
                          disabled: disabledAt3.has(o.value),
                        }))}
                      />
                    </Col>
                  </Row>
                )}
                {showAttributeSelector && (
                  <Row gutter={8} align="middle">
                    <Col style={{ width: 72 }}><Text>Attribute</Text></Col>
                    <Col flex="auto">
                      <Select<string>
                        value={selectedAttributeDimension?.code}
                        onChange={setAttributeDimensionCode}
                        style={{ width: '100%' }}
                        disabled={!data || attributeDimensions.length === 0}
                        placeholder={data ? 'No attributes in result' : 'Run report to load attributes'}
                        options={attributeDimensions.map((dimension) => ({
                          value: dimension.code,
                          label: dimension.label,
                        }))}
                      />
                    </Col>
                  </Row>
                )}
                {!isValid && (
                  <Text type="warning" style={{ fontSize: 12 }}>
                    Each level must pick a distinct dimension.
                  </Text>
                )}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  SKUs always sit at the bottom of the tree. Category can be level 2; Attribute is only a deepest level.
                </Text>
                <Checkbox
                  checked={showPercentOfParent}
                  onChange={(e) => setShowPercentOfParent(e.target.checked)}
                >
                  Show % of parent
                </Checkbox>
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
            <ReportCriteriaPanel
              value={criteria}
              onChange={updateCriteria}
              dimensions={dims}
              loading={dimsLoading}
              title="Criteria"
            />
            {false && (
            <Card size="small" title={<Text strong>Criteria</Text>} style={{ marginTop: 16 }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div>
                  <Text style={{ fontSize: 12 }}>Retail Chain</Text>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder="All chains"
                    loading={dimsLoading}
                    value={selectedChains}
                    onChange={setSelectedChains}
                    style={{ width: '100%' }}
                    options={(dims?.chains ?? []).map((c) => ({
                      value: c.code,
                      label: `${c.label} (${c.storeNumbers.length} stores)`,
                    }))}
                    optionFilterProp="label"
                    notFoundContent="No retail chains configured"
                  />
                </div>
                <div>
                  <Text style={{ fontSize: 12 }}>Stores</Text>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder=""
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
                  Retail Chain and Stores narrow the store set. The other criteria narrow the SKU set.
                </Text>
              </Space>
            </Card>
            )}
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
                reportLevels ? { label: 'Levels', value: reportLevels.map(reportDimLabel).join(' → ') } : null,
                reportLevels?.includes('attribute') && selectedAttributeDimension
                  ? { label: 'Attribute', value: selectedAttributeDimension.label }
                  : null,
                { label: 'Period', value: `${query.startDate} → ${query.endDate}` },
                { label: 'Compare', value: `${data.currentYear} vs ${data.priorYear}` },
                showPercentOfParent ? { label: 'Percentages', value: '% of parent' } : null,
                query.chains?.length ? { label: 'Retail Chains', value: `${query.chains.length} selected` } : null,
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
                scroll={{ x: tableScrollX }}
                bordered
                expandable={{ defaultExpandAllRows: false }}
                summary={() => {
                  const t = data.totals
                  let index = 1
                  const measureCells: ReactNode[] = []
                  const addMeasureCell = (key: SalesPivotMeasureKey, content: ReactNode, value: number) => {
                    measureCells.push(
                      <Table.Summary.Cell key={`${key}-value`} index={index} align="right">
                        {content}
                      </Table.Summary.Cell>,
                    )
                    index += 1
                    if (showPercentOfParent) {
                      measureCells.push(
                        <Table.Summary.Cell key={`${key}-pct`} index={index} align="right">
                          {formatParentPercent(value, value)}
                        </Table.Summary.Cell>,
                      )
                      index += 1
                    }
                  }
                  addMeasureCell('onHandQty', fmtQty(t.onHandQty), t.onHandQty)
                  addMeasureCell('onHandCostVal', fmtMoney(t.onHandCostVal), t.onHandCostVal)
                  addMeasureCell('onHandSkuCount', fmtQty(totalOnHandSkuCount), totalOnHandSkuCount)
                  addMeasureCell('qtyTY', fmtQty(t.qtyTY), t.qtyTY)
                  addMeasureCell('netSalesTY', fmtMoney(t.netSalesTY), t.netSalesTY)
                  addMeasureCell('profitTY', fmtMoney(t.profitTY), t.profitTY)
                  addMeasureCell('qtyLY', fmtQty(t.qtyLY), t.qtyLY)
                  addMeasureCell('netSalesLY', fmtMoney(t.netSalesLY), t.netSalesLY)
                  addMeasureCell('profitLY', fmtMoney(t.profitLY), t.profitLY)
                  return (
                    <Table.Summary fixed>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}><strong>Totals</strong></Table.Summary.Cell>
                        {measureCells}
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
