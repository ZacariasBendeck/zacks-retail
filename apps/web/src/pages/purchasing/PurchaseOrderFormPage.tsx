import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  PlusOutlined,
  SaveOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  useCreatePurchaseOrder,
  usePurchaseOrder,
  usePurchaseOrderBuyerOptions,
  usePurchaseOrderSkuOptions,
  usePurchaseOrderVendorOptions,
  useUpdatePurchaseOrder,
} from '../../hooks/usePurchaseOrders'
import { SkuLookup } from '../../components/sku-lookup'
import { fetchPurchaseOrderSkuOptions } from '../../services/purchaseOrderApi'
import { sizeTypesApi } from '../../services/productsTaxonomyApi'
import {
  fetchCasePackByCode,
  fetchCasePacks,
  type CasePackSummary,
} from '../../services/casePackApi'

interface LineItemRow {
  key: string
  skuId: string
  skuLabel?: string
  sizeType?: number | null
  sizeColumns?: string[]
  sizeRows?: string[]
  sizeCells?: Record<string, number>
  casePacks?: CasePackSummary[]
  casePackId?: string | null
  casePackMultiplier?: number | null
  quantity: number
  unitCost: number
}

interface PurchaseOrderFormValues {
  poNumber?: string
  status?: 'DRAFT'
  billToStoreId?: number
  shipToStoreId?: number
  vendorId: string
  buyer?: string
  orderType?: 'RO' | 'RE' | 'SA'
  classification?: 'AT_ONCE' | 'FUTURE'
  confirmationNumber?: string
  accountNumber?: string
  terms?: string
  shipVia?: string
  backorderAllowed?: boolean
  splitShipment?: boolean
  storeLabelsOnReceive?: boolean
  orderDate?: string
  shipDate?: string
  cancelDate?: string
  paymentDate?: string
  notes?: string
}

const cellKey = (columnLabel: string, rowLabel = '') => `${columnLabel}\u0000${rowLabel}`

