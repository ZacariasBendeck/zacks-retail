import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Button, Card, InputNumber, Row, Col, Select, Space, Switch,
  Statistic, Table, Tooltip, Typography, Spin,
} from 'antd'
import { DownloadOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSalesByDay, useSalesDimensions, type SalesByDayArgs } from '../../hooks/useReports'
import {
  getSalesByDayCsvUrl, getSalesByDayXlsxUrl,
  type SalesByDayRow, type SalesByDayStoreBreakdown, type SalesByDayCombinedBlock,
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
import { ChangePctBadge } from '../../components/reports/gpBadge'
import { fmtMoney, fmtChangeMoney } from '../../utils/reportFormatters'
import { useReportTemplate, useTouchReportTemplate } from '../../hooks/useReportTemplates'
import { readDateSpecFromParams, resolveDateSpec, type DateSpec } from '../../utils/dateSpec'
import { STORE_CHAINS } from '../../constants/storeChains'

const { Text } = Typography

const DEFAULT_DATE_SPEC: DateSpec = { type: 'trailing_days', days: 7 }

export default function SalesByDayPage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') ?? undefined
  // Default: no stores selected. Operator picks via multi-select or chain.
  const [storeNumbers, setStoreNumbers] = useState<number[]>([])
  const [chainId, setChainId] = useState<string | undefined>(undefined)
  const [combineStores, setCombineStores] = useState<boolean>(true)
  const [dateSpec, setDateSpec] = useState<DateSpec>(DEFAULT_DATE_SPEC)
  const [offset, setOffset] = useState<number>(364)
  const [query, setQuery] = useState<SalesByDayArgs | null>(null)
  const [filterOpen, setFilterOpen] = useState(true)

  const { data, isFetching, error } = useSalesByDay(query)
  const running = query != null && isFetching

  // Store dimensions (for the multi-select labels: number + description).
  const { data: dims, isLoading: dimsLoading } = useSalesDimensions()
  const storeOptions = useMemo(
    () =>
      (dims?.stores ?? []).map((s) => ({
        value: s.number,
        label: s.name ? `${s.number} — ${s.name}` : String(s.number),
      })),
    [dims],
  )

  useEffect(() => {
    if (query && data && !isFetching) setFilterOpen(false)
  }, [query, data, isFetching])

  // Picking a chain populates the store list with that chain's roster. The
  // operator can then add or remove stores manually — selection is the source
  // of truth for the actual query, the chain dropdown is just a shortcut.
  function onChainChange(next: string | undefined): void {
    setChainId(next)
    if (!next) return
    const chain = STORE_CHAINS.find((c) => c.id === next)
    if (chain) setStoreNumbers(chain.storeNumbers)
  }

  const resolvedDates = useMemo(() => resolveDateSpec(dateSpec), [dateSpec])

  const { data: templateData } = useReportTemplate(templateId)
  const touchTemplate = useTouchReportTemplate()
  const hydratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!templateId || !templateData) return
    if (hydratedFor.current === templateId) return
    const t = templateData.template
    if (t.reportType !== 'sales-by-day') return
    hydratedFor.current = templateId
    const p = t.paramsJson as Partial<SalesByDayArgs> & { storeNumber?: number }
    const spec = readDateSpecFromParams(t.paramsJson) ?? DEFAULT_DATE_SPEC
    const { startDate, endDate } = resolveDateSpec(spec)
    // Migrate legacy single-store templates → array form.
    const stores: number[] = Array.isArray(p.storeNumbers)
      ? p.storeNumbers.filter((n): n is number => typeof n === 'number')
      : typeof p.storeNumber === 'number' ? [p.storeNumber] : []
    if (stores.length) setStoreNumbers(stores)
    setDateSpec(spec)
    if (typeof p.comparisonOffsetDays === 'number') setOffset(p.comparisonOffsetDays)
    if (typeof p.combineStores === 'boolean') setCombineStores(p.combineStores)
    if (stores.length) {
      setQuery({
        storeNumbers: stores,
        startDate,
        endDate,
        comparisonOffsetDays: p.comparisonOffsetDays ?? 364,
        combineStores: p.combineStores ?? true,
      })
    }
    touchTemplate.mutate(templateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templateData])

  function onRun(): void {
    if (storeNumbers.length === 0) return
    const { startDate, endDate } = resolveDateSpec(dateSpec)
    setQuery({
      storeNumbers,
      startDate,
      endDate,
      comparisonOffsetDays: offset,
      combineStores,
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['sales-by-day', query] })
  }

  const columns = [
    {
      title: 'Date', dataIndex: 'date', key: 'date', width: 110,
      sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.date.localeCompare(b.date),
      defaultSortOrder: 'ascend' as const,
    },
    {
      title: 'Day', dataIndex: 'dayName', key: 'dayName', width: 100,
      sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.dayName.localeCompare(b.dayName),
    },
    {
      title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: 130,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
      sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.netSales - b.netSales,
    },
    {
      title: (
        <Tooltip title="Net sales − cost of goods sold for the period.">
          <span>Profit <QuestionCircleOutlined style={{ color: 'rgba(0,0,0,0.35)' }} /></span>
        </Tooltip>
      ),
      dataIndex: 'profit', key: 'profit', width: 120,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
      sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.profit - b.profit,
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
      dataIndex: 'comparedToDate', key: 'comparedToDate', width: 130,
      sorter: (a: SalesByDayRow, b: SalesByDayRow) =>
        a.comparedToDate.localeCompare(b.comparedToDate),
    },
    {
      title: 'Compared Net', dataIndex: 'comparedNetSales', key: 'comparedNetSales', width: 130,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
      sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.comparedNetSales - b.comparedNetSales,
    },
    {
      title: 'Change', dataIndex: 'dollarChange', key: 'dollarChange', width: 120,
      align: 'right' as const,
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#3f8600' : v < 0 ? '#cf1322' : undefined }}>
          {fmtChangeMoney(v)}
        </span>
      ),
      sorter: (a: SalesByDayRow, b: SalesByDayRow) => a.dollarChange - b.dollarChange,
    },
    {
      title: '% Change', dataIndex: 'pctChange', key: 'pctChange', width: 100,
      align: 'right' as const,
      render: (v: number | null) => <ChangePctBadge value={v} />,
      sorter: (a: SalesByDayRow, b: SalesByDayRow) =>
        (a.pctChange ?? Number.POSITIVE_INFINITY) - (b.pctChange ?? Number.POSITIVE_INFINITY),
    },
  ]

  return (
    <div>
      <ReportHeader
        title="Sales by Day"
        description="Net sales + profit by day for selected stores, paired against a prior-period baseline."
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
        canRun={storeNumbers.length > 0}
        actions={
          <RunReportControls running={running} hasRun={query != null} onRun={onRun} onStop={onStop} />
        }
        persistentActions={
          <>
            <SaveAsTemplateButton
              reportType="sales-by-day"
              disabled={query == null || storeNumbers.length === 0}
              getParamsJson={() => ({
                storeNumbers,
                dateSpec,
                comparisonOffsetDays: offset,
                combineStores,
              })}
            />
            <SaveSnapshotButton
              reportType="sales-by-day"
              disabled={query == null || !data}
              sourceTemplateId={templateId}
              getParamsJson={() => ({
                storeNumbers,
                dateSpec,
                comparisonOffsetDays: offset,
                combineStores,
              })}
              getResultJson={() => data}
            />
          </>
        }
      >
        <Space wrap size={[12, 12]} style={{ width: '100%' }}>
          <Select
            mode="multiple"
            allowClear
            placeholder={dimsLoading ? 'Loading stores…' : 'Select store(s)'}
            value={storeNumbers}
            onChange={(vals) => setStoreNumbers(vals as number[])}
            options={storeOptions}
            optionFilterProp="label"
            style={{ minWidth: 360 }}
            maxTagCount="responsive"
          />
          <Select
            allowClear
            placeholder="Or pick a chain"
            value={chainId}
            onChange={onChainChange}
            options={STORE_CHAINS.map((c) => ({
              value: c.id,
              label: `${c.label} (${c.storeNumbers.length})`,
            }))}
            style={{ minWidth: 220 }}
          />
          <Space>
            <Text>Combine stores</Text>
            <Switch
              checked={combineStores}
              onChange={setCombineStores}
              checkedChildren="On"
              unCheckedChildren="Off"
            />
          </Space>
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
          {storeNumbers.length > 0 && (
            <>
              <Button
                icon={<DownloadOutlined />}
                href={getSalesByDayCsvUrl(
                  storeNumbers, resolvedDates.startDate, resolvedDates.endDate, offset, combineStores,
                )}
              >
                CSV
              </Button>
              <Button
                icon={<DownloadOutlined />}
                href={getSalesByDayXlsxUrl(
                  storeNumbers, resolvedDates.startDate, resolvedDates.endDate, offset, combineStores,
                )}
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
          message="Pick at least one store, then click Run Report."
        />
      ) : running ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="Querying sales history…" />
        </div>
      ) : data ? (
        <SalesByDayResults
          query={query}
          combined={data.combined}
          storeBreakdowns={data.storeBreakdowns}
          combineStores={data.combineStores}
          columns={columns}
        />
      ) : null}
    </div>
  )
}

