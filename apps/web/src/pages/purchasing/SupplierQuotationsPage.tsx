import { useEffect, useMemo, useState } from 'react'
import {
  App,
  Button,
  DatePicker,
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShoppingCartOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { SkuLookup } from '../../components/sku-lookup'
import { SkuLink } from '../../components/sku-link/SkuLink'
import { useVendors } from '../../hooks/useProductsVendors'
import { useStoreChains } from '../../hooks/useStores'
import {
  useAddSupplierQuotationLine,
  useAddSupplierQuotationRelation,
  useArchiveSupplierQuotation,
  useConvertSupplierQuotationToPo,
  useCreateSupplierQuotation,
  useDecideSupplierQuotationLine,
  useDeleteSupplierQuotationLine,
  useSupplierQuotation,
  useSupplierQuotationSimilarity,
  useSupplierQuotations,
  useUpdateSupplierQuotation,
  useUpdateSupplierQuotationLine,
} from '../../hooks/useSupplierQuotations'
import { productFamiliesApi } from '../../services/productFamiliesApi'
import { categoriesApi } from '../../services/productsTaxonomyApi'
import { productsAttributesApi } from '../../services/productsAttributesApi'
import type {
  SupplierQuotationInput,
  SupplierQuotationLine,
  SupplierQuotationLineInput,
  SupplierQuotationListFilters,
  SupplierQuotationListItem,
  SupplierQuotationSimilarityCandidate,
} from '../../services/supplierQuotationsApi'

type HeaderFormValues = Omit<SupplierQuotationInput, 'quoteDate' | 'validUntil' | 'fxDate'> & {
  quoteDate?: Dayjs | null
  validUntil?: Dayjs | null
  fxDate?: Dayjs | null
}

type LineFormValues = Omit<SupplierQuotationLineInput, 'plannedReceiptDate'> & {
  plannedReceiptDate?: Dayjs | null
}

type SkuLookupMode =
  | { kind: 'link-line'; lineId: string }
  | { kind: 'related-sku'; lineId: string }
  | null

const currencyFormatter = new Intl.NumberFormat('es-HN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat('es-HN', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  return s.length > 0 ? s : null
}

function dateValue(value: string | null | undefined): Dayjs | null {
  return value ? dayjs(value) : null
}

function serializeHeader(values: HeaderFormValues): SupplierQuotationInput {
  return {
    vendorCode: clean(values.vendorCode),
    buyer: clean(values.buyer),
    season: clean(values.season),
    chainId: clean(values.chainId),
    sourceCurrency: values.sourceCurrency ?? 'HNL',
    fxRate: values.sourceCurrency === 'HNL' ? 1 : values.fxRate ?? 1,
    fxDate: values.fxDate?.format('YYYY-MM-DD') ?? null,
    incotermCode: clean(values.incotermCode),
    incotermPlace: clean(values.incotermPlace),
    paymentTerms: clean(values.paymentTerms),
    quoteDate: values.quoteDate?.format('YYYY-MM-DD') ?? null,
    validUntil: values.validUntil?.format('YYYY-MM-DD') ?? null,
    leadTimeDays: values.leadTimeDays ?? null,
    sourceDocumentRef: clean(values.sourceDocumentRef),
    notes: clean(values.notes),
  }
}

function serializeLine(values: LineFormValues): SupplierQuotationLineInput {
  return {
    linkedSkuId: values.linkedSkuId ?? null,
    supplierStyle: clean(values.supplierStyle),
    supplierColorCode: clean(values.supplierColorCode),
    supplierColorName: clean(values.supplierColorName),
    description: clean(values.description),
    familyCode: clean(values.familyCode),
    categoryNumber: values.categoryNumber ?? null,
    colorFamilyValueId: values.colorFamilyValueId ?? null,
    materialValueId: values.materialValueId ?? null,
    styleElementValueId: values.styleElementValueId ?? null,
    keywords: clean(values.keywords),
    imageUrl: clean(values.imageUrl),
    moqQty: values.moqQty ?? null,
    quotedQty: values.quotedQty ?? null,
    unitCost: values.unitCost ?? null,
    estimatedLandedUnitCostHnl: values.estimatedLandedUnitCostHnl ?? null,
    targetRetailHnl: values.targetRetailHnl ?? null,
    plannedReceiptDate: values.plannedReceiptDate?.toISOString() ?? null,
  }
}

function decisionColor(status: string): string {
  if (status === 'ACCEPTED') return 'green'
  if (status === 'REJECTED') return 'red'
  if (status === 'HOLD') return 'gold'
  return 'default'
}

function sameTarget(a: SupplierQuotationSimilarityCandidate, b: SupplierQuotationSimilarityCandidate) {
  return a.targetType === b.targetType && a.targetId === b.targetId
}

export default function SupplierQuotationsPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [filters, setFilters] = useState<SupplierQuotationListFilters>({ status: 'ALL', pageSize: 80 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lineModalOpen, setLineModalOpen] = useState(false)
  const [editingLine, setEditingLine] = useState<SupplierQuotationLine | null>(null)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [skuLookupMode, setSkuLookupMode] = useState<SkuLookupMode>(null)
  const [decisionLine, setDecisionLine] = useState<{ line: SupplierQuotationLine; status: 'REJECTED' | 'HOLD' } | null>(null)
  const [decisionReason, setDecisionReason] = useState('')
  const [headerForm] = Form.useForm<HeaderFormValues>()
  const [lineForm] = Form.useForm<LineFormValues>()

  const { data: quotations, isFetching, refetch } = useSupplierQuotations(filters)
  const { data: detail, isFetching: detailFetching } = useSupplierQuotation(selectedId)
  const selectedLine = useMemo(
    () => detail?.lines.find((line) => line.id === selectedLineId) ?? detail?.lines[0] ?? null,
    [detail?.lines, selectedLineId],
  )
  const { data: similarity, isFetching: similarityFetching } = useSupplierQuotationSimilarity(selectedLine?.id)
  const { data: vendors } = useVendors()
  const { data: chains } = useStoreChains()
  const { data: families } = useQuery({
    queryKey: ['product-families'],
    queryFn: productFamiliesApi.list,
    staleTime: 10 * 60_000,
  })
  const { data: categories } = useQuery({
    queryKey: ['taxonomy-categories'],
    queryFn: categoriesApi.list,
    staleTime: 10 * 60_000,
  })
  const { data: dimensions } = useQuery({
    queryKey: ['products-attributes', 'dimensions-for-quotations'],
    queryFn: () => productsAttributesApi.listDimensions(false),
    staleTime: 10 * 60_000,
  })

  const createQuotation = useCreateSupplierQuotation()
  const updateQuotation = useUpdateSupplierQuotation()
  const archiveQuotation = useArchiveSupplierQuotation()
  const addLine = useAddSupplierQuotationLine()
  const updateLine = useUpdateSupplierQuotationLine()
  const deleteLine = useDeleteSupplierQuotationLine()
  const decideLine = useDecideSupplierQuotationLine()
  const addRelation = useAddSupplierQuotationRelation()
  const convertToPo = useConvertSupplierQuotationToPo()

  useEffect(() => {
    if (!drawerOpen) return
    if (detail) {
      headerForm.setFieldsValue({
        vendorCode: detail.vendorCode,
        buyer: detail.buyer,
        season: detail.season,
        chainId: detail.chainId,
        sourceCurrency: detail.sourceCurrency,
        fxRate: detail.fxRate,
        fxDate: dateValue(detail.fxDate),
        incotermCode: detail.incotermCode,
        incotermPlace: detail.incotermPlace,
        paymentTerms: detail.paymentTerms,
        quoteDate: dateValue(detail.quoteDate),
        validUntil: dateValue(detail.validUntil),
        leadTimeDays: detail.leadTimeDays,
        sourceDocumentRef: detail.sourceDocumentRef,
        notes: detail.notes,
      })
      setSelectedLineId((current) => current ?? detail.lines[0]?.id ?? null)
      return
    }
    headerForm.resetFields()
    headerForm.setFieldsValue({
      sourceCurrency: 'HNL',
      fxRate: 1,
      fxDate: dayjs(),
      quoteDate: dayjs(),
    })
    setSelectedLineId(null)
  }, [detail, drawerOpen, headerForm])

  useEffect(() => {
    if (!lineModalOpen) return
    if (editingLine) {
      lineForm.setFieldsValue({
        linkedSkuId: editingLine.linkedSkuId,
        supplierStyle: editingLine.supplierStyle,
        supplierColorCode: editingLine.supplierColorCode,
        supplierColorName: editingLine.supplierColorName,
        description: editingLine.description,
        familyCode: editingLine.familyCode,
        categoryNumber: editingLine.categoryNumber,
        colorFamilyValueId: editingLine.colorFamilyValueId,
        materialValueId: editingLine.materialValueId,
        styleElementValueId: editingLine.styleElementValueId,
        keywords: editingLine.keywords,
        imageUrl: editingLine.imageUrl,
        moqQty: editingLine.moqQty,
        quotedQty: editingLine.quotedQty,
        unitCost: editingLine.unitCost,
        estimatedLandedUnitCostHnl: editingLine.estimatedLandedUnitCostHnl,
        targetRetailHnl: editingLine.targetRetailHnl,
        plannedReceiptDate: dateValue(editingLine.plannedReceiptDate),
      })
      return
    }
    lineForm.resetFields()
    lineForm.setFieldsValue({ quotedQty: 1, unitCost: 0, familyCode: families?.[0]?.code })
  }, [editingLine, families, lineForm, lineModalOpen])

  const vendorOptions = useMemo(
    () => (vendors ?? []).map((vendor) => ({ value: vendor.code, label: `${vendor.code} - ${vendor.name}` })),
    [vendors],
  )
  const chainOptions = useMemo(
    () => (chains ?? []).filter((chain) => chain.active).map((chain) => ({ value: chain.id, label: chain.label })),
    [chains],
  )
  const familyOptions = useMemo(
    () => (families ?? []).map((family) => ({ value: family.code, label: `${family.labelEs} (${family.code})` })),
    [families],
  )
  const categoryOptions = useMemo(
    () => (categories ?? []).map((category) => ({
      value: category.number,
      label: `${category.number} - ${category.description}`,
    })),
    [categories],
  )
  const valuesForDimensions = (codes: string[]) =>
    (dimensions ?? [])
      .filter((dimension) => codes.includes(dimension.code))
      .flatMap((dimension) =>
        dimension.values
          .filter((value) => value.isActive)
          .map((value) => ({ value: value.id, label: `${value.labelEs} (${dimension.labelEs})` })),
      )

  const colorOptions = useMemo(() => valuesForDimensions(['color_family', 'color']), [dimensions])
  const materialOptions = useMemo(() => valuesForDimensions(['material', 'upper_material', 'fabric']), [dimensions])
  const styleElementOptions = useMemo(() => valuesForDimensions(['style_element', 'shoe_type', 'silhouette', 'occasion']), [dimensions])

  const openNew = () => {
    setSelectedId(null)
    setDrawerOpen(true)
  }

  const openExisting = (id: string) => {
    setSelectedId(id)
    setDrawerOpen(true)
  }

  const saveHeader = async () => {
    const values = await headerForm.validateFields()
    const payload = serializeHeader(values)
    if (detail) {
      await updateQuotation.mutateAsync({ id: detail.id, input: payload })
      message.success('Quotation updated')
      return
    }
    const created = await createQuotation.mutateAsync(payload)
    message.success(`Quotation ${created.quoteNumber} created`)
    setSelectedId(created.id)
  }

  const saveLine = async () => {
    if (!detail) return
    const values = await lineForm.validateFields()
    const payload = serializeLine(values)
    const saved = editingLine
      ? await updateLine.mutateAsync({ lineId: editingLine.id, input: payload })
      : await addLine.mutateAsync({ quotationId: detail.id, input: payload })
    setSelectedLineId(saved.id)
    setLineModalOpen(false)
    setEditingLine(null)
    message.success('Style line saved')
  }

  const handleSkuPicked = async (picked: { skuCode: string; skuId: string }) => {
    const mode = skuLookupMode
    setSkuLookupMode(null)
    if (!mode) return
    if (mode.kind === 'link-line') {
      await updateLine.mutateAsync({ lineId: mode.lineId, input: { linkedSkuId: picked.skuId } })
      message.success(`Linked ${picked.skuCode}`)
      return
    }
    await addRelation.mutateAsync({
      lineId: mode.lineId,
      input: { relationType: 'SIMILAR', targetType: 'SKU', targetId: picked.skuId },
    })
    message.success(`Added related SKU ${picked.skuCode}`)
  }

  const markAccepted = async (line: SupplierQuotationLine) => {
    await decideLine.mutateAsync({ lineId: line.id, decisionStatus: 'ACCEPTED', reason: null })
    message.success('Line accepted')
  }

  const submitDecisionReason = async () => {
    if (!decisionLine) return
    await decideLine.mutateAsync({
      lineId: decisionLine.line.id,
      decisionStatus: decisionLine.status,
      reason: clean(decisionReason),
    })
    setDecisionLine(null)
    setDecisionReason('')
    message.success('Decision saved')
  }

  const pinCandidate = async (candidate: SupplierQuotationSimilarityCandidate) => {
    if (!selectedLine) return
    await addRelation.mutateAsync({
      lineId: selectedLine.id,
      input: {
        relationType: candidate.relationType ?? 'SIMILAR',
        targetType: candidate.targetType,
        targetId: candidate.targetId,
      },
    })
    message.success('Related style pinned')
  }

  const createDraftPo = async () => {
    if (!detail) return
    const result = await convertToPo.mutateAsync(detail.id)
    const po = result.purchaseOrders[0]
    if (po) {
      message.success(`Draft PO ${po.poNumber} created`)
      navigate(`/purchasing/orders/${encodeURIComponent(po.id)}`)
    }
  }

  const listColumns: ColumnsType<SupplierQuotationListItem> = [
    {
      title: 'Quote',
      dataIndex: 'quoteNumber',
      key: 'quoteNumber',
      width: 150,
      render: (value: string, row) => <Button type="link" onClick={() => openExisting(row.id)}>{value}</Button>,
    },
    { title: 'Vendor', key: 'vendor', render: (_, row) => `${row.vendorCode} - ${row.vendorName ?? ''}` },
    { title: 'Buyer', dataIndex: 'buyer', key: 'buyer', width: 150 },
    { title: 'Season', dataIndex: 'season', key: 'season', width: 90 },
    { title: 'Lines', dataIndex: 'lineCount', key: 'lineCount', width: 80, align: 'right' },
    { title: 'Accepted', dataIndex: 'acceptedLineCount', key: 'acceptedLineCount', width: 100, align: 'right' },
    {
      title: 'Accepted Cost',
      dataIndex: 'acceptedCostHnl',
      key: 'acceptedCostHnl',
      width: 140,
      align: 'right',
      render: (value: number) => currencyFormatter.format(value),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 115,
      render: (status: string) => <Tag color={status === 'CONVERTED' ? 'blue' : status === 'ARCHIVED' ? 'default' : 'green'}>{status}</Tag>,
    },
  ]

  const lineColumns: ColumnsType<SupplierQuotationLine> = [
    { title: '#', dataIndex: 'lineSequence', key: 'lineSequence', width: 54 },
    {
      title: 'Style',
      key: 'style',
      render: (_, line) => (
        <Space>
          {line.imageUrl ? <img src={line.imageUrl} alt="" style={{ width: 42, height: 42, objectFit: 'cover' }} /> : null}
          <span>
            <Typography.Text strong>{line.supplierStyle}</Typography.Text>
            <br />
            <Typography.Text type="secondary">{[line.supplierColorCode, line.supplierColorName].filter(Boolean).join(' - ')}</Typography.Text>
          </span>
        </Space>
      ),
    },
    { title: 'Family', dataIndex: 'familyLabelEs', key: 'familyLabelEs', width: 140 },
    {
      title: 'SKU',
      key: 'sku',
      width: 150,
      render: (_, line) => line.linkedSkuCode
        ? <SkuLink skuCode={line.linkedSkuCode} />
        : <Typography.Text type="secondary">{line.linkedSkuProvisionalCode ?? 'Draft on PO'}</Typography.Text>,
    },
    { title: 'Qty', dataIndex: 'quotedQty', key: 'quotedQty', width: 80, align: 'right' },
    {
      title: 'Cost',
      dataIndex: 'unitCost',
      key: 'unitCost',
      width: 105,
      align: 'right',
      render: (value: number) => currencyFormatter.format(value),
    },
    {
      title: 'Landed',
      dataIndex: 'estimatedLandedUnitCostHnl',
      key: 'estimatedLandedUnitCostHnl',
      width: 110,
      align: 'right',
      render: (value: number | null) => value == null ? '-' : currencyFormatter.format(value),
    },
    {
      title: 'Margin',
      dataIndex: 'marginPct',
      key: 'marginPct',
      width: 95,
      align: 'right',
      render: (value: number | null) => value == null ? '-' : percentFormatter.format(value),
    },
    {
      title: 'Decision',
      dataIndex: 'decisionStatus',
      key: 'decisionStatus',
      width: 110,
      render: (status: string) => <Tag color={decisionColor(status)}>{status}</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 240,
      render: (_, line) => (
        <Space size="small">
          <Tooltip title="Compare">
            <Button icon={<SearchOutlined />} onClick={() => setSelectedLineId(line.id)} />
          </Tooltip>
          <Tooltip title="Link SKU">
            <Button icon={<LinkOutlined />} onClick={() => setSkuLookupMode({ kind: 'link-line', lineId: line.id })} />
          </Tooltip>
          <Tooltip title="Accept">
            <Button icon={<CheckOutlined />} onClick={() => markAccepted(line)} />
          </Tooltip>
          <Tooltip title="Hold">
            <Button icon={<PauseCircleOutlined />} onClick={() => setDecisionLine({ line, status: 'HOLD' })} />
          </Tooltip>
          <Tooltip title="Reject">
            <Button icon={<StopOutlined />} onClick={() => setDecisionLine({ line, status: 'REJECTED' })} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button icon={<EditOutlined />} onClick={() => { setEditingLine(line); setLineModalOpen(true) }} />
          </Tooltip>
          <Popconfirm title="Delete quoted style?" onConfirm={() => deleteLine.mutateAsync(line.id)}>
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const similarityColumns: ColumnsType<SupplierQuotationSimilarityCandidate> = [
    {
      title: 'Related Style',
      key: 'title',
      render: (_, row) => (
        <Space>
          {row.imageUrl ? <img src={row.imageUrl} alt="" style={{ width: 40, height: 40, objectFit: 'cover' }} /> : null}
          <span>
            <Typography.Text strong>{row.title}</Typography.Text>
            <br />
            <Typography.Text type="secondary">{row.subtitle}</Typography.Text>
          </span>
        </Space>
      ),
    },
    { title: 'Type', dataIndex: 'targetType', key: 'targetType', width: 115 },
    {
      title: 'Signals',
      dataIndex: 'signals',
      key: 'signals',
      render: (signals: string[]) => <Space wrap>{signals.map((signal) => <Tag key={signal}>{signal}</Tag>)}</Space>,
    },
    {
      title: 'Cost',
      dataIndex: 'unitCost',
      key: 'unitCost',
      width: 95,
      align: 'right',
      render: (value: number | null) => value == null ? '-' : currencyFormatter.format(value),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, row) => row.manual || (similarity ?? []).some((candidate) => candidate.manual && sameTarget(candidate, row))
        ? <Tag color="blue">Pinned</Tag>
        : <Button size="small" onClick={() => pinCandidate(row)}>Pin</Button>,
    },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Flex justify="space-between" align="center" gap={12} wrap>
        <Space wrap>
          <Input.Search
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search quotes, vendors, documents"
            style={{ width: 320 }}
            onSearch={(q) => setFilters((current) => ({ ...current, q: clean(q) }))}
          />
          <Select
            value={filters.status ?? 'ALL'}
            style={{ width: 150 }}
            onChange={(status) => setFilters((current) => ({ ...current, status }))}
            options={[
              { value: 'ALL', label: 'All statuses' },
              { value: 'DRAFT', label: 'Draft' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'CONVERTED', label: 'Converted' },
              { value: 'ARCHIVED', label: 'Archived' },
            ]}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Vendor"
            style={{ width: 260 }}
            value={filters.vendorCode ?? undefined}
            onChange={(vendorCode) => setFilters((current) => ({ ...current, vendorCode: vendorCode ?? null }))}
            options={vendorOptions}
          />
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New Quote</Button>
        </Space>
      </Flex>

      <Table
        rowKey="id"
        loading={isFetching}
        columns={listColumns}
        dataSource={quotations ?? []}
        size="middle"
        pagination={{ pageSize: 50, showSizeChanger: false }}
      />

      <Drawer
        title={detail ? `${detail.quoteNumber} - ${detail.vendorName ?? detail.vendorCode}` : 'New Supplier Quote'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width="92vw"
        destroyOnClose
        extra={
          <Space>
            {detail ? (
              <>
                <Popconfirm title="Archive this quotation?" onConfirm={() => archiveQuotation.mutateAsync(detail.id)}>
                  <Button>Archive</Button>
                </Popconfirm>
                <Button
                  type="primary"
                  icon={<ShoppingCartOutlined />}
                  loading={convertToPo.isPending}
                  disabled={!detail.lines.some((line) => line.decisionStatus === 'ACCEPTED')}
                  onClick={createDraftPo}
                >
                  Create Draft PO
                </Button>
              </>
            ) : null}
            <Button type="primary" onClick={saveHeader} loading={createQuotation.isPending || updateQuotation.isPending}>
              Save Header
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Form form={headerForm} layout="vertical" disabled={detailFetching}>
            <Flex gap={12} wrap>
              <Form.Item name="vendorCode" label="Vendor" rules={[{ required: true }]} style={{ minWidth: 260, flex: '1 1 260px' }}>
                <Select showSearch optionFilterProp="label" options={vendorOptions} />
              </Form.Item>
              <Form.Item name="buyer" label="Buyer" style={{ minWidth: 180, flex: '1 1 180px' }}>
                <Input />
              </Form.Item>
              <Form.Item name="season" label="Season" style={{ width: 96 }}>
                <Input maxLength={2} />
              </Form.Item>
              <Form.Item name="chainId" label="Chain" style={{ minWidth: 220, flex: '1 1 220px' }}>
                <Select allowClear options={chainOptions} />
              </Form.Item>
              <Form.Item name="sourceCurrency" label="Currency" style={{ width: 110 }}>
                <Select options={[{ value: 'HNL' }, { value: 'USD' }, { value: 'CNY' }]} />
              </Form.Item>
              <Form.Item name="fxRate" label="FX" style={{ width: 110 }}>
                <InputNumber min={0.000001} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="fxDate" label="FX Date" style={{ width: 145 }}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="quoteDate" label="Quote Date" style={{ width: 145 }}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="validUntil" label="Valid Until" style={{ width: 145 }}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="leadTimeDays" label="Lead Days" style={{ width: 110 }}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="incotermCode" label="Incoterm" style={{ width: 120 }}>
                <Select allowClear options={['EXW', 'FOB', 'CIF', 'CFR', 'DAP', 'DDP'].map((value) => ({ value }))} />
              </Form.Item>
              <Form.Item name="incotermPlace" label="Incoterm Place" style={{ minWidth: 180, flex: '1 1 180px' }}>
                <Input />
              </Form.Item>
              <Form.Item name="paymentTerms" label="Payment Terms" style={{ minWidth: 180, flex: '1 1 180px' }}>
                <Input />
              </Form.Item>
              <Form.Item name="sourceDocumentRef" label="Source Document" style={{ minWidth: 220, flex: '1 1 220px' }}>
                <Input />
              </Form.Item>
              <Form.Item name="notes" label="Notes" style={{ minWidth: 280, flex: '2 1 280px' }}>
                <Input />
              </Form.Item>
            </Flex>
          </Form>

          {detail ? (
            <>
              <Flex justify="space-between" align="center">
                <Typography.Title level={4} style={{ margin: 0 }}>Quoted Styles</Typography.Title>
                <Button icon={<PlusOutlined />} onClick={() => { setEditingLine(null); setLineModalOpen(true) }}>
                  Add Style
                </Button>
              </Flex>
              <Table
                rowKey="id"
                size="small"
                loading={detailFetching}
                columns={lineColumns}
                dataSource={detail.lines}
                pagination={false}
                rowClassName={(line) => line.id === selectedLine?.id ? 'ant-table-row-selected' : ''}
                onRow={(line) => ({ onClick: () => setSelectedLineId(line.id) })}
              />

              <Flex justify="space-between" align="center">
                <Typography.Title level={4} style={{ margin: 0 }}>
                  Related Styles {selectedLine ? `- ${selectedLine.supplierStyle}` : ''}
                </Typography.Title>
                {selectedLine ? (
                  <Button icon={<LinkOutlined />} onClick={() => setSkuLookupMode({ kind: 'related-sku', lineId: selectedLine.id })}>
                    Add Related SKU
                  </Button>
                ) : null}
              </Flex>
              <Table
                rowKey={(row) => `${row.targetType}:${row.targetId}`}
                size="small"
                loading={similarityFetching}
                columns={similarityColumns}
                dataSource={similarity ?? []}
                pagination={false}
              />
            </>
          ) : null}
        </Space>
      </Drawer>

      <Modal
        title={editingLine ? 'Edit Quoted Style' : 'Add Quoted Style'}
        open={lineModalOpen}
        onCancel={() => { setLineModalOpen(false); setEditingLine(null) }}
        onOk={saveLine}
        okButtonProps={{ loading: addLine.isPending || updateLine.isPending }}
        width={940}
        destroyOnClose
      >
        <Form form={lineForm} layout="vertical">
          <Flex gap={12} wrap>
            <Form.Item name="supplierStyle" label="Supplier Style" rules={[{ required: true }]} style={{ minWidth: 180, flex: '1 1 180px' }}>
              <Input />
            </Form.Item>
            <Form.Item name="supplierColorCode" label="Color Code" style={{ width: 130 }}>
              <Input />
            </Form.Item>
            <Form.Item name="supplierColorName" label="Color Name" style={{ minWidth: 160, flex: '1 1 160px' }}>
              <Input />
            </Form.Item>
            <Form.Item name="familyCode" label="Family" style={{ minWidth: 200, flex: '1 1 200px' }}>
              <Select allowClear showSearch optionFilterProp="label" options={familyOptions} />
            </Form.Item>
            <Form.Item name="categoryNumber" label="Category" style={{ minWidth: 220, flex: '1 1 220px' }}>
              <Select allowClear showSearch optionFilterProp="label" options={categoryOptions} />
            </Form.Item>
            <Form.Item name="colorFamilyValueId" label="Color Family" style={{ minWidth: 180, flex: '1 1 180px' }}>
              <Select allowClear showSearch optionFilterProp="label" options={colorOptions} />
            </Form.Item>
            <Form.Item name="materialValueId" label="Material" style={{ minWidth: 180, flex: '1 1 180px' }}>
              <Select allowClear showSearch optionFilterProp="label" options={materialOptions} />
            </Form.Item>
            <Form.Item name="styleElementValueId" label="Style Element" style={{ minWidth: 180, flex: '1 1 180px' }}>
              <Select allowClear showSearch optionFilterProp="label" options={styleElementOptions} />
            </Form.Item>
            <Form.Item name="quotedQty" label="Qty" style={{ width: 110 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="moqQty" label="MOQ" style={{ width: 110 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="unitCost" label="Unit Cost" rules={[{ required: true }]} style={{ width: 130 }}>
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="estimatedLandedUnitCostHnl" label="Landed HNL" style={{ width: 140 }}>
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="targetRetailHnl" label="Retail HNL" style={{ width: 130 }}>
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="plannedReceiptDate" label="Receipt Date" style={{ width: 150 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="imageUrl" label="Image URL" style={{ minWidth: 240, flex: '1 1 240px' }}>
              <Input />
            </Form.Item>
            <Form.Item name="keywords" label="Keywords" style={{ minWidth: 240, flex: '1 1 240px' }}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label="Description" style={{ minWidth: 360, flex: '2 1 360px' }}>
              <Input />
            </Form.Item>
          </Flex>
        </Form>
      </Modal>

      <Modal
        title={decisionLine ? `${decisionLine.status} - ${decisionLine.line.supplierStyle}` : 'Decision'}
        open={!!decisionLine}
        onCancel={() => { setDecisionLine(null); setDecisionReason('') }}
        onOk={submitDecisionReason}
        okButtonProps={{ loading: decideLine.isPending }}
      >
        <Input.TextArea
          rows={4}
          value={decisionReason}
          onChange={(event) => setDecisionReason(event.target.value)}
        />
      </Modal>

      <SkuLookup
        open={!!skuLookupMode}
        onClose={() => setSkuLookupMode(null)}
        onSelect={handleSkuPicked}
        initialFilters={detail?.vendorCode ? { vendor: detail.vendorCode } : undefined}
      />
    </Space>
  )
}
