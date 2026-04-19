import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Row,
  Space,
  Spin,
  Statistic,
  Steps,
  Table,
  Tag,
  Typography,
} from 'antd'
import { ThunderboltOutlined, CheckOutlined } from '@ant-design/icons'
import { useSkuStoreCellRollup } from '../../hooks/useRicsInventory'
import type {
  SkuStoreRollupParams,
  SkuStoreCellRow,
} from '../../services/ricsInventoryApi'
import { getErrorMessage } from '../../utils/errors'

// RICS Ch. 4 p. 76 — Generate Automatic Transfers. Replenishment from a
// warehouse store to target stores whose on-hand is below their Model.
// Phase 1 computes the preview per-cell against live RIINVQUA so operators
// see which sizes each line will ship. Commit is disabled until Phase 2.
interface WizardValues {
  warehouseStoreId: number
  targetStoreIds: string
  vendorCode?: string
  categoryMin?: number
  categoryMax?: number
  season?: string
  limit?: number
}

interface CellAllocation {
  rowLabel: string
  columnLabel: string
  quantity: number
  warehouseOnHand: number
  receiverOnHand: number
  receiverModel: number
}

interface AutoTransferLine {
  sku: string
  description: string | null
  brand: string | null
  vendorCode: string | null
  category: number | null
  season: string | null
  fromStore: number
  fromStoreName: string | null
  toStore: number
  toStoreName: string | null
  suggestedQuantity: number
  cells: CellAllocation[]
}

