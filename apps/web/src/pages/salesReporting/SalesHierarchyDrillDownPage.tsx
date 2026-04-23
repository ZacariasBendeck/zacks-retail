import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Alert, Card, Checkbox, Col, Radio, Row, Space, Table, Tag, Typography, Spin,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSalesHierarchy, useSalesDimensions, type SalesHierarchyArgs } from '../../hooks/useReports'
import type {
  SalesHierarchyNode,
  SalesHierarchyStoreOption,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'
import CriteriaInput from './CriteriaInput'
import SaveAsTemplateButton from '../../components/reports/SaveAsTemplateButton'
import SaveSnapshotButton from '../../components/reports/SaveSnapshotButton'
import DateRangeControl from '../../components/reports/DateRangeControl'
import { readDateSpecFromParams, resolveDateSpec, type DateSpec } from '../../utils/dateSpec'
import ReportHeader from '../../components/reports/ReportHeader'
import FilterChips, { type FilterChip } from '../../components/reports/FilterChips'
import ReportEmptyState from '../../components/reports/ReportEmptyState'
import CollapsibleFilterCard from '../../components/reports/CollapsibleFilterCard'
import { SummaryLabelCell, SummaryNumericCell } from '../../components/reports/SummaryRow'
import { GpBadge, ChangePctBadge } from '../../components/reports/gpBadge'
import {
  fmtMoney, fmtQty, fmtPct1, fmtPctBare1, DASH,
} from '../../utils/reportFormatters'
import { useReportTemplate, useTouchReportTemplate } from '../../hooks/useReportTemplates'

const { Text } = Typography

const DEFAULT_DATE_SPEC: DateSpec = { type: 'trailing_days', days: 7 }

const STORE_OPTIONS: { value: SalesHierarchyStoreOption; label: string }[] = [
  { value: 'SEPARATE', label: 'Separate Stores' },
  { value: 'COMBINE', label: 'Combine Stores' },
]
const STORE_OPTION_LABELS = Object.fromEntries(
  STORE_OPTIONS.map((o) => [o.value, o.label.replace(/ Stores$/, '')]),
) as Record<SalesHierarchyStoreOption, string>

interface TreeRow extends SalesHierarchyNode {
  rowKey: string
  children?: TreeRow[]
}

// Walk the server tree and assign a globally-unique rowKey. `level` alone
// isn't unique (a SKU could repeat across departments via reclassification
// over time), so we concatenate the ancestor keys.
function annotateKeys(nodes: SalesHierarchyNode[] | undefined, prefix = ''): TreeRow[] | undefined {
  if (!nodes || nodes.length === 0) return undefined
  return nodes.map((n) => {
    const rowKey = `${prefix}${n.level}:${n.key}`
    return {
      ...n,
      rowKey,
      children: annotateKeys(n.children, `${rowKey}|`),
    }
  })
}

function countSkuRows(nodes: SalesHierarchyNode[]): number {
  let n = 0
  for (const node of nodes) {
    if (node.level === 'sku') n += 1
    if (node.children) n += countSkuRows(node.children)
  }
  return n
}

export default function SalesHierarchyDrillDownPage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') ?? undefined

  const [storeOption, setStoreOption] = useState<SalesHierarchyStoreOption>('COMBINE')
  const [dateSpec, setDateSpec] = useState<DateSpec>(DEFAULT_DATE_SPEC)
  const [selectedStores, setSelectedStores] = useState<number[]>([])
  const [selectedCategories, setSelectedCategories] = useState<number[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [storesRaw, setStoresRaw] = useState('')
  const [categoriesRaw, setCategoriesRaw] = useState('')
  const [vendorsRaw, setVendorsRaw] = useState('')
  const [seasonsRaw, setSeasonsRaw] = useState('')
  const [styleColorRaw, setStyleColorRaw] = useState('')
  const [skusRaw, setSkusRaw] = useState('')
  const [groupsRaw, setGroupsRaw] = useState('')
  const [keywordsRaw, setKeywordsRaw] = useState('')
  const [priorYear, setPriorYear] = useState(false)
  const [query, setQuery] = useState<SalesHierarchyArgs | null>(null)
  const [filterOpen, setFilterOpen] = useState(true)

  const { data: dims, isLoading: dimsLoading } = useSalesDimensions()
  const { data, isFetching, error } = useSalesHierarchy(query)
  const running = query != null && isFetching

  useEffect(() => {
    if (query && data && !isFetching) setFilterOpen(false)
  }, [query, data, isFetching])

  // ?templateId=... replay. Same pattern Sales Analysis uses: fetch the
  // template, hydrate form state, fire the query with the loaded params,
  // and bump lastUsedAt. Runs exactly once per template id via the
  // hydratedFor ref so re-renders don't re-apply.
  const { data: templateData } = useReportTemplate(templateId)
  const touchTemplate = useTouchReportTemplate()
  const hydratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!templateId || !templateData) return
    if (hydratedFor.current === templateId) return
    const t = templateData.template
    if (t.reportType !== 'sales-hierarchy-drill-down') return
    hydratedFor.current = templateId
    const p = t.paramsJson as Partial<SalesHierarchyArgs> & { startDate?: string; endDate?: string }
    const spec = readDateSpecFromParams(t.paramsJson) ?? DEFAULT_DATE_SPEC
    const { startDate: resolvedStart, endDate: resolvedEnd } = resolveDateSpec(spec)
    if (p.storeOption) setStoreOption(p.storeOption)
    setDateSpec(spec)
    setSelectedStores(Array.isArray(p.stores) ? p.stores : [])
    setSelectedCategories(Array.isArray(p.categories) ? p.categories : [])
    setSelectedGroups(Array.isArray(p.groups) ? p.groups : [])
    setStoresRaw(p.storesRaw ?? '')
    setCategoriesRaw(p.categoriesRaw ?? '')
    setVendorsRaw(p.vendorsRaw ?? '')
    setSeasonsRaw(p.seasonsRaw ?? '')
    setStyleColorRaw(p.styleColorRaw ?? '')
    setSkusRaw(p.skusRaw ?? '')
    setGroupsRaw(p.groupsRaw ?? '')
    setKeywordsRaw(p.keywordsRaw ?? '')
    setPriorYear(!!p.priorYear)
    setQuery({
      storeOption: p.storeOption ?? 'COMBINE',
      startDate: resolvedStart,
      endDate: resolvedEnd,
      stores: Array.isArray(p.stores) && p.stores.length ? p.stores : undefined,
      categories: Array.isArray(p.categories) && p.categories.length ? p.categories : undefined,
      groups: Array.isArray(p.groups) && p.groups.length ? p.groups : undefined,
      storesRaw: p.storesRaw?.trim() || undefined,
      categoriesRaw: p.categoriesRaw?.trim() || undefined,
      vendorsRaw: p.vendorsRaw?.trim() || undefined,
      seasonsRaw: p.seasonsRaw?.trim() || undefined,
      styleColorRaw: p.styleColorRaw?.trim() || undefined,
      skusRaw: p.skusRaw?.trim() || undefined,
      groupsRaw: p.groupsRaw?.trim() || undefined,
      keywordsRaw: p.keywordsRaw?.trim() || undefined,
      priorYear: !!p.priorYear,
    })
    touchTemplate.mutate(templateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templateData])

  const resultRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (query && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [query])

  function onRun(): void {
    const { startDate, endDate } = resolveDateSpec(dateSpec)
    setQuery({
      storeOption,
      startDate,
      endDate,
      stores: selectedStores.length ? selectedStores : undefined,
      categories: selectedCategories.length ? selectedCategories : undefined,
      groups: selectedGroups.length ? selectedGroups : undefined,
      storesRaw: storesRaw.trim() || undefined,
      categoriesRaw: categoriesRaw.trim() || undefined,
      vendorsRaw: vendorsRaw.trim() || undefined,
      seasonsRaw: seasonsRaw.trim() || undefined,
      styleColorRaw: styleColorRaw.trim() || undefined,
      skusRaw: skusRaw.trim() || undefined,
      groupsRaw: groupsRaw.trim() || undefined,
      keywordsRaw: keywordsRaw.trim() || undefined,
      priorYear,
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['sales-hierarchy', query] })
  }

  const treeRows = useMemo(
    () => (data?.roots ? annotateKeys(data.roots) : undefined) ?? [],
    [data],
  )

  // Row background tint per level — gives the grid visual anchors when a
  // department is expanded. Subtle so SKU rows stay readable.
  function rowClassName(r: TreeRow): string {
    if (r.level === 'store') return 'hierarchy-row-store'
    if (r.level === 'department') return 'hierarchy-row-department'
    if (r.level === 'category') return 'hierarchy-row-category'
    return ''
  }

  const columns: ColumnsType<TreeRow> = [
    {
      title: 'Row',
      dataIndex: 'label',
      key: 'label',
      width: 380,
      render: (_value: string, r: TreeRow) => {
        const weight = r.level === 'department' || r.level === 'store' ? 600 : r.level === 'category' ? 500 : 400
        return <span style={{ fontWeight: weight }}>{r.label}</span>
      },
    },
    {
      title: 'Qty', dataIndex: 'qty', key: 'qty', width: 80, align: 'right' as const,
      render: (v: number) => fmtQty(v),
    },
    {
      title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: 130,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
    },
    {
      title: 'COGS', dataIndex: 'cogs', key: 'cogs', width: 130,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
    },
    {
      title: 'Gross Profit', dataIndex: 'grossProfit', key: 'grossProfit', width: 130,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
    },
    {
      title: 'GP %', dataIndex: 'gpPct', key: 'gpPct', width: 90,
      align: 'right' as const,
      render: (v: number | null) => <GpBadge value={v} />,
    },
    {
      title: 'Inv (Cost)', dataIndex: 'onHandAtCost', key: 'onHandAtCost', width: 130,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
    },
    {
      title: 'Turns', dataIndex: 'turns', key: 'turns', width: 80,
      align: 'right' as const,
      render: (v: number | null) => fmtPctBare1(v),
    },
    {
      title: 'ROI', dataIndex: 'roiPct', key: 'roiPct', width: 90,
      align: 'right' as const,
      render: (v: number | null) =>
        v == null ? DASH : <Tag color={v >= 5 ? 'green' : v >= 2 ? 'gold' : 'red'}>{fmtPctBare1(v)}×</Tag>,
    },
    ...(query?.priorYear
      ? [
          {
            title: 'Prior Yr Net', dataIndex: 'priorYearNetSales', key: 'priorYearNetSales', width: 130,
            align: 'right' as const,
            render: (v: number | null) => fmtMoney(v),
          },
          {
            title: 'PY % Δ', dataIndex: 'pyPctChange', key: 'pyPctChange', width: 90,
            align: 'right' as const,
            render: (v: number | null) => <ChangePctBadge value={v} />,
          },
        ]
      : []),
  ]

  const skuCount = data ? countSkuRows(data.roots) : 0

  return (
    <div>
      <style>{`
        .hierarchy-row-store > td { background: #f0f5ff !important; }
        .hierarchy-row-department > td { background: #fafafa !important; }
        .hierarchy-row-category > td { background: #fdfdfd !important; }
      `}</style>
      <ReportHeader
        title="Sales Hierarchy Drill-Down"
        description="Department → Category → SKU tree. Departments are collapsed by default; click to drill down. Same filter surface as Sales Analysis."
        citation="App-native (extends RICS Ch. 6 p. 88)"
        breadcrumb={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Hierarchy Drill-Down' },
        ]}
        rightMeta={data
          ? `${data.roots.length.toLocaleString()} ${storeOption === 'SEPARATE' ? 'stores' : 'depts'} · ${skuCount.toLocaleString()} SKUs`
          : undefined}
      />

      <CollapsibleFilterCard
        open={filterOpen}
        onOpenChange={setFilterOpen}
        running={running}
        onRun={onRun}
        actions={
          <RunReportControls running={running} hasRun={query != null} onRun={onRun} onStop={onStop} />
        }
        persistentActions={
          <>
            <SaveAsTemplateButton
              reportType="sales-hierarchy-drill-down"
              disabled={query == null}
              getParamsJson={() => ({
                storeOption,
                dateSpec,
                stores: selectedStores.length ? selectedStores : undefined,
                categories: selectedCategories.length ? selectedCategories : undefined,
                groups: selectedGroups.length ? selectedGroups : undefined,
                storesRaw: storesRaw.trim() || undefined,
                categoriesRaw: categoriesRaw.trim() || undefined,
                vendorsRaw: vendorsRaw.trim() || undefined,
                seasonsRaw: seasonsRaw.trim() || undefined,
                styleColorRaw: styleColorRaw.trim() || undefined,
                skusRaw: skusRaw.trim() || undefined,
                groupsRaw: groupsRaw.trim() || undefined,
                keywordsRaw: keywordsRaw.trim() || undefined,
                priorYear,
              })}
            />
            <SaveSnapshotButton
              reportType="sales-hierarchy-drill-down"
              disabled={query == null || !data}
              sourceTemplateId={templateId}
              getParamsJson={() => ({
                storeOption,
                dateSpec,
                stores: selectedStores.length ? selectedStores : undefined,
                categories: selectedCategories.length ? selectedCategories : undefined,
                groups: selectedGroups.length ? selectedGroups : undefined,
                storesRaw: storesRaw.trim() || undefined,
                categoriesRaw: categoriesRaw.trim() || undefined,
                vendorsRaw: vendorsRaw.trim() || undefined,
                seasonsRaw: seasonsRaw.trim() || undefined,
                styleColorRaw: styleColorRaw.trim() || undefined,
                skusRaw: skusRaw.trim() || undefined,
                groupsRaw: groupsRaw.trim() || undefined,
                keywordsRaw: keywordsRaw.trim() || undefined,
                priorYear,
              })}
              getResultJson={() => data}
            />
          </>
        }
      >
        <Row gutter={24}>
          <Col xs={24} md={8}>
            <Card size="small" title={<Text strong>Store Options</Text>}>
              <Radio.Group
                value={storeOption}
                onChange={(e) => setStoreOption(e.target.value)}
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                {STORE_OPTIONS.map((o) => (
                  <Radio key={o.value} value={o.value}>{o.label}</Radio>
                ))}
              </Radio.Group>
              <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                Separate: one tree per store. Combine: one tree aggregated across stores.
              </Text>
            </Card>
          </Col>
          <Col xs={24} md={16}>
            <Card size="small" title={<Text strong>Period</Text>}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <DateRangeControl value={dateSpec} onChange={setDateSpec} />
                <Checkbox checked={priorYear} onChange={(e) => setPriorYear(e.target.checked)}>
                  Compare to prior year
                </Checkbox>
              </Space>
            </Card>
          </Col>
        </Row>
        <Card size="small" title={<Text strong>Criteria</Text>} style={{ marginTop: 16 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Leave a row blank to include everything. Type ranges like <code>556-599</code>,
            exclusions <code>&lt;&gt;575</code>, or wildcards <code>KISS*BK</code> in the
            grammar box under each dropdown.
          </Text>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <CriteriaInput
              label="Stores"
              mode="numeric"
              loading={dimsLoading}
              options={(dims?.stores ?? []).map((s) => ({
                value: s.number,
                label: s.name ? `${s.number} — ${s.name}` : String(s.number),
              }))}
              selected={selectedStores}
              onSelectedChange={setSelectedStores}
              rawText={storesRaw}
              onRawTextChange={setStoresRaw}
            />
            <CriteriaInput
              label="Categories"
              mode="numeric"
              loading={dimsLoading}
              options={(dims?.categories ?? []).map((c) => ({
                value: c.number,
                label: c.desc ? `${c.number} — ${c.desc}` : String(c.number),
              }))}
              selected={selectedCategories}
              onSelectedChange={setSelectedCategories}
              rawText={categoriesRaw}
              onRawTextChange={setCategoriesRaw}
            />
            <CriteriaInput
              label="Vendors"
              mode="string"
              options={[]}
              selected={[]}
              onSelectedChange={() => {}}
              rawText={vendorsRaw}
              onRawTextChange={setVendorsRaw}
              hideDropdown
              helpText="e.g. WEYC, VEND, <>NIKE"
            />
            <CriteriaInput
              label="Seasons"
              mode="string"
              options={[]}
              selected={[]}
              onSelectedChange={() => {}}
              rawText={seasonsRaw}
              onRawTextChange={setSeasonsRaw}
              hideDropdown
              helpText="e.g. A, B, <>C"
            />
            <CriteriaInput
              label="Style/Colors"
              mode="string"
              options={[]}
              selected={[]}
              onSelectedChange={() => {}}
              rawText={styleColorRaw}
              onRawTextChange={setStyleColorRaw}
              hideDropdown
              helpText="Wildcard pattern, e.g. KISS*BK or *FORMAL*  (requires master join — coming soon)"
            />
            <CriteriaInput
              label="SKUs"
              mode="string"
              options={[]}
              selected={[]}
              onSelectedChange={() => {}}
              rawText={skusRaw}
              onRawTextChange={setSkusRaw}
              hideDropdown
              helpText="e.g. TRLR7812-39-BK, 2A703GDGY, <>SKU001"
            />
            <CriteriaInput
              label="Groups"
              mode="string"
              loading={dimsLoading}
              options={(dims?.groups ?? []).map((g) => ({
                value: g.code,
                label: g.desc ? `${g.code} — ${g.desc}` : g.code,
              }))}
              selected={selectedGroups}
              onSelectedChange={setSelectedGroups}
              rawText={groupsRaw}
              onRawTextChange={setGroupsRaw}
              helpText="Dropdown or grammar. (Grammar requires master join — coming soon.)"
            />
            <CriteriaInput
              label="Keywords"
              mode="string"
              options={[]}
              selected={[]}
              onSelectedChange={() => {}}
              rawText={keywordsRaw}
              onRawTextChange={setKeywordsRaw}
              hideDropdown
              helpText="Wildcard patterns, comma separated. e.g. 01AG25, *SUMMER*  (requires master join — coming soon)"
            />
          </Space>
        </Card>
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
          message="Pick your period and store option, then click Run Report."
        />
      ) : running ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="Querying RICS databases…" />
        </div>
      ) : data && data.roots.length === 0 ? (
        <ReportEmptyState
          reason="no-results"
          hint={`No sales between ${query.startDate} and ${query.endDate} for the selected filters. Try a wider date range or remove some criteria.`}
        />
      ) : data ? (
        <>
        <FilterChips
          chips={[
            { label: 'Store', value: STORE_OPTION_LABELS[query.storeOption ?? 'COMBINE'] },
            query.startDate && query.endDate ? { label: 'Period', value: `${query.startDate} → ${query.endDate}` } : null,
            query.priorYear ? { label: 'Compare', value: 'Prior year' } : null,
            query.stores?.length ? { label: 'Stores in', value: `${query.stores.length} selected` } : null,
            query.categories?.length ? { label: 'Categories in', value: `${query.categories.length} selected` } : null,
            query.groups?.length ? { label: 'Groups in', value: `${query.groups.length} selected` } : null,
            chipFromRaw('Stores', query.storesRaw),
            chipFromRaw('Categories', query.categoriesRaw),
            chipFromRaw('Vendors', query.vendorsRaw),
            chipFromRaw('Seasons', query.seasonsRaw),
            chipFromRaw('Style/Color', query.styleColorRaw),
            chipFromRaw('SKUs', query.skusRaw),
            chipFromRaw('Groups', query.groupsRaw),
            chipFromRaw('Keywords', query.keywordsRaw),
          ]}
        />
        <Table<TreeRow>
          dataSource={treeRows}
          columns={columns}
          rowKey="rowKey"
          size="small"
          pagination={false}
          rowClassName={rowClassName}
          expandable={{
            // Departments (and stores under SEPARATE) start collapsed; the
            // operator drills by clicking. Category rows start collapsed too —
            // a department could own dozens of categories each with hundreds
            // of SKUs, so don't flood the viewport on expand.
            defaultExpandAllRows: false,
            indentSize: 20,
          }}
          summary={() => {
            const t = data.totals
            const priorYearCols = query.priorYear ? 2 : 0
            return (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <SummaryLabelCell index={0} colSpan={1} variant="grand">
                    Totals
                  </SummaryLabelCell>
                  <SummaryNumericCell index={1} variant="grand">{fmtQty(t.qty)}</SummaryNumericCell>
                  <SummaryNumericCell index={2} variant="grand">{fmtMoney(t.netSales)}</SummaryNumericCell>
                  <SummaryNumericCell index={3} variant="grand">{fmtMoney(t.cogs)}</SummaryNumericCell>
                  <SummaryNumericCell index={4} variant="grand">{fmtMoney(t.grossProfit)}</SummaryNumericCell>
                  <SummaryNumericCell index={5} variant="grand">{fmtPct1(t.gpPct)}</SummaryNumericCell>
                  <SummaryNumericCell index={6} variant="grand">{fmtMoney(t.onHandAtCost)}</SummaryNumericCell>
                  <SummaryNumericCell index={7} variant="grand">{fmtPctBare1(t.turns)}</SummaryNumericCell>
                  <SummaryNumericCell index={8} variant="grand">
                    {t.roiPct == null ? DASH : `${fmtPctBare1(t.roiPct)}×`}
                  </SummaryNumericCell>
                  {priorYearCols > 0 ? (
                    <>
                      <SummaryNumericCell index={9} variant="grand">{fmtMoney(t.priorYearNetSales)}</SummaryNumericCell>
                      <SummaryNumericCell index={10} variant="grand">{DASH}</SummaryNumericCell>
                    </>
                  ) : null}
                </Table.Summary.Row>
              </Table.Summary>
            )
          }}
        />
        </>
      ) : null}
      </div>
    </div>
  )
}

function chipFromRaw(label: string, raw: string | undefined): FilterChip | null {
  const t = raw?.trim()
  if (!t) return null
  return { label, value: t.length > 40 ? `${t.slice(0, 37)}…` : t, hint: t }
}
