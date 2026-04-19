import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { Alert, Card, Col, Input, InputNumber, Row, Select, Space, Statistic, Tag, Typography } from 'antd'
import { DollarOutlined, WarningOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import ServerDataTable, { type ServerQueryChange, type ServerTableColumn } from '../../components/ServerDataTable'
import { useOtbLines, useOtbSummary } from '../../hooks/useOtb'
import { ALLOWED_DEPARTMENTS, CATEGORY_MAX, CATEGORY_MIN } from '../../constants/domain'
import { validateDomainFilterContract } from '../../services/domainFilterContract'
import { getErrorMessage } from '../../utils/errors'
import type { Department } from '../../types/sku'
import type { OtbLine, OtbLineParams } from '../../types/otb'

const WeeklyBudgetVsActualChart = lazy(() => import('../../components/charts/WeeklyBudgetVsActualChart'))
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Date(2024, index, 1).toLocaleString('en-US', { month: 'long' }),
}))

export default function OtbDashboardPage() {
  const [searchParams] = useSearchParams()
  const preselectedDepartment = searchParams.get('department')
  const initialDepartment =
    preselectedDepartment != null && ALLOWED_DEPARTMENTS.includes(preselectedDepartment as Department)
      ? (preselectedDepartment as Department)
      : undefined

  const [params, setParams] = useState<OtbLineParams>({
    page: 1,
    pageSize: 100,
    sort: 'openToBuyUnits',
    order: 'asc',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    department: initialDepartment,
  })

  const {
    data: summaryData,
    isLoading: summaryLoading,
    error: summaryError,
  } = useOtbSummary({
    year: params.year,
    month: params.month,
    department: params.department,
  })
  const {
    data: lineData,
    isLoading: linesLoading,
    isFetching: linesFetching,
    error: linesError,
  } = useOtbLines(params)

  const filterValidation = useMemo(
    () => validateDomainFilterContract({ department: params.department, category: params.category }),
    [params.category, params.department],
  )

  const dataErrorMessage =
    linesError != null
      ? getErrorMessage(linesError, 'Unable to load OTB line data.')
      : summaryError != null
        ? getErrorMessage(summaryError, 'Unable to load OTB summary data.')
        : null

  const totals = useMemo(() => {
    const summary = summaryData?.summary ?? []
    const budgetAmount = summary.reduce((sum, row) => sum + row.budgetAmount, 0)
    const actualAmount = summary.reduce((sum, row) => sum + row.actualAmount, 0)
    const committedAmount = summary.reduce((sum, row) => sum + row.committedAmount, 0)
    const openToBuyAmount = summary.reduce((sum, row) => sum + row.openToBuyAmount, 0)
    return { budgetAmount, actualAmount, committedAmount, openToBuyAmount }
  }, [summaryData])

  const handleQueryChange = useCallback((query: ServerQueryChange) => {
    setParams((prev) => ({
      ...prev,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort ?? prev.sort,
      order: query.order ?? prev.order,
    }))
  }, [])

  const columns: ServerTableColumn<OtbLine>[] = [
    {
      title: 'SKU',
      dataIndex: 'skuCode',
      key: 'skuCode',
      width: 180,
      sorter: true,
      ellipsis: true,
    },
    {
      title: 'Style',
      dataIndex: 'style',
      key: 'style',
      width: 160,
      sorter: true,
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      width: 120,
      render: (value: Department) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      align: 'right',
      render: (value: number | null) =>
        value == null ? (
          <Typography.Text type="secondary">--</Typography.Text>
        ) : value >= CATEGORY_MIN && value <= CATEGORY_MAX ? (
          value
        ) : (
          <Typography.Text type="danger">{value}</Typography.Text>
        ),
    },
    {
      title: 'Budget Units',
      dataIndex: 'budgetUnits',
      key: 'budgetUnits',
      width: 120,
      align: 'right',
      sorter: true,
    },
    {
      title: 'Actual Units',
      dataIndex: 'actualUnits',
      key: 'actualUnits',
      width: 120,
      align: 'right',
      sorter: true,
    },
    {
      title: 'On Order Units',
      dataIndex: 'onOrderUnits',
      key: 'onOrderUnits',
      width: 130,
      align: 'right',
      sorter: true,
    },
    {
      title: 'Open To Buy Units',
      dataIndex: 'openToBuyUnits',
      key: 'openToBuyUnits',
      width: 150,
      align: 'right',
      sorter: true,
      render: (value: number) =>
        value < 0 ? <Typography.Text type="danger">{value}</Typography.Text> : value,
    },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {filterValidation.errors.length > 0 && (
        <Alert
          type="error"
          showIcon
          message="Invalid filter selection"
          description={filterValidation.errors.join(' ')}
        />
      )}
      {dataErrorMessage && (
        <Alert
          type="error"
          showIcon
          message="OTB data request failed"
          description={dataErrorMessage}
        />
      )}
      <Card size="small">
        <Row gutter={[12, 12]}>
          <Col span={24}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              OTB Budget Dashboard
            </Typography.Title>
            <Typography.Text type="secondary">
              Period, department, and category filters share the same contract as backend OTB endpoints.
            </Typography.Text>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Year
            </Typography.Text>
            <InputNumber
              min={2020}
              max={2099}
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
          <Col xs={24} sm={12} md={8} lg={4}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Department
            </Typography.Text>
            <Select
              allowClear
              placeholder="All departments"
              style={{ width: '100%' }}
              value={params.department}
              onChange={(value) =>
                setParams((prev) => ({
                  ...prev,
                  department: value as Department | undefined,
                  page: 1,
                }))
              }
              options={ALLOWED_DEPARTMENTS.map((department) => ({
                label: department,
                value: department,
              }))}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Category
            </Typography.Text>
            <InputNumber
              min={CATEGORY_MIN}
              max={CATEGORY_MAX}
              placeholder={`${CATEGORY_MIN}-${CATEGORY_MAX}`}
              style={{ width: '100%' }}
              value={params.category}
              onChange={(value) =>
                setParams((prev) => ({
                  ...prev,
                  category: value == null ? undefined : Number(value),
                  page: 1,
                }))
              }
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              SKU Contains
            </Typography.Text>
            <Input
              allowClear
              placeholder="e.g. AB123"
              value={params.skuCode}
              onChange={(event) =>
                setParams((prev) => ({
                  ...prev,
                  skuCode: event.target.value || undefined,
                  page: 1,
                }))
              }
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Style Contains
            </Typography.Text>
            <Input
              allowClear
              placeholder="e.g. Sandal"
              value={params.style}
              onChange={(event) =>
                setParams((prev) => ({
                  ...prev,
                  style: event.target.value || undefined,
                  page: 1,
                }))
              }
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Budget"
              value={totals.budgetAmount}
              prefix={<DollarOutlined />}
              precision={2}
              loading={summaryLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Actual"
              value={totals.actualAmount}
              prefix={<DollarOutlined />}
              precision={2}
              loading={summaryLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Committed"
              value={totals.committedAmount}
              prefix={<DollarOutlined />}
              precision={2}
              loading={summaryLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Open To Buy"
              value={totals.openToBuyAmount}
              prefix={totals.openToBuyAmount < 0 ? <WarningOutlined /> : <DollarOutlined />}
              precision={2}
              loading={summaryLoading}
              valueStyle={{ color: totals.openToBuyAmount < 0 ? '#cf1322' : '#1677ff' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Weekly Budget vs Actual">
        <Suspense fallback={<Typography.Text type="secondary">Loading chart...</Typography.Text>}>
          <WeeklyBudgetVsActualChart points={summaryData?.trend ?? []} />
        </Suspense>
      </Card>

      <Card size="small">
        <ServerDataTable<OtbLine>
          title={<Typography.Text strong>OTB SKU Lines</Typography.Text>}
          data={lineData?.data}
          columns={columns}
          rowKey="id"
          loading={linesLoading}
          fetching={linesFetching}
          pagination={lineData?.pagination}
          onQueryChange={handleQueryChange}
          expectedTotalRows={lineData?.pagination.totalItems}
          exportFileName={`otb-lines-${new Date().toISOString().slice(0, 10)}`}
          scrollX={1220}
        />
      </Card>
    </Space>
  )
}
