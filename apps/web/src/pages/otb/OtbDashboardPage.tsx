import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Card, Col, InputNumber, Row, Select, Space, Statistic, Tag, Typography } from 'antd'
import { WarningOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import ServerDataTable, { type ServerQueryChange, type ServerTableColumn } from '../../components/ServerDataTable'
import { useOtbDashboardPlans, useOtbDashboardRows, useOtbDashboardSummary } from '../../hooks/useOtbDashboard'
import { useDepartments } from '../../hooks/useProductsTaxonomy'
import { getErrorMessage } from '../../utils/errors'
import type { OtbTrendPoint } from '../../types/otb'
import type { OtbDashboardRow, OtbDashboardRowsParams } from '../../types/otbDashboard'

const WeeklyBudgetVsActualChart = lazy(() => import('../../components/charts/WeeklyBudgetVsActualChart'))
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Date(2024, index, 1).toLocaleString('en-US', { month: 'long' }),
}))

type DashboardTableParams = Omit<OtbDashboardRowsParams, 'planId'>

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function formatUnits(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString('en-US')
}

function formatDepartment(row: OtbDashboardRow): string {
  if (row.departmentNumber == null) return row.departmentLabel || 'Unmapped'
  const label = row.departmentLabel.trim()
  if (!label) return String(row.departmentNumber)
  if (label === String(row.departmentNumber)) return label
  if (label.startsWith(`${row.departmentNumber} `) || label.startsWith(`${row.departmentNumber} -`)) return label
  return `${row.departmentNumber} - ${label}`
}

function currentYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export default function OtbDashboardPage() {
  const [searchParams] = useSearchParams()
  const initialDate = useMemo(() => new Date(), [])
  const initialPlanId = searchParams.get('planId') ?? undefined
  const initialDepartmentNumber = parsePositiveInteger(
    searchParams.get('departmentNumber') ?? searchParams.get('department'),
  )

  const [selectedPlanId, setSelectedPlanId] = useState<string | undefined>(initialPlanId)
  const [params, setParams] = useState<DashboardTableParams>({
    page: 1,
    pageSize: 100,
    sort: 'openToBuyUnits',
    order: 'asc',
    year: initialDate.getFullYear(),
    month: initialDate.getMonth() + 1,
    departmentNumber: initialDepartmentNumber,
  })

  const {
    data: plansData,
    isLoading: plansLoading,
    error: plansError,
  } = useOtbDashboardPlans({ status: 'all' })
  const {
    data: departments = [],
    isLoading: departmentsLoading,
    error: departmentsError,
  } = useDepartments()

  const plans = plansData?.plans ?? []
  useEffect(() => {
    if (selectedPlanId || plans.length === 0) return
    const currentMonth = currentYearMonth(initialDate)
    const newestDraftCoveringCurrentMonth = plans.find(
      (plan) => plan.status === 'draft' && plan.seasonMonths.includes(currentMonth),
    )
    const newestDraft = plans.find((plan) => plan.status === 'draft')
    setSelectedPlanId((newestDraftCoveringCurrentMonth ?? newestDraft ?? plans[0])?.id)
  }, [initialDate, plans, selectedPlanId])

  const summaryParams = useMemo(
    () =>
      selectedPlanId
        ? {
            planId: selectedPlanId,
            year: params.year,
            month: params.month,
            departmentNumber: params.departmentNumber,
          }
        : undefined,
    [params.departmentNumber, params.month, params.year, selectedPlanId],
  )

  const rowsParams = useMemo(
    () => (selectedPlanId ? { ...params, planId: selectedPlanId } : undefined),
    [params, selectedPlanId],
  )

  const {
    data: summaryData,
    isLoading: summaryLoading,
    error: summaryError,
  } = useOtbDashboardSummary(summaryParams)
  const {
    data: rowData,
    isLoading: rowsLoading,
    isFetching: rowsFetching,
    error: rowsError,
  } = useOtbDashboardRows(rowsParams)

  const planOptions = useMemo(
    () =>
      plans.map((plan) => ({
        value: plan.id,
        label: `${plan.label} (${plan.planningScopeLabel})`,
      })),
    [plans],
  )

  const departmentOptions = useMemo(
    () =>
      departments.map((department) => ({
        value: department.number,
        label: `${department.number} - ${department.description}`,
      })),
    [departments],
  )

  const dataErrorMessage =
    plansError != null
      ? getErrorMessage(plansError, 'Unable to load saved purchase plans.')
      : departmentsError != null
        ? getErrorMessage(departmentsError, 'Unable to load taxonomy departments.')
        : rowsError != null
          ? getErrorMessage(rowsError, 'Unable to load OTB dashboard rows.')
          : summaryError != null
            ? getErrorMessage(summaryError, 'Unable to load OTB dashboard summary.')
            : null

  const totals = summaryData?.totals ?? {
    plannedBuyUnits: 0,
    projectedSalesUnits: 0,
    committedUnits: 0,
    stockPositionUnits: 0,
    openToBuyUnits: 0,
    rowCount: 0,
  }

  const chartPoints: OtbTrendPoint[] = useMemo(
    () =>
      (summaryData?.trend ?? []).map((point) => ({
        weekLabel: point.periodLabel,
        budgetAmount: point.plannedBuyUnits,
        actualAmount: point.committedUnits,
      })),
    [summaryData],
  )

  const handleQueryChange = useCallback((query: ServerQueryChange) => {
    setParams((prev) => ({
      ...prev,
      page: query.page,
      pageSize: query.pageSize,
      sort: (query.sort as DashboardTableParams['sort']) ?? prev.sort,
      order: query.order ?? prev.order,
    }))
  }, [])

  const columns: ServerTableColumn<OtbDashboardRow>[] = [
    {
      title: 'Month',
      dataIndex: 'yearMonth',
      key: 'yearMonth',
      width: 110,
      sorter: true,
    },
    {
      title: 'Department',
      dataIndex: 'departmentNumber',
      key: 'departmentNumber',
      width: 230,
      sorter: true,
      render: (_value, record) => <Tag color="blue">{formatDepartment(record)}</Tag>,
      exportValue: (record) => formatDepartment(record),
    },
    {
      title: 'Planned Buy Units',
      dataIndex: 'plannedBuyUnits',
      key: 'plannedBuyUnits',
      width: 150,
      align: 'right',
      sorter: true,
      render: (value: number) => formatUnits(value),
    },
    {
      title: 'Projected Sales Units',
      dataIndex: 'projectedSalesUnits',
      key: 'projectedSalesUnits',
      width: 165,
      align: 'right',
      sorter: true,
      render: (value: number) => formatUnits(value),
    },
    {
      title: 'Current On Order Units',
      dataIndex: 'currentOnOrderUnits',
      key: 'currentOnOrderUnits',
      width: 180,
      align: 'right',
      sorter: true,
      render: (value: number) => formatUnits(value),
    },
    {
      title: 'Future On Order Units',
      dataIndex: 'futureOnOrderUnits',
      key: 'futureOnOrderUnits',
      width: 175,
      align: 'right',
      sorter: true,
      render: (value: number) => formatUnits(value),
    },
    {
      title: 'Native Open PO Units',
      dataIndex: 'nativeOpenPoUnits',
      key: 'nativeOpenPoUnits',
      width: 170,
      align: 'right',
      sorter: true,
      render: (value: number) => formatUnits(value),
    },
    {
      title: 'Committed Units',
      dataIndex: 'committedUnits',
      key: 'committedUnits',
      width: 145,
      align: 'right',
      sorter: true,
      render: (value: number) => formatUnits(value),
    },
    {
      title: 'Stock Position Units',
      dataIndex: 'stockPositionUnits',
      key: 'stockPositionUnits',
      width: 165,
      align: 'right',
      sorter: true,
      render: (value: number) => formatUnits(value),
    },
    {
      title: 'Open To Buy Units',
      dataIndex: 'openToBuyUnits',
      key: 'openToBuyUnits',
      width: 155,
      align: 'right',
      sorter: true,
      render: (value: number) =>
        value < 0 ? <Typography.Text type="danger">{formatUnits(value)}</Typography.Text> : formatUnits(value),
    },
  ]

  const noPlansAvailable = !plansLoading && plans.length === 0

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {dataErrorMessage && (
        <Alert
          type="error"
          showIcon
          message="OTB data request failed"
          description={dataErrorMessage}
        />
      )}
      {noPlansAvailable && (
        <Alert
          type="info"
          showIcon
          message="No saved purchase plans are available for the dashboard."
        />
      )}
      <Card size="small">
        <Row gutter={[12, 12]}>
          <Col span={24}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              OTB Saved Plan Dashboard
            </Typography.Title>
            <Typography.Text type="secondary">
              Saved buyer workbook units from purchase planning.
            </Typography.Text>
          </Col>
          <Col xs={24} lg={10}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Saved Plan
            </Typography.Text>
            <Select
              showSearch
              placeholder="Select saved plan"
              style={{ width: '100%' }}
              value={selectedPlanId}
              loading={plansLoading}
              disabled={plansLoading || plans.length === 0}
              onChange={(value) => {
                setSelectedPlanId(value)
                setParams((prev) => ({ ...prev, page: 1 }))
              }}
              optionFilterProp="label"
              options={planOptions}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Year
            </Typography.Text>
            <InputNumber
              min={2020}
              max={2100}
              style={{ width: '100%' }}
              value={params.year}
              onChange={(value) =>
                setParams((prev) => ({
                  ...prev,
                  year: value == null ? undefined : Number(value),
                  page: 1,
                }))
              }
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Month
            </Typography.Text>
            <Select
              allowClear
              placeholder="All months"
              style={{ width: '100%' }}
              value={params.month}
              onChange={(value) =>
                setParams((prev) => ({
                  ...prev,
                  month: value as number | undefined,
                  page: 1,
                }))
              }
              options={MONTH_OPTIONS}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Department
            </Typography.Text>
            <Select
              allowClear
              showSearch
              placeholder="All departments"
              style={{ width: '100%' }}
              value={params.departmentNumber}
              loading={departmentsLoading}
              onChange={(value) =>
                setParams((prev) => ({
                  ...prev,
                  departmentNumber: value as number | undefined,
                  page: 1,
                }))
              }
              optionFilterProp="label"
              options={departmentOptions}
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Planned Buy Units"
              value={totals.plannedBuyUnits}
              loading={summaryLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Projected Sales Units"
              value={totals.projectedSalesUnits}
              loading={summaryLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Committed PO Units"
              value={totals.committedUnits}
              loading={summaryLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Open To Buy Units"
              value={totals.openToBuyUnits}
              prefix={totals.openToBuyUnits < 0 ? <WarningOutlined /> : undefined}
              loading={summaryLoading}
              valueStyle={{ color: totals.openToBuyUnits < 0 ? '#cf1322' : '#1677ff' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Monthly Planned Buy vs Committed Units">
        <Suspense fallback={<Typography.Text type="secondary">Loading chart...</Typography.Text>}>
          <WeeklyBudgetVsActualChart
            points={chartPoints}
            budgetLabel="Planned Buy Units"
            actualLabel="Committed Units"
          />
        </Suspense>
      </Card>

      <Card size="small">
        <ServerDataTable<OtbDashboardRow>
          title={<Typography.Text strong>Saved Plan Rows</Typography.Text>}
          data={rowData?.data}
          columns={columns}
          rowKey="id"
          loading={rowsLoading}
          fetching={rowsFetching}
          pagination={rowData?.pagination}
          onQueryChange={handleQueryChange}
          expectedTotalRows={rowData?.pagination.totalItems}
          exportFileName={`otb-dashboard-${new Date().toISOString().slice(0, 10)}`}
          scrollX={1710}
        />
      </Card>
    </Space>
  )
}
