import { useEffect, useRef, useState, useMemo } from 'react'
import {
  Alert, Button, Checkbox, Input, InputNumber, Select, Space, Table, Spin, Tag,
} from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useBestSellers, type BestSellersArgs } from '../../hooks/useReports'
import type {
  BestSellerRow,
  BestSellersDimension,
  BestSellersMetric,
  BestSellersPeriodFlag,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'
import SaveAsTemplateButton from '../../components/reports/SaveAsTemplateButton'
import SaveSnapshotButton from '../../components/reports/SaveSnapshotButton'
import ReportHeader from '../../components/reports/ReportHeader'
import FilterChips from '../../components/reports/FilterChips'
import ReportEmptyState from '../../components/reports/ReportEmptyState'
import CollapsibleFilterCard from '../../components/reports/CollapsibleFilterCard'
import { GpBadge } from '../../components/reports/gpBadge'
import ShareBar from '../../components/reports/ShareBar'
import { fmtMoney, fmtInt } from '../../utils/reportFormatters'
import { useReportTemplate, useTouchReportTemplate } from '../../hooks/useReportTemplates'

function parseStores(s: string): number[] | undefined {
  const arr = s.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0)
  return arr.length ? arr : undefined
}

const DIMENSION_LABELS: Record<BestSellersDimension, string> = {
  SKU: 'SKUs',
  VENDOR: 'Vendors',
  CATEGORY: 'Categories',
  STORE: 'Stores',
}

const METRIC_LABELS: Record<BestSellersMetric, string> = {
  NET_SALES: 'Net Sales',
  QTY: 'Qty',
  PROFIT: 'Profit',
}