// Currency is Honduran Lempira (HNL) system-wide — labeled once at the top of
// the page, not repeated in every cell (see CLAUDE.md "Currency" policy).
function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function PurchaseOrderFormPage() {
  const navigate = useNavigate()
  const { poId } = useParams<{ poId: string }>()
  const { message } = App.useApp()
  const [form] = Form.useForm<PurchaseOrderFormValues>()
  const createMutation = useCreatePurchaseOrder()
  const updateMutation = useUpdatePurchaseOrder()
  const isEditMode = Boolean(poId)
  const { data: existingPo, isLoading: existingPoLoading } = usePurchaseOrder(poId)

  const [lineItems, setLineItems] = useState<LineItemRow[]>([
    { key: crypto.randomUUID(), skuId: '', quantity: 1, unitCost: 1 },
  ])
  const [loadedPoId, setLoadedPoId] = useState<string | null>(null)
  const [vendorSearch, setVendorSearch] = useState('')
  const [skuSearch, setSkuSearch] = useState('')
  const [lookupLineKey, setLookupLineKey] = useState<string | null>(null)
  const selectedVendorId = Form.useWatch('vendorId', form)

  const { data: vendors, isFetching: vendorsFetching } = usePurchaseOrderVendorOptions(vendorSearch)
  const { data: buyerOptions } = usePurchaseOrderBuyerOptions()
  const { data: skuOptions, isFetching: skusFetching } = usePurchaseOrderSkuOptions({
    q: skuSearch,
    vendorId: selectedVendorId,
  })

  const vendorSelectOptions = useMemo(() => {
    const options = (vendors ?? []).map((vendor) => ({
      value: vendor.id,
      label: `${vendor.id} - ${vendor.name}`,
    }))
    if (
      existingPo?.vendorId &&
      !options.some((option) => option.value === existingPo.vendorId)
    ) {
      options.unshift({
        value: existingPo.vendorId,
        label: `${existingPo.vendorId} - ${existingPo.vendorName ?? existingPo.vendorId}`,
      })
    }
    return options
  }, [existingPo?.vendorId, existingPo?.vendorName, vendors])

  const skuSelectOptions = useMemo(
    () => (skuOptions ?? []).map((sku) => ({
      value: sku.id,
      label: [
        sku.skuCode,
        sku.description || sku.styleColor,
        sku.vendorId ? `Vendor ${sku.vendorId}` : null,
        sku.category != null ? `Cat ${sku.category}` : null,
      ].filter(Boolean).join(' - '),
    })),
    [skuOptions],
  )

  const buyerSelectOptions = useMemo(() => {
    const options = (buyerOptions ?? []).map((buyer) => ({
      value: buyer.id,
      label: `${buyer.label} (${buyer.id})`,
    }))
    if (existingPo?.buyer && !options.some((option) => option.value === existingPo.buyer)) {
      options.unshift({ value: existingPo.buyer, label: existingPo.buyer })
    }
    return options
  }, [buyerOptions, existingPo?.buyer])

  const buildSkuLabel = (sku: {
    skuCode: string
    description: string | null
    styleColor: string | null
    vendorId: string | null
    category: number | null
  }) => [
    sku.skuCode,
    sku.description || sku.styleColor,
    sku.vendorId ? `Vendor ${sku.vendorId}` : null,
    sku.category != null ? `Cat ${sku.category}` : null,
  ].filter(Boolean).join(' - ')

  const loadSizeGrid = async (sizeType: number | null | undefined) => {
    if (sizeType == null) return { sizeColumns: [] as string[], sizeRows: [] as string[] }
    try {
      const details = await sizeTypesApi.get(sizeType)
      return { sizeColumns: details.columns ?? [], sizeRows: details.rows ?? [] }
    } catch {
      return { sizeColumns: [] as string[], sizeRows: [] as string[] }
    }
  }

  const loadCasePacks = async (sizeType: number | null | undefined) => {
    if (sizeType == null) return [] as CasePackSummary[]
    try {
      const packs = await fetchCasePacks({ sizeTypeCode: sizeType })
      return packs.filter((pack) => pack.active)
    } catch {
      return [] as CasePackSummary[]
    }
  }

  const lineQuantity = (line: LineItemRow) => {
    const sizeTotal = Object.values(line.sizeCells ?? {}).reduce((sum, value) => sum + (Number(value) || 0), 0)
    return sizeTotal > 0 ? sizeTotal : line.quantity
  }

  const lineSizeCells = (line: LineItemRow) => {
    const cells: Array<{ columnLabel: string; rowLabel: string; quantity: number }> = []
    for (const [key, rawQty] of Object.entries(line.sizeCells ?? {})) {
      const quantity = Math.trunc(Number(rawQty) || 0)
      if (quantity <= 0) continue
      const [columnLabel = '', rowLabel = ''] = key.split('\u0000')
      cells.push({ columnLabel, rowLabel, quantity })
    }
    return cells
  }

  const toDateInput = (value: string | null | undefined) => value ? value.slice(0, 10) : undefined

  useEffect(() => {
    if (!existingPo || loadedPoId === existingPo.id) return
    const po = existingPo

    form.setFieldsValue({
      poNumber: po.poNumber,
      status: 'DRAFT',
      billToStoreId: po.billToStoreId ?? undefined,
      shipToStoreId: po.shipToStoreId ?? undefined,
      vendorId: po.vendorId,
      buyer: po.buyer ?? undefined,
      orderType: po.orderType === 'RE' || po.orderType === 'SA' ? po.orderType : 'RO',
      classification: po.classification === 'FUTURE' ? 'FUTURE' : 'AT_ONCE',
      confirmationNumber: po.confirmationNumber ?? undefined,
      accountNumber: po.accountNumber ?? undefined,
      terms: po.terms ?? undefined,
      shipVia: po.shipVia ?? undefined,
      backorderAllowed: po.backorderAllowed,
      splitShipment: po.splitShipment,
      storeLabelsOnReceive: po.storeLabelsOnReceive,
      orderDate: toDateInput(po.orderDate),
      shipDate: toDateInput(po.shipDate),
      cancelDate: toDateInput(po.cancelDate),
      paymentDate: toDateInput(po.paymentDate),
      notes: po.notes ?? undefined,
    })

    let cancelled = false
    async function hydrateLines() {
      const rows = await Promise.all(po.lineItems.map(async (line) => {
        const [{ sizeColumns, sizeRows }, casePacks] = await Promise.all([
          loadSizeGrid(line.sizeType),
          loadCasePacks(line.sizeType),
        ])
        const sizeCells: Record<string, number> = {}
        for (const cell of line.sizeCells ?? []) {
          if (cell.quantity > 0) sizeCells[cellKey(cell.columnLabel, cell.rowLabel)] = cell.quantity
        }
        return {
          key: line.id,
          skuId: line.skuId,
          skuLabel: [
            line.skuCode,
            line.brand,
          ].filter(Boolean).join(' - '),
          sizeType: line.sizeType,
          sizeColumns,
          sizeRows,
          sizeCells,
          casePacks,
          casePackId: line.casePackId,
          casePackMultiplier: line.casePackMultiplier,
          quantity: line.quantityOrdered,
          unitCost: line.unitCost,
        } satisfies LineItemRow
      }))
      if (cancelled) return
      setLineItems(rows.length > 0 ? rows : [{ key: crypto.randomUUID(), skuId: '', quantity: 1, unitCost: 1 }])
      setLoadedPoId(po.id)
    }

    hydrateLines()
    return () => {
      cancelled = true
    }
  }, [existingPo, form, loadedPoId])

  const addLineItem = () => {
    setLineItems((prev) => [...prev, { key: crypto.randomUUID(), skuId: '', quantity: 1, unitCost: 1 }])
  }

  const removeLineItem = (key: string) => {
    setLineItems((prev) => prev.filter((line) => line.key !== key))
  }

  const updateLineItem = (
    key: string,
    field: 'skuId' | 'quantity' | 'unitCost',
    value: string | number,
  ) => {
    setLineItems((prev) =>
      prev.map((line) => (line.key === key ? { ...line, [field]: value } : line)),
    )
  }

  const handleSkuChange = async (record: LineItemRow, skuId: string) => {
    const selectedSku = skuOptions?.find((sku) => sku.id === skuId)
    const skuLabel = selectedSku ? buildSkuLabel(selectedSku) : record.skuLabel
    const [{ sizeColumns, sizeRows }, casePacks] = await Promise.all([
      loadSizeGrid(selectedSku?.sizeType),
      loadCasePacks(selectedSku?.sizeType),
    ])
    setLineItems((prev) =>
      prev.map((line) => {
        if (line.key !== record.key) return line
        const nextUnitCost = selectedSku?.unitCost && selectedSku.unitCost > 0
          ? selectedSku.unitCost
          : line.unitCost
        return {
          ...line,
          skuId,
          skuLabel,
          sizeType: selectedSku?.sizeType,
          sizeColumns,
          sizeRows,
          sizeCells: {},
          casePacks,
          casePackId: null,
          casePackMultiplier: null,
          quantity: sizeColumns.length > 0 ? 0 : line.quantity,
          unitCost: nextUnitCost,
        }
      }),
    )
  }

  const handleLookupSelect = async (picked: { skuCode: string; skuId: string }) => {
    if (!lookupLineKey) return
    try {
      const matches = await fetchPurchaseOrderSkuOptions({
        q: picked.skuCode,
        vendorId: selectedVendorId,
        pageSize: 10,
      })
      const selectedSku =
        matches.find((sku) => sku.skuCode.toUpperCase() === picked.skuCode.toUpperCase()) ?? matches[0]
      if (!selectedSku) {
        message.error(`SKU ${picked.skuCode} is not available for purchase orders`)
        return
      }
      const skuLabel = buildSkuLabel(selectedSku)
      const [{ sizeColumns, sizeRows }, casePacks] = await Promise.all([
        loadSizeGrid(selectedSku.sizeType),
        loadCasePacks(selectedSku.sizeType),
      ])
      setLineItems((prev) =>
        prev.map((line) => {
          if (line.key !== lookupLineKey) return line
          const nextUnitCost = selectedSku.unitCost && selectedSku.unitCost > 0
            ? selectedSku.unitCost
            : line.unitCost
          return {
            ...line,
            skuId: selectedSku.id,
            skuLabel,
            sizeType: selectedSku.sizeType,
            sizeColumns,
            sizeRows,
            sizeCells: {},
            casePacks,
            casePackId: null,
            casePackMultiplier: null,
            quantity: sizeColumns.length > 0 ? 0 : line.quantity,
            unitCost: nextUnitCost,
          }
        }),
      )
      setLookupLineKey(null)
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to select SKU')
    }
  }

  const updateSizeCell = (lineKey: string, columnLabel: string, rowLabel: string, quantity: number | null) => {
    setLineItems((prev) =>
      prev.map((line) => {
        if (line.key !== lineKey) return line
        const nextCells = { ...(line.sizeCells ?? {}) }
        const key = cellKey(columnLabel, rowLabel)
        const nextQty = Math.trunc(Number(quantity) || 0)
        if (nextQty > 0) nextCells[key] = nextQty
        else delete nextCells[key]
        const nextTotal = Object.values(nextCells).reduce((sum, value) => sum + (Number(value) || 0), 0)
        return { ...line, sizeCells: nextCells, quantity: nextTotal }
      }),
    )
  }

  const applyCasePackToLine = async (lineKey: string, casePackId: string, multiplier: number) => {
    try {
      const pack = await fetchCasePackByCode(casePackId)
      const safeMultiplier = Math.max(1, Math.trunc(Number(multiplier) || 1))
      const nextCells: Record<string, number> = {}
      for (const cell of pack.cells) {
        const quantity = Math.trunc(Number(cell.quantity) || 0) * safeMultiplier
        if (quantity > 0) nextCells[cellKey(cell.columnLabel, cell.rowLabel)] = quantity
      }
      const nextTotal = Object.values(nextCells).reduce((sum, value) => sum + value, 0)
      setLineItems((prev) =>
        prev.map((line) =>
          line.key === lineKey
            ? {
                ...line,
                casePackId: pack.code,
                casePackMultiplier: safeMultiplier,
                sizeCells: nextCells,
                quantity: nextTotal,
              }
            : line,
        ),
      )
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to load case pack')
    }
  }

  const handleCasePackChange = async (record: LineItemRow, casePackId: string | undefined) => {
    if (!casePackId) {
      setLineItems((prev) =>
        prev.map((line) =>
          line.key === record.key
            ? { ...line, casePackId: null, casePackMultiplier: null }
            : line,
        ),
      )
      return
    }
    await applyCasePackToLine(record.key, casePackId, record.casePackMultiplier ?? 1)
  }

  const handleCasePackMultiplierChange = async (record: LineItemRow, value: number | null) => {
    const multiplier = Math.max(1, Math.trunc(Number(value) || 1))
    if (!record.casePackId) {
      setLineItems((prev) =>
        prev.map((line) =>
          line.key === record.key ? { ...line, casePackMultiplier: multiplier } : line,
        ),
      )
      return
    }
    await applyCasePackToLine(record.key, record.casePackId, multiplier)
  }

  const toIsoDate = (value: string | undefined) => value ? new Date(`${value}T00:00:00`).toISOString() : null

  const handleSubmit = async (values: PurchaseOrderFormValues) => {
    const validLines = lineItems.filter((line) => line.skuId)
    if (validLines.length === 0) {
      message.error('Add at least one SKU line item')
      return
    }

    for (const line of validLines) {
      const quantity = lineQuantity(line)
      if ((line.sizeColumns?.length ?? 0) > 0 && lineSizeCells(line).length === 0) {
        message.error('Enter size quantities for each selected SKU')
        return
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        message.error('Line quantities must be positive integers')
        return
      }
      if (line.unitCost <= 0) {
        message.error('Unit cost must be greater than zero')
        return
      }
    }

    try {
      const payload = {
        poNumber: values.poNumber?.trim() || null,
        billToStoreId: values.billToStoreId ?? null,
        shipToStoreId: values.shipToStoreId ?? null,
        vendorId: values.vendorId,
        buyer: values.buyer?.trim() || null,
        notes: values.notes?.trim() || null,
        orderType: values.orderType ?? 'RO',
        classification: values.classification ?? 'AT_ONCE',
        confirmationNumber: values.confirmationNumber?.trim() || null,
        accountNumber: values.accountNumber?.trim() || null,
        terms: values.terms?.trim() || null,
        shipVia: values.shipVia?.trim() || null,
        backorderAllowed: values.backorderAllowed ?? false,
        splitShipment: values.splitShipment ?? false,
        storeLabelsOnReceive: values.storeLabelsOnReceive ?? false,
        orderDate: toIsoDate(values.orderDate),
        shipDate: toIsoDate(values.shipDate),
        cancelDate: toIsoDate(values.cancelDate),
        paymentDate: toIsoDate(values.paymentDate),
        lineItems: validLines.map((line) => ({
          skuId: line.skuId,
          quantity: lineQuantity(line),
          unitCost: Number(line.unitCost.toFixed(2)),
          casePackId: line.casePackId ?? null,
          casePackMultiplier: line.casePackId ? line.casePackMultiplier ?? 1 : null,
          sizeCells: lineSizeCells(line),
        })),
      }

      const po = isEditMode && poId
        ? await updateMutation.mutateAsync({ poId, payload })
        : await createMutation.mutateAsync(payload)

      message.success(isEditMode ? 'Draft purchase order updated' : 'Purchase order created in Draft status')
      navigate(`/purchasing/orders/${po.id}`)
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to save purchase order')
    }
  }

  const renderSizeGrid = (record: LineItemRow) => {
    const columns = record.sizeColumns ?? []
    const rows = record.sizeRows ?? []
    if (!record.skuId) return <Typography.Text type="secondary">Select a SKU first</Typography.Text>
    if (columns.length === 0) {
      return <Typography.Text type="secondary">No size grid available for this SKU</Typography.Text>
    }

    const rowLabels = rows.length > 0 ? rows : ['']
    const selectedPack = record.casePacks?.find((pack) => pack.code === record.casePackId)
    const packMultiplier = record.casePackMultiplier ?? 1
    return (
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Space wrap size={[8, 4]}>
          <Select
            allowClear
            value={record.casePackId ?? undefined}
            onChange={(value) => handleCasePackChange(record, value)}
            placeholder="Case pack"
            style={{ width: 240 }}
            options={(record.casePacks ?? []).map((pack) => ({
              value: pack.code,
              label: [
                pack.code,
                pack.description,
                `${pack.totalUnits.toLocaleString('en-US')} units`,
              ].filter(Boolean).join(' - '),
            }))}
            notFoundContent="No case packs"
          />
          <InputNumber
            min={1}
            precision={0}
            value={packMultiplier}
            onChange={(value) => handleCasePackMultiplierChange(record, value)}
            disabled={!record.casePackId}
            addonBefore="X"
            style={{ width: 100 }}
          />
          {selectedPack ? (
            <Typography.Text type="secondary">
              {selectedPack.totalUnits.toLocaleString('en-US')} units/pack x {packMultiplier} ={' '}
              {(selectedPack.totalUnits * packMultiplier).toLocaleString('en-US')}
            </Typography.Text>
          ) : null}
        </Space>
        {rowLabels.map((rowLabel) => (
          <div key={rowLabel || 'single-row'}>
            {rowLabel ? (
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                {rowLabel}
              </Typography.Text>
            ) : null}
            <Space wrap size={[6, 6]}>
              {columns.map((columnLabel) => (
                <InputNumber
                  key={`${rowLabel}:${columnLabel}`}
                  min={0}
                  precision={0}
                  value={record.sizeCells?.[cellKey(columnLabel, rowLabel)] ?? null}
                  onChange={(value) => updateSizeCell(record.key, columnLabel, rowLabel, value)}
                  addonBefore={columnLabel}
                  style={{ width: 92 }}
                />
              ))}
            </Space>
          </div>
        ))}
      </Space>
    )
  }

  const lineItemColumns = [
    {
      title: 'SKU',
      key: 'skuId',
      width: 360,
      render: (_: unknown, record: LineItemRow) => {
        const recordOptions = record.skuId && record.skuLabel && !skuSelectOptions.some((option) => option.value === record.skuId)
          ? [{ value: record.skuId, label: record.skuLabel }, ...skuSelectOptions]
          : skuSelectOptions
        return (
          <Space.Compact style={{ width: '100%' }}>
            <Select
              showSearch
              filterOption={false}
              value={record.skuId || undefined}
              onSearch={setSkuSearch}
              onChange={(value) => handleSkuChange(record, value)}
              loading={skusFetching}
              placeholder="Search SKU"
              style={{ width: 'calc(100% - 40px)' }}
              options={recordOptions}
            />
            <Button
              icon={<SearchOutlined />}
              onClick={() => {
                if (!selectedVendorId) {
                  message.warning('Select a vendor before opening SKU Lookup')
                  return
                }
                setLookupLineKey(record.key)
              }}
              title="Open SKU Lookup"
              aria-label="Open SKU Lookup"
            />
          </Space.Compact>
        )
      },
    },
    {
      title: 'Sizes',
      key: 'sizes',
      width: 620,
      render: (_: unknown, record: LineItemRow) => renderSizeGrid(record),
    },
    {
      title: 'Total Qty',
      key: 'quantity',
      width: 150,
      render: (_: unknown, record: LineItemRow) =>
        (record.sizeColumns?.length ?? 0) > 0 ? (
          <Typography.Text>{lineQuantity(record).toLocaleString('en-US')}</Typography.Text>
        ) : (
          <InputNumber
            min={1}
            precision={0}
            value={record.quantity}
            onChange={(value) => updateLineItem(record.key, 'quantity', value ?? 1)}
            style={{ width: '100%' }}
          />
        ),
    },
    {
      title: 'Unit Cost',
      key: 'unitCost',
      width: 170,
      render: (_: unknown, record: LineItemRow) => (
        <InputNumber
          min={0.01}
          step={0.01}
          precision={2}
          value={record.unitCost}
          onChange={(value) => updateLineItem(record.key, 'unitCost', value ?? 0.01)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Line Total',
      key: 'lineTotal',
      width: 160,
      align: 'right' as const,
      render: (_: unknown, record: LineItemRow) =>
        formatMoney(lineQuantity(record) * record.unitCost),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record: LineItemRow) =>
        lineItems.length > 1 ? (
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeLineItem(record.key)}
            size="small"
            aria-label="Remove line item"
          />
        ) : null,
    },
  ]

  const subtotal = lineItems.reduce((sum, line) => sum + lineQuantity(line) * line.unitCost, 0)

  if (isEditMode && existingPoLoading) {
    return (
      <Card>
        <Typography.Text>Loading purchase order...</Typography.Text>
      </Card>
    )
  }

  if (isEditMode && existingPo && existingPo.status !== 'DRAFT') {
    return (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/purchasing/orders/${existingPo.id}`)}>
            Back
          </Button>
        </Card>
        <Alert
          type="warning"
          showIcon
          message="Only draft purchase orders can be edited"
          description={`PO ${existingPo.poNumber} is currently ${existingPo.status.replace(/_/g, ' ')}.`}
        />
      </Space>
    )
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/purchasing/orders')}>
            Back
          </Button>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {isEditMode ? 'Edit Purchase Order' : 'New Purchase Order'}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>
              Amounts in Lempira (HNL).
            </Typography.Paragraph>
          </div>
        </Space>
      </Card>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark="optional"
        initialValues={{ status: 'DRAFT', orderType: 'RO', classification: 'AT_ONCE' }}
      >
        <Tabs
          defaultActiveKey="header"
          items={[
            {
              key: 'header',
              label: 'Header',
              children: (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Card title="Purchase Order Identity">
                    <Row gutter={16}>
                      <Col xs={24} md={6}>
                        <Form.Item label="PO Number" name="poNumber">
                          <Input maxLength={32} placeholder="Auto-generated if blank" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={4}>
                        <Form.Item label="Status" name="status">
                          <Select disabled options={[{ value: 'DRAFT', label: 'Draft' }]} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item
                          label="Vendor"
                          name="vendorId"
                          rules={[{ required: true, message: 'Vendor is required' }]}
                        >
                          <Select
                            showSearch
                            filterOption={false}
                            onSearch={setVendorSearch}
                            loading={vendorsFetching}
                            placeholder="Select vendor"
                            options={vendorSelectOptions}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={4}>
                        <Form.Item label="Bill-to Store" name="billToStoreId">
                          <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={4}>
                        <Form.Item label="Ship-to Store" name="shipToStoreId">
                          <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col xs={24} md={6}>
                        <Form.Item label="Buyer" name="buyer">
                          <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            placeholder="Select buyer"
                            options={buyerSelectOptions}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label="Order Type" name="orderType">
                          <Select
                            options={[
                              { value: 'RO', label: 'Regular' },
                              { value: 'RE', label: 'At-once' },
                              { value: 'SA', label: 'Future' },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label="Classification" name="classification">
                          <Select
                            options={[
                              { value: 'AT_ONCE', label: 'At-once' },
                              { value: 'FUTURE', label: 'Future' },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Space wrap style={{ paddingTop: 30 }}>
                          <Form.Item name="storeLabelsOnReceive" valuePropName="checked" noStyle>
                            <Checkbox>Store labels on receive</Checkbox>
                          </Form.Item>
                        </Space>
                      </Col>
                    </Row>
                  </Card>

                  <Card title="Header Details">
                    <Row gutter={16}>
                      <Col xs={24} md={6}>
                        <Form.Item label="Confirmation #" name="confirmationNumber">
                          <Input maxLength={120} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label="Account #" name="accountNumber">
                          <Input maxLength={120} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label="Terms" name="terms">
                          <Input maxLength={120} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label="Ship Via" name="shipVia">
                          <Input maxLength={120} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Space wrap>
                      <Form.Item name="backorderAllowed" valuePropName="checked" noStyle>
                        <Checkbox>Backorder allowed</Checkbox>
                      </Form.Item>
                      <Form.Item name="splitShipment" valuePropName="checked" noStyle>
                        <Checkbox>Split shipment</Checkbox>
                      </Form.Item>
                    </Space>
                  </Card>

                  <Card title="Dates">
                    <Row gutter={16}>
                      <Col xs={24} md={6}>
                        <Form.Item label="Order Date" name="orderDate">
                          <Input type="date" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label="Ship Date" name="shipDate">
                          <Input type="date" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label="Cancel Date" name="cancelDate">
                          <Input type="date" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label="Payment Date" name="paymentDate">
                          <Input type="date" />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>

                  <Card title="Comments">
                    <Form.Item label="Notes" name="notes" style={{ marginBottom: 0 }}>
                      <Input.TextArea rows={3} maxLength={1000} placeholder="Optional notes" />
                    </Form.Item>
                  </Card>
                </Space>
              ),
            },
            {
              key: 'skus',
              label: 'SKU Entry',
              children: (
                <Card
                  title="Line Items"
                  extra={<Typography.Text strong>Subtotal: {formatMoney(subtotal)}</Typography.Text>}
                >
                  <Typography.Paragraph type="secondary">
                    Search by SKU code, description, style/color, or vendor code.
                  </Typography.Paragraph>

                  <Table<LineItemRow>
                    rowKey="key"
                    columns={lineItemColumns}
                    dataSource={lineItems}
                    pagination={false}
                    size="small"
                    scroll={{ x: 1480 }}
                    footer={() => (
                      <Button type="dashed" icon={<PlusOutlined />} onClick={addLineItem} block>
                        Add Line Item
                      </Button>
                    )}
                  />

                  <Row justify="end" style={{ marginTop: 16 }}>
                    <Typography.Text strong>
                      Subtotal: {formatMoney(subtotal)}
                    </Typography.Text>
                  </Row>
                </Card>
              ),
            },
          ]}
        />

        <Card size="small">
          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={createMutation.isPending || updateMutation.isPending}
              >
                {isEditMode ? 'Save Draft Changes' : 'Save Draft PO'}
              </Button>
              <Button onClick={() => navigate(isEditMode && poId ? `/purchasing/orders/${poId}` : '/purchasing/orders')}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Card>
      </Form>

      <SkuLookup
        open={lookupLineKey != null}
        onClose={() => setLookupLineKey(null)}
        onSelect={handleLookupSelect}
        initialFilters={{ vendor: selectedVendorId }}
      />
    </Space>
  )
}
