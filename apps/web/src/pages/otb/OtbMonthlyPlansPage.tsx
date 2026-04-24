import { useCallback, useMemo, useState } from 'react'
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import ServerDataTable, { type ServerQueryChange, type ServerTableColumn } from '../../components/ServerDataTable'
import { DraggableModal } from '../../components/draggable-modal'
import {
  useCreateOtbMonthlyPlan,
  useDeleteOtbMonthlyPlan,
  useOtbBudgets,
  useOtbMonthlyPlans,
  useUpdateOtbMonthlyPlan,
} from '../../hooks/useOtb'
import { useSkus } from '../../hooks/useSkus'
import { ALLOWED_DEPARTMENTS, isValidCategoryCode, isValidDepartment } from '../../constants/domain'
import { validateDomainFilterContract } from '../../services/domainFilterContract'
import { OtbApiError } from '../../services/otbApi'
import { getErrorMessage } from '../../utils/errors'
import type { Department } from '../../types/sku'
import type {
  CreateOtbMonthlyPlanPayload,
  OtbMonthlyPlanParams,
  OtbMonthlyPlanRow,
  UpdateOtbMonthlyPlanPayload,
} from '../../types/otb'

interface PlanFormValues {
  otbBudgetId?: string
  skuId?: string
  skuSizeId?: string
  budgetAmount: number
  committedAmount: number
  receivedAmount: number
  notes?: string
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: dayjs().month(index).format('MMMM'),
}))

const MONTHLY_PLAN_SORT_FIELDS: Array<NonNullable<OtbMonthlyPlanParams['sort']>> = [
  'planMonth',
  'macroDepartment',
  'style',
  'sizeLabel',
  'budgetAmount',
  'committedAmount',
  'receivedAmount',
  'remainingToCommitAmount',
  'remainingToReceiveAmount',
  'budgetVsReceivedVarianceAmount',
  'updatedAt',
]

// Currency is Honduran Lempira (HNL) system-wide — labeled once at the top of
// the page, not repeated in every cell (see CLAUDE.md "Currency" policy).
function currency(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function coerceSortField(sort: string | undefined): OtbMonthlyPlanParams['sort'] | undefined {
  if (!sort) return undefined
  return (MONTHLY_PLAN_SORT_FIELDS as string[]).includes(sort)
    ? (sort as NonNullable<OtbMonthlyPlanParams['sort']>)
    : undefined
}

function readErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof OtbApiError) {
    switch (err.code) {
      case 'DUPLICATE_PLAN_LINE':
        return 'A monthly plan line already exists for this budget and SKU size.'
      case 'SKU_SIZE_MISMATCH':
        return 'The selected size does not belong to the selected SKU.'
      case 'DEPARTMENT_MISMATCH':
        return 'The selected budget department must match the selected SKU department.'
      case 'CATEGORY_GUARDRAIL':
        return 'SKU category must be within womens range 556-599.'
      case 'CONSTRAINT_VIOLATION':
        return 'Amounts must satisfy: 0 <= received <= committed <= budget.'
      default:
        return err.message || fallback
    }
  }

  if (err instanceof Error) {
    return err.message || fallback
  }

  return fallback
}

