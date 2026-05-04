import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Segmented,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalculatorOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useDepartments } from '../../hooks/useProductsTaxonomy'
import {
  addSavedPurchasePlanAdjustment,
  archiveSavedPurchasePlan,
  fetchSavedPurchasePlan,
  fetchSavedPurchasePlans,
  generateSeasonalPurchaseReport,
  recalculateSavedPurchasePlan,
  updateSavedPurchasePlanRows,
  type PurchasePlanAdjustmentKind,
  type PurchasePlanEohMethod,
  type PurchasePlanForecastMethod,
  type SavedPurchasePlanAdjustmentRequest,
  type SavedPurchasePlanDepartment,
  type SavedPurchasePlanListItem,
  type SavedPurchasePlanRowsUpdateRequest,
  type SavedPurchasePlanRow,
  type SeasonalPurchaseReportResponse,
  type SeasonalPurchaseReportSeason,
  type SeasonalPurchaseReportValue,
} from '../../services/purchasePlanningApi'

const { Title, Text } = Typography

const integerFmt = new Intl.NumberFormat('en-US')
const moneyFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const pctFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

const FORECAST_OPTIONS: Array<{ value: PurchasePlanForecastMethod; label: string }> = [
  { value: 'holtWinters', label: 'Holt-Winters' },
  { value: 'sameMonthLastYear', label: 'Same month last year' },
  { value: 'trailingAverage', label: 'Trailing average' },
  { value: 'yoyGrowth', label: 'YoY growth %' },
  { value: 'blendedMultiYear', label: 'Blended multi-year' },
]

const EOH_OPTIONS: Array<{ value: PurchasePlanEohMethod; label: string }> = [
  { value: 'forward', label: 'Forward cover' },
  { value: 'seasonal', label: 'Seasonal multiplier' },
]

interface AdjustmentForm {
  kind: PurchasePlanAdjustmentKind
  value: number
  reason: string
}

interface SeasonalReportForm {
  departmentNumber: number
  forecastMethod: PurchasePlanForecastMethod
  eohMethod: PurchasePlanEohMethod
  coverMonths: number
  discountNormalization: boolean
}

interface TargetPolicyDraft {
  targetSkuCount: number
  useStoreOverride: boolean
  storeOverride: number
  staleMonths: number
}

interface TargetPolicyRow extends TargetPolicyDraft {
  key: string
  label: string
  months: string[]
  derivedStoreCount: number
  carryingStoreCount: number
  assortmentFloorUnits: number
  demandCoverUnits: number
  eohTargetBasisUnits: number
  staleUnits: number
  excludedFromBohUnits: number
}

interface SeasonalReportRow {
  key: keyof Pick<
    SeasonalPurchaseReportSeason,
    'projectedBoh' | 'projectedSales' | 'baselineBuy' | 'draftPos' | 'confirmedPos' | 'openToBuy'
  >
  label: string
}

type WorksheetColumnMode = 'months' | 'seasons'

type WorksheetMetricKey =
  | 'currentBoh'
  | 'currentProjSales'
  | 'currentEohTarget'
  | 'baselineBuy'
  | 'currentBuy'
  | 'currentEohActual'
  | 'stockPosition'
  | 'normalizationFactor'

type EditableWorksheetMetricKey = 'currentProjSales' | 'currentEohTarget' | 'currentBuy'

interface WorksheetMetric {
  key: WorksheetMetricKey
  label: string
  aggregate: 'sum' | 'first' | 'last' | 'average'
  editableKey?: EditableWorksheetMetricKey
  inputLabel?: string
  format: 'integer' | 'percent'
}

interface WorksheetPeriod {
  key: string
  label: string
  months: string[]
  mode: WorksheetColumnMode
}

interface WorksheetPivotRow {
  key: string
  departmentKey: string
  departmentLabel: string
  metric: WorksheetMetric
}

const REPORT_ROWS: SeasonalReportRow[] = [
  { key: 'projectedBoh', label: 'Projected BOH' },
  { key: 'projectedSales', label: 'Projected Sales' },
  { key: 'baselineBuy', label: 'Planned Buy' },
  { key: 'draftPos', label: 'Draft POs' },
  { key: 'confirmedPos', label: 'Confirmed POs' },
  { key: 'openToBuy', label: 'Open To Buy' },
]

const WORKSHEET_METRICS: WorksheetMetric[] = [
  { key: 'currentBoh', label: 'Projected BOH', aggregate: 'first', format: 'integer' },
  { key: 'currentProjSales', label: 'Projected sales', aggregate: 'sum', editableKey: 'currentProjSales', inputLabel: 'projected sales', format: 'integer' },
  { key: 'currentEohTarget', label: 'EOH target', aggregate: 'last', editableKey: 'currentEohTarget', inputLabel: 'EOH target', format: 'integer' },
  { key: 'baselineBuy', label: 'Baseline buy', aggregate: 'sum', format: 'integer' },
  { key: 'currentBuy', label: 'Current buy', aggregate: 'sum', editableKey: 'currentBuy', inputLabel: 'current buy', format: 'integer' },
  { key: 'currentEohActual', label: 'Projected EOH', aggregate: 'last', format: 'integer' },
  { key: 'stockPosition', label: 'Stock position', aggregate: 'last', format: 'integer' },
  { key: 'normalizationFactor', label: 'Norm', aggregate: 'average', format: 'percent' },
]

const DEFAULT_POLICY_MONTHS = [
  '2026-05', '2026-06', '2026-07',
  '2026-08', '2026-09', '2026-10',
  '2026-11', '2026-12', '2027-01',
  '2027-02', '2027-03', '2027-04',
  '2027-05', '2027-06', '2027-07',
]

const DEFAULT_POLICY_TARGET_SKUS = [180, 160, 140, 150, 190]
const DEFAULT_POLICY_STORE_COUNTS = [28, 27, 26, 28, 28]
const DEFAULT_POLICY_DEMAND_COVER = [210, 150, 150, 150, 150]

function formatMonth(yearMonth: string): string {
  return dayjs(`${yearMonth}-01`).format('MMM YYYY')
}

