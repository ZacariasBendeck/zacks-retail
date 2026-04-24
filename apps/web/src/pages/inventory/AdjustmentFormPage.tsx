import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Card,
  Row,
  Col,
  Space,
  Typography,
  App,
  Divider,
  Table,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useCreateAdjustment } from '../../hooks/useAdjustments'
import { useLocations } from '../../hooks/useAdjustments'
import { useSkus } from '../../hooks/useSkus'
import type { AdjustmentType } from '../../types/adjustment'
import type { Sku } from '../../types/sku'
import { isValidCategoryCode, isValidDepartment } from '../../constants/domain'

const ADJUSTMENT_TYPES: { label: string; value: AdjustmentType }[] = [
  { label: 'Receipt', value: 'RECEIPT' },
  { label: 'Transfer', value: 'TRANSFER' },
  { label: 'Manual Adjust', value: 'MANUAL_ADJUST' },
  { label: 'Return', value: 'RETURN' },
  { label: 'Damage', value: 'DAMAGE' },
  { label: 'Shrinkage', value: 'SHRINKAGE' },
]

const TYPES_WITH_REASON: AdjustmentType[] = ['MANUAL_ADJUST', 'DAMAGE', 'SHRINKAGE']
const TYPES_WITH_FROM_LOCATION: AdjustmentType[] = ['TRANSFER']
const TYPES_WITH_TO_LOCATION: AdjustmentType[] = ['RECEIPT', 'TRANSFER', 'RETURN']
const QUICK_START_TYPES: AdjustmentType[] = ['MANUAL_ADJUST', 'TRANSFER', 'RECEIPT']

interface LineItemRow {
  key: string
  skuId: string
  quantity: number
}

function isGuardrailSku(sku: Sku): boolean {
  return isValidDepartment(sku.department) && isValidCategoryCode(sku.categoryId)
}