interface ResultsProps {
  query: SalesByDayArgs
  combined: SalesByDayCombinedBlock | null
  storeBreakdowns: SalesByDayStoreBreakdown[]
  combineStores: boolean
  columns: any[]
}

function SalesByDayResults(props: ResultsProps) {
  const { query, combined, storeBreakdowns, combineStores, columns } = props

  // Combined view: one set of headline cards + one table.
  if (combineStores && combined) {
    return (
      <>
        <FilterChips
          chips={[
            { label: 'Stores', value: combined.storeLabel },
            { label: 'Period', value: `${query.startDate} → ${query.endDate}` },
            { label: 'Compare offset', value: `${query.comparisonOffsetDays ?? 364} days` },
          ]}
        />
        <SummaryRow
          storeLabel={combined.storeLabel}
          totals={combined.totals}
        />
        <Table<SalesByDayRow>
          dataSource={combined.rows}
          columns={columns}
          rowKey="date"
          pagination={false}
          size="small"
          rowClassName={(_r, i) => (i % 2 === 1 ? 'report-zebra-row' : '')}
        />
      </>
    )
  }

  // Separate view: one section per store, each with its own summary + table.
  return (
    <>
      <FilterChips
        chips={[
          { label: 'Stores', value: `${storeBreakdowns.length} selected` },
          { label: 'Period', value: `${query.startDate} → ${query.endDate}` },
          { label: 'Compare offset', value: `${query.comparisonOffsetDays ?? 364} days` },
        ]}
      />
      {storeBreakdowns.map((b) => (
        <div key={b.storeNumber} style={{ marginBottom: 32 }}>
          <Typography.Title level={4} style={{ marginTop: 8 }}>{b.storeLabel}</Typography.Title>
          <SummaryRow storeLabel={b.storeLabel} totals={b.totals} />
          <Table<SalesByDayRow>
            dataSource={b.rows}
            columns={columns}
            rowKey="date"
            pagination={false}
            size="small"
            rowClassName={(_r, i) => (i % 2 === 1 ? 'report-zebra-row' : '')}
          />
        </div>
      ))}
    </>
  )
}

