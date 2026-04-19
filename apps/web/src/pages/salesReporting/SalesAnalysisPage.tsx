import { useState, useEffect, useRef } from 'react'
import {
  Alert, Breadcrumb, Card, Checkbox, Col, DatePicker, Empty, Input, Radio, Row, Select, Space, Table, Tag, Typography, Spin,
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

const { RangePicker } = DatePicker
const { Title, Paragraph, Text } = Typography

function parseStrs(s: string): string[] | undefined {
  const arr = s.split(',').map((x) => x.trim()).filter(Boolean)
  return arr.length ? arr : undefined
}

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

/** One criteria row — fixed-width label on the left, control on the right. */
function CriteriaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Row gutter={12} align="middle" wrap={false}>
      <Col flex="140px" style={{ textAlign: 'right' }}>
        <Text strong>{label}</Text>
      </Col>
      <Col flex="auto">{children}</Col>
    </Row>
  )
}

export default function SalesAnalysisPage() {
  const qc = useQueryClient()
  const [dimension, setDimension] = useState<SalesAnalysisDimension>('CATEGORY')
  const [reportType, setReportType] = useState<SalesAnalysisReportType>('SKU_DETAIL')
  const [storeOption, setStoreOption] = useState<SalesAnalysisStoreOption>('COMBINE')
  const [dateRange, setDateRange] = useState<[string, string]>(defaultRange)
  // Criteria state — arrays for the multi-selects, strings for wildcard text.
  const [selectedStores, setSelectedStores] = useState<number[]>([])
  const [selectedCategories, setSelectedCategories] = useState<number[]>([])
  const [vendorsText, setVendorsText] = useState('')
  const [seasonsText, setSeasonsText] = useState('')
  const [styleColorPattern, setStyleColorPattern] = useState('')
  const [skusText, setSkusText] = useState('')
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [keywordsText, setKeywordsText] = useState('')
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
      vendors: parseStrs(vendorsText),
      seasons: parseStrs(seasonsText),
      styleColor: styleColorPattern.trim() || undefined,
      skus: parseStrs(skusText),
      groups: selectedGroups.length ? selectedGroups : undefined,
      keywords: parseStrs(keywordsText),
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
    { title: keyColumnTitle, dataIndex: 'dimensionKey', key: 'dimensionKey', width: 180 },
    ...(query?.reportType === 'DEPT_SUMMARY'
      ? [{ title: 'Label', dataIndex: 'dimensionLabel', key: 'dimensionLabel', width: 200, render: (v: string | null) => v ?? '—' }]
      : []),
    {
      title: 'Store', dataIndex: 'storeNumber', key: 'storeNumber', width: 80,
      render: (v: number | null) => v ?? '(all)',
    },
    { title: 'Qty', dataIndex: 'qty', key: 'qty', width: 90, align: 'right' as const },
    {
      title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: 140,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
    },
    {
      title: 'COGS', dataIndex: 'cogs', key: 'cogs', width: 140,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
    },
    {
      title: 'Gross Profit', dataIndex: 'grossProfit', key: 'grossProfit', width: 140,
      align: 'right' as const, render: (v: number) => v.toFixed(2),
    },
    {
      title: 'GP %', dataIndex: 'gpPct', key: 'gpPct', width: 100,
      align: 'right' as const,
      render: (v: number | null) =>
        v == null ? '—' : <Tag color={v >= 30 ? 'green' : v >= 10 ? 'gold' : 'red'}>{v.toFixed(1)}%</Tag>,
    },
    ...(query?.priorYear
      ? [
          {
            title: 'Prior Yr Net', dataIndex: 'priorYearNetSales', key: 'priorYearNetSales', width: 140,
            align: 'right' as const,
            render: (v: number | null) => (v == null ? '—' : v.toFixed(2)),
          },
          {
            title: 'PY % Δ', dataIndex: 'pyPctChange', key: 'pyPctChange', width: 100,
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
        Multi-dimensional sales analysis (RICS Ch. 6 p. 88). Rows sorted alphabetically by default.
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
            Leave a row blank to include everything. Style/Colors and Keywords accept
            wildcards — <code>*</code> matches any sequence of characters,{' '}
            <code>?</code> matches a single character (e.g. <code>KISS*BK</code>,{' '}
            <code>*FORMAL*</code>).
          </Text>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <CriteriaRow label="Stores">
              <Select
                mode="multiple"
                allowClear
                loading={dimsLoading}
                value={selectedStores}
                onChange={setSelectedStores}
                placeholder="All stores"
                optionFilterProp="label"
                style={{ width: '100%' }}
                options={(dims?.stores ?? []).map((s) => ({
                  value: s.number,
                  label: s.name ? `${s.number} — ${s.name}` : String(s.number),
                }))}
              />
            </CriteriaRow>
            <CriteriaRow label="Categories">
              <Select
                mode="multiple"
                allowClear
                loading={dimsLoading}
                value={selectedCategories}
                onChange={setSelectedCategories}
                placeholder="All categories"
                optionFilterProp="label"
                style={{ width: '100%' }}
                options={(dims?.categories ?? []).map((c) => ({
                  value: c.number,
                  label: c.desc ? `${c.number} — ${c.desc}` : String(c.number),
                }))}
              />
            </CriteriaRow>
            <CriteriaRow label="Vendors">
              <Input
                placeholder="e.g. WEYC, VEND (comma separated)"
                value={vendorsText}
                onChange={(e) => setVendorsText(e.target.value)}
              />
            </CriteriaRow>
            <CriteriaRow label="Seasons">
              <Input
                placeholder="e.g. A, B (comma separated)"
                value={seasonsText}
                onChange={(e) => setSeasonsText(e.target.value)}
              />
            </CriteriaRow>
            <CriteriaRow label="Style/Colors">
              <Input
                placeholder="Wildcard pattern, e.g. KISS*BK  or  *FORMAL*"
                value={styleColorPattern}
                onChange={(e) => setStyleColorPattern(e.target.value)}
                suffix={
                  <Tag color="default" style={{ marginRight: 0 }}>
                    requires master join — coming soon
                  </Tag>
                }
              />
            </CriteriaRow>
            <CriteriaRow label="SKUs">
              <Input
                placeholder="e.g. TRLR7812-39-BK, 2A703GDGY (comma separated)"
                value={skusText}
                onChange={(e) => setSkusText(e.target.value)}
              />
            </CriteriaRow>
            <CriteriaRow label="Groups">
              <Select
                mode="multiple"
                allowClear
                loading={dimsLoading}
                value={selectedGroups}
                onChange={setSelectedGroups}
                placeholder="All groups"
                optionFilterProp="label"
                style={{ width: '100%' }}
                options={(dims?.groups ?? []).map((g) => ({
                  value: g.code,
                  label: g.desc ? `${g.code} — ${g.desc}` : g.code,
                }))}
                suffixIcon={
                  <Tag color="default" style={{ marginRight: 0, fontSize: 10 }}>
                    requires master join — coming soon
                  </Tag>
                }
              />
            </CriteriaRow>
            <CriteriaRow label="Keywords">
              <Input
                placeholder="Wildcard patterns, comma separated. e.g. 01AG25, *SUMMER*"
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                suffix={
                  <Tag color="default" style={{ marginRight: 0 }}>
                    requires master join — coming soon
                  </Tag>
                }
              />
            </CriteriaRow>
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
            <Text type="secondary">Net sales: ${data.totals.netSales.toLocaleString()}</Text>
          </Space>
        </Card>
        <Table<SalesAnalysisRow>
          dataSource={data.rows}
          columns={columns}
          rowKey={(r) => `${r.dimensionKey}|${r.storeNumber ?? '*'}`}
          size="small"
          pagination={{ pageSize: 50 }}
          summary={() => {
            const summaryColSpan = query?.reportType === 'DEPT_SUMMARY' ? 3 : 2
            return (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={summaryColSpan}>Totals</Table.Summary.Cell>
                  <Table.Summary.Cell index={summaryColSpan} align="right">{data.totals.qty}</Table.Summary.Cell>
                  <Table.Summary.Cell index={summaryColSpan + 1} align="right">
                    {data.totals.netSales.toFixed(2)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={summaryColSpan + 2} align="right">
                    {data.totals.cogs.toFixed(2)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={summaryColSpan + 3} align="right">
                    {data.totals.grossProfit.toFixed(2)}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={summaryColSpan + 4} />
                  {query.priorYear && (
                    <>
                      <Table.Summary.Cell index={summaryColSpan + 5} align="right">
                        {data.totals.priorYearNetSales == null
                          ? '—'
                          : data.totals.priorYearNetSales.toFixed(2)}
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={summaryColSpan + 6} />
                    </>
                  )}
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
