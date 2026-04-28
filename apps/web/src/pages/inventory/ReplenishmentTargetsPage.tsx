import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Card,
  Col,
  Empty,
  Input,
  InputNumber,
  Row,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  FundOutlined,
  InboxOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SearchOutlined,
  ShopOutlined,
} from '@ant-design/icons'
import { useAutocompleteSkus } from '../../hooks/useSkus'
import {
  useReplenishmentTarget,
  useUpdateReplenishmentTargetStore,
} from '../../hooks/useReplenishmentTargets'
import { SkuLink } from '../../components/sku-link'
import { useInquiryPopup } from '../../components/inquiry-popup'
import { SkuLookup } from '../../components/sku-lookup'
import { StockMaintenanceHero } from '../../components/stock-maintenance'
import type {
  ReplenishmentTargetCell,
  ReplenishmentTargetRecord,
  ReplenishmentTargetStore,
  UpdateReplenishmentTargetPayload,
} from '../../types/replenishmentTarget'
import { getErrorMessage } from '../../utils/errors'

type TargetMetric = 'modelQty' | 'maxQty' | 'reorderQty'

interface TabOption {
  value: TargetMetric
  label: string
  hint: string
}

interface DraftCell extends ReplenishmentTargetCell {}

const TABS: TabOption[] = [
  { value: 'modelQty', label: 'Model', hint: 'Desired on-hand per size and store (RICS p. 68)' },
  { value: 'maxQty', label: 'Max', hint: 'Ceiling used when computing shortfall' },
  { value: 'reorderQty', label: 'Reorder', hint: 'Rounding multiple used by automatic ordering' },
]

