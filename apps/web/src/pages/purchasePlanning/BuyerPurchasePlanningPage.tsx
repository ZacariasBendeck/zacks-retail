import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Col,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CheckCircleOutlined,
  CopyOutlined,
  FileSearchOutlined,
  LinkOutlined,
  PlusOutlined,
  SaveOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCategories, useDepartments } from '../../hooks/useProductsTaxonomy'
import { useStoreChains, useStores } from '../../hooks/useStores'
import { fetchPurchaseOrders } from '../../services/purchaseOrderApi'
import {
  addBuyerCarryoverLine,
  addBuyerPlannedStyle,
  bulkUpdateStoreCategoryCarrying,
  copyBuyerSeedModel,
  createBuyerCarryoverModelLine,
  createBuyerWorkbook,
  fetchBuyerChecklistCategories,
  fetchBuyerWorkbook,
  fetchBuyerWorkbooks,
  fetchStoreCategoryCarrying,
  flagBuyerCarryoverCandidateUnavailable,
  flagBuyerCarryoverUnavailable,
  linkBuyerPurchaseOrder,
  updateBuyerAttributePlan,
  updateBuyerCategoryCard,
  updateBuyerCarryoverCandidate,
  updateBuyerCarryoverLine,
  updateBuyerNewStyleTargets,
  type AttributeMixDimension,
  type AttributeMixRow,
  type BuyerChecklistCategoryRow,
  type BuyerCategoryCard,
  type BuyerCategoryStatus,
  type BuyerPoLink,
  type BuyerWorkbookSeason,
  type BuyerWorkbookCreateRequest,
  type BuyerWorkbookDetail,
  type BuyerWorkbookListItem,
  type CarryoverCandidate,
  type CarryoverLine,
  type HistoricalMonthMetric,
  type PlannedStyle,
  type StoreCategoryCarryingRow,
} from '../../services/buyerPurchasePlanningApi'

const { Title, Text } = Typography

const statusColumns: Array<{ key: BuyerCategoryStatus; label: string; color: string }> = [
  { key: 'NOT_STARTED', label: 'Not Started', color: 'default' },
  { key: 'HISTORY_REVIEWED', label: 'History Reviewed', color: 'blue' },
  { key: 'CARRYOVER_REVIEW', label: 'Carryover Review', color: 'gold' },
  { key: 'CARRYOVERS', label: 'Carryovers', color: 'cyan' },
  { key: 'NEW_STYLES', label: 'New Styles', color: 'purple' },
  { key: 'PO_LINKED', label: 'PO Linked', color: 'geekblue' },
  { key: 'COMPLETE', label: 'Complete', color: 'green' },
]

const statusOptions = statusColumns.map((column) => ({ value: column.key, label: column.label }))
const seasonOptions = [
  { value: 'SPRING_SUMMER', label: 'Spring/Summer' },
  { value: 'FALL_WINTER', label: 'Fall/Winter' },
]
const candidateDecisionOptions = [
  { value: 'UNREVIEWED', label: 'Unreviewed' },
  { value: 'WINNER', label: 'Winner' },
  { value: 'MAYBE', label: 'Maybe' },
  { value: 'DROP', label: 'Drop' },
]

const integerFmt = new Intl.NumberFormat('en-US')
const moneyFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const pctFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

function formatInt(value: number | null | undefined): string {
  return integerFmt.format(Math.round(value ?? 0))
}

function formatMoney(value: number | null | undefined): string {
  return moneyFmt.format(Math.round(value ?? 0))
}

function formatPct(value: number | null | undefined): string {
  return value == null ? 'n/a' : `${pctFmt.format(value)}%`
}

function compareNumber(left: number | null | undefined, right: number | null | undefined): number {
  return Number(left ?? 0) - Number(right ?? 0)
}

function statusTag(status: BuyerCategoryStatus) {
  const meta = statusColumns.find((column) => column.key === status)
  return <Tag color={meta?.color}>{meta?.label ?? status}</Tag>
}

function planStatusTag(status: BuyerCategoryStatus | null) {
  return status ? statusTag(status) : <Tag>No plan</Tag>
}

function attributePlanKey(dimensionCode: string, valueCode: string) {
  return `${dimensionCode}::${valueCode}`
}

function attributeDimensionValues(dimension: AttributeMixDimension): AttributeMixRow[] {
  return Array.isArray(dimension.values) ? dimension.values : []
}

function cardCount(detail: BuyerWorkbookDetail | undefined, cardId: string, kind: 'carryovers' | 'styles' | 'poLinks') {
  if (!detail) return 0
  if (kind === 'carryovers') return detail.carryovers.filter((line) => line.cardId === cardId).length
  if (kind === 'styles') return detail.plannedStyles.filter((line) => line.cardId === cardId).length
  return detail.poLinks.filter((line) => line.cardId === cardId).length
}

function workbookProgress(workbook: BuyerWorkbookListItem): string {
  return `${formatInt(workbook.completeCount)} / ${formatInt(workbook.cardCount)} complete`
}