export default function AdjustmentFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const createMutation = useCreateAdjustment()

  const initialType = useMemo(() => {
    const type = searchParams.get('type')
    if (!type) return undefined
    return QUICK_START_TYPES.includes(type as AdjustmentType) ? (type as AdjustmentType) : undefined
  }, [searchParams])

  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType | undefined>(initialType)
  const [lineItems, setLineItems] = useState<LineItemRow[]>([
    { key: crypto.randomUUID(), skuId: '', quantity: 1 },
  ])
  const [skuSearch, setSkuSearch] = useState('')

  const { data: locations } = useLocations()
  const { data: skuData } = useSkus({ page: 1, pageSize: 50, q: skuSearch || undefined, active: true })
  const validSkus = useMemo(() => (skuData?.data ?? []).filter(isGuardrailSku), [skuData?.data])

  if (initialType === 'RECEIPT') {
    return <Navigate to="/inventory/manual-receipts/new" replace />
  }

  useEffect(() => {
    if (!initialType) return
    setAdjustmentType(initialType)
    form.setFieldValue('type', initialType)
  }, [form, initialType])

  const showFromLocation = adjustmentType && TYPES_WITH_FROM_LOCATION.includes(adjustmentType)
  const showToLocation = adjustmentType && TYPES_WITH_TO_LOCATION.includes(adjustmentType)
  const showReason = adjustmentType && TYPES_WITH_REASON.includes(adjustmentType)
  const pageTitle =
    adjustmentType === 'TRANSFER'
      ? 'Initiate Transfer'
      : adjustmentType === 'RECEIPT'
        ? 'Receive Transfer'
        : 'New Adjustment'

  const addLineItem = () => {
    setLineItems((prev) => [...prev, { key: crypto.randomUUID(), skuId: '', quantity: 1 }])
  }

  const removeLineItem = (key: string) => {
    setLineItems((prev) => prev.filter((li) => li.key !== key))
  }

  const updateLineItem = (key: string, field: 'skuId' | 'quantity', value: string | number) => {
    setLineItems((prev) =>
      prev.map((li) => (li.key === key ? { ...li, [field]: value } : li)),
    )
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    const validLines = lineItems.filter((li) => li.skuId)
    if (validLines.length === 0) {
      message.error('Add at least one SKU line item')
      return
    }

    const type = values.type as AdjustmentType
    const normalizedLines = validLines.map((li) => {
      const integerQty = Math.trunc(li.quantity)
      if (type === 'DAMAGE' || type === 'SHRINKAGE') {
        return { skuId: li.skuId, quantity: -Math.abs(integerQty) }
      }
      if (type === 'MANUAL_ADJUST') {
        return { skuId: li.skuId, quantity: integerQty }
      }
      return { skuId: li.skuId, quantity: Math.abs(integerQty) }
    })

    if (normalizedLines.some((line) => line.quantity === 0)) {
      message.error('Line item quantities cannot be zero')
      return
    }

    try {
      await createMutation.mutateAsync({
        type,
        fromLocationId: (values.fromLocationId as string) || null,
        toLocationId: (values.toLocationId as string) || null,
        reason: (values.reason as string) || null,
        lineItems: normalizedLines,
      })
      message.success('Adjustment recorded successfully')
      navigate('/inventory/adjustments')
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'An error occurred'
      if (errMsg.includes('below zero') || errMsg.includes('409')) {
        message.error('Adjustment would bring stock below zero. Check quantities.')
      } else {
        message.error(errMsg)
      }
    }
  }

  const lineItemColumns = [
    {
      title: 'SKU',
      key: 'skuId',
      width: 300,
      render: (_: unknown, record: LineItemRow) => (
        <Select
          showSearch
          placeholder="Search SKU..."
          style={{ width: '100%' }}
          value={record.skuId || undefined}
          onSearch={setSkuSearch}
          onChange={(v) => updateLineItem(record.key, 'skuId', v)}
          filterOption={false}
          options={validSkus.map((s) => ({
            label: `${s.skuCode} - ${s.style} (${s.department}/${s.categoryId})`,
            value: s.id,
          }))}
        />
      ),
    },
    {
      title: 'Quantity',
      key: 'quantity',
      width: 140,
      render: (_: unknown, record: LineItemRow) => (
        <InputNumber
          min={adjustmentType === 'MANUAL_ADJUST' ? undefined : 1}
          precision={0}
          step={1}
          value={record.quantity}
          onChange={(v) => updateLineItem(record.key, 'quantity', v ?? 0)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: unknown, record: LineItemRow) =>
        lineItems.length > 1 ? (
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeLineItem(record.key)}
            size="small"
          />
        ) : null,
    },
  ]

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small">
          <Row align="middle">
            <Space>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/inventory/adjustments')}
              >
                Back
              </Button>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {pageTitle}
              </Typography.Title>
            </Space>
          </Row>
        </Card>

        <Card>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            requiredMark="optional"
            style={{ maxWidth: 800 }}
          >
            <Typography.Title level={5}>Adjustment Details</Typography.Title>

            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item
                  label="Type"
                  name="type"
                  rules={[{ required: true, message: 'Select adjustment type' }]}
                >
                  <Select
                    placeholder="Select type"
                    options={ADJUSTMENT_TYPES}
                    onChange={(v) => setAdjustmentType(v)}
                  />
                </Form.Item>
              </Col>

              {showFromLocation && (
                <Col xs={24} sm={8}>
                  <Form.Item
                    label="From Location"
                    name="fromLocationId"
                    rules={[{ required: true, message: 'From location is required' }]}
                  >
                    <Select
                      placeholder="Select origin"
                      options={locations?.map((l) => ({ label: l.name, value: l.id }))}
                    />
                  </Form.Item>
                </Col>
              )}

              {showToLocation && (
                <Col xs={24} sm={8}>
                  <Form.Item
                    label="To Location"
                    name="toLocationId"
                    rules={[{ required: true, message: 'To location is required' }]}
                  >
                    <Select
                      placeholder="Select destination"
                      options={locations?.map((l) => ({ label: l.name, value: l.id }))}
                    />
                  </Form.Item>
                </Col>
              )}
            </Row>

            {showReason && (
              <Form.Item
                label="Reason"
                name="reason"
                rules={[
                  { required: true, message: 'Reason is required for this type' },
                  { max: 500, message: 'Max 500 characters' },
                ]}
              >
                <Input.TextArea rows={2} placeholder="Explain the reason for this adjustment" />
              </Form.Item>
            )}

            <Divider />
            <Typography.Title level={5}>Line Items</Typography.Title>
            <Typography.Paragraph type="secondary">
              SKU options are limited to womens categories 556-599 and approved macro-departments.
            </Typography.Paragraph>
            {(adjustmentType === 'DAMAGE' || adjustmentType === 'SHRINKAGE') && (
              <Typography.Paragraph type="warning">
                Enter positive quantities; the transaction is posted as a stock deduction.
              </Typography.Paragraph>
            )}

            <Table
              dataSource={lineItems}
              columns={lineItemColumns}
              rowKey="key"
              pagination={false}
              size="small"
              footer={() => (
                <Button type="dashed" onClick={addLineItem} icon={<PlusOutlined />} block>
                  Add Line Item
                </Button>
              )}
            />

            <Divider />

            <Form.Item>
              <Space>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={createMutation.isPending}
                  size="large"
                >
                  Submit Adjustment
                </Button>
                <Button onClick={() => navigate('/inventory/adjustments')} size="large">
                  Cancel
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      </Space>
    </App>
  )
}

