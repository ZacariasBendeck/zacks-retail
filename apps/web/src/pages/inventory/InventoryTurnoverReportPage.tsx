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
  SyncOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  useTurnoverByDepartment,
  useTurnoverDrillDown,
} from '../../hooks/useReports'
import { getTurnoverCsvUrl, getTurnoverXlsxUrl } from '../../services/reportApi'
import { validateDomainFilterContract } from '../../services/domainFilterContract'
import ServerDataTable, {
  type ServerQueryChange,
  type ServerTableColumn,
} from '../../components/ServerDataTable'
import { getErrorMessage } from '../../utils/errors'
import type {
  DepartmentTurnover,
  CategoryTurnover,
  TurnoverDetail,
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
  sort: 'turnoverRatio',
  order: 'asc',
}

function renderTurnoverRatio(v: number) {
  const color = v === 0 ? 'red' : v < 1 ? 'orange' : v < 3 ? 'blue' : 'green'
  return (
    <Tag color={color}>
      {v.toFixed(2)}x
    </Tag>
  )
}

export default function InventoryTurnoverReportPage() {
  const [dateRange, setDateRange] = useState<[string, string] | null>(null)
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [detailQuery, setDetailQuery] = useState<ReportDetailQuery>(DEFAULT_DETAIL_QUERY)

  const { data: deptData, isLoading: deptLoading, error: deptError } = useTurnoverByDepartment(
    dateRange?.[0],
    dateRange?.[1],
  )
  const { data: drillData, isLoading: drillLoading, error: drillError } = useTurnoverDrillDown(
    selectedDepartment ?? '',
    dateRange?.[0],
    dateRange?.[1],
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
      ? getErrorMessage(drillError, 'Unable to load turnover drill-down report.')
      : null
    : deptError
      ? getErrorMessage(deptError, 'Unable to load turnover department summary.')
      : null

  const handleDateChange = useCallback(
    (_: unknown, dateStrings: [string, string]) => {
      if (dateStrings[0] && dateStrings[1]) {
        setDateRange(dateStrings)
        setSelectedDepartment(null)
        setSelectedCategory(null)
        setDetailQuery(DEFAULT_DETAIL_QUERY)
      } else {
        setDateRange(null)
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
    const url = getTurnoverCsvUrl(
      dateRange?.[0],
      dateRange?.[1],
      selectedDepartment ?? undefined,
      selectedCategory ?? undefined,
    )
    window.open(url, '_blank')
  }, [dateRange, selectedDepartment, selectedCategory])

  const handleExportXlsx = useCallback(() => {
    const url = getTurnoverXlsxUrl(
      dateRange?.[0],
      dateRange?.[1],
      selectedDepartment ?? undefined,
      selectedCategory ?? undefined,
    )
    window.open(url, '_blank')
  }, [dateRange, selectedDepartment, selectedCategory])

  const totals = useMemo(() => {
    const depts = deptData?.departments ?? []
    const totalCogs = depts.reduce((s, d) => s + d.totalCogs, 0)
    const totalInv = depts.reduce((s, d) => s + d.totalInventoryValue, 0)
    return {
      totalCogs,
      totalInventoryValue: totalInv,
      overallTurnover: totalInv > 0 ? totalCogs / totalInv : 0,
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
      sorter: (a: DepartmentTurnover, b: DepartmentTurnover) =>
        a.department.localeCompare(b.department),
    },
    {
      title: 'Active SKUs',
      dataIndex: 'totalSkus',
      key: 'totalSkus',
      align: 'right' as const,
      sorter: (a: DepartmentTurnover, b: DepartmentTurnover) => a.totalSkus - b.totalSkus,
    },
    {
      title: 'COGS',
      dataIndex: 'totalCogs',
      key: 'totalCogs',
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: (a: DepartmentTurnover, b: DepartmentTurnover) =>
        a.totalCogs - b.totalCogs,
    },
    {
      title: 'Inventory Value',
      dataIndex: 'totalInventoryValue',
      key: 'totalInventoryValue',
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: (a: DepartmentTurnover, b: DepartmentTurnover) =>
        a.totalInventoryValue - b.totalInventoryValue,
    },
    {
      title: 'Turnover Ratio',
      dataIndex: 'turnoverRatio',
      key: 'turnoverRatio',
      align: 'right' as const,
      render: renderTurnoverRatio,
      sorter: (a: DepartmentTurnover, b: DepartmentTurnover) =>
        a.turnoverRatio - b.turnoverRatio,
      defaultSortOrder: 'ascend' as const,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: DepartmentTurnover) => (
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
      sorter: (a: CategoryTurnover, b: CategoryTurnover) => a.category - b.category,
    },
    {
      title: 'Active SKUs',
      dataIndex: 'totalSkus',
      key: 'totalSkus',
      align: 'right' as const,
      sorter: (a: CategoryTurnover, b: CategoryTurnover) => a.totalSkus - b.totalSkus,
    },
    {
      title: 'COGS',
      dataIndex: 'totalCogs',
      key: 'totalCogs',
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: (a: CategoryTurnover, b: CategoryTurnover) => a.totalCogs - b.totalCogs,
    },
    {
      title: 'Inventory Value',
      dataIndex: 'totalInventoryValue',
      key: 'totalInventoryValue',
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: (a: CategoryTurnover, b: CategoryTurnover) =>
        a.totalInventoryValue - b.totalInventoryValue,
    },
    {
      title: 'Turnover Ratio',
      dataIndex: 'turnoverRatio',
      key: 'turnoverRatio',
      align: 'right' as const,
      render: renderTurnoverRatio,
      sorter: (a: CategoryTurnover, b: CategoryTurnover) =>
        a.turnoverRatio - b.turnoverRatio,
      defaultSortOrder: 'ascend' as const,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: CategoryTurnover) => (
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

  const detailColumns: ServerTableColumn<TurnoverDetail>[] = [
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
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      width: 90,
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: true,
      sortOrder: sortOrder('price'),
    },
    {
      title: 'Qty On Hand',
      dataIndex: 'quantityOnHand',
      key: 'quantityOnHand',
      width: 100,
      align: 'right' as const,
      render: (v: number) => (
        <Typography.Text type={v === 0 ? 'danger' : undefined} strong={v === 0}>
          {v}
        </Typography.Text>
      ),
      sorter: true,
      sortOrder: sortOrder('quantityOnHand'),
    },
    {
      title: 'Inv. Value',
      dataIndex: 'inventoryValue',
      key: 'inventoryValue',
      width: 110,
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: true,
      sortOrder: sortOrder('inventoryValue'),
    },
    {
      title: 'COGS',
      dataIndex: 'cogs',
      key: 'cogs',
      width: 100,
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: true,
      sortOrder: sortOrder('cogs'),
    },
    {
      title: 'Turnover',
      dataIndex: 'turnoverRatio',
      key: 'turnoverRatio',
      width: 100,
      align: 'right' as const,
      render: renderTurnoverRatio,
      sorter: true,
      sortOrder: sortOrder('turnoverRatio'),
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
          message="Inventory turnover request failed"
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
                Inventory Turnover Report
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
                title="Total COGS"
                value={totals.totalCogs}
                prefix={<DollarOutlined />}
                precision={2}
                loading={deptLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Inventory Value"
                value={totals.totalInventoryValue}
                prefix={<DollarOutlined />}
                precision={2}
                loading={deptLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Overall Turnover Ratio"
                value={totals.overallTurnover}
                prefix={totals.overallTurnover < 1 ? <WarningOutlined /> : <SyncOutlined />}
                precision={2}
                suffix="x"
                loading={deptLoading}
                valueStyle={{
                  color: totals.overallTurnover === 0
                    ? '#cf1322'
                    : totals.overallTurnover < 1
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
          <Empty description="No turnover data available. Ensure there are sales transactions and inventory on hand." />
        </Card>
      ) : !selectedDepartment ? (
        <Card title="Turnover by Department (sorted by slowest movers first)">
          <Table<DepartmentTurnover>
            dataSource={deptData?.departments}
            columns={departmentColumns}
            rowKey="department"
            pagination={false}
            size="middle"
            summary={(data) => {
              const totalCogs = data.reduce((s, r) => s + r.totalCogs, 0)
              const totalInv = data.reduce((s, r) => s + r.totalInventoryValue, 0)
              const overallRatio = totalInv > 0 ? totalCogs / totalInv : 0
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <Typography.Text strong>Total</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} />
                  <Table.Summary.Cell index={2} align="right">
                    <Typography.Text strong>${totalCogs.toFixed(2)}</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <Typography.Text strong>${totalInv.toFixed(2)}</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Typography.Text strong>{overallRatio.toFixed(2)}x</Typography.Text>
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
            <Card title={`Categories in ${selectedDepartment} (sorted by slowest movers first)`}>
              <Table<CategoryTurnover>
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
            <ServerDataTable<TurnoverDetail>
              title={<Typography.Text strong>Detail Rows</Typography.Text>}
              data={drillData?.details}
              columns={detailColumns}
              rowKey="skuId"
              pagination={drillData?.pagination}
              onQueryChange={handleDetailQueryChange}
              expectedTotalRows={drillData?.pagination.totalItems}
              exportFileName={`turnover-details-${new Date().toISOString().slice(0, 10)}`}
              scrollX={1420}
            />
          </Card>
        </>
      )}
    </Space>
  )
}
