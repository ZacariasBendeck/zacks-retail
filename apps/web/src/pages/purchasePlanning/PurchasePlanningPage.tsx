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
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useStoreChains } from '../../hooks/useStores'
import { useDepartments } from '../../hooks/useProductsTaxonomy'
import {
  addSavedPurchasePlanAdjustment,
  archiveSavedPurchasePlan,
  createSavedPurchasePlan,
  fetchSavedPurchasePlan,
  fetchSavedPurchasePlans,
  generateSeasonalPurchaseReport,
  recalculateSavedPurchasePlan,
  type PurchasePlanAdjustmentKind,
  type PurchasePlanEohMethod,
  type PurchasePlanForecastMethod,
  type PurchasePlanningSeason,
  type SavedPurchasePlanAdjustmentRequest,
  type SavedPurchasePlanCreateRequest,
  type SavedPurchasePlanDepartment,
  type SavedPurchasePlanListItem,
  type SavedPurchasePlanRow,
  type SeasonalPurchaseReportResponse,
  type SeasonalPurchaseReportSeason,
  type SeasonalPurchaseReportValue,
} from '../../services/purchasePlanningApi'

const { Title, Paragraph, Text } = Typography

const integerFmt = new Intl.NumberFormat('en-US')
const moneyFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const pctFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

const SEASONS: Array<{ value: PurchasePlanningSeason; label: string }> = [
  { value: 'spring', label: 'Spring (Feb-Apr)' },
  { value: 'summer', label: 'Summer (May-Jul)' },
  { value: 'fall', label: 'Fall (Aug-Oct)' },
  { value: 'winter', label: 'Winter (Nov-Jan)' },
]

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

interface CreatePlanForm {
  label?: string
  storeGroupCode: string
  season: PurchasePlanningSeason
  seasonYear: number
  departmentNumbers: number[]
  forecastMethod: PurchasePlanForecastMethod
  eohMethod: PurchasePlanEohMethod
  coverMonths: number
  discountNormalization: boolean
}

interface AdjustmentForm {
  kind: PurchasePlanAdjustmentKind
  value: number
  reason: string
}

interface SeasonalReportForm {
  storeGroupCode: string
  departmentNumber: number
  year: number
  forecastMethod: PurchasePlanForecastMethod
  eohMethod: PurchasePlanEohMethod
  coverMonths: number
  discountNormalization: boolean
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
  { key: 'baselineBuy', label: 'Baseline Buy' },
  { key: 'draftPos', label: 'Draft POs' },
  { key: 'confirmedPos', label: 'Confirmed POs' },
  { key: 'openToBuy', label: 'Open To Buy' },
]

function formatMonth(yearMonth: string): string {
  return dayjs(`${yearMonth}-01`).format('MMM YYYY')
}

function formatInt(value: number): string {
  return integerFmt.format(Math.round(value ?? 0))
}

