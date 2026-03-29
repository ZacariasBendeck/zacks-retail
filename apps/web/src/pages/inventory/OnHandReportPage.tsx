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
} from 'antd'
import {
  DownloadOutlined,
  ArrowLeftOutlined,
  InboxOutlined,
  DollarOutlined,
  ShopOutlined,
} from '@ant-design/icons'
import { useOnHandByDepartment, useOnHandDrillDown } from '../../hooks/useReports'
import { getOnHandCsvUrl } from '../../services/reportApi'
import type { DepartmentOnHand, CategoryOnHand, OnHandDetail } from '../../services/reportApi'
import type { Department } from '../../types/sku'

const DEPARTMENT_COLORS: Record<Department, string> = {
  FORMAL: '#1677ff',
  CASUAL: '#52c41a',
  FIESTA: '#eb2f96',
  SANDALIAS: '#fa8c16',
  BOOTS: '#fa541c',
  COMFORT: '#13c2c2',
}

export default function OnHandReportPage() {
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)

  const { data: deptData, isLoading: deptLoading } = useOnHandByDepartment()
  const { data: drillData, isLoading: drillLoading } = useOnHandDrillDown(
    selectedDepartment ?? '',
    selectedCategory ?? undefined,
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
    const url = getOnHandCsvUrl(
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
    },
    {
      title: 'Active SKUs',
      dataIndex: 'totalSkus',
      key: 'totalSkus',
      align: 'right' as const,
    },
    {
      title: 'Total Units',
      dataIndex: 'totalUnits',
      key: 'totalUnits',
      align: 'right' as const,
    },
    {
      title: 'Total Cost Value',
      dataIndex: 'totalCostValue',
      key: 'totalCostValue',
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
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
    },
    {
      title: 'Active SKUs',
      dataIndex: 'totalSkus',
      key: 'totalSkus',
      align: 'right' as const,
    },
    {
      title: 'Total Units',
      dataIndex: 'totalUnits',
      key: 'totalUnits',
      align: 'right' as const,
    },
    {
      title: 'Total Cost Value',
      dataIndex: 'totalCostValue',
      key: 'totalCostValue',
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
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
    },
    {
      title: 'Cost Value',
      dataIndex: 'costValue',
      key: 'costValue',
      width: 110,
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
                On-Hand Inventory Report
              </Typography.Title>
            </Space>
          </Col>
          <Col>
            <Button icon={<DownloadOutlined />} onClick={handleExportCsv}>
              Export CSV
            </Button>
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
                prefix={<DollarOutlined />}
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
            <Table<OnHandDetail>
              dataSource={drillData?.details}
              columns={detailColumns}
              rowKey="skuId"
              size="small"
              scroll={{ x: 1060 }}
              pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'] }}
            />
          </Card>
        </>
      )}
    </Space>
  )
}
