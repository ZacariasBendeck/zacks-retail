import { useState, useCallback, useMemo } from 'react'
import {
  Alert,
  Card,
  Row,
  Col,
  Table,
  Button,
  Space,
  Statistic,
  Tag,
  Typography,
  Spin,
  Breadcrumb,
  DatePicker,
  Empty,
} from 'antd'
import {
  DownloadOutlined,
  ArrowLeftOutlined,
  DollarOutlined,
  ShoppingCartOutlined,
  BarChartOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useSearchParams } from 'react-router-dom'
import {
  useSalesPerformanceByDepartment,
  useSalesPerformanceDrillDown,
} from '../../hooks/useReports'
import { getSalesPerformanceCsvUrl, getSalesPerformanceXlsxUrl } from '../../services/reportApi'
import { validateDomainFilterContract } from '../../services/domainFilterContract'
import ServerDataTable, {
  type ServerQueryChange,
  type ServerTableColumn,
} from '../../components/ServerDataTable'
import { getErrorMessage } from '../../utils/errors'
import type {
  SalesDepartmentSummary,
  SalesCategorySummary,
  SalesDetail,
  ReportDetailQuery,
} from '../../services/reportApi'
import type { Department } from '../../types/sku'

const { RangePicker } = DatePicker

const DEPARTMENT_COLORS: Record<Department, string> = {
  FORMAL: '#1677ff',
  CASUAL: '#52c41a',
  FIESTA: '#eb2f96',
  SANDALIAS: '#fa8c16',
  BOOTS: '#fa541c',
  COMFORT: '#13c2c2',
}

const DEFAULT_DETAIL_QUERY: ReportDetailQuery = {
  page: 1,
  pageSize: 50,
  sort: 'totalRevenue',
  order: 'desc',
}

