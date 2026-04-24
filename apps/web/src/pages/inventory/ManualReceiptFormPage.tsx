import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs, { type Dayjs } from 'dayjs'
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Empty,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Table,
  Typography,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons'
import { useCreateManualReceipt, useManualReceiptContext, useManualReceiptStores } from '../../hooks/useManualReceipts'
import { useAutocompleteSkus } from '../../hooks/useSkus'
import { SkuLookup } from '../../components/sku-lookup'
import type { ManualReceiptContext } from '../../types/manualReceipt'

interface GridRow {
  key: string
  rowLabel: string
}

function cellKey(rowLabel: string, columnLabel: string): string {
  return `${rowLabel}::${columnLabel}`
}

function normalizeGrid(context: ManualReceiptContext | null): { columns: string[]; rows: string[] } {
  if (!context) return { columns: [], rows: [] }
  return {
    columns: context.sizeGrid.columns.length > 0 ? context.sizeGrid.columns : [''],
    rows: context.sizeGrid.rows.length > 0 ? context.sizeGrid.rows : [''],
  }
}

function onHandMap(context: ManualReceiptContext | null): Map<string, number> {
  const map = new Map<string, number>()
  for (const cell of context?.currentOnHandByCell ?? []) {
    map.set(cellKey(cell.rowLabel, cell.columnLabel), cell.quantityOnHand)
  }
  return map
}