function formatHnl(value: number): string {
  return `HNL ${moneyFmt.format(Math.round(value ?? 0))}`
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

export default function PurchasePlanningPage() {
  const [form] = Form.useForm<CreatePlanForm>()
  const [reportForm] = Form.useForm<SeasonalReportForm>()
  const [adjustmentForm] = Form.useForm<AdjustmentForm>()
  const [messageApi, contextHolder] = message.useMessage()
  const qc = useQueryClient()
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [adjustmentTarget, setAdjustmentTarget] = useState<SavedPurchasePlanDepartment | null>(null)
  const [seasonalReport, setSeasonalReport] = useState<SeasonalPurchaseReportResponse | null>(null)

  const { data: chains = [], isLoading: chainsLoading } = useStoreChains()
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
  })

  const createMutation = useMutation({
    mutationFn: (values: CreatePlanForm) => {
      const payload: SavedPurchasePlanCreateRequest = {
        label: values.label?.trim() || undefined,
        storeGroupCode: values.storeGroupCode,
        season: values.season,
        seasonYear: values.seasonYear,
        departmentNumbers: values.departmentNumbers,
        forecast: { method: values.forecastMethod },
        eohMethod: values.eohMethod,
        coverMonths: values.coverMonths,
        discountNormalization: values.discountNormalization,
        createdBy: 'buyer',
      }
      return createSavedPurchasePlan(payload)
    },
    onSuccess: async (created) => {
      setSelectedPlanId(created.plan.id)
      await qc.invalidateQueries({ queryKey: ['purchase-planning'] })
      messageApi.success('Plan saved')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not create plan'),
  })

  const seasonalReportMutation = useMutation({
    mutationFn: (values: SeasonalReportForm) => generateSeasonalPurchaseReport({
      storeGroupCode: values.storeGroupCode,
      departmentNumber: values.departmentNumber,
      year: values.year,
      forecast: { method: values.forecastMethod },
      eohMethod: values.eohMethod,
      coverMonths: values.coverMonths,
      discountNormalization: values.discountNormalization,
      createdBy: 'buyer',
    }),
    onSuccess: async (report) => {
      setSeasonalReport(report)
      await qc.invalidateQueries({ queryKey: ['purchase-planning'] })
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
      await qc.invalidateQueries({ queryKey: ['purchase-planning'] })
      setSelectedPlanId(updated.plan.id)
      messageApi.success('Adjustment saved')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not save adjustment'),
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

  const selectedPlan = detail.data

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
      key: season.season,
      align: 'right' as const,
      render: (_: unknown, row: SeasonalReportRow) => renderReportValue(season[row.key]),
    })),
  ], [seasonalReport])

  const planColumns = useMemo<ColumnsType<SavedPurchasePlanListItem>>(() => [
    {
      title: 'Plan',
      dataIndex: 'label',
      render: (value: string, row) => (
        <Button type="link" onClick={() => setSelectedPlanId(row.id)} style={{ padding: 0 }}>
          {value}
        </Button>
      ),
    },
    { title: 'Chain', dataIndex: 'storeGroupLabel', width: 150, render: (_: string | null, row) => row.storeGroupLabel ?? row.storeGroupCode },
    { title: 'Season', width: 120, render: (_: unknown, row) => `${row.season} ${row.seasonYear}` },
    { title: 'Departments', dataIndex: 'departmentCount', width: 110, align: 'right' },
    { title: 'Units', dataIndex: 'currentTotalBuy', width: 100, align: 'right', render: formatInt },
  ], [])

  const departmentColumns = useMemo<ColumnsType<SavedPurchasePlanDepartment>>(() => [
    {
      title: 'Department',
      dataIndex: 'departmentLabel',
      fixed: 'left',
      width: 230,
      render: (value: string, row) => (
        <Space size={6}>
          <Text>{value}</Text>
          {!row.hasHistory ? <Tag color="gold">no history</Tag> : null}
        </Space>
      ),
    },
    { title: 'On hand', dataIndex: 'currentOnHand', width: 95, align: 'right', render: formatInt },
    {
      title: 'On order',
      width: 95,
      align: 'right',
      render: (_: unknown, row) => formatInt(row.currentOnOrder + row.futureOnOrder + row.nativeOpenPo),
    },
    { title: 'Projected sales', dataIndex: 'totalProjSales', width: 125, align: 'right', render: formatInt },
    { title: 'Baseline buy', dataIndex: 'baselineTotalBuy', width: 115, align: 'right', render: formatInt },
    {
      title: 'Current buy',
      dataIndex: 'currentTotalBuy',
      width: 115,
      align: 'right',
      render: (value: number) => <Text strong>{formatInt(value)}</Text>,
    },
    {
      title: 'Delta',
      dataIndex: 'deltaBuy',
      width: 95,
      align: 'right',
      render: (value: number) => (
        <Text type={value === 0 ? 'secondary' : value > 0 ? 'success' : 'danger'}>
          {value > 0 ? '+' : ''}{formatInt(value)}
        </Text>
      ),
    },
    {
      title: '',
      width: 110,
      render: (_: unknown, row) => (
        <Button size="small" onClick={() => {
          setAdjustmentTarget(row)
          adjustmentForm.setFieldsValue({ kind: 'absolute_total', value: row.currentTotalBuy, reason: '' })
        }}>
          Adjust
        </Button>
      ),
    },
  ], [adjustmentForm])

  const monthColumns = useMemo<ColumnsType<SavedPurchasePlanRow>>(() => [
    { title: 'Month', dataIndex: 'yearMonth', render: formatMonth },
    { title: 'Projected BOH', dataIndex: 'currentBoh', align: 'right', render: formatInt },
    { title: 'Projected', dataIndex: 'currentProjSales', align: 'right', render: formatInt },
    { title: 'Target', dataIndex: 'currentEohTarget', align: 'right', render: formatInt },
    { title: 'Baseline buy', dataIndex: 'baselineBuy', align: 'right', render: formatInt },
    { title: 'Current buy', dataIndex: 'currentBuy', align: 'right', render: (value: number) => <Text strong>{formatInt(value)}</Text> },
    { title: 'EOH', dataIndex: 'currentEohActual', align: 'right', render: formatInt },
    {
      title: 'Norm',
      dataIndex: 'normalizationFactor',
      align: 'right',
      render: (value: number | null) => value == null ? '-' : `${pctFmt.format(value * 100)}%`,
    },
  ], [])

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

  return (
    <div>
      {contextHolder}
      <Title level={2} style={{ marginBottom: 0 }}>Purchase Planning</Title>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        Saved chain and department seasonal buying plans. Quantities are units; Purchasing remains separate for vendor and item selection.
      </Paragraph>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={8}>
          <Card title="Seasonal report">
            <Form<SeasonalReportForm>
              name="seasonalReport"
              form={reportForm}
              layout="vertical"
              initialValues={{
                year: dayjs().year(),
                forecastMethod: 'holtWinters',
                eohMethod: 'forward',
                coverMonths: 3,
                discountNormalization: true,
              }}
              onFinish={(values) => seasonalReportMutation.mutate(values)}
            >
              <Form.Item label="Report chain" name="storeGroupCode" rules={[{ required: true, message: 'Select a chain' }]}>
                <Select
                  loading={chainsLoading}
                  options={chains.map((chain) => ({
                    value: chain.id,
                    label: `${chain.label} (${chain.storeCount})`,
                    disabled: !chain.active || chain.storeCount === 0,
                  }))}
                />
              </Form.Item>
              <Row gutter={12}>
                <Col span={14}>
                  <Form.Item label="Report department" name="departmentNumber" rules={[{ required: true, message: 'Select a department' }]}>
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
                <Col span={10}>
                  <Form.Item label="Year" name="year" rules={[{ required: true }]}>
                    <InputNumber min={2020} max={2100} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={14}>
                  <Form.Item label="Forecast" name="forecastMethod">
                    <Select options={FORECAST_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item label="EOH" name="eohMethod">
                    <Select options={EOH_OPTIONS} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12} align="middle">
                <Col span={12}>
                  <Form.Item label="Cover months" name="coverMonths">
                    <InputNumber min={1} max={12} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Normalize discounts" name="discountNormalization" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>
              <Button type="primary" htmlType="submit" loading={seasonalReportMutation.isPending} block>
                Generate report
              </Button>
            </Form>
          </Card>

          <Card title="Create seasonal plan" style={{ marginTop: 16 }}>
            <Form<CreatePlanForm>
              name="createSeasonalPlan"
              form={form}
              layout="vertical"
              initialValues={{
                season: 'spring',
                seasonYear: dayjs().year(),
                forecastMethod: 'holtWinters',
                eohMethod: 'forward',
                coverMonths: 3,
                discountNormalization: true,
              }}
              onFinish={(values) => createMutation.mutate(values)}
            >
              <Form.Item label="Plan label" name="label">
                <Input placeholder="Optional" maxLength={200} />
              </Form.Item>
              <Form.Item label="Chain" name="storeGroupCode" rules={[{ required: true, message: 'Select a chain' }]}>
                <Select
                  loading={chainsLoading}
                  options={chains.map((chain) => ({
                    value: chain.id,
                    label: `${chain.label} (${chain.storeCount})`,
                    disabled: !chain.active || chain.storeCount === 0,
                  }))}
                />
              </Form.Item>
              <Row gutter={12}>
                <Col span={14}>
                  <Form.Item label="Season" name="season" rules={[{ required: true }]}>
                    <Select options={SEASONS} />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item label="Year" name="seasonYear" rules={[{ required: true }]}>
                    <InputNumber min={2020} max={2100} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="Departments" name="departmentNumbers" rules={[{ required: true, message: 'Select at least one department' }]}>
                <Select
                  mode="multiple"
                  loading={departmentsLoading}
                  optionFilterProp="label"
                  maxTagCount="responsive"
                  options={departments.map((department) => ({
                    value: department.number,
                    label: `${department.number} - ${department.description}`,
                  }))}
                />
              </Form.Item>
              <Row gutter={12}>
                <Col span={14}>
                  <Form.Item label="Forecast" name="forecastMethod">
                    <Select options={FORECAST_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item label="EOH" name="eohMethod">
                    <Select options={EOH_OPTIONS} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12} align="middle">
                <Col span={12}>
                  <Form.Item label="Cover months" name="coverMonths">
                    <InputNumber min={1} max={12} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Normalize discounts" name="discountNormalization" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>
              <Button type="primary" htmlType="submit" loading={createMutation.isPending} block>
                Save plan
              </Button>
            </Form>
          </Card>

          <Card title="Saved draft plans" style={{ marginTop: 16 }}>
            <Table<SavedPurchasePlanListItem>
              dataSource={plans.data ?? []}
              columns={planColumns}
              rowKey="id"
              size="small"
              loading={plans.isLoading}
              pagination={{ pageSize: 8 }}
            />
          </Card>
        </Col>

        <Col xs={24} xl={16}>
          {seasonalReport ? (
            <Card
              title={`${seasonalReport.storeGroupLabel ?? seasonalReport.storeGroupCode} ${seasonalReport.departmentLabel} ${seasonalReport.year}`}
              style={{ marginBottom: 16 }}
              extra={<Text type="secondary">Units and HNL cost</Text>}
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
                {seasonalReport.seasons.map((season) => (
                  <Button key={season.planId} size="small" onClick={() => setSelectedPlanId(season.planId)}>
                    Open {season.seasonLabel} worksheet
                  </Button>
                ))}
              </Space>
            </Card>
          ) : null}

          {detail.error ? (
            <Alert
              type="error"
              message="Could not load plan"
              description={detail.error instanceof Error ? detail.error.message : String(detail.error)}
              style={{ marginBottom: 16 }}
            />
          ) : null}

          {!selectedPlanId ? (
            <Empty description="Create or select a saved plan." image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 56 }} />
          ) : selectedPlan ? (
            <Card
              title={selectedPlan.plan.label}
              extra={(
                <Space>
                  <Tag>{selectedPlan.plan.storeGroupLabel ?? selectedPlan.plan.storeGroupCode}</Tag>
                  <Tag>{selectedPlan.plan.season} {selectedPlan.plan.seasonYear}</Tag>
                  <Button onClick={() => recalculateMutation.mutate(selectedPlan.plan.id)} loading={recalculateMutation.isPending}>
                    Recalculate
                  </Button>
                  <Button danger onClick={() => archiveMutation.mutate(selectedPlan.plan.id)} loading={archiveMutation.isPending}>
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
                  <Title level={4} style={{ margin: 0 }}>{formatInt(selectedPlan.totals.baselineTotalBuy)}</Title>
                </Col>
                <Col xs={24} sm={8}>
                  <Text type="secondary">Current buy</Text>
                  <Title level={4} style={{ margin: 0 }}>{formatInt(selectedPlan.totals.currentTotalBuy)}</Title>
                </Col>
                <Col xs={24} sm={8}>
                  <Text type="secondary">Adjusted delta</Text>
                  <Title level={4} style={{ margin: 0 }}>{selectedPlan.totals.deltaBuy > 0 ? '+' : ''}{formatInt(selectedPlan.totals.deltaBuy)}</Title>
                </Col>
              </Row>
              <Table<SavedPurchasePlanDepartment>
                dataSource={selectedPlan.departments}
                columns={departmentColumns}
                rowKey="departmentKey"
                size="small"
                loading={detail.isFetching}
                pagination={false}
                scroll={{ x: 'max-content' }}
                expandable={{
                  expandedRowRender: (row) => (
                    <Table<SavedPurchasePlanRow>
                      dataSource={row.months}
                      columns={monthColumns}
                      rowKey="id"
                      size="small"
                      pagination={false}
                    />
                  ),
                }}
              />
            </Card>
          ) : (
            <Card loading />
          )}
        </Col>
      </Row>

      <Modal
        title={adjustmentTarget ? `Adjust ${adjustmentTarget.departmentLabel}` : 'Adjust department'}
        open={!!adjustmentTarget}
        onCancel={() => setAdjustmentTarget(null)}
        onOk={() => adjustmentForm.submit()}
        confirmLoading={adjustmentMutation.isPending}
        forceRender
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
