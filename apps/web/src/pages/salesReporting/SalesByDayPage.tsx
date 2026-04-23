import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Button, Card, InputNumber, Row, Col, Space,
  Statistic, Table, Tooltip, Typography, Spin,
} from 'antd'
import { DownloadOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSalesByDay, type SalesByDayArgs } from '../../hooks/useReports'
import { getSalesByDayCsvUrl, getSalesByDayXlsxUrl, type SalesByDayRow } from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'
import SaveAsTemplateButton from '../../components/reports/SaveAsTemplateButton'
import DateRangeControl from '../../components/reports/DateRangeControl'
import ReportHeader from '../../components/reports/ReportHeader'
import FilterChips from '../../components/reports/FilterChips'
import ReportEmptyState from '../../components/reports/ReportEmptyState'
import CollapsibleFilterCard from '../../components/reports/CollapsibleFilterCard'
import { ChangePctBadge } from '../../components/reports/gpBadge'
import { fmtMoney, fmtChangeMoney } from '../../utils/reportFormatters'
import { useReportTemplate, useTouchReportTemplate } from '../../hooks/useReportTemplates'
import { readDateSpecFromParams, resolveDateSpec, type DateSpec } from '../../utils/dateSpec'

const { Text } = Typography

const DEFAULT_DATE_SPEC: DateSpec = { type: 'trailing_days', days: 7 }

