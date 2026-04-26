import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Checkbox, Input, Select, Space, Table, Typography, Spin,
} from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSalespersonSummary, type SalespersonSummaryArgs } from '../../hooks/useReports'
import type {
  SalespersonSummaryRow,
  SalespersonSubtotalBy,
  CashierRow,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'
import SaveAsTemplateButton from '../../components/reports/SaveAsTemplateButton'
import SaveSnapshotButton from '../../components/reports/SaveSnapshotButton'
import DateRangeControl from '../../components/reports/DateRangeControl'
import ReportHeader from '../../components/reports/ReportHeader'
import FilterChips from '../../components/reports/FilterChips'
import ReportEmptyState from '../../components/reports/ReportEmptyState'
import CollapsibleFilterCard from '../../components/reports/CollapsibleFilterCard'
import ShareBar from '../../components/reports/ShareBar'
import { fmtMoney, fmtInt } from '../../utils/reportFormatters'
import { useReportTemplate, useTouchReportTemplate } from '../../hooks/useReportTemplates'
import { briefDateSpec, readDateSpecFromParams, resolveDateSpec, type DateSpec } from '../../utils/dateSpec'

function parseStores(s: string): number[] | undefined {
  const arr = s.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0)
  return arr.length ? arr : undefined
}

// Salesperson summary defaults to a 30-day trailing window (matches the
// pre-DateSpec default); templates saved with this default replay a fresh
// 30-day window every time.
const DEFAULT_DATE_SPEC: DateSpec = { type: 'trailing_days', days: 30 }