function naturalLabelCompare(a: string, b: string): number {
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function cellKey(rowLabel: string, columnLabel: string): string {
  return `${rowLabel}||${columnLabel}`
}

function buildDraftCells(
  store: ReplenishmentTargetStore,
  rowLabels: string[],
  columnLabels: string[],
): Record<string, DraftCell> {
  const byKey = new Map<string, ReplenishmentTargetCell>()
  for (const cell of store.cells) {
    byKey.set(cellKey(cell.rowLabel, cell.columnLabel), cell)
  }

  const rows = rowLabels.length > 0 ? rowLabels : ['']
  const cols = columnLabels.length > 0 ? columnLabels : ['']
  const out: Record<string, DraftCell> = {}
  for (const rowLabel of rows) {
    for (const columnLabel of cols) {
      const existing = byKey.get(cellKey(rowLabel, columnLabel))
      out[cellKey(rowLabel, columnLabel)] = {
        rowLabel,
        columnLabel,
        onHand: existing?.onHand ?? 0,
        modelQty: existing?.modelQty ?? 0,
        maxQty: existing?.maxQty ?? 0,
        reorderQty: existing?.reorderQty ?? 0,
      }
    }
  }
  return out
}

function draftPayloadFromCells(draftCells: Record<string, DraftCell>): UpdateReplenishmentTargetPayload {
  return {
    cells: Object.values(draftCells).map((cell) => ({
      columnLabel: cell.columnLabel,
      rowLabel: cell.rowLabel,
      modelQty: cell.modelQty,
      maxQty: cell.maxQty,
      reorderQty: cell.reorderQty,
    })),
  }
}

export default function ReplenishmentTargetsPage() {
  const navigate = useNavigate()
  const { openInquiry } = useInquiryPopup()
  const [searchParams, setSearchParams] = useSearchParams()
  const skuFromUrl = searchParams.get('sku')?.trim() || ''
  const metricFromUrl = (searchParams.get('metric') as TargetMetric) || 'modelQty'
  const activeMetric: TargetMetric = TABS.some((tab) => tab.value === metricFromUrl)
    ? metricFromUrl
    : 'modelQty'
  const [skuInput, setSkuInput] = useState(skuFromUrl)
  const [debouncedSkuSearch, setDebouncedSkuSearch] = useState('')
  const [skuLookupOpen, setSkuLookupOpen] = useState(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeSku = skuFromUrl || null
  const { data, isLoading, isFetching, error } = useReplenishmentTarget(activeSku)
  const { data: autocompleteResults, isFetching: isSearchingSkus } = useAutocompleteSkus(debouncedSkuSearch)

  useEffect(() => {
    setSkuInput(skuFromUrl)
  }, [skuFromUrl])

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  const skuSearchOptions = useMemo(() => {
    if (!autocompleteResults?.length) return []
    return autocompleteResults.map((item) => ({
      value: item.skuCode,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontWeight: 600 }}>{item.skuCode}</span>
          <span
            style={{
              color: '#64748b',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.style}{item.brandName ? ` - ${item.brandName}` : ''}
          </span>
        </div>
      ),
    }))
  }, [autocompleteResults])

  const headerMetrics = useMemo(() => {
    const stores = data?.stores.length ?? 0
    const totals = data?.stores.reduce(
      (acc, store) => ({
        onHand: acc.onHand + store.totals.onHand,
        modelQty: acc.modelQty + store.totals.modelQty,
      }),
      { onHand: 0, modelQty: 0 },
    ) ?? { onHand: 0, modelQty: 0 }

    return [
      { label: 'SKU', value: activeSku ?? 'Choose a SKU' },
      { label: 'Stores in play', value: stores || '--' },
      { label: 'Current focus', value: TABS.find((tab) => tab.value === activeMetric)?.label ?? 'Model' },
      { label: 'Sigma on hand', value: totals.onHand || '--' },
      { label: 'Sigma model', value: totals.modelQty || '--' },
      { label: 'Request authority', value: 'app.*' },
    ]
  }, [activeMetric, activeSku, data])

  const handleSearch = (value: string) => {
    const trimmed = value.trim()
    const next = new URLSearchParams(searchParams)
    if (!trimmed) {
      next.delete('sku')
    } else {
      next.set('sku', trimmed)
    }
    setSearchParams(next)
  }

  const handleMetricChange = (value: TargetMetric) => {
    const next = new URLSearchParams(searchParams)
    next.set('metric', value)
    setSearchParams(next)
  }

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <StockMaintenanceHero
          eyebrow="Stock Maintenance"
          title="Model Quantities"
          subtitle="Maintain Model, Max, and Reorder targets from the app-owned inventory spine. Operators can jump from a SKU into target tuning, then back into receipt, return, or size search without leaving the stock-maintenance workspace."
          ricsReference="RICS Ch. 4 p. 68"
          metrics={headerMetrics}
          actions={
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Text style={{ color: 'rgba(248, 250, 252, 0.82)', fontWeight: 600 }}>
                Operator actions
              </Typography.Text>
              <Space wrap>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/inventory/adjustments')}>
                  Back to workspace
                </Button>
                <Button
                  icon={<SearchOutlined />}
                  disabled={!activeSku}
                  onClick={() =>
                    navigate(
                      activeSku
                        ? `/inventory/find-by-size?seedSku=${encodeURIComponent(activeSku)}`
                        : '/inventory/find-by-size',
                    )
                  }
                >
                  Find by Size
                </Button>
                <Button icon={<InboxOutlined />} onClick={() => navigate('/inventory/manual-receipts/new')}>
                  Manual Receipt
                </Button>
                <Button icon={<RollbackOutlined />} onClick={() => navigate('/inventory/manual-returns/new')}>
                  Manual Return
                </Button>
              </Space>
            </Space>
          }
          footer={
            <Typography.Text style={{ color: 'rgba(248, 250, 252, 0.82)' }}>
              Save is per store. Live requests read and write Postgres-owned replenishment targets instead of the mirror.
            </Typography.Text>
          }
        />

        <Card
          bordered={false}
          style={{
            borderRadius: 20,
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)',
          }}
        >
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} xl={12}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    Load a SKU
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    Search by SKU code, use autocomplete, or open the full lookup modal.
                  </Typography.Text>
                </div>
                <AutoComplete
                  value={skuInput}
                  options={skuSearchOptions}
                  onSearch={(text) => {
                    setSkuInput(text)
                    if (debounceTimer.current) clearTimeout(debounceTimer.current)
                    debounceTimer.current = setTimeout(() => setDebouncedSkuSearch(text), 300)
                  }}
                  onSelect={(value: string) => {
                    setSkuInput(value)
                    handleSearch(value)
                  }}
                  notFoundContent={isSearchingSkus ? 'Searching...' : undefined}
                  style={{ width: '100%' }}
                >
                  <Input.Search
                    placeholder="Enter SKU (for example 349101-BKPT)"
                    prefix={<SearchOutlined />}
                    allowClear
                    enterButton="Load"
                    loading={isFetching}
                    onSearch={handleSearch}
                  />
                </AutoComplete>
              </Space>
            </Col>

            <Col xs={24} xl={6}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Typography.Text strong>Editing mode</Typography.Text>
                <Segmented<TargetMetric>
                  block
                  options={TABS.map((tab) => ({ label: tab.label, value: tab.value }))}
                  value={activeMetric}
                  onChange={(value) => handleMetricChange(value as TargetMetric)}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {TABS.find((tab) => tab.value === activeMetric)?.hint}
                </Typography.Text>
              </Space>
            </Col>

            <Col xs={24} xl={6}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Typography.Text strong>Lookup tools</Typography.Text>
                <Button icon={<SearchOutlined />} onClick={() => setSkuLookupOpen(true)} block>
                  Open SKU Lookup
                </Button>
                <Button
                  icon={<FundOutlined />}
                  disabled={!activeSku}
                  onClick={() => activeSku && openInquiry({ skuCode: activeSku })}
                  block
                >
                  Product Inquiry
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        <Alert
          type="info"
          showIcon
          message="App-owned target editing"
          description="This screen is for setting Model, Max, and Reorder targets in the Zack's Retail inventory spine. It is designed for repetitive store-by-store edits without leaving the stock-maintenance workflow."
        />

        {!activeSku ? (
          <Card
            bordered={false}
            style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
          >
            <Empty description="Choose a SKU to edit replenishment targets across stores." />
          </Card>
        ) : null}

        {activeSku && error ? (
          <Alert
            type="error"
            showIcon
            message="Replenishment lookup failed"
            description={getErrorMessage(error, 'Unable to load replenishment targets.')}
          />
        ) : null}

        {activeSku && isLoading ? (
          <Card
            bordered={false}
            style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
          >
            <div style={{ textAlign: 'center', padding: 64 }}>
              <Spin size="large" />
            </div>
          </Card>
        ) : null}

        {activeSku && data ? (
          <TargetsContent data={data} metric={activeMetric} onMetricChange={handleMetricChange} />
        ) : null}

        <SkuLookup
          open={skuLookupOpen}
          onClose={() => setSkuLookupOpen(false)}
          onSelect={(picked) => {
            setSkuLookupOpen(false)
            setSkuInput(picked.skuCode)
            handleSearch(picked.skuCode)
          }}
          initialQuery={skuInput}
        />
      </Space>
    </App>
  )
}

