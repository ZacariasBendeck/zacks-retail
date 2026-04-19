import { useState, useEffect, useRef } from 'react'
import {
  Alert, Breadcrumb, Card, Checkbox, Col, DatePicker, Empty, Radio, Row, Space, Table, Tag, Typography, Spin,
} from 'antd'
import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
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

const { RangePicker } = DatePicker
const { Title, Paragraph, Text } = Typography

function defaultRange(): [string, string] {
  // Last 7 days by default — fast first run. Users can widen to 30/60/90+ via
  // the picker; SKU_DETAIL over 90 days can return 10k+ rows, which renders
  // fine but is slow to initialize in the table.
  const end = dayjs()
  const start = end.subtract(6, 'day')
  return [start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
}

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

export default function SalesAnalysisPage() {
  const qc = useQueryClient()
  const [dimension, setDimension] = useState<SalesAnalysisDimension>('CATEGORY')
  const [reportType, setReportType] = useState<SalesAnalysisReportType>('SKU_DETAIL')
  const [storeOption, setStoreOption] = useState<SalesAnalysisStoreOption>('COMBINE')
  const [dateRange, setDateRange] = useState<[string, string]>(defaultRange)
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

  const { data: dims, isLoading: dimsLoading } = useSalesDimensions()
  const { data, isFetching, error } = useSalesAnalysis(query)
  const running = query != null && isFetching

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
    setQuery({
      dimension,
      reportType,
      storeOption,
      startDate: dateRange[0],
      endDate: dateRange[1],
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
      ? [{ title: 'Label', dataIndex: 'dimensionLabel', key: 'dimensionLabel', width: 200, render: (v: string | null) => v ?? '—' }]
      : []),
    {
      title: 'Store', dataIndex: 'storeNumber', key: 'storeNumber', width: 80,
      render: (v: number | null) => v ?? '(all)',
    },
    { title: 'Qty', dataIndex: 'qty', key: 'qty', width: 80, align: 'right' as const },
    {
      title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: 130,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
    },
    {
      title: 'COGS', dataIndex: 'cogs', key: 'cogs', width: 130,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
    },
    {
      title: 'Gross Profit', dataIndex: 'grossProfit', key: 'grossProfit', width: 130,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
    },
    {
      title: 'GP %', dataIndex: 'gpPct', key: 'gpPct', width: 90,
      align: 'right' as const,
      render: (v: number | null) =>
        v == null ? '—' : <Tag color={v >= 30 ? 'green' : v >= 10 ? 'gold' : 'red'}>{v.toFixed(1)}%</Tag>,
    },
    {
      title: 'Inv (Cost)', dataIndex: 'onHandAtCost', key: 'onHandAtCost', width: 130,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
    },
    {
      title: 'Turns', dataIndex: 'turns', key: 'turns', width: 80,
      align: 'right' as const,
      render: (v: number | null) => (v == null ? '—' : v.toFixed(1)),
    },
    {
      title: 'ROI', dataIndex: 'roiPct', key: 'roiPct', width: 90,
      align: 'right' as const,
      render: (v: number | null) =>
        v == null ? '—' : <Tag color={v >= 5 ? 'green' : v >= 2 ? 'gold' : 'red'}>{v.toFixed(1)}×</Tag>,
    },
    ...(query?.priorYear
      ? [
          {
            title: 'Prior Yr Net', dataIndex: 'priorYearNetSales', key: 'priorYearNetSales', width: 130,
            align: 'right' as const,
            render: (v: number | null) => (v == null ? '—' : v.toFixed(2)),
          },
          {
            title: 'PY % Δ', dataIndex: 'pyPctChange', key: 'pyPctChange', width: 90,
            align: 'right' as const,
            render: (v: number | null) =>
              v == null ? '—' : <Tag color={v >= 0 ? 'green' : 'red'}>{v.toFixed(1)}%</Tag>,
          },
        ]
      : []),
  ]

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Sales Analysis' },
        ]}
      />
      <Title level={2} style={{ marginBottom: 0 }}>Sales Analysis</Title>
      <Paragraph type="secondary">
        Multi-dimensional sales analysis (RICS Ch. 6 p. 88). Rows sorted by key ascending by default.
      </Paragraph>

      <Card style={{ marginBottom: 16 }}>
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
                <RangePicker
                  value={[dayjs(dateRange[0]), dayjs(dateRange[1])]}
                  onChange={(range) => {
                    if (range && range[0] && range[1]) {
                      setDateRange([range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')])
                    }
                  }}
                  style={{ width: '100%' }}
                />
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
        <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
          <RunReportControls running={running} hasRun={query != null} onRun={onRun} onStop={onStop} />
        </div>
      </Card>

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
        <Empty
          description="Pick your Analyze by + Type of Report, then click Run Report."
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: 40 }}
        />
      ) : running ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="Querying RICS databases…" />
        </div>
      ) : data && data.rows.length === 0 ? (
        <Empty
          description={`No sales found between ${query.startDate} and ${query.endDate} for the selected filters. Try a wider date range or remove some criteria.`}
          style={{ padding: 40 }}
        />
      ) : data ? (
        <>
        <Card size="small" style={{ marginBottom: 12, background: '#fafafa' }}>
          <Space split={<span style={{ color: '#d9d9d9' }}>|</span>} size="middle">
            <Text strong>
              {data.rows.length.toLocaleString()} {data.rows.length === 1 ? 'row' : 'rows'}
            </Text>
            <Text type="secondary">{query.startDate} → {query.endDate}</Text>
            <Text type="secondary">
              {query.reportType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
            </Text>
            <Text type="secondary">Net sales: {data.totals.netSales.toLocaleString('en-US')}</Text>
          </Space>
        </Card>
        <Table<SalesAnalysisRow>
          dataSource={data.rows}
          columns={columns}
          rowKey={(r) => `${r.dimensionKey}|${r.storeNumber ?? '*'}`}
          size="small"
          pagination={{ pageSize: 50 }}
          summary={() => {
            const t = data.totals
            const cells: Array<string | number | null | JSX.Element> = []
            cells.push('Totals')
            if (query.reportType === 'DEPT_SUMMARY') cells.push('')
            cells.push('') // Store
            cells.push(t.qty)
            cells.push(t.netSales.toFixed(2))
            cells.push(t.cogs.toFixed(2))
            cells.push(t.grossProfit.toFixed(2))
            cells.push(t.gpPct == null ? '—' : `${t.gpPct.toFixed(1)}%`)
            cells.push(t.onHandAtCost.toFixed(2))
            cells.push(t.turns == null ? '—' : t.turns.toFixed(1))
            cells.push(t.roiPct == null ? '—' : `${t.roiPct.toFixed(1)}×`)
            if (query.priorYear) {
              cells.push(t.priorYearNetSales == null ? '—' : t.priorYearNetSales.toFixed(2))
              cells.push('') // PY % Δ total omitted
            }
            return (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  {cells.map((c, i) => (
                    <Table.Summary.Cell key={i} index={i} align={i >= 2 ? 'right' : 'left'}>
                      {c as React.ReactNode}
                    </Table.Summary.Cell>
                  ))}
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