export default function ManualReceiptFormPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data: stores, isLoading: storesLoading } = useManualReceiptStores()
  const contextMutation = useManualReceiptContext()
  const createMutation = useCreateManualReceipt()

  const [storeId, setStoreId] = useState<number | undefined>()
  const [skuCode, setSkuCode] = useState('')
  const [upc, setUpc] = useState('')
  const [skuLookupOpen, setSkuLookupOpen] = useState(false)
  const [skuSearchText, setSkuSearchText] = useState('')
  const [debouncedSkuSearch, setDebouncedSkuSearch] = useState('')
  const [context, setContext] = useState<ManualReceiptContext | null>(null)
  const [unitCostOverride, setUnitCostOverride] = useState<number | null>(null)
  const [retailPriceOverride, setRetailPriceOverride] = useState<number | null>(null)
  const [referenceNumber, setReferenceNumber] = useState('')
  const [note, setNote] = useState('')
  const [storeLabelsOnReceive, setStoreLabelsOnReceive] = useState(false)
  const [movementAt, setMovementAt] = useState<Dayjs>(dayjs())
  const [casePackId, setCasePackId] = useState<string | undefined>()
  const [casePackMultiplier, setCasePackMultiplier] = useState<number>(1)
  const [cellValues, setCellValues] = useState<Record<string, number>>({})
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { data: autocompleteResults, isFetching: isSearchingSkus } = useAutocompleteSkus(debouncedSkuSearch)

  const grid = useMemo(() => normalizeGrid(context), [context])
  const onHand = useMemo(() => onHandMap(context), [context])
  const skuSearchOptions = useMemo(() => {
    if (!autocompleteResults?.length) return []
    return autocompleteResults.map((item) => ({
      value: item.skuCode,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontWeight: 500 }}>{item.skuCode}</span>
          <span
            style={{
              color: '#888',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.style}{item.brandName ? ` · ${item.brandName}` : ''}
          </span>
        </div>
      ),
    }))
  }, [autocompleteResults])

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  function resetReceiptState(keepStore = true) {
    setContext(null)
    setSkuCode('')
    setUpc('')
    setSkuSearchText('')
    setDebouncedSkuSearch('')
    setUnitCostOverride(null)
    setRetailPriceOverride(null)
    setReferenceNumber('')
    setNote('')
    setStoreLabelsOnReceive(false)
    setMovementAt(dayjs())
    setCasePackId(undefined)
    setCasePackMultiplier(1)
    setCellValues({})
    if (!keepStore) setStoreId(undefined)
  }

  async function handleLookup(next?: { skuCode?: string; upc?: string }) {
    if (storeId == null) {
      message.error('Select a store first')
      return
    }

    const trimmedSku = (next?.skuCode ?? skuCode).trim()
    const trimmedUpc = (next?.upc ?? upc).trim()

    if (!trimmedSku && !trimmedUpc) {
      message.error('Enter either a SKU code or a UPC')
      return
    }
    if (trimmedSku && trimmedUpc) {
      message.error('Use either SKU code or UPC, not both')
      return
    }

    try {
      const result = await contextMutation.mutateAsync({
        storeId,
        skuCode: trimmedSku || undefined,
        upc: trimmedUpc || undefined,
      })
      setContext(result)
      setUnitCostOverride(result.defaultUnitCost)
      setRetailPriceOverride(result.defaultRetailPrice)
      setReferenceNumber('')
      setNote('')
      setStoreLabelsOnReceive(false)
      setMovementAt(dayjs())
      setCasePackId(undefined)
      setCasePackMultiplier(1)

      const seeded: Record<string, number> = {}
      if (result.scannedUpcTarget) {
        seeded[cellKey(result.scannedUpcTarget.rowLabel, result.scannedUpcTarget.columnLabel)] = 1
      }
      setCellValues(seeded)
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to load manual receipt context')
    }
  }

  async function handleSkuPick(nextSkuCode: string) {
    setSkuCode(nextSkuCode)
    setUpc('')
    setContext(null)
    setCellValues({})
    if (storeId == null) return
    await handleLookup({ skuCode: nextSkuCode, upc: '' })
  }

  function updateCell(rowLabel: string, columnLabel: string, quantity: number | null) {
    const key = cellKey(rowLabel, columnLabel)
    setCellValues((prev) => {
      const next = { ...prev }
      const normalized = Math.max(0, Math.trunc(quantity ?? 0))
      if (normalized > 0) {
        next[key] = normalized
      } else {
        delete next[key]
      }
      return next
    })
  }

  async function handleSubmit() {
    if (!context) {
      message.error('Load a store and SKU first')
      return
    }

    const lines = Object.entries(cellValues)
      .map(([key, quantity]) => {
        const [rowLabel, columnLabel] = key.split('::')
        return { rowLabel, columnLabel, quantity: Math.trunc(quantity) }
      })
      .filter((line) => line.quantity > 0)

    if (lines.length === 0) {
      message.error('Enter at least one quantity in the size grid')
      return
    }

    const unitCostPayload =
      unitCostOverride == null || unitCostOverride === context.defaultUnitCost
        ? null
        : unitCostOverride
    const retailPricePayload =
      retailPriceOverride == null || retailPriceOverride === context.defaultRetailPrice
        ? null
        : retailPriceOverride

    try {
      const record = await createMutation.mutateAsync({
        storeId: context.storeId,
        skuId: context.skuId,
        referenceNumber: referenceNumber.trim() || null,
        storeLabelsOnReceive,
        movementAt: movementAt.toISOString(),
        unitCostOverride: unitCostPayload,
        retailPriceOverride: retailPricePayload,
        casePackId: casePackId ?? null,
        casePackMultiplier: casePackId ? casePackMultiplier : null,
        note: note.trim() || null,
        idempotencyKey: crypto.randomUUID(),
        lines,
      })
      message.success(`Manual receipt saved for ${record.skuCode}`)
      resetReceiptState(true)
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to save manual receipt')
    }
  }

  const gridColumns = [
    {
      title: 'Row',
      dataIndex: 'rowLabel',
      key: 'rowLabel',
      width: 140,
      fixed: 'left' as const,
      render: (value: string) => value || 'Qty',
    },
    ...grid.columns.map((columnLabel) => ({
      title: columnLabel || 'Qty',
      key: `col:${columnLabel}`,
      width: 130,
      render: (_: unknown, row: GridRow) => {
        const key = cellKey(row.rowLabel, columnLabel)
        const currentOnHand = onHand.get(key) ?? 0
        return (
          <Space direction="vertical" size={2}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              On hand: {currentOnHand}
            </Typography.Text>
            <InputNumber
              min={0}
              precision={0}
              step={1}
              value={cellValues[key]}
              onChange={(value) => updateCell(row.rowLabel, columnLabel, typeof value === 'number' ? value : null)}
              style={{ width: '100%' }}
            />
          </Space>
        )
      },
    })),
  ]

  const gridRows: GridRow[] = grid.rows.map((rowLabel) => ({
    key: rowLabel || '(blank)',
    rowLabel,
  }))

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small">
          <Row align="middle" justify="space-between">
            <Space>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/inventory/adjustments?tab=MANUAL_RECEIPT')}>
                Back
              </Button>
              <Typography.Title level={4} style={{ margin: 0 }}>
                Enter Manual Receipts
              </Typography.Title>
            </Space>
            <Typography.Text type="secondary">RICS Ch. 4 p. 66</Typography.Text>
          </Row>
        </Card>

        <Card title="Lookup" size="small">
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Store
              </Typography.Text>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Select store"
                value={storeId}
                loading={storesLoading}
                onChange={(value) => {
                  setStoreId(value)
                  setContext(null)
                  setCellValues({})
                }}
                style={{ width: '100%' }}
                options={(stores ?? []).map((store) => ({
                  value: store.storeId,
                  label: store.storeLabel,
                }))}
              />
            </Col>
            <Col xs={24} md={6}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                SKU
                <Button
                  type="link"
                  size="small"
                  icon={<SearchOutlined />}
                  onClick={() => setSkuLookupOpen(true)}
                  style={{ padding: 0, marginLeft: 8, height: 'auto', lineHeight: 1 }}
                >
                  Lookup
                </Button>
              </Typography.Text>
              <AutoComplete
                value={skuCode}
                options={skuSearchOptions}
                onSearch={(text) => {
                  setSkuCode(text)
                  setSkuSearchText(text)
                  setContext(null)
                  setCellValues({})
                  if (debounceTimer.current) clearTimeout(debounceTimer.current)
                  debounceTimer.current = setTimeout(() => setDebouncedSkuSearch(text), 300)
                }}
                onSelect={(value: string) => {
                  void handleSkuPick(value)
                }}
                notFoundContent={isSearchingSkus ? 'Searching...' : undefined}
                style={{ width: '100%' }}
              >
                <Input
                  onPressEnter={() => void handleLookup()}
                  placeholder="Enter or search SKU code"
                />
              </AutoComplete>
            </Col>
            <Col xs={24} md={6}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                UPC
              </Typography.Text>
              <Input
                value={upc}
                onChange={(e) => {
                  setUpc(e.target.value)
                  setContext(null)
                  setCellValues({})
                }}
                onPressEnter={() => void handleLookup()}
                placeholder="Scan or enter UPC"
              />
            </Col>
            <Col xs={24} md={4}>
              <Typography.Text type="secondary" style={{ fontSize: 12, visibility: 'hidden' }}>
                Load
              </Typography.Text>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                loading={contextMutation.isPending}
                onClick={() => void handleLookup()}
                block
              >
                Load
              </Button>
            </Col>
          </Row>

          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            Enter one SKU at a time for one store. Use either SKU code or UPC, then save the size-grid quantities for that SKU.
          </Typography.Paragraph>
        </Card>

        {context ? (
          <>
            <Card title="SKU Summary" size="small">
              <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
                <Descriptions.Item label="Store">{context.storeLabel}</Descriptions.Item>
                <Descriptions.Item label="SKU">{context.skuCode}</Descriptions.Item>
                <Descriptions.Item label="Category">{context.categoryNumber ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="Description">{context.description ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="Vendor">{context.vendorName ?? context.vendorCode ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="Vendor SKU">{context.vendorSku ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="Style / Color">{context.styleColor ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="Default Cost">{context.defaultUnitCost ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="Default Retail">{context.defaultRetailPrice ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="Last Received" span={3}>
                  {context.lastReceivedAt ? dayjs(context.lastReceivedAt).format('YYYY-MM-DD HH:mm') : 'No receipt history yet'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {context.scannedUpcTarget && (
              <Alert
                type="info"
                showIcon
                message={`UPC resolved to ${context.scannedUpcTarget.columnLabel || '(blank)'} / ${context.scannedUpcTarget.rowLabel || '(blank)'}. Quantity 1 has been prefilled.`}
              />
            )}

            <Card title="Receipt Details" size="small">
              <Row gutter={[16, 16]}>
                <Col xs={24} md={8}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Movement Time
                  </Typography.Text>
                  <DatePicker
                    showTime
                    style={{ width: '100%' }}
                    value={movementAt}
                    onChange={(value) => setMovementAt(value ?? dayjs())}
                  />
                </Col>
                <Col xs={24} md={8}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Unit Cost
                  </Typography.Text>
                  <InputNumber
                    min={0}
                    precision={2}
                    value={unitCostOverride ?? undefined}
                    onChange={(value) => setUnitCostOverride(typeof value === 'number' ? value : null)}
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col xs={24} md={8}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Retail Price
                  </Typography.Text>
                  <InputNumber
                    min={0}
                    precision={2}
                    value={retailPriceOverride ?? undefined}
                    onChange={(value) => setRetailPriceOverride(typeof value === 'number' ? value : null)}
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col xs={24} md={8}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Reference Number
                  </Typography.Text>
                  <Input
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Optional reference"
                  />
                </Col>
                <Col xs={24} md={8}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Case Pack
                  </Typography.Text>
                  <Select
                    allowClear
                    disabled={context.availableCasePacks.length === 0}
                    placeholder={
                      context.availableCasePacks.length === 0 ? 'No case packs available yet' : 'Select case pack'
                    }
                    value={casePackId}
                    onChange={(value) => setCasePackId(value)}
                    style={{ width: '100%' }}
                    options={context.availableCasePacks.map((pack) => ({
                      value: pack.id,
                      label: `${pack.code} - ${pack.description}`,
                    }))}
                  />
                </Col>
                <Col xs={24} md={8}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Case Pack Multiplier
                  </Typography.Text>
                  <InputNumber
                    min={1}
                    precision={0}
                    disabled={!casePackId}
                    value={casePackMultiplier}
                    onChange={(value) => setCasePackMultiplier(typeof value === 'number' ? value : 1)}
                    style={{ width: '100%' }}
                  />
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Note
                  </Typography.Text>
                  <Input.TextArea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional operator note"
                  />
                </Col>
                <Col span={24}>
                  <Checkbox
                    checked={storeLabelsOnReceive}
                    onChange={(e) => setStoreLabelsOnReceive(e.target.checked)}
                  >
                    Store labels for received items
                  </Checkbox>
                </Col>
              </Row>
            </Card>

            <Card title="Quantities Received" size="small">
              {gridRows.length > 0 ? (
                <Table<GridRow>
                  dataSource={gridRows}
                  columns={gridColumns}
                  rowKey="key"
                  pagination={false}
                  size="small"
                  scroll={{ x: Math.max(720, 140 + grid.columns.length * 130) }}
                />
              ) : (
                <Empty description="No size grid is available for this SKU." />
              )}
              <Divider />
              <Space>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={createMutation.isPending}
                  onClick={() => void handleSubmit()}
                >
                  Save Receipt
                </Button>
                <Button onClick={() => resetReceiptState(true)}>Clear SKU</Button>
              </Space>
            </Card>
          </>
        ) : (
          <Card>
            <Empty description="Select a store and load a SKU or UPC to begin entering a manual receipt." />
          </Card>
        )}

        <SkuLookup
          open={skuLookupOpen}
          onClose={() => setSkuLookupOpen(false)}
          onSelect={(picked) => {
            setSkuLookupOpen(false)
            void handleSkuPick(picked.skuCode)
          }}
          initialQuery={skuCode}
        />
      </Space>
    </App>
  )
}