function TargetsContent({
  data,
  metric,
  onMetricChange,
}: {
  data: ReplenishmentTargetRecord
  metric: TargetMetric
  onMetricChange: (metric: TargetMetric) => void
}) {
  const totals = useMemo(() => {
    let modelQty = 0
    let maxQty = 0
    let reorderQty = 0
    let onHand = 0
    let storesWithTargets = 0
    let shortStores = 0

    for (const store of data.stores) {
      let hasTarget = false
      let isShort = false
      for (const cell of store.cells) {
        modelQty += cell.modelQty
        maxQty += cell.maxQty
        reorderQty += cell.reorderQty
        onHand += cell.onHand
        if (cell.modelQty > 0 || cell.maxQty > 0 || cell.reorderQty > 0) hasTarget = true
        if (cell.modelQty > cell.onHand) isShort = true
      }
      if (hasTarget) storesWithTargets += 1
      if (isShort) shortStores += 1
    }

    return { modelQty, maxQty, reorderQty, onHand, storesWithTargets, shortStores }
  }, [data.stores])

  const activeTab = TABS.find((tab) => tab.value === metric) ?? TABS[0]!

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card
        bordered={false}
        style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={10}>
            <Typography.Text type="secondary" style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Current SKU
            </Typography.Text>
            <Typography.Title level={3} style={{ marginTop: 8, marginBottom: 6 }}>
              <SkuLink skuCode={data.skuCode} />
            </Typography.Title>
            <Typography.Paragraph style={{ marginBottom: 10 }}>
              {data.description ?? <Typography.Text type="secondary">(no description)</Typography.Text>}
            </Typography.Paragraph>
            <Space wrap>
              {data.brand ? <Tag color="blue">{data.brand}</Tag> : null}
              {data.vendorCode ? <Tag>{data.vendorCode}</Tag> : null}
              {data.categoryNumber != null ? <Tag color="geekblue">Category {data.categoryNumber}</Tag> : null}
              {data.season ? <Tag color="gold">Season {data.season}</Tag> : null}
            </Space>
          </Col>

          <Col xs={24} lg={14}>
            <Row gutter={[16, 16]}>
              <Col xs={12} md={8}>
                <Statistic title="Sigma on hand" value={totals.onHand} />
              </Col>
              <Col xs={12} md={8}>
                <Statistic title="Sigma model" value={totals.modelQty} />
              </Col>
              <Col xs={12} md={8}>
                <Statistic title="Stores w/ targets" value={totals.storesWithTargets} prefix={<ShopOutlined />} />
              </Col>
              <Col xs={12} md={8}>
                <Statistic title="Sigma max" value={totals.maxQty} />
              </Col>
              <Col xs={12} md={8}>
                <Statistic title="Sigma reorder" value={totals.reorderQty} />
              </Col>
              <Col xs={12} md={8}>
                <Statistic title="Stores below model" value={totals.shortStores} />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      <Card
        bordered={false}
        style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
        title={
          <Space wrap size={10}>
            <Typography.Text strong style={{ fontSize: 16 }}>
              {activeTab.label}
            </Typography.Text>
            <Tag color="cyan">Live editor</Tag>
            <Typography.Text type="secondary">{activeTab.hint}</Typography.Text>
          </Space>
        }
        extra={
          <Segmented<TargetMetric>
            options={TABS.map((tab) => ({ label: tab.label, value: tab.value }))}
            value={metric}
            onChange={(value) => onMetricChange(value as TargetMetric)}
          />
        }
      >
        {data.stores.length === 0 ? (
          <Empty description="No replenishment or stock rows are recorded for this SKU." />
        ) : (
          data.stores.map((store) => (
            <EditableStoreTargetGrid
              key={store.storeId}
              skuCode={data.skuCode}
              store={store}
              metric={metric}
              rowLabels={data.sizeGrid.rows}
              columnLabels={data.sizeGrid.columns}
            />
          ))
        )}
      </Card>
    </Space>
  )
}

