import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Alert,
  Card,
  Col,
  Empty,
  Input,
  Row,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import { SearchOutlined, ShopOutlined } from '@ant-design/icons'
import { useInventoryInquiry } from '../../hooks/useRicsInventory'
import type {
  InventoryCell,
  InventoryInquiry,
  InventoryInquiryStore,
} from '../../services/ricsInventoryApi'
import { getErrorMessage } from '../../utils/errors'

// RICS Ch. 4 p. 68 — Replenishment Targets (Model / Max / Reorder).
// Per (SKU × Store × Row × Column) cell, stores the desired on-hand (Model),
// the ceiling used to compute shortfall (Max), and the multiple Auto POs
// should round up to (Reorder). This page reads the existing RIINVQUA cells
// via the Inventory Inquiry endpoint and projects just those three values.
// Writes are disabled — phase-2 work lands a dedicated editor backed by Postgres.
type TargetMetric = 'model' | 'maxQty' | 'reorder'

interface TabOption {
  value: TargetMetric
  label: string
  hint: string
}

const TABS: TabOption[] = [
  { value: 'model', label: 'Model', hint: 'Desired on-hand per size/store (p. 68)' },
  { value: 'maxQty', label: 'Max', hint: 'Ceiling used when computing shortfall' },
  { value: 'reorder', label: 'Reorder', hint: 'Rounding multiple for Automatic POs' },
]

export default function ReplenishmentTargetsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const skuFromUrl = searchParams.get('sku')?.trim() || ''
  const metricFromUrl = (searchParams.get('metric') as TargetMetric) || 'model'
  const [skuInput, setSkuInput] = useState(skuFromUrl)

  const activeSku = skuFromUrl || null
  const activeMetric: TargetMetric = TABS.some((t) => t.value === metricFromUrl)
    ? metricFromUrl
    : 'model'
  const { data, isLoading, isFetching, error } = useInventoryInquiry(activeSku)

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
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Row align="middle" gutter={16}>
          <Col flex="auto">
            <Typography.Title level={4} style={{ margin: 0 }}>
              Replenishment Targets
            </Typography.Title>
            <Typography.Text type="secondary">
              RICS Ch. 4 p. 68 — Model / Max / Reorder per (SKU × Store × size)
            </Typography.Text>
          </Col>
          <Col flex="360px">
            <Input.Search
              placeholder="Enter SKU (e.g. 349101-BKPT)"
              prefix={<SearchOutlined />}
              allowClear
              enterButton="Search"
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value)}
              onSearch={handleSearch}
              loading={isFetching}
            />
          </Col>
        </Row>
      </Card>

      <Alert
        type="info"
        showIcon
        message="Read-only view (Phase 1)"
        description="Model / Max / Reorder are read live from RICS (RIINVQUA). Editing will land in Phase 2 when replenishment targets move to Postgres."
      />

      {!activeSku && (
        <Card>
          <Empty description="Enter a SKU to view its replenishment targets across every store." />
        </Card>
      )}

      {activeSku && error && (
        <Alert
          type="error"
          showIcon
          message="Replenishment lookup failed"
          description={getErrorMessage(error, 'Unable to load replenishment targets.')}
        />
      )}

      {activeSku && isLoading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        </Card>
      )}

      {activeSku && data && (
        <TargetsContent data={data} metric={activeMetric} onMetricChange={handleMetricChange} />
      )}
    </Space>
  )
}

function TargetsContent({
  data,
  metric,
  onMetricChange,
}: {
  data: InventoryInquiry
  metric: TargetMetric
  onMetricChange: (m: TargetMetric) => void
}) {
  const { master, stores } = data

  const totals = useMemo(() => {
    let model = 0
    let max = 0
    let reorder = 0
    let onHand = 0
    let storesWithTargets = 0
    for (const s of stores) {
      let hasTarget = false
      for (const c of s.cells) {
        model += c.model
        max += c.maxQty
        reorder += c.reorder
        onHand += c.onHand
        if (c.model > 0 || c.maxQty > 0 || c.reorder > 0) hasTarget = true
      }
      if (hasTarget) storesWithTargets += 1
    }
    return { model, max, reorder, onHand, storesWithTargets }
  }, [stores])

  const activeTab = TABS.find((t) => t.value === metric) ?? TABS[0]

  return (
    <>
      <Card>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <Typography.Title level={4} style={{ marginTop: 0 }}>
              {data.sku}
            </Typography.Title>
            <Typography.Paragraph style={{ marginBottom: 8 }}>
              {master.description || (
                <Typography.Text type="secondary">(no description)</Typography.Text>
              )}
            </Typography.Paragraph>
            <Space wrap>
              {master.brand && <Tag color="blue">{master.brand}</Tag>}
              {master.vendorCode && <Tag>{master.vendorCode}</Tag>}
              {master.season && <Tag color="gold">Season {master.season}</Tag>}
              {master.sizeType.desc && <Tag color="purple">{master.sizeType.desc}</Tag>}
            </Space>
          </Col>
          <Col xs={24} lg={10}>
            <Row gutter={[16, 16]}>
              <Col xs={12} md={6}>
                <Statistic title="Σ Model" value={totals.model} />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title="Σ Max" value={totals.max} />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title="Σ Reorder" value={totals.reorder} />
              </Col>
              <Col xs={12} md={6}>
                <Statistic
                  title="Stores w/ targets"
                  value={totals.storesWithTargets}
                  prefix={<ShopOutlined />}
                />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      <Card
        size="small"
        title={
          <Space>
            <Typography.Text strong>{activeTab.label}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontWeight: 'normal' }}>
              {activeTab.hint}
            </Typography.Text>
          </Space>
        }
        extra={
          <Segmented<TargetMetric>
            options={TABS.map((t) => ({ label: t.label, value: t.value }))}
            value={metric}
            onChange={(v) => onMetricChange(v as TargetMetric)}
          />
        }
      >
        {stores.length === 0 ? (
          <Empty description="No replenishment data recorded for this SKU across any store." />
        ) : (
          stores.map((store) => (
            <StoreTargetGrid
              key={store.storeNumber}
              store={store}
              columnLabels={master.sizeType.columnLabels}
              metric={metric}
            />
          ))
        )}
      </Card>
    </>
  )
}

