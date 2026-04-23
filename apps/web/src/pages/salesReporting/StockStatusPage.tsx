import { useEffect, useRef, useState } from 'react'
import {
  Alert, Card, Input, Select, Space, Table, Tag, Spin,
} from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useStockStatus, type StockStatusArgs } from '../../hooks/useReports'
import type {
  StockStatusRow,
  StockStatusSortBy,
  StockStatusStoreOption,
  StockStatusItemFilter,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'
import SaveAsTemplateButton from '../../components/reports/SaveAsTemplateButton'
import ReportHeader from '../../components/reports/ReportHeader'
import FilterChips, { type FilterChip } from '../../components/reports/FilterChips'
import ReportEmptyState from '../../components/reports/ReportEmptyState'
import CollapsibleFilterCard from '../../components/reports/CollapsibleFilterCard'
import { SummaryLabelCell, SummaryNumericCell } from '../../components/reports/SummaryRow'
import { fmtMoney, fmtInt } from '../../utils/reportFormatters'
import { useReportTemplate, useTouchReportTemplate } from '../../hooks/useReportTemplates'

function parseInts(s: string): number[] | undefined {
  const arr = s.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0)
  return arr.length ? arr : undefined
}
function parseStrs(s: string): string[] | undefined {
  const arr = s.split(',').map((x) => x.trim()).filter(Boolean)
  return arr.length ? arr : undefined
}

const ITEM_FILTER_LABELS: Record<StockStatusItemFilter, string> = {
  ALL: 'All items',
  ONLY_SHORT: 'Only short',
  ONLY_CRITICAL: 'Only critical',
  ONLY_ON_ORDER: 'Only on order',
  ONLY_NEGATIVE_OH: 'Only negative on-hand',
  ONLY_WITH_MODELS: 'Only with models',
}