function formatInt(value: number): string {
  return integerFmt.format(Math.round(value ?? 0))
}

function formatHnl(value: number): string {
  return `HNL ${moneyFmt.format(Math.round(value ?? 0))}`
}

function formUnit(value: number | null | undefined): number {
  return Math.max(0, Math.round(Number(value ?? 0)))
}

function seasonForYearMonth(yearMonth: string): { key: string; label: string } {
  const [rawYear, rawMonth] = yearMonth.split('-')
  const year = Number(rawYear)
  const month = Number(rawMonth)
  if (month >= 2 && month <= 4) return { key: `spring-${year}`, label: `Spring ${year}` }
  if (month >= 5 && month <= 7) return { key: `summer-${year}`, label: `Summer ${year}` }
  if (month >= 8 && month <= 10) return { key: `fall-${year}`, label: `Fall ${year}` }
  if (month >= 11 && month <= 12) return { key: `winter-${year}`, label: `Winter ${year}` }
  return { key: `winter-${year - 1}`, label: `Winter ${year - 1}` }
}

function buildWorksheetPeriods(months: string[], mode: WorksheetColumnMode): WorksheetPeriod[] {
  const sortedMonths = [...new Set(months)].sort()
  if (mode === 'months') {
    return sortedMonths.map((month) => ({
      key: month,
      label: formatMonth(month),
      months: [month],
      mode,
    }))
  }

  const periods: WorksheetPeriod[] = []
  for (const month of sortedMonths) {
    const season = seasonForYearMonth(month)
    const current = periods[periods.length - 1]
    if (current?.key === season.key) {
      current.months.push(month)
    } else {
      periods.push({ key: season.key, label: season.label, months: [month], mode })
    }
  }
  return periods
}

function worksheetMetricValue(row: SavedPurchasePlanRow, metric: WorksheetMetric): number | null {
  const value = row[metric.key]
  return typeof value === 'number' ? value : null
}

