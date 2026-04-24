import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs, { type Dayjs } from 'dayjs'
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  DatePicker,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  PrinterOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import {
  FUTURE_ORDER_THRESHOLD_DAYS,
  MOCK_CASE_PACKS,
  MOCK_SKUS,
  MOCK_STORES,
  MOCK_VENDORS,
  NEXT_SUGGESTED_PO_NUMBER,
  OTB_BLOCK_THRESHOLD,
  OTB_WARN_THRESHOLD,
  SIZE_TYPES,
  cellKey,
} from '../../mock/purchasingSpec'
import type {
  OrderType,
  OtbCheckResult,
  POClassification,
  PoHeaderDraft,
  PoLineDraft,
  SizeType,
} from '../../types/purchasingSpec'
import { SkuLink } from '../../components/sku-link'
import { DraggableModal } from '../../components/draggable-modal'

const { Text, Title, Paragraph } = Typography

const newLineKey = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random())

const initialHeader = (): PoHeaderDraft => ({
  poNumber: NEXT_SUGGESTED_PO_NUMBER,
  billToStoreId: null,
  shipToStoreId: null,
  vendorId: null,
  orderType: 'RO',
  storeLabelsOnReceive: false,
  confirmationNumber: '',
  accountNumber: '',
  terms: '',
  shipVia: '',
  backorderAllowed: false,
  splitShipment: false,
  programCode: '',
  comments: '',
  orderDate: dayjs().format('YYYY-MM-DD'),
  shipDate: '',
  cancelDate: '',
  paymentDate: '',
})

const emptyLine = (): PoLineDraft => ({
  key: newLineKey(),
  skuId: '',
  casePackId: null,
  casePackMultiplier: 1,
  retailPrice: 0,
  unitCost: 0,
  sizeQuantities: {},
  writeBackToMaster: false,
})

const sizeTypeOf = (sku: (typeof MOCK_SKUS)[number] | null): SizeType | null => {
  if (!sku) return null
  return SIZE_TYPES.find((t) => t.id === sku.sizeTypeId) ?? null
}

const lineOrderedQty = (line: PoLineDraft) =>
  Object.values(line.sizeQuantities).reduce((sum, q) => sum + (q || 0), 0)

const classifyShipDate = (shipDate: string): POClassification | null => {
  if (!shipDate) return null
  const days = dayjs(shipDate).startOf('day').diff(dayjs().startOf('day'), 'day')
  return days <= FUTURE_ORDER_THRESHOLD_DAYS ? 'AT_ONCE' : 'FUTURE'
}

const evaluateOtb = (totalCost: number): OtbCheckResult => {
  if (totalCost >= OTB_BLOCK_THRESHOLD) {
    return {
      status: 'BLOCK',
      totalCost,
      message: `OTB hard stop — PO at cost exceeds ${OTB_BLOCK_THRESHOLD.toLocaleString()}. Submission would be blocked without a CEO exception approval.`,
    }
  }
  if (totalCost >= OTB_WARN_THRESHOLD) {
    return {
      status: 'WARN',
      totalCost,
      message: `OTB warning — PO at cost exceeds ${OTB_WARN_THRESHOLD.toLocaleString()}. Submission would prompt for confirmation.`,
    }
  }
  return { status: 'OK', totalCost, message: 'Within OTB plan.' }
}

const applyPackToQuantities = (
  packId: string | null,
  multiplier: number,
): Record<string, number> => {
  if (!packId) return {}
  const pack = MOCK_CASE_PACKS.find((p) => p.id === packId)
  if (!pack) return {}
  const factor = Math.max(multiplier, 0)
  return Object.fromEntries(
    Object.entries(pack.cellsPerPack).map(([key, qty]) => [key, qty * factor]),
  )
}