export default function AutoTransferPreviewPage() {
  const [form] = Form.useForm<WizardValues>()
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [rollupParams, setRollupParams] = useState<SkuStoreRollupParams | null>(null)
  const [committedSettings, setCommittedSettings] = useState<WizardValues | null>(null)

  const { data, isLoading, isFetching, error } = useSkuStoreCellRollup(rollupParams)

  const handleCompute = async () => {
    try {
      const v = await form.validateFields()
      setCommittedSettings(v)
      const targetStoreIds = v.targetStoreIds
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n))
      const allStores = [Number(v.warehouseStoreId), ...targetStoreIds]
      setRollupParams({
        storeNumbers: allStores,
        vendorCode: v.vendorCode?.trim() || undefined,
        categoryMin: v.categoryMin,
        categoryMax: v.categoryMax,
        season: v.season?.trim() || undefined,
        limit: v.limit ?? 500,
      })
      setStep(2)
    } catch {
      // validation error; antd shows messages
    }
  }

  const previewLines = useMemo<AutoTransferLine[]>(() => {
    if (!data || !committedSettings) return []
    return computeAutoTransferLines(data.rows, committedSettings)
  }, [data, committedSettings])

  const summary = useMemo(() => {
    const skus = new Set(previewLines.map((l) => l.sku))
    const receivers = new Set(previewLines.map((l) => l.toStore))
    const units = previewLines.reduce((acc, l) => acc + l.suggestedQuantity, 0)
    return { suggestions: previewLines.length, skus: skus.size, receivers: receivers.size, units }
  }, [previewLines])

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Auto Transfer — Preview
        </Typography.Title>
        <Typography.Text type="secondary">
          RICS Ch. 4 p. 76 — generate warehouse-to-store replenishment based on Model quantities
        </Typography.Text>
        <Steps
          current={step}
          style={{ marginTop: 16 }}
          items={[
            { title: 'Warehouse + targets' },
            { title: 'Criteria' },
            { title: 'Preview + commit' },
          ]}
        />
      </Card>

      <Alert
        type="info"
        showIcon
        message="Preview only (Phase 1)"
        description="Reads live RIINVQUA per-cell. Each line shows the sizes that would ship. Commit enables in Phase 2 with the Postgres Transfer ledger."
      />

      <Card>
        <Form<WizardValues>
          form={form}
          layout="vertical"
          initialValues={{ limit: 50000 }}
          onValuesChange={() => {
            if (step === 2) {
              setStep(1)
              setRollupParams(null)
            }
          }}
        >
          <Row gutter={16}>
            <Col xs={12} md={4}>
              <Form.Item
                label="Warehouse Store #"
                name="warehouseStoreId"
                rules={[{ required: true, message: 'Warehouse store required' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} placeholder="e.g. 99" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                label="Target Store #s (comma-separated)"
                name="targetStoreIds"
                rules={[{ required: true, message: 'At least one target store' }]}
              >
                <Input placeholder="e.g. 1,2,5,14" />
              </Form.Item>
            </Col>
            <Col xs={12} md={3}>
              <Form.Item label="Vendor" name="vendorCode">
                <Input placeholder="All" />
              </Form.Item>
            </Col>
            <Col xs={12} md={3}>
              <Form.Item label="Cat Min" name="categoryMin">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={3}>
              <Form.Item label="Cat Max" name="categoryMax">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={3}>
              <Form.Item label="Season" name="season">
                <Input maxLength={4} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={12} md={5}>
              <Form.Item
                label="SKU safety cap"
                name="limit"
                tooltip="Upper bound, not a scope limit. Your vendor / category / season filters decide what's scanned. Raise this only if your filtered SKU set genuinely exceeds 50 000."
              >
                <InputNumber min={100} max={200000} step={1000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Space>
            <Button type="primary" icon={<ThunderboltOutlined />} loading={isFetching} onClick={handleCompute}>
              Compute preview
            </Button>
            <Button disabled icon={<CheckOutlined />}>Commit (Phase 2)</Button>
          </Space>
        </Form>
      </Card>

      {error && !data && (
        <Alert
          type="error"
          showIcon
          message="Preview failed"
          description={getErrorMessage(error, 'Unable to compute preview.')}
        />
      )}
      {error && data && (
        <Alert
          type="warning"
          showIcon
          message="Last refresh failed — showing previous scan"
          description={`${getErrorMessage(error, 'Refresh errored.')} Click Compute preview to retry.`}
          closable
        />
      )}

      {step === 2 && rollupParams && isLoading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
            <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
              Scanning every SKU that matches your filters across {rollupParams.storeNumbers?.length ?? '?'} stores, cell-by-cell. The RICS read is chunked 100 SKUs per query — a full-catalog run may take a minute or two.
            </Typography.Paragraph>
          </div>
        </Card>
      )}

      {step === 2 && data && rollupParams && (() => {
        const uniqueSkus = new Set(data.rows.map((r) => r.sku)).size
        const cap = rollupParams.limit ?? 50000
        if (uniqueSkus < cap) return null
        return (
          <Alert
            type="warning"
            showIcon
            message={`Scan hit the safety cap at ${cap.toLocaleString()} SKUs`}
            description="Results may be truncated. Narrow filters (vendor / category / season) or raise the SKU safety cap."
          />
        )
      })()}

      {step === 2 && data && (
        <>
          <Row gutter={16}>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Proposed lines" value={summary.suggestions} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="SKUs" value={summary.skus} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Receiver stores" value={summary.receivers} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Units" value={summary.units} />
              </Card>
            </Col>
          </Row>

          {summary.suggestions === 0 ? (
            <Card>
              <Empty description="No shortfalls detected. Ensure target stores have Model values set and the warehouse has stock in those cells." />
            </Card>
          ) : (
            <Card>
              <Table<AutoTransferLine>
                size="small"
                rowKey={(r) => `${r.sku}-${r.fromStore}-${r.toStore}`}
                dataSource={previewLines}
                pagination={{ pageSize: 50, showSizeChanger: true }}
                scroll={{ x: 1500 }}
                columns={[
                  {
                    title: 'SKU',
                    dataIndex: 'sku',
                    key: 'sku',
                    width: 140,
                    fixed: 'left',
                    sorter: (a, b) => a.sku.localeCompare(b.sku),
                    defaultSortOrder: 'ascend',
                  },
                  {
                    title: 'Description',
                    dataIndex: 'description',
                    key: 'description',
                    ellipsis: true,
                    width: 200,
                    sorter: (a, b) => (a.description ?? '').localeCompare(b.description ?? ''),
                  },
                  {
                    title: 'Brand / Vendor',
                    key: 'brand',
                    width: 120,
                    sorter: (a, b) => (a.brand ?? '').localeCompare(b.brand ?? ''),
                    render: (_, r) => (r.brand ? <Tag>{r.brand}</Tag> : '—'),
                  },
                  {
                    title: 'Category',
                    dataIndex: 'category',
                    key: 'category',
                    width: 90,
                    align: 'right',
                    sorter: (a, b) => (a.category ?? 0) - (b.category ?? 0),
                    render: (v: number | null) => (v != null ? v : '—'),
                  },
                  {
                    title: 'Season',
                    dataIndex: 'season',
                    key: 'season',
                    width: 80,
                    sorter: (a, b) => (a.season ?? '').localeCompare(b.season ?? ''),
                    render: (v: string | null) => (v ? <Tag color="gold">{v}</Tag> : '—'),
                  },
                  {
                    title: 'From (Warehouse)',
                    key: 'from',
                    width: 180,
                    sorter: (a, b) => a.fromStore - b.fromStore,
                    render: (_, r) =>
                      r.fromStoreName ? `${r.fromStore} — ${r.fromStoreName}` : String(r.fromStore),
                  },
                  {
                    title: 'To',
                    key: 'to',
                    width: 180,
                    sorter: (a, b) => a.toStore - b.toStore,
                    render: (_, r) =>
                      r.toStoreName ? `${r.toStore} — ${r.toStoreName}` : String(r.toStore),
                  },
                  {
                    title: 'Qty',
                    dataIndex: 'suggestedQuantity',
                    key: 'suggestedQuantity',
                    align: 'right',
                    width: 70,
                    sorter: (a, b) => a.suggestedQuantity - b.suggestedQuantity,
                    render: (v: number) => <strong>{v}</strong>,
                  },
                  {
                    title: 'Sizes (row-col: qty)',
                    key: 'cells',
                    width: 320,
                    render: (_, r) => (
                      <Space wrap size={[4, 4]}>
                        {r.cells.map((c) => (
                          <Tag
                            key={`${c.rowLabel}|${c.columnLabel}`}
                            color={c.quantity > c.warehouseOnHand ? 'red' : 'blue'}
                          >
                            {[c.rowLabel, c.columnLabel].filter(Boolean).join('-') || '(qty)'}:{' '}
                            {c.quantity}
                          </Tag>
                        ))}
                      </Space>
                    ),
                  },
                ]}
              />
            </Card>
          )}
        </>
      )}
    </Space>
  )
}

