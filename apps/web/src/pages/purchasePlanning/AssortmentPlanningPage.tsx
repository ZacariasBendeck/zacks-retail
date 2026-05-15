import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CheckOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, SwapOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { useStores } from '../../hooks/useStores'
import { useCategories, useDepartments } from '../../hooks/useProductsTaxonomy'
import {
  commitAssortmentWave,
  createAssortmentPlan,
  createAssortmentTransferDrafts,
  fetchAssortmentPlan,
  fetchAssortmentPlans,
  previewAssortmentPlan,
  type AssortmentColorOverride,
  type AssortmentColorMix,
  type AssortmentPlanListItem,
  type AssortmentPlanReport,
  type AssortmentPlanningScopeType,
  type AssortmentPoolItem,
  type AssortmentSkuWaveOverride,
  type AssortmentStoreModelOverride,
  type AssortmentStoreAllocation,
  type AssortmentTargetStore,
  type AssortmentWave,
  type AssortmentWaveWeight,
  type AssortmentWaveLine,
} from '../../services/assortmentPlanningApi'

const { Title, Text } = Typography

interface AssortmentForm {
  label?: string
  scopeType: AssortmentPlanningScopeType
  scopeNumber: number
  warehouseStoreId: number
  targetStoreIds?: number[]
  startDate: Dayjs
  horizonMonths: number
  highSeasonMonths: number[]
  historyMonths: number
  modelCoverWeeks: number
  modelDisplayFloor: number
  maxModelQuantity: number
  stockOnlyStoreWeightPct: number
  unseenColorFallbackPct: number
}

const integerFmt = new Intl.NumberFormat('en-US')
const pctFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

const HIGH_SEASON_MONTH_OPTIONS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
]

function formatInt(value: number | null | undefined): string {
  return integerFmt.format(Math.round(value ?? 0))
}

function formatPct(value: number | null | undefined): string {
  return `${pctFmt.format(value ?? 0)}%`
}

function reasonTag(reason: AssortmentPoolItem['inclusionReason']) {
  if (reason === 'Both') return <Tag color="purple">Both</Tag>
  if (reason === 'PR') return <Tag color="blue">PR</Tag>
  return <Tag>Never distributed</Tag>
}

function statusTag(status: string) {
  if (status === 'COMMITTED') return <Tag color="green">Committed</Tag>
  if (status === 'TRANSFER_DRAFTED') return <Tag color="blue">Transfer drafted</Tag>
  if (status === 'ACTIVE') return <Tag color="cyan">Active</Tag>
  return <Tag>{status}</Tag>
}

function buildRequest(
  values: AssortmentForm,
  controls: {
    waveWeights: AssortmentWaveWeight[]
    storeModelOverrides: AssortmentStoreModelOverride[]
    colorOverrides: AssortmentColorOverride[]
    skuWaveOverrides: AssortmentSkuWaveOverride[]
  },
) {
  return {
    label: values.label?.trim() || undefined,
    categoryNumber: values.scopeType === 'CATEGORY' ? values.scopeNumber : undefined,
    planningScope: { type: values.scopeType, number: values.scopeNumber },
    warehouseStoreId: values.warehouseStoreId,
    targetStoreIds: values.targetStoreIds?.length ? values.targetStoreIds : undefined,
    startDate: values.startDate.format('YYYY-MM-DD'),
    horizonMonths: values.horizonMonths,
    highSeasonMonths: values.highSeasonMonths,
    planningFactors: {
      historyMonths: values.historyMonths,
      modelCoverWeeks: values.modelCoverWeeks,
      modelDisplayFloor: values.modelDisplayFloor,
      maxModelQuantity: values.maxModelQuantity,
      stockOnlyStoreWeightPct: values.stockOnlyStoreWeightPct,
      unseenColorFallbackPct: values.unseenColorFallbackPct,
      waveWeights: controls.waveWeights.filter((wave) => wave.releaseDate && wave.weight > 0),
      storeModelOverrides: controls.storeModelOverrides,
      colorOverrides: controls.colorOverrides,
      skuWaveOverrides: controls.skuWaveOverrides,
    },
    createdBy: 'buyer',
  }
}

function allocationSummary(allocations: AssortmentStoreAllocation[]): string {
  return allocations
    .slice(0, 5)
    .map((allocation) => `${allocation.storeId}: ${formatInt(allocation.quantity)}`)
    .join(', ')
}

