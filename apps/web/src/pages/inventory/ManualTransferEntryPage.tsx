import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import { SearchOutlined, CheckOutlined, SwapOutlined } from '@ant-design/icons'
import { useInventoryInquiry } from '../../hooks/useRicsInventory'
import type {
  InventoryCell,
  InventoryInquiry,
  InventoryInquiryStore,
} from '../../services/ricsInventoryApi'
import { getErrorMessage } from '../../utils/errors'
import { SkuLink } from '../../components/sku-link'

// RICS Ch. 4 p. 76 — Enter Manual Transfers. Scaffold: From + To store,
// SKU, per-cell quantity grid driven by live Inquiry data. Commit is
// disabled until Phase 2 supplies the Transfer write path (new Prisma
// schema + background job). The entry UX still works end-to-end as a
// preview / validator against the donor's actual on-hand.
interface DraftLine {
  key: string // `${sku}|${storeFrom}|${storeTo}` to identify an entry in the queue
  sku: string
  description: string | null
  fromStore: number
  fromStoreName: string | null
  toStore: number
  toStoreName: string | null
  cells: Array<{ rowLabel: string; columnLabel: string; quantity: number; donorOnHand: number }>
  totalQty: number
}

export default function ManualTransferEntryPage() {
  const [fromStore, setFromStore] = useState<number | null>(null)
  const [toStore, setToStore] = useState<number | null>(null)
  const [skuInput, setSkuInput] = useState('')
  const [activeSku, setActiveSku] = useState<string | null>(null)
  // Edit buffer for current SKU. Keyed by `${rowLabel}|${columnLabel}`.
  const [buffer, setBuffer] = useState<Map<string, number>>(new Map())
  const [queue, setQueue] = useState<DraftLine[]>([])

  const { data, isLoading, isFetching, error } = useInventoryInquiry(activeSku)

  const donor = useMemo<InventoryInquiryStore | null>(() => {
    if (!data || !fromStore) return null
    return data.stores.find((s) => s.storeNumber === fromStore) ?? null
  }, [data, fromStore])

  const receiver = useMemo<InventoryInquiryStore | null>(() => {
    if (!data || !toStore) return null
    return data.stores.find((s) => s.storeNumber === toStore) ?? null
  }, [data, toStore])

  const columnsShown = useMemo<string[]>(() => {
    if (!data) return []
    const labels = data.master.sizeType.columnLabels
    if (!labels.length) {
      // Quantity-only SKU — a single virtual column.
      return ['']
    }
    const present = new Set<string>()
    for (const c of donor?.cells ?? data.stores.flatMap((s) => s.cells)) {
      present.add(c.columnLabel)
    }
    return labels.filter((l) => present.has(l))
  }, [data, donor])

  const rowsShown = useMemo<string[]>(() => {
    if (!data) return []
    const cells = donor?.cells ?? data.stores.flatMap((s) => s.cells)
    const rows = new Set<string>()
    for (const c of cells) rows.add(c.rowLabel)
    return [...rows]
  }, [data, donor])

  const loadSku = (val: string) => {
    const trimmed = val.trim()
    if (!trimmed) return
    setActiveSku(trimmed)
    setBuffer(new Map())
  }

  const cellKey = (row: string, col: string) => `${row}|${col}`

  const addLineToQueue = () => {
    if (!data || !fromStore || !toStore || !activeSku) return
    if (fromStore === toStore) return
    const filled: DraftLine['cells'] = []
    let total = 0
    for (const [key, qty] of buffer.entries()) {
      if (qty <= 0) continue
      const [rowLabel, columnLabel] = key.split('|')
      const donorCell = donor?.cells.find(
        (c) => c.rowLabel === rowLabel && c.columnLabel === columnLabel,
      )
      const donorOnHand = donorCell?.onHand ?? 0
      filled.push({ rowLabel, columnLabel, quantity: qty, donorOnHand })
      total += qty
    }
    if (total === 0) return
    const line: DraftLine = {
      key: `${activeSku}|${fromStore}|${toStore}`,
      sku: activeSku,
      description: data.master.description,
      fromStore,
      fromStoreName: donor?.storeName ?? null,
      toStore,
      toStoreName: receiver?.storeName ?? null,
      cells: filled,
      totalQty: total,
    }
    setQueue((q) => {
      const without = q.filter((l) => l.key !== line.key)
      return [line, ...without]
    })
    setActiveSku(null)
    setSkuInput('')
    setBuffer(new Map())
  }

  const removeFromQueue = (key: string) => {
    setQueue((q) => q.filter((l) => l.key !== key))
  }

  const totalQueued = queue.reduce((a, l) => a + l.totalQty, 0)
  const violations = queue.flatMap((l) =>
    l.cells.filter((c) => c.quantity > c.donorOnHand).map((c) => ({ line: l, cell: c })),
  )

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Manual Transfer — Entry
        </Typography.Title>
        <Typography.Text type="secondary">
          RICS Ch. 4 p. 76 — enter a per-SKU × per-size transfer from one store to another
        </Typography.Text>
        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col xs={12} md={4}>
            <Typography.Text strong>From Store #</Typography.Text>
            <InputNumber
              min={1}
              value={fromStore ?? undefined}
              onChange={(v) => setFromStore(v != null ? Number(v) : null)}
              style={{ width: '100%', marginTop: 4 }}
              placeholder="Donor"
            />
          </Col>
          <Col xs={12} md={4}>
            <Typography.Text strong>To Store #</Typography.Text>
            <InputNumber
              min={1}
              value={toStore ?? undefined}
              onChange={(v) => setToStore(v != null ? Number(v) : null)}
              style={{ width: '100%', marginTop: 4 }}
              placeholder="Receiver"
            />
          </Col>
          <Col xs={24} md={10}>
            <Typography.Text strong>SKU</Typography.Text>
            <Input.Search
              placeholder="Enter SKU to load cell grid"
              prefix={<SearchOutlined />}
              enterButton="Load"
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value)}
              onSearch={loadSku}
              style={{ marginTop: 4 }}
              loading={isFetching}
            />
          </Col>
        </Row>
      </Card>

      <Alert
        type="info"
        showIcon
        message="Phase 1 — entry + validation only"
        description="The grid reads live donor on-hand from RIINVQUA and validates per-cell quantities. Commit is disabled until Phase 2 ships the Transfer write path."
      />

      {error && (
        <Alert
          type="error"
          showIcon
          message="SKU lookup failed"
          description={getErrorMessage(error, 'Unable to load SKU.')}
        />
      )}

      {activeSku && isLoading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        </Card>
      )}

      {activeSku && data && !fromStore && (
        <Alert
          type="warning"
          showIcon
          message="Pick a donor store first"
          description="Enter the From Store # so we can show you its on-hand for this SKU."
        />
      )}

      {activeSku && data && fromStore && !donor && (
        <Alert
          type="warning"
          showIcon
          message={`No RIINVQUA rows for store ${fromStore}`}
          description="The donor store has no ledger entries for this SKU — nothing to transfer."
        />
      )}

      {activeSku && data && donor && fromStore === toStore && (
        <Alert type="error" showIcon message="From and To must differ" />
      )}

      {activeSku && data && donor && fromStore && toStore && fromStore !== toStore && (
        <SkuGridEntry
          data={data}
          donor={donor}
          receiver={receiver}
          rows={rowsShown}
          cols={columnsShown}
          buffer={buffer}
          onChange={(row, col, qty) => {
            setBuffer((prev) => {
              const next = new Map(prev)
              next.set(cellKey(row, col), qty)
              return next
            })
          }}
          onAdd={addLineToQueue}
        />
      )}

      <Card
        size="small"
        title={
          <Space>
            <Typography.Text strong>Draft queue</Typography.Text>
            <Tag>{queue.length} lines</Tag>
            <Tag color="blue">{totalQueued} units</Tag>
            {violations.length > 0 && <Tag color="red">{violations.length} over donor on-hand</Tag>}
          </Space>
        }
        extra={
          <Space>
            <Button type="primary" icon={<CheckOutlined />} disabled>
              Commit (Phase 2)
            </Button>
            <Button danger onClick={() => setQueue([])} disabled={queue.length === 0}>
              Clear queue
            </Button>
          </Space>
        }
      >
        {queue.length === 0 ? (
          <Empty description="Enter a SKU, fill quantities, and click Add to queue." />
        ) : (
          <Table<DraftLine>
            size="small"
            dataSource={queue}
            rowKey="key"
            pagination={false}
            columns={[
              { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140, render: (sku: string) => <SkuLink skuCode={sku} /> },
              { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
              {
                title: 'From → To',
                key: 'route',
                render: (_, r) => (
                  <Space>
                    <Tag>{r.fromStoreName ? `${r.fromStore} — ${r.fromStoreName}` : r.fromStore}</Tag>
                    <SwapOutlined />
                    <Tag color="blue">{r.toStoreName ? `${r.toStore} — ${r.toStoreName}` : r.toStore}</Tag>
                  </Space>
                ),
              },
              {
                title: 'Cells',
                key: 'cells',
                render: (_, r) =>
                  r.cells.map((c) => (
                    <Tag
                      key={`${c.rowLabel}|${c.columnLabel}`}
                      color={c.quantity > c.donorOnHand ? 'red' : 'default'}
                    >
                      {c.rowLabel ? `${c.rowLabel} ` : ''}
                      {c.columnLabel || '(qty)'}: {c.quantity}
                      {c.quantity > c.donorOnHand && ` / OH ${c.donorOnHand}`}
                    </Tag>
                  )),
              },
              {
                title: 'Total',
                dataIndex: 'totalQty',
                key: 'totalQty',
                align: 'right',
                width: 80,
                render: (v: number) => <strong>{v}</strong>,
              },
              {
                title: 'Actions',
                key: 'actions',
                width: 90,
                render: (_, r) => (
                  <Button type="link" danger onClick={() => removeFromQueue(r.key)}>
                    Remove
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
    </Space>
  )
}

function SkuGridEntry({
  data,
  donor,
  receiver,
  rows,
  cols,
  buffer,
  onChange,
  onAdd,
}: {
  data: InventoryInquiry
  donor: InventoryInquiryStore
  receiver: InventoryInquiryStore | null
  rows: string[]
  cols: string[]
  buffer: Map<string, number>
  onChange: (row: string, col: string, qty: number) => void
  onAdd: () => void
}) {
  const donorCellMap = useMemo(() => {
    const m = new Map<string, InventoryCell>()
    for (const c of donor.cells) m.set(`${c.rowLabel}|${c.columnLabel}`, c)
    return m
  }, [donor])

  const totalQueued = [...buffer.values()].reduce((a, b) => a + b, 0)
  const hasViolation = [...buffer.entries()].some(([key, qty]) => {
    const [row, col] = key.split('|')
    const oh = donorCellMap.get(`${row}|${col}`)?.onHand ?? 0
    return qty > oh
  })

  return (
    <Card
      size="small"
      title={
        <Space size="large">
          <SkuLink skuCode={data.sku} />
          <Typography.Text type="secondary">
            {data.master.description ?? '(no description)'}
          </Typography.Text>
        </Space>
      }
      extra={
        <Space>
          <Statistic
            title="Queued units"
            value={totalQueued}
            valueStyle={{ fontSize: 16, color: hasViolation ? '#cf1322' : undefined }}
          />
          <Button
            type="primary"
            icon={<SwapOutlined />}
            disabled={totalQueued === 0 || hasViolation}
            onClick={onAdd}
          >
            Add to queue
          </Button>
        </Space>
      }
    >
      <Descriptions size="small" column={3} style={{ marginBottom: 12 }}>
        <Descriptions.Item label="Donor on-hand">{donor.totals.onHand}</Descriptions.Item>
        <Descriptions.Item label="Receiver on-hand">
          {receiver ? receiver.totals.onHand : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Size Type">
          {data.master.sizeType.desc ?? 'qty-only'}
        </Descriptions.Item>
      </Descriptions>

      {rows.map((row) => (
        <div key={row || '_'} style={{ marginBottom: 12 }}>
          {row && (
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              Row: {row}
            </Typography.Text>
          )}
          <Table
            size="small"
            pagination={false}
            rowKey={(r) => `${(r as { label: string }).label}-${row}`}
            columns={[
              {
                title: row ? `Size (${row})` : 'Metric',
                dataIndex: 'label',
                key: 'label',
                fixed: 'left',
                width: 160,
                render: (v: string, r: { emphasize?: boolean }) =>
                  r.emphasize ? <strong>{v}</strong> : v,
              },
              ...cols.map((col) => ({
                title: col || '(qty)',
                key: col || '_',
                align: 'right' as const,
                render: (_: unknown, rec: { rowType: 'donor' | 'receiver' | 'entry' }) => {
                  const key = `${row}|${col}`
                  const donorCell = donorCellMap.get(key)
                  const donorOh = donorCell?.onHand ?? 0
                  const receiverCell = receiver?.cells.find(
                    (c) => c.rowLabel === row && c.columnLabel === col,
                  )
                  const receiverOh = receiverCell?.onHand ?? 0
                  if (rec.rowType === 'donor') {
                    return (
                      <Typography.Text type={donorOh === 0 ? 'secondary' : undefined}>
                        {donorOh}
                      </Typography.Text>
                    )
                  }
                  if (rec.rowType === 'receiver') {
                    return (
                      <Typography.Text type={receiverOh === 0 ? 'secondary' : undefined}>
                        {receiverOh}
                      </Typography.Text>
                    )
                  }
                  // Entry row
                  const val = buffer.get(key) ?? 0
                  const over = val > donorOh
                  return (
                    <InputNumber
                      min={0}
                      max={donorOh}
                      value={val || undefined}
                      onChange={(v) => onChange(row, col, v != null ? Number(v) : 0)}
                      size="small"
                      style={{ width: 70, borderColor: over ? '#cf1322' : undefined }}
                      disabled={donorOh === 0}
                    />
                  )
                },
              })),
            ]}
            dataSource={[
              { label: 'Donor OH', rowType: 'donor', emphasize: true },
              { label: 'Receiver OH', rowType: 'receiver' },
              { label: 'Transfer qty', rowType: 'entry', emphasize: true },
            ]}
          />
        </div>
      ))}
    </Card>
  )
}
