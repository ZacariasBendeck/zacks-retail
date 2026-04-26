import { useState, useEffect, useRef } from 'react'
import {
  Alert, Card, Checkbox, Col, Radio, Row, Space, Table, Tag, Typography, Spin,
} from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSalesAnalysis, useSalesDimensions, type SalesAnalysisArgs } from '../../hooks/useReports'
import type {
  SalesAnalysisDimension,
  SalesAnalysisReportType,
  SalesAnalysisStoreOption,
  SalesAnalysisRow,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'
import CriteriaInput from './CriteriaInput'
import SaveAsTemplateButton from '../../components/reports/SaveAsTemplateButton'
import SaveSnapshotButton from '../../components/reports/SaveSnapshotButton'
import DateRangeControl from '../../components/reports/DateRangeControl'
import { briefDateSpec, readDateSpecFromParams, resolveDateSpec, type DateSpec } from '../../utils/dateSpec'
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

// Last 7 days by default — fast first run. Relative (trailing) so a template
// saved with the default replays a fresh 7-day window every time. Users can
// flip to "Fixed range" via DateRangeControl if they need pinned dates.
const DEFAULT_DATE_SPEC: DateSpec = { type: 'trailing_days', days: 7 }

// Mirrors the RICS Report Options panel. Ordered alphabetically within each group.
const ANALYZE_BY: { value: SalesAnalysisDimension; label: string }[] = [
  { value: 'CATEGORY', label: 'Category' },
  { value: 'GROUP', label: 'Group' },
  { value: 'SEASON', label: 'Season' },
  { value: 'VENDOR', label: 'Vendor' },
]

// SKU Detail sits at the top and is the default. Summary types follow
// alphabetically. `requiresMaster: true` means the server returns an error
// today because the RIINVMAS join isn't wired yet (Phase 2.5).
const REPORT_TYPES: { value: SalesAnalysisReportType; label: string; requiresMaster?: boolean }[] = [
  { value: 'SKU_DETAIL', label: 'SKU Detail' },
  { value: 'CATEGORY_SUMMARY', label: 'Category Summary' },
  { value: 'DEPT_SUMMARY', label: 'Department Summary' },
  { value: 'GROUP_SUMMARY', label: 'Group Summary', requiresMaster: true },
  { value: 'PRICE_POINT_SUMMARY', label: 'Price Point Summary' },
  { value: 'SEASON_SUMMARY', label: 'Season Summary', requiresMaster: true },
  { value: 'SECTOR_SUMMARY', label: 'Sector Summary', requiresMaster: true },
  { value: 'STYLE_COLOR_SUMMARY', label: 'Style/Color Summary', requiresMaster: true },
  { value: 'VENDOR_SUMMARY', label: 'Vendor Summary' },
]

const STORE_OPTIONS: { value: SalesAnalysisStoreOption; label: string }[] = [
  { value: 'SEPARATE', label: 'Separate Stores' },
  { value: 'COMPARE', label: 'Compare Stores' },
  { value: 'COMBINE', label: 'Combine Stores' },
]

const REPORT_TYPE_LABELS = Object.fromEntries(REPORT_TYPES.map((o) => [o.value, o.label])) as Record<SalesAnalysisReportType, string>
const DIMENSION_LABELS = Object.fromEntries(ANALYZE_BY.map((o) => [o.value, o.label])) as Record<SalesAnalysisDimension, string>
// Strip the trailing " Stores" so chips read "Combine" not "Combine Stores" —
// context is already clear from the chip's "Stores:" label.
const STORE_OPTION_LABELS = Object.fromEntries(
  STORE_OPTIONS.map((o) => [o.value, o.label.replace(/ Stores$/, '')]),
) as Record<SalesAnalysisStoreOption, string>

export default function SalesAnalysisPage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') ?? undefined

  const [dimension, setDimension] = useState<SalesAnalysisDimension>('CATEGORY')
  const [reportType, setReportType] = useState<SalesAnalysisReportType>('SKU_DETAIL')
  const [storeOption, setStoreOption] = useState<SalesAnalysisStoreOption>('COMBINE')
  const [dateSpec, setDateSpec] = useState<DateSpec>(DEFAULT_DATE_SPEC)
  // Criteria state — arrays for the multi-selects, strings for RICS grammar.
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
  const [query, setQuery] = useState<SalesAnalysisArgs | null>(null)
  // Auto-collapses after a successful report run so results get the
  // vertical real-estate instead of the tall filter form. Operators expand
  // again via the "Modify filters" button.
  const [filterOpen, setFilterOpen] = useState(true)

  const { data: dims, isLoading: dimsLoading } = useSalesDimensions()
  const { data, isFetching, error } = useSalesAnalysis(query)
  const running = query != null && isFetching

  useEffect(() => {
    if (query && data && !isFetching) setFilterOpen(false)
  }, [query, data, isFetching])

  // ?templateId=... replay. Fetch the template, hydrate form state, fire the
  // query with the loaded params, and bump lastUsedAt. Runs exactly once per
  // template id via the hydratedFor ref.
  const { data: templateData } = useReportTemplate(templateId)
  const touchTemplate = useTouchReportTemplate()
  const hydratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!templateId || !templateData) return
    if (hydratedFor.current === templateId) return
    const t = templateData.template
    if (t.reportType !== 'sales-analysis') {
      // Different report's template — don't hydrate; user should navigate to
      // the correct page. The templates list page routes correctly, so this
      // only trips on hand-edited URLs.
      return
    }
    hydratedFor.current = templateId
    const p = t.paramsJson as Partial<SalesAnalysisArgs> & { startDate?: string; endDate?: string }
    // New templates save a dateSpec; legacy ones only have startDate/endDate.
    // readDateSpecFromParams handles both — returns null when neither is usable,
    // so we fall back to the page default in that case.
    const spec = readDateSpecFromParams(t.paramsJson) ?? DEFAULT_DATE_SPEC
    const { startDate: resolvedStart, endDate: resolvedEnd } = resolveDateSpec(spec)
    if (p.dimension) setDimension(p.dimension)
    if (p.reportType) setReportType(p.reportType)
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
    // Use the full hydrated params as the query directly — don't rely on the
    // state setters above having flushed before this setQuery call.
    setQuery({
      dimension: p.dimension ?? 'CATEGORY',
      reportType: p.reportType ?? 'SKU_DETAIL',
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

  // The report renders below the (tall) form card. Scroll to it whenever a
  // run starts so the user sees the spinner → results transition without
  // having to scroll manually.
  const resultRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (query && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [query])

  function onRun(): void {
    const { startDate, endDate } = resolveDateSpec(dateSpec)
    setQuery({
      dimension,
      reportType,
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
    qc.cancelQueries({ queryKey: ['sales-analysis', query] })
  }

  const isSkuDetail = query?.reportType === 'SKU_DETAIL'
  const keyColumnTitle = !query
    ? 'Key'
    : isSkuDetail
    ? 'SKU'
    : query.reportType === 'CATEGORY_SUMMARY'
    ? 'Category'
    : query.reportType === 'DEPT_SUMMARY'
    ? 'Department'
    : query.reportType === 'VENDOR_SUMMARY'
    ? 'Vendor'
    : query.reportType === 'PRICE_POINT_SUMMARY'
    ? 'Price Point'
    : 'Key'

  const columns = [
    { title: keyColumnTitle, dataIndex: 'dimensionKey', key: 'dimensionKey', width: 160 },
    ...(query?.reportType === 'DEPT_SUMMARY'
      ? [{ title: 'Label', dataIndex: 'dimensionLabel', key: 'dimensionLabel', width: 200, render: (v: string | null) => v ?? DASH }]
      : []),
    {
      title: 'Store', dataIndex: 'storeNumber', key: 'storeNumber', width: 80,
      render: (v: number | null) => v ?? '(all)',
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
      // ROI thresholds differ from GP% (5× / 2×) — custom inline Tag stays
      // because the shared badge maps to GP-style percent thresholds.
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

  return (
    <div>
      <ReportHeader
        title="Sales Analysis"
        description="Multi-dimensional sales analysis. Rows sorted by key ascending by default."
        citation="RICS Ch. 6 p. 88"
        breadcrumb={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Sales Analysis' },
        ]}
        rightMeta={data ? `${data.rows.length.toLocaleString()} ${data.rows.length === 1 ? 'row' : 'rows'}` : undefined}
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
              reportType="sales-analysis"
              disabled={query == null}
              getParamsJson={() => ({
                dimension,
                reportType,
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
              reportType="sales-analysis"
              disabled={query == null || !data}
              sourceTemplateId={templateId}
              getParamsJson={() => ({
                dimension,
                reportType,
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
              getDescriptor={() => {
                const parts: string[] = [
                  REPORT_TYPE_LABELS[reportType],
                  `by ${DIMENSION_LABELS[dimension]}`,
                  STORE_OPTION_LABELS[storeOption],
                ]
                const counts: string[] = []
                if (selectedStores.length) counts.push(`stores ${selectedStores.length}`)
                if (selectedCategories.length) counts.push(`cats ${selectedCategories.length}`)
                if (selectedGroups.length) counts.push(`groups ${selectedGroups.length}`)
                if (vendorsRaw.trim()) counts.push('vendors')
                if (seasonsRaw.trim()) counts.push('seasons')
                if (styleColorRaw.trim()) counts.push('style/color')
                if (skusRaw.trim()) counts.push('skus')
                if (keywordsRaw.trim()) counts.push('keywords')
                if (counts.length) parts.push(counts.join(', '))
                parts.push(briefDateSpec(dateSpec))
                if (priorYear) parts.push('vs PY')
                return parts.join(' · ')
              }}
            />
          </>
        }
      >
        <Row gutter={24}>
          <Col xs={24} md={6}>
            <Card size="small" title={<Text strong>Analyze by</Text>} style={{ marginBottom: 16 }}>
              <Radio.Group
                value={dimension}
                onChange={(e) => setDimension(e.target.value)}
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                {ANALYZE_BY.map((o) => (
                  <Radio key={o.value} value={o.value}>
                    {o.label}
                  </Radio>
                ))}
              </Radio.Group>
            </Card>
            <Card size="small" title={<Text strong>Store Options</Text>}>
              <Radio.Group
                value={storeOption}
                onChange={(e) => setStoreOption(e.target.value)}
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                {STORE_OPTIONS.map((o) => (
                  <Radio key={o.value} value={o.value}>
                    {o.label}
                  </Radio>
                ))}
              </Radio.Group>
            </Card>
          </Col>
          <Col xs={24} md={10}>
            <Card size="small" title={<Text strong>Type of Report</Text>}>
              <Radio.Group
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                {REPORT_TYPES.map((o) => (
                  <Radio key={o.value} value={o.value} disabled={o.requiresMaster}>
                    {o.label}
                    {o.requiresMaster && (
                      <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                        (needs RIINVMAS join — coming soon)
                      </Text>
                    )}
                  </Radio>
                ))}
              </Radio.Group>
            </Card>
          </Col>
          <Col xs={24} md={8}>
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
          message="Pick your Analyze by + Type of Report, then click Run Report."
        />
      ) : running ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="Querying RICS databases…" />
        </div>
      ) : data && data.rows.length === 0 ? (
        <ReportEmptyState
          reason="no-results"
          hint={`No sales between ${query.startDate} and ${query.endDate} for the selected filters. Try a wider date range or remove some criteria.`}
        />
      ) : data ? (
        <>
        <FilterChips
          chips={[
            { label: 'Report', value: REPORT_TYPE_LABELS[query.reportType] },
            { label: 'Analyze', value: DIMENSION_LABELS[query.dimension] },
            query.storeOption ? { label: 'Stores', value: STORE_OPTION_LABELS[query.storeOption] } : null,
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
        <Table<SalesAnalysisRow>
          dataSource={data.rows}
          columns={columns}
          rowKey={(r) => `${r.dimensionKey}|${r.storeNumber ?? '*'}`}
          size="small"
          pagination={{ pageSize: 50 }}
          summary={() => {
            const t = data.totals
            const deptCol = query.reportType === 'DEPT_SUMMARY' ? 1 : 0
            // Left-most cell spans the key (+ label for DEPT_SUMMARY) + store;
            // numeric cells follow.
            const labelSpan = 2 + deptCol
            return (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <SummaryLabelCell index={0} colSpan={labelSpan} variant="grand">
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
                  {query.priorYear ? (
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

