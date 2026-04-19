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
} from 'antd'
import {
  DownloadOutlined,
  ArrowLeftOutlined,
  InboxOutlined,
  ShopOutlined,
} from '@ant-design/icons'
import { useOnHandByDepartment, useOnHandDrillDown } from '../../hooks/useReports'
import ServerDataTable, {
  type ServerQueryChange,
  type ServerTableColumn,
} from '../../components/ServerDataTable'
import { getOnHandCsvUrl, getOnHandXlsxUrl } from '../../services/reportApi'
import { validateDomainFilterContract } from '../../services/domainFilterContract'
import { getErrorMessage } from '../../utils/errors'
import type {
  DepartmentOnHand,
  CategoryOnHand,
  OnHandDetail,
  ReportDetailQuery,
} from '../../services/reportApi'
import type { Department } from '../../types/sku'

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
  sort: 'department',
  order: 'asc',
}

// Currency is Honduran Lempira (HNL) system-wide — labeled once at the top of
// the page, not repeated in every cell (see CLAUDE.md "Currency" policy).
function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function OnHandReportPage() {
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [detailQuery, setDetailQuery] = useState<ReportDetailQuery>(DEFAULT_DETAIL_QUERY)

  const { data: deptData, isLoading: deptLoading, error: deptError } = useOnHandByDepartment()
  const { data: drillData, isLoading: drillLoading, error: drillError } = useOnHandDrillDown(
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
      ? getErrorMessage(drillError, 'Unable to load on-hand drill-down report.')
      : null
    : deptError
      ? getErrorMessage(deptError, 'Unable to load on-hand department summary.')
      : null

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
    const url = getOnHandCsvUrl(
      selectedDepartment ?? undefined,
      selectedCategory ?? undefined,
    )
    window.open(url, '_blank')
  }, [selectedDepartment, selectedCategory])

  const handleExportXlsx = useCallback(() => {
    const url = getOnHandXlsxUrl(
      selectedDepartment ?? undefined,
      selectedCategory ?? undefined,
    )
    window.open(url, '_blank')
  }, [selectedDepartment, selectedCategory])

  // Totals for department summary
  const totals = useMemo(() => {
    const depts = deptData?.departments ?? []
    return {
      totalSkus: depts.reduce((s, d) => s + d.totalSkus, 0),
      totalUnits: depts.reduce((s, d) => s + d.totalUnits, 0),
      totalCostValue: depts.reduce((s, d) => s + d.totalCostValue, 0),
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
      sorter: (a: DepartmentOnHand, b: DepartmentOnHand) =>
        a.department.localeCompare(b.department),
    },
    {
      title: 'Active SKUs',
      dataIndex: 'totalSkus',
      key: 'totalSkus',
      align: 'right' as const,
      sorter: (a: DepartmentOnHand, b: DepartmentOnHand) => a.totalSkus - b.totalSkus,
    },
    {
      title: 'Total Units',
      dataIndex: 'totalUnits',
      key: 'totalUnits',
      align: 'right' as const,
      sorter: (a: DepartmentOnHand, b: DepartmentOnHand) => a.totalUnits - b.totalUnits,
    },
    {
      title: 'Total Cost Value',
      dataIndex: 'totalCostValue',
      key: 'totalCostValue',
      align: 'right' as const,
      render: (v: number) => formatMoney(v),
      sorter: (a: DepartmentOnHand, b: DepartmentOnHand) => a.totalCostValue - b.totalCostValue,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: DepartmentOnHand) => (
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
      sorter: (a: CategoryOnHand, b: CategoryOnHand) => a.category - b.category,
    },
    {
      title: 'Active SKUs',
      dataIndex: 'totalSkus',
      key: 'totalSkus',
      align: 'right' as const,
      sorter: (a: CategoryOnHand, b: CategoryOnHand) => a.totalSkus - b.totalSkus,
    },
    {
      title: 'Total Units',
      dataIndex: 'totalUnits',
      key: 'totalUnits',
      align: 'right' as const,
      sorter: (a: CategoryOnHand, b: CategoryOnHand) => a.totalUnits - b.totalUnits,
    },
    {
      title: 'Total Cost Value',
      dataIndex: 'totalCostValue',
      key: 'totalCostValue',
      align: 'right' as const,
      render: (v: number) => formatMoney(v),
      sorter: (a: CategoryOnHand, b: CategoryOnHand) => a.totalCostValue - b.totalCostValue,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: CategoryOnHand) => (
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

  const detailColumns: ServerTableColumn<OnHandDetail>[] = [
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
      render: (v: number) => formatMoney(v),
      sorter: true,
      sortOrder: sortOrder('price'),
    },
    {
      title: 'Qty On Hand',
      dataIndex: 'quantityOnHand',
      key: 'quantityOnHand',
      width: 110,
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
      title: 'Cost Value',
      dataIndex: 'costValue',
      key: 'costValue',
      width: 110,
      align: 'right' as const,
      render: (v: number) => formatMoney(v),
      sorter: true,
      sortOrder: sortOrder('costValue'),
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
          message="On-hand report request failed"
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
                On-Hand Inventory Report
              </Typography.Title>
            </Space>
          </Col>
          <Col>
            <Space>
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
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
          Amounts in Lempira (HNL).
        </Typography.Paragraph>
      </Card>

      {/* Summary KPIs (top-level only) */}
      {!selectedDepartment && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Active SKUs"
                value={totals.totalSkus}
                prefix={<ShopOutlined />}
                loading={deptLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Units On Hand"
                value={totals.totalUnits}
                prefix={<InboxOutlined />}
                loading={deptLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Inventory Value"
                value={totals.totalCostValue}
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
      ) : !selectedDepartment ? (
        // Department summary table
        <Card title="By Department">
          <Table<DepartmentOnHand>
            dataSource={deptData?.departments}
            columns={departmentColumns}
            rowKey="department"
            pagination={false}
            size="middle"
          />
        </Card>
      ) : (
        <>
          {/* Category breakdown (when no specific category selected) */}
          {selectedCategory == null && drillData?.categories && (
            <Card title={`Categories in ${selectedDepartment}`}>
              <Table<CategoryOnHand>
                dataSource={drillData.categories}
                columns={categoryColumns}
                rowKey="category"
                pagination={false}
                size="middle"
              />
            </Card>
          )}

          {/* Detail rows */}
          <Card
            title={
              selectedCategory != null
                ? `Detail: ${selectedDepartment} / Category ${selectedCategory}`
                : `All Items in ${selectedDepartment}`
            }
          >
            <ServerDataTable<OnHandDetail>
              data={drillData?.details}
              title={<Typography.Text strong>Detail Rows</Typography.Text>}
              columns={detailColumns}
              rowKey="skuId"
              pagination={drillData?.pagination}
              onQueryChange={handleDetailQueryChange}
              expectedTotalRows={drillData?.pagination.totalItems}
              exportFileName={`on-hand-details-${new Date().toISOString().slice(0, 10)}`}
              scrollX={1180}
            />
          </Card>
        </>
      )}
    </Space>
  )
}