export default function AssortmentPlanningPage() {
  const [form] = Form.useForm<AssortmentForm>()
  const [messageApi, contextHolder] = message.useMessage()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('plan')
  const [report, setReport] = useState<AssortmentPlanReport | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [waveWeights, setWaveWeights] = useState<AssortmentWaveWeight[]>([])
  const [storeModelOverrides, setStoreModelOverrides] = useState<AssortmentStoreModelOverride[]>([])
  const [colorOverrides, setColorOverrides] = useState<AssortmentColorOverride[]>([])
  const [skuWaveOverrides, setSkuWaveOverrides] = useState<AssortmentSkuWaveOverride[]>([])

  const { data: stores = [], isLoading: storesLoading } = useStores()
  const { data: categories = [], isLoading: categoriesLoading } = useCategories()
  const { data: departments = [], isLoading: departmentsLoading } = useDepartments()
  const plans = useQuery({
    queryKey: ['assortment-planning', 'plans'],
    queryFn: () => fetchAssortmentPlans({ status: 'all' }),
    staleTime: 60_000,
  })
  const selectedPlan = useQuery({
    queryKey: ['assortment-planning', 'plan', selectedPlanId],
    queryFn: () => fetchAssortmentPlan(selectedPlanId!),
    enabled: !!selectedPlanId,
  })

  function syncControlsFromReport(next: AssortmentPlanReport) {
    setWaveWeights(next.planningFactors.waveWeights)
    setStoreModelOverrides(next.planningFactors.storeModelOverrides)
    setColorOverrides(next.planningFactors.colorOverrides)
    setSkuWaveOverrides(next.planningFactors.skuWaveOverrides)
  }

  useEffect(() => {
    const loaded = selectedPlan.data
    if (!loaded) return
    form.setFieldsValue({
      label: loaded.plan?.label,
      scopeType: loaded.planningScope.type,
      scopeNumber: loaded.planningScope.number,
      warehouseStoreId: loaded.warehouseStoreId,
      targetStoreIds: loaded.targetStores.map((store) => store.storeId),
      startDate: dayjs(loaded.startDate),
      horizonMonths: loaded.horizonMonths,
      highSeasonMonths: loaded.highSeasonMonths,
      historyMonths: loaded.planningFactors.historyMonths,
      modelCoverWeeks: loaded.planningFactors.modelCoverWeeks,
      modelDisplayFloor: loaded.planningFactors.modelDisplayFloor,
      maxModelQuantity: loaded.planningFactors.maxModelQuantity,
      stockOnlyStoreWeightPct: loaded.planningFactors.stockOnlyStoreWeightPct,
      unseenColorFallbackPct: loaded.planningFactors.unseenColorFallbackPct,
    })
    syncControlsFromReport(loaded)
  }, [form, selectedPlan.data])

  const storeOptions = useMemo(
    () => stores
      .filter((store) => store.active)
      .map((store) => ({
        value: store.id,
        label: `${store.id} - ${store.name}`,
      })),
    [stores],
  )
  const categoryOptions = useMemo(
    () => categories.map((category) => ({
      value: category.number,
      label: `${category.number} - ${category.description}`,
    })),
    [categories],
  )
  const departmentOptions = useMemo(
    () => departments.map((department) => ({
      value: department.number,
      label: `${department.number} - ${department.description}`,
    })),
    [departments],
  )

  const previewMutation = useMutation({
    mutationFn: (values: AssortmentForm) => previewAssortmentPlan(buildRequest(values, {
      waveWeights,
      storeModelOverrides,
      colorOverrides,
      skuWaveOverrides,
    })),
    onSuccess: (next, values) => {
      setReport(next)
      setSelectedPlanId(null)
      syncControlsFromReport(next)
      if (!values.targetStoreIds?.length) {
        form.setFieldsValue({ targetStoreIds: next.targetStores.map((store) => store.storeId) })
      }
      messageApi.success('Preview generated')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not generate preview'),
  })

  const saveMutation = useMutation({
    mutationFn: (values: AssortmentForm) => createAssortmentPlan(buildRequest(values, {
      waveWeights,
      storeModelOverrides,
      colorOverrides,
      skuWaveOverrides,
    })),
    onSuccess: async (next) => {
      setReport(next)
      setSelectedPlanId(next.plan?.id ?? null)
      syncControlsFromReport(next)
      await qc.invalidateQueries({ queryKey: ['assortment-planning'] })
      messageApi.success('Assortment plan saved')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not save plan'),
  })

  const draftMutation = useMutation({
    mutationFn: ({ planId, waveId }: { planId: string; waveId: string }) =>
      createAssortmentTransferDrafts(planId, waveId),
    onSuccess: async (next) => {
      setReport(next)
      setSelectedPlanId(next.plan?.id ?? null)
      await qc.invalidateQueries({ queryKey: ['assortment-planning'] })
      messageApi.success('Transfer drafts created')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not create transfer drafts'),
  })

  const commitMutation = useMutation({
    mutationFn: ({ planId, waveId }: { planId: string; waveId: string }) => commitAssortmentWave(planId, waveId),
    onSuccess: async (next) => {
      setReport(next)
      setSelectedPlanId(next.plan?.id ?? null)
      await qc.invalidateQueries({ queryKey: ['assortment-planning'] })
      messageApi.success('Wave committed')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not commit wave'),
  })

  const visibleReport = selectedPlan.data ?? report
  const planId = visibleReport?.plan?.id
  const targetStoreById = useMemo(
    () => new Map((visibleReport?.targetStores ?? []).map((store) => [store.storeId, store])),
    [visibleReport],
  )
  const waveSchedule = visibleReport?.planningFactors.waveWeights ?? []
  const waveOptionRows = useMemo(
    () => waveSchedule.map((wave, index) => ({
      sequence: index + 1,
      releaseDate: wave.releaseDate,
      label: `#${index + 1} - ${wave.releaseDate}`,
    })),
    [waveSchedule],
  )
  const waveDateBySequence = useMemo(
    () => new Map(waveOptionRows.map((wave) => [wave.sequence, wave.releaseDate])),
    [waveOptionRows],
  )
  const waveSequenceByDate = useMemo(
    () => new Map(waveOptionRows.map((wave) => [wave.releaseDate, wave.sequence])),
    [waveOptionRows],
  )
  const skuWaveOverrideBySkuId = useMemo(
    () => new Map(skuWaveOverrides.map((override) => [override.skuId, override.releaseDate])),
    [skuWaveOverrides],
  )

  function effectiveWaveDate(row: AssortmentPoolItem): string | null {
    if (skuWaveOverrideBySkuId.has(row.skuId)) return skuWaveOverrideBySkuId.get(row.skuId) ?? null
    return row.assignedWaveSequence ? waveDateBySequence.get(row.assignedWaveSequence) ?? null : null
  }

  function effectiveWaveSequence(row: AssortmentPoolItem): number | null {
    const releaseDate = effectiveWaveDate(row)
    if (!releaseDate) return null
    return waveSequenceByDate.get(releaseDate) ?? row.assignedWaveSequence ?? null
  }

  function setStoreModelOverride(storeId: number, modelQuantity: number | null) {
    setStoreModelOverrides((current) => {
      const next = new Map(current.map((row) => [row.storeId, row.modelQuantity]))
      next.set(storeId, Math.max(0, Math.round(modelQuantity ?? 0)))
      return [...next.entries()].map(([id, quantity]) => ({ storeId: id, modelQuantity: quantity }))
    })
  }

  function setColorOverride(color: string, patch: Partial<Omit<AssortmentColorOverride, 'canonicalColor'>>) {
    setColorOverrides((current) => {
      const next = new Map(current.map((row) => [row.canonicalColor, row]))
      const existing = next.get(color) ?? { canonicalColor: color }
      next.set(color, {
        ...existing,
        ...patch,
      })
      return [...next.values()]
    })
  }

  function setWaveWeight(releaseDate: string, weight: number | null) {
    setWaveWeights((current) => current.map((wave) => (
      wave.releaseDate === releaseDate ? { ...wave, weight: Math.max(0, Number(weight ?? 0)) } : wave
    )))
  }

  function setSkuWaveOverride(skuId: string, releaseDate: string | null) {
    setSkuWaveOverrides((current) => {
      const next = new Map(current.map((row) => [row.skuId, row.releaseDate]))
      next.set(skuId, releaseDate)
      return [...next.entries()]
        .map(([id, date]) => ({ skuId: id, releaseDate: date }))
        .sort((left, right) => left.skuId.localeCompare(right.skuId))
    })
  }

  function setWaveDate(oldDate: string, nextDate: Dayjs | null) {
    if (!nextDate) return
    const releaseDate = nextDate.format('YYYY-MM-DD')
    setWaveWeights((current) => current
      .map((wave) => (wave.releaseDate === oldDate ? { ...wave, releaseDate } : wave))
      .sort((left, right) => left.releaseDate.localeCompare(right.releaseDate)))
    setSkuWaveOverrides((current) => current.map((override) => (
      override.releaseDate === oldDate ? { ...override, releaseDate } : override
    )))
  }

  function addWaveWeight() {
    const startDate = form.getFieldValue('startDate') as Dayjs | undefined
    const releaseDate = (startDate ?? dayjs()).format('YYYY-MM-DD')
    setWaveWeights((current) => [...current, { releaseDate, weight: 1 }]
      .sort((left, right) => left.releaseDate.localeCompare(right.releaseDate)))
  }

  function removeWaveWeight(releaseDate: string) {
    setWaveWeights((current) => current.filter((wave) => wave.releaseDate !== releaseDate))
    setSkuWaveOverrides((current) => current.map((override) => (
      override.releaseDate === releaseDate ? { ...override, releaseDate: null } : override
    )))
  }

  const targetColumns = useMemo<ColumnsType<AssortmentTargetStore>>(() => [
    { title: 'Store', dataIndex: 'storeLabel', width: 180 },
    { title: 'SKU budget', dataIndex: 'suggestedSkuBudget', align: 'right', width: 110, render: formatInt },
    {
      title: 'Model/style',
      dataIndex: 'suggestedModelQuantity',
      align: 'right',
      width: 130,
      render: (value: number, row) => (
        <InputNumber
          aria-label={`${row.storeLabel} model quantity`}
          min={0}
          max={500}
          size="small"
          value={storeModelOverrides.find((override) => override.storeId === row.storeId)?.modelQuantity ?? value}
          onChange={(next) => setStoreModelOverride(row.storeId, next)}
        />
      ),
    },
    { title: 'Sales units', dataIndex: 'salesUnits', align: 'right', width: 110, render: formatInt },
    { title: 'Monthly sales', dataIndex: 'averageMonthlySales', align: 'right', width: 120, render: formatInt },
    { title: 'Sales/SKU/mo', dataIndex: 'salesPerSkuMonth', align: 'right', width: 120 },
    { title: 'Current SKUs', dataIndex: 'currentSkuCount', align: 'right', width: 110, render: formatInt },
    { title: 'Current units', dataIndex: 'currentUnits', align: 'right', width: 110, render: formatInt },
    { title: 'Weight', dataIndex: 'weight', align: 'right', width: 90, render: formatInt },
  ], [storeModelOverrides])

  const poolColumns = useMemo<ColumnsType<AssortmentPoolItem>>(() => [
    { title: 'SKU', dataIndex: 'skuCode', fixed: 'left', width: 130 },
    { title: 'Description', dataIndex: 'skuDescription', ellipsis: true },
    { title: 'Category', dataIndex: 'categoryLabel', width: 180, ellipsis: true },
    { title: 'Reason', dataIndex: 'inclusionReason', width: 150, render: reasonTag },
    { title: 'Color', dataIndex: 'canonicalColor', width: 130, render: (value: string, row) => <Space size={4}><Text>{value}</Text><Tag>{row.rawColorKey}</Tag></Space> },
    { title: 'WH units', dataIndex: 'warehouseUnits', align: 'right', width: 100, render: formatInt },
    { title: 'Store units', dataIndex: 'storeUnits', align: 'right', width: 100, render: formatInt },
    {
      title: 'Wave',
      dataIndex: 'assignedWaveSequence',
      width: 165,
      sorter: (left, right) =>
        (effectiveWaveSequence(left) ?? 9999) - (effectiveWaveSequence(right) ?? 9999)
        || left.skuCode.localeCompare(right.skuCode),
      render: (_: number | undefined, row) => (
        <Select
          aria-label={`${row.skuCode} wave assignment`}
          size="small"
          style={{ width: 145 }}
          value={effectiveWaveDate(row) ?? '__unassigned__'}
          options={[
            { value: '__unassigned__', label: 'No wave' },
            ...waveOptionRows.map((wave) => ({ value: wave.releaseDate, label: wave.label })),
          ]}
          onChange={(value) => setSkuWaveOverride(row.skuId, value === '__unassigned__' ? null : value)}
        />
      ),
    },
    {
      title: 'Wave Date',
      width: 120,
      sorter: (left, right) =>
        (effectiveWaveDate(left) ?? '9999-99-99').localeCompare(effectiveWaveDate(right) ?? '9999-99-99')
        || left.skuCode.localeCompare(right.skuCode),
      render: (_: unknown, row) => effectiveWaveDate(row) ?? '-',
    },
    { title: 'Keywords', dataIndex: 'keywords', ellipsis: true, width: 180, render: (value: string | null) => value || '-' },
  ], [skuWaveOverrideBySkuId, waveDateBySequence, waveOptionRows, waveSequenceByDate])

  const colorColumns = useMemo<ColumnsType<AssortmentColorMix>>(() => [
    { title: 'Color', dataIndex: 'canonicalColor', width: 160 },
    { title: 'Family', dataIndex: 'colorFamily', width: 120 },
    { title: 'Sales units', dataIndex: 'salesUnits', align: 'right', width: 110, render: formatInt },
    { title: 'Sales mix', dataIndex: 'salesPct', align: 'right', width: 100, render: formatPct },
    { title: 'Planned styles', dataIndex: 'plannedStyleCount', align: 'right', width: 120, render: formatInt },
    {
      title: 'Target styles',
      width: 120,
      align: 'right',
      render: (_: unknown, row) => (
        <InputNumber
          aria-label={`${row.canonicalColor} target styles`}
          min={0}
          max={10000}
          size="small"
          value={colorOverrides.find((override) => override.canonicalColor === row.canonicalColor)?.targetStyleCount ?? row.plannedStyleCount}
          onChange={(value) => setColorOverride(row.canonicalColor, { targetStyleCount: value == null ? undefined : Math.round(value) })}
        />
      ),
    },
    {
      title: 'Color weight',
      width: 120,
      align: 'right',
      render: (_: unknown, row) => (
        <InputNumber
          aria-label={`${row.canonicalColor} color weight`}
          min={0}
          max={1000000}
          size="small"
          value={colorOverrides.find((override) => override.canonicalColor === row.canonicalColor)?.weight ?? row.salesUnits}
          onChange={(value) => setColorOverride(row.canonicalColor, { weight: value == null ? undefined : value })}
        />
      ),
    },
    { title: 'Planned mix', dataIndex: 'plannedStylePct', align: 'right', width: 110, render: formatPct },
  ], [colorOverrides])

  const lineColumns = useMemo<ColumnsType<AssortmentWaveLine>>(() => [
    { title: 'SKU', dataIndex: 'skuCode', width: 130 },
    { title: 'Description', dataIndex: 'skuDescription', ellipsis: true },
    { title: 'Color', dataIndex: 'canonicalColor', width: 130 },
    { title: 'WH on hand', dataIndex: 'warehouseUnits', align: 'right', width: 110, render: formatInt },
    { title: 'Release', dataIndex: 'releaseUnits', align: 'right', width: 90, render: formatInt },
    { title: 'Reserve', dataIndex: 'reserveUnits', align: 'right', width: 90, render: formatInt },
    {
      title: 'Stores',
      dataIndex: 'allocations',
      width: 180,
      render: (allocations: AssortmentStoreAllocation[]) => (
        <Text type="secondary">{allocations.length} stores{allocations.length ? ` (${allocationSummary(allocations)})` : ''}</Text>
      ),
    },
  ], [])

  const allocationColumns = useMemo<ColumnsType<AssortmentStoreAllocation>>(() => [
    { title: 'Store', dataIndex: 'storeLabel', width: 220 },
    {
      title: 'Model/style',
      align: 'right',
      width: 110,
      render: (_: unknown, allocation) => formatInt(allocation.modelQuantity ?? targetStoreById.get(allocation.storeId)?.suggestedModelQuantity ?? 0),
    },
    { title: 'Transfer', dataIndex: 'quantity', align: 'right', width: 100, render: (value: number) => <Text strong>{formatInt(value)}</Text> },
    {
      title: 'Sales 12m',
      align: 'right',
      width: 100,
      render: (_: unknown, allocation) => formatInt(targetStoreById.get(allocation.storeId)?.salesUnits ?? 0),
    },
    {
      title: 'Current units',
      align: 'right',
      width: 115,
      render: (_: unknown, allocation) => formatInt(targetStoreById.get(allocation.storeId)?.currentUnits ?? 0),
    },
  ], [targetStoreById])

  const waveColumns = useMemo<ColumnsType<AssortmentWave>>(() => [
    { title: 'Wave', dataIndex: 'sequence', width: 80, render: (value: number) => `#${value}` },
    { title: 'Release date', dataIndex: 'releaseDate', width: 125 },
    {
      title: 'Weight',
      width: 110,
      align: 'right',
      render: (_: unknown, wave) => (
        <InputNumber
          aria-label={`Wave ${wave.sequence} weight`}
          min={0}
          max={1000}
          size="small"
          value={waveWeights.find((item) => item.releaseDate === wave.releaseDate)?.weight ?? 1}
          disabled={wave.status === 'COMMITTED'}
          onChange={(value) => setWaveWeight(wave.releaseDate, value)}
        />
      ),
    },
    { title: 'Status', dataIndex: 'status', width: 150, render: statusTag },
    { title: 'Styles', dataIndex: 'styleCount', align: 'right', width: 90, render: formatInt },
    { title: 'Release units', dataIndex: 'totalUnits', align: 'right', width: 115, render: formatInt },
    { title: 'Draft transfers', dataIndex: 'generatedTransferIds', align: 'right', width: 120, render: (ids: string[]) => formatInt(ids.length) },
    {
      title: 'Actions',
      fixed: 'right',
      width: 240,
      render: (_: unknown, wave) => {
        const saved = !!planId && !!wave.id
        const committed = wave.status === 'COMMITTED'
        const hasDrafts = wave.generatedTransferIds.length > 0
        return (
          <Space>
            <Button
              size="small"
              icon={<SwapOutlined />}
              disabled={!saved || committed || hasDrafts}
              loading={draftMutation.isPending}
              onClick={() => {
                if (!planId || !wave.id) return
                draftMutation.mutate({ planId, waveId: wave.id })
              }}
            >
              Drafts
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<CheckOutlined />}
              disabled={!saved || committed || !hasDrafts}
              loading={commitMutation.isPending}
              onClick={() => {
                if (!planId || !wave.id) return
                Modal.confirm({
                  title: `Commit wave #${wave.sequence}`,
                  content: 'This will move warehouse stock into the destination stores for the draft transfers in this wave.',
                  okText: 'Commit',
                  onOk: () => commitMutation.mutateAsync({ planId, waveId: wave.id! }),
                })
              }}
            >
              Commit
            </Button>
          </Space>
        )
      },
    },
  ], [commitMutation, draftMutation, planId, waveWeights])

  const planColumns = useMemo<ColumnsType<AssortmentPlanListItem>>(() => [
    {
      title: 'Plan',
      dataIndex: 'label',
      render: (value: string, plan) => (
        <Button
          type="link"
          style={{ padding: 0 }}
          onClick={() => {
            setSelectedPlanId(plan.id)
            setActiveTab('plan')
          }}
        >
          {value}
        </Button>
      ),
    },
    { title: 'Status', dataIndex: 'status', width: 140, render: statusTag },
    { title: 'Scope', dataIndex: 'scopeLabel', width: 240 },
    { title: 'Start', dataIndex: 'startDate', width: 110 },
    { title: 'SKUs', dataIndex: 'poolSkuCount', align: 'right', width: 90, render: formatInt },
    { title: 'Units', dataIndex: 'poolUnits', align: 'right', width: 90, render: formatInt },
    { title: 'Waves', dataIndex: 'waveCount', align: 'right', width: 90, render: formatInt },
    { title: 'Drafts', dataIndex: 'transferDraftCount', align: 'right', width: 90, render: formatInt },
  ], [])

  return (
    <div>
      {contextHolder}
      <Title level={2} style={{ marginTop: 0, marginBottom: 12 }}>Assortment Releases</Title>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'plan',
            label: 'Plan',
            children: (
              <>
                <Card size="small" style={{ marginBottom: 12 }}>
                  <Form<AssortmentForm>
                    form={form}
                    layout="vertical"
                    initialValues={{
                      scopeType: 'CATEGORY',
                      scopeNumber: 71,
                      warehouseStoreId: 99,
                      startDate: dayjs(),
                      horizonMonths: 12,
                      highSeasonMonths: [6, 11, 12],
                      historyMonths: 12,
                      modelCoverWeeks: 4,
                      modelDisplayFloor: 1,
                      maxModelQuantity: 6,
                      stockOnlyStoreWeightPct: 5,
                      unseenColorFallbackPct: 2,
                    }}
                    onFinish={(values) => previewMutation.mutate(values)}
                  >
                    <Row gutter={12}>
                      <Col xs={24} md={6} lg={4}>
                        <Form.Item name="scopeType" label="Scope" rules={[{ required: true }]}>
                          <Select
                            options={[
                              { value: 'CATEGORY', label: 'Category' },
                              { value: 'DEPARTMENT', label: 'Department' },
                            ]}
                            onChange={() => form.setFieldValue('scopeNumber', undefined)}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={10} lg={8}>
                        <Form.Item
                          noStyle
                          shouldUpdate={(prev, next) => prev.scopeType !== next.scopeType}
                        >
                          {({ getFieldValue }) => {
                            const scopeType = getFieldValue('scopeType') as AssortmentPlanningScopeType
                            return (
                              <Form.Item name="scopeNumber" label={scopeType === 'DEPARTMENT' ? 'Department' : 'Category'} rules={[{ required: true }]}>
                                <Select
                                  loading={scopeType === 'DEPARTMENT' ? departmentsLoading : categoriesLoading}
                                  options={scopeType === 'DEPARTMENT' ? departmentOptions : categoryOptions}
                                  showSearch
                                  optionFilterProp="label"
                                />
                              </Form.Item>
                            )
                          }}
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8} lg={4}>
                        <Form.Item name="warehouseStoreId" label="Warehouse" rules={[{ required: true }]}>
                          <Select loading={storesLoading} options={storeOptions} showSearch optionFilterProp="label" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6} lg={4}>
                        <Form.Item name="startDate" label="Start date" rules={[{ required: true }]}>
                          <DatePicker style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6} lg={4}>
                        <Form.Item name="horizonMonths" label="Months" rules={[{ required: true }]}>
                          <InputNumber min={1} max={24} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12} lg={6}>
                        <Form.Item name="highSeasonMonths" label="High season">
                          <Select mode="multiple" options={HIGH_SEASON_MONTH_OPTIONS} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12} lg={6}>
                        <Form.Item name="label" label="Plan label">
                          <Input placeholder="Optional" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} lg={18}>
                        <Form.Item name="targetStoreIds" label="Target stores">
                          <Select
                            mode="multiple"
                            allowClear
                            loading={storesLoading}
                            options={storeOptions.filter((option) => option.value !== form.getFieldValue('warehouseStoreId'))}
                            showSearch
                            optionFilterProp="label"
                            maxTagCount="responsive"
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={6} lg={3}>
                        <Form.Item name="historyMonths" label="History months">
                          <InputNumber min={1} max={60} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={6} lg={3}>
                        <Form.Item name="modelCoverWeeks" label="Cover weeks">
                          <InputNumber min={0} max={52} step={0.5} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={6} lg={3}>
                        <Form.Item name="modelDisplayFloor" label="Display floor">
                          <InputNumber min={0} max={50} step={0.5} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={6} lg={3}>
                        <Form.Item name="maxModelQuantity" label="Max model">
                          <InputNumber min={1} max={500} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={6} lg={3}>
                        <Form.Item name="stockOnlyStoreWeightPct" label="Stock-only %">
                          <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={6} lg={3}>
                        <Form.Item name="unseenColorFallbackPct" label="New color %">
                          <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24}>
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                            <Text strong>Wave dates</Text>
                            <Button size="small" icon={<PlusOutlined />} onClick={addWaveWeight}>Add wave</Button>
                          </Space>
                          {waveWeights.length ? (
                            <Space wrap>
                              {waveWeights.map((wave) => (
                                <Space key={wave.releaseDate} size={6}>
                                  <DatePicker
                                    aria-label={`${wave.releaseDate} release date`}
                                    value={dayjs(wave.releaseDate)}
                                    onChange={(value) => setWaveDate(wave.releaseDate, value)}
                                  />
                                  <InputNumber
                                    aria-label={`${wave.releaseDate} wave weight`}
                                    min={0}
                                    max={1000}
                                    value={wave.weight}
                                    onChange={(value) => setWaveWeight(wave.releaseDate, value)}
                                  />
                                  <Button
                                    aria-label={`${wave.releaseDate} remove wave`}
                                    size="small"
                                    icon={<DeleteOutlined />}
                                    onClick={() => removeWaveWeight(wave.releaseDate)}
                                  />
                                </Space>
                              ))}
                            </Space>
                          ) : (
                            <Text type="secondary">Auto schedule</Text>
                          )}
                        </Space>
                      </Col>
                    </Row>
                    <Space>
                      <Button htmlType="submit" type="primary" icon={<ReloadOutlined />} loading={previewMutation.isPending}>
                        Preview
                      </Button>
                      <Button
                        icon={<SaveOutlined />}
                        loading={saveMutation.isPending}
                        onClick={async () => saveMutation.mutate(await form.validateFields())}
                      >
                        Save Plan
                      </Button>
                    </Space>
                  </Form>
                </Card>

                {visibleReport?.warnings.length ? (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message={visibleReport.warnings.join(' ')}
                  />
                ) : null}

                {visibleReport ? (
                  <>
                    <Row gutter={12} style={{ marginBottom: 12 }}>
                      <Col xs={12} md={6}>
                        <Card size="small"><Statistic title="Pool SKUs" value={visibleReport.totals.poolSkuCount} /></Card>
                      </Col>
                      <Col xs={12} md={6}>
                        <Card size="small"><Statistic title="Warehouse units" value={visibleReport.totals.poolUnits} /></Card>
                      </Col>
                      <Col xs={12} md={6}>
                        <Card size="small"><Statistic title="Release units" value={visibleReport.totals.plannedReleaseUnits} /></Card>
                      </Col>
                      <Col xs={12} md={6}>
                        <Card size="small"><Statistic title="Warehouse reserve" value={visibleReport.totals.reserveUnits} /></Card>
                      </Col>
                    </Row>

                    <Tabs
                      items={[
                        {
                          key: 'waves',
                          label: 'Waves',
                          children: (
                            <Table<AssortmentWave>
                              size="small"
                              rowKey={(wave) => wave.id ?? `preview-${wave.sequence}`}
                              columns={waveColumns}
                              dataSource={visibleReport.waves}
                              pagination={false}
                              scroll={{ x: 900 }}
                              expandable={{
                                expandedRowRender: (wave) => (
                                  <Table<AssortmentWaveLine>
                                    size="small"
                                    rowKey={(line) => line.id ?? `${wave.sequence}-${line.skuCode}`}
                                    columns={lineColumns}
                                    dataSource={wave.lines}
                                    pagination={false}
                                    expandable={{
                                      expandedRowRender: (line) => (
                                        <Table<AssortmentStoreAllocation>
                                          size="small"
                                          rowKey={(allocation) => `${line.skuId}-${allocation.storeId}`}
                                          columns={allocationColumns}
                                          dataSource={[...line.allocations].sort((left, right) => right.quantity - left.quantity)}
                                          pagination={false}
                                        />
                                      ),
                                      rowExpandable: (line) => line.allocations.length > 0,
                                    }}
                                  />
                                ),
                              }}
                            />
                          ),
                        },
                        {
                          key: 'pool',
                          label: 'Pool Review',
                          children: (
                            <Table<AssortmentPoolItem>
                              size="small"
                              rowKey="skuId"
                              columns={poolColumns}
                              dataSource={visibleReport.pool}
                              pagination={{ pageSize: 50, showSizeChanger: true }}
                              scroll={{ x: 1300 }}
                            />
                          ),
                        },
                        {
                          key: 'colors',
                          label: 'Color Mix',
                          children: (
                            <Table<AssortmentColorMix>
                              size="small"
                              rowKey="canonicalColor"
                              columns={colorColumns}
                              dataSource={visibleReport.colorMix}
                              pagination={false}
                            />
                          ),
                        },
                        {
                          key: 'stores',
                          label: 'Stores',
                          children: (
                            <Table<AssortmentTargetStore>
                              size="small"
                              rowKey="storeId"
                              columns={targetColumns}
                              dataSource={visibleReport.targetStores}
                              pagination={false}
                            />
                          ),
                        },
                      ]}
                    />
                  </>
                ) : (
                  <Card size="small">
                    <Text type="secondary">No assortment plan loaded.</Text>
                  </Card>
                )}
              </>
            ),
          },
          {
            key: 'saved',
            label: 'Saved Plans',
            children: (
              <Table<AssortmentPlanListItem>
                size="small"
                rowKey="id"
                loading={plans.isLoading || selectedPlan.isFetching}
                columns={planColumns}
                dataSource={plans.data ?? []}
                pagination={{ pageSize: 25, showSizeChanger: true }}
                scroll={{ x: 1000 }}
              />
            ),
          },
        ]}
      />
    </div>
  )
}