function aggregateWorksheetMetric(rows: SavedPurchasePlanRow[], metric: WorksheetMetric): number | null {
  const sortedRows = [...rows].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
  const values = sortedRows
    .map((row) => worksheetMetricValue(row, metric))
    .filter((value): value is number => value != null)
  if (values.length === 0) return null
  if (metric.aggregate === 'first') return values[0] ?? null
  if (metric.aggregate === 'last') return values[values.length - 1] ?? null
  if (metric.aggregate === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length
  return values.reduce((sum, value) => sum + value, 0)
}

function formatWorksheetMetric(value: number | null, metric: WorksheetMetric): string {
  if (value == null) return '-'
  return metric.format === 'percent'
    ? `${pctFmt.format(value * 100)}%`
    : formatInt(value)
}

function defaultPolicyDraft(index: number): TargetPolicyDraft {
  const targetSkuCount = DEFAULT_POLICY_TARGET_SKUS[index] ?? DEFAULT_POLICY_TARGET_SKUS[0] ?? 0
  const storeOverride = DEFAULT_POLICY_STORE_COUNTS[index] ?? DEFAULT_POLICY_STORE_COUNTS[0] ?? 0
  return {
    targetSkuCount,
    useStoreOverride: false,
    storeOverride,
    staleMonths: 12,
  }
}

function renderReportValue(value: SeasonalPurchaseReportValue): ReactNode {
  return (
    <Space direction="vertical" size={0} style={{ lineHeight: 1.2 }}>
      <Text strong>{formatInt(value.units)}</Text>
      <Text type="secondary" style={{ fontSize: 12 }}>{formatHnl(value.costHnl)}</Text>
    </Space>
  )
}

function adjustmentLabel(kind: PurchasePlanAdjustmentKind): string {
  return kind === 'percent_lift' ? 'Percent lift/reduction' : 'Absolute season total'
}

function reportTitle(report: SeasonalPurchaseReportResponse): string {
  return `${report.planningScopeLabel} ${report.departmentLabel} ${report.seasons[0]?.seasonLabel ?? report.year} to ${report.seasons[report.seasons.length - 1]?.seasonLabel ?? report.year}`
}

function worksheetPlanIds(report: SeasonalPurchaseReportResponse): string[] {
  return report.workbook?.planId ? [report.workbook.planId] : []
}

export default function PurchasePlanningPage() {
  const [reportForm] = Form.useForm<SeasonalReportForm>()
  const [adjustmentForm] = Form.useForm<AdjustmentForm>()
  const [messageApi, contextHolder] = message.useMessage()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('report')
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [adjustmentTarget, setAdjustmentTarget] = useState<SavedPurchasePlanDepartment | null>(null)
  const [worksheetRows, setWorksheetRows] = useState<SavedPurchasePlanRow[]>([])
  const [autoBuyRowIds, setAutoBuyRowIds] = useState<Set<string>>(new Set())
  const [projectionPct, setProjectionPct] = useState<number>(0)
  const [worksheetReason, setWorksheetReason] = useState('Worksheet edit')
  const [worksheetColumnMode, setWorksheetColumnMode] = useState<WorksheetColumnMode>('months')
  const [seasonalReport, setSeasonalReport] = useState<SeasonalPurchaseReportResponse | null>(null)
  const [policyDepartmentNumber, setPolicyDepartmentNumber] = useState<number | undefined>()
  const [policyDrafts, setPolicyDrafts] = useState<Record<string, TargetPolicyDraft>>({})
  const [excludeStaleInventory, setExcludeStaleInventory] = useState(true)
  const [policySavedPreviewAt, setPolicySavedPreviewAt] = useState<string | null>(null)

  const { data: departments = [], isLoading: departmentsLoading } = useDepartments()

  const plans = useQuery({
    queryKey: ['purchase-planning', 'saved-plans'],
    queryFn: () => fetchSavedPurchasePlans({ status: 'draft' }),
    staleTime: 60_000,
  })

  const detail = useQuery({
    queryKey: ['purchase-planning', 'saved-plan', selectedPlanId],
    queryFn: () => fetchSavedPurchasePlan(selectedPlanId!),
    enabled: !!selectedPlanId,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  })

  const seasonalReportMutation = useMutation({
    mutationFn: (values: SeasonalReportForm) => generateSeasonalPurchaseReport({
      departmentNumber: values.departmentNumber,
      forecast: { method: values.forecastMethod },
      eohMethod: values.eohMethod,
      coverMonths: values.coverMonths,
      discountNormalization: values.discountNormalization,
      createdBy: 'buyer',
    }),
    onSuccess: async (report) => {
      setSeasonalReport(report)
      for (const planId of worksheetPlanIds(report)) {
        void qc.prefetchQuery({
          queryKey: ['purchase-planning', 'saved-plan', planId],
          queryFn: () => fetchSavedPurchasePlan(planId),
          staleTime: 60_000,
        })
      }
      await qc.invalidateQueries({ queryKey: ['purchase-planning', 'saved-plans'] })
      messageApi.success('Seasonal report refreshed')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not build seasonal report'),
  })

  const adjustmentMutation = useMutation({
    mutationFn: ({ planId, payload }: { planId: string; payload: SavedPurchasePlanAdjustmentRequest }) =>
      addSavedPurchasePlanAdjustment(planId, payload),
    onSuccess: async (updated) => {
      setAdjustmentTarget(null)
      adjustmentForm.resetFields()
      setSelectedPlanId(updated.plan.id)
      qc.setQueryData(['purchase-planning', 'saved-plan', updated.plan.id], updated)
      await qc.invalidateQueries({ queryKey: ['purchase-planning', 'saved-plans'] })
      messageApi.success('Adjustment saved')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not save adjustment'),
  })

  const worksheetUpdateMutation = useMutation({
    mutationFn: ({ planId, payload }: { planId: string; payload: SavedPurchasePlanRowsUpdateRequest }) =>
      updateSavedPurchasePlanRows(planId, payload),
    onSuccess: async (updated) => {
      setSelectedPlanId(updated.plan.id)
      qc.setQueryData(['purchase-planning', 'saved-plan', updated.plan.id], updated)
      await qc.invalidateQueries({ queryKey: ['purchase-planning', 'saved-plans'] })
      messageApi.success('Worksheet saved')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not save worksheet'),
  })

  const recalculateMutation = useMutation({
    mutationFn: (planId: string) => recalculateSavedPurchasePlan(planId, 'buyer'),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['purchase-planning'] })
      messageApi.success('Plan recalculated')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not recalculate plan'),
  })

  const archiveMutation = useMutation({
    mutationFn: (planId: string) => archiveSavedPurchasePlan(planId, 'buyer'),
    onSuccess: async () => {
      setSelectedPlanId(null)
      await qc.invalidateQueries({ queryKey: ['purchase-planning'] })
      messageApi.success('Plan archived')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not archive plan'),
  })

  const selectedPlan = detail.data?.plan.id === selectedPlanId ? detail.data : undefined
  const sourceWorksheetRows = useMemo<SavedPurchasePlanRow[]>(() => (
    selectedPlan?.departments.flatMap((department) => department.months) ?? []
  ), [selectedPlan])
  const originalRowsById = useMemo(() => (
    new Map(sourceWorksheetRows.map((row) => [row.id, row]))
  ), [sourceWorksheetRows])

  useEffect(() => {
    setWorksheetRows(sourceWorksheetRows.map((row) => ({ ...row })))
    setAutoBuyRowIds(new Set())
    setProjectionPct(0)
    setWorksheetReason('Worksheet edit')
  }, [sourceWorksheetRows])

  const seasonalReportColumns = useMemo<ColumnsType<SeasonalReportRow>>(() => [
    {
      title: 'Report row',
      dataIndex: 'label',
      fixed: 'left',
      width: 155,
      render: (value: string) => <Text>{value}</Text>,
    },
    ...(seasonalReport?.seasons ?? []).map((season) => ({
      title: (
        <Space size={4} wrap>
          <Text>{season.seasonLabel}</Text>
          {season.autoCreated ? <Tag color="blue">auto</Tag> : null}
        </Space>
      ),
      key: `${season.season}-${season.seasonYear}`,
      align: 'right' as const,
      render: (_: unknown, row: SeasonalReportRow) => renderReportValue(season[row.key]),
    })),
  ], [seasonalReport])

  const planColumns = useMemo<ColumnsType<SavedPurchasePlanListItem>>(() => [
    {
      title: 'Plan',
      dataIndex: 'label',
      render: (value: string, row) => (
        <Button type="link" htmlType="button" onClick={() => {
          setSelectedPlanId(row.id)
          setActiveTab('report')
        }} style={{ padding: 0 }}>
          {value}
        </Button>
      ),
    },
    { title: 'Scope', dataIndex: 'planningScopeLabel', width: 170, render: (_: string | null, row) => row.planningScopeLabel ?? row.storeGroupLabel ?? row.storeGroupCode },
    {
      title: 'Window',
      width: 190,
      render: (_: unknown, row) => row.seasonMonths.length > 3
        ? `${formatMonth(row.seasonMonths[0] ?? '')} - ${formatMonth(row.seasonMonths[row.seasonMonths.length - 1] ?? '')}`
        : `${row.season} ${row.seasonYear}`,
    },
    { title: 'Departments', dataIndex: 'departmentCount', width: 110, align: 'right' },
    { title: 'Units', dataIndex: 'currentTotalBuy', width: 100, align: 'right', render: formatInt },
  ], [])

  const showWorksheetDepartment = (selectedPlan?.departments.length ?? 0) > 1

  const worksheetPeriods = useMemo(() => {
    const months = selectedPlan?.plan.seasonMonths.length
      ? selectedPlan.plan.seasonMonths
      : worksheetRows.map((row) => row.yearMonth)
    return buildWorksheetPeriods(months, worksheetColumnMode)
  }, [selectedPlan, worksheetColumnMode, worksheetRows])

  const worksheetRowByDepartmentMonth = useMemo(() => {
    const out = new Map<string, SavedPurchasePlanRow>()
    for (const row of worksheetRows) {
      out.set(`${row.departmentKey}|${row.yearMonth}`, row)
    }
    return out
  }, [worksheetRows])

  const worksheetPivotRows = useMemo<WorksheetPivotRow[]>(() => {
    const departmentsByKey = new Map<string, string>()
    for (const row of worksheetRows) {
      if (!departmentsByKey.has(row.departmentKey)) departmentsByKey.set(row.departmentKey, row.departmentLabel)
    }
    return [...departmentsByKey.entries()].flatMap(([departmentKey, departmentLabel]) =>
      WORKSHEET_METRICS.map((metric) => ({
        key: `${departmentKey}-${metric.key}`,
        departmentKey,
        departmentLabel,
        metric,
      })),
    )
  }, [worksheetRows])

  function renderWorksheetPivotCell(row: WorksheetPivotRow, period: WorksheetPeriod): ReactNode {
    const periodRows = period.months
      .map((month) => worksheetRowByDepartmentMonth.get(`${row.departmentKey}|${month}`))
      .filter((value): value is SavedPurchasePlanRow => Boolean(value))
    const metric = row.metric
    const monthlyRow = period.mode === 'months' ? periodRows[0] : undefined

    if (monthlyRow && metric.editableKey) {
      const original = originalRowsById.get(monthlyRow.id)
      const currentValue = monthlyRow[metric.editableKey]
      return (
        <InputNumber
          aria-label={`${showWorksheetDepartment ? `${row.departmentLabel} ` : ''}${period.label} ${metric.inputLabel}`}
          min={0}
          precision={0}
          size="small"
          value={currentValue}
          status={original?.[metric.editableKey] === currentValue ? undefined : 'warning'}
          onChange={(value) => updateWorksheetCell(monthlyRow.id, { [metric.editableKey!]: formUnit(value) })}
          style={{ width: 92 }}
        />
      )
    }

    return (
      <Text strong={metric.key === 'currentBuy'}>
        {formatWorksheetMetric(aggregateWorksheetMetric(periodRows, metric), metric)}
      </Text>
    )
  }

  const worksheetColumns = useMemo<ColumnsType<WorksheetPivotRow>>(() => {
    return [
      ...(showWorksheetDepartment ? [{
        title: 'Department',
        dataIndex: 'departmentLabel',
        fixed: 'left' as const,
        width: 220,
        render: (value: string) => (
          <Space size={6}>
            <Text>{value}</Text>
          </Space>
        ),
      }] : []),
      {
        title: 'Worksheet row',
        dataIndex: ['metric', 'label'],
        fixed: 'left' as const,
        width: 150,
        render: (_: unknown, row) => <Text>{row.metric.label}</Text>,
      },
      ...worksheetPeriods.map((period) => ({
        title: period.label,
        key: period.key,
        align: 'right' as const,
        width: period.mode === 'months' ? 118 : 132,
        render: (_: unknown, row: WorksheetPivotRow) => renderWorksheetPivotCell(row, period),
      })),
    ]
  }, [originalRowsById, showWorksheetDepartment, worksheetPeriods, worksheetRowByDepartmentMonth])

  const worksheetChanges = useMemo(() => buildWorksheetChanges(worksheetRows, originalRowsById), [originalRowsById, worksheetRows])
  const worksheetTotals = useMemo(() => {
    const totals = worksheetRows.reduce((acc, row) => ({
      projectedBoh: acc.projectedBoh + row.currentBoh,
      projectedSales: acc.projectedSales + row.currentProjSales,
      eohTarget: acc.eohTarget + row.currentEohTarget,
      baselineTotalBuy: acc.baselineTotalBuy + row.baselineBuy,
      currentTotalBuy: acc.currentTotalBuy + row.currentBuy,
      currentEohActual: acc.currentEohActual + row.currentEohActual,
    }), {
      projectedBoh: 0,
      projectedSales: 0,
      eohTarget: 0,
      baselineTotalBuy: 0,
      currentTotalBuy: 0,
      currentEohActual: 0,
    })
    return {
      ...totals,
      deltaBuy: totals.currentTotalBuy - totals.baselineTotalBuy,
    }
  }, [worksheetRows])
  const effectivePolicyDepartmentNumber = policyDepartmentNumber
    ?? seasonalReport?.departmentNumber
    ?? selectedPlan?.departments[0]?.departmentNumber
    ?? departments[0]?.number
  const taxonomyPolicyDepartment = effectivePolicyDepartmentNumber == null
    ? undefined
    : departments.find((department) => department.number === effectivePolicyDepartmentNumber)
  const policyDepartmentLabel = effectivePolicyDepartmentNumber == null
    ? undefined
    : selectedPlan?.departments.find((department) => department.departmentNumber === effectivePolicyDepartmentNumber)?.departmentLabel
      ?? (seasonalReport?.departmentNumber === effectivePolicyDepartmentNumber ? seasonalReport.departmentLabel : undefined)
      ?? (taxonomyPolicyDepartment ? `${effectivePolicyDepartmentNumber} - ${taxonomyPolicyDepartment.description}` : `Department ${effectivePolicyDepartmentNumber}`)
  const policyDepartmentOptions = useMemo(() => {
    const options = departments.map((department) => ({
      value: department.number,
      label: `${department.number} - ${department.description}`,
    }))
    if (
      effectivePolicyDepartmentNumber != null
      && !options.some((option) => option.value === effectivePolicyDepartmentNumber)
    ) {
      options.unshift({
        value: effectivePolicyDepartmentNumber,
        label: policyDepartmentLabel ?? `Department ${effectivePolicyDepartmentNumber}`,
      })
    }
    return options
  }, [departments, effectivePolicyDepartmentNumber, policyDepartmentLabel])
  const policyMonthList = seasonalReport?.projectionMonths
    ?? selectedPlan?.plan.seasonMonths
    ?? DEFAULT_POLICY_MONTHS
  const policyMonthKey = policyMonthList.join('|')
  const policyPeriods = useMemo(() => buildWorksheetPeriods(policyMonthList, 'seasons'), [policyMonthKey])
  const selectedDepartmentWorksheetRows = useMemo(() => {
    if (effectivePolicyDepartmentNumber == null) return worksheetRows
    return worksheetRows.filter((row) => row.departmentNumber === effectivePolicyDepartmentNumber)
  }, [effectivePolicyDepartmentNumber, worksheetRows])
  const policyRows = useMemo<TargetPolicyRow[]>(() => policyPeriods.map((period, index) => {
    const draft = policyDrafts[period.key] ?? defaultPolicyDraft(index)
    const derivedStoreCount = DEFAULT_POLICY_STORE_COUNTS[index] ?? DEFAULT_POLICY_STORE_COUNTS[0] ?? 0
    const carryingStoreCount = draft.useStoreOverride ? draft.storeOverride : derivedStoreCount
    const worksheetDemand = selectedDepartmentWorksheetRows
      .filter((row) => period.months.includes(row.yearMonth))
      .reduce((sum, row) => sum + row.currentProjSales, 0)
    const reportDemand = seasonalReport?.seasons.find((season) => season.seasonLabel === period.label)?.projectedSales.units
    const demandCoverUnits = worksheetDemand || reportDemand || DEFAULT_POLICY_DEMAND_COVER[index] || 0
    const assortmentFloorUnits = draft.targetSkuCount * carryingStoreCount
    const eohTargetBasisUnits = assortmentFloorUnits + demandCoverUnits
    const staleUnits = Math.round((assortmentFloorUnits * 0.06) + (demandCoverUnits * 0.08))
    const excludedFromBohUnits = excludeStaleInventory ? staleUnits : 0
    return {
      key: period.key,
      label: period.label,
      months: period.months,
      ...draft,
      derivedStoreCount,
      carryingStoreCount,
      assortmentFloorUnits,
      demandCoverUnits,
      eohTargetBasisUnits,
      staleUnits,
      excludedFromBohUnits,
    }
  }), [excludeStaleInventory, policyDrafts, policyPeriods, seasonalReport, selectedDepartmentWorksheetRows])
  const policyTotals = useMemo(() => policyRows.reduce((totals, row) => ({
    assortmentFloorUnits: totals.assortmentFloorUnits + row.assortmentFloorUnits,
    demandCoverUnits: totals.demandCoverUnits + row.demandCoverUnits,
    eohTargetBasisUnits: totals.eohTargetBasisUnits + row.eohTargetBasisUnits,
    staleUnits: totals.staleUnits + row.staleUnits,
    excludedFromBohUnits: totals.excludedFromBohUnits + row.excludedFromBohUnits,
  }), {
    assortmentFloorUnits: 0,
    demandCoverUnits: 0,
    eohTargetBasisUnits: 0,
    staleUnits: 0,
    excludedFromBohUnits: 0,
  }), [policyRows])
  const policyColumns = useMemo<ColumnsType<TargetPolicyRow>>(() => [
    {
      title: 'Season',
      dataIndex: 'label',
      fixed: 'left',
      width: 150,
      render: (_: string, row) => (
        <Space direction="vertical" size={0}>
          <Text>{row.label}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{row.months.map(formatMonth).join(', ')}</Text>
        </Space>
      ),
    },
    {
      title: 'Target SKUs',
      dataIndex: 'targetSkuCount',
      width: 130,
      align: 'right',
      render: (_: number, row) => (
        <InputNumber
          aria-label={`${row.label} target SKU count`}
          min={0}
          precision={0}
          size="small"
          value={row.targetSkuCount}
          onChange={(value) => updatePolicyDraft(row.key, { targetSkuCount: formUnit(value) })}
          style={{ width: 96 }}
        />
      ),
    },
    {
      title: 'Carrying stores',
      dataIndex: 'carryingStoreCount',
      width: 190,
      align: 'right',
      render: (_: number, row) => (
        <Space size={6} wrap style={{ justifyContent: 'flex-end', width: '100%' }}>
          <InputNumber
            aria-label={`${row.label} carrying stores`}
            min={0}
            precision={0}
            size="small"
            disabled={!row.useStoreOverride}
            value={row.carryingStoreCount}
            onChange={(value) => updatePolicyDraft(row.key, { storeOverride: formUnit(value) })}
            style={{ width: 76 }}
          />
          <Switch
            aria-label={`${row.label} override carrying stores`}
            size="small"
            checked={row.useStoreOverride}
            onChange={(checked) => updatePolicyDraft(row.key, { useStoreOverride: checked })}
          />
          <Tag color={row.useStoreOverride ? 'gold' : 'blue'}>{row.useStoreOverride ? 'override' : 'derived'}</Tag>
        </Space>
      ),
    },
    {
      title: 'Assortment floor',
      dataIndex: 'assortmentFloorUnits',
      width: 140,
      align: 'right',
      render: formatInt,
    },
    {
      title: 'Demand cover',
      dataIndex: 'demandCoverUnits',
      width: 120,
      align: 'right',
      render: formatInt,
    },
    {
      title: 'EOH target basis',
      dataIndex: 'eohTargetBasisUnits',
      width: 140,
      align: 'right',
      render: (value: number) => <Text strong>{formatInt(value)}</Text>,
    },
    {
      title: 'Stale age (mo)',
      dataIndex: 'staleMonths',
      width: 125,
      align: 'right',
      render: (_: number, row) => (
        <InputNumber
          aria-label={`${row.label} stale age months`}
          min={1}
          max={60}
          precision={0}
          size="small"
          value={row.staleMonths}
          onChange={(value) => updatePolicyDraft(row.key, { staleMonths: formUnit(value) || 1 })}
          style={{ width: 82 }}
        />
      ),
    },
    {
      title: 'Stale units',
      dataIndex: 'staleUnits',
      width: 115,
      align: 'right',
      render: (value: number) => <Text type="warning">{formatInt(value)}</Text>,
    },
    {
      title: 'BOH excluded',
      dataIndex: 'excludedFromBohUnits',
      width: 120,
      align: 'right',
      render: formatInt,
    },
  ], [policyRows])

  function openAdjustment(row: SavedPurchasePlanDepartment): void {
    setAdjustmentTarget(row)
    adjustmentForm.setFieldsValue({ kind: 'absolute_total', value: row.currentTotalBuy, reason: '' })
  }

  function submitAdjustment(values: AdjustmentForm): void {
    if (!selectedPlanId || !adjustmentTarget) return
    adjustmentMutation.mutate({
      planId: selectedPlanId,
      payload: {
        departmentKey: adjustmentTarget.departmentKey,
        kind: values.kind,
        value: values.value,
        reason: values.reason,
        appliedBy: 'buyer',
      },
    })
  }

  function recalculateWorksheetRows(rows: SavedPurchasePlanRow[], autoBuyIds: Set<string>): SavedPurchasePlanRow[] {
    const byDepartment = new Map<string, SavedPurchasePlanRow[]>()
    for (const row of rows) {
      const group = byDepartment.get(row.departmentKey) ?? []
      group.push(row)
      byDepartment.set(row.departmentKey, group)
    }

    const recalculatedById = new Map<string, SavedPurchasePlanRow>()
    for (const departmentRows of byDepartment.values()) {
      const sortedRows = [...departmentRows].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
      let runningBoh = sortedRows[0]?.currentBoh ?? 0
      sortedRows.forEach((row, index) => {
        const currentBoh = index === 0 ? row.currentBoh : runningBoh
        const currentBuy = autoBuyIds.has(row.id)
          ? Math.max(0, row.currentProjSales + row.currentEohTarget - currentBoh)
          : row.currentBuy
        const currentEohActual = currentBoh + currentBuy - row.currentProjSales
        const next = { ...row, currentBoh, currentBuy, currentEohActual }
        recalculatedById.set(row.id, next)
        runningBoh = currentEohActual
      })
    }
    return rows.map((row) => recalculatedById.get(row.id) ?? row)
  }

  function updateWorksheetCell(rowId: string, changes: Partial<Pick<SavedPurchasePlanRow, 'currentProjSales' | 'currentEohTarget' | 'currentBuy'>>): void {
    const nextAutoBuyIds = new Set(autoBuyRowIds)
    if (changes.currentBuy != null) nextAutoBuyIds.delete(rowId)
    if (changes.currentProjSales != null || changes.currentEohTarget != null) nextAutoBuyIds.add(rowId)
    setAutoBuyRowIds(nextAutoBuyIds)
    setWorksheetRows((rows) => recalculateWorksheetRows(
      rows.map((row) => row.id === rowId ? { ...row, ...changes } : row),
      nextAutoBuyIds,
    ))
  }

  function applyProjectionPercent(): void {
    const pct = Number(projectionPct)
    if (!Number.isFinite(pct) || pct < -100) {
      messageApi.error('Projection percent must be -100 or higher')
      return
    }
    const multiplier = 1 + pct / 100
    const nextAutoBuyIds = new Set(autoBuyRowIds)
    worksheetRows.forEach((row) => nextAutoBuyIds.add(row.id))
    setAutoBuyRowIds(nextAutoBuyIds)
    setWorksheetRows((rows) => recalculateWorksheetRows(
      rows.map((row) => ({
        ...row,
        currentProjSales: formUnit(row.currentProjSales * multiplier),
        currentEohTarget: formUnit(row.currentEohTarget * multiplier),
      })),
      nextAutoBuyIds,
    ))
  }

  function resetWorksheet(): void {
    setWorksheetRows(sourceWorksheetRows.map((row) => ({ ...row })))
    setAutoBuyRowIds(new Set())
    setProjectionPct(0)
    setWorksheetReason('Worksheet edit')
  }

  function saveWorksheet(): void {
    if (!selectedPlanId || worksheetChanges.length === 0) return
    const reason = worksheetReason.trim() || 'Worksheet edit'
    worksheetUpdateMutation.mutate({
      planId: selectedPlanId,
      payload: {
        rows: worksheetChanges,
        reason,
        appliedBy: 'buyer',
      },
    })
  }

  function buildWorksheetChanges(
    rows: SavedPurchasePlanRow[],
    originals: Map<string, SavedPurchasePlanRow>,
  ): SavedPurchasePlanRowsUpdateRequest['rows'] {
    return rows.flatMap((row) => {
      const original = originals.get(row.id)
      if (!original) return []
      const change: SavedPurchasePlanRowsUpdateRequest['rows'][number] = { rowId: row.id }
      if (row.currentProjSales !== original.currentProjSales) change.currentProjSales = row.currentProjSales
      if (row.currentEohTarget !== original.currentEohTarget) change.currentEohTarget = row.currentEohTarget
      if (row.currentBuy !== original.currentBuy) change.currentBuy = row.currentBuy
      return change.currentProjSales == null && change.currentEohTarget == null && change.currentBuy == null
        ? []
        : [change]
    })
  }

  function updatePolicyDraft(seasonKey: string, changes: Partial<TargetPolicyDraft>): void {
    const periodIndex = policyPeriods.findIndex((period) => period.key === seasonKey)
    const current = policyDrafts[seasonKey] ?? defaultPolicyDraft(periodIndex < 0 ? 0 : periodIndex)
    setPolicyDrafts((drafts) => ({
      ...drafts,
      [seasonKey]: {
        ...current,
        ...changes,
      },
    }))
    setPolicySavedPreviewAt(null)
  }

  function resetPolicyMockup(): void {
    setPolicyDrafts({})
    setExcludeStaleInventory(true)
    setPolicySavedPreviewAt(null)
  }

  function savePolicyMockup(): void {
    setPolicySavedPreviewAt(dayjs().format('HH:mm:ss'))
    messageApi.info('Policy mockup staged')
  }

  const reportContent = (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Card size="small" title="Seasonal report">
        <Form<SeasonalReportForm>
          name="seasonalReport"
          form={reportForm}
          layout="vertical"
          initialValues={{
            forecastMethod: 'holtWinters',
            eohMethod: 'forward',
            coverMonths: 3,
            discountNormalization: true,
          }}
          onFinish={(values) => seasonalReportMutation.mutate(values)}
        >
          <Row gutter={[8, 0]} align="bottom">
            <Col xs={24} sm={12} lg={6}>
              <Form.Item label="Department" name="departmentNumber" rules={[{ required: true, message: 'Select a department' }]} style={{ marginBottom: 8 }}>
                <Select
                  loading={departmentsLoading}
                  optionFilterProp="label"
                  options={departments.map((department) => ({
                    value: department.number,
                    label: `${department.number} - ${department.description}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} lg={4}>
              <Form.Item label="Forecast" name="forecastMethod" style={{ marginBottom: 8 }}>
                <Select options={FORECAST_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} lg={4}>
              <Form.Item label="EOH" name="eohMethod" style={{ marginBottom: 8 }}>
                <Select options={EOH_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} lg={3}>
              <Form.Item label="Cover" name="coverMonths" style={{ marginBottom: 8 }}>
                <InputNumber min={1} max={12} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8} lg={2}>
              <Form.Item label="Norm" name="discountNormalization" valuePropName="checked" style={{ marginBottom: 8 }}>
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8} lg={2}>
              <Form.Item style={{ marginBottom: 8 }}>
                <Button type="primary" htmlType="submit" loading={seasonalReportMutation.isPending} block>
                  Run
                </Button>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {seasonalReport ? (
        <Card
          size="small"
          title={reportTitle(seasonalReport)}
          extra={(
            <Space size={6} wrap>
              {seasonalReport.warehouseStoreNumbers.length > 0 ? <Tag color="green">warehouse included</Tag> : null}
              <Text type="secondary">Units and HNL cost</Text>
            </Space>
          )}
        >
          {seasonalReport.warnings.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              message={seasonalReport.warnings.join(' ')}
              style={{ marginBottom: 12 }}
            />
          ) : null}
          <Table<SeasonalReportRow>
            dataSource={REPORT_ROWS}
            columns={seasonalReportColumns}
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
          <Space wrap style={{ marginTop: 12 }}>
            <Button size="small" htmlType="button" onClick={() => {
              setSelectedPlanId(seasonalReport.workbook.planId)
              setActiveTab('report')
            }}>
              Open monthly projection worksheet
            </Button>
          </Space>
        </Card>
      ) : null}

      {detail.error ? (
        <Alert
          type="error"
          message="Could not load plan"
          description={detail.error instanceof Error ? detail.error.message : String(detail.error)}
        />
      ) : null}

      {!selectedPlanId ? (
        <Card size="small">
          <Empty description="Generate a report or select a saved worksheet." image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 40 }} />
        </Card>
      ) : selectedPlan ? (
        <Card
          size="small"
          title={selectedPlan.plan.label}
          extra={(
            <Space>
              <Tag>{selectedPlan.plan.planningScopeLabel ?? selectedPlan.plan.storeGroupLabel ?? selectedPlan.plan.storeGroupCode}</Tag>
              <Tag>{selectedPlan.plan.seasonMonths.length > 3 ? '15-month workbook' : `${selectedPlan.plan.season} ${selectedPlan.plan.seasonYear}`}</Tag>
              <Button htmlType="button" onClick={() => recalculateMutation.mutate(selectedPlan.plan.id)} loading={recalculateMutation.isPending}>
                Recalculate
              </Button>
              <Button danger htmlType="button" onClick={() => archiveMutation.mutate(selectedPlan.plan.id)} loading={archiveMutation.isPending}>
                Archive
              </Button>
            </Space>
          )}
        >
          <Space wrap style={{ marginBottom: 12 }}>
            <Text type="secondary">Months: {selectedPlan.plan.seasonMonths.map(formatMonth).join(', ')}</Text>
            <Text type="secondary">History: {selectedPlan.plan.historyFromYearMonth} to {selectedPlan.plan.historyToYearMonth}</Text>
            <Text type="secondary">Forecast: {selectedPlan.plan.forecastMethod}</Text>
            {selectedPlan.plan.discountNormalization ? <Tag color="blue">discount normalization</Tag> : null}
          </Space>
          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8}>
              <Text type="secondary">Baseline buy</Text>
              <Title level={4} style={{ margin: 0 }}>{formatInt(worksheetTotals.baselineTotalBuy)}</Title>
            </Col>
            <Col xs={24} sm={8}>
              <Text type="secondary">Current buy</Text>
              <Title level={4} style={{ margin: 0 }}>{formatInt(worksheetTotals.currentTotalBuy)}</Title>
            </Col>
            <Col xs={24} sm={8}>
              <Text type="secondary">Adjusted delta</Text>
              <Title level={4} style={{ margin: 0 }}>{worksheetTotals.deltaBuy > 0 ? '+' : ''}{formatInt(worksheetTotals.deltaBuy)}</Title>
            </Col>
          </Row>
          <Space wrap style={{ marginBottom: 12 }}>
            {selectedPlan.departments.map((department) => (
              <Button key={department.departmentKey} size="small" htmlType="button" onClick={() => openAdjustment(department)}>
                Adjust {selectedPlan.departments.length === 1 ? 'department' : department.departmentLabel}
              </Button>
            ))}
          </Space>
          <Space wrap align="end" style={{ marginBottom: 12 }}>
            <Space direction="vertical" size={2}>
              <Text type="secondary">Columns</Text>
              <Segmented<WorksheetColumnMode>
                aria-label="Worksheet columns"
                value={worksheetColumnMode}
                onChange={setWorksheetColumnMode}
                options={[
                  { label: 'Months', value: 'months' },
                  { label: 'Seasons', value: 'seasons' },
                ]}
              />
            </Space>
            <Space direction="vertical" size={2}>
              <Text type="secondary">Projection %</Text>
              <InputNumber
                aria-label="Projection percent"
                min={-100}
                max={500}
                precision={1}
                value={projectionPct}
                onChange={(value) => setProjectionPct(Number(value ?? 0))}
                style={{ width: 110 }}
              />
            </Space>
            <Button htmlType="button" onClick={applyProjectionPercent} disabled={worksheetRows.length === 0}>
              Apply projection %
            </Button>
            <Space direction="vertical" size={2}>
              <Text type="secondary">Reason</Text>
              <Input
                aria-label="Worksheet reason"
                value={worksheetReason}
                onChange={(event) => setWorksheetReason(event.target.value)}
                style={{ width: 260 }}
              />
            </Space>
            <Button
              type="primary"
              htmlType="button"
              onClick={saveWorksheet}
              loading={worksheetUpdateMutation.isPending}
              disabled={worksheetChanges.length === 0}
            >
              Save worksheet
            </Button>
            <Button htmlType="button" onClick={resetWorksheet} disabled={worksheetChanges.length === 0}>
              Reset worksheet
            </Button>
            {worksheetChanges.length > 0 ? <Tag color="gold">{worksheetChanges.length} changed</Tag> : null}
          </Space>
          <Table<WorksheetPivotRow>
            aria-label="Worksheet grid"
            dataSource={worksheetPivotRows}
            columns={worksheetColumns}
            rowKey="key"
            size="small"
            loading={detail.isFetching}
            pagination={false}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: 'No monthly rows for this worksheet.' }}
          />
        </Card>
      ) : (
        <Card loading size="small" />
      )}
    </Space>
  )

  const targetPoliciesContent = (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="Mockup only: policy saves and workbook updates are not connected yet."
      />
      <Card
        size="small"
        title="Department-season target policies"
        extra={(
          <Space size={6} wrap>
            <Tag color="gold">mockup</Tag>
            <Tag color="blue">enterprise-wide</Tag>
          </Space>
        )}
      >
        <Row gutter={[12, 12]} align="bottom" style={{ marginBottom: 14 }}>
          <Col xs={24} md={8} lg={6}>
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              <Text type="secondary">Department</Text>
              <Select
                aria-label="Policy department"
                loading={departmentsLoading}
                value={effectivePolicyDepartmentNumber}
                optionFilterProp="label"
                options={policyDepartmentOptions}
                onChange={(value) => {
                  setPolicyDepartmentNumber(value)
                  setPolicySavedPreviewAt(null)
                }}
                style={{ width: '100%' }}
              />
            </Space>
          </Col>
          <Col xs={12} sm={6} lg={4}>
            <Text type="secondary">Assortment floor</Text>
            <Title level={4} style={{ margin: 0 }}>{formatInt(policyTotals.assortmentFloorUnits)}</Title>
          </Col>
          <Col xs={12} sm={6} lg={4}>
            <Text type="secondary">Demand cover</Text>
            <Title level={4} style={{ margin: 0 }}>{formatInt(policyTotals.demandCoverUnits)}</Title>
          </Col>
          <Col xs={12} sm={6} lg={4}>
            <Text type="secondary">EOH basis</Text>
            <Title level={4} style={{ margin: 0 }}>{formatInt(policyTotals.eohTargetBasisUnits)}</Title>
          </Col>
          <Col xs={12} sm={6} lg={4}>
            <Text type="secondary">Stale excluded</Text>
            <Title level={4} style={{ margin: 0 }}>{formatInt(policyTotals.excludedFromBohUnits)}</Title>
          </Col>
        </Row>

        <Space wrap align="center" style={{ marginBottom: 12 }}>
          <Space direction="vertical" size={2}>
            <Text type="secondary">Stale inventory</Text>
            <Switch
              aria-label="Exclude stale inventory"
              checked={excludeStaleInventory}
              checkedChildren="Exclude"
              unCheckedChildren="Keep"
              onChange={(checked) => {
                setExcludeStaleInventory(checked)
                setPolicySavedPreviewAt(null)
              }}
            />
          </Space>
          <Button
            icon={<CalculatorOutlined aria-hidden />}
            htmlType="button"
            onClick={() => messageApi.info('Policy preview refreshed')}
          >
            Preview workbook impact
          </Button>
          <Button type="primary" icon={<SaveOutlined aria-hidden />} htmlType="button" onClick={savePolicyMockup}>
            Save policy
          </Button>
          <Button icon={<ReloadOutlined aria-hidden />} htmlType="button" onClick={resetPolicyMockup}>
            Reset mockup
          </Button>
          {policySavedPreviewAt ? <Tag color="green">staged {policySavedPreviewAt}</Tag> : null}
          {policyDepartmentLabel ? <Tag>{policyDepartmentLabel}</Tag> : null}
        </Space>

        <Table<TargetPolicyRow>
          aria-label="Target policy mockup grid"
          dataSource={policyRows}
          columns={policyColumns}
          rowKey="key"
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </Space>
  )

  const savedPlansContent = (
    <Card size="small" title="Saved draft plans">
      <Table<SavedPurchasePlanListItem>
        dataSource={plans.data ?? []}
        columns={planColumns}
        rowKey="id"
        size="small"
        loading={plans.isLoading}
        pagination={{ pageSize: 10 }}
      />
    </Card>
  )

  return (
    <div>
      {contextHolder}
      <Space align="center" size={8} style={{ marginBottom: 10 }}>
        <Title level={2} style={{ margin: 0 }}>Plan de Compras</Title>
        <Tag color="blue">V2</Tag>
      </Space>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'report', label: 'Report', children: reportContent },
          { key: 'policies', label: 'Target policies', children: targetPoliciesContent },
          { key: 'saved', label: 'Saved plans', children: savedPlansContent },
        ]}
      />

      <Modal
        title={adjustmentTarget ? `Adjust ${adjustmentTarget.departmentLabel}` : 'Adjust department'}
        open={!!adjustmentTarget}
        onCancel={() => setAdjustmentTarget(null)}
        onOk={() => adjustmentForm.submit()}
        okText="Save adjustment"
        confirmLoading={adjustmentMutation.isPending}
      >
        <Form<AdjustmentForm>
          form={adjustmentForm}
          layout="vertical"
          initialValues={{ kind: 'absolute_total' }}
          onFinish={submitAdjustment}
        >
          <Form.Item label="Adjustment type" name="kind" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'absolute_total', label: adjustmentLabel('absolute_total') },
                { value: 'percent_lift', label: adjustmentLabel('percent_lift') },
              ]}
            />
          </Form.Item>
          <Form.Item label="Value" name="value" rules={[{ required: true, message: 'Enter a value' }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Reason" name="reason" rules={[{ required: true, message: 'Reason is required' }]}>
            <Input.TextArea rows={3} maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