export default function SalesReportPage() {
  const [searchParams] = useSearchParams()
  const initialDepartment = searchParams.get('department')
  const initialDepartmentValue =
    initialDepartment != null && initialDepartment in DEPARTMENT_COLORS
      ? initialDepartment
      : null

  const [dateRange, setDateRange] = useState<[string, string]>(() => {
    const end = dayjs()
    const start = end.subtract(30, 'day')
    return [start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
  })
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(initialDepartmentValue)
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [detailQuery, setDetailQuery] = useState<ReportDetailQuery>(DEFAULT_DETAIL_QUERY)

  const { data: deptData, isLoading: deptLoading, error: deptError } = useSalesPerformanceByDepartment(
    dateRange[0],
    dateRange[1],
  )
  const { data: drillData, isLoading: drillLoading, error: drillError } = useSalesPerformanceDrillDown(
    dateRange[0],
    dateRange[1],
    selectedDepartment ?? '',
    selectedCategory ?? undefined,
    detailQuery,
  )

  const filterValidation = useMemo(
    () =>
      validateDomainFilterContract(
        { department: selectedDepartment, category: selectedCategory },
        { requireDepartmentForCategory: true },
      ),
    [selectedCategory, selectedDepartment],
  )

  const reportErrorMessage = selectedDepartment
    ? drillError
      ? getErrorMessage(drillError, 'Unable to load sales drill-down report.')
      : null
    : deptError
      ? getErrorMessage(deptError, 'Unable to load sales department summary.')
      : null

  const handleDateChange = useCallback(
    (_: unknown, dateStrings: [string, string]) => {
      if (dateStrings[0] && dateStrings[1]) {
        setDateRange(dateStrings)
        setSelectedDepartment(null)
        setSelectedCategory(null)
        setDetailQuery(DEFAULT_DETAIL_QUERY)
      }
    },
    [],
  )

  const handleDepartmentClick = useCallback((dept: string) => {
    setSelectedDepartment(dept)
    setSelectedCategory(null)
    setDetailQuery(DEFAULT_DETAIL_QUERY)
  }, [])

  const handleCategoryClick = useCallback((cat: number) => {
    setSelectedCategory(cat)
    setDetailQuery((prev) => ({ ...prev, page: 1 }))
  }, [])

  const handleBack = useCallback(() => {
    if (selectedCategory != null) {
      setSelectedCategory(null)
      setDetailQuery((prev) => ({ ...prev, page: 1 }))
    } else {
      setSelectedDepartment(null)
      setDetailQuery(DEFAULT_DETAIL_QUERY)
    }
  }, [selectedCategory])

  const handleDetailQueryChange = useCallback((query: ServerQueryChange) => {
    setDetailQuery((prev) => ({
      ...prev,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort ?? prev.sort,
      order: query.order ?? prev.order,
    }))
  }, [])

  const handleExportCsv = useCallback(() => {
    const url = getSalesPerformanceCsvUrl(
      dateRange[0],
      dateRange[1],
      selectedDepartment ?? undefined,
      selectedCategory ?? undefined,
    )
    window.open(url, '_blank')
  }, [dateRange, selectedDepartment, selectedCategory])

  const handleExportXlsx = useCallback(() => {
    const url = getSalesPerformanceXlsxUrl(
      dateRange[0],
      dateRange[1],
      selectedDepartment ?? undefined,
      selectedCategory ?? undefined,
    )
    window.open(url, '_blank')
  }, [dateRange, selectedDepartment, selectedCategory])

  const totals = useMemo(() => {
    const depts = deptData?.departments ?? []
    return {
      totalUnitsSold: depts.reduce((s, d) => s + d.totalUnitsSold, 0),
      totalRevenue: depts.reduce((s, d) => s + d.totalRevenue, 0),
      avgSellingPrice:
        depts.length > 0
          ? depts.reduce((s, d) => s + d.totalRevenue, 0) /
            Math.max(depts.reduce((s, d) => s + d.totalUnitsSold, 0), 1)
          : 0,
    }
  }, [deptData])

  const departmentColumns = [
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      render: (dept: string) => (
        <Tag color={DEPARTMENT_COLORS[dept as Department]}>{dept}</Tag>
      ),
      sorter: (a: SalesDepartmentSummary, b: SalesDepartmentSummary) =>
        a.department.localeCompare(b.department),
    },
    {
      title: 'Units Sold',
      dataIndex: 'totalUnitsSold',
      key: 'totalUnitsSold',
      align: 'right' as const,
      sorter: (a: SalesDepartmentSummary, b: SalesDepartmentSummary) =>
        a.totalUnitsSold - b.totalUnitsSold,
    },
    {
      title: 'Total Revenue',
      dataIndex: 'totalRevenue',
      key: 'totalRevenue',
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: (a: SalesDepartmentSummary, b: SalesDepartmentSummary) =>
        a.totalRevenue - b.totalRevenue,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Avg Selling Price',
      dataIndex: 'avgSellingPrice',
      key: 'avgSellingPrice',
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: (a: SalesDepartmentSummary, b: SalesDepartmentSummary) =>
        a.avgSellingPrice - b.avgSellingPrice,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: SalesDepartmentSummary) => (
        <Button type="link" size="small" onClick={() => handleDepartmentClick(record.department)}>
          Drill Down
        </Button>
      ),
    },
  ]

  const categoryColumns = [
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      sorter: (a: SalesCategorySummary, b: SalesCategorySummary) => a.category - b.category,
    },
    {
      title: 'Units Sold',
      dataIndex: 'totalUnitsSold',
      key: 'totalUnitsSold',
      align: 'right' as const,
      sorter: (a: SalesCategorySummary, b: SalesCategorySummary) =>
        a.totalUnitsSold - b.totalUnitsSold,
    },
    {
      title: 'Total Revenue',
      dataIndex: 'totalRevenue',
      key: 'totalRevenue',
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: (a: SalesCategorySummary, b: SalesCategorySummary) =>
        a.totalRevenue - b.totalRevenue,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Avg Selling Price',
      dataIndex: 'avgSellingPrice',
      key: 'avgSellingPrice',
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: (a: SalesCategorySummary, b: SalesCategorySummary) =>
        a.avgSellingPrice - b.avgSellingPrice,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: SalesCategorySummary) => (
        <Button type="link" size="small" onClick={() => handleCategoryClick(record.category)}>
          View Details
        </Button>
      ),
    },
  ]

  const sortOrder = useCallback(
    (field: string) => {
      if (detailQuery.sort !== field) return undefined
      return detailQuery.order === 'asc' ? ('ascend' as const) : ('descend' as const)
    },
    [detailQuery.order, detailQuery.sort],
  )

  const detailColumns: ServerTableColumn<SalesDetail>[] = [
    {
      title: 'SKU Code',
      dataIndex: 'skuCode',
      key: 'skuCode',
      width: 200,
      ellipsis: true,
      sorter: true,
      sortOrder: sortOrder('skuCode'),
    },
    {
      title: 'Brand',
      dataIndex: 'brand',
      key: 'brand',
      width: 120,
      sorter: true,
      sortOrder: sortOrder('brand'),
    },
    {
      title: 'Style',
      dataIndex: 'style',
      key: 'style',
      width: 100,
      sorter: true,
      sortOrder: sortOrder('style'),
    },
    { title: 'Color', dataIndex: 'color', key: 'color', width: 100 },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 70 },
    { title: 'Category', dataIndex: 'category', key: 'category', width: 90 },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      width: 120,
      sorter: true,
      sortOrder: sortOrder('department'),
    },
    {
      title: 'Units Sold',
      dataIndex: 'totalUnitsSold',
      key: 'totalUnitsSold',
      width: 100,
      align: 'right' as const,
      sorter: true,
      sortOrder: sortOrder('totalUnitsSold'),
    },
    {
      title: 'Revenue',
      dataIndex: 'totalRevenue',
      key: 'totalRevenue',
      width: 110,
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: true,
      sortOrder: sortOrder('totalRevenue'),
    },
    {
      title: 'Avg Price',
      dataIndex: 'avgSellingPrice',
      key: 'avgSellingPrice',
      width: 100,
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: true,
      sortOrder: sortOrder('avgSellingPrice'),
    },
  ]

  const breadcrumbItems = [{ title: 'All Departments' }]
  if (selectedDepartment) {
    breadcrumbItems.push({ title: selectedDepartment })
  }
  if (selectedCategory != null) {
    breadcrumbItems.push({ title: `Category ${selectedCategory}` })
  }

  const isLoading = selectedDepartment ? drillLoading : deptLoading
  const hasData = selectedDepartment
    ? (drillData?.details?.length ?? 0) > 0 || (drillData?.categories?.length ?? 0) > 0
    : (deptData?.departments?.length ?? 0) > 0

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {filterValidation.errors.length > 0 && (
        <Alert
          type="error"
          showIcon
          message="Invalid report filter selection"
          description={filterValidation.errors.join(' ')}
        />
      )}
      {reportErrorMessage && (
        <Alert
          type="error"
          showIcon
          message="Sales report request failed"
          description={reportErrorMessage}
        />
      )}
      {/* Header */}
      <Card size="small">
        <Row align="middle" justify="space-between">
          <Col>
            <Space>
              {selectedDepartment && (
                <Button icon={<ArrowLeftOutlined />} size="small" onClick={handleBack} />
              )}
              <Typography.Title level={4} style={{ margin: 0 }}>
                Sales Performance Report
              </Typography.Title>
            </Space>
          </Col>
          <Col>
            <Space>
              <RangePicker
                value={[dayjs(dateRange[0]), dayjs(dateRange[1])]}
                onChange={handleDateChange}
                allowClear={false}
              />
              <Button icon={<DownloadOutlined />} onClick={handleExportCsv}>
                Export CSV
              </Button>
              <Button icon={<DownloadOutlined />} onClick={handleExportXlsx}>
                Export XLSX
              </Button>
            </Space>
          </Col>
        </Row>
        <Breadcrumb style={{ marginTop: 8 }} items={breadcrumbItems} />
      </Card>

      {/* Summary KPIs (top-level only) */}
      {!selectedDepartment && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Units Sold"
                value={totals.totalUnitsSold}
                prefix={<ShoppingCartOutlined />}
                loading={deptLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Revenue"
                value={totals.totalRevenue}
                prefix={<DollarOutlined />}
                precision={2}
                loading={deptLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Avg Selling Price"
                value={totals.avgSellingPrice}
                prefix={<BarChartOutlined />}
                precision={2}
                loading={deptLoading}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Content */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : !hasData ? (
        <Card>
          <Empty description="No sales data found for the selected period." />
        </Card>
      ) : !selectedDepartment ? (
        <Card title="Sales by Department">
          <Table<SalesDepartmentSummary>
            dataSource={deptData?.departments}
            columns={departmentColumns}
            rowKey="department"
            pagination={false}
            size="middle"
            summary={(data) => {
              const totalUnits = data.reduce((s, r) => s + r.totalUnitsSold, 0)
              const totalRev = data.reduce((s, r) => s + r.totalRevenue, 0)
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <Typography.Text strong>Total</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <Typography.Text strong>{totalUnits}</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <Typography.Text strong>${totalRev.toFixed(2)}</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <Typography.Text strong>
                      ${totalUnits > 0 ? (totalRev / totalUnits).toFixed(2) : '0.00'}
                    </Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} />
                </Table.Summary.Row>
              )
            }}
          />
        </Card>
      ) : (
        <>
          {selectedCategory == null && drillData?.categories && (
            <Card title={`Categories in ${selectedDepartment}`}>
              <Table<SalesCategorySummary>
                dataSource={drillData.categories}
                columns={categoryColumns}
                rowKey="category"
                pagination={false}
                size="middle"
                summary={(data) => {
                  const totalUnits = data.reduce((s, r) => s + r.totalUnitsSold, 0)
                  const totalRev = data.reduce((s, r) => s + r.totalRevenue, 0)
                  return (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0}>
                        <Typography.Text strong>Subtotal</Typography.Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        <Typography.Text strong>{totalUnits}</Typography.Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right">
                        <Typography.Text strong>${totalRev.toFixed(2)}</Typography.Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={3} align="right">
                        <Typography.Text strong>
                          ${totalUnits > 0 ? (totalRev / totalUnits).toFixed(2) : '0.00'}
                        </Typography.Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={4} />
                    </Table.Summary.Row>
                  )
                }}
              />
            </Card>
          )}

          <Card
            title={
              selectedCategory != null
                ? `Detail: ${selectedDepartment} / Category ${selectedCategory}`
                : `All Sales in ${selectedDepartment}`
            }
          >
            <ServerDataTable<SalesDetail>
              title={<Typography.Text strong>Detail Rows</Typography.Text>}
              data={drillData?.details}
              columns={detailColumns}
              rowKey="skuId"
              pagination={drillData?.pagination}
              onQueryChange={handleDetailQueryChange}
              expectedTotalRows={drillData?.pagination.totalItems}
              exportFileName={`sales-performance-details-${new Date().toISOString().slice(0, 10)}`}
              scrollX={1220}
            />
          </Card>
        </>
      )}
    </Space>
  )
}
