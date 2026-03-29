import { useState, useCallback, useMemo } from 'react'
import {
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
import {
  useSalesPerformanceByDepartment,
  useSalesPerformanceDrillDown,
} from '../../hooks/useReports'
import { getSalesPerformanceCsvUrl } from '../../services/reportApi'
import type {
  SalesDepartmentSummary,
  SalesCategorySummary,
  SalesDetail,
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

export default function SalesReportPage() {
  const [dateRange, setDateRange] = useState<[string, string]>(() => {
    const end = dayjs()
    const start = end.subtract(30, 'day')
    return [start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')]
  })
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)

  const { data: deptData, isLoading: deptLoading } = useSalesPerformanceByDepartment(
    dateRange[0],
    dateRange[1],
  )
  const { data: drillData, isLoading: drillLoading } = useSalesPerformanceDrillDown(
    dateRange[0],
    dateRange[1],
    selectedDepartment ?? '',
    selectedCategory ?? undefined,
  )

  const handleDateChange = useCallback(
    (_: unknown, dateStrings: [string, string]) => {
      if (dateStrings[0] && dateStrings[1]) {
        setDateRange(dateStrings)
        setSelectedDepartment(null)
        setSelectedCategory(null)
      }
    },
    [],
  )

  const handleDepartmentClick = useCallback((dept: string) => {
    setSelectedDepartment(dept)
    setSelectedCategory(null)
  }, [])

  const handleCategoryClick = useCallback((cat: number) => {
    setSelectedCategory(cat)
  }, [])

  const handleBack = useCallback(() => {
    if (selectedCategory != null) {
      setSelectedCategory(null)
    } else {
      setSelectedDepartment(null)
    }
  }, [selectedCategory])

  const handleExportCsv = useCallback(() => {
    const url = getSalesPerformanceCsvUrl(
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

  const detailColumns = [
    { title: 'SKU Code', dataIndex: 'skuCode', key: 'skuCode', width: 200, ellipsis: true },
    { title: 'Brand', dataIndex: 'brand', key: 'brand', width: 120 },
    { title: 'Style', dataIndex: 'style', key: 'style', width: 100 },
    { title: 'Color', dataIndex: 'color', key: 'color', width: 100 },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 70 },
    { title: 'Category', dataIndex: 'category', key: 'category', width: 90 },
    {
      title: 'Units Sold',
      dataIndex: 'totalUnitsSold',
      key: 'totalUnitsSold',
      width: 100,
      align: 'right' as const,
      sorter: (a: SalesDetail, b: SalesDetail) => a.totalUnitsSold - b.totalUnitsSold,
    },
    {
      title: 'Revenue',
      dataIndex: 'totalRevenue',
      key: 'totalRevenue',
      width: 110,
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: (a: SalesDetail, b: SalesDetail) => a.totalRevenue - b.totalRevenue,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Avg Price',
      dataIndex: 'avgSellingPrice',
      key: 'avgSellingPrice',
      width: 100,
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
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
            <Table<SalesDetail>
              dataSource={drillData?.details}
              columns={detailColumns}
              rowKey="skuId"
              size="small"
              scroll={{ x: 1060 }}
              pagination={{
                pageSize: 50,
                showSizeChanger: true,
                pageSizeOptions: ['25', '50', '100'],
              }}
            />
          </Card>
        </>
      )}
    </Space>
  )
}
