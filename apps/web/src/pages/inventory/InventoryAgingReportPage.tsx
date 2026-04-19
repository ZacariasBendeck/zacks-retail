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
  Empty,
} from 'antd'
import {
  DownloadOutlined,
  ArrowLeftOutlined,
  DollarOutlined,
  WarningOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import {
  useAgingByDepartment,
  useAgingDrillDown,
} from '../../hooks/useReports'
import { getAgingCsvUrl, getAgingXlsxUrl } from '../../services/reportApi'
import { validateDomainFilterContract } from '../../services/domainFilterContract'
import { getErrorMessage } from '../../utils/errors'
import type {
  AgingDepartmentSummary,
  AgingDetail,
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

const BUCKET_COLORS: Record<string, string> = {
  '0-30': 'green',
  '31-60': 'blue',
  '61-90': 'orange',
  '90+': 'red',
}

function renderAgingBucket(bucket: string) {
  return <Tag color={BUCKET_COLORS[bucket]}>{bucket} days</Tag>
}

export default function InventoryAgingReportPage() {
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)

  const { data: deptData, isLoading: deptLoading, error: deptError } = useAgingByDepartment()
  const { data: drillData, isLoading: drillLoading, error: drillError } = useAgingDrillDown(
    selectedDepartment ?? '',
    selectedCategory ?? undefined,
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
      ? getErrorMessage(drillError, 'Unable to load aging drill-down report.')
      : null
    : deptError
      ? getErrorMessage(deptError, 'Unable to load aging department summary.')
      : null

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
    const url = getAgingCsvUrl(
      selectedDepartment ?? undefined,
      selectedCategory ?? undefined,
    )
    window.open(url, '_blank')
  }, [selectedDepartment, selectedCategory])

  const handleExportXlsx = useCallback(() => {
    const url = getAgingXlsxUrl(
      selectedDepartment ?? undefined,
      selectedCategory ?? undefined,
    )
    window.open(url, '_blank')
  }, [selectedDepartment, selectedCategory])

  const totals = useMemo(() => {
    const depts = deptData?.departments ?? []
    const totalUnits = depts.reduce((s, d) => s + d.totalUnits, 0)
    const totalValue = depts.reduce((s, d) => s + d.totalCostValue, 0)
    const flaggedUnits = depts.reduce((s, d) => s + d.flaggedUnits, 0)
    const flaggedValue = depts.reduce((s, d) => s + d.flaggedValue, 0)
    return { totalUnits, totalValue, flaggedUnits, flaggedValue }
  }, [deptData])

  const categoryBreakdown = useMemo(() => {
    if (!drillData?.details || selectedCategory != null) return null
    const catMap = new Map<number, { skus: Set<string>; units: number; value: number; flaggedUnits: number; flaggedValue: number }>()
    for (const d of drillData.details) {
      let entry = catMap.get(d.category)
      if (!entry) {
        entry = { skus: new Set(), units: 0, value: 0, flaggedUnits: 0, flaggedValue: 0 }
        catMap.set(d.category, entry)
      }
      entry.skus.add(d.skuId)
      entry.units += d.quantityOnHand
      entry.value += d.costValue
      if (d.flagged) {
        entry.flaggedUnits += d.quantityOnHand
        entry.flaggedValue += d.costValue
      }
    }
    return Array.from(catMap.entries()).map(([category, data]) => ({
      category,
      totalSkus: data.skus.size,
      totalUnits: data.units,
      totalCostValue: data.value,
      flaggedUnits: data.flaggedUnits,
      flaggedValue: data.flaggedValue,
    })).sort((a, b) => b.flaggedValue - a.flaggedValue)
  }, [drillData, selectedCategory])

  // Helper to pull a bucket's cost value (or 0) off an AgingDepartmentSummary.
  // Used as the sort key for the four aging-bucket columns so clicking the
  // header orders departments by how much $$ sits in that bucket.
  const bucketValue = (rec: AgingDepartmentSummary, bucket: string): number => {
    const b = rec.buckets.find((x) => x.bucket === bucket)
    return b?.totalCostValue ?? 0
  }
  const departmentColumns = [
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      render: (dept: string) => (
        <Tag color={DEPARTMENT_COLORS[dept as Department]}>{dept}</Tag>
      ),
      sorter: (a: AgingDepartmentSummary, b: AgingDepartmentSummary) =>
        a.department.localeCompare(b.department),
    },
    {
      title: '0-30 Days',
      key: 'bucket_0_30',
      align: 'right' as const,
      render: (_: unknown, record: AgingDepartmentSummary) => {
        const b = record.buckets.find((x) => x.bucket === '0-30')
        return b ? `${b.totalUnits} units / $${b.totalCostValue.toFixed(2)}` : '—'
      },
      sorter: (a: AgingDepartmentSummary, b: AgingDepartmentSummary) =>
        bucketValue(a, '0-30') - bucketValue(b, '0-30'),
    },
    {
      title: '31-60 Days',
      key: 'bucket_31_60',
      align: 'right' as const,
      render: (_: unknown, record: AgingDepartmentSummary) => {
        const b = record.buckets.find((x) => x.bucket === '31-60')
        return b ? `${b.totalUnits} units / $${b.totalCostValue.toFixed(2)}` : '—'
      },
      sorter: (a: AgingDepartmentSummary, b: AgingDepartmentSummary) =>
        bucketValue(a, '31-60') - bucketValue(b, '31-60'),
    },
    {
      title: '61-90 Days',
      key: 'bucket_61_90',
      align: 'right' as const,
      render: (_: unknown, record: AgingDepartmentSummary) => {
        const b = record.buckets.find((x) => x.bucket === '61-90')
        return b ? `${b.totalUnits} units / $${b.totalCostValue.toFixed(2)}` : '—'
      },
      sorter: (a: AgingDepartmentSummary, b: AgingDepartmentSummary) =>
        bucketValue(a, '61-90') - bucketValue(b, '61-90'),
    },
    {
      title: (
        <span>
          90+ Days <WarningOutlined style={{ color: '#cf1322' }} />
        </span>
      ),
      key: 'bucket_90_plus',
      align: 'right' as const,
      render: (_: unknown, record: AgingDepartmentSummary) => {
        const b = record.buckets.find((x) => x.bucket === '90+')
        if (!b || b.totalUnits === 0) return '—'
        return (
          <Typography.Text type="danger" strong>
            {b.totalUnits} units / ${b.totalCostValue.toFixed(2)}
          </Typography.Text>
        )
      },
      sorter: (a: AgingDepartmentSummary, b: AgingDepartmentSummary) =>
        bucketValue(a, '90+') - bucketValue(b, '90+'),
    },
    {
      title: 'Total Value',
      dataIndex: 'totalCostValue',
      key: 'totalCostValue',
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: (a: AgingDepartmentSummary, b: AgingDepartmentSummary) =>
        a.totalCostValue - b.totalCostValue,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: AgingDepartmentSummary) => (
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
      sorter: (a: { category: number }, b: { category: number }) => a.category - b.category,
    },
    {
      title: 'Active SKUs',
      dataIndex: 'totalSkus',
      key: 'totalSkus',
      align: 'right' as const,
      sorter: (a: { totalSkus: number }, b: { totalSkus: number }) => a.totalSkus - b.totalSkus,
    },
    {
      title: 'Total Units',
      dataIndex: 'totalUnits',
      key: 'totalUnits',
      align: 'right' as const,
      sorter: (a: { totalUnits: number }, b: { totalUnits: number }) => a.totalUnits - b.totalUnits,
    },
    {
      title: 'Total Value',
      dataIndex: 'totalCostValue',
      key: 'totalCostValue',
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: (a: { totalCostValue: number }, b: { totalCostValue: number }) =>
        a.totalCostValue - b.totalCostValue,
    },
    {
      title: (
        <span>
          Flagged (90+) <WarningOutlined style={{ color: '#cf1322' }} />
        </span>
      ),
      key: 'flagged',
      align: 'right' as const,
      render: (_: unknown, record: { flaggedUnits: number; flaggedValue: number }) => {
        if (record.flaggedUnits === 0) return '—'
        return (
          <Typography.Text type="danger" strong>
            {record.flaggedUnits} units / ${record.flaggedValue.toFixed(2)}
          </Typography.Text>
        )
      },
      sorter: (a: { flaggedValue: number }, b: { flaggedValue: number }) =>
        a.flaggedValue - b.flaggedValue,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: { category: number }) => (
        <Button type="link" size="small" onClick={() => handleCategoryClick(record.category)}>
          View Details
        </Button>
      ),
    },
  ]

  const detailColumns = [
    {
      title: 'SKU Code',
      dataIndex: 'skuCode',
      key: 'skuCode',
      width: 200,
      ellipsis: true,
      sorter: (a: AgingDetail, b: AgingDetail) => a.skuCode.localeCompare(b.skuCode),
    },
    {
      title: 'Brand',
      dataIndex: 'brand',
      key: 'brand',
      width: 120,
      sorter: (a: AgingDetail, b: AgingDetail) =>
        (a.brand ?? '').localeCompare(b.brand ?? ''),
    },
    {
      title: 'Style',
      dataIndex: 'style',
      key: 'style',
      width: 100,
      sorter: (a: AgingDetail, b: AgingDetail) => a.style.localeCompare(b.style),
    },
    {
      title: 'Color',
      dataIndex: 'color',
      key: 'color',
      width: 100,
      sorter: (a: AgingDetail, b: AgingDetail) =>
        (a.color ?? '').localeCompare(b.color ?? ''),
    },
    {
      title: 'Size',
      dataIndex: 'size',
      key: 'size',
      width: 70,
      sorter: (a: AgingDetail, b: AgingDetail) =>
        (a.size ?? '').localeCompare(b.size ?? ''),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 90,
      sorter: (a: AgingDetail, b: AgingDetail) => a.category - b.category,
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      width: 90,
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: (a: AgingDetail, b: AgingDetail) => a.price - b.price,
    },
    {
      title: 'Qty On Hand',
      dataIndex: 'quantityOnHand',
      key: 'quantityOnHand',
      width: 100,
      align: 'right' as const,
      sorter: (a: AgingDetail, b: AgingDetail) => a.quantityOnHand - b.quantityOnHand,
    },
    {
      title: 'Cost Value',
      dataIndex: 'costValue',
      key: 'costValue',
      width: 110,
      align: 'right' as const,
      render: (v: number) => `$${v.toFixed(2)}`,
      sorter: (a: AgingDetail, b: AgingDetail) => a.costValue - b.costValue,
    },
    {
      title: 'Days On Hand',
      dataIndex: 'daysOnHand',
      key: 'daysOnHand',
      width: 110,
      align: 'right' as const,
      sorter: (a: AgingDetail, b: AgingDetail) => a.daysOnHand - b.daysOnHand,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Aging Bucket',
      dataIndex: 'agingBucket',
      key: 'agingBucket',
      width: 120,
      render: renderAgingBucket,
      // Aging buckets are ordinal, not alphabetical — sort by daysOnHand which
      // is already the canonical ordering for "how old is this stock".
      sorter: (a: AgingDetail, b: AgingDetail) => a.daysOnHand - b.daysOnHand,
    },
    {
      title: 'Flagged',
      dataIndex: 'flagged',
      key: 'flagged',
      width: 80,
      render: (flagged: boolean) =>
        flagged ? <Tag color="red" icon={<WarningOutlined />}>Review</Tag> : null,
      filters: [
        { text: 'Flagged', value: true },
        { text: 'Not flagged', value: false },
      ],
      onFilter: (value: boolean | React.Key, record: AgingDetail) => record.flagged === value,
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
    ? (drillData?.details?.length ?? 0) > 0
    : (deptData?.departments?.length ?? 0) > 0

  const filteredDetails = useMemo(() => {
    if (!drillData?.details) return []
    if (selectedCategory != null) {
      return drillData.details.filter((d) => d.category === selectedCategory)
    }
    return drillData.details
  }, [drillData, selectedCategory])

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
          message="Inventory aging request failed"
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
                Inventory Aging Report
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
      </Card>

      {/* Summary KPIs (top-level only) */}
      {!selectedDepartment && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="Total Units On Hand"
                value={totals.totalUnits}
                prefix={<ClockCircleOutlined />}
                loading={deptLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="Total Inventory Value"
                value={totals.totalValue}
                prefix={<DollarOutlined />}
                precision={2}
                loading={deptLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="Flagged Units (90+ Days)"
                value={totals.flaggedUnits}
                prefix={<WarningOutlined />}
                loading={deptLoading}
                valueStyle={{ color: totals.flaggedUnits > 0 ? '#cf1322' : '#3f8600' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="Flagged Value (90+ Days)"
                value={totals.flaggedValue}
                prefix={<DollarOutlined />}
                precision={2}
                loading={deptLoading}
                valueStyle={{ color: totals.flaggedValue > 0 ? '#cf1322' : '#3f8600' }}
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
          <Empty description="No inventory on hand to report. Ensure there is stock in the system." />
        </Card>
      ) : !selectedDepartment ? (
        <Card title="Inventory Aging by Department">
          <Table<AgingDepartmentSummary>
            dataSource={deptData?.departments}
            columns={departmentColumns}
            rowKey="department"
            pagination={false}
            size="middle"
            summary={(data) => {
              const totalValue = data.reduce((s, r) => s + r.totalCostValue, 0)
              const flaggedUnits = data.reduce((s, r) => s + r.flaggedUnits, 0)
              const flaggedValue = data.reduce((s, r) => s + r.flaggedValue, 0)
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <Typography.Text strong>Total</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} />
                  <Table.Summary.Cell index={2} />
                  <Table.Summary.Cell index={3} />
                  <Table.Summary.Cell index={4} align="right">
                    {flaggedUnits > 0 && (
                      <Typography.Text type="danger" strong>
                        {flaggedUnits} units / ${flaggedValue.toFixed(2)}
                      </Typography.Text>
                    )}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    <Typography.Text strong>${totalValue.toFixed(2)}</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} />
                </Table.Summary.Row>
              )
            }}
          />
        </Card>
      ) : (
        <>
          {selectedCategory == null && categoryBreakdown && (
            <Card title={`Categories in ${selectedDepartment}`}>
              <Table
                dataSource={categoryBreakdown}
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
            <Table<AgingDetail>
              dataSource={filteredDetails}
              columns={detailColumns}
              rowKey="skuId"
              size="small"
              scroll={{ x: 1400 }}
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