export default function BuyerPurchasePlanningPage() {
  const [messageApi, contextHolder] = message.useMessage()
  const queryClient = useQueryClient()
  const [createForm] = Form.useForm<BuyerWorkbookCreateRequest>()
  const [carryingForm] = Form.useForm<{
    categoryNumber: number
    chainCode?: string
    storeIds?: number[]
    carries: boolean
    note?: string
  }>()
  const [targetForm] = Form.useForm<{
    status: BuyerCategoryStatus
    targetNewSkuCount: number
    targetCarryoverSkuCount: number
    notes?: string | null
  }>()
  const [carryoverForm] = Form.useForm<{ skuCode: string; skuDescription?: string; color?: string; totalQuantity?: number; notes?: string }>()
  const [styleForm] = Form.useForm<{
    vendorCode?: string
    vendorName?: string
    workingStyle?: string
    description?: string
    color?: string
    colorFamily?: string
    quotedUnitCost?: number
    targetNewSkuCount?: number
    targetUnits?: number
    notes?: string
  }>()
  const [copyForm] = Form.useForm<{ targetStoreIds?: number[] }>()
  const [poLinkForm] = Form.useForm<{ poId: string; plannedStyleId?: string; carryoverLineId?: string; quantity?: number; notes?: string }>()
  const [newStyleTargetForm] = Form.useForm<{
    replacementStyleTargetCount: number
    additionalNewStyleTargetCount: number
    totalNewStyleTargetCount: number
  }>()

  const [landingSeason, setLandingSeason] = useState<BuyerWorkbookSeason>('FALL_WINTER')
  const [landingYear, setLandingYear] = useState(new Date().getFullYear())
  const [buyerFilter, setBuyerFilter] = useState('')
  const [landingSearch, setLandingSearch] = useState('')
  const [reviewSetupVisible, setReviewSetupVisible] = useState(false)
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string | null>(null)
  const [drawerCardId, setDrawerCardId] = useState<string | null>(null)
  const [carryingCategoryNumber, setCarryingCategoryNumber] = useState<number | null>(null)
  const [unavailableLine, setUnavailableLine] = useState<CarryoverLine | null>(null)
  const [unavailableCandidate, setUnavailableCandidate] = useState<CarryoverCandidate | null>(null)
  const [unavailableReason, setUnavailableReason] = useState('')
  const [editingCarryoverLine, setEditingCarryoverLine] = useState<CarryoverLine | null>(null)
  const [editingSizeCells, setEditingSizeCells] = useState<CarryoverLine['sizeCells']>([])
  const [attributePlanValues, setAttributePlanValues] = useState<Record<string, { plannedStyleCount: number; plannedUnits: number; notes?: string | null }>>({})

  const { data: stores = [], isLoading: storesLoading } = useStores()
  const { data: storeChains = [], isLoading: chainsLoading } = useStoreChains()
  const { data: categories = [], isLoading: categoriesLoading } = useCategories()
  const { data: departments = [], isLoading: departmentsLoading } = useDepartments()

  const workbooks = useQuery({
    queryKey: ['buyer-purchase-workbooks'],
    queryFn: () => fetchBuyerWorkbooks({ status: 'all' }),
    staleTime: 60_000,
  })

  const checklistCategories = useQuery({
    queryKey: ['buyer-checklist-categories', buyerFilter, landingSeason, landingYear],
    queryFn: () => fetchBuyerChecklistCategories({
      buyer: buyerFilter.trim() || undefined,
      buyingSeason: landingSeason,
      seasonYear: landingYear,
    }),
    staleTime: 60_000,
  })

  const detail = useQuery({
    queryKey: ['buyer-purchase-workbook', selectedWorkbookId],
    queryFn: () => fetchBuyerWorkbook(selectedWorkbookId!),
    enabled: !!selectedWorkbookId,
    staleTime: 30_000,
  })

  const purchaseOrders = useQuery({
    queryKey: ['buyer-purchase-workbook', 'po-options'],
    queryFn: () => fetchPurchaseOrders({ page: 1, pageSize: 50, sort: 'updatedAt', order: 'desc' }),
    staleTime: 30_000,
  })

  const carryingRows = useQuery({
    queryKey: ['store-category-carrying', carryingCategoryNumber],
    queryFn: () => fetchStoreCategoryCarrying(carryingCategoryNumber!),
    enabled: carryingCategoryNumber != null,
    staleTime: 30_000,
  })

  const selectedDetail = detail.data
  const selectedCard = useMemo(
    () => (selectedDetail?.cards ?? []).find((card) => card.id === drawerCardId) ?? null,
    [drawerCardId, selectedDetail],
  )

  const selectedCardCarryovers = useMemo(
    () => (selectedDetail?.carryovers ?? []).filter((line) => line.cardId === drawerCardId),
    [drawerCardId, selectedDetail],
  )
  const selectedCardCandidates = useMemo(
    () => (selectedDetail?.carryoverCandidates ?? []).filter((candidate) => candidate.cardId === drawerCardId),
    [drawerCardId, selectedDetail],
  )
  const selectedCardStyles = useMemo(
    () => (selectedDetail?.plannedStyles ?? []).filter((line) => line.cardId === drawerCardId),
    [drawerCardId, selectedDetail],
  )
  const selectedCardLinks = useMemo(
    () => (selectedDetail?.poLinks ?? []).filter((line) => line.cardId === drawerCardId),
    [drawerCardId, selectedDetail],
  )
  const selectedAttributeMix = useMemo(
    () => selectedCard?.attributeMix ?? [],
    [selectedCard],
  )
  const selectedTargetStoreIds = useMemo(
    () => selectedCard?.targetStoreIds ?? [],
    [selectedCard],
  )
  const selectedAttributePlanMap = useMemo(() => {
    const map = new Map<string, { plannedStyleCount: number; plannedUnits: number; notes?: string | null }>()
    ;(selectedDetail?.attributePlans ?? [])
      .filter((row) => row.cardId === drawerCardId)
      .forEach((row) => {
        map.set(attributePlanKey(row.dimensionCode, row.valueCode), {
          plannedStyleCount: row.plannedStyleCount,
          plannedUnits: row.plannedUnits,
          notes: row.notes,
        })
      })
    return map
  }, [drawerCardId, selectedDetail])

  const filteredChecklistRows = useMemo(() => {
    const term = landingSearch.trim().toLowerCase()
    const rows = checklistCategories.data ?? []
    if (!term) return rows
    return rows.filter((row) => [
      String(row.categoryNumber),
      row.categoryLabel,
      String(row.departmentNumber ?? ''),
      row.departmentLabel,
      row.buyerCode ?? '',
      row.buyerLabel ?? '',
    ].some((value) => value.toLowerCase().includes(term)))
  }, [checklistCategories.data, landingSearch])

  const carryingSuggestionRows = useMemo(
    () => (carryingRows.data ?? []).filter((row) => row.suggestedCarries),
    [carryingRows.data],
  )
  const carryingSuggestionSummary = useMemo(() => {
    const stockUnits = carryingSuggestionRows.reduce((sum, row) => sum + row.stockUnits, 0)
    const modelUnits = carryingSuggestionRows.reduce((sum, row) => sum + row.modelUnits, 0)
    return `${formatInt(carryingSuggestionRows.length)} stores suggested from ${formatInt(stockUnits)} stock units and ${formatInt(modelUnits)} model units`
  }, [carryingSuggestionRows])

  useEffect(() => {
    if (!selectedCard) return
    targetForm.setFieldsValue({
      status: selectedCard.status,
      targetNewSkuCount: selectedCard.targetNewSkuCount,
      targetCarryoverSkuCount: selectedCard.targetCarryoverSkuCount,
      notes: selectedCard.notes ?? undefined,
    })
    newStyleTargetForm.setFieldsValue({
      replacementStyleTargetCount: selectedCard.replacementStyleTargetCount,
      additionalNewStyleTargetCount: selectedCard.additionalNewStyleTargetCount,
      totalNewStyleTargetCount: selectedCard.totalNewStyleTargetCount,
    })
    copyForm.setFieldsValue({ targetStoreIds: selectedTargetStoreIds.filter((storeId) => storeId !== selectedCard.seedStoreId) })
    const nextAttributeValues: Record<string, { plannedStyleCount: number; plannedUnits: number; notes?: string | null }> = {}
    selectedAttributeMix.forEach((dimension) => {
      attributeDimensionValues(dimension).forEach((row) => {
        const key = attributePlanKey(dimension.dimensionCode, row.valueCode)
        const existing = selectedAttributePlanMap.get(key)
        nextAttributeValues[key] = {
          plannedStyleCount: existing?.plannedStyleCount ?? 0,
          plannedUnits: existing?.plannedUnits ?? 0,
          notes: existing?.notes,
        }
      })
    })
    setAttributePlanValues(nextAttributeValues)
  }, [copyForm, newStyleTargetForm, selectedAttributeMix, selectedAttributePlanMap, selectedCard, selectedTargetStoreIds, targetForm])

  function putDetail(next: BuyerWorkbookDetail) {
    setSelectedWorkbookId(next.workbook.id)
    queryClient.setQueryData(['buyer-purchase-workbook', next.workbook.id], next)
    void queryClient.invalidateQueries({ queryKey: ['buyer-purchase-workbooks'] })
    void queryClient.invalidateQueries({ queryKey: ['buyer-checklist-categories'] })
  }

  const createWorkbookMutation = useMutation({
    mutationFn: createBuyerWorkbook,
    onSuccess: (next) => {
      putDetail(next)
      setDrawerCardId(next.cards[0]?.id ?? null)
      setReviewSetupVisible(false)
      messageApi.success('History review started')
    },
    onError: (error) => messageApi.error((error as Error).message),
  })

  const updateCardMutation = useMutation({
    mutationFn: (input: {
      workbookId: string
      cardId: string
      status?: BuyerCategoryStatus
      targetNewSkuCount?: number
      targetCarryoverSkuCount?: number
      notes?: string | null
    }) => updateBuyerCategoryCard(input.workbookId, input.cardId, {
      status: input.status,
      targetNewSkuCount: input.targetNewSkuCount,
      targetCarryoverSkuCount: input.targetCarryoverSkuCount,
      notes: input.notes,
      actor: 'buyer',
    }),
    onSuccess: (next) => {
      putDetail(next)
      messageApi.success('Category updated')
    },
    onError: (error) => messageApi.error((error as Error).message),
  })

  const addCarryoverMutation = useMutation({
    mutationFn: (input: { workbookId: string; cardId: string; values: { skuCode: string; skuDescription?: string; color?: string; totalQuantity?: number; notes?: string } }) =>
      addBuyerCarryoverLine(input.workbookId, input.cardId, {
        ...input.values,
        storeId: selectedCard?.seedStoreId ?? null,
        actor: 'buyer',
      }),
    onSuccess: (next) => {
      putDetail(next)
      carryoverForm.resetFields()
      messageApi.success('Carryover added')
    },
    onError: (error) => messageApi.error((error as Error).message),
  })

  const copyModelMutation = useMutation({
    mutationFn: (input: { workbookId: string; cardId: string; targetStoreIds?: number[] }) =>
      copyBuyerSeedModel(input.workbookId, input.cardId, { targetStoreIds: input.targetStoreIds, actor: 'buyer' }),
    onSuccess: (next) => {
      putDetail(next)
      messageApi.success('Seed model copied')
    },
    onError: (error) => messageApi.error((error as Error).message),
  })

  const updateCandidateMutation = useMutation({
    mutationFn: (input: { workbookId: string; candidateId: string; decision?: CarryoverCandidate['decision']; availability?: CarryoverCandidate['availability']; notes?: string | null }) =>
      updateBuyerCarryoverCandidate(input.workbookId, input.candidateId, {
        decision: input.decision,
        availability: input.availability,
        notes: input.notes,
        actor: 'buyer',
      }),
    onSuccess: (next) => {
      putDetail(next)
      messageApi.success('Carryover candidate updated')
    },
    onError: (error) => messageApi.error((error as Error).message),
  })

  const createModelLineMutation = useMutation({
    mutationFn: (input: { workbookId: string; candidateId: string }) =>
      createBuyerCarryoverModelLine(input.workbookId, input.candidateId, { actor: 'buyer' }),
    onSuccess: (next) => {
      putDetail(next)
      messageApi.success('Carryover model line created')
    },
    onError: (error) => messageApi.error((error as Error).message),
  })

  const updateCarryoverLineMutation = useMutation({
    mutationFn: (input: { workbookId: string; lineId: string; sizeCells: CarryoverLine['sizeCells']; totalQuantity: number }) =>
      updateBuyerCarryoverLine(input.workbookId, input.lineId, {
        sizeCells: input.sizeCells,
        totalQuantity: input.totalQuantity,
        actor: 'buyer',
      }),
    onSuccess: (next) => {
      putDetail(next)
      setEditingCarryoverLine(null)
      setEditingSizeCells([])
      messageApi.success('Size quantities saved')
    },
    onError: (error) => messageApi.error((error as Error).message),
  })

  const flagUnavailableMutation = useMutation({
    mutationFn: (input: { workbookId: string; lineId: string; reason: string }) =>
      flagBuyerCarryoverUnavailable(input.workbookId, input.lineId, { reason: input.reason, actor: 'buyer' }),
    onSuccess: (next) => {
      putDetail(next)
      setUnavailableLine(null)
      setUnavailableReason('')
      messageApi.success('Replacement style created')
    },
    onError: (error) => messageApi.error((error as Error).message),
  })

  const flagCandidateUnavailableMutation = useMutation({
    mutationFn: (input: { workbookId: string; candidateId: string; reason: string }) =>
      flagBuyerCarryoverCandidateUnavailable(input.workbookId, input.candidateId, { reason: input.reason, actor: 'buyer' }),
    onSuccess: (next) => {
      putDetail(next)
      setUnavailableCandidate(null)
      setUnavailableReason('')
      messageApi.success('Replacement style target created')
    },
    onError: (error) => messageApi.error((error as Error).message),
  })

  const addStyleMutation = useMutation({
    mutationFn: (input: { workbookId: string; cardId: string; values: Parameters<typeof addBuyerPlannedStyle>[2] }) =>
      addBuyerPlannedStyle(input.workbookId, input.cardId, { ...input.values, actor: 'buyer' }),
    onSuccess: (next) => {
      putDetail(next)
      styleForm.resetFields()
      messageApi.success('Planned style added')
    },
    onError: (error) => messageApi.error((error as Error).message),
  })

  const updateNewStyleTargetsMutation = useMutation({
    mutationFn: (input: { workbookId: string; cardId: string; replacementStyleTargetCount: number; additionalNewStyleTargetCount: number; totalNewStyleTargetCount: number }) =>
      updateBuyerNewStyleTargets(input.workbookId, input.cardId, {
        replacementStyleTargetCount: input.replacementStyleTargetCount,
        additionalNewStyleTargetCount: input.additionalNewStyleTargetCount,
        totalNewStyleTargetCount: input.totalNewStyleTargetCount,
        actor: 'buyer',
      }),
    onSuccess: (next) => {
      putDetail(next)
      messageApi.success('New style targets saved')
    },
    onError: (error) => messageApi.error((error as Error).message),
  })

  const updateAttributePlanMutation = useMutation({
    mutationFn: (input: { workbookId: string; cardId: string; dimensions: AttributeMixDimension[] }) =>
      updateBuyerAttributePlan(input.workbookId, input.cardId, {
        actor: 'buyer',
        rows: input.dimensions.flatMap((dimension) => dimension.values.map((row) => {
          const key = attributePlanKey(dimension.dimensionCode, row.valueCode)
          const plan = attributePlanValues[key] ?? { plannedStyleCount: 0, plannedUnits: 0 }
          return {
            dimensionCode: dimension.dimensionCode,
            dimensionLabel: dimension.dimensionLabel,
            valueCode: row.valueCode,
            valueLabel: row.valueLabel,
            plannedStyleCount: plan.plannedStyleCount,
            plannedUnits: plan.plannedUnits,
            notes: plan.notes,
          }
        })),
      }),
    onSuccess: (next) => {
      putDetail(next)
      messageApi.success('Attribute plan saved')
    },
    onError: (error) => messageApi.error((error as Error).message),
  })

  const linkPoMutation = useMutation({
    mutationFn: (input: { workbookId: string; values: { poId: string; plannedStyleId?: string; carryoverLineId?: string; quantity?: number; notes?: string } }) =>
      linkBuyerPurchaseOrder(input.workbookId, {
        cardId: selectedCard!.id,
        poId: input.values.poId,
        plannedStyleId: input.values.plannedStyleId || null,
        carryoverLineId: input.values.carryoverLineId || null,
        quantity: input.values.quantity ?? 0,
        notes: input.values.notes,
        linkedBy: 'buyer',
      }),
    onSuccess: (next) => {
      putDetail(next)
      poLinkForm.resetFields()
      messageApi.success('PO linked')
    },
    onError: (error) => messageApi.error((error as Error).message),
  })

  const carryingMutation = useMutation({
    mutationFn: bulkUpdateStoreCategoryCarrying,
    onSuccess: (rows) => {
      if (rows[0]) setCarryingCategoryNumber(rows[0].categoryNumber)
      void queryClient.invalidateQueries({ queryKey: ['store-category-carrying'] })
      messageApi.success('Carrying setup saved')
    },
    onError: (error) => messageApi.error((error as Error).message),
  })

  const storeOptions = stores.map((store) => ({
    value: store.id,
    label: `${store.id} - ${store.name}`,
  }))
  const chainOptions = storeChains.map((chain) => ({
    value: chain.id,
    label: `${chain.label} (${chain.storeCount})`,
  }))
  const categoryOptions = categories.map((category) => ({
    value: category.number,
    label: `${category.number} - ${category.description}`,
  }))
  const departmentOptions = departments.map((department) => ({
    value: department.number,
    label: `${department.number} - ${department.description}`,
  }))
  const poOptions = purchaseOrders.data?.data.map((po) => ({
    value: po.id,
    label: `${po.poNumber} - ${po.vendorName ?? po.vendorId}`,
  })) ?? []

  const landingColumns: ColumnsType<BuyerChecklistCategoryRow> = [
    {
      title: 'Category',
      dataIndex: 'categoryLabel',
      width: 260,
      render: (value: string, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{value}</Text>
          <Text type="secondary">{row.buyerLabel ?? row.buyerCode ?? 'No buyer attribute'}</Text>
        </Space>
      ),
    },
    { title: 'Department', dataIndex: 'departmentLabel', width: 220 },
    { title: 'Last 12M Sales', dataIndex: 'last12MonthsSales', align: 'right', width: 130, render: formatMoney },
    { title: 'Last 12M Units', dataIndex: 'last12MonthsUnits', align: 'right', width: 120, render: formatInt },
    {
      title: 'Current Inventory',
      dataIndex: 'currentInventoryUnits',
      align: 'right',
      width: 150,
      render: (value: number, row) => (
        <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}>
          <Text>{formatInt(value)} units</Text>
          <Text type="secondary">{formatMoney(row.currentInventoryValue)}</Text>
        </Space>
      ),
    },
    { title: 'Dept. OTB', dataIndex: 'departmentOtbUnits', align: 'right', width: 110, render: (value: number | null) => value == null ? 'n/a' : formatInt(value) },
    { title: 'Current Plan', width: 140, render: (_, row) => planStatusTag(row.currentSeason.status) },
    { title: 'Next Season', width: 140, render: (_, row) => planStatusTag(row.nextSeason.status) },
    { title: 'Future Season', width: 140, render: (_, row) => planStatusTag(row.followingSeason.status) },
    {
      title: 'Updated',
      width: 120,
      render: (_, row) => row.currentSeason.updatedAt ? new Date(row.currentSeason.updatedAt).toLocaleDateString() : '-',
    },
    {
      title: '',
      width: 130,
      fixed: 'right',
      render: (_, row) => (
        <Button
          type={row.action === 'CONTINUE' ? 'default' : 'primary'}
          size="small"
          onClick={() => row.action === 'CONTINUE' ? continueCategory(row) : startCategoryReview(row)}
        >
          {row.action === 'CONTINUE' ? 'Continue' : 'Start Review'}
        </Button>
      ),
    },
  ]

  const historyColumns: ColumnsType<HistoricalMonthMetric> = [
    { title: 'Month', dataIndex: 'yearMonth', width: 96 },
    { title: 'Sold', dataIndex: 'quantitySold', align: 'right', render: formatInt },
    { title: 'Net Sales', dataIndex: 'netSales', align: 'right', render: formatMoney },
    { title: 'Beg. Inv.', dataIndex: 'beginningOnHand', align: 'right', render: formatInt },
    { title: 'Profit', dataIndex: 'profit', align: 'right', render: formatMoney },
    { title: 'GP ROI', dataIndex: 'roiPct', align: 'right', render: formatPct },
    { title: 'Turns', dataIndex: 'turns', align: 'right', render: (value: number | null) => value == null ? 'n/a' : value.toFixed(2) },
    { title: 'New SKUs', dataIndex: 'newSkuDistinctCount', align: 'right', render: formatInt },
    { title: 'Carryover SKUs', dataIndex: 'carryoverSkuDistinctCount', align: 'right', render: formatInt },
  ]

  const candidateColumns: ColumnsType<CarryoverCandidate> = [
    {
      title: 'SKU',
      dataIndex: 'skuCode',
      width: 145,
      render: (value: string) => <Link to={`/products/inquiry/${encodeURIComponent(value)}`}>{value}</Link>,
    },
    { title: 'Description', dataIndex: 'skuDescription', width: 220 },
    {
      title: 'Units',
      dataIndex: ['metrics', 'unitsSold'],
      align: 'right',
      width: 80,
      render: formatInt,
      sorter: (left, right) => compareNumber(left.metrics.unitsSold, right.metrics.unitsSold),
      sortDirections: ['descend', 'ascend'],
    },
    {
      title: 'Sales',
      dataIndex: ['metrics', 'netSales'],
      align: 'right',
      width: 100,
      render: formatMoney,
      sorter: (left, right) => compareNumber(left.metrics.netSales, right.metrics.netSales),
      sortDirections: ['descend', 'ascend'],
    },
    { title: 'GP%', dataIndex: ['metrics', 'grossProfitPct'], align: 'right', width: 80, render: formatPct },
    { title: 'ROI', dataIndex: ['metrics', 'roiPct'], align: 'right', width: 80, render: formatPct },
    { title: 'Turns', dataIndex: ['metrics', 'turns'], align: 'right', width: 80, render: (value: number | null) => value == null ? 'n/a' : value.toFixed(2) },
    { title: 'Inventory', dataIndex: ['metrics', 'currentOnHand'], align: 'right', width: 95, render: formatInt },
    {
      title: 'On Order',
      width: 95,
      align: 'right',
      render: (_, row) => formatInt(row.metrics.currentOnOrder + row.metrics.futureOnOrder),
    },
    { title: 'Sell-through', dataIndex: ['metrics', 'sellThroughPct'], align: 'right', width: 105, render: formatPct },
    {
      title: 'Decision',
      dataIndex: 'decision',
      width: 140,
      render: (value: CarryoverCandidate['decision'], row) => (
        <Select
          size="small"
          value={value}
          options={candidateDecisionOptions}
          style={{ width: 125 }}
          onChange={(decision) => updateCandidateMutation.mutate({
            workbookId: row.workbookId,
            candidateId: row.id,
            decision,
          })}
        />
      ),
    },
    {
      title: 'Availability',
      dataIndex: 'availability',
      width: 115,
      render: (value: CarryoverCandidate['availability']) => value === 'UNAVAILABLE'
        ? <Tag color="red">Unavailable</Tag>
        : value === 'AVAILABLE'
          ? <Tag color="green">Available</Tag>
          : <Tag>Unknown</Tag>,
    },
    {
      title: '',
      width: 210,
      fixed: 'right',
      render: (_, row) => (
        <Space>
          <Button
            size="small"
            disabled={row.availability === 'UNAVAILABLE'}
            loading={createModelLineMutation.isPending}
            onClick={() => createModelLineMutation.mutate({ workbookId: row.workbookId, candidateId: row.id })}
          >
            Create Model
          </Button>
          <Button
            size="small"
            danger
            disabled={row.availability === 'UNAVAILABLE'}
            onClick={() => setUnavailableCandidate(row)}
          >
            Unavailable
          </Button>
        </Space>
      ),
    },
  ]

  function attributeColumns(dimension: AttributeMixDimension): ColumnsType<AttributeMixRow> {
    return [
    { title: 'Value', dataIndex: 'valueLabel', width: 180 },
    { title: 'Units', dataIndex: 'unitsSold', align: 'right', render: formatInt },
      { title: 'Mix %', dataIndex: 'salesPct', align: 'right', render: formatPct },
    { title: 'Net Sales', dataIndex: 'netSales', align: 'right', render: formatMoney },
    { title: 'ROI', dataIndex: 'roiPct', align: 'right', render: formatPct },
    { title: 'Sell-through', dataIndex: 'sellThroughPct', align: 'right', render: formatPct },
      {
        title: 'Planned Styles',
        width: 140,
        render: (_, row) => {
          const key = attributePlanKey(dimension.dimensionCode, row.valueCode)
          return (
            <InputNumber
              min={0}
              value={attributePlanValues[key]?.plannedStyleCount ?? 0}
              style={{ width: '100%' }}
              onChange={(value) => setAttributePlanValues((previous) => ({
                ...previous,
                [key]: {
                  plannedStyleCount: Math.max(0, Number(value ?? 0)),
                  plannedUnits: previous[key]?.plannedUnits ?? 0,
                  notes: previous[key]?.notes,
                },
              }))}
            />
          )
        },
      },
    ]
  }

  const carryoverColumns: ColumnsType<CarryoverLine> = [
    { title: 'Store', dataIndex: 'storeId', width: 80, render: (value: number | null) => value ?? 'Seed' },
    {
      title: 'SKU',
      dataIndex: 'skuCode',
      width: 150,
      render: (value: string) => <Link to={`/products/inquiry/${encodeURIComponent(value)}`}>{value}</Link>,
    },
    { title: 'Description', dataIndex: 'skuDescription' },
    { title: 'Color', dataIndex: 'color', width: 120 },
    {
      title: 'Sizes',
      width: 220,
      render: (_, line) => line.sizeCells.length
        ? line.sizeCells
          .slice(0, 5)
          .map((cell) => `${cell.sizeLabel ?? cell.columnLabel ?? cell.rowLabel ?? 'Size'}: ${formatInt(cell.plannedQty ?? cell.quantity ?? 0)}`)
          .join(', ')
        : '-',
    },
    { title: 'Qty', dataIndex: 'totalQuantity', align: 'right', width: 80, render: formatInt },
    { title: 'Source', dataIndex: 'source', width: 110, render: (value: string) => <Tag>{value}</Tag> },
    {
      title: 'Status',
      width: 130,
      render: (_, line) => line.unavailable ? <Tag color="red">Unavailable</Tag> : <Tag color="green">Available</Tag>,
    },
    {
      title: '',
      width: 260,
      render: (_, line) => (
        <Space>
          <Button size="small" icon={<FileSearchOutlined />} href={`/products/inquiry/${encodeURIComponent(line.skuCode)}`}>
            Reorder
          </Button>
          <Button
            size="small"
            onClick={() => {
              setEditingCarryoverLine(line)
              setEditingSizeCells(line.sizeCells.length ? line.sizeCells : [{ rowLabel: null, columnLabel: null, sizeLabel: 'Qty', quantity: line.totalQuantity, plannedQty: line.totalQuantity }])
            }}
          >
            Sizes
          </Button>
          <Button
            size="small"
            danger
            icon={<StopOutlined />}
            disabled={line.unavailable}
            onClick={() => setUnavailableLine(line)}
          >
            Unavailable
          </Button>
        </Space>
      ),
    },
  ]

  const styleColumns: ColumnsType<PlannedStyle> = [
    { title: 'Vendor', dataIndex: 'vendorName', width: 160, render: (value, row) => value ?? row.vendorCode ?? 'TBD' },
    { title: 'Style', dataIndex: 'workingStyle', width: 160, render: (value) => value ?? 'TBD' },
    { title: 'Description', dataIndex: 'description' },
    { title: 'Color', dataIndex: 'color', width: 120 },
    { title: 'Family', dataIndex: 'colorFamily', width: 120 },
    { title: 'Units', dataIndex: 'targetUnits', align: 'right', width: 90, render: formatInt },
    { title: 'Status', dataIndex: 'status', width: 110, render: (value: string) => <Tag>{value}</Tag> },
  ]

  const poLinkColumns: ColumnsType<BuyerPoLink> = [
    {
      title: 'PO',
      dataIndex: 'poNumber',
      width: 150,
      render: (value: string, row) => <Link to={`/purchasing/orders/${encodeURIComponent(row.poId)}`}>{value}</Link>,
    },
    { title: 'Qty', dataIndex: 'quantity', align: 'right', width: 90, render: formatInt },
    { title: 'Notes', dataIndex: 'notes' },
    { title: 'Linked By', dataIndex: 'linkedBy', width: 120 },
  ]

  const carryingColumns: ColumnsType<StoreCategoryCarryingRow> = [
    { title: 'Store', dataIndex: 'storeLabel' },
    {
      title: 'Stock/Model Signal',
      width: 230,
      render: (_, row) => (
        <Space wrap>
          {row.stockUnits > 0 ? <Tag color="green">{formatInt(row.stockUnits)} stock</Tag> : null}
          {row.modelUnits > 0 ? <Tag color="blue">{formatInt(row.modelUnits)} model</Tag> : null}
          {!row.suggestedCarries ? <Tag>No signal</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Carries',
      dataIndex: 'carries',
      width: 110,
      render: (value: boolean, row) => (
        <Switch
          checked={value}
          onChange={(checked) => carryingMutation.mutate({
            categoryNumber: row.categoryNumber,
            storeIds: [row.storeId],
            carries: checked,
            note: checked ? 'Manual carry override' : 'Manual do-not-carry override',
            updatedBy: 'buyer',
          })}
        />
      ),
    },
    { title: 'Source', dataIndex: 'source', width: 100, render: (value: string) => <Tag>{value}</Tag> },
    { title: 'Chain', dataIndex: 'chainCode', width: 120 },
    { title: 'Note', dataIndex: 'note' },
  ]

  function applySuggestedCarrying() {
    if (carryingCategoryNumber == null) return
    const rows = carryingRows.data ?? []
    if (rows.length === 0) return
    carryingMutation.mutate({
      categoryNumber: carryingCategoryNumber,
      storeIds: rows.map((row) => row.storeId),
      carries: false,
      exceptions: carryingSuggestionRows.map((row) => ({
        storeId: row.storeId,
        carries: true,
        note: [
          row.stockUnits > 0 ? `${formatInt(row.stockUnits)} stock units` : null,
          row.modelUnits > 0 ? `${formatInt(row.modelUnits)} model units` : null,
        ].filter(Boolean).join(', ') || 'Inferred from stock/model signal',
      })),
      note: 'No current stock or model quantity for category',
      updatedBy: 'buyer',
    })
  }

  function openCard(card: BuyerCategoryCard) {
    setDrawerCardId(card.id)
  }

  function startCategoryReview(row: BuyerChecklistCategoryRow) {
    setSelectedWorkbookId(null)
    setDrawerCardId(null)
    setReviewSetupVisible(true)
    setCarryingCategoryNumber(row.categoryNumber)
    const seasonLabel = seasonOptions.find((option) => option.value === landingSeason)?.label ?? landingSeason
    createForm.setFieldsValue({
      buyingSeason: landingSeason,
      seasonYear: landingYear,
      categoryNumbers: [row.categoryNumber],
      departmentNumbers: undefined,
      buyer: row.buyerCode ?? 'buyer',
      createdBy: 'buyer',
      label: `${seasonLabel} ${landingYear} ${row.categoryLabel}`,
    })
    carryingForm.setFieldsValue({ categoryNumber: row.categoryNumber })
  }

  function continueCategory(row: BuyerChecklistCategoryRow) {
    if (!row.currentSeason.workbookId || !row.currentSeason.cardId) {
      startCategoryReview(row)
      return
    }
    setSelectedWorkbookId(row.currentSeason.workbookId)
    setDrawerCardId(row.currentSeason.cardId)
  }

  function saveEditingSizeCells() {
    if (!selectedDetail || !editingCarryoverLine) return
    const totalQuantity = editingSizeCells.reduce((sum, cell) => sum + Math.max(0, Math.trunc(Number(cell.plannedQty ?? cell.quantity ?? 0))), 0)
    updateCarryoverLineMutation.mutate({
      workbookId: selectedDetail.workbook.id,
      lineId: editingCarryoverLine.id,
      sizeCells: editingSizeCells,
      totalQuantity,
    })
  }

  return (
    <div style={{ padding: 24 }}>
      {contextHolder}
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>Buyer Checklist</Title>
          <Text type="secondary">Start with the category dashboard, then review history for one seed store and season.</Text>
        </div>

        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fff' }}>
          <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 12 }}>
            <Col xs={24} xl={8}>
              <Title level={4} style={{ margin: 0 }}>Buyer Checklist Landing Page</Title>
              <Text type="secondary">Categories you are responsible for, current inventory, open-to-buy, and planning status.</Text>
            </Col>
            <Col xs={12} md={5} xl={3}>
              <Input
                allowClear
                value={buyerFilter}
                placeholder="Buyer code (optional)"
                onChange={(event) => setBuyerFilter(event.target.value)}
              />
            </Col>
            <Col xs={12} md={7} xl={5}>
              <Input.Search
                allowClear
                value={landingSearch}
                placeholder="Search category 262, 560..."
                onChange={(event) => setLandingSearch(event.target.value)}
                onSearch={setLandingSearch}
              />
            </Col>
            <Col xs={12} md={4} xl={3}>
              <Select
                value={landingSeason}
                options={seasonOptions}
                style={{ width: '100%' }}
                onChange={setLandingSeason}
              />
            </Col>
            <Col xs={12} md={3} xl={2}>
              <InputNumber
                min={2020}
                max={2100}
                value={landingYear}
                style={{ width: '100%' }}
                onChange={(value) => setLandingYear(Number(value ?? new Date().getFullYear()))}
              />
            </Col>
            <Col xs={24} md={5} xl={3}>
              <Button block icon={<FileSearchOutlined />} onClick={() => setReviewSetupVisible(true)}>
                Manual Review Setup
              </Button>
            </Col>
          </Row>
          <Table<BuyerChecklistCategoryRow>
            size="small"
            rowKey={(row) => `${row.categoryNumber}-${row.departmentNumber ?? 'none'}`}
            loading={checklistCategories.isLoading}
            columns={landingColumns}
            dataSource={filteredChecklistRows}
            pagination={{ pageSize: 12 }}
            scroll={{ x: 1500 }}
          />
        </div>

        {reviewSetupVisible ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={16}>
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fff' }}>
              <Title level={4} style={{ marginTop: 0 }}>Review Sales History</Title>
              <Form<BuyerWorkbookCreateRequest>
                form={createForm}
                layout="vertical"
                initialValues={{
                  buyingSeason: 'FALL_WINTER',
                  seasonYear: new Date().getFullYear(),
                  buyer: 'buyer',
                  createdBy: 'buyer',
                }}
                onFinish={(values) => createWorkbookMutation.mutate({
                  ...values,
                  buyer: values.buyer ?? (buyerFilter.trim() || 'buyer'),
                  createdBy: values.createdBy ?? 'buyer',
                  targetStoreIds: values.targetStoreIds?.length ? values.targetStoreIds : undefined,
                  categoryNumbers: values.categoryNumbers?.length ? values.categoryNumbers : undefined,
                  departmentNumbers: values.departmentNumbers?.length ? values.departmentNumbers : undefined,
                })}
              >
                <Row gutter={12}>
                  <Col xs={24} md={5}>
                    <Form.Item label="Seed Store" name="seedStoreId" rules={[{ required: true }]}>
                      <Select showSearch loading={storesLoading} optionFilterProp="label" options={storeOptions} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={7}>
                    <Form.Item label="Categories to Review" name="categoryNumbers">
                      <Select mode="multiple" maxTagCount="responsive" showSearch loading={categoriesLoading} optionFilterProp="label" options={categoryOptions} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item label="Departments to Review" name="departmentNumbers">
                      <Select mode="multiple" maxTagCount="responsive" showSearch loading={departmentsLoading} optionFilterProp="label" options={departmentOptions} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={3}>
                    <Form.Item label="Season" name="buyingSeason" rules={[{ required: true }]}>
                      <Select options={seasonOptions} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={3}>
                    <Form.Item label="Year" name="seasonYear" rules={[{ required: true }]}>
                      <InputNumber min={2020} max={2100} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={7}>
                    <Form.Item label="Plan Name" name="label">
                      <Input placeholder="Fall/Winter 2026 Smoking" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={9}>
                    <Form.Item label="Copy-To Stores" name="targetStoreIds">
                      <Select mode="multiple" maxTagCount="responsive" showSearch loading={storesLoading} optionFilterProp="label" options={storeOptions} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={4}>
                    <Form.Item label=" ">
                      <Button block type="primary" htmlType="submit" icon={<FileSearchOutlined />} loading={createWorkbookMutation.isPending}>
                        Review History
                      </Button>
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
            </div>
          </Col>

          <Col xs={24} xl={8}>
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fff' }}>
              <Title level={4} style={{ marginTop: 0 }}>Carrying Setup</Title>
              <Form
                form={carryingForm}
                layout="vertical"
                initialValues={{ carries: true }}
                onFinish={(values) => {
                  setCarryingCategoryNumber(values.categoryNumber)
                  carryingMutation.mutate({
                    categoryNumber: values.categoryNumber,
                    chainCode: values.chainCode,
                    storeIds: values.storeIds,
                    carries: values.carries,
                    note: values.note,
                    updatedBy: 'buyer',
                  })
                }}
              >
                <Row gutter={12}>
                  <Col xs={24} md={12}>
                    <Form.Item label="Category" name="categoryNumber" rules={[{ required: true }]}>
                      <Select
                        showSearch
                        loading={categoriesLoading}
                        optionFilterProp="label"
                        options={categoryOptions}
                        onChange={(value) => setCarryingCategoryNumber(value)}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Chain" name="chainCode">
                      <Select allowClear showSearch loading={chainsLoading} optionFilterProp="label" options={chainOptions} />
                    </Form.Item>
                  </Col>
                  <Col xs={24}>
                    <Form.Item label="Specific Stores" name="storeIds">
                      <Select mode="multiple" maxTagCount="responsive" showSearch loading={storesLoading} optionFilterProp="label" options={storeOptions} />
                    </Form.Item>
                  </Col>
                  <Col xs={8}>
                    <Form.Item label="Carries" name="carries" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  </Col>
                  <Col xs={16}>
                    <Form.Item label="Note" name="note">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Button htmlType="submit" icon={<SaveOutlined />} loading={carryingMutation.isPending}>
                      Apply Carrying Setup
                    </Button>
                  </Col>
                </Row>
              </Form>
            </div>
          </Col>
        </Row>
        ) : null}

        {carryingCategoryNumber != null ? (
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fff' }}>
            <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 12 }}>
              <Col xs={24} md={14}>
                <Title level={4} style={{ margin: 0 }}>Store Carrying Matrix</Title>
                <Text type="secondary">{carryingSuggestionSummary}</Text>
              </Col>
              <Col xs={24} md={10}>
                <Button
                  icon={<SaveOutlined />}
                  loading={carryingMutation.isPending}
                  disabled={carryingRows.isLoading || carryingSuggestionRows.length === 0}
                  onClick={applySuggestedCarrying}
                >
                  Apply Suggested Stores
                </Button>
              </Col>
            </Row>
            <Table<StoreCategoryCarryingRow>
              size="small"
              rowKey={(row) => `${row.storeId}-${row.categoryNumber}`}
              loading={carryingRows.isLoading}
              columns={carryingColumns}
              dataSource={carryingRows.data ?? []}
              pagination={{ pageSize: 12 }}
            />
          </div>
        ) : null}

        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fff' }}>
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} md={12}>
              <Title level={4} style={{ margin: 0 }}>Saved Buying Plans</Title>
            </Col>
            <Col xs={24} md={12}>
              <Select
                style={{ width: '100%' }}
                value={selectedWorkbookId ?? undefined}
                loading={workbooks.isLoading}
                placeholder="Open saved buying plan"
                onChange={setSelectedWorkbookId}
                options={(workbooks.data ?? []).map((workbook) => ({
                  value: workbook.id,
                  label: `${workbook.label} - ${workbookProgress(workbook)}`,
                }))}
              />
            </Col>
          </Row>
        </div>

        {detail.error ? (
          <Alert type="error" message={(detail.error as Error).message} />
        ) : null}

        {selectedDetail ? (
          <div>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space wrap>
                <Title level={3} style={{ margin: 0 }}>{selectedDetail.workbook.label}</Title>
                <Tag>{seasonOptions.find((option) => option.value === selectedDetail.workbook.buyingSeason)?.label}</Tag>
                <Tag>{selectedDetail.workbook.seasonMonths.join(', ')}</Tag>
                <Tag>Seed store {selectedDetail.workbook.seedStoreId}</Tag>
              </Space>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(220px, 1fr))', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                {statusColumns.map((column) => {
                  const cards = selectedDetail.cards.filter((card) => card.status === column.key)
                  return (
                    <div key={column.key} style={{ minWidth: 220, background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: 10 }}>
                      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 8 }}>
                        <Text strong>{column.label}</Text>
                        <Tag color={column.color}>{cards.length}</Tag>
                      </Space>
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        {cards.map((card) => (
                          <button
                            key={card.id}
                            type="button"
                            onClick={() => openCard(card)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              border: '1px solid #d9d9d9',
                              borderRadius: 8,
                              background: '#fff',
                              padding: 12,
                              cursor: 'pointer',
                            }}
                          >
                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                              <Text strong>{card.categoryLabel}</Text>
                              <Text type="secondary">{card.departmentLabel}</Text>
                              <Space wrap size={4}>
                                <Tag>New {formatInt(card.targetNewSkuCount)}</Tag>
                                <Tag>Carry {formatInt(card.targetCarryoverSkuCount)}</Tag>
                                <Tag>{formatInt(cardCount(selectedDetail, card.id, 'carryovers'))} carryovers</Tag>
                                <Tag>{formatInt(cardCount(selectedDetail, card.id, 'styles'))} styles</Tag>
                                <Tag>{formatInt(cardCount(selectedDetail, card.id, 'poLinks'))} PO links</Tag>
                              </Space>
                            </Space>
                          </button>
                        ))}
                      </Space>
                    </div>
                  )
                })}
              </div>
            </Space>
          </div>
        ) : (
          <Alert type="info" message="Choose a seed store and category to review history, or open a saved buying plan." />
        )}
      </Space>

      <Drawer
        title={selectedCard ? `${selectedCard.categoryLabel} - ${selectedCard.departmentLabel}` : 'Category Detail'}
        open={!!selectedCard}
        width="min(1280px, 96vw)"
        onClose={() => setDrawerCardId(null)}
        destroyOnClose={false}
      >
        {selectedCard && selectedDetail ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Space wrap>
              {statusTag(selectedCard.status)}
              <Tag>Seed store {selectedCard.seedStoreId}</Tag>
              <Tag>{formatInt(selectedTargetStoreIds.length)} target stores</Tag>
              <Tag>Historical sample {formatInt(selectedCard.history.summary.sampleMonths)} months</Tag>
            </Space>

            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16 }}>
              <Title level={4} style={{ marginTop: 0 }}>Targets</Title>
              <Form form={targetForm} layout="vertical" onFinish={(values) => updateCardMutation.mutate({
                workbookId: selectedDetail.workbook.id,
                cardId: selectedCard.id,
                status: values.status,
                targetNewSkuCount: values.targetNewSkuCount,
                targetCarryoverSkuCount: values.targetCarryoverSkuCount,
                notes: values.notes,
              })}>
                <Row gutter={12}>
                  <Col xs={24} md={6}>
                    <Form.Item label="Status" name="status" rules={[{ required: true }]}>
                      <Select options={statusOptions} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={4}>
                    <Form.Item label="New SKUs" name="targetNewSkuCount" rules={[{ required: true }]}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={4}>
                    <Form.Item label="Carryover SKUs" name="targetCarryoverSkuCount" rules={[{ required: true }]}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={7}>
                    <Form.Item label="Notes" name="notes">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={3}>
                    <Form.Item label=" ">
                      <Button
                        block
                        htmlType="submit"
                        icon={<SaveOutlined />}
                        loading={updateCardMutation.isPending}
                        onClick={() => targetForm.submit()}
                      >
                        Save
                      </Button>
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
              <Text type="secondary">
                Suggested from history: {formatInt(selectedCard.suggestedNewSkuCount)} new and {formatInt(selectedCard.suggestedCarryoverSkuCount)} carryover SKUs.
              </Text>
            </div>

            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16 }}>
              <Title level={4} style={{ marginTop: 0 }}>History</Title>
              <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
                <Col xs={12} md={6}><Text strong>Units: </Text>{formatInt(selectedCard.history.summary.totalQuantitySold)}</Col>
                <Col xs={12} md={6}><Text strong>Net sales: </Text>{formatMoney(selectedCard.history.summary.totalNetSales)}</Col>
                <Col xs={12} md={6}><Text strong>Avg. BOH: </Text>{formatInt(selectedCard.history.summary.averageBeginningOnHand)}</Col>
                <Col xs={12} md={6}><Text strong>Sell-through: </Text>n/a when receipts are unavailable</Col>
              </Row>
              <Table<HistoricalMonthMetric>
                size="small"
                rowKey="yearMonth"
                columns={historyColumns}
                dataSource={selectedCard.history.months}
                pagination={{ pageSize: 6 }}
                scroll={{ x: 900 }}
              />
            </div>

            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16 }}>
              <Title level={4} style={{ marginTop: 0 }}>Carryover Winner Review</Title>
              <Text type="secondary">
                Decide which carryover SKUs are winners before building the reorder model. Turns and ROI are shown here so the carryover count is based on performance.
              </Text>
              <Table<CarryoverCandidate>
                size="small"
                rowKey="id"
                columns={candidateColumns}
                dataSource={selectedCardCandidates}
                pagination={{ pageSize: 8 }}
                scroll={{ x: 1450 }}
                style={{ marginTop: 12 }}
              />
            </div>

            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16 }}>
              <Title level={4} style={{ marginTop: 0 }}>Carryover Model</Title>
              <Form
                form={copyForm}
                layout="inline"
                style={{ marginBottom: 12 }}
                onFinish={(values) => copyModelMutation.mutate({
                  workbookId: selectedDetail.workbook.id,
                  cardId: selectedCard.id,
                  targetStoreIds: values.targetStoreIds?.length ? values.targetStoreIds : undefined,
                })}
              >
                <Form.Item label="Copy to stores" name="targetStoreIds" style={{ minWidth: 320 }}>
                  <Select mode="multiple" maxTagCount="responsive" showSearch optionFilterProp="label" options={storeOptions} />
                </Form.Item>
                <Form.Item>
                  <Button htmlType="submit" icon={<CopyOutlined />} loading={copyModelMutation.isPending}>
                    Copy Exact Model
                  </Button>
                </Form.Item>
              </Form>
              <Form
                form={carryoverForm}
                layout="vertical"
                onFinish={(values) => addCarryoverMutation.mutate({
                  workbookId: selectedDetail.workbook.id,
                  cardId: selectedCard.id,
                  values,
                })}
              >
                <Row gutter={12}>
                  <Col xs={24} md={4}>
                    <Form.Item label="SKU" name="skuCode" rules={[{ required: true }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={7}>
                    <Form.Item label="Description" name="skuDescription">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={3}>
                    <Form.Item label="Color" name="color">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={3}>
                    <Form.Item label="Qty" name="totalQuantity">
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={5}>
                    <Form.Item label="Notes" name="notes">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={2}>
                    <Form.Item label=" ">
                      <Button block htmlType="submit" icon={<PlusOutlined />} loading={addCarryoverMutation.isPending}>
                        Add
                      </Button>
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
              <Table<CarryoverLine>
                size="small"
                rowKey="id"
                columns={carryoverColumns}
                dataSource={selectedCardCarryovers}
                pagination={{ pageSize: 8 }}
                scroll={{ x: 1000 }}
              />
            </div>

            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16 }}>
              <Title level={4} style={{ marginTop: 0 }}>New and Replacement Styles</Title>
              <Form
                form={newStyleTargetForm}
                layout="vertical"
                style={{ marginBottom: 12 }}
                onValuesChange={(changedValues, values) => {
                  if (!('replacementStyleTargetCount' in changedValues) && !('additionalNewStyleTargetCount' in changedValues)) return
                  const replacement = Number(values.replacementStyleTargetCount ?? 0)
                  const additional = Number(values.additionalNewStyleTargetCount ?? 0)
                  newStyleTargetForm.setFieldValue('totalNewStyleTargetCount', Math.max(0, replacement) + Math.max(0, additional))
                }}
                onFinish={(values) => updateNewStyleTargetsMutation.mutate({
                  workbookId: selectedDetail.workbook.id,
                  cardId: selectedCard.id,
                  replacementStyleTargetCount: values.replacementStyleTargetCount ?? 0,
                  additionalNewStyleTargetCount: values.additionalNewStyleTargetCount ?? 0,
                  totalNewStyleTargetCount: values.totalNewStyleTargetCount ?? 0,
                })}
              >
                <Row gutter={12}>
                  <Col xs={24} md={5}>
                    <Form.Item label="Replacement Styles Needed" name="replacementStyleTargetCount">
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={5}>
                    <Form.Item label="Additional New Styles" name="additionalNewStyleTargetCount">
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={5}>
                    <Form.Item label="Total New/Replacement Styles" name="totalNewStyleTargetCount">
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={4}>
                    <Form.Item label=" ">
                      <Button block htmlType="submit" icon={<SaveOutlined />} loading={updateNewStyleTargetsMutation.isPending}>
                        Save Counts
                      </Button>
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
              <Form
                form={styleForm}
                layout="vertical"
                onFinish={(values) => addStyleMutation.mutate({
                  workbookId: selectedDetail.workbook.id,
                  cardId: selectedCard.id,
                  values,
                })}
              >
                <Row gutter={12}>
                  <Col xs={12} md={3}><Form.Item label="Vendor" name="vendorCode"><Input /></Form.Item></Col>
                  <Col xs={12} md={4}><Form.Item label="Vendor Name" name="vendorName"><Input /></Form.Item></Col>
                  <Col xs={12} md={4}><Form.Item label="Style" name="workingStyle"><Input /></Form.Item></Col>
                  <Col xs={12} md={5}><Form.Item label="Description" name="description"><Input /></Form.Item></Col>
                  <Col xs={12} md={3}><Form.Item label="Color" name="color"><Input /></Form.Item></Col>
                  <Col xs={12} md={3}><Form.Item label="Family" name="colorFamily"><Input /></Form.Item></Col>
                  <Col xs={12} md={2}><Form.Item label="Units" name="targetUnits"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} md={3}><Form.Item label="Cost" name="quotedUnitCost"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={12} md={3}><Form.Item label="SKUs" name="targetNewSkuCount"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={24} md={15}><Form.Item label="Notes" name="notes"><Input /></Form.Item></Col>
                  <Col xs={24} md={3}>
                    <Form.Item label=" ">
                      <Button block htmlType="submit" icon={<PlusOutlined />} loading={addStyleMutation.isPending}>
                        Add Style
                      </Button>
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
              <Table<PlannedStyle>
                size="small"
                rowKey="id"
                columns={styleColumns}
                dataSource={selectedCardStyles}
                pagination={{ pageSize: 8 }}
                scroll={{ x: 900 }}
              />
            </div>

            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16 }}>
              <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 12 }}>
                <Col xs={24} md={18}>
                  <Title level={4} style={{ margin: 0 }}>Attribute Plan</Title>
                  <Text type="secondary">Each dimension has its own mix percent, so Color, Punta de Tacon, Material, and other relevant attributes are not blended together.</Text>
                </Col>
                <Col xs={24} md={6}>
                  <Button
                    block
                    icon={<SaveOutlined />}
                    loading={updateAttributePlanMutation.isPending}
                    onClick={() => updateAttributePlanMutation.mutate({
                      workbookId: selectedDetail.workbook.id,
                      cardId: selectedCard.id,
                      dimensions: selectedAttributeMix,
                    })}
                  >
                    Save Attribute Plan
                  </Button>
                </Col>
              </Row>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {selectedAttributeMix.length ? selectedAttributeMix.map((dimension) => (
                  <div key={dimension.dimensionCode} style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                    <Space wrap style={{ marginBottom: 8 }}>
                      <Text strong>{dimension.dimensionLabel}</Text>
                      <Tag>{formatInt(dimension.totalUnitsSold)} units</Tag>
                      <Tag>{formatMoney(dimension.totalNetSales)} sales</Tag>
                    </Space>
                    <Table<AttributeMixRow>
                      size="small"
                      rowKey={(row) => `${dimension.dimensionCode}-${row.valueCode}`}
                      columns={attributeColumns(dimension)}
                      dataSource={attributeDimensionValues(dimension)}
                      pagination={attributeDimensionValues(dimension).length > 8 ? { pageSize: 8 } : false}
                      scroll={{ x: 900 }}
                    />
                  </div>
                )) : <Alert type="info" message="No relevant attribute mix is available for this category history." />}
              </Space>
            </div>

            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16 }}>
              <Title level={4} style={{ marginTop: 0 }}>PO Links</Title>
              <Form
                form={poLinkForm}
                layout="vertical"
                onFinish={(values) => {
                  if (!values.plannedStyleId && !values.carryoverLineId) {
                    messageApi.error('Select a carryover or planned style to link')
                    return
                  }
                  linkPoMutation.mutate({ workbookId: selectedDetail.workbook.id, values })
                }}
              >
                <Row gutter={12}>
                  <Col xs={24} md={6}>
                    <Form.Item label="Purchase Order" name="poId" rules={[{ required: true }]}>
                      <Select showSearch loading={purchaseOrders.isLoading} optionFilterProp="label" options={poOptions} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={5}>
                    <Form.Item label="Carryover" name="carryoverLineId">
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        options={selectedCardCarryovers.map((line) => ({ value: line.id, label: `${line.skuCode} - ${line.skuDescription ?? ''}` }))}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={5}>
                    <Form.Item label="Planned Style" name="plannedStyleId">
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        options={selectedCardStyles.map((style) => ({ value: style.id, label: `${style.workingStyle ?? 'Style'} - ${style.description ?? ''}` }))}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={2}><Form.Item label="Qty" name="quantity"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={24} md={4}><Form.Item label="Notes" name="notes"><Input /></Form.Item></Col>
                  <Col xs={12} md={2}>
                    <Form.Item label=" ">
                      <Tooltip title="Links to an existing PO. The checklist does not create POs.">
                        <Button block htmlType="submit" icon={<LinkOutlined />} loading={linkPoMutation.isPending}>
                          Link
                        </Button>
                      </Tooltip>
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
              <Table<BuyerPoLink>
                size="small"
                rowKey="id"
                columns={poLinkColumns}
                dataSource={selectedCardLinks}
                pagination={false}
              />
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                style={{ marginTop: 12 }}
                onClick={() => updateCardMutation.mutate({
                  workbookId: selectedDetail.workbook.id,
                  cardId: selectedCard.id,
                  status: 'COMPLETE',
                })}
              >
                Mark Category Complete
              </Button>
            </div>
          </Space>
        ) : null}
      </Drawer>

      <Modal
        title={unavailableLine ? `Flag ${unavailableLine.skuCode} unavailable` : 'Flag carryover unavailable'}
        open={!!unavailableLine}
        okText="Create Replacement"
        okButtonProps={{ disabled: unavailableReason.trim().length === 0, loading: flagUnavailableMutation.isPending }}
        onCancel={() => {
          setUnavailableLine(null)
          setUnavailableReason('')
        }}
        onOk={() => {
          if (!selectedDetail || !unavailableLine) return
          flagUnavailableMutation.mutate({
            workbookId: selectedDetail.workbook.id,
            lineId: unavailableLine.id,
            reason: unavailableReason,
          })
        }}
      >
        <Input.TextArea
          rows={3}
          value={unavailableReason}
          onChange={(event) => setUnavailableReason(event.target.value)}
          placeholder="Fabric unavailable, vendor discontinued style, etc."
        />
      </Modal>

      <Modal
        title={unavailableCandidate ? `Flag ${unavailableCandidate.skuCode} unavailable` : 'Flag carryover candidate unavailable'}
        open={!!unavailableCandidate}
        okText="Create Replacement Target"
        okButtonProps={{ disabled: unavailableReason.trim().length === 0, loading: flagCandidateUnavailableMutation.isPending }}
        onCancel={() => {
          setUnavailableCandidate(null)
          setUnavailableReason('')
        }}
        onOk={() => {
          if (!selectedDetail || !unavailableCandidate) return
          flagCandidateUnavailableMutation.mutate({
            workbookId: selectedDetail.workbook.id,
            candidateId: unavailableCandidate.id,
            reason: unavailableReason,
          })
        }}
      >
        <Input.TextArea
          rows={3}
          value={unavailableReason}
          onChange={(event) => setUnavailableReason(event.target.value)}
          placeholder="Fabric unavailable, vendor discontinued style, etc."
        />
      </Modal>

      <Modal
        title={editingCarryoverLine ? `Edit size quantities for ${editingCarryoverLine.skuCode}` : 'Edit size quantities'}
        open={!!editingCarryoverLine}
        width={720}
        okText="Save Size Quantities"
        okButtonProps={{ loading: updateCarryoverLineMutation.isPending }}
        onCancel={() => {
          setEditingCarryoverLine(null)
          setEditingSizeCells([])
        }}
        onOk={saveEditingSizeCells}
      >
        <Table<CarryoverLine['sizeCells'][number]>
          size="small"
          rowKey={(cell) => `${cell.rowLabel ?? ''}-${cell.columnLabel ?? ''}-${cell.sizeLabel ?? ''}-${cell.recommendedQty ?? ''}`}
          pagination={false}
          dataSource={editingSizeCells}
          columns={[
            {
              title: 'Size',
              render: (_, cell) => cell.sizeLabel ?? cell.columnLabel ?? cell.rowLabel ?? 'Qty',
            },
            { title: 'Model', dataIndex: 'modelQty', align: 'right', render: formatInt },
            { title: 'On Hand', dataIndex: 'onHand', align: 'right', render: formatInt },
            { title: 'Recommended', dataIndex: 'recommendedQty', align: 'right', render: formatInt },
            {
              title: 'Planned Qty',
              width: 140,
              render: (_, cell, index) => (
                <InputNumber
                  min={0}
                  value={cell.plannedQty ?? cell.quantity ?? 0}
                  style={{ width: '100%' }}
                  onChange={(value) => setEditingSizeCells((previous) => previous.map((item, itemIndex) => (
                    itemIndex === index
                      ? { ...item, plannedQty: Math.max(0, Number(value ?? 0)), quantity: Math.max(0, Number(value ?? 0)) }
                      : item
                  )))}
                />
              ),
            },
          ]}
        />
      </Modal>
    </div>
  )
}