function StoreTargetGrid({
  store,
  columnLabels,
  metric,
}: {
  store: InventoryInquiryStore
  columnLabels: string[]
  metric: TargetMetric
}) {
  const cellsByRow = useMemo(() => {
    const byRow = new Map<string, Map<string, InventoryCell>>()
    for (const c of store.cells) {
      const row = byRow.get(c.rowLabel) ?? new Map<string, InventoryCell>()
      row.set(c.columnLabel, c)
      byRow.set(c.rowLabel, row)
    }
    return byRow
  }, [store.cells])

  const rowLabels = [...cellsByRow.keys()]

  const columnsShown = useMemo(() => {
    const present = new Set<string>()
    for (const c of store.cells) present.add(c.columnLabel)
    const base = columnLabels.length ? columnLabels : [...present]
    return base.filter((c) => present.has(c))
  }, [columnLabels, store.cells])

  const storeLabel = store.storeName
    ? `${store.storeNumber} — ${store.storeName}`
    : `Store ${store.storeNumber}`

  const storeTargetSum = useMemo(() => {
    let sum = 0
    for (const c of store.cells) sum += c[metric]
    return sum
  }, [store.cells, metric])

  if (storeTargetSum === 0) {
    return (
      <Card size="small" style={{ marginBottom: 12 }} title={storeLabel}>
        <Typography.Text type="secondary">
          No {metric === 'model' ? 'Model' : metric === 'maxQty' ? 'Max' : 'Reorder'} values set
          for this store.
        </Typography.Text>
      </Card>
    )
  }

  const columns = [
    {
      title: 'Row',
      dataIndex: 'rowLabel',
      key: 'rowLabel',
      fixed: 'left' as const,
      width: 80,
      render: (v: string) => v || <Typography.Text type="secondary">—</Typography.Text>,
    },
    ...columnsShown.map((col) => ({
      title: col,
      key: col,
      align: 'right' as const,
      render: (_: unknown, rec: { values: Record<string, number>; onHand: Record<string, number> }) => {
        const v = rec.values[col] ?? 0
        const oh = rec.onHand[col] ?? 0
        if (v === 0) return <Typography.Text type="secondary">0</Typography.Text>
        // For Model: tint red when on-hand is below target, green when at/above.
        if (metric === 'model' && v > 0) {
          const short = oh < v
          return (
            <Typography.Text
              style={{ color: short ? '#cf1322' : '#389e0d', fontWeight: short ? 600 : 400 }}
            >
              {v}
              <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                ({oh})
              </Typography.Text>
            </Typography.Text>
          )
        }
        return <strong>{v}</strong>
      },
    })),
    {
      title: 'Σ',
      key: '_sum',
      align: 'right' as const,
      fixed: 'right' as const,
      width: 72,
      render: (_: unknown, rec: { values: Record<string, number> }) => {
        const sum = Object.values(rec.values).reduce((a, b) => a + b, 0)
        return <strong>{sum}</strong>
      },
    },
  ]

  const dataSource = rowLabels.map((rowLabel) => {
    const row = cellsByRow.get(rowLabel) ?? new Map<string, InventoryCell>()
    const values: Record<string, number> = {}
    const onHand: Record<string, number> = {}
    for (const col of columnsShown) {
      values[col] = row.get(col)?.[metric] ?? 0
      onHand[col] = row.get(col)?.onHand ?? 0
    }
    return { rowLabel, values, onHand, key: rowLabel || '_' }
  })

  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      title={storeLabel}
      extra={
        <Typography.Text>
          Σ {TABS.find((t) => t.value === metric)?.label}: <strong>{storeTargetSum}</strong>
          {metric === 'model' && (
            <Typography.Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
              (green = on-hand meets model, red = short; value in parens = on-hand)
            </Typography.Text>
          )}
        </Typography.Text>
      }
    >
      <Table
        size="small"
        columns={columns}
        dataSource={dataSource}
        rowKey="key"
        pagination={false}
        scroll={{ x: 80 + columnsShown.length * 72 + 72 }}
      />
    </Card>
  )
}
