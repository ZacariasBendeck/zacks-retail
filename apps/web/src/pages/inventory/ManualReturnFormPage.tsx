import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs, { type Dayjs } from 'dayjs'
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  SearchOutlined,
  FundOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useAutocompleteSkus } from '../../hooks/useSkus'
import {
  useCreateManualReturn,
  useManualReturnContext,
  useManualReturnStores,
} from '../../hooks/useManualReturns'
import { SkuLookup } from '../../components/sku-lookup'
import {
  STOCK_MAINTENANCE_LAST_STORE_KEY,
  StockMaintenanceCellMatrix,
  StockMaintenanceHero,
  persistNumber,
  readPersistedNumber,
  stockCellKey,
} from '../../components/stock-maintenance'
import type { ManualReturnContext } from '../../types/manualReturn'

function normalizeGrid(context: ManualReturnContext | null): { columns: string[]; rows: string[] } {
  if (!context) return { columns: [], rows: [] }
  return {
    columns: context.sizeGrid.columns.length > 0 ? context.sizeGrid.columns : [''],
    rows: context.sizeGrid.rows.length > 0 ? context.sizeGrid.rows : [''],
  }
}

function onHandMap(context: ManualReturnContext | null): Map<string, number> {
  const map = new Map<string, number>()
  for (const cell of context?.currentOnHandByCell ?? []) {
    map.set(stockCellKey(cell.rowLabel, cell.columnLabel), cell.quantityOnHand)
  }
  return map
}