export default function OtbMonthlyPlansPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm<PlanFormValues>()

  const [params, setParams] = useState<OtbMonthlyPlanParams>({
    page: 1,
    pageSize: 50,
    sort: 'updatedAt',
    order: 'desc',
  })
  const [skuSearch, setSkuSearch] = useState('')
  const [editingRecord, setEditingRecord] = useState<OtbMonthlyPlanRow | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const selectedBudgetId = Form.useWatch('otbBudgetId', form)
  const selectedSkuId = Form.useWatch('skuId', form)

  const plansQuery = useOtbMonthlyPlans(params)
  const createMutation = useCreateOtbMonthlyPlan()
  const updateMutation = useUpdateOtbMonthlyPlan()
  const deleteMutation = useDeleteOtbMonthlyPlan()

  const budgetsQuery = useOtbBudgets({
    page: 1,
    pageSize: 200,
    sort: 'year',
    order: 'desc',
  })

  const budgets = budgetsQuery.data?.data ?? []
  const selectedBudget = budgets.find((budget) => budget.id === selectedBudgetId)

  const skusQuery = useSkus({
    page: 1,
    pageSize: 100,
    q: skuSearch || undefined,
    active: true,
    department: selectedBudget?.department,
  })

  const validSkus = useMemo(
    () =>
      (skusQuery.data?.data ?? []).filter(
        (sku) => isValidDepartment(sku.department) && isValidCategoryCode(sku.categoryId),
      ),
    [skusQuery.data?.data],
  )

  const selectedSku = validSkus.find((sku) => sku.id === selectedSkuId)
  const selectedSkuSizes = useMemo(
    () => (selectedSku?.sizes ?? []).filter((size) => size.active),
    [selectedSku?.sizes],
  )

  const filterValidation = useMemo(
    () => validateDomainFilterContract({ department: params.department }),
    [params.department],
  )

  const queryErrorMessage = plansQuery.error
    ? getErrorMessage(plansQuery.error, 'Unable to load monthly plans.')
    : budgetsQuery.error
      ? getErrorMessage(budgetsQuery.error, 'Unable to load OTB budgets.')
      : skusQuery.error
        ? getErrorMessage(skusQuery.error, 'Unable to load SKU options.')
        : null

  const closeModal = useCallback(() => {
    form.resetFields()
    setSkuSearch('')
    setEditingRecord(null)
    setIsModalOpen(false)
  }, [form])

  const openCreateModal = useCallback(() => {
    setEditingRecord(null)
    form.setFieldsValue({
      budgetAmount: 0,
      committedAmount: 0,
      receivedAmount: 0,
      notes: '',
    })
    setIsModalOpen(true)
  }, [form])

  const openEditModal = useCallback(
    (record: OtbMonthlyPlanRow) => {
      setEditingRecord(record)
      form.setFieldsValue({
        budgetAmount: record.budgetAmount,
        committedAmount: record.committedAmount,
        receivedAmount: record.receivedAmount,
        notes: record.notes ?? '',
      })
      setIsModalOpen(true)
    },
    [form],
  )

  const handleQueryChange = useCallback((query: ServerQueryChange) => {
    const hasDepartmentFilter =
      query.filters != null && Object.prototype.hasOwnProperty.call(query.filters, 'macroDepartment')
    const departmentFilter = hasDepartmentFilter ? query.filters?.macroDepartment ?? [] : null

    setParams((prev) => ({
      ...prev,
      page: query.page,
      pageSize: query.pageSize,
      sort: coerceSortField(query.sort) ?? prev.sort,
      order: query.order ?? prev.order,
      department:
        departmentFilter == null
          ? prev.department
          : departmentFilter.length > 0
            ? (departmentFilter[0] as Department)
            : undefined,
    }))
  }, [])

  const handleDelete = useCallback(
    async (record: OtbMonthlyPlanRow) => {
      try {
        setDeletingId(record.id)
        await deleteMutation.mutateAsync(record.id)
        message.success('Monthly plan line deleted')
      } catch (err) {
        message.error(readErrorMessage(err, 'Failed to delete monthly plan line'))
      } finally {
        setDeletingId(null)
      }
    },
    [deleteMutation, message],
  )

  const handleSubmitModal = useCallback(async () => {
    const values = await form.validateFields()
    const budgetAmount = Number(values.budgetAmount ?? 0)
    const committedAmount = Number(values.committedAmount ?? 0)
    const receivedAmount = Number(values.receivedAmount ?? 0)

    if (receivedAmount > committedAmount || committedAmount > budgetAmount) {
      message.error('Amounts must satisfy: 0 <= received <= committed <= budget.')
      return
    }

    try {
      if (editingRecord) {
        const payload: UpdateOtbMonthlyPlanPayload = {
          budgetAmount,
          committedAmount,
          receivedAmount,
          notes: values.notes?.trim() ? values.notes.trim() : null,
        }
        await updateMutation.mutateAsync({ planId: editingRecord.id, payload })
        message.success('Monthly plan line updated')
      } else {
        if (!values.otbBudgetId || !values.skuId || !values.skuSizeId) {
          message.error('Budget, SKU, and size are required.')
          return
        }

        const payload: CreateOtbMonthlyPlanPayload = {
          otbBudgetId: values.otbBudgetId,
          skuId: values.skuId,
          skuSizeId: values.skuSizeId,
          budgetAmount,
          committedAmount,
          receivedAmount,
          notes: values.notes?.trim() ? values.notes.trim() : undefined,
        }
        await createMutation.mutateAsync(payload)
        message.success('Monthly plan line created')
      }

      closeModal()
    } catch (err) {
      message.error(readErrorMessage(err, 'Failed to save monthly plan line'))
    }
  }, [closeModal, createMutation, editingRecord, form, message, updateMutation])

  const columns: ServerTableColumn<OtbMonthlyPlanRow>[] = useMemo(
    () => [
      {
        title: 'Plan Month',
        dataIndex: 'planMonth',
        key: 'planMonth',
        width: 120,
        sorter: true,
      },
      {
        title: 'Department',
        dataIndex: 'macroDepartment',
        key: 'macroDepartment',
        width: 130,
        sorter: true,
        filters: ALLOWED_DEPARTMENTS.map((department) => ({ text: department, value: department })),
        filteredValue: params.department ? [params.department] : null,
        render: (value: Department) => <Tag color="blue">{value}</Tag>,
      },
      {
        title: 'Style',
        dataIndex: 'style',
        key: 'style',
        width: 200,
        sorter: true,
        ellipsis: true,
      },
      {
        title: 'Size',
        dataIndex: 'sizeLabel',
        key: 'sizeLabel',
        width: 90,
        sorter: true,
      },
      {
        title: 'Budget',
        dataIndex: 'budgetAmount',
        key: 'budgetAmount',
        width: 130,
        sorter: true,
        align: 'right',
        render: (value: number) => currency(value),
        exportValue: (record) => record.budgetAmount.toFixed(2),
      },
      {
        title: 'Committed',
        dataIndex: 'committedAmount',
        key: 'committedAmount',
        width: 130,
        sorter: true,
        align: 'right',
        render: (value: number) => currency(value),
        exportValue: (record) => record.committedAmount.toFixed(2),
      },
      {
        title: 'Received',
        dataIndex: 'receivedAmount',
        key: 'receivedAmount',
        width: 130,
        sorter: true,
        align: 'right',
        render: (value: number) => currency(value),
        exportValue: (record) => record.receivedAmount.toFixed(2),
      },
      {
        title: 'Remaining To Commit',
        dataIndex: 'remainingToCommitAmount',
        key: 'remainingToCommitAmount',
        width: 170,
        sorter: true,
        align: 'right',
        render: (value: number) => currency(value),
        exportValue: (record) => record.remainingToCommitAmount.toFixed(2),
      },
      {
        title: 'Variance',
        dataIndex: 'budgetVsReceivedVarianceAmount',
        key: 'budgetVsReceivedVarianceAmount',
        width: 130,
        sorter: true,
        align: 'right',
        render: (value: number) =>
          value < 0 ? (
            <Typography.Text type="danger">{currency(value)}</Typography.Text>
          ) : (
            currency(value)
          ),
        exportValue: (record) => record.budgetVsReceivedVarianceAmount.toFixed(2),
      },
      {
        title: 'Updated',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        width: 160,
        sorter: true,
        render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
        exportValue: (record) => dayjs(record.updatedAt).format('YYYY-MM-DD HH:mm'),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 120,
        fixed: 'right',
        render: (_value: unknown, record: OtbMonthlyPlanRow) => (
          <Space size={4}>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
              aria-label="Edit monthly plan line"
            />
            <Popconfirm
              title="Delete this plan line?"
              description="This action cannot be undone."
              okButtonProps={{ danger: true }}
              onConfirm={() => void handleDelete(record)}
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={deletingId === record.id}
                aria-label="Delete monthly plan line"
              />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [deletingId, handleDelete, openEditModal, params.department],
  )

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
      {queryErrorMessage && (
        <Alert
          type="error"
          showIcon
          message="OTB monthly plan request failed"
          description={queryErrorMessage}
        />
      )}
      <Card size="small">
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              OTB Monthly Plans
            </Typography.Title>
            <Typography.Text type="secondary">
              Month + macro-department + SKU-size planning lines with server-side controls and CRUD.
            </Typography.Text>
            <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>
              Amounts in Lempira (HNL).
            </Typography.Paragraph>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            Add Plan Line
          </Button>
        </Space>
      </Card>

      <Card size="small" title="Filters">
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Year
            </Typography.Text>
            <InputNumber
              min={2020}
              max={2099}
              placeholder="e.g. 2026"
              style={{ width: '100%' }}
              value={params.year}
              onChange={(value) =>
                setParams((prev) => ({ ...prev, year: value == null ? undefined : Number(value), page: 1 }))
              }
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Month
            </Typography.Text>
            <Select
              allowClear
              placeholder="All months"
              style={{ width: '100%' }}
              value={params.month}
              onChange={(value) =>
                setParams((prev) => ({ ...prev, month: value as number | undefined, page: 1 }))
              }
              options={MONTH_OPTIONS}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Department
            </Typography.Text>
            <Select
              allowClear
              placeholder="All departments"
              style={{ width: '100%' }}
              value={params.department}
              onChange={(value) =>
                setParams((prev) => ({ ...prev, department: value as Department | undefined, page: 1 }))
              }
              options={ALLOWED_DEPARTMENTS.map((department) => ({
                label: department,
                value: department,
              }))}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Style Contains
            </Typography.Text>
            <Input
              allowClear
              placeholder="e.g. Pump"
              value={params.style}
              onChange={(event) =>
                setParams((prev) => ({ ...prev, style: event.target.value || undefined, page: 1 }))
              }
            />
          </Col>
        </Row>
      </Card>

      <Card size="small">
        <ServerDataTable<OtbMonthlyPlanRow>
          title={<Typography.Text strong>Monthly Plan Lines</Typography.Text>}
          data={plansQuery.data?.data}
          columns={columns}
          rowKey="id"
          loading={plansQuery.isLoading}
          fetching={plansQuery.isFetching}
          pagination={plansQuery.data?.pagination}
          onQueryChange={handleQueryChange}
          expectedTotalRows={plansQuery.data?.pagination.totalItems}
          exportFileName={`otb-monthly-plans-${new Date().toISOString().slice(0, 10)}`}
          scrollX={1500}
        />
      </Card>

      <DraggableModal
        title={editingRecord ? 'Edit Monthly Plan Line' : 'Create Monthly Plan Line'}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={() => void handleSubmitModal()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        destroyOnClose
      >
        <Form<PlanFormValues>
          form={form}
          layout="vertical"
          initialValues={{ budgetAmount: 0, committedAmount: 0, receivedAmount: 0, notes: '' }}
        >
          {editingRecord ? (
            <Card size="small" style={{ marginBottom: 12 }}>
              <Space direction="vertical" size={2}>
                <Typography.Text>
                  <Typography.Text strong>Plan Month:</Typography.Text> {editingRecord.planMonth}
                </Typography.Text>
                <Typography.Text>
                  <Typography.Text strong>Department:</Typography.Text> {editingRecord.macroDepartment}
                </Typography.Text>
                <Typography.Text>
                  <Typography.Text strong>Style / Size:</Typography.Text> {editingRecord.style} / {editingRecord.sizeLabel}
                </Typography.Text>
              </Space>
            </Card>
          ) : (
            <>
              <Form.Item
                label="OTB Budget"
                name="otbBudgetId"
                rules={[{ required: true, message: 'OTB budget is required' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select budget month + department"
                  loading={budgetsQuery.isFetching}
                  onChange={() => {
                    form.setFieldsValue({ skuId: undefined, skuSizeId: undefined })
                    setSkuSearch('')
                  }}
                  options={budgets.map((budget) => ({
                    value: budget.id,
                    label: `${budget.department} ${budget.year}-${String(budget.month).padStart(2, '0')} | ${currency(budget.plannedBudget)}`,
                  }))}
                />
              </Form.Item>

              <Form.Item
                label="SKU"
                name="skuId"
                rules={[{ required: true, message: 'SKU is required' }]}
                extra="SKU search is constrained to the selected budget department."
              >
                <Select
                  showSearch
                  filterOption={false}
                  optionFilterProp="label"
                  placeholder="Search SKU by style or code"
                  loading={skusQuery.isFetching}
                  onSearch={setSkuSearch}
                  onChange={() => form.setFieldsValue({ skuSizeId: undefined })}
                  disabled={!selectedBudget}
                  options={validSkus.map((sku) => ({
                    value: sku.id,
                    label: `${sku.skuCode} - ${sku.style} (${sku.department}/${sku.categoryId ?? '--'})`,
                  }))}
                />
              </Form.Item>

              <Form.Item
                label="Size"
                name="skuSizeId"
                rules={[{ required: true, message: 'SKU size is required' }]}
              >
                <Select
                  placeholder="Select size"
                  disabled={!selectedSku}
                  options={selectedSkuSizes.map((size) => ({
                    value: size.id,
                    label: size.sizeLabel,
                  }))}
                />
              </Form.Item>
            </>
          )}

          <Row gutter={12}>
            <Col span={8}>
              <Form.Item
                label="Budget Amount"
                name="budgetAmount"
                rules={[{ required: true, message: 'Budget amount is required' }]}
              >
                <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="Committed Amount"
                name="committedAmount"
                rules={[
                  { required: true, message: 'Committed amount is required' },
                  ({ getFieldValue }) => ({
                    validator(_rule, value) {
                      const budget = Number(getFieldValue('budgetAmount') ?? 0)
                      const committed = Number(value ?? 0)
                      if (committed <= budget) return Promise.resolve()
                      return Promise.reject(new Error('Committed cannot exceed budget.'))
                    },
                  }),
                ]}
              >
                <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="Received Amount"
                name="receivedAmount"
                rules={[
                  { required: true, message: 'Received amount is required' },
                  ({ getFieldValue }) => ({
                    validator(_rule, value) {
                      const committed = Number(getFieldValue('committedAmount') ?? 0)
                      const received = Number(value ?? 0)
                      if (received <= committed) return Promise.resolve()
                      return Promise.reject(new Error('Received cannot exceed committed.'))
                    },
                  }),
                ]}
              >
                <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={3} maxLength={1000} placeholder="Optional notes for this plan line" />
          </Form.Item>
        </Form>
      </DraggableModal>
    </Space>
  )
}
