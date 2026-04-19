import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Radio,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  ScanOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  MOCK_OPEN_POS,
  MOCK_SKUS,
  MOCK_STORES,
  MOCK_VENDORS,
  SIZE_TYPES,
  cellKey,
} from '../../mock/purchasingSpec'
import type {
  MockOpenPo,
  MockOpenPoLine,
  ReceiptDraft,
  ReceiptLineDraft,
  ReceiveMode,
  SizeType,
  UnderReceiveAction,
} from '../../types/purchasingSpec'
import { SkuLink } from '../../components/sku-link'

const { Text, Title, Paragraph } = Typography

// --- helpers --------------------------------------------------------------------------

const sumCells = (cells: Record<string, number>) =>
  Object.values(cells).reduce((sum, v) => sum + (v || 0), 0)

const remainingForCell = (line: MockOpenPoLine, key: string) =>
  Math.max(0, (line.orderedCells[key] ?? 0) - (line.receivedCells[key] ?? 0))

const lineRemainingTotal = (line: MockOpenPoLine) =>
  Object.keys(line.orderedCells).reduce((sum, key) => sum + remainingForCell(line, key), 0)

const cellOverage = (line: MockOpenPoLine, key: string, receivingNow: number) => {
  const ordered = line.orderedCells[key] ?? 0
  const received = line.receivedCells[key] ?? 0
  return Math.max(0, received + receivingNow - ordered)
}

const effectiveUnitCost = (line: MockOpenPoLine, draft: ReceiptLineDraft) =>
  line.unitCost * (1 - draft.discountPercent / 100) + draft.freightEach

const skuById = (id: string) => MOCK_SKUS.find((s) => s.id === id) ?? null
const sizeTypeOf = (sku: ReturnType<typeof skuById>) =>
  sku ? SIZE_TYPES.find((t) => t.id === sku.sizeTypeId) ?? null : null

const buildEmptyDraft = (po: MockOpenPo): ReceiptDraft => ({
  poId: po.id,
  receivedAtStoreId: po.shipToStoreId,
  referenceNumber: '',
  mode: 'MANUAL',
  linesById: Object.fromEntries(
    po.lines.map((line) => [
      line.id,
      {
        lineId: line.id,
        receivingNow: {},
        discountPercent: 0,
        freightEach: 0,
        underReceiveAction: null,
      } satisfies ReceiptLineDraft,
    ]),
  ),
})

// --- page -----------------------------------------------------------------------------

