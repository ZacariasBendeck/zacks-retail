import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, Card, Col, DatePicker, Input, InputNumber, Row, Select, Space, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import ServerDataTable, { type ServerQueryChange, type ServerTableColumn } from '../../components/ServerDataTable'
import SourceDocumentAction from '../../components/SourceDocumentAction'
import { useMovementReconciliation, useMovementTimeline } from '../../hooks/useInventoryMovement'
import { ALLOWED_DEPARTMENTS, CATEGORY_MAX, CATEGORY_MIN } from '../../constants/domain'
import type {
  MovementReconciliationParams,
  MovementReconciliationRow,
  MovementTimelineParams,
  MovementTimelineRow,
  MovementType,
} from '../../types/inventoryMovement'
import type { Department } from '../../types/sku'

const MOVEMENT_TYPE_OPTIONS: { label: string; value: MovementType }[] = [
  { label: 'Sale', value: 'sale' },
  { label: 'PO Receipt', value: 'po_receipt' },
  { label: 'Transfer In', value: 'transfer_in' },
  { label: 'Transfer Out', value: 'transfer_out' },
  { label: 'Adjustment', value: 'adjustment' },
]

function toDateLabel(value?: string | null): string {
  if (!value) return '-'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '-'
}

function toNumberLabel(value?: number | null): string {
  if (value == null) return '-'
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2)
}