function EditableStoreTargetGrid({
  skuCode,
  store,
  columnLabels,
  rowLabels,
  metric,
}: {
  skuCode: string
  store: ReplenishmentTargetStore
  columnLabels: string[]
  rowLabels: string[]
  metric: TargetMetric
}) {
  const { message } = App.useApp()
  const updateMutation = useUpdateReplenishmentTargetStore()

  const effectiveColumns = useMemo(() => {
    const labels = new Set(columnLabels)
    for (const cell of store.cells) labels.add(cell.columnLabel)
    const sorted = [...labels].sort(naturalLabelCompare)
    return sorted.length > 0 ? sorted : ['']
  }, [columnLabels, store.cells])

  const effectiveRows = useMemo(() => {
    const labels = new Set(rowLabels)
    for (const cell of store.cells) labels.add(cell.rowLabel)
    const sorted = [...labels].sort(naturalLabelCompare)
    return sorted.length > 0 ? sorted : ['']
  }, [rowLabels, store.cells])

  const [draftCells, setDraftCells] = useState<Record<string, DraftCell>>(() =>
    buildDraftCells(store, effectiveRows, effectiveColumns),
  )

  useEffect(() => {
    setDraftCells(buildDraftCells(store, effectiveRows, effectiveColumns))
  }, [store, effectiveRows, effectiveColumns])

  const baselinePayload = useMemo(
    () => JSON.stringify(draftPayloadFromCells(buildDraftCells(store, effectiveRows, effectiveColumns))),
    [store, effectiveRows, effectiveColumns],
  )
  const draftPayload = useMemo(() => JSON.stringify(draftPayloadFromCells(draftCells)), [draftCells])
  const dirty = baselinePayload !== draftPayload

  const storeLabel = store.storeLabel ? `${store.storeId} - ${store.storeLabel}` : `Store ${store.storeId}`
  const shortfall = useMemo(() => {
    return Object.values(draftCells).reduce((sum, cell) => sum + Math.max(0, cell.modelQty - cell.onHand), 0)
  }, [draftCells])
  const metricTotal = useMemo(() => {
    return Object.values(draftCells).reduce((sum, cell) => sum + (cell[metric] ?? 0), 0)
  }, [draftCells, metric])

  const handleChange = (rowLabel: string, columnLabel: string, nextValue: number | null) => {
    const key = cellKey(rowLabel, columnLabel)
    setDraftCells((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? {
          rowLabel,
          columnLabel,
          onHand: 0,
          modelQty: 0,
          maxQty: 0,
          reorderQty: 0,
        }),
        [metric]: Math.max(0, Math.trunc(nextValue ?? 0)),
      },
    }))
  }

  const handleReset = () => {
    setDraftCells(buildDraftCells(store, effectiveRows, effectiveColumns))
  }

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        skuCode,
        storeId: store.storeId,
        payload: draftPayloadFromCells(draftCells),
      })
      message.success(`Saved ${storeLabel}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to save replenishment targets.')
    }
  }

  const dataSource = effectiveRows.map((rowLabel) => ({
    key: rowLabel || '_',
    rowLabel,
  }))

  return (
    <Card
      size="small"
      style={{
        marginBottom: 16,
        borderRadius: 18,
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.05)',
      }}
      title={
        <Space wrap size={10}>
          <Typography.Text strong>{storeLabel}</Typography.Text>
          {dirty ? <Tag color="gold">Unsaved</Tag> : <Tag color="green">Saved</Tag>}
          {shortfall > 0 ? <Tag color="volcano">Below model {shortfall}</Tag> : <Tag color="cyan">At or above model</Tag>}
        </Space>
      }
      extra={
        <Space size="large" wrap>
          <Typography.Text type="secondary">On hand {store.totals.onHand}</Typography.Text>
          <Typography.Text type="secondary">{TABS.find((tab) => tab.value === metric)?.label} total {metricTotal}</Typography.Text>
          <Button icon={<ReloadOutlined />} onClick={handleReset} disabled={!dirty || updateMutation.isPending}>
            Reset
          </Button>
          <Button
            type="primary"
            onClick={handleSave}
            disabled={!dirty}
            loading={updateMutation.isPending}
          >
            Save
          </Button>
        </Space>
      }
    >
      <Table<{ key: string; rowLabel: string }>
        size="small"
        pagination={false}
        rowKey="key"
        scroll={{ x: true }}
        dataSource={dataSource}
        columns={[
          {
            title: 'Row',
            dataIndex: 'rowLabel',
            key: 'rowLabel',
            fixed: 'left',
            width: 80,
            render: (value: string) => value || <Typography.Text type="secondary">-</Typography.Text>,
          },
          ...effectiveColumns.map((columnLabel) => ({
            title: columnLabel || '-',
            key: columnLabel || '_blank',
            align: 'right' as const,
            render: (_: unknown, record: { rowLabel: string }) => {
              const cell = draftCells[cellKey(record.rowLabel, columnLabel)]
              const value = cell?.[metric] ?? 0
              const onHand = cell?.onHand ?? 0
              const short = metric === 'modelQty' && value > 0 && onHand < value
              return (
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <InputNumber
                    min={0}
                    precision={0}
                    value={value}
                    style={{ width: '100%' }}
                    onChange={(nextValue) => handleChange(record.rowLabel, columnLabel, nextValue)}
                  />
                  <Typography.Text type={short ? 'danger' : 'secondary'} style={{ fontSize: 11 }}>
                    OH {onHand}
                  </Typography.Text>
                </Space>
              )
            },
          })),
          {
            title: 'Sigma',
            key: '_sum',
            align: 'right' as const,
            fixed: 'right',
            width: 90,
            render: (_: unknown, record: { rowLabel: string }) => {
              const sum = effectiveColumns.reduce((acc, columnLabel) => {
                return acc + (draftCells[cellKey(record.rowLabel, columnLabel)]?.[metric] ?? 0)
              }, 0)
              return <strong>{sum}</strong>
            },
          },
        ]}
      />
    </Card>
  )
}
