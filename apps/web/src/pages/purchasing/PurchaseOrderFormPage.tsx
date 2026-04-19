import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  App,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Table,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import { useCreatePurchaseOrder } from '../../hooks/usePurchaseOrders'
import { useSkus, useVendors } from '../../hooks/useSkus'
import { isValidCategoryCode, isValidDepartment } from '../../constants/domain'

interface LineItemRow {
  key: string
  skuId: string
  quantity: number
  unitCost: number
}

export default function PurchaseOrderFormPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<{ vendorId: string; notes?: string }>()
  const createMutation = useCreatePurchaseOrder()

  const [lineItems, setLineItems] = useState<LineItemRow[]>([
    { key: crypto.randomUUID(), skuId: '', quantity: 1, unitCost: 1 },
  ])
  const [skuSearch, setSkuSearch] = useState('')

  const { data: vendors } = useVendors()
  const { data: skuData, isFetching: skusFetching } = useSkus({
    page: 1,
    pageSize: 100,
    q: skuSearch || undefined,
    active: true,
  })

  const validSkus = useMemo(
    () =>
      (skuData?.data ?? []).filter(
        (sku) => isValidDepartment(sku.department) && isValidCategoryCode(sku.categoryId),
      ),
    [skuData?.data],
  )

  const addLineItem = () => {
    setLineItems((prev) => [...prev, { key: crypto.randomUUID(), skuId: '', quantity: 1, unitCost: 1 }])
  }

  const removeLineItem = (key: string) => {
    setLineItems((prev) => prev.filter((line) => line.key !== key))
  }

  const updateLineItem = (
    key: string,
    field: 'skuId' | 'quantity' | 'unitCost',
    value: string | number,
  ) => {
    setLineItems((prev) =>
      prev.map((line) => (line.key === key ? { ...line, [field]: value } : line)),
    )
  }

  const handleSubmit = async (values: { vendorId: string; notes?: string }) => {
    const validLines = lineItems.filter((line) => line.skuId)
    if (validLines.length === 0) {
      message.error('Add at least one SKU line item')
      return
    }

    for (const line of validLines) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        message.error('Line quantities must be positive integers')
        return
      }
      if (line.unitCost <= 0) {
        message.error('Unit cost must be greater than zero')
        return
      }
    }

    try {
      const po = await createMutation.mutateAsync({
        vendorId: values.vendorId,
        notes: values.notes?.trim() || null,
        lineItems: validLines.map((line) => ({
          skuId: line.skuId,
          quantity: line.quantity,
          unitCost: Number(line.unitCost.toFixed(2)),
        })),
      })

      message.success('Purchase order created in Draft status')
      navigate(`/purchasing/orders/${po.id}`)
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to create purchase order')
    }
  }

  const lineItemColumns = [
    {
      title: 'SKU',
      key: 'skuId',
      width: 360,
      render: (_: unknown, record: LineItemRow) => (
        <Select
          showSearch
          filterOption={false}
          value={record.skuId || undefined}
          onSearch={setSkuSearch}
          onChange={(value) => updateLineItem(record.key, 'skuId', value)}
          loading={skusFetching}
          placeholder="Search SKU"
          style={{ width: '100%' }}
          options={validSkus.map((sku) => ({
            value: sku.id,
            label: `${sku.skuCode} - ${sku.style} (${sku.department}/${sku.categoryId})`,
          }))}
        />
      ),
    },
    {
      title: 'Quantity',
      key: 'quantity',
      width: 150,
      render: (_: unknown, record: LineItemRow) => (
        <InputNumber
          min={1}
          precision={0}
          value={record.quantity}
          onChange={(value) => updateLineItem(record.key, 'quantity', value ?? 1)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Unit Cost',
      key: 'unitCost',
      width: 170,
      render: (_: unknown, record: LineItemRow) => (
        <InputNumber
          min={0.01}
          step={0.01}
          precision={2}
          value={record.unitCost}
          onChange={(value) => updateLineItem(record.key, 'unitCost', value ?? 0.01)}
          style={{ width: '100%' }}
          prefix="$"
        />
      ),
    },
    {
      title: 'Line Total',
      key: 'lineTotal',
      width: 160,
      align: 'right' as const,
      render: (_: unknown, record: LineItemRow) =>
        `$${(record.quantity * record.unitCost).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record: LineItemRow) =>
        lineItems.length > 1 ? (
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeLineItem(record.key)}
            size="small"
            aria-label="Remove line item"
          />
        ) : null,
    },
  ]

  const subtotal = lineItems.reduce((sum, line) => sum + line.quantity * line.unitCost, 0)

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/purchasing/orders')}>
            Back
          </Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            New Purchase Order
          </Typography.Title>
        </Space>
      </Card>

      <Card>
        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark="optional">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Vendor"
                name="vendorId"
                rules={[{ required: true, message: 'Vendor is required' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select vendor"
                  options={vendors?.map((vendor) => ({ value: vendor.id, label: vendor.name }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Notes" name="notes">
                <Input.TextArea rows={2} maxLength={1000} placeholder="Optional notes" />
              </Form.Item>
            </Col>
          </Row>

          <Divider />
          <Typography.Title level={5}>Line Items</Typography.Title>
          <Typography.Paragraph type="secondary">
            SKU selection is limited to womens category range 556-599 and approved macro-departments.
          </Typography.Paragraph>

          <Table<LineItemRow>
            rowKey="key"
            columns={lineItemColumns}
            dataSource={lineItems}
            pagination={false}
            size="small"
            scroll={{ x: 960 }}
            footer={() => (
              <Button type="dashed" icon={<PlusOutlined />} onClick={addLineItem} block>
                Add Line Item
              </Button>
            )}
          />

          <Divider />

          <Row justify="end" style={{ marginBottom: 16 }}>
            <Typography.Text strong>
              Subtotal: ${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Typography.Text>
          </Row>

          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={createMutation.isPending}
              >
                Create Draft PO
              </Button>
              <Button onClick={() => navigate('/purchasing/orders')}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </Space>
  )
}