export default function InventoryMovementPage() {
  const navigate = useNavigate()

  const [timelineParams, setTimelineParams] = useState<MovementTimelineParams>({
    page: 1,
    pageSize: 50,
    sort: 'movementAt',
    order: 'desc',
  })
  const [reconciliationParams, setReconciliationParams] = useState<MovementReconciliationParams>({
    page: 1,
    pageSize: 50,
    sort: 'lastMovementAt',
    order: 'desc',
  })

  const isDateRangeInvalid = useMemo(() => {
    if (!timelineParams.startDate || !timelineParams.endDate) return false
    return dayjs(timelineParams.startDate).isAfter(dayjs(timelineParams.endDate), 'day')
  }, [timelineParams.endDate, timelineParams.startDate])

  const timelineQueryParams = useMemo<MovementTimelineParams>(
    () =>
      isDateRangeInvalid
        ? { ...timelineParams, startDate: undefined, endDate: undefined }
        : timelineParams,
    [isDateRangeInvalid, timelineParams],
  )

  const reconciliationQueryParams = useMemo<MovementReconciliationParams>(
    () =>
      isDateRangeInvalid
        ? { ...reconciliationParams, startDate: undefined, endDate: undefined }
        : reconciliationParams,
    [isDateRangeInvalid, reconciliationParams],
  )

  const timelineQuery = useMovementTimeline(timelineQueryParams)
  const reconciliationQuery = useMovementReconciliation(reconciliationQueryParams)

  const applySharedFilter = useCallback(
    (
      key:
        | 'startDate'
        | 'endDate'
        | 'skuCode'
        | 'locationId'
        | 'macroDepartments'
        | 'categoryMin'
        | 'categoryMax',
      value:
        | string
        | number
        | undefined
        | Department[]
        | MovementTimelineParams['macroDepartments'],
    ) => {
      setTimelineParams((prev) => ({ ...prev, [key]: value, page: 1 }))
      setReconciliationParams((prev) => ({ ...prev, [key]: value, page: 1 }))
    },
    [],
  )

  const buildReconciliationTimelinePath = useCallback((row: MovementReconciliationRow): string => {
    const searchParams = new URLSearchParams()
    if (row.skuCode) searchParams.set('skuCode', row.skuCode)
    if (row.locationId) searchParams.set('locationId', row.locationId)
    return `/inventory/movements?${searchParams.toString()}`
  }, [])

  const handleTimelineQueryChange = useCallback((query: ServerQueryChange) => {
    const hasMovementTypeFilter =
      query.filters != null && Object.prototype.hasOwnProperty.call(query.filters, 'movementType')
    const hasDepartmentFilter =
      query.filters != null &&
      Object.prototype.hasOwnProperty.call(query.filters, 'macroDepartment')
    const movementTypeFilter = hasMovementTypeFilter ? query.filters?.movementType ?? [] : null
    const departmentFilter = hasDepartmentFilter ? query.filters?.macroDepartment ?? [] : null

    setTimelineParams((prev) => ({
      ...prev,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort ?? prev.sort,
      order: query.order ?? prev.order,
      movementTypes:
        movementTypeFilter == null
          ? prev.movementTypes
          : movementTypeFilter.length > 0
            ? (movementTypeFilter as MovementType[])
            : undefined,
      macroDepartments:
        departmentFilter == null
          ? prev.macroDepartments
          : departmentFilter.length > 0
            ? (departmentFilter as Department[])
            : undefined,
    }))
  }, [])

  const handleReconciliationQueryChange = useCallback((query: ServerQueryChange) => {
    const hasDepartmentFilter =
      query.filters != null &&
      Object.prototype.hasOwnProperty.call(query.filters, 'macroDepartment')
    const departmentFilter = hasDepartmentFilter ? query.filters?.macroDepartment ?? [] : null

    setReconciliationParams((prev) => ({
      ...prev,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort ?? prev.sort,
      order: query.order ?? prev.order,
      macroDepartments:
        departmentFilter == null
          ? prev.macroDepartments
          : departmentFilter.length > 0
            ? (departmentFilter as Department[])
            : undefined,
    }))
  }, [])

  const movementSummary = useMemo(() => {
    const rows = timelineQuery.data?.data ?? []
    return rows.reduce(
      (summary, row) => {
        summary.delta += row.quantityDelta
        summary.count += 1
        return summary
      },
      { delta: 0, count: 0 },
    )
  }, [timelineQuery.data?.data])

  const timelineColumns: ServerTableColumn<MovementTimelineRow>[] = [
    {
      title: 'Movement At',
      dataIndex: 'movementAt',
      key: 'movementAt',
      sorter: true,
      width: 170,
      render: (value: string) => toDateLabel(value),
      exportValue: (record) => toDateLabel(record.movementAt),
    },
    {
      title: 'SKU',
      dataIndex: 'skuCode',
      key: 'skuCode',
      sorter: true,
      width: 180,
      ellipsis: true,
    },
    {
      title: 'Location',
      dataIndex: 'locationCode',
      key: 'locationCode',
      sorter: true,
      width: 170,
      render: (_: unknown, row) => row.locationCode || row.locationName || row.locationId || '-',
      exportValue: (row) => row.locationCode ?? row.locationName ?? row.locationId ?? '',
    },
    {
      title: 'Type',
      dataIndex: 'movementType',
      key: 'movementType',
      sorter: true,
      width: 140,
      filters: MOVEMENT_TYPE_OPTIONS.map((option) => ({ text: option.label, value: option.value })),
      filteredValue: timelineParams.movementTypes ?? null,
      render: (value: MovementType) => value.replace(/_/g, ' ').toUpperCase(),
    },
    {
      title: 'Qty Delta',
      dataIndex: 'quantityDelta',
      key: 'quantityDelta',
      sorter: true,
      width: 120,
      align: 'right',
      render: (value: number) => (
        <Typography.Text type={value < 0 ? 'danger' : value > 0 ? 'success' : undefined}>
          {toNumberLabel(value)}
        </Typography.Text>
      ),
    },
    {
      title: 'Unit Cost',
      dataIndex: 'unitCostSnapshot',
      key: 'unitCostSnapshot',
      sorter: true,
      width: 110,
      align: 'right',
      render: (value: number | null | undefined) =>
        value == null ? '-' : `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
      exportValue: (row) => row.unitCostSnapshot ?? '',
    },
    {
      title: 'Department',
      dataIndex: 'macroDepartment',
      key: 'macroDepartment',
      width: 130,
      filters: ALLOWED_DEPARTMENTS.map((department) => ({ text: department, value: department })),
      filteredValue: timelineParams.macroDepartments ?? null,
      render: (value: Department | null | undefined) => value ?? '-',
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      align: 'right',
      render: (value: number | null | undefined) => (value == null ? '-' : value),
    },
    {
      title: 'Source Document',
      key: 'sourceDocument',
      width: 190,
      render: (_: unknown, row) => (
        <SourceDocumentAction
          sourceDocumentType={row.sourceDocumentType}
          sourceDocumentId={row.sourceDocumentId}
          sourceDocumentNumber={row.sourceDocumentNumber}
          onNavigate={navigate}
        />
      ),
      exportValue: (row) => row.sourceDocumentNumber ?? row.sourceDocumentId ?? '',
    },
  ]

  const reconciliationColumns: ServerTableColumn<MovementReconciliationRow>[] = [
    {
      title: 'SKU',
      dataIndex: 'skuCode',
      key: 'skuCode',
      sorter: true,
      width: 180,
      ellipsis: true,
    },
    {
      title: 'Location',
      dataIndex: 'locationCode',
      key: 'locationCode',
      sorter: true,
      width: 170,
      render: (_: unknown, row) => row.locationCode || row.locationName || row.locationId || '-',
      exportValue: (row) => row.locationCode ?? row.locationName ?? row.locationId ?? '',
    },
    {
      title: 'Expected Delta',
      dataIndex: 'expectedStockDelta',
      key: 'expectedStockDelta',
      sorter: true,
      width: 150,
      align: 'right',
      render: (value: number) => (
        <Typography.Text type={value < 0 ? 'danger' : value > 0 ? 'success' : undefined}>
          {toNumberLabel(value)}
        </Typography.Text>
      ),
    },
    {
      title: 'Movement Rows',
      dataIndex: 'movementRowCount',
      key: 'movementRowCount',
      sorter: true,
      width: 130,
      align: 'right',
      render: (value: number) => value.toLocaleString(),
    },
    {
      title: 'First Movement',
      dataIndex: 'firstMovementAt',
      key: 'firstMovementAt',
      sorter: true,
      width: 170,
      render: (value: string | null) => toDateLabel(value),
      exportValue: (row) => toDateLabel(row.firstMovementAt),
    },
    {
      title: 'Last Movement',
      dataIndex: 'lastMovementAt',
      key: 'lastMovementAt',
      sorter: true,
      width: 170,
      render: (value: string | null) => toDateLabel(value),
      exportValue: (row) => toDateLabel(row.lastMovementAt),
    },
    {
      title: 'Department',
      dataIndex: 'macroDepartment',
      key: 'macroDepartment',
      width: 130,
      filters: ALLOWED_DEPARTMENTS.map((department) => ({ text: department, value: department })),
      filteredValue: reconciliationParams.macroDepartments ?? null,
      render: (value: Department | null | undefined) => value ?? '-',
    },
    {
      title: 'Drill-down',
      key: 'sourceDocument',
      width: 220,
      render: (_: unknown, row) => {
        if (row.movementRowCount > 1) {
          return (
            <Button
              type="link"
              size="small"
              onClick={() => navigate(buildReconciliationTimelinePath(row))}
            >
              View Timeline Rows
            </Button>
          )
        }
        return (
          <SourceDocumentAction
            sourceDocumentType={row.sourceDocumentType}
            sourceDocumentId={row.sourceDocumentId}
            sourceDocumentNumber={row.sourceDocumentNumber}
            onNavigate={navigate}
          />
        )
      },
      exportValue: (row) =>
        row.movementRowCount > 1
          ? `Timeline ${row.skuCode}/${row.locationId}`
          : row.sourceDocumentNumber ?? row.sourceDocumentId ?? '',
    },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Movement Timeline & Reconciliation
        </Typography.Title>
        <Typography.Text type="secondary">
          Server-driven movement visibility with reconciliation support for high-volume SKU auditing.
        </Typography.Text>
      </Card>

      <Card size="small" title="Shared Filters">
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Start Date
            </Typography.Text>
            <DatePicker
              style={{ width: '100%' }}
              value={timelineParams.startDate ? dayjs(timelineParams.startDate) : null}
              onChange={(value) =>
                applySharedFilter('startDate', value ? value.format('YYYY-MM-DD') : undefined)
              }
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              End Date
            </Typography.Text>
            <DatePicker
              style={{ width: '100%' }}
              value={timelineParams.endDate ? dayjs(timelineParams.endDate) : null}
              onChange={(value) =>
                applySharedFilter('endDate', value ? value.format('YYYY-MM-DD') : undefined)
              }
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              SKU Contains
            </Typography.Text>
            <Input
              allowClear
              value={timelineParams.skuCode}
              placeholder="e.g. SHOE-123"
              onChange={(event) => applySharedFilter('skuCode', event.target.value || undefined)}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Location ID (exact)
            </Typography.Text>
            <Input
              allowClear
              value={timelineParams.locationId}
              placeholder="Exact location id"
              onChange={(event) => applySharedFilter('locationId', event.target.value || undefined)}
            />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Movement Types
            </Typography.Text>
            <Select
              mode="multiple"
              allowClear
              placeholder="All movement types"
              style={{ width: '100%' }}
              value={timelineParams.movementTypes}
              options={MOVEMENT_TYPE_OPTIONS}
              onChange={(values) =>
                setTimelineParams((prev) => ({
                  ...prev,
                  movementTypes: values.length > 0 ? (values as MovementType[]) : undefined,
                  page: 1,
                }))
              }
            />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Macro Department
            </Typography.Text>
            <Select
              mode="multiple"
              allowClear
              placeholder="All departments"
              style={{ width: '100%' }}
              value={timelineParams.macroDepartments}
              options={ALLOWED_DEPARTMENTS.map((department) => ({
                label: department,
                value: department,
              }))}
              onChange={(values) =>
                applySharedFilter(
                  'macroDepartments',
                  values.length > 0 ? (values as Department[]) : undefined,
                )
              }
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Category Min
            </Typography.Text>
            <InputNumber
              min={CATEGORY_MIN}
              max={CATEGORY_MAX}
              style={{ width: '100%' }}
              value={timelineParams.categoryMin}
              onChange={(value) =>
                applySharedFilter('categoryMin', value == null ? undefined : Number(value))
              }
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Category Max
            </Typography.Text>
            <InputNumber
              min={CATEGORY_MIN}
              max={CATEGORY_MAX}
              style={{ width: '100%' }}
              value={timelineParams.categoryMax}
              onChange={(value) =>
                applySharedFilter('categoryMax', value == null ? undefined : Number(value))
              }
            />
          </Col>
        </Row>
        {isDateRangeInvalid && (
          <Alert
            style={{ marginTop: 12 }}
            type="warning"
            showIcon
            message="Invalid date range"
            description="Start Date cannot be after End Date. Date filters are paused until the range is corrected."
          />
        )}
      </Card>

      <Card size="small">
        <ServerDataTable<MovementTimelineRow>
          title={
            <Space>
              <Typography.Text strong>Movement Timeline</Typography.Text>
              <Typography.Text type="secondary">
                Rows: {movementSummary.count.toLocaleString()} | Visible delta: {toNumberLabel(movementSummary.delta)}
              </Typography.Text>
            </Space>
          }
          data={timelineQuery.data?.data}
          columns={timelineColumns}
          rowKey="id"
          loading={timelineQuery.isLoading}
          fetching={timelineQuery.isFetching}
          pagination={timelineQuery.data?.pagination}
          onQueryChange={handleTimelineQueryChange}
          expectedTotalRows={timelineQuery.data?.pagination.totalItems}
          exportFileName={`movement-timeline-${new Date().toISOString().slice(0, 10)}`}
          scrollX={1560}
        />
      </Card>

      <Card size="small">
        <ServerDataTable<MovementReconciliationRow>
          title={<Typography.Text strong>Movement Reconciliation</Typography.Text>}
          data={reconciliationQuery.data?.data}
          columns={reconciliationColumns}
          rowKey="id"
          loading={reconciliationQuery.isLoading}
          fetching={reconciliationQuery.isFetching}
          pagination={reconciliationQuery.data?.pagination}
          onQueryChange={handleReconciliationQueryChange}
          expectedTotalRows={reconciliationQuery.data?.pagination.totalItems}
          exportFileName={`movement-reconciliation-${new Date().toISOString().slice(0, 10)}`}
          scrollX={1360}
        />
      </Card>
    </Space>
  )
}
