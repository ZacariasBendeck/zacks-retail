import { useMemo, useState, type ReactNode } from 'react'
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
  type SeasonalPurchaseReportResponse,
  type SeasonalPurchaseReportSeason,
  type SeasonalPurchaseReportValue,
} from '../../services/purchasePlanningApi'
import {
  SavedPurchasePlanWorkbook,
  buildPurchasePlanWorksheetPeriods,
  formatPurchasePlanMonth,
} from './SavedPurchasePlanWorkbook'

const { Title, Text } = Typography

const integerFmt = new Intl.NumberFormat('en-US')
const moneyFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
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

const REPORT_ROWS: SeasonalReportRow[] = [
  { key: 'projectedBoh', label: 'Projected BOH' },
  { key: 'projectedSales', label: 'Projected Sales' },
  { key: 'baselineBuy', label: 'Planned Buy' },
  { key: 'draftPos', label: 'Draft POs' },
  { key: 'confirmedPos', label: 'Confirmed POs' },
  { key: 'openToBuy', label: 'Open To Buy' },
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

function formatInt(value: number): string {
  return integerFmt.format(Math.round(value ?? 0))
}

function formatHnl(value: number): string {
  return `HNL ${moneyFmt.format(Math.round(value ?? 0))}`
}

function formUnit(value: number | null | undefined): number {
  return Math.max(0, Math.round(Number(value ?? 0)))
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
  const selectedPlanRows = useMemo(() => (
    selectedPlan?.departments.flatMap((department) => department.months) ?? []
  ), [selectedPlan])

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
        ? `${formatPurchasePlanMonth(row.seasonMonths[0] ?? '')} - ${formatPurchasePlanMonth(row.seasonMonths[row.seasonMonths.length - 1] ?? '')}`
        : `${row.season} ${row.seasonYear}`,
    },
    { title: 'Departments', dataIndex: 'departmentCount', width: 110, align: 'right' },
    { title: 'Units', dataIndex: 'currentTotalBuy', width: 100, align: 'right', render: formatInt },
  ], [])

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
  const policyPeriods = useMemo(() => buildPurchasePlanWorksheetPeriods(policyMonthList, 'seasons'), [policyMonthKey])
  const selectedDepartmentWorksheetRows = useMemo(() => {
    if (effectivePolicyDepartmentNumber == null) return selectedPlanRows
    return selectedPlanRows.filter((row) => row.departmentNumber === effectivePolicyDepartmentNumber)
  }, [effectivePolicyDepartmentNumber, selectedPlanRows])
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
          <Text type="secondary" style={{ fontSize: 12 }}>{row.months.map(formatPurchasePlanMonth).join(', ')}</Text>
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
        <SavedPurchasePlanWorkbook
          detail={selectedPlan}
          loading={detail.isFetching}
          saveLoading={worksheetUpdateMutation.isPending}
          recalculateLoading={recalculateMutation.isPending}
          archiveLoading={archiveMutation.isPending}
          onSaveRows={(planId, payload) => worksheetUpdateMutation.mutate({ planId, payload })}
          onRecalculate={(planId) => recalculateMutation.mutate(planId)}
          onArchive={(planId) => archiveMutation.mutate(planId)}
          extraControls={(
            <>
              {selectedPlan.departments.map((department) => (
                <Button key={department.departmentKey} size="small" htmlType="button" onClick={() => openAdjustment(department)}>
                  Adjust {selectedPlan.departments.length === 1 ? 'department' : department.departmentLabel}
                </Button>
              ))}
            </>
          )}
        />
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