export default function SalesByDayPage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') ?? undefined
  const [storeNumber, setStoreNumber] = useState<number | undefined>(2)
  const [dateSpec, setDateSpec] = useState<DateSpec>(DEFAULT_DATE_SPEC)
  const [offset, setOffset] = useState<number>(364)
  const [query, setQuery] = useState<SalesByDayArgs | null>(null)
  const [filterOpen, setFilterOpen] = useState(true)

  const { data, isFetching, error } = useSalesByDay(query)
  const running = query != null && isFetching

  useEffect(() => {
    if (query && data && !isFetching) setFilterOpen(false)
  }, [query, data, isFetching])

  // Download URLs need the resolved start/end right now — they reflect the
  // current form state, not the last-run state, which matches the previous
  // behavior (users could tweak dates after a run and the buttons followed).
  const resolvedDates = useMemo(() => resolveDateSpec(dateSpec), [dateSpec])

  // ?templateId=... replay.
  const { data: templateData } = useReportTemplate(templateId)
  const touchTemplate = useTouchReportTemplate()
  const hydratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!templateId || !templateData) return
    if (hydratedFor.current === templateId) return
    const t = templateData.template
    if (t.reportType !== 'sales-by-day') return
    hydratedFor.current = templateId
    const p = t.paramsJson as Partial<SalesByDayArgs>
    const spec = readDateSpecFromParams(t.paramsJson) ?? DEFAULT_DATE_SPEC
    const { startDate, endDate } = resolveDateSpec(spec)
    if (typeof p.storeNumber === 'number') setStoreNumber(p.storeNumber)
    setDateSpec(spec)
    if (typeof p.comparisonOffsetDays === 'number') setOffset(p.comparisonOffsetDays)
    if (typeof p.storeNumber === 'number') {
      setQuery({
        storeNumber: p.storeNumber,
        startDate,
        endDate,
        comparisonOffsetDays: p.comparisonOffsetDays ?? 364,
      })
    }
    touchTemplate.mutate(templateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templateData])

  function onRun(): void {
    if (storeNumber == null) return
    const { startDate, endDate } = resolveDateSpec(dateSpec)
    setQuery({
      storeNumber,
      startDate,
      endDate,
      comparisonOffsetDays: offset,
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['sales-by-day', query] })
  }

  const columns = [
    {
      title: 'Date', dataIndex: 'date', key: 'date', width: 120,
      // Dates are ISO YYYY-MM-DD strings, so localeCompare sorts chronologically.
      sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.date.localeCompare(b.date),
      defaultSortOrder: 'ascend' as const,
    },
    {
      title: 'Day', dataIndex: 'dayName', key: 'dayName', width: 110,
      sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.dayName.localeCompare(b.dayName),
    },
    {
      title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: 140,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
      sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.netSales - b.netSales,
    },
    {
      title: (
        <Tooltip
          title={`Comparison date = this row's date minus the offset (${query?.comparisonOffsetDays ?? 364} days). Default 364 pairs each day to the same weekday one year ago.`}
        >
          <span>
            Compared To <QuestionCircleOutlined style={{ color: 'rgba(0,0,0,0.35)' }} />
          </span>
        </Tooltip>
      ),
      dataIndex: 'comparedToDate', key: 'comparedToDate', width: 140,
      sorter: (a: SalesByDayRow, b: SalesByDayRow) =>
        a.comparedToDate.localeCompare(b.comparedToDate),
    },
    {
      title: 'Compared Net', dataIndex: 'comparedNetSales', key: 'comparedNetSales', width: 140,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
      sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.comparedNetSales - b.comparedNetSales,
    },
    {
      title: 'Change', dataIndex: 'dollarChange', key: 'dollarChange', width: 130,
      align: 'right' as const,
      // Signed money with +/− prefix — replaces the all-green/all-red Tag for
      // a denser, easier-to-scan column. Color comes from ChangePctBadge's
      // sibling on the %Change column.
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#3f8600' : v < 0 ? '#cf1322' : undefined }}>
          {fmtChangeMoney(v)}
        </span>
      ),
      sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.dollarChange - b.dollarChange,
    },
    {
      title: '% Change', dataIndex: 'pctChange', key: 'pctChange', width: 110,
      align: 'right' as const,
      render: (v: number | null) => <ChangePctBadge value={v} />,
      // Null pctChange (when comparedNetSales is 0) sorts to the bottom of
      // ascending order.
      sorter: (a: SalesByDayRow, b: SalesByDayRow) =>
        (a.pctChange ?? Number.POSITIVE_INFINITY) - (b.pctChange ?? Number.POSITIVE_INFINITY),
    },
  ]

  return (
    <div>
      <ReportHeader
        title="Sales by Day"
        description="Net sales by day for one store, paired against a prior-period baseline."
        citation="RICS Ch. 6 p. 52"
        breadcrumb={[
          { title: <Link to="/reports/others">Other Reports</Link> },
          { title: 'Sales by Day' },
        ]}
      />

      <CollapsibleFilterCard
        open={filterOpen}
        onOpenChange={setFilterOpen}
        running={running}
        onRun={onRun}
        canRun={storeNumber != null}
        actions={
          <Space>
            <RunReportControls running={running} hasRun={query != null} onRun={onRun} onStop={onStop} />
            <SaveAsTemplateButton
              reportType="sales-by-day"
              disabled={query == null || storeNumber == null}
              getParamsJson={() => ({
                storeNumber,
                dateSpec,
                comparisonOffsetDays: offset,
              })}
            />
          </Space>
        }
      >
        <Space wrap>
          <InputNumber
            min={1}
            placeholder="Store #"
            value={storeNumber}
            onChange={(v) => setStoreNumber(v ?? undefined)}
          />
          <DateRangeControl value={dateSpec} onChange={setDateSpec} />
          <InputNumber
            min={1}
            max={732}
            placeholder="Compare offset days"
            value={offset}
            onChange={(v) => setOffset(v ?? 364)}
            addonBefore="Offset"
            style={{ width: 180 }}
          />
          {storeNumber && (
            <>
              <Button
                icon={<DownloadOutlined />}
                href={getSalesByDayCsvUrl(storeNumber, resolvedDates.startDate, resolvedDates.endDate, offset)}
              >
                CSV
              </Button>
              <Button
                icon={<DownloadOutlined />}
                href={getSalesByDayXlsxUrl(storeNumber, resolvedDates.startDate, resolvedDates.endDate, offset)}
              >
                XLSX
              </Button>
            </>
          )}
        </Space>
      </CollapsibleFilterCard>

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
          message="Pick a store + date range, then click Run Report."
        />
      ) : running ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="Querying RICS databases…" />
        </div>
      ) : data ? (
        <>
          <FilterChips
            chips={[
              { label: 'Store', value: data.storeLabel },
              { label: 'Period', value: `${query.startDate} → ${query.endDate}` },
              { label: 'Compare offset', value: `${query.comparisonOffsetDays ?? 364} days` },
            ]}
          />
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card>
                <Statistic title="Store" value={data.storeLabel} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="Weekly Net Sales"
                  // Using formatter (not `precision`) so the number follows
                  // the shared fmtMoney rule: thousands separator, 2 dp, no
                  // currency symbol.
                  value={data.weeklyTotals.netSales}
                  formatter={(v) => fmtMoney(Number(v))}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="Compared Net"
                  value={data.weeklyTotals.comparedNetSales}
                  formatter={(v) => fmtMoney(Number(v))}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="% Change"
                  value={data.weeklyTotals.pctChange ?? 0}
                  precision={1}
                  suffix="%"
                  valueStyle={{
                    color: (data.weeklyTotals.pctChange ?? 0) >= 0 ? '#3f8600' : '#cf1322',
                  }}
                />
                {data.weeklyTotals.pctChange == null && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    No baseline sales in compared period
                  </Text>
                )}
              </Card>
            </Col>
          </Row>
          <Table<SalesByDayRow>
            dataSource={data.rows}
            columns={columns}
            rowKey="date"
            pagination={false}
            size="small"
            rowClassName={(_r, i) => (i % 2 === 1 ? 'report-zebra-row' : '')}
          />
        </>
      ) : null}
    </div>
  )
}
