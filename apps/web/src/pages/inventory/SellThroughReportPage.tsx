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
  ShoppingCartOutlined,
  InboxOutlined,
  PercentageOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  useSellThroughByDepartment,
  useSellThroughDrillDown,
} from '../../hooks/useReports'
import { getSellThroughCsvUrl } from '../../services/reportApi'
import type {
  SellThroughDepartmentSummary,
  SellThroughCategorySummary,
  SellThroughDetail,
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

function renderSellThroughPct(v: number) {
  const color = v === 0 ? 'red' : v < 50 ? 'orange' : v < 80 ? 'blue' : 'green'
  return (
    <Tag color={color}>
      {v.toFixed(1)}%
    </Tag>
  )
}

export default function SellThroughReportPage() {
  const [dateRange, setDateRange] = useState<[string, string] | null>(null)
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)

  const { data: deptData, isLoading: deptLoading } = useSellThroughByDepartment(
    dateRange?.[0],
    dateRange?.[1],
  )
  const { data: drillData, isLoading: drillLoading } = useSellThroughDrillDown(
    selectedDepartment ?? '',
    dateRange?.[0],
    dateRange?.[1],
    selectedCategory ?? undefined,
  )

  const handleDateChange = useCallback(
    (_: unknown, dateStrings: [string, string]) => {
      if (dateStrings[0] && dateStrings[1]) {
        setDateRange(dateStrings)
        setSelectedDepartment(null)
        setSelectedCategory(null)
      } else {
        setDateRange(null)
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
    const url = getSellThroughCsvUrl(
      dateRange?.[0],
      dateRange?.[1],
      selectedDepartment ?? undefined,
      selectedCategory ?? undefined,
    )
    window.open(url, '_blank')
  }, [dateRange, selectedDepartment, selectedCategory])

  const totals = useMemo(() => {
    const depts = deptData?.departments ?? []
    const totalSold = depts.reduce((s, d) => s + d.totalUnitsSold, 0)
    const totalReceived = depts.reduce((s, d) => s + d.totalUnitsReceived, 0)
    return {
      totalUnitsSold: totalSold,
      totalUnitsReceived: totalReceived,
      overallSellThrough: totalReceived > 0 ? (totalSold / totalReceived) * 100 : 0,
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
      title: 'Styles',
      dataIndex: 'totalStyles',
      key: 'totalStyles',
      align: 'right' as const,
    },
    {
      title: 'Units Sold',
      dataIndex: 'totalUnitsSold',
      key: 'totalUnitsSold',
      align: 'right' as const,
      sorter: (a: SellThroughDepartmentSummary, b: SellThroughDepartmentSummary) =>
        a.totalUnitsSold - b.totalUnitsSold,
    },
    {
      title: 'Units Received',
      dataIndex: 'totalUnitsReceived',
      key: 'totalUnitsReceived',
      align: 'right' as const,
    },
    {
      title: 'Sell-Through %',
      dataIndex: 'sellThroughPct',
      key: 'sellThroughPct',
      align: 'right' as const,
      render: renderSellThroughPct,
      sorter: (a: SellThroughDepartmentSummary, b: SellThroughDepartmentSummary) =>
        a.sellThroughPct - b.sellThroughPct,
      defaultSortOrder: 'ascend' as const,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: SellThroughDepartmentSummary) => (
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
      title: 'Styles',
      dataIndex: 'totalStyles',
      key: 'totalStyles',
      align: 'right' as const,
    },
    {
      title: 'Units Sold',
      dataIndex: 'totalUnitsSold',
      key: 'totalUnitsSold',
      align: 'right' as const,
    },
    {
      title: 'Units Received',
      dataIndex: 'totalUnitsReceived',
      key: 'totalUnitsReceived',
      align: 'right' as const,
    },
    {
      title: 'Sell-Through %',
      dataIndex: 'sellThroughPct',
      key: 'sellThroughPct',
      align: 'right' as const,
      render: renderSellThroughPct,
      sorter: (a: SellThroughCategorySummary, b: SellThroughCategorySummary) =>
        a.sellThroughPct - b.sellThroughPct,
      defaultSortOrder: 'ascend' as const,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: SellThroughCategorySummary) => (
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
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      width: 90,
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
    },
    {
      title: 'Units Sold',
      dataIndex: 'unitsSold',
      key: 'unitsSold',
      width: 100,
      align: 'right' as const,
    },
    {
      title: 'Units Received',
      dataIndex: 'unitsReceived',
      key: 'unitsReceived',
      width: 120,
      align: 'right' as const,
    },
    {
      title: 'Sell-Through %',
      dataIndex: 'sellThroughPct',
      key: 'sellThroughPct',
      width: 120,
      align: 'right' as const,
      render: renderSellThroughPct,
      sorter: (a: SellThroughDetail, b: SellThroughDetail) =>
        a.sellThroughPct - b.sellThroughPct,
      defaultSortOrder: 'ascend' as const,
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
                Sell-Through Analysis
              </Typography.Title>
            </Space>
          </Col>
          <Col>
            <Space>
              <RangePicker
                value={dateRange ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null}
                onChange={handleDateChange}
                allowClear
                placeholder={['Start date', 'End date']}
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
                title="Total Units Received"
                value={totals.totalUnitsReceived}
                prefix={<InboxOutlined />}
                loading={deptLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Overall Sell-Through"
                value={totals.overallSellThrough}
                prefix={totals.overallSellThrough < 50 ? <WarningOutlined /> : <PercentageOutlined />}
                precision={1}
                suffix="%"
                loading={deptLoading}
                valueStyle={{
                  color: totals.overallSellThrough === 0
                    ? '#cf1322'
                    : totals.overallSellThrough < 50
                      ? '#fa8c16'
                      : '#3f8600',
                }}
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
          <Empty description="No sell-through data available. Ensure there are sales transactions and received purchase orders." />
        </Card>
      ) : !selectedDepartment ? (
        <Card title="Sell-Through by Department (sorted by lowest sell-through first)">
          <Table<SellThroughDepartmentSummary>
            dataSource={deptData?.departments}
            columns={departmentColumns}
            rowKey="department"
            pagination={false}
            size="middle"
            summary={(data) => {
              const totalSold = data.reduce((s, r) => s + r.totalUnitsSold, 0)
              const totalRecv = data.reduce((s, r) => s + r.totalUnitsReceived, 0)
              const overallPct = totalRecv > 0 ? (totalSold / totalRecv) * 100 : 0
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <Typography.Text strong>Total</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} />
                  <Table.Summary.Cell index={2} align="right">
                    <Typography.Text strong>{totalSold}</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <Typography.Text strong>{totalRecv}</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Typography.Text strong>{overallPct.toFixed(1)}%</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} />
                </Table.Summary.Row>
              )
            }}
          />
        </Card>
      ) : (
        <>
          {selectedCategory == null && drillData?.categories && (
            <Card title={`Categories in ${selectedDepartment} (sorted by lowest sell-through first)`}>
              <Table<SellThroughCategorySummary>
                dataSource={drillData.categories}
                columns={categoryColumns}
                rowKey="category"
                pagination={false}
                size="middle"
              />
            </Card>
          )}

          <Card
            title={
              selectedCategory != null
                ? `Detail: ${selectedDepartment} / Category ${selectedCategory}`
                : `All Items in ${selectedDepartment}`
            }
          >
            <Table<SellThroughDetail>
              dataSource={drillData?.details}
              columns={detailColumns}
              rowKey="skuId"
              size="small"
              scroll={{ x: 1210 }}
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