function SummaryRow({ storeLabel, totals }: { storeLabel: string; totals: import('../../services/reportApi').SalesTotals }) {
  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col span={5}>
        <Card>
          <Statistic title="Store" value={storeLabel} />
        </Card>
      </Col>
      <Col span={5}>
        <Card>
          <Statistic
            title="Net Sales"
            value={totals.netSales}
            formatter={(v) => fmtMoney(Number(v))}
          />
        </Card>
      </Col>
      <Col span={4}>
        <Card>
          <Statistic
            title="Profit"
            value={totals.profit}
            formatter={(v) => fmtMoney(Number(v))}
          />
        </Card>
      </Col>
      <Col span={5}>
        <Card>
          <Statistic
            title="Compared Net"
            value={totals.comparedNetSales}
            formatter={(v) => fmtMoney(Number(v))}
          />
        </Card>
      </Col>
      <Col span={5}>
        <Card>
          <Statistic
            title="% Change"
            value={totals.pctChange ?? 0}
            precision={1}
            suffix="%"
            valueStyle={{
              color: (totals.pctChange ?? 0) >= 0 ? '#3f8600' : '#cf1322',
            }}
          />
          {totals.pctChange == null && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              No baseline sales
            </Text>
          )}
        </Card>
      </Col>
    </Row>
  )
}