export default function PoReceiveMockPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { poId: routePoId } = useParams<{ poId: string }>()

  const [selectedPoId, setSelectedPoId] = useState<string | null>(
    routePoId ?? MOCK_OPEN_POS[0]?.id ?? null,
  )
  const po = useMemo(
    () => MOCK_OPEN_POS.find((p) => p.id === selectedPoId) ?? null,
    [selectedPoId],
  )
  const [draft, setDraft] = useState<ReceiptDraft | null>(() => (po ? buildEmptyDraft(po) : null))
  const [scanBuffer, setScanBuffer] = useState('')
  const [scanLog, setScanLog] = useState<
    Array<{ ts: string; skuCode: string; cellLabel: string; lineId: string; cellKey: string }>
  >([])
  const [underReceiveOpen, setUnderReceiveOpen] = useState(false)
  const [underReceiveChoices, setUnderReceiveChoices] = useState<
    Record<string, UnderReceiveAction>
  >({})
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewPayload, setPreviewPayload] = useState<unknown>(null)

  useEffect(() => {
    if (po) {
      setDraft(buildEmptyDraft(po))
      setScanLog([])
      setUnderReceiveChoices({})
    } else {
      setDraft(null)
    }
  }, [po])

  const vendor = po ? MOCK_VENDORS.find((v) => v.id === po.vendorId) ?? null : null
  const billTo = po ? MOCK_STORES.find((s) => s.id === po.billToStoreId) ?? null : null
  const shipTo = po ? MOCK_STORES.find((s) => s.id === po.shipToStoreId) ?? null : null

  const setMode = (mode: ReceiveMode) =>
    setDraft((prev) => (prev ? { ...prev, mode } : prev))

  const applyFull = () => {
    if (!po) return
    setDraft((prev) => {
      if (!prev) return prev
      const nextLines: Record<string, ReceiptLineDraft> = {}
      for (const line of po.lines) {
        const receiving = Object.fromEntries(
          Object.keys(line.orderedCells).map((key) => [key, remainingForCell(line, key)]),
        )
        nextLines[line.id] = {
          ...prev.linesById[line.id]!,
          receivingNow: receiving,
        }
      }
      return { ...prev, mode: 'FULL', linesById: nextLines }
    })
    message.info('Applied Full — receiving-now set to remaining on every line.')
  }

  const patchLine = (lineId: string, patch: Partial<ReceiptLineDraft>) => {
    setDraft((prev) => {
      if (!prev) return prev
      const existing = prev.linesById[lineId]
      if (!existing) return prev
      return {
        ...prev,
        linesById: {
          ...prev.linesById,
          [lineId]: { ...existing, ...patch },
        },
      }
    })
  }

  const setCell = (lineId: string, key: string, value: number) => {
    setDraft((prev) => {
      if (!prev) return prev
      const lineDraft = prev.linesById[lineId]
      if (!lineDraft) return prev
      return {
        ...prev,
        linesById: {
          ...prev.linesById,
          [lineId]: {
            ...lineDraft,
            receivingNow: { ...lineDraft.receivingNow, [key]: value },
          },
        },
      }
    })
  }

  const handleScanSubmit = () => {
    if (!draft || !po) return
    const raw = scanBuffer.trim()
    if (!raw) return
    const parts = raw.split('|').map((s) => s.trim())
    const skuCode = parts[0]
    const col = parts[1]
    const row = parts[2] ?? ''
    if (!skuCode || !col) {
      message.error('Scan format: SKU|COLUMN[|ROW] (e.g. NK-AIR-42|8|M, or GA-TEE|M for 1-D)')
      return
    }
    const sku = MOCK_SKUS.find((s) => s.skuCode === skuCode)
    if (!sku) {
      message.error(`Unknown SKU "${skuCode}"`)
      return
    }
    const line = po.lines.find((l) => l.skuId === sku.id)
    if (!line) {
      message.error(`${skuCode} is not on ${po.poNumber}. (Spec p. 57: add-on-receive only for in-transit POs.)`)
      return
    }
    const key = cellKey(col, row)
    if (!(key in line.orderedCells)) {
      message.error(`Cell ${col}${row ? `|${row}` : ''} is not on this PO line.`)
      return
    }
    const lineDraft = draft.linesById[line.id]
    if (!lineDraft) return
    const current = lineDraft.receivingNow[key] ?? 0
    setCell(line.id, key, current + 1)
    setScanLog((log) =>
      [
        {
          ts: new Date().toISOString().slice(11, 19),
          skuCode,
          cellLabel: row ? `${col} / ${row}` : col,
          lineId: line.id,
          cellKey: key,
        },
        ...log,
      ].slice(0, 40),
    )
    setScanBuffer('')
  }

  const totals = useMemo(() => {
    if (!po || !draft) return { units: 0, atCost: 0, atRetail: 0, overageUnits: 0, remainingUnits: 0 }
    let units = 0
    let atCost = 0
    let atRetail = 0
    let overageUnits = 0
    let remainingUnits = 0
    for (const line of po.lines) {
      const lineDraft = draft.linesById[line.id]
      if (!lineDraft) continue
      const now = sumCells(lineDraft.receivingNow)
      units += now
      atCost += now * effectiveUnitCost(line, lineDraft)
      atRetail += now * line.retailPrice
      remainingUnits += lineRemainingTotal(line)
      for (const key of Object.keys(line.orderedCells)) {
        overageUnits += cellOverage(line, key, lineDraft.receivingNow[key] ?? 0)
      }
    }
    return { units, atCost, atRetail, overageUnits, remainingUnits }
  }, [po, draft])

  const underReceiveLines = useMemo(() => {
    if (!po || !draft) return []
    const out: Array<{
      line: MockOpenPoLine
      index: number
      remaining: number
      receivingNow: number
      lineDraft: ReceiptLineDraft
    }> = []
    po.lines.forEach((line, index) => {
      const lineDraft = draft.linesById[line.id]
      if (!lineDraft) return
      const remaining = lineRemainingTotal(line)
      const receivingNow = sumCells(lineDraft.receivingNow)
      if (receivingNow > 0 && receivingNow < remaining) {
        out.push({ line, index, remaining, receivingNow, lineDraft })
      }
    })
    return out
  }, [po, draft])

  const buildPayload = () => {
    if (!po || !draft) return null
    return {
      poId: po.id,
      poNumber: po.poNumber,
      mode: draft.mode,
      receivedAtStoreId: draft.receivedAtStoreId,
      referenceNumber: draft.referenceNumber || null,
      receivedAt: new Date().toISOString(),
      lines: po.lines.map((line, index) => {
        const lineDraft = draft.linesById[line.id]!
        const sku = skuById(line.skuId)
        const type = sizeTypeOf(sku)
        const cells = Object.entries(lineDraft.receivingNow)
          .filter(([, v]) => v !== 0)
          .map(([key, qty]) => {
            const [columnLabel = '', rowLabel = ''] = key.split('|')
            return {
              columnLabel,
              rowLabel: rowLabel || null,
              columnDesc: type?.columnDesc ?? null,
              rowDesc: type?.rowDesc || null,
              quantityReceived: qty,
              overage: cellOverage(line, key, qty),
            }
          })
        const sumNow = sumCells(lineDraft.receivingNow)
        const remaining = lineRemainingTotal(line)
        return {
          position: index + 1,
          poLineId: line.id,
          skuId: line.skuId,
          skuCode: sku?.skuCode,
          discountPercent: lineDraft.discountPercent,
          freightEach: lineDraft.freightEach,
          effectiveUnitCost: Number(effectiveUnitCost(line, lineDraft).toFixed(4)),
          underReceiveAction:
            sumNow > 0 && sumNow < remaining
              ? underReceiveChoices[line.id] ?? null
              : null,
          cells,
        }
      }),
      projectedPoStatus:
        po.lines.every((line) => {
          const lineDraft = draft.linesById[line.id]!
          const remaining = lineRemainingTotal(line)
          const now = sumCells(lineDraft.receivingNow)
          const choice = underReceiveChoices[line.id]
          if (now >= remaining) return true
          if (now > 0 && choice === 'CANCEL_REMAINDER') return true
          return false
        })
          ? 'RECEIVED'
          : 'PARTIALLY_RECEIVED',
    }
  }

  const handleSave = () => {
    if (!po || !draft) return
    if (totals.units === 0) {
      message.error('Enter at least one unit to receive, or clear and go home.')
      return
    }
    if (underReceiveLines.length > 0) {
      const nextChoices: Record<string, UnderReceiveAction> = { ...underReceiveChoices }
      for (const { line } of underReceiveLines) {
        if (!nextChoices[line.id]) nextChoices[line.id] = 'BACKORDER'
      }
      setUnderReceiveChoices(nextChoices)
      setUnderReceiveOpen(true)
      return
    }
    commitReceipt()
  }

  const commitReceipt = () => {
    const payload = buildPayload()
    if (!payload) return
    setPreviewPayload(payload)
    setPreviewOpen(true)
    setUnderReceiveOpen(false)
    message.success(`Mock: receipt saved. Projected status: ${payload.projectedPoStatus}.`)
  }

  if (!po || !draft) {
    return (
      <Card>
        <Empty description="No mock POs available." />
      </Card>
    )
  }

  const lineEntries = po.lines.map((line, index) => ({
    line,
    index,
    lineDraft: draft.linesById[line.id]!,
    sku: skuById(line.skuId),
  }))

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Row align="middle" justify="space-between" gutter={[8, 8]}>
          <Col>
            <Space wrap>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/purchasing/orders')}>
                Back
              </Button>
              <Title level={4} style={{ margin: 0 }}>
                Receive PO — Spec Preview
              </Title>
              <Tag color="blue">{po.poNumber}</Tag>
              <Tag color={po.status === 'PARTIALLY_RECEIVED' ? 'orange' : 'blue'}>
                {po.status.replace('_', ' ')}
              </Tag>
              <Tag>RICS p. 57</Tag>
            </Space>
          </Col>
          <Col>
            <Space>
              <Badge count={po.lines.length} color="#1677ff" overflowCount={999}>
                <Tag style={{ fontSize: 13, padding: '4px 10px' }}>SKUs on PO</Tag>
              </Badge>
              <Badge count={totals.overageUnits} color="#cf1322" overflowCount={999}>
                <Tag style={{ fontSize: 13, padding: '4px 10px' }}>Over-receipt units</Tag>
              </Badge>
            </Space>
          </Col>
        </Row>
      </Card>

      <Alert
        type="info"
        showIcon
        message="Mock-data preview of the Receive PO spec (p. 57)."
        description="Nothing persists. PO selection below is a fixture set. Save renders the ledger-shaped payload that would POST to /api/v1/purchase-orders/:id/receive."
      />

      <Card title="Pick a PO to receive" extra={<Text type="secondary">Spec list screen</Text>}>
        <Select
          style={{ width: '100%' }}
          value={selectedPoId ?? undefined}
          onChange={(id) => setSelectedPoId(id)}
          options={MOCK_OPEN_POS.map((mp) => {
            const ven = MOCK_VENDORS.find((v) => v.id === mp.vendorId)
            const openUnits = mp.lines.reduce(
              (s, l) => s + lineRemainingTotal(l),
              0,
            )
            return {
              value: mp.id,
              label: `${mp.poNumber} · ${ven?.code ?? mp.vendorId} · ship ${mp.shipDate} · ${openUnits} units open · ${mp.status}`,
            }
          })}
        />
      </Card>

      <Card title="PO Summary" extra={<Text type="secondary">Header · read-only here</Text>}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label="Vendor">
            {vendor ? `${vendor.code} — ${vendor.name}` : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Bill-to">
            {billTo ? `${billTo.code} — ${billTo.name}` : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Ship-to">
            {shipTo ? `${shipTo.code} — ${shipTo.name}` : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Order Date">{po.orderDate}</Descriptions.Item>
          <Descriptions.Item label="Ship Date">{po.shipDate}</Descriptions.Item>
          <Descriptions.Item label="Status">{po.status.replace('_', ' ')}</Descriptions.Item>
          {po.comments && (
            <Descriptions.Item label="Comments" span={3}>
              {po.comments}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Card title="Receipt Header" extra={<Text type="secondary">New receipt event</Text>}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={6}>
            <Form.Item label="Received at Store">
              <Select
                value={draft.receivedAtStoreId ?? undefined}
                onChange={(v) =>
                  setDraft((prev) => (prev ? { ...prev, receivedAtStoreId: v } : prev))
                }
                options={MOCK_STORES.map((s) => ({
                  value: s.id,
                  label: `${s.code} — ${s.name}`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item
              label={
                <Space size={4}>
                  Reference #
                  <Tooltip title="Packing slip, carton ID, or vendor invoice number.">
                    <InfoCircleOutlined />
                  </Tooltip>
                </Space>
              }
            >
              <Input
                value={draft.referenceNumber}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev ? { ...prev, referenceNumber: e.target.value } : prev,
                  )
                }
                placeholder="e.g. PKG-99821"
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Mode">
              <Segmented
                options={[
                  { label: 'Manual', value: 'MANUAL', icon: <InboxOutlined /> },
                  { label: 'Full', value: 'FULL', icon: <ThunderboltOutlined /> },
                  { label: 'Scan', value: 'SCAN', icon: <ScanOutlined /> },
                ]}
                value={draft.mode}
                onChange={(v) => setMode(v as ReceiveMode)}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={4} style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Button icon={<ThunderboltOutlined />} onClick={applyFull} block>
              Apply Full
            </Button>
          </Col>
        </Row>
      </Card>

      {draft.mode === 'SCAN' && (
        <Card
          title="Scan Mode"
          extra={<Text type="secondary">Spec p. 57 · [Scan] / [End PO]</Text>}
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} md={16}>
              <Form.Item
                label="Scan code"
                help="Format: SKU|COLUMN[|ROW]. Example: NK-AIR-42|8|M — each enter increments that cell by 1."
              >
                <Input.Search
                  value={scanBuffer}
                  onChange={(e) => setScanBuffer(e.target.value)}
                  onSearch={handleScanSubmit}
                  onPressEnter={handleScanSubmit}
                  enterButton="Increment"
                  placeholder="SKU|COLUMN|ROW"
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Recent scans
              </Text>
              {scanLog.length === 0 ? (
                <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
                  No scans yet.
                </Paragraph>
              ) : (
                <List
                  size="small"
                  dataSource={scanLog}
                  renderItem={(entry) => (
                    <List.Item style={{ padding: '4px 0' }}>
                      <Text style={{ fontSize: 12 }}>
                        {entry.ts} · <SkuLink skuCode={entry.skuCode} /> · {entry.cellLabel}
                      </Text>
                    </List.Item>
                  )}
                  style={{ maxHeight: 140, overflow: 'auto' }}
                />
              )}
            </Col>
          </Row>
        </Card>
      )}

      {lineEntries.map(({ line, index, lineDraft, sku }) => (
        <ReceiveLineCard
          key={line.id}
          index={index}
          line={line}
          sku={sku}
          lineDraft={lineDraft}
          onCellChange={(key, value) => setCell(line.id, key, value)}
          onPatch={(patch) => patchLine(line.id, patch)}
        />
      ))}

      <Card>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={12} md={4}>
            <Statistic title="Units to Receive" value={totals.units} />
          </Col>
          <Col xs={12} md={4}>
            <Statistic title="Remaining on PO" value={totals.remainingUnits} />
          </Col>
          <Col xs={12} md={5}>
            <Statistic title="Receipt at Cost" precision={2} value={totals.atCost} />
          </Col>
          <Col xs={12} md={5}>
            <Statistic
              title="Receipt at Retail"
                            precision={2}
              value={totals.atRetail}
            />
          </Col>
          <Col xs={24} md={6}>
            <Text type="secondary">Over-receipt</Text>
            <div>
              {totals.overageUnits === 0 ? (
                <Badge status="success" text="None" />
              ) : (
                <Badge
                  status="error"
                  text={
                    <Tooltip title="Over-receipt creates a negative adjustment receipt per spec (ledger-based). Cells highlighted red on lines below.">
                      <Text>{totals.overageUnits} units over</Text>
                    </Tooltip>
                  }
                />
              )}
            </div>
          </Col>
        </Row>
        <Divider />
        <Space wrap>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
            Save Receipt
          </Button>
          <Button onClick={() => navigate('/purchasing/orders')}>Cancel</Button>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Receipt is published as a ledger event (inventory.applyReceipt) — fully-received PO
            transitions to RECEIVED; partial stays open (spec § Modernization).
          </Paragraph>
        </Space>
      </Card>

      {/* Under-receive resolution modal */}
      <Modal
        open={underReceiveOpen}
        title={
          <Space>
            <WarningOutlined />
            Under-receive — cancel remainder or leave as backorder?
          </Space>
        }
        onCancel={() => setUnderReceiveOpen(false)}
        onOk={commitReceipt}
        okText="Commit Receipt"
        width={640}
      >
        <Paragraph type="secondary">
          For each line below, receiving-now is less than remaining on the PO. Per RICS p. 57 you
          choose what happens to the unreceived balance.
        </Paragraph>
        <List
          dataSource={underReceiveLines}
          renderItem={({ line, index, remaining, receivingNow }) => {
            const sku = skuById(line.skuId)
            const choice = underReceiveChoices[line.id] ?? 'BACKORDER'
            return (
              <List.Item key={line.id}>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Space>
                    <Tag color="blue">SKU {index + 1}</Tag>
                    {sku?.skuCode ? <SkuLink skuCode={sku.skuCode} /> : null}
                    <Text type="secondary">· {sku?.description}</Text>
                  </Space>
                  <Text type="secondary">
                    Receiving {receivingNow} of {remaining} remaining ({remaining - receivingNow}{' '}
                    short)
                  </Text>
                  <Radio.Group
                    value={choice}
                    onChange={(e) =>
                      setUnderReceiveChoices((prev) => ({
                        ...prev,
                        [line.id]: e.target.value as UnderReceiveAction,
                      }))
                    }
                  >
                    <Radio value="BACKORDER">Leave as backorder (keep line open)</Radio>
                    <Radio value="CANCEL_REMAINDER">
                      Cancel remaining balance (close line)
                    </Radio>
                  </Radio.Group>
                </Space>
              </List.Item>
            )
          }}
        />
      </Modal>

      <Modal
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        onOk={() => setPreviewOpen(false)}
        title="Receipt payload (what the POST body would look like)"
        width={820}
        okText="Close"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <pre
          style={{
            background: '#f5f5f5',
            padding: 12,
            borderRadius: 4,
            maxHeight: 560,
            overflow: 'auto',
            fontSize: 12,
          }}
        >
          {previewPayload ? JSON.stringify(previewPayload, null, 2) : ''}
        </pre>
      </Modal>
    </Space>
  )
}

// --- per-line card --------------------------------------------------------------------

interface ReceiveLineCardProps {
  index: number
  line: MockOpenPoLine
  sku: ReturnType<typeof skuById>
  lineDraft: ReceiptLineDraft
  onCellChange: (cellKey: string, value: number) => void
  onPatch: (patch: Partial<ReceiptLineDraft>) => void
}

function ReceiveLineCard({
  index,
  line,
  sku,
  lineDraft,
  onCellChange,
  onPatch,
}: ReceiveLineCardProps) {
  const sizeType = sizeTypeOf(sku)
  const orderedTotal = sumCells(line.orderedCells)
  const receivedTotal = sumCells(line.receivedCells)
  const remainingTotal = lineRemainingTotal(line)
  const receivingNowTotal = sumCells(lineDraft.receivingNow)
  const effectiveCost = effectiveUnitCost(line, lineDraft)
  const lineOverage = Object.keys(line.orderedCells).reduce(
    (sum, key) => sum + cellOverage(line, key, lineDraft.receivingNow[key] ?? 0),
    0,
  )

  return (
    <Card
      type="inner"
      title={
        <Space wrap>
          <Tag color="blue">SKU {index + 1}</Tag>
          {sku?.skuCode ? (
            <SkuLink skuCode={sku.skuCode} />
          ) : (
            <Text strong>{line.skuId}</Text>
          )}
          <Text type="secondary">· {sku?.description}</Text>
          {sku && <Tag color="geekblue">{sku.brand}</Tag>}
          {sizeType && <Tag>{sizeType.name}</Tag>}
          {lineOverage > 0 && (
            <Tag color="red" icon={<WarningOutlined />}>
              {lineOverage} over
            </Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          <Tag>Ordered {orderedTotal}</Tag>
          <Tag color="green">Rec&apos;d {receivedTotal}</Tag>
          <Tag color="orange">Remaining {remainingTotal}</Tag>
          <Tag color={receivingNowTotal === remainingTotal && receivingNowTotal > 0 ? 'green' : 'blue'}>
            Now {receivingNowTotal}
          </Tag>
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={12} md={4}>
          <Form.Item
            label={
              <Space size={4}>
                Discount %
                <Tooltip title="Spec p. 57 — per-line discount lowers per-unit cost on this receipt (applied to effective unit cost, does not modify SKU master).">
                  <InfoCircleOutlined />
                </Tooltip>
              </Space>
            }
          >
            <InputNumber
              min={0}
              max={100}
              step={0.5}
              precision={2}
              suffix="%"
              value={lineDraft.discountPercent}
              onChange={(v) => onPatch({ discountPercent: Number(v ?? 0) })}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
        <Col xs={12} md={4}>
          <Form.Item
            label={
              <Space size={4}>
                Freight Each
                <Tooltip title="Spec p. 57 — per-line freight adds to per-unit cost on this receipt.">
                  <InfoCircleOutlined />
                </Tooltip>
              </Space>
            }
          >
            <InputNumber
              min={0}
              step={0.01}
              precision={2}
                            value={lineDraft.freightEach}
              onChange={(v) => onPatch({ freightEach: Number(v ?? 0) })}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
        <Col xs={12} md={4}>
          <Statistic
            title="Effective unit cost"
                        precision={2}
            value={effectiveCost}
          />
        </Col>
        <Col xs={12} md={6}>
          <Statistic
            title="Receipt subtotal"
                        precision={2}
            value={receivingNowTotal * effectiveCost}
          />
        </Col>
        <Col xs={12} md={6}>
          <Statistic
            title="Line retail"
                        precision={2}
            value={receivingNowTotal * line.retailPrice}
          />
        </Col>
      </Row>

      <Divider orientation="left" plain>
        <Text type="secondary">
          {sizeType
            ? `Receiving-now grid — ${sizeType.columnDesc}${sizeType.rowDesc ? ` × ${sizeType.rowDesc}` : ''}`
            : 'Receiving-now grid'}
        </Text>
      </Divider>

      {!sizeType ? (
        <Empty description="SKU has no size type" />
      ) : (
        <ReceiveGrid
          sizeType={sizeType}
          line={line}
          receivingNow={lineDraft.receivingNow}
          onCellChange={onCellChange}
        />
      )}
    </Card>
  )
}

// --- grid ------------------------------------------------------------------------------

interface ReceiveGridProps {
  sizeType: SizeType
  line: MockOpenPoLine
  receivingNow: Record<string, number>
  onCellChange: (cellKey: string, value: number) => void
}

function ReceiveGrid({ sizeType, line, receivingNow, onCellChange }: ReceiveGridProps) {
  const { columns, rows, columnDesc, rowDesc } = sizeType
  const is1D = rows.length === 1 && rows[0] === ''

  const cellInput = (col: string, row: string) => {
    const key = cellKey(col, row)
    const ordered = line.orderedCells[key] ?? 0
    const received = line.receivedCells[key] ?? 0
    const remaining = Math.max(0, ordered - received)
    const now = receivingNow[key] ?? 0
    const overage = Math.max(0, received + now - ordered)
    const isOrderedCell = ordered > 0
    return (
      <div key={key} style={{ textAlign: 'center' }}>
        <InputNumber
          size="small"
          min={0}
          precision={0}
          disabled={!isOrderedCell && now === 0}
          value={now}
          onChange={(v) => onCellChange(key, Number(v ?? 0))}
          status={overage > 0 ? 'error' : undefined}
          style={{ width: 72 }}
        />
        <div style={{ fontSize: 11, color: overage > 0 ? '#cf1322' : '#888', marginTop: 2 }}>
          {isOrderedCell ? (
            <>
              {remaining} rem
              <div>
                ({received}/{ordered})
              </div>
            </>
          ) : (
            <span style={{ opacity: 0.4 }}>—</span>
          )}
        </div>
      </div>
    )
  }

  if (is1D) {
    return (
      <div style={{ overflowX: 'auto' }}>
        <Space wrap size={[12, 12]}>
          {columns.map((col) => (
            <div key={col} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 4, fontWeight: 500 }}>
                {col}
              </div>
              {cellInput(col, '')}
            </div>
          ))}
        </Space>
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', minWidth: 400 }}>
        <thead>
          <tr>
            <th style={{ padding: 8, textAlign: 'left', fontWeight: 500 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {rowDesc || ''} ↓ / {columnDesc} →
              </Text>
            </th>
            {columns.map((col) => (
              <th key={col} style={{ padding: 8, textAlign: 'center' }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <th style={{ padding: 8, textAlign: 'left' }}>{row}</th>
              {columns.map((col) => (
                <td key={col} style={{ padding: 6, verticalAlign: 'top' }}>
                  {cellInput(col, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Paragraph type="secondary" style={{ fontSize: 11, marginTop: 8 }}>
        <CheckCircleOutlined /> <Text strong>N rem</Text> = remaining to receive.{' '}
        <Text strong>(received/ordered)</Text> shown below. Red border = over-receipt (ledger-adjustment on save).
      </Paragraph>
    </div>
  )
}
