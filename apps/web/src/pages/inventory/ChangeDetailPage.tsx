import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
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
import { HistoryOutlined, SearchOutlined } from '@ant-design/icons'
import { useChangeDetail } from '../../hooks/useRicsInventory'
import type { ChangeDetailParams, ChangeDetailRow } from '../../services/ricsInventoryApi'
import { getErrorMessage } from '../../utils/errors'
import { SkuLookup } from '../../components/sku-lookup'

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
  SAL: { label: 'SAL', color: 'magenta', hint: 'POS sale (ticket detail)' },
}

const CHG_TYPE_OPTIONS = Object.entries(CHG_TYPE_META).map(([code, meta]) => ({
  value: code,
  label: `${code} — ${meta.hint}`,
}))

type LedgerDisplayRow =
  | { kind: 'data'; rowKey: string; row: ChangeDetailRow }
  | { kind: 'subtotal'; rowKey: string; store: number; quantity: number }
  | { kind: 'grand'; rowKey: string; quantity: number; count: number }

interface FormValues {
  sku?: string
  store?: number
  changeType?: string
  dateRange?: [Dayjs, Dayjs] | null
  includeSales?: boolean
  limit?: number
}

export default function ChangeDetailPage() {
  const [form] = Form.useForm<FormValues>()
  const [activeParams, setActiveParams] = useState<ChangeDetailParams | null>(null)
  const [lookupOpen, setLookupOpen] = useState(false)

  const { data, isLoading, isFetching, error } = useChangeDetail(activeParams)

  // Group by store ASC, then date DESC within store — matches the per-SKU
  // ledger on /inventory/change-detail/:sku and mirrors the RICS screen.
  const sortedRows = useMemo(() => {
    if (!data?.rows) return []
    return [...data.rows].sort((a, b) => {
      if (a.store !== b.store) return a.store - b.store
      if (a.date < b.date) return 1
      if (a.date > b.date) return -1
      return 0
    })
  }, [data?.rows])

  // When no specific store is filtered, interleave per-store subtotal rows
  // and a grand total row at the bottom, like the RICS [Detail] screen.
  const ledgerRows = useMemo<LedgerDisplayRow[]>(() => {
    if (sortedRows.length === 0) return []
    const out: LedgerDisplayRow[] = []
    let currentStore: number | null = null
    let storeQty = 0
    let grandQty = 0
    let grandCount = 0
    for (let i = 0; i < sortedRows.length; i += 1) {
      const r = sortedRows[i]!
      if (currentStore != null && r.store !== currentStore) {
        out.push({ kind: 'subtotal', rowKey: `s-${currentStore}`, store: currentStore, quantity: storeQty })
        storeQty = 0
      }
      currentStore = r.store
      storeQty += r.quantity
      grandQty += r.quantity
      grandCount += 1
      out.push({ kind: 'data', rowKey: `d-${i}`, row: r })
    }
    if (currentStore != null) {
      out.push({ kind: 'subtotal', rowKey: `s-${currentStore}`, store: currentStore, quantity: storeQty })
    }
    out.push({ kind: 'grand', rowKey: 'g', quantity: grandQty, count: grandCount })
    return out
  }, [sortedRows])

  const handleRun = (values: FormValues) => {
    const [from, to] = values.dateRange ?? []
    const params: ChangeDetailParams = {
      sku: values.sku?.trim() || undefined,
      store: values.store ?? undefined,
      changeType: values.changeType || undefined,
      fromDate: from?.format('YYYY-MM-DD'),
      toDate: to?.format('YYYY-MM-DD'),
      limit: values.limit ?? 200,
      includeSales: !!values.includeSales,
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
                <Input
                  placeholder="e.g. 349101-BKPT"
                  allowClear
                  addonAfter={
                    <SearchOutlined
                      style={{ cursor: 'pointer' }}
                      onClick={() => setLookupOpen(true)}
                      title="Look up SKU"
                    />
                  }
                />
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
            <Col xs={24} sm={8} md={5}>
              <Form.Item label=" " name="includeSales" valuePropName="checked">
                <Checkbox>Include Sales (ticket detail)</Checkbox>
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
            <Button icon={<SearchOutlined />} onClick={() => setLookupOpen(true)}>
              Look up SKU
            </Button>
            <Button onClick={last30}>Last 30 days</Button>
            <Button onClick={handleClear}>Clear</Button>
          </Space>
        </Form>
      </Card>

      <SkuLookup
        open={lookupOpen}
        onClose={() => setLookupOpen(false)}
        onSelect={(picked) => {
          form.setFieldValue('sku', picked.skuCode)
          setLookupOpen(false)
        }}
        initialQuery={form.getFieldValue('sku') ?? ''}
      />

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
            <Table<LedgerDisplayRow>
              dataSource={ledgerRows}
              rowKey="rowKey"
              size="small"
              pagination={false}
              scroll={{ x: 1200, y: 560 }}
              rowClassName={(r) =>
                r.kind === 'grand' ? 'ledger-grand' : r.kind === 'subtotal' ? 'ledger-subtotal' : ''
              }
              columns={[
                {
                  title: 'Store',
                  key: 'store',
                  width: 80,
                  fixed: 'left',
                  render: (_v, r) => (r.kind === 'data' ? r.row.store : r.kind === 'subtotal' ? r.store : ''),
                },
                {
                  title: 'Date',
                  key: 'date',
                  width: 160,
                  render: (_v, r) =>
                    r.kind === 'data' && r.row.date ? dayjs(r.row.date).format('YYYY-MM-DD HH:mm') : '',
                },
                {
                  title: 'SKU',
                  key: 'sku',
                  width: 160,
                  fixed: 'left',
                  render: (_v, r) => (r.kind === 'data' ? r.row.sku : ''),
                },
                {
                  title: 'Type',
                  key: 'changeType',
                  width: 160,
                  render: (_v, r) => {
                    if (r.kind === 'subtotal') {
                      return <Typography.Text strong>{`*** Store ${r.store} Total ***`}</Typography.Text>
                    }
                    if (r.kind === 'grand') {
                      return <Typography.Text strong>*** Grand Total ***</Typography.Text>
                    }
                    const meta = CHG_TYPE_META[r.row.changeType]
                    const tag = <Tag color={meta?.color ?? 'default'}>{r.row.changeType || '—'}</Tag>
                    return meta ? <Tooltip title={meta.hint}>{tag}</Tooltip> : tag
                  },
                },
                {
                  title: 'Row / Col',
                  key: 'rowCol',
                  width: 110,
                  render: (_v, r) => {
                    if (r.kind !== 'data') return ''
                    const parts = [r.row.rowLabel, r.row.columnLabel].filter(Boolean).join(' · ')
                    return parts || <Typography.Text type="secondary">—</Typography.Text>
                  },
                },
                {
                  title: 'Qty',
                  key: 'quantity',
                  align: 'right',
                  width: 80,
                  render: (_v, r) => {
                    const qty = r.kind === 'data' ? r.row.quantity : r.quantity
                    return (
                      <Typography.Text strong={r.kind !== 'data'} type={qty < 0 ? 'danger' : undefined}>
                        {qty.toLocaleString('en-US')}
                      </Typography.Text>
                    )
                  },
                },
                {
                  title: 'Cost',
                  key: 'cost',
                  align: 'right',
                  width: 100,
                  render: (_v, r) =>
                    r.kind === 'data' && r.row.cost
                      ? r.row.cost.toLocaleString('es-HN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : '',
                },
                {
                  title: 'PO',
                  key: 'po',
                  width: 100,
                  render: (_v, r) =>
                    r.kind === 'data'
                      ? r.row.purchaseOrder || <Typography.Text type="secondary">—</Typography.Text>
                      : '',
                },
                {
                  title: 'Counterpart',
                  key: 'otherStore',
                  width: 110,
                  render: (_v, r) =>
                    r.kind === 'data'
                      ? r.row.otherStore != null
                        ? `Store ${r.row.otherStore}`
                        : <Typography.Text type="secondary">—</Typography.Text>
                      : '',
                },
                {
                  title: 'RMA',
                  key: 'rma',
                  width: 100,
                  render: (_v, r) =>
                    r.kind === 'data'
                      ? r.row.rmaNumber || <Typography.Text type="secondary">—</Typography.Text>
                      : '',
                },
              ]}
            />
          )}
        </Card>
      )}
    </Space>
  )
}