export default function BestSellersPage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') ?? undefined
  const [dimension, setDimension] = useState<BestSellersDimension>('SKU')
  const [metric, setMetric] = useState<BestSellersMetric>('NET_SALES')
  const [period, setPeriod] = useState<BestSellersPeriodFlag>('YTD')
  const [topN, setTopN] = useState<number>(25)
  const [storesText, setStoresText] = useState('')
  const [combineStores, setCombineStores] = useState(true)
  const [query, setQuery] = useState<BestSellersArgs | null>(null)
  const [filterOpen, setFilterOpen] = useState(true)

  const { data, isFetching, error } = useBestSellers(query)
  const running = query != null && isFetching

  useEffect(() => {
    if (query && data && !isFetching) setFilterOpen(false)
  }, [query, data, isFetching])

  // ?templateId=... replay. Hydrates state + fires the query with the template's
  // saved params. Runs once per template id via hydratedFor ref.
  const { data: templateData } = useReportTemplate(templateId)
  const touchTemplate = useTouchReportTemplate()
  const hydratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!templateId || !templateData) return
    if (hydratedFor.current === templateId) return
    const t = templateData.template
    if (t.reportType !== 'best-sellers') return
    hydratedFor.current = templateId
    const p = t.paramsJson as Partial<BestSellersArgs> & { storesText?: string }
    if (p.dimension) setDimension(p.dimension)
    if (p.metric) setMetric(p.metric)
    if (p.period) setPeriod(p.period)
    if (p.topN) setTopN(p.topN)
    if (p.combineStores !== undefined) setCombineStores(p.combineStores)
    if (p.storesText !== undefined) setStoresText(p.storesText)
    else if (Array.isArray(p.stores)) setStoresText(p.stores.join(','))
    setQuery({
      dimension: p.dimension ?? 'SKU',
      metric: p.metric ?? 'NET_SALES',
      period: p.period ?? 'YTD',
      topN: p.topN ?? 25,
      stores: Array.isArray(p.stores) && p.stores.length ? p.stores : undefined,
      combineStores: p.combineStores ?? true,
    })
    touchTemplate.mutate(templateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templateData])

  function onRun(): void {
    setQuery({
      dimension,
      metric,
      period,
      topN,
      stores: parseStores(storesText),
      combineStores,
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['best-sellers', query] })
  }

  // Max of the ranking metric across the rendered set; powers the share bar.
  // Falls back to 0 when the set is empty so ShareBar hides its visual.
  const sortedMetric = query?.metric ?? metric
  const maxMetricValue = useMemo(() => {
    if (!data?.rows?.length) return 0
    const pickValue = (r: BestSellerRow): number =>
      sortedMetric === 'QTY' ? r.qty : sortedMetric === 'PROFIT' ? r.profit : r.netSales
    return data.rows.reduce((max, r) => Math.max(max, pickValue(r) ?? 0), 0)
  }, [data, sortedMetric])

  const columns = [
    {
      title: 'Rank', dataIndex: 'rank', key: 'rank', width: 74, align: 'center' as const,
      render: (r: number) => <RankBadge rank={r} />,
    },
    { title: 'Key', dataIndex: 'key', key: 'key', width: 180 },
    { title: 'Label', dataIndex: 'label', key: 'label', width: 200, render: (v: string | null) => v ?? '—' },
    {
      title: 'Qty', dataIndex: 'qty', key: 'qty', width: 140, align: 'right' as const,
      render: (v: number, row: BestSellerRow) =>
        sortedMetric === 'QTY'
          ? <ShareBar value={v} max={maxMetricValue} label={fmtInt(v)} color="#13c2c2" />
          : <span data-row-rank={row.rank}>{fmtInt(v)}</span>,
    },
    {
      title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: 180,
      align: 'right' as const,
      render: (v: number) =>
        sortedMetric === 'NET_SALES'
          ? <ShareBar value={v} max={maxMetricValue} label={fmtMoney(v)} />
          : fmtMoney(v),
    },
    {
      title: 'Profit', dataIndex: 'profit', key: 'profit', width: 180,
      align: 'right' as const,
      render: (v: number) =>
        sortedMetric === 'PROFIT'
          ? <ShareBar value={v} max={maxMetricValue} label={fmtMoney(v)} color="#52c41a" />
          : fmtMoney(v),
    },
    {
      title: 'Profit %', dataIndex: 'profitPct', key: 'profitPct', width: 100,
      align: 'right' as const,
      render: (v: number | null) => <GpBadge value={v} />,
    },
  ]

  return (
    <div>
      <ReportHeader
        title="Best Sellers"
        description="Top-N ranked by qty, net sales, or profit across SKU / vendor / category / store."
        citation="RICS Ch. 6 p. 93"
        breadcrumb={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Best Sellers' },
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
              reportType="best-sellers"
              disabled={query == null}
              getParamsJson={() => ({
                dimension,
                metric,
                period,
                topN,
                stores: parseStores(storesText),
                storesText,
                combineStores,
              })}
            />
            <SaveSnapshotButton
              reportType="best-sellers"
              disabled={query == null || !data}
              sourceTemplateId={templateId}
              getParamsJson={() => ({
                dimension,
                metric,
                period,
                topN,
                stores: parseStores(storesText),
                storesText,
                combineStores,
              })}
              getResultJson={() => data}
              getDescriptor={() => {
                const parts: string[] = [
                  `Top ${topN} ${DIMENSION_LABELS[dimension]}`,
                  `by ${METRIC_LABELS[metric]}`,
                  period,
                ]
                const stores = parseStores(storesText)
                if (stores && stores.length) {
                  parts.push(
                    stores.length <= 3
                      ? `stores ${stores.join(',')}`
                      : `${stores.length} stores`,
                  )
                }
                if (combineStores) parts.push('combined')
                return parts.join(' · ')
              }}
            />
          </>
        }
      >
        <Space wrap>
          <Select
            value={dimension}
            onChange={setDimension}
            style={{ width: 160 }}
            options={[
              { value: 'SKU', label: 'Best SKUs' },
              { value: 'VENDOR', label: 'Best Vendors' },
              { value: 'CATEGORY', label: 'Best Categories' },
              { value: 'STORE', label: 'Best Stores' },
            ]}
          />
          <Select
            value={metric}
            onChange={setMetric}
            style={{ width: 160 }}
            options={[
              { value: 'NET_SALES', label: 'Order by Net Sales' },
              { value: 'QTY', label: 'Order by Qty' },
              { value: 'PROFIT', label: 'Order by Profit' },
            ]}
          />
          <Select
            value={period}
            onChange={setPeriod}
            style={{ width: 100 }}
            options={[
              { value: 'WTD', label: 'WTD' },
              { value: 'MTD', label: 'MTD' },
              { value: 'STD', label: 'STD' },
              { value: 'YTD', label: 'YTD' },
            ]}
          />
          <Space.Compact>
            <Button disabled>Top</Button>
            <InputNumber
              min={1}
              max={1000}
              value={topN}
              onChange={(v) => setTopN(v ?? 25)}
              style={{ width: 160 }}
            />
          </Space.Compact>
          <Input
            placeholder="Stores (csv, blank=all)"
            value={storesText}
            onChange={(e) => setStoresText(e.target.value)}
            style={{ width: 200 }}
          />
          <Checkbox checked={combineStores} onChange={(e) => setCombineStores(e.target.checked)}>
            Combine stores
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
          message="Configure filters, then click Run Report."
        />
      ) : running ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="Querying RICS databases…" />
        </div>
      ) : data && data.rows.length === 0 ? (
        <ReportEmptyState
          reason="no-results"
          hint="No sales in the selected period."
        />
      ) : data ? (
        <>
          <FilterChips
            chips={[
              { label: 'Best', value: DIMENSION_LABELS[query.dimension] },
              { label: 'Order by', value: METRIC_LABELS[query.metric] },
              { label: 'Period', value: query.period ?? 'YTD' },
              { label: 'Top', value: `N=${query.topN ?? 25}` },
              query.stores?.length
                ? { label: 'Stores', value: query.stores.join(', ') }
                : { label: 'Stores', value: 'All' },
              query.combineStores === false ? { label: 'Separate', value: 'per store' } : null,
            ]}
          />
          <Table<BestSellerRow>
            dataSource={data.rows}
            columns={columns}
            rowKey="rank"
            size="small"
            pagination={{ pageSize: 50 }}
            rowClassName={(_r, i) => (i % 2 === 1 ? 'report-zebra-row' : '')}
          />
        </>
      ) : null}
    </div>
  )
}

const TOP_COLORS: Record<number, { bg: string; text: string }> = {
  1: { bg: '#faad14', text: '#fff' },
  2: { bg: '#a3a3a3', text: '#fff' },
  3: { bg: '#d4843d', text: '#fff' },
}

function RankBadge({ rank }: { rank: number }) {
  const c = TOP_COLORS[rank]
  if (c) {
    return (
      <Tag
        style={{
          margin: 0,
          minWidth: 40,
          textAlign: 'center',
          background: c.bg,
          color: c.text,
          borderColor: c.bg,
          fontWeight: 600,
        }}
      >
        #{rank}
      </Tag>
    )
  }
  return <span style={{ color: 'rgba(0,0,0,0.65)', fontVariantNumeric: 'tabular-nums' }}>#{rank}</span>
}
