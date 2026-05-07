import { useEffect, useRef, useState } from 'react'
import {
  Alert, Card, Checkbox, Segmented, Space, Table, Tooltip, Typography, Spin,
} from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSalesByTime, useSalesDimensions, type SalesByTimeArgs } from '../../hooks/useReports'
import type { SalesHourlyBucket } from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'
import SaveAsTemplateButton from '../../components/reports/SaveAsTemplateButton'
import SaveSnapshotButton from '../../components/reports/SaveSnapshotButton'
import DateRangeControl from '../../components/reports/DateRangeControl'
import ReportHeader from '../../components/reports/ReportHeader'
import FilterChips from '../../components/reports/FilterChips'
import ReportEmptyState from '../../components/reports/ReportEmptyState'
import CollapsibleFilterCard from '../../components/reports/CollapsibleFilterCard'
import {
  SummaryLabelCell,
  SummaryNumericCell,
} from '../../components/reports/SummaryRow'
import { fmtMoney, fmtInt, fmtPct1 } from '../../utils/reportFormatters'
import { useReportTemplate, useTouchReportTemplate } from '../../hooks/useReportTemplates'
import { briefDateSpec, readDateSpecFromParams, resolveDateSpec, type DateSpec } from '../../utils/dateSpec'
import {
  ReportCriteriaPanel,
  hydrateReportCriteria,
  useReportCriteria,
} from '../../components/reports/ReportCriteriaPanel'

const { Text } = Typography

const DEFAULT_DATE_SPEC: DateSpec = { type: 'trailing_days', days: 7 }

type ChartMetric = 'dollars' | 'qty' | 'tickets'

export default function SalesByTimePage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') ?? undefined
  const [dateSpec, setDateSpec] = useState<DateSpec>(DEFAULT_DATE_SPEC)
  const { criteria, setCriteria, updateCriteria, compactCriteria } = useReportCriteria()
  const [pctOfTotal, setPctOfTotal] = useState(false)
  const [chartMetric, setChartMetric] = useState<ChartMetric>('dollars')
  const [query, setQuery] = useState<SalesByTimeArgs | null>(null)
  const [filterOpen, setFilterOpen] = useState(true)

  const { data, isFetching, error } = useSalesByTime(query)
  const { data: dimensions, isLoading: dimensionsLoading } = useSalesDimensions()
  const running = query != null && isFetching

  useEffect(() => {
    if (query && data && !isFetching) setFilterOpen(false)
  }, [query, data, isFetching])

  // ?templateId=... replay.
  const { data: templateData } = useReportTemplate(templateId)
  const touchTemplate = useTouchReportTemplate()
  const hydratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!templateId || !templateData) return
    if (hydratedFor.current === templateId) return
    const t = templateData.template
    if (t.reportType !== 'sales-by-time') return
    hydratedFor.current = templateId
    const p = t.paramsJson as Partial<SalesByTimeArgs> & { storesText?: string }
    const spec = readDateSpecFromParams(t.paramsJson) ?? DEFAULT_DATE_SPEC
    const { startDate, endDate } = resolveDateSpec(spec)
    setDateSpec(spec)
    setCriteria(hydrateReportCriteria({
      ...p,
      storesRaw: p.storesText ?? p.storesRaw,
      stores: Array.isArray(p.stores) ? p.stores : undefined,
    }))
    if (p.pctOfTotal !== undefined) setPctOfTotal(!!p.pctOfTotal)
    setQuery({
      startDate,
      endDate,
      ...p,
      pctOfTotal: !!p.pctOfTotal,
    })
    touchTemplate.mutate(templateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templateData])

  function onRun(): void {
    const { startDate, endDate } = resolveDateSpec(dateSpec)
    setQuery({
      startDate,
      endDate,
      ...compactCriteria,
      pctOfTotal,
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['sales-by-time', query] })
  }

  const showPct = query?.pctOfTotal ?? false
  const columns = [
    {
      title: 'Hour', dataIndex: 'hour', key: 'hour', width: 90,
      render: (h: number) => `${String(h).padStart(2, '0')}:00`,
    },
    {
      title: 'Tickets', dataIndex: 'tickets', key: 'tickets', width: 100, align: 'right' as const,
      render: (v: number) => fmtInt(v),
    },
    {
      title: 'Qty', dataIndex: 'qty', key: 'qty', width: 100, align: 'right' as const,
      render: (v: number) => fmtInt(v),
    },
    {
      title: 'Dollars', dataIndex: 'dollars', key: 'dollars', width: 140,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
    },
    ...(showPct
      ? [{
          title: '% of Total', dataIndex: 'pctOfTotal', key: 'pctOfTotal', width: 120,
          align: 'right' as const,
          render: (v: number | null) => fmtPct1(v),
        }]
      : []),
  ]

  return (
    <div>
      <ReportHeader
        title="Sales by Time"
        description="Ticket count, units, and dollars bucketed by hour-of-day."
        citation="RICS Ch. 2 p. 41"
        breadcrumb={[
          { title: <Link to="/reports/others">Other Reports</Link> },
          { title: 'Sales by Time' },
        ]}
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
              reportType="sales-by-time"
              disabled={query == null}
              getParamsJson={() => ({
                dateSpec,
                ...compactCriteria,
                pctOfTotal,
              })}
            />
            <SaveSnapshotButton
              reportType="sales-by-time"
              disabled={query == null || !data}
              sourceTemplateId={templateId}
              getParamsJson={() => ({
                dateSpec,
                ...compactCriteria,
                pctOfTotal,
              })}
              getResultJson={() => data}
              getDescriptor={() => {
                const parts: string[] = []
                const stores = compactCriteria.stores
                if (stores && stores.length) {
                  parts.push(
                    stores.length <= 3
                      ? `stores ${stores.join(',')}`
                      : `${stores.length} stores`,
                  )
                }
                parts.push(briefDateSpec(dateSpec))
                parts.push(`metric: ${chartMetric}`)
                if (pctOfTotal) parts.push('% of total')
                return parts.join(' · ')
              }}
            />
          </>
        }
      >
        <Space wrap>
          <DateRangeControl value={dateSpec} onChange={setDateSpec} />
          <Checkbox checked={pctOfTotal} onChange={(e) => setPctOfTotal(e.target.checked)}>
            Show % of total
          </Checkbox>
        </Space>
        <ReportCriteriaPanel
          value={criteria}
          onChange={updateCriteria}
          dimensions={dimensions}
          loading={dimensionsLoading}
        />
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
          message="Pick a date range, then click Run Report."
        />
      ) : running ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="Querying RICS databases…" />
        </div>
      ) : data ? (
        <>
          <FilterChips
            chips={[
              { label: 'Period', value: `${query.startDate} → ${query.endDate}` },
              query.stores?.length
                ? { label: 'Stores', value: query.stores.join(', ') }
                : { label: 'Stores', value: query.storesRaw ?? 'All' },
              showPct ? { label: 'Columns', value: 'incl. % of total' } : null,
            ]}
          />
          <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: 12 } }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Hour-of-day curve — hover a bar for exact values.
              </Text>
              <Segmented<ChartMetric>
                size="small"
                value={chartMetric}
                onChange={(v) => setChartMetric(v as ChartMetric)}
                options={[
                  { value: 'dollars', label: 'Dollars' },
                  { value: 'qty', label: 'Qty' },
                  { value: 'tickets', label: 'Tickets' },
                ]}
              />
            </div>
            <HourlyBarChart rows={data.rangeA} metric={chartMetric} />
          </Card>
          <Table<SalesHourlyBucket>
            dataSource={data.rangeA}
            columns={columns}
            rowKey="hour"
            pagination={false}
            size="small"
            rowClassName={(_r, i) => (i % 2 === 1 ? 'report-zebra-row' : '')}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <SummaryLabelCell index={0} variant="grand">Totals</SummaryLabelCell>
                  <SummaryNumericCell index={1} variant="grand">{fmtInt(data.totalsA.tickets)}</SummaryNumericCell>
                  <SummaryNumericCell index={2} variant="grand">{fmtInt(data.totalsA.qty)}</SummaryNumericCell>
                  <SummaryNumericCell index={3} variant="grand">{fmtMoney(data.totalsA.dollars)}</SummaryNumericCell>
                  {showPct ? (
                    <SummaryNumericCell index={4} variant="grand">100.0%</SummaryNumericCell>
                  ) : null}
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </>
      ) : null}
    </div>
  )
}