/**
 * Per-cell allocation from the (SKU × Store × Row × Column) rollup. For every
 * target store and every cell short of its Model, pull units from the
 * warehouse's matching cell until the warehouse cell is drained or the
 * shortfall is filled. Does NOT cross sizes — a warehouse short in size M
 * cannot replenish a receiver's size L.
 */
function computeAutoTransferLines(
  rows: SkuStoreCellRow[],
  settings: WizardValues,
): AutoTransferLine[] {
  const warehouseId = Number(settings.warehouseStoreId)
  const targetIds = new Set(
    settings.targetStoreIds
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n)),
  )

  // Index: sku -> store -> cellKey -> SkuStoreCellRow
  type CellMap = Map<string, SkuStoreCellRow>
  const bySku = new Map<string, Map<number, CellMap>>()
  for (const r of rows) {
    const byStore = bySku.get(r.sku) ?? new Map<number, CellMap>()
    const cells = byStore.get(r.store) ?? new Map<string, SkuStoreCellRow>()
    cells.set(`${r.rowLabel}|${r.columnLabel}`, r)
    byStore.set(r.store, cells)
    bySku.set(r.sku, byStore)
  }

  // Aggregate output per (SKU × toStore)
  const linesByKey = new Map<string, AutoTransferLine>()

  for (const [sku, byStore] of bySku) {
    const warehouseCells = byStore.get(warehouseId)
    if (!warehouseCells) continue

    // Seed metadata from any row for this SKU.
    const seedRow = rows.find((r) => r.sku === sku)
    if (!seedRow) continue

    // Working copy of warehouse on-hand per cell (we decrement as we allocate).
    const warehouseWorking = new Map<string, number>()
    for (const [k, c] of warehouseCells) warehouseWorking.set(k, c.onHand)

    for (const [storeId, recvCells] of byStore) {
      if (storeId === warehouseId) continue
      if (!targetIds.has(storeId)) continue
      for (const [cellKey, recvCell] of recvCells) {
        const need = recvCell.model - recvCell.onHand
        if (need <= 0) continue
        const warehouseCell = warehouseCells.get(cellKey)
        if (!warehouseCell) continue
        const remaining = warehouseWorking.get(cellKey) ?? 0
        if (remaining <= 0) continue
        const move = Math.min(need, remaining)
        if (move <= 0) continue

        const lineKey = `${sku}-${warehouseId}-${storeId}`
        const existing = linesByKey.get(lineKey) ?? {
          sku,
          description: seedRow.description,
          brand: seedRow.brand,
          vendorCode: seedRow.vendorCode,
          category: seedRow.category,
          season: seedRow.season,
          fromStore: warehouseId,
          fromStoreName: warehouseCell.storeName,
          toStore: storeId,
          toStoreName: recvCell.storeName,
          suggestedQuantity: 0,
          cells: [] as CellAllocation[],
        }
        existing.cells.push({
          rowLabel: recvCell.rowLabel,
          columnLabel: recvCell.columnLabel,
          quantity: move,
          warehouseOnHand: warehouseCell.onHand,
          receiverOnHand: recvCell.onHand,
          receiverModel: recvCell.model,
        })
        existing.suggestedQuantity += move
        linesByKey.set(lineKey, existing)
        warehouseWorking.set(cellKey, remaining - move)
      }
    }
  }

  const out = [...linesByKey.values()]
  // Primary: alphabetical by SKU. Column sorters let the operator change order.
  out.sort((a, b) => a.sku.localeCompare(b.sku))
  // Stabilize per-SKU by from/to.
  for (const line of out) {
    line.cells.sort(
      (a, b) =>
        a.rowLabel.localeCompare(b.rowLabel) || a.columnLabel.localeCompare(b.columnLabel),
    )
  }
  return out
}
