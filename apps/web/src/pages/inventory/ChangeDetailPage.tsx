import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { HistoryOutlined } from '@ant-design/icons'
import { useChangeDetail } from '../../hooks/useRicsInventory'
import type { ChangeDetailParams, ChangeDetailRow } from '../../services/ricsInventoryApi'
import { getErrorMessage } from '../../utils/errors'

// RICS Ch. 2 p. 55 / Ch. 4 p. 72 — browse the RIINVCHG movement ledger.
// The ledger is ~11 M rows so the API refuses unscoped queries: require a
// SKU or a ≤ 90-day date window.

const CHG_TYPE_META: Record<string, { label: string; color: string; hint: string }> = {
  POR: { label: 'POR', color: 'green', hint: 'Purchase Order Receipt' },
  RET: { label: 'RET', color: 'volcano', hint: 'Return' },
  PHY: { label: 'PHY', color: 'geekblue', hint: 'Physical inventory count' },
  TOU: { label: 'TOU', color: 'orange', hint: 'Transfer Out' },
  TIN: { label: 'TIN', color: 'cyan', hint: 'Transfer In' },
  REC: { label: 'REC', color: 'purple', hint: 'Receive (misc)' },
}

const CHG_TYPE_OPTIONS = Object.entries(CHG_TYPE_META).map(([code, meta]) => ({
  value: code,
  label: `${code} — ${meta.hint}`,
}))

interface FormValues {
  sku?: string
  store?: number
  changeType?: string
  dateRange?: [Dayjs, Dayjs] | null
  limit?: number
}

export default function ChangeDetailPage() {
  const [form] = Form.useForm<FormValues>()
  const [activeParams, setActiveParams] = useState<ChangeDetailParams | null>(null)

  const { data, isLoading, isFetching, error } = useChangeDetail(activeParams)

  const handleRun = (values: FormValues) => {
    const [from, to] = values.dateRange ?? []
    const params: ChangeDetailParams = {
      sku: values.sku?.trim() || undefined,
      store: values.store ?? undefined,
      changeType: values.changeType || undefined,
      fromDate: from?.format('YYYY-MM-DD'),
      toDate: to?.format('YYYY-MM-DD'),
      limit: values.limit ?? 200,
    }
    setActiveParams(params)
  }

  const handleClear = () => {
    form.resetFields()
    setActiveParams(null)
  }

  const last30 = () => {
    form.setFieldValue('dateRange', [dayjs().subtract(30, 'day'), dayjs()])
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Change Detail
        </Typography.Title>
        <Typography.Text type="secondary">
          RICS Ch. 2 p. 55 / Ch. 4 p. 72 — browse the InvChanges ledger. Filter by SKU, or a ≤ 90-day window.
        </Typography.Text>
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          onFinish={handleRun}
          initialValues={{ limit: 200 }}
        >
          <Row gutter={16}>
            <Col xs={24} sm={8} md={6}>
              <Form.Item label="SKU" name="sku">
                <Input placeholder="e.g. 349101-BKPT" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={4} md={3}>
              <Form.Item label="Store #" name="store">
                <InputNumber min={1} style={{ width: '100%' }} placeholder="All" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Form.Item label="Change Type" name="changeType">
                <Select
                  allowClear
                  placeholder="All"
                  options={CHG_TYPE_OPTIONS}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Date Range" name="dateRange">
                <DatePicker.RangePicker style={{ width: '100%' }} allowClear />
              </Form.Item>
            </Col>
            <Col xs={12} sm={4} md={3}>
              <Form.Item label="Limit" name="limit">
                <InputNumber min={1} max={1000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              icon={<HistoryOutlined />}
              loading={isFetching}
            >
              Run
            </Button>
            <Button onClick={last30}>Last 30 days</Button>
            <Button onClick={handleClear}>Clear</Button>
          </Space>
        </Form>
      </Card>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Change Detail query failed"
          description={getErrorMessage(error, 'Unable to load Change Detail.')}
        />
      )}

      {!activeParams && !error && (
        <Card>
          <Empty description="Set a SKU or a date window, then click Run." />
        </Card>
      )}

      {activeParams && !error && isLoading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        </Card>
      )}

      {activeParams && !error && data && (
        <Card
          title={`Results (${data.total}${data.total >= (activeParams.limit ?? 200) ? '+' : ''})`}
          extra={
            data.total >= (activeParams.limit ?? 200) && (
              <Typography.Text type="warning">
                Result capped at limit — narrow filters or raise limit to see more.
              </Typography.Text>
            )
          }
        >
          {data.rows.length === 0 ? (
            <Empty description="No ledger entries match these filters." />
          ) : (
            <Table<ChangeDetailRow>
              dataSource={data.rows}
              rowKey={(r, i) => `${r.date}-${r.sku}-${r.store}-${r.changeType}-${i}`}
              size="small"
              pagination={{ pageSize: 50, showSizeChanger: true }}
              scroll={{ x: 1200 }}
              columns={[
                {
                  title: 'Date',
                  dataIndex: 'date',
                  key: 'date',
                  width: 160,
                  fixed: 'left',
                  render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'),
                  sorter: (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
                  defaultSortOrder: 'descend',
                },
                { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160, fixed: 'left' },
                { title: 'Store', dataIndex: 'store', key: 'store', width: 80 },
                {
                  title: 'Type',
                  dataIndex: 'changeType',
                  key: 'changeType',
                  width: 90,
                  render: (v: string) => {
                    const meta = CHG_TYPE_META[v]
                    const tag = <Tag color={meta?.color ?? 'default'}>{v || '—'}</Tag>
                    return meta ? <Tooltip title={meta.hint}>{tag}</Tooltip> : tag
                  },
                },
                {
                  title: 'Row / Col',
                  key: 'rowCol',
                  width: 110,
                  render: (_: unknown, r: ChangeDetailRow) => {
                    const parts = [r.rowLabel, r.columnLabel].filter(Boolean).join(' · ')
                    return parts || <Typography.Text type="secondary">—</Typography.Text>
                  },
                },
                {
                  title: 'Qty',
                  dataIndex: 'quantity',
                  key: 'quantity',
                  align: 'right',
                  width: 80,
                  render: (v: number) => (
                    <Typography.Text type={v < 0 ? 'danger' : undefined} strong>
                      {v}
                    </Typography.Text>
                  ),
                  sorter: (a, b) => a.quantity - b.quantity,
                },
                {
                  title: 'Cost',
                  dataIndex: 'cost',
                  key: 'cost',
                  align: 'right',
                  width: 100,
                  render: (v: number) => (v ? `$${v.toFixed(2)}` : '—'),
                },
                {
                  title: 'PO',
                  dataIndex: 'purchaseOrder',
                  key: 'po',
                  width: 100,
                  render: (v: string | null) => v || <Typography.Text type="secondary">—</Typography.Text>,
                },
                {
                  title: 'Counterpart',
                  dataIndex: 'otherStore',
                  key: 'otherStore',
                  width: 110,
                  render: (v: number | null) =>
                    v != null ? `Store ${v}` : <Typography.Text type="secondary">—</Typography.Text>,
                },
                {
                  title: 'RMA',
                  dataIndex: 'rmaNumber',
                  key: 'rma',
                  width: 100,
                  render: (v: string | null) => v || <Typography.Text type="secondary">—</Typography.Text>,
                },
              ]}
            />
          )}
        </Card>
      )}
    </Space>
  )
}