interface HourlyBarChartProps {
  rows: SalesHourlyBucket[]
  metric: ChartMetric
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const CHART_HEIGHT = 120

function HourlyBarChart({ rows, metric }: HourlyBarChartProps) {
  // Index rows by hour so zero-sales hours still render as an empty slot and
  // the 24-hour axis reads left-to-right regardless of row order.
  const byHour = new Map<number, SalesHourlyBucket>()
  for (const r of rows) byHour.set(r.hour, r)
  const values = HOURS.map((h) => {
    const r = byHour.get(h)
    if (!r) return 0
    return metric === 'dollars' ? r.dollars : metric === 'qty' ? r.qty : r.tickets
  })
  const max = values.reduce((m, v) => (v > m ? v : m), 0)
  const fmt = metric === 'dollars' ? fmtMoney : fmtInt
  const color = metric === 'dollars' ? '#1677ff' : metric === 'qty' ? '#13c2c2' : '#722ed1'

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(24, 1fr)',
          gap: 2,
          alignItems: 'end',
          height: CHART_HEIGHT,
        }}
      >
        {values.map((v, i) => {
          const pct = max > 0 ? (v / max) * 100 : 0
          return (
            <Tooltip
              key={i}
              title={
                <div>
                  <div>{`${String(i).padStart(2, '0')}:00`}</div>
                  <div>{fmt(v)}</div>
                </div>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                <div
                  style={{
                    height: `${pct}%`,
                    background: v > 0 ? color : 'rgba(0, 0, 0, 0.04)',
                    borderRadius: '2px 2px 0 0',
                    minHeight: v > 0 ? 2 : 0,
                    transition: 'height 0.2s ease',
                  }}
                />
              </div>
            </Tooltip>
          )
        })}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(24, 1fr)',
          gap: 2,
          marginTop: 4,
          fontSize: 10,
          color: 'rgba(0, 0, 0, 0.45)',
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {HOURS.map((h) => (
          <div key={h}>{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</div>
        ))}
      </div>
    </div>
  )
}