export default function StockStatusPage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') ?? undefined
  const [sortBy, setSortBy] = useState<StockStatusSortBy>('CATEGORY')
  const [storeOption, setStoreOption] = useState<StockStatusStoreOption>('SEPARATE')
  const [itemFilter, setItemFilter] = useState<StockStatusItemFilter>('ALL')
  const [vendorsText, setVendorsText] = useState('')
  const [categoriesText, setCategoriesText] = useState('')
  const [seasonsText, setSeasonsText] = useState('')
  const [skusText, setSkusText] = useState('')
  const [query, setQuery] = useState<StockStatusArgs | null>(null)
  const [filterOpen, setFilterOpen] = useState(true)

  const { data, isFetching, error } = useStockStatus(query)
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
    if (t.reportType !== 'stock-status') return
    hydratedFor.current = templateId
    const p = t.paramsJson as Partial<StockStatusArgs> & {
      vendorsText?: string; categoriesText?: string; seasonsText?: string; skusText?: string
    }
    if (p.sortBy) setSortBy(p.sortBy)
    if (p.storeOption) setStoreOption(p.storeOption)
    if (p.itemFilter) setItemFilter(p.itemFilter)
    setVendorsText(p.vendorsText ?? (Array.isArray(p.vendors) ? p.vendors.join(',') : ''))
    setCategoriesText(p.categoriesText ?? (Array.isArray(p.categories) ? p.categories.join(',') : ''))
    setSeasonsText(p.seasonsText ?? (Array.isArray(p.seasons) ? p.seasons.join(',') : ''))
    setSkusText(p.skusText ?? (Array.isArray(p.skus) ? p.skus.join(',') : ''))
    setQuery({
      sortBy: p.sortBy ?? 'CATEGORY',
      storeOption: p.storeOption ?? 'SEPARATE',
      itemFilter: p.itemFilter ?? 'ALL',
      vendors: Array.isArray(p.vendors) && p.vendors.length ? p.vendors : undefined,
      categories: Array.isArray(p.categories) && p.categories.length ? p.categories : undefined,
      seasons: Array.isArray(p.seasons) && p.seasons.length ? p.seasons : undefined,
      skus: Array.isArray(p.skus) && p.skus.length ? p.skus : undefined,
    })
    touchTemplate.mutate(templateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templateData])

  function onRun(): void {
    setQuery({
      sortBy,
      storeOption,
      itemFilter,
      vendors: parseStrs(vendorsText),
      categories: parseInts(categoriesText),
      seasons: parseStrs(seasonsText),
      skus: parseStrs(skusText),
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['stock-status', query] })
  }

  const columns = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180, fixed: 'left' as const },
    { title: 'Description', dataIndex: 'description', key: 'description', width: 240, render: (v: string | null) => v ?? '—' },
    { title: 'Vendor', dataIndex: 'vendorCode', key: 'vendorCode', width: 90 },
    { title: 'Cat', dataIndex: 'category', key: 'category', width: 80 },
    { title: 'Store', dataIndex: 'storeNumber', key: 'storeNumber', width: 70 },
    {
      title: 'On Hand', dataIndex: 'onHand', key: 'onHand', width: 100, align: 'right' as const,
      render: (v: number) => fmtInt(v),
    },
    {
      title: 'On Order', dataIndex: 'onOrder', key: 'onOrder', width: 100, align: 'right' as const,
      render: (v: number) => fmtInt(v),
    },
    {
      title: 'Model', dataIndex: 'model', key: 'model', width: 90, align: 'right' as const,
      render: (v: number) => fmtInt(v),
    },
    {
      title: 'Short', dataIndex: 'short', key: 'short', width: 90,
      align: 'right' as const,
      render: (v: number) => (v > 0 ? <Tag color="gold">{fmtInt(v)}</Tag> : fmtInt(v)),
    },
    {
      title: 'Critical', dataIndex: 'critical', key: 'critical', width: 100,
      align: 'right' as const,
      render: (v: number) => (v > 0 ? <Tag color="red">{fmtInt(v)}</Tag> : fmtInt(v)),
    },
    {
      title: 'Retail Value', dataIndex: 'retailValue', key: 'retailValue', width: 120,
      align: 'right' as const,
      render: (v: number) => fmtMoney(v),
    },
    {
      title: 'Cost Value', dataIndex: 'costValue', key: 'costValue', width: 120,
      align: 'right' as const,
      render: (v: number) => fmtMoney(v),
    },
  ]

  return (
    <div>
      <ReportHeader
        title="Stock Status"
        description="On-hand / on-order / model / short / critical per SKU. Unfiltered runs can scan thousands of SKUs — use criteria filters to narrow the scope."
        citation="RICS Ch. 6 p. 96"
        breadcrumb={[
          { title: <Link to="/reports/sales">Sales Reports</Link> },
          { title: 'Stock Status' },
        ]}
        rightMeta={data ? `${data.rows.length.toLocaleString()} ${data.rows.length === 1 ? 'row' : 'rows'}` : undefined}
      />

      <CollapsibleFilterCard
        open={filterOpen}
        onOpenChange={setFilterOpen}
        running={running}
        onRun={onRun}
        actions={
          <Space>
            <RunReportControls running={running} hasRun={query != null} onRun={onRun} onStop={onStop} />
            <SaveAsTemplateButton
              reportType="stock-status"
              disabled={query == null}
              getParamsJson={() => ({
                sortBy,
                storeOption,
                itemFilter,
                vendors: parseStrs(vendorsText),
                categories: parseInts(categoriesText),
                seasons: parseStrs(seasonsText),
                skus: parseStrs(skusText),
                vendorsText,
                categoriesText,
                seasonsText,
                skusText,
              })}
            />
          </Space>
        }
      >
        <Space wrap>
          <Select
            value={sortBy}
            onChange={setSortBy}
            style={{ width: 160 }}
            options={[
              { value: 'CATEGORY', label: 'Sort by Category' },
              { value: 'VENDOR', label: 'Sort by Vendor' },
            ]}
          />
          <Select
            value={storeOption}
            onChange={setStoreOption}
            style={{ width: 160 }}
            options={[
              { value: 'SEPARATE', label: 'Per-Store' },
              { value: 'COMBINE', label: 'Combine Stores' },
            ]}
          />
          <Select
            value={itemFilter}
            onChange={setItemFilter}
            style={{ width: 200 }}
            options={[
              { value: 'ALL', label: 'All items' },
              { value: 'ONLY_SHORT', label: 'Only short' },
              { value: 'ONLY_CRITICAL', label: 'Only critical' },
              { value: 'ONLY_ON_ORDER', label: 'Only on order' },
              { value: 'ONLY_NEGATIVE_OH', label: 'Only negative on-hand' },
              { value: 'ONLY_WITH_MODELS', label: 'Only with models' },
            ]}
          />
        </Space>
        <Space wrap style={{ marginTop: 12 }}>
          <Input
            placeholder="Vendors (csv)"
            value={vendorsText}
            onChange={(e) => setVendorsText(e.target.value)}
            style={{ width: 200 }}
          />
          <Input
            placeholder="Categories (csv)"
            value={categoriesText}
            onChange={(e) => setCategoriesText(e.target.value)}
            style={{ width: 200 }}
          />
          <Input
            placeholder="Seasons (csv)"
            value={seasonsText}
            onChange={(e) => setSeasonsText(e.target.value)}
            style={{ width: 180 }}
          />
          <Input
            placeholder="SKUs (csv)"
            value={skusText}
            onChange={(e) => setSkusText(e.target.value)}
            style={{ width: 240 }}
          />
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
          message="Configure filters above, then click Run Report."
        />
      ) : running ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="Querying RICS databases…" />
        </div>
      ) : data && data.rows.length === 0 ? (
        <ReportEmptyState
          reason="no-results"
          hint="No SKUs match the current filters. Try a less restrictive Items filter or widen the criteria."
        />
      ) : data ? (
        <>
          <FilterChips
            chips={[
              { label: 'Sort', value: query.sortBy === 'VENDOR' ? 'Vendor' : 'Category' },
              { label: 'Stores', value: query.storeOption === 'COMBINE' ? 'Combined' : 'Per-store' },
              { label: 'Items', value: ITEM_FILTER_LABELS[query.itemFilter ?? 'ALL'] },
              listChip('Vendors', query.vendors),
              listChip('Categories', query.categories),
              listChip('Seasons', query.seasons),
              listChip('SKUs', query.skus),
            ]}
          />
          <Table<StockStatusRow>
            dataSource={data.rows}
            columns={columns}
            rowKey={(r) => `${r.sku}|${r.storeNumber}`}
            size="small"
            pagination={{ pageSize: 50 }}
            scroll={{ x: 1400 }}
            rowClassName={(_r, i) => (i % 2 === 1 ? 'report-zebra-row' : '')}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <SummaryLabelCell index={0} colSpan={5} variant="grand">Totals</SummaryLabelCell>
                  <SummaryNumericCell index={1} variant="grand">{fmtInt(data.totals.onHand)}</SummaryNumericCell>
                  <SummaryNumericCell index={2} variant="grand">{fmtInt(data.totals.onOrder)}</SummaryNumericCell>
                  <SummaryNumericCell index={3} variant="grand">{fmtInt(data.totals.model)}</SummaryNumericCell>
                  <SummaryNumericCell index={4} variant="grand">{fmtInt(data.totals.short)}</SummaryNumericCell>
                  <SummaryNumericCell index={5} variant="grand">{fmtInt(data.totals.critical)}</SummaryNumericCell>
                  <SummaryNumericCell index={6} variant="grand">{fmtMoney(data.totals.retailValue)}</SummaryNumericCell>
                  <SummaryNumericCell index={7} variant="grand">{fmtMoney(data.totals.costValue)}</SummaryNumericCell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </>
      ) : null}
    </div>
  )
}

function listChip(label: string, values: readonly (string | number)[] | undefined): FilterChip | null {
  if (!values || !values.length) return null
  const joined = values.map(String).join(', ')
  return { label, value: joined.length > 40 ? `${joined.slice(0, 37)}…` : joined, hint: joined }
}