const toPayload = (header: PoHeaderDraft, lines: PoLineDraft[]) => ({
  status: 'DRAFT' as const,
  header,
  lines: lines.map((line, index) => {
    const sku = MOCK_SKUS.find((s) => s.id === line.skuId)
    const type = sizeTypeOf(sku ?? null)
    return {
      position: index + 1,
      skuId: line.skuId,
      skuCode: sku?.skuCode,
      sizeTypeId: sku?.sizeTypeId,
      casePackId: line.casePackId,
      casePackMultiplier: line.casePackId ? line.casePackMultiplier : null,
      retailPrice: line.retailPrice,
      unitCost: line.unitCost,
      writeBackToMaster: line.writeBackToMaster,
      sizeCells: Object.entries(line.sizeQuantities)
        .filter(([, q]) => q > 0)
        .map(([key, qty]) => {
          const [columnLabel, rowLabel] = key.split('|')
          return {
            columnLabel,
            rowLabel: rowLabel || null,
            columnDesc: type?.columnDesc ?? null,
            rowDesc: type?.rowDesc || null,
            quantityOrdered: qty,
          }
        }),
    }
  }),
})

export default function PoEntryMockPage() {
  const navigate = useNavigate()
  const { message, modal } = App.useApp()

  const [header, setHeader] = useState<PoHeaderDraft>(initialHeader)
  const [committedLines, setCommittedLines] = useState<PoLineDraft[]>([])
  const [draft, setDraft] = useState<PoLineDraft>(emptyLine)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewPayload, setPreviewPayload] = useState<ReturnType<typeof toPayload> | null>(null)

  const selectedVendor = useMemo(
    () => MOCK_VENDORS.find((v) => v.id === header.vendorId) ?? null,
    [header.vendorId],
  )

  const updateHeader = <K extends keyof PoHeaderDraft>(field: K, value: PoHeaderDraft[K]) => {
    setHeader((prev) => ({ ...prev, [field]: value }))
  }

  const handleVendorChange = (vendorId: string) => {
    const vendor = MOCK_VENDORS.find((v) => v.id === vendorId)
    setHeader((prev) => ({
      ...prev,
      vendorId,
      terms: prev.terms || vendor?.defaultTerms || '',
      shipVia: prev.shipVia || vendor?.defaultShipVia || '',
      accountNumber: prev.accountNumber || vendor?.defaultAccountNumber || '',
      storeLabelsOnReceive: vendor?.defaultStoreLabelsOnReceive ?? prev.storeLabelsOnReceive,
    }))
    const draftSku = MOCK_SKUS.find((s) => s.id === draft.skuId)
    if (draftSku && draftSku.vendorId !== vendorId) {
      setDraft(emptyLine())
      setEditingKey(null)
    }
    setCommittedLines((prev) =>
      prev.filter((line) => {
        const sku = MOCK_SKUS.find((s) => s.id === line.skuId)
        return sku?.vendorId === vendorId
      }),
    )
  }

  const validateDraft = (): string | null => {
    if (!header.vendorId) return 'Select a vendor on the PO header first.'
    if (!draft.skuId) return 'Pick a SKU.'
    if (draft.unitCost <= 0) return 'Unit cost must be > 0.'
    if (draft.retailPrice <= 0) return 'Retail price must be > 0.'
    const qty = lineOrderedQty(draft)
    if (qty <= 0) return 'Enter at least one unit across the size grid.'
    return null
  }

  const commitDraft = () => {
    const error = validateDraft()
    if (error) {
      message.error(error)
      return
    }
    if (editingKey) {
      setCommittedLines((prev) =>
        prev.map((line) => (line.key === editingKey ? { ...draft, key: editingKey } : line)),
      )
      message.success('SKU updated.')
    } else {
      setCommittedLines((prev) => [...prev, { ...draft, key: newLineKey() }])
      message.success('SKU added to PO.')
    }
    setDraft(emptyLine())
    setEditingKey(null)
  }

  const clearDraft = () => {
    setDraft(emptyLine())
    setEditingKey(null)
  }

  const editLine = (key: string) => {
    const line = committedLines.find((l) => l.key === key)
    if (!line) return
    setDraft({ ...line })
    setEditingKey(key)
  }

  const removeLine = (key: string) => {
    setCommittedLines((prev) => prev.filter((l) => l.key !== key))
    if (editingKey === key) clearDraft()
  }

  const totals = useMemo(() => {
    let totalQty = 0
    let totalCost = 0
    let totalRetail = 0
    for (const line of committedLines) {
      const qty = lineOrderedQty(line)
      totalQty += qty
      totalCost += qty * line.unitCost
      totalRetail += qty * line.retailPrice
    }
    return { totalQty, totalCost, totalRetail }
  }, [committedLines])

  const classification = classifyShipDate(header.shipDate)
  const otb = evaluateOtb(totals.totalCost)

  const validateHeaderForSave = (): string | null => {
    if (!header.poNumber.trim()) return 'PO Number is required.'
    const firstChar = header.poNumber.trim().charAt(0).toUpperCase()
    if (firstChar === 'A') return 'PO Number prefix "A" is reserved for Automatic POs (RICS p. 56).'
    if (firstChar === 'V')
      return 'PO Number prefix "V" is reserved for Direct Sale POs (RICS p. 56; deferred in v1).'
    if (!header.vendorId) return 'Vendor is required.'
    if (header.billToStoreId == null) return 'Bill-to Store is required.'
    if (header.shipToStoreId == null) return 'Ship-to Store is required.'
    if (committedLines.length === 0) return 'Add at least one SKU line to the PO.'
    return null
  }

  const handleSave = (alsoPrint: boolean) => {
    if (editingKey) {
      message.warning('You are editing a SKU — save or cancel the edit first.')
      return
    }
    const error = validateHeaderForSave()
    if (error) {
      message.error(error)
      return
    }
    if (otb.status === 'BLOCK') {
      modal.confirm({
        title: 'OTB hard stop — would require CEO exception',
        content: otb.message,
        okText: 'Show draft payload anyway',
        onOk: () => {
          setPreviewPayload(toPayload(header, committedLines))
          setPreviewOpen(true)
        },
      })
      return
    }
    setPreviewPayload(toPayload(header, committedLines))
    setPreviewOpen(true)
    message.success(
      alsoPrint ? 'Mock: draft saved; print job would be queued.' : 'Mock: draft saved.',
    )
  }

  const dateValue = (iso: string): Dayjs | null => (iso ? dayjs(iso) : null)
  const entryPosition = editingKey
    ? committedLines.findIndex((l) => l.key === editingKey) + 1
    : committedLines.length + 1

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
                New Purchase Order — Spec Preview
              </Title>
              <Tag color="purple">DRAFT</Tag>
              <Tag>RICS p. 56</Tag>
            </Space>
          </Col>
          <Col>
            <Badge
              count={committedLines.length}
              showZero
              color={committedLines.length === 0 ? '#999' : '#1677ff'}
              overflowCount={999}
            >
              <Tag style={{ fontSize: 13, padding: '4px 10px' }}>SKUs on PO</Tag>
            </Badge>
          </Col>
        </Row>
      </Card>

      <Alert
        type="info"
        showIcon
        message="Mock-data preview of the purchasing.md spec."
        description="Nothing persists. Vendors, stores, size types, SKUs, and case packs are fixtures (size types mirror the RICS RISIZE.MDB shape). Save buttons render the payload that would POST to /api/v1/purchase-orders."
      />

      <Card title="Purchase Order Identity" extra={<Text type="secondary">RICS p. 56</Text>}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Form.Item
              label={
                <Space size={4}>
                  PO Number
                  <Tooltip title="Any letters/digits. Default is last+1. Reserved prefixes: A = Automatic, V = Direct Sale.">
                    <InfoCircleOutlined />
                  </Tooltip>
                </Space>
              }
              required
            >
              <Input
                value={header.poNumber}
                onChange={(e) => updateHeader('poNumber', e.target.value)}
                placeholder="e.g. PO01238"
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Form.Item label="Vendor" required>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Select vendor"
                value={header.vendorId ?? undefined}
                onChange={handleVendorChange}
                options={MOCK_VENDORS.map((v) => ({
                  value: v.id,
                  label: `${v.code} — ${v.name}`,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Form.Item label="Bill-to Store" required>
              <Select
                placeholder="Bill-to"
                value={header.billToStoreId ?? undefined}
                onChange={(v) => updateHeader('billToStoreId', v)}
                options={MOCK_STORES.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Form.Item label="Ship-to Store" required>
              <Select
                placeholder="Ship-to"
                value={header.shipToStoreId ?? undefined}
                onChange={(v) => updateHeader('shipToStoreId', v)}
                options={MOCK_STORES.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Form.Item
              label={
                <Space size={4}>
                  Order Type
                  <Tooltip title="RO = Regular Order (default). RE / SA are EDI-only.">
                    <InfoCircleOutlined />
                  </Tooltip>
                </Space>
              }
            >
              <Segmented
                options={[
                  { label: 'RO', value: 'RO' },
                  { label: 'RE', value: 'RE' },
                  { label: 'SA', value: 'SA' },
                ]}
                value={header.orderType}
                onChange={(v) => updateHeader('orderType', v as OrderType)}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row>
          <Col span={24}>
            <Space>
              <Switch
                checked={header.storeLabelsOnReceive}
                onChange={(v) => updateHeader('storeLabelsOnReceive', v)}
              />
              <Text>
                Store Labels on Receive{' '}
                <Text type="secondary">
                  (Alt+L in RICS — defaulted from Vendor;{' '}
                  {selectedVendor
                    ? `${selectedVendor.code} default: ${selectedVendor.defaultStoreLabelsOnReceive ? 'ON' : 'OFF'}`
                    : 'pick a vendor'}
                  )
                </Text>
              </Text>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card title="Header Details" extra={<Text type="secondary">RICS p. 56 · header folder</Text>}>
        <Collapse
          defaultActiveKey={['terms', 'dates']}
          items={[
            {
              key: 'terms',
              label: 'Terms, account, shipping',
              children: (
                <Row gutter={[16, 16]}>
                  <Col xs={24} sm={12} md={6}>
                    <Form.Item label="Confirmation #">
                      <Input
                        value={header.confirmationNumber}
                        onChange={(e) => updateHeader('confirmationNumber', e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <Form.Item
                      label="Account #"
                      help={
                        selectedVendor
                          ? `Vendor default: ${selectedVendor.defaultAccountNumber}`
                          : undefined
                      }
                    >
                      <Input
                        value={header.accountNumber}
                        onChange={(e) => updateHeader('accountNumber', e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <Form.Item
                      label="Terms"
                      help={
                        selectedVendor ? `Vendor default: ${selectedVendor.defaultTerms}` : undefined
                      }
                    >
                      <Input
                        value={header.terms}
                        onChange={(e) => updateHeader('terms', e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <Form.Item
                      label="Ship Via"
                      help={
                        selectedVendor
                          ? `Vendor default: ${selectedVendor.defaultShipVia}`
                          : undefined
                      }
                    >
                      <Input
                        value={header.shipVia}
                        onChange={(e) => updateHeader('shipVia', e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <Form.Item label="Program Code">
                      <Input
                        value={header.programCode}
                        onChange={(e) => updateHeader('programCode', e.target.value)}
                        placeholder="(EDI only)"
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <Form.Item label="Backorder Allowed">
                      <Switch
                        checked={header.backorderAllowed}
                        onChange={(v) => updateHeader('backorderAllowed', v)}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <Form.Item label="Split Shipment">
                      <Switch
                        checked={header.splitShipment}
                        onChange={(v) => updateHeader('splitShipment', v)}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              ),
            },
            {
              key: 'dates',
              label: 'Dates',
              children: (
                <Row gutter={[16, 16]}>
                  <Col xs={24} sm={12} md={6}>
                    <Form.Item label="Order Date">
                      <DatePicker
                        style={{ width: '100%' }}
                        value={dateValue(header.orderDate)}
                        onChange={(d) => updateHeader('orderDate', d ? d.format('YYYY-MM-DD') : '')}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <Form.Item
                      label={
                        <Space size={4}>
                          Ship Date
                          <Tooltip
                            title={`Drives At-Once vs. Future classification. Threshold: ${FUTURE_ORDER_THRESHOLD_DAYS} days (store-ops company setting).`}
                          >
                            <InfoCircleOutlined />
                          </Tooltip>
                        </Space>
                      }
                    >
                      <DatePicker
                        style={{ width: '100%' }}
                        value={dateValue(header.shipDate)}
                        onChange={(d) => updateHeader('shipDate', d ? d.format('YYYY-MM-DD') : '')}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <Form.Item label="Cancel Date">
                      <DatePicker
                        style={{ width: '100%' }}
                        value={dateValue(header.cancelDate)}
                        onChange={(d) => updateHeader('cancelDate', d ? d.format('YYYY-MM-DD') : '')}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <Form.Item
                      label={
                        <Space size={4}>
                          Payment Date
                          <Tooltip title="Feeds the Cash Payments Projection (dedicated subview in spec).">
                            <InfoCircleOutlined />
                          </Tooltip>
                        </Space>
                      }
                    >
                      <DatePicker
                        style={{ width: '100%' }}
                        value={dateValue(header.paymentDate)}
                        onChange={(d) => updateHeader('paymentDate', d ? d.format('YYYY-MM-DD') : '')}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              ),
            },
            {
              key: 'comments',
              label: 'Comments',
              children: (
                <Input.TextArea
                  rows={3}
                  value={header.comments}
                  onChange={(e) => updateHeader('comments', e.target.value)}
                  placeholder="Free-form PO comments"
                  maxLength={2000}
                />
              ),
            },
          ]}
        />
      </Card>

      <SkuLineEditor
        draft={draft}
        setDraft={setDraft}
        vendorId={header.vendorId}
        editingKey={editingKey}
        entryPosition={entryPosition}
        onCommit={commitDraft}
        onClear={clearDraft}
      />

      <CommittedSkuList
        lines={committedLines}
        editingKey={editingKey}
        onEdit={editLine}
        onRemove={removeLine}
      />

      <Card>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={12} md={4}>
            <Statistic title="SKUs" value={committedLines.length} />
          </Col>
          <Col xs={12} md={4}>
            <Statistic title="Total Qty" value={totals.totalQty} />
          </Col>
          <Col xs={12} md={4}>
            <Statistic title="Total at Cost" precision={2} value={totals.totalCost} />
          </Col>
          <Col xs={12} md={4}>
            <Statistic title="Total at Retail" precision={2} value={totals.totalRetail} />
          </Col>
          <Col xs={12} md={4}>
            <Text type="secondary">Classification</Text>
            <div>
              {classification === null ? (
                <Text type="secondary">— (set Ship Date)</Text>
              ) : (
                <Tag color={classification === 'AT_ONCE' ? 'blue' : 'default'}>
                  {classification === 'AT_ONCE' ? 'At-Once' : 'Future'}
                </Tag>
              )}
            </div>
          </Col>
          <Col xs={24} md={4}>
            <Text type="secondary">OTB Status</Text>
            <div>
              <Badge
                status={
                  otb.status === 'OK' ? 'success' : otb.status === 'WARN' ? 'warning' : 'error'
                }
                text={
                  <Tooltip title={otb.message}>
                    <Text>
                      {otb.status === 'OK'
                        ? 'Within plan'
                        : otb.status === 'WARN'
                          ? 'Over plan (warn)'
                          : 'Hard stop'}
                    </Text>
                  </Tooltip>
                }
              />
            </div>
          </Col>
        </Row>
        <Divider />
        <Space wrap>
          <Button type="primary" icon={<SaveOutlined />} onClick={() => handleSave(false)}>
            Save Draft
          </Button>
          <Button icon={<PrinterOutlined />} onClick={() => handleSave(true)}>
            Save &amp; Print PO
          </Button>
          <Button onClick={() => navigate('/purchasing/orders')}>Cancel</Button>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Submit moves DRAFT → SUBMITTED and invokes otb-planning.validatePoDollars (spec §
            Modernization).
          </Paragraph>
        </Space>
      </Card>

      <DraggableModal
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        onOk={() => setPreviewOpen(false)}
        title="Draft PO payload (what the POST body would look like)"
        width={760}
        okText="Close"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <pre
          style={{
            background: '#f5f5f5',
            padding: 12,
            borderRadius: 4,
            maxHeight: 500,
            overflow: 'auto',
            fontSize: 12,
          }}
        >
          {previewPayload ? JSON.stringify(previewPayload, null, 2) : ''}
        </pre>
      </DraggableModal>
    </Space>
  )
}

// --- SKU entry editor (the draft row) -------------------------------------------------

interface SkuLineEditorProps {
  draft: PoLineDraft
  setDraft: (updater: PoLineDraft | ((prev: PoLineDraft) => PoLineDraft)) => void
  vendorId: string | null
  editingKey: string | null
  entryPosition: number
  onCommit: () => void
  onClear: () => void
}

function SkuLineEditor({
  draft,
  setDraft,
  vendorId,
  editingKey,
  entryPosition,
  onCommit,
  onClear,
}: SkuLineEditorProps) {
  const vendorSkus = useMemo(
    () => (vendorId ? MOCK_SKUS.filter((s) => s.vendorId === vendorId) : []),
    [vendorId],
  )
  const sku = MOCK_SKUS.find((s) => s.id === draft.skuId) ?? null
  const sizeType = sizeTypeOf(sku)
  const availablePacks = useMemo(
    () => (sku ? MOCK_CASE_PACKS.filter((p) => p.skuId === sku.id) : []),
    [sku],
  )
  const selectedPack = draft.casePackId
    ? MOCK_CASE_PACKS.find((p) => p.id === draft.casePackId) ?? null
    : null
  const unitsPerPack = selectedPack
    ? Object.values(selectedPack.cellsPerPack).reduce((sum, q) => sum + q, 0)
    : 0
  const lineQty = lineOrderedQty(draft)
  const lineCost = lineQty * draft.unitCost
  const lineRetail = lineQty * draft.retailPrice

  const patch = (changes: Partial<PoLineDraft>) =>
    setDraft((prev) => ({ ...prev, ...changes }))

  const handleSkuChange = (skuId: string) => {
    const picked = MOCK_SKUS.find((s) => s.id === skuId)
    if (!picked) {
      setDraft(emptyLine())
      return
    }
    setDraft((prev) => ({
      ...prev,
      skuId,
      retailPrice: picked.defaultRetailPrice,
      unitCost: picked.defaultUnitCost,
      sizeQuantities: {},
      casePackId: null,
      casePackMultiplier: 1,
    }))
  }

  const handlePackChange = (packId: string | null) => {
    const multiplier = packId ? Math.max(draft.casePackMultiplier, 1) : 1
    setDraft((prev) => ({
      ...prev,
      casePackId: packId,
      casePackMultiplier: multiplier,
      sizeQuantities: applyPackToQuantities(packId, multiplier),
    }))
  }

  const handleMultiplierChange = (next: number) => {
    const value = Number.isFinite(next) ? next : 0
    setDraft((prev) => ({
      ...prev,
      casePackMultiplier: value,
      sizeQuantities: prev.casePackId
        ? applyPackToQuantities(prev.casePackId, value)
        : prev.sizeQuantities,
    }))
  }

  const handleCellChange = (key: string, value: number | null) => {
    setDraft((prev) => ({
      ...prev,
      sizeQuantities: { ...prev.sizeQuantities, [key]: value ?? 0 },
    }))
  }

  return (
    <Card
      title={
        <Space>
          {editingKey ? <EditOutlined /> : <PlusOutlined />}
          <Text strong>{editingKey ? `Editing SKU ${entryPosition}` : `Entering SKU ${entryPosition}`}</Text>
          {sku && <Tag color="geekblue">{sku.brand}</Tag>}
        </Space>
      }
      extra={<Text type="secondary">RICS p. 56 · SKU folder</Text>}
    >
      {!vendorId && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Select a vendor on the PO header first — SKU options filter to that vendor."
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} md={10}>
          <Form.Item label="SKU" required>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={vendorId ? 'Select SKU' : 'Pick vendor first'}
              disabled={!vendorId}
              value={draft.skuId || undefined}
              onChange={handleSkuChange}
              options={vendorSkus.map((s) => ({
                value: s.id,
                label: `${s.skuCode} — ${s.description}`,
              }))}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item label="Size Type">
            <Input value={sizeType ? sizeType.name : '—'} disabled />
          </Form.Item>
        </Col>
        <Col xs={12} md={4}>
          <Form.Item label="Unit Cost">
            <InputNumber
              min={0}
              step={0.01}
              precision={2}
              disabled={!sku}
              value={draft.unitCost}
              onChange={(value) => patch({ unitCost: Number(value ?? 0) })}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
        <Col xs={12} md={4}>
          <Form.Item label="Retail">
            <InputNumber
              min={0}
              step={0.01}
              precision={2}
              disabled={!sku}
              value={draft.retailPrice}
              onChange={(value) => patch({ retailPrice: Number(value ?? 0) })}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={10}>
          <Form.Item
            label={
              <Space size={4}>
                Case Pack (optional)
                <Tooltip title="Picking a pack auto-fills the size grid with pack × multiplier. Cells remain editable for manual override.">
                  <InfoCircleOutlined />
                </Tooltip>
              </Space>
            }
          >
            <Select
              allowClear
              placeholder="(none)"
              disabled={!sku}
              value={draft.casePackId ?? undefined}
              onChange={(value) => handlePackChange(value ?? null)}
              options={availablePacks.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
        </Col>
        <Col xs={12} md={3}>
          <Form.Item
            label={
              <Space size={4}>
                X (packs)
                <Tooltip title="RICS multiplier — number of case packs on this line.">
                  <InfoCircleOutlined />
                </Tooltip>
              </Space>
            }
          >
            <InputNumber
              min={0}
              precision={0}
              disabled={!selectedPack}
              value={draft.casePackMultiplier}
              onChange={(value) => handleMultiplierChange(Number(value ?? 0))}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
        <Col xs={12} md={5}>
          <Form.Item label=" " colon={false}>
            <Space direction="vertical" size={0}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Write-back to SKU master
              </Text>
              <Tooltip title="Per-line override of the Company Setup price-writeback flag (replaces RICS.CFG toggle).">
                <Switch
                  checked={draft.writeBackToMaster}
                  onChange={(v) => patch({ writeBackToMaster: v })}
                />
              </Tooltip>
            </Space>
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left" plain>
        <Text type="secondary">
          {sizeType
            ? `Size grid — ${sizeType.columnDesc}${sizeType.rowDesc ? ` × ${sizeType.rowDesc}` : ''}`
            : 'Size grid'}
          {selectedPack
            ? ` · ${unitsPerPack} units/pack × ${draft.casePackMultiplier} = ${unitsPerPack * draft.casePackMultiplier}`
            : ''}
        </Text>
      </Divider>

      {!sku || !sizeType ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Select a SKU to reveal its size grid"
        />
      ) : (
        <SizeGrid
          sizeType={sizeType}
          sizeQuantities={draft.sizeQuantities}
          onCellChange={handleCellChange}
        />
      )}

      {selectedPack && (
        <Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
          Changing the pack or multiplier refills the grid and overwrites manual edits.
        </Paragraph>
      )}

      <Divider />

      <Row gutter={[16, 16]} align="middle">
        <Col xs={8} md={4}>
          <Statistic title="Line Qty" value={lineQty} />
        </Col>
        <Col xs={8} md={5}>
          <Statistic title="Line Cost" precision={2} value={lineCost} />
        </Col>
        <Col xs={8} md={5}>
          <Statistic title="Line Retail" precision={2} value={lineRetail} />
        </Col>
        <Col xs={24} md={10} style={{ textAlign: 'right' }}>
          <Space wrap>
            <Button onClick={onClear}>
              {editingKey ? <CloseOutlined /> : null}
              {editingKey ? ' Cancel Edit' : 'Clear Entry'}
            </Button>
            <Button type="primary" icon={<CheckOutlined />} onClick={onCommit}>
              {editingKey ? 'Save Changes' : 'Add SKU to PO'}
            </Button>
          </Space>
        </Col>
      </Row>
    </Card>
  )
}

// --- Committed SKU list (entered SKUs on the PO) --------------------------------------

interface CommittedSkuListProps {
  lines: PoLineDraft[]
  editingKey: string | null
  onEdit: (key: string) => void
  onRemove: (key: string) => void
}

function CommittedSkuList({ lines, editingKey, onEdit, onRemove }: CommittedSkuListProps) {
  return (
    <Card
      title={
        <Space>
          <Text strong>SKUs on this PO</Text>
          <Badge count={lines.length} showZero color={lines.length ? '#1677ff' : '#999'} />
        </Space>
      }
      extra={<Text type="secondary">Oldest first · matches invoice line order</Text>}
    >
      {lines.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No SKUs added yet. Enter one above and click Add SKU to PO."
        />
      ) : (
        <List
          dataSource={lines}
          rowKey="key"
          renderItem={(line, index) => {
            const sku = MOCK_SKUS.find((s) => s.id === line.skuId)
            const type = sizeTypeOf(sku ?? null)
            const qty = lineOrderedQty(line)
            const cost = qty * line.unitCost
            const retail = qty * line.retailPrice
            const isEditing = editingKey === line.key
            const packName = line.casePackId
              ? MOCK_CASE_PACKS.find((p) => p.id === line.casePackId)?.name
              : null
            return (
              <List.Item
                style={{
                  background: isEditing ? '#fffbe6' : undefined,
                  borderRadius: 4,
                  padding: '12px 16px',
                }}
                actions={[
                  <Button
                    key="edit"
                    icon={<EditOutlined />}
                    type="text"
                    disabled={isEditing}
                    onClick={() => onEdit(line.key)}
                  >
                    Edit
                  </Button>,
                  <Button
                    key="remove"
                    icon={<DeleteOutlined />}
                    type="text"
                    danger
                    onClick={() => onRemove(line.key)}
                  >
                    Remove
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space wrap>
                      <Tag color="blue">SKU {index + 1}</Tag>
                      {sku?.skuCode ? (
                        <SkuLink skuCode={sku.skuCode} />
                      ) : (
                        <Text strong>{line.skuId}</Text>
                      )}
                      <Text type="secondary">· {sku?.description ?? ''}</Text>
                      {sku && <Tag color="geekblue">{sku.brand}</Tag>}
                      {type && <Tag>{type.name}</Tag>}
                      {packName && <Tag color="purple">{`${packName} × ${line.casePackMultiplier}`}</Tag>}
                      {isEditing && <Tag color="gold">Editing</Tag>}
                    </Space>
                  }
                  description={
                    <Space size="large" wrap>
                      <Text>
                        Qty <strong>{qty}</strong>
                      </Text>
                      <Text>
                        Cost <strong>{cost.toFixed(2)}</strong> (@ {line.unitCost.toFixed(2)})
                      </Text>
                      <Text>
                        Retail <strong>{retail.toFixed(2)}</strong> (@ {line.retailPrice.toFixed(2)})
                      </Text>
                      {line.writeBackToMaster && <Tag>Writes back to SKU master</Tag>}
                    </Space>
                  }
                />
              </List.Item>
            )
          }}
        />
      )}
    </Card>
  )
}

// --- Size grid --------------------------------------------------------------------------

interface SizeGridProps {
  sizeType: SizeType
  sizeQuantities: Record<string, number>
  onCellChange: (cellKey: string, value: number | null) => void
}

function SizeGrid({ sizeType, sizeQuantities, onCellChange }: SizeGridProps) {
  const { columns, rows, rowDesc, columnDesc } = sizeType
  const is1D = rows.length === 1 && rows[0] === ''

  if (is1D) {
    return (
      <Space wrap size={[8, 8]}>
        {columns.map((col) => {
          const key = cellKey(col, '')
          return (
            <div key={key} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#888' }}>{col}</div>
              <InputNumber
                size="small"
                min={0}
                precision={0}
                value={sizeQuantities[key] ?? 0}
                onChange={(value) => onCellChange(key, Number(value ?? 0))}
                style={{ width: 72 }}
              />
            </div>
          )
        })}
      </Space>
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
            <tr key={row || 'single'}>
              <th style={{ padding: 8, textAlign: 'left' }}>{row}</th>
              {columns.map((col) => {
                const key = cellKey(col, row)
                return (
                  <td key={col} style={{ padding: 4 }}>
                    <InputNumber
                      size="small"
                      min={0}
                      precision={0}
                      value={sizeQuantities[key] ?? 0}
                      onChange={(value) => onCellChange(key, Number(value ?? 0))}
                      style={{ width: 72 }}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