export default function ManualReturnFormPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data: stores, isLoading: storesLoading } = useManualReturnStores()
  const contextMutation = useManualReturnContext()
  const createMutation = useCreateManualReturn()

  const [storeId, setStoreId] = useState<number | undefined>()
  const [skuCode, setSkuCode] = useState('')
  const [upc, setUpc] = useState('')
  const [skuLookupOpen, setSkuLookupOpen] = useState(false)
  const [debouncedSkuSearch, setDebouncedSkuSearch] = useState('')
  const [context, setContext] = useState<ManualReturnContext | null>(null)
  const [unitCostOverride, setUnitCostOverride] = useState<number | null>(null)
  const [returnReasonCode, setReturnReasonCode] = useState('')
  const [rmaNumber, setRmaNumber] = useState('')
  const [note, setNote] = useState('')
  const [movementAt, setMovementAt] = useState<Dayjs>(dayjs())
  const [casePackId, setCasePackId] = useState<string | undefined>()
  const [casePackMultiplier, setCasePackMultiplier] = useState<number>(1)
  const [cellValues, setCellValues] = useState<Record<string, number>>({})
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { data: autocompleteResults, isFetching: isSearchingSkus } = useAutocompleteSkus(debouncedSkuSearch)

  const grid = useMemo(() => normalizeGrid(context), [context])
  const onHand = useMemo(() => onHandMap(context), [context])
  const totalUnits = useMemo(
    () => Object.values(cellValues).reduce((sum, quantity) => sum + Math.trunc(quantity || 0), 0),
    [cellValues],
  )
  const affectedCells = useMemo(
    () => Object.values(cellValues).filter((quantity) => Math.trunc(quantity || 0) > 0).length,
    [cellValues],
  )
  const currentUnits = useMemo(
    () => (context?.currentOnHandByCell ?? []).reduce((sum, cell) => sum + cell.quantityOnHand, 0),
    [context],
  )
  const projectedUnits = Math.max(0, currentUnits - totalUnits)
  const selectedStoreLabel = useMemo(() => {
    if (storeId == null) return 'Choose a store'
    return stores?.find((store) => store.storeId === storeId)?.storeLabel ?? `Store ${storeId}`
  }, [storeId, stores])
  const skuSearchOptions = useMemo(() => {
    if (!autocompleteResults?.length) return []
    return autocompleteResults.map((item) => ({
      value: item.skuCode,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontWeight: 500 }}>{item.skuCode}</span>
          <span
            style={{
              color: '#64748b',
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

  useEffect(() => {
    if (storeId != null || !stores?.length) return
    const savedStoreId = readPersistedNumber(STOCK_MAINTENANCE_LAST_STORE_KEY)
    if (savedStoreId != null && stores.some((store) => store.storeId === savedStoreId)) {
      setStoreId(savedStoreId)
    }
  }, [storeId, stores])

  useEffect(() => {
    persistNumber(STOCK_MAINTENANCE_LAST_STORE_KEY, storeId)
  }, [storeId])

  function resetReturnState(keepStore = true) {
    setContext(null)
    setSkuCode('')
    setUpc('')
    setDebouncedSkuSearch('')
    setUnitCostOverride(null)
    setReturnReasonCode('')
    setRmaNumber('')
    setNote('')
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
      setReturnReasonCode('')
      setRmaNumber('')
      setNote('')
      setMovementAt(dayjs())
      setCasePackId(undefined)
      setCasePackMultiplier(1)

      const seeded: Record<string, number> = {}
      if (result.scannedUpcTarget) {
        seeded[stockCellKey(result.scannedUpcTarget.rowLabel, result.scannedUpcTarget.columnLabel)] = 1
      }
      setCellValues(seeded)
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to load manual return context')
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
    const key = stockCellKey(rowLabel, columnLabel)
    const currentOnHand = onHand.get(key) ?? 0
    setCellValues((prev) => {
      const next = { ...prev }
      const normalized = Math.max(0, Math.trunc(quantity ?? 0))
      if (normalized > 0) {
        next[key] = Math.min(normalized, currentOnHand)
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
        const [rawRowLabel = '', rawColumnLabel = ''] = key.split('::')
        return { rowLabel: rawRowLabel, columnLabel: rawColumnLabel, quantity: Math.trunc(quantity) }
      })
      .filter((line) => line.quantity > 0)

    if (lines.length === 0) {
      message.error('Enter at least one quantity in the size grid')
      return
    }

    const overReturn = lines.find((line) => {
      const available = onHand.get(stockCellKey(line.rowLabel, line.columnLabel)) ?? 0
      return line.quantity > available
    })
    if (overReturn) {
      message.error(`Return quantity exceeds on hand for ${overReturn.columnLabel || '(blank)'} / ${overReturn.rowLabel || '(blank)'}`)
      return
    }

    const unitCostPayload =
      unitCostOverride == null || unitCostOverride === context.defaultUnitCost
        ? null
        : unitCostOverride

    try {
      const record = await createMutation.mutateAsync({
        storeId: context.storeId,
        skuId: context.skuId,
        returnReasonCode: returnReasonCode.trim() || null,
        rmaNumber: rmaNumber.trim() || null,
        movementAt: movementAt.toISOString(),
        unitCostOverride: unitCostPayload,
        casePackId: casePackId ?? null,
        casePackMultiplier: casePackId ? casePackMultiplier : null,
        note: note.trim() || null,
        idempotencyKey: crypto.randomUUID(),
        lines,
      })
      message.success(`Manual return saved for ${record.skuCode}`)
      resetReturnState(true)
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to save manual return')
    }
  }

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <StockMaintenanceHero
          eyebrow="Stock Maintenance"
          title="Manual Return"
          subtitle="Decrease on-hand from the app-owned inventory ledger with a visible guardrail against over-return. The same sticky store behavior from receiving keeps repeated cleanup work fast."
          ricsReference="RICS Ch. 4 p. 66"
          metrics={[
            { label: 'Store', value: selectedStoreLabel },
            { label: 'SKU', value: context?.skuCode ?? 'Load a SKU' },
            { label: 'Units to remove', value: totalUnits },
            { label: 'Projected remaining', value: projectedUnits },
          ]}
          actions={
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Text style={{ color: 'rgba(248, 250, 252, 0.82)', fontWeight: 600 }}>
                Operator actions
              </Typography.Text>
              <Space wrap>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/inventory/adjustments?tab=MANUAL_RETURN')}>
                  Back to workspace
                </Button>
                <Button
                  icon={<FundOutlined />}
                  disabled={!context}
                  onClick={() => navigate(context ? `/inventory/replenishment?sku=${encodeURIComponent(context.skuCode)}` : '/inventory/replenishment')}
                >
                  Model Quantities
                </Button>
                <Button
                  icon={<SearchOutlined />}
                  disabled={!context}
                  onClick={() => navigate(context ? `/inventory/find-by-size?seedSku=${encodeURIComponent(context.skuCode)}` : '/inventory/find-by-size')}
                >
                  Find by Size
                </Button>
              </Space>
            </Space>
          }
          footer={
            <Typography.Text style={{ color: 'rgba(248, 250, 252, 0.82)' }}>
              Save clears the SKU panel but keeps the store in place for the next correction or vendor return.
            </Typography.Text>
          }
        />

        <Row gutter={[16, 16]} align="top">
          <Col xs={24} xl={8}>
            <div style={{ position: 'sticky', top: 16 }}>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Card
                  bordered={false}
                  style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
                  title="Lookup"
                >
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <div>
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
                        style={{ width: '100%', marginTop: 6 }}
                        options={(stores ?? []).map((store) => ({
                          value: store.storeId,
                          label: store.storeLabel,
                        }))}
                      />
                    </div>

                    <div>
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
                          setContext(null)
                          setCellValues({})
                          if (debounceTimer.current) clearTimeout(debounceTimer.current)
                          debounceTimer.current = setTimeout(() => setDebouncedSkuSearch(text), 300)
                        }}
                        onSelect={(value: string) => {
                          void handleSkuPick(value)
                        }}
                        notFoundContent={isSearchingSkus ? 'Searching...' : undefined}
                        style={{ width: '100%', marginTop: 6 }}
                      >
                        <Input onPressEnter={() => void handleLookup()} placeholder="Enter or search SKU code" />
                      </AutoComplete>
                    </div>

                    <div>
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
                        style={{ marginTop: 6 }}
                      />
                    </div>

                    <Row gutter={12}>
                      <Col span={12}>
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
                      <Col span={12}>
                        <Button icon={<ReloadOutlined />} onClick={() => resetReturnState(false)} block>
                          Change store
                        </Button>
                      </Col>
                    </Row>

                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      Show the current store and SKU first, then key only the quantities leaving stock.
                    </Typography.Paragraph>
                  </Space>
                </Card>

                {context ? (
                  <Card
                    bordered={false}
                    style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
                    title="Return details"
                  >
                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Movement time
                        </Typography.Text>
                        <DatePicker
                          showTime
                          style={{ width: '100%', marginTop: 6 }}
                          value={movementAt}
                          onChange={(value) => setMovementAt(value ?? dayjs())}
                        />
                      </div>

                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Unit cost
                        </Typography.Text>
                        <InputNumber
                          min={0}
                          precision={2}
                          value={unitCostOverride ?? undefined}
                          onChange={(value) => setUnitCostOverride(typeof value === 'number' ? value : null)}
                          style={{ width: '100%', marginTop: 6 }}
                        />
                      </div>

                      <Row gutter={12}>
                        <Col span={12}>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            Return reason
                          </Typography.Text>
                          <Input
                            value={returnReasonCode}
                            onChange={(e) => setReturnReasonCode(e.target.value)}
                            placeholder="Optional reason code"
                            style={{ marginTop: 6 }}
                          />
                        </Col>
                        <Col span={12}>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            RMA number
                          </Typography.Text>
                          <Input
                            value={rmaNumber}
                            onChange={(e) => setRmaNumber(e.target.value)}
                            placeholder="Optional RMA"
                            style={{ marginTop: 6 }}
                          />
                        </Col>
                      </Row>

                      <Row gutter={12}>
                        <Col span={12}>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            Case pack
                          </Typography.Text>
                          <Select
                            allowClear
                            disabled={context.availableCasePacks.length === 0}
                            placeholder={context.availableCasePacks.length === 0 ? 'Not wired yet' : 'Select case pack'}
                            value={casePackId}
                            onChange={(value) => setCasePackId(value)}
                            style={{ width: '100%', marginTop: 6 }}
                            options={context.availableCasePacks.map((pack) => ({
                              value: pack.id,
                              label: `${pack.code} - ${pack.description}`,
                            }))}
                          />
                        </Col>
                        <Col span={12}>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            Pack multiplier
                          </Typography.Text>
                          <InputNumber
                            min={1}
                            precision={0}
                            disabled={!casePackId}
                            value={casePackMultiplier}
                            onChange={(value) => setCasePackMultiplier(typeof value === 'number' ? value : 1)}
                            style={{ width: '100%', marginTop: 6 }}
                          />
                        </Col>
                      </Row>

                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Note
                        </Typography.Text>
                        <Input.TextArea
                          rows={3}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Optional operator note"
                          style={{ marginTop: 6 }}
                        />
                      </div>
                    </Space>
                  </Card>
                ) : null}
              </Space>
            </div>
          </Col>

          <Col xs={24} xl={16}>
            {context ? (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Card
                  bordered={false}
                  style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
                  title="SKU context"
                >
                  <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
                    <Descriptions.Item label="Store">{context.storeLabel}</Descriptions.Item>
                    <Descriptions.Item label="SKU">{context.skuCode}</Descriptions.Item>
                    <Descriptions.Item label="Category">{context.categoryNumber ?? '-'}</Descriptions.Item>
                    <Descriptions.Item label="Description">{context.description ?? '-'}</Descriptions.Item>
                    <Descriptions.Item label="Vendor">{context.vendorName ?? context.vendorCode ?? '-'}</Descriptions.Item>
                    <Descriptions.Item label="Vendor SKU">{context.vendorSku ?? '-'}</Descriptions.Item>
                    <Descriptions.Item label="Style / Color">{context.styleColor ?? '-'}</Descriptions.Item>
                    <Descriptions.Item label="Default cost">{context.defaultUnitCost ?? '-'}</Descriptions.Item>
                  </Descriptions>
                </Card>

                {context.scannedUpcTarget ? (
                  <Alert
                    type="info"
                    showIcon
                    message={`UPC resolved to ${context.scannedUpcTarget.columnLabel || '(blank)'} / ${context.scannedUpcTarget.rowLabel || '(blank)'}. Quantity 1 has been prefilled.`}
                  />
                ) : null}

                <Alert
                  type="warning"
                  showIcon
                  message="Returns reduce live on-hand immediately."
                  description="Projected remaining quantities are shown in every size cell. The save path rejects any line that would drop on-hand below zero."
                />

                <Card
                  bordered={false}
                  style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
                  title="Return quantities"
                  extra={
                    <Space size="large">
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Affected cells
                        </Typography.Text>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{affectedCells}</div>
                      </div>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Units to remove
                        </Typography.Text>
                        <div style={{ fontWeight: 700, fontSize: 18, color: '#b42318' }}>{totalUnits}</div>
                      </div>
                    </Space>
                  }
                >
                  <StockMaintenanceCellMatrix
                    mode="return"
                    columns={grid.columns}
                    rows={grid.rows}
                    values={cellValues}
                    onHandByCell={onHand}
                    onChange={updateCell}
                  />
                </Card>

                <Card
                  bordered={false}
                  style={{
                    position: 'sticky',
                    bottom: 16,
                    borderRadius: 20,
                    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                    boxShadow: '0 18px 44px rgba(15, 23, 42, 0.1)',
                  }}
                >
                  <Row align="middle" justify="space-between" gutter={[16, 16]}>
                    <Col flex="auto">
                      <Space size={24} wrap>
                        <div>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            Current on hand
                          </Typography.Text>
                          <div style={{ fontSize: 22, fontWeight: 700 }}>{currentUnits}</div>
                        </div>
                        <div>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            Projected remaining
                          </Typography.Text>
                          <div style={{ fontSize: 22, fontWeight: 700, color: '#b42318' }}>{projectedUnits}</div>
                        </div>
                        <div>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            Cost applied
                          </Typography.Text>
                          <div style={{ fontSize: 18, fontWeight: 700 }}>{unitCostOverride ?? '-'}</div>
                        </div>
                      </Space>
                    </Col>
                    <Col>
                      <Space wrap>
                        <Button onClick={() => resetReturnState(true)}>Clear SKU</Button>
                        <Button icon={<ReloadOutlined />} onClick={() => resetReturnState(false)}>
                          Change store
                        </Button>
                        <Button
                          type="primary"
                          danger
                          icon={<SaveOutlined />}
                          loading={createMutation.isPending}
                          onClick={() => void handleSubmit()}
                        >
                          Save return
                        </Button>
                      </Space>
                    </Col>
                  </Row>
                </Card>
              </Space>
            ) : (
              <Card
                bordered={false}
                style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
              >
                <Empty description="Select a store and load a SKU or UPC to begin entering a manual return." />
              </Card>
            )}
          </Col>
        </Row>

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