export default function SalespersonSummaryPage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') ?? undefined
  const [dateSpec, setDateSpec] = useState<DateSpec>(DEFAULT_DATE_SPEC)
  const [storesText, setStoresText] = useState('')
  const [subtotalBy, setSubtotalBy] = useState<SalespersonSubtotalBy | undefined>(undefined)
  const [combineStores, setCombineStores] = useState(true)
  const [cashierSummary, setCashierSummary] = useState(false)
  const [query, setQuery] = useState<SalespersonSummaryArgs | null>(null)
  const [filterOpen, setFilterOpen] = useState(true)

  const { data, isFetching, error } = useSalespersonSummary(query)
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
    if (t.reportType !== 'salesperson-summary') return
    hydratedFor.current = templateId
    const p = t.paramsJson as Partial<SalespersonSummaryArgs> & { storesText?: string }
    const spec = readDateSpecFromParams(t.paramsJson) ?? DEFAULT_DATE_SPEC
    const { startDate, endDate } = resolveDateSpec(spec)
    setDateSpec(spec)
    if (p.storesText !== undefined) setStoresText(p.storesText)
    else if (Array.isArray(p.stores)) setStoresText(p.stores.join(','))
    setSubtotalBy(p.subtotalBy)
    if (p.combineStores !== undefined) setCombineStores(!!p.combineStores)
    if (p.cashierSummary !== undefined) setCashierSummary(!!p.cashierSummary)
    setQuery({
      startDate,
      endDate,
      stores: Array.isArray(p.stores) && p.stores.length ? p.stores : undefined,
      subtotalBy: p.subtotalBy,
      combineStores: p.combineStores ?? true,
      cashierSummary: !!p.cashierSummary,
    })
    touchTemplate.mutate(templateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templateData])

  function onRun(): void {
    const { startDate, endDate } = resolveDateSpec(dateSpec)
    setQuery({
      startDate,
      endDate,
      stores: parseStores(storesText),
      subtotalBy,
      combineStores,
      cashierSummary,
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['salesperson-summary', query] })
  }

  // Max $ across the visible salespeople — powers the contribution bar.
  const maxSalespersonDollars = useMemo(() => {
    if (!data?.salespeople?.length) return 0
    return data.salespeople.reduce((m, r) => Math.max(m, r.dollars ?? 0), 0)
  }, [data])

  const maxCashierDollars = useMemo(() => {
    if (!data?.cashierSummary?.length) return 0
    return data.cashierSummary.reduce((m, r) => Math.max(m, r.dollars ?? 0), 0)
  }, [data])

  const spColumns = [
    { title: 'Code', dataIndex: 'salespersonCode', key: 'salespersonCode', width: 120 },
    { title: 'Name', dataIndex: 'salespersonName', key: 'salespersonName', width: 200, render: (v: string | null) => v ?? '—' },
    { title: 'Store', dataIndex: 'storeNumber', key: 'storeNumber', width: 80 },
    {
      title: 'Qty', dataIndex: 'qty', key: 'qty', width: 90, align: 'right' as const,
      render: (v: number) => fmtInt(v),
      sorter: (a: SalespersonSummaryRow, b: SalespersonSummaryRow) => a.qty - b.qty,
    },
    {
      title: 'Dollars', dataIndex: 'dollars', key: 'dollars', width: 200,
      align: 'right' as const,
      render: (v: number) => (
        <ShareBar value={v} max={maxSalespersonDollars} label={fmtMoney(v)} />
      ),
      sorter: (a: SalespersonSummaryRow, b: SalespersonSummaryRow) => a.dollars - b.dollars,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Perks', dataIndex: 'perks', key: 'perks', width: 120,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
      sorter: (a: SalespersonSummaryRow, b: SalespersonSummaryRow) => a.perks - b.perks,
    },
  ]

  const cashierColumns = [
    { title: 'Code', dataIndex: 'cashierCode', key: 'cashierCode', width: 120 },
    { title: 'Name', dataIndex: 'cashierName', key: 'cashierName', width: 200, render: (v: string | null) => v ?? '—' },
    { title: 'Store', dataIndex: 'storeNumber', key: 'storeNumber', width: 80 },
    {
      title: 'Tickets', dataIndex: 'tickets', key: 'tickets', width: 100, align: 'right' as const,
      render: (v: number) => fmtInt(v),
      sorter: (a: CashierRow, b: CashierRow) => a.tickets - b.tickets,
    },
    {
      title: 'Dollars', dataIndex: 'dollars', key: 'dollars', width: 200,
      align: 'right' as const,
      render: (v: number) => (
        <ShareBar value={v} max={maxCashierDollars} label={fmtMoney(v)} color="#722ed1" />
      ),
      sorter: (a: CashierRow, b: CashierRow) => a.dollars - b.dollars,
      defaultSortOrder: 'descend' as const,
    },
  ]

  return (
    <div>
      <ReportHeader
        title="Salesperson Summary"
        description="Quantity, dollars, and perks per salesperson with optional subtotal breakdown."
        citation="RICS Ch. 2 p. 42"
        breadcrumb={[
          { title: <Link to="/reports/others">Other Reports</Link> },
          { title: 'Salesperson Summary' },
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
              reportType="salesperson-summary"
              disabled={query == null}
              getParamsJson={() => ({
                dateSpec,
                stores: parseStores(storesText),
                storesText,
                subtotalBy,
                combineStores,
                cashierSummary,
              })}
            />
            <SaveSnapshotButton
              reportType="salesperson-summary"
              disabled={query == null || !data}
              sourceTemplateId={templateId}
              getParamsJson={() => ({
                dateSpec,
                stores: parseStores(storesText),
                storesText,
                subtotalBy,
                combineStores,
                cashierSummary,
              })}
              getResultJson={() => data}
              getDescriptor={() => {
                const parts: string[] = [
                  cashierSummary ? 'Cashier summary' : 'Salesperson summary',
                ]
                if (subtotalBy) {
                  parts.push(`subtotal: ${subtotalBy === 'DEPARTMENT' ? 'Department' : 'Vendor'}`)
                }
                const stores = parseStores(storesText)
                if (stores && stores.length) {
                  parts.push(
                    stores.length <= 3
                      ? `stores ${stores.join(',')}`
                      : `${stores.length} stores`,
                  )
                }
                if (combineStores) parts.push('combined')
                parts.push(briefDateSpec(dateSpec))
                return parts.join(' · ')
              }}
            />
          </>
        }
      >
        <Space wrap>
          <DateRangeControl value={dateSpec} onChange={setDateSpec} />
          <Input
            placeholder="Stores (csv, blank=all)"
            value={storesText}
            onChange={(e) => setStoresText(e.target.value)}
            style={{ width: 200 }}
          />
          <Select
            allowClear
            value={subtotalBy}
            onChange={(v) => setSubtotalBy(v)}
            placeholder="Subtotal by..."
            style={{ width: 180 }}
            options={[
              { value: 'DEPARTMENT', label: 'Subtotal by category' },
              { value: 'VENDOR', label: 'Subtotal by vendor' },
            ]}
          />
          <Checkbox checked={combineStores} onChange={(e) => setCombineStores(e.target.checked)}>
            Combine stores
          </Checkbox>
          <Checkbox checked={cashierSummary} onChange={(e) => setCashierSummary(e.target.checked)}>
            Cashier summary
          </Checkbox>
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
                : { label: 'Stores', value: 'All' },
              query.combineStores === false ? { label: 'Separate', value: 'per store' } : null,
              query.subtotalBy
                ? { label: 'Subtotal', value: query.subtotalBy === 'VENDOR' ? 'by vendor' : 'by category' }
                : null,
              query.cashierSummary ? { label: 'Extra', value: 'Cashier summary' } : null,
            ]}
          />
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 8 }}>Salespeople</Typography.Title>
          <Table<SalespersonSummaryRow>
            dataSource={data.salespeople}
            columns={spColumns}
            rowKey={(r) => `${r.salespersonCode}|${r.storeNumber}`}
            size="small"
            pagination={{ pageSize: 25 }}
            rowClassName={(_r, i) => (i % 2 === 1 ? 'report-zebra-row' : '')}
            style={{ marginBottom: 16 }}
            expandable={
              query.subtotalBy
                ? {
                    expandedRowRender: (record) =>
                      record.subtotals.length ? (
                        <Table
                          dataSource={record.subtotals}
                          columns={[
                            { title: 'Key', dataIndex: 'key', width: 150 },
                            {
                              title: 'Qty', dataIndex: 'qty', align: 'right' as const, width: 100,
                              render: (v: number) => fmtInt(v),
                            },
                            {
                              title: 'Dollars', dataIndex: 'dollars',
                              align: 'right' as const, render: (v: number) => fmtMoney(v),
                            },
                          ]}
                          rowKey="key"
                          pagination={false}
                          size="small"
                        />
                      ) : (
                        <Typography.Text type="secondary">No subtotals</Typography.Text>
                      ),
                  }
                : undefined
            }
          />
          {query.cashierSummary && data.cashierSummary && (
            <>
              <Typography.Title level={4} style={{ marginTop: 24, marginBottom: 8 }}>Cashier Summary</Typography.Title>
              <Table<CashierRow>
                dataSource={data.cashierSummary}
                columns={cashierColumns}
                rowKey={(r) => `${r.cashierCode}|${r.storeNumber}`}
                size="small"
                pagination={{ pageSize: 25 }}
                rowClassName={(_r, i) => (i % 2 === 1 ? 'report-zebra-row' : '')}
              />
            </>
          )}
        </>
      ) : null}
    </div>
  )
}
