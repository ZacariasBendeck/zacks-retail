import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Row,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import { ThunderboltOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { useRecommendedTransfers } from '../../hooks/useRicsInventory'
import type {
  RecommendedTransferParams,
  RecommendedTransferRow,
  RecommendedTransferRule,
} from '../../services/ricsInventoryApi'
import { getErrorMessage } from '../../utils/errors'

// RICS Ch. 4 p. 79 — Recommended Transfer Report. Advisory; does NOT make
// transfers. Three rules drive the suggestion engine:
//   OVER_UNDER_MODELS   donor stores over model feed receivers below model
//   UNEVEN_DOUBLES      donors with ≥2 units top up stores with 0
//   TURNOVER_VARIANCE   fast sellers pull from slow sellers (YTD ratio)
const RULE_OPTIONS: Array<{ value: RecommendedTransferRule; label: string; hint: string }> = [
  {
    value: 'OVER_UNDER_MODELS',
    label: 'Over / Under Models',
    hint: 'Donors above their Model fill gaps for receivers below theirs.',
  },
  {
    value: 'UNEVEN_DOUBLES',
    label: 'Uneven Doubles',
    hint: 'Stores with ≥ 2 units donate 1 to stores at 0.',
  },
  {
    value: 'TURNOVER_VARIANCE',
    label: 'Turnover Variance',
    hint: 'Fast-selling stores pull stock from slow-selling ones (YTD ratio).',
  },
]

export default function RecommendedTransferReportPage() {
  const [form] = Form.useForm()
  const [activeParams, setActiveParams] = useState<RecommendedTransferParams | null>(null)

  const { data, isLoading, isFetching, error } = useRecommendedTransfers(activeParams)

  const handleRun = (values: {
    rule: RecommendedTransferRule
    turnoverRatioThreshold?: number
    includeSkusWithoutModels?: boolean
    vendorCode?: string
    categoryMin?: number
    categoryMax?: number
    season?: string
    storeNumbers?: string
    limit?: number
  }) => {
    const storeNumbers = values.storeNumbers
      ? values.storeNumbers
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n))
      : undefined

    const params: RecommendedTransferParams = {
      rule: values.rule,
      turnoverRatioThreshold: values.turnoverRatioThreshold,
      includeSkusWithoutModels: !!values.includeSkusWithoutModels,
      storeNumbers,
      vendorCode: values.vendorCode?.trim() || undefined,
      categoryMin: values.categoryMin,
      categoryMax: values.categoryMax,
      season: values.season?.trim() || undefined,
      limit: values.limit ?? 500,
    }
    setActiveParams(params)
  }

  const handleClear = () => {
    form.resetFields()
    setActiveParams(null)
  }

  const summary = useMemo(() => {
    const rows = data?.rows ?? []
    const pairs = new Set(rows.map((r) => `${r.fromStore}-${r.toStore}`))
    const skus = new Set(rows.map((r) => r.sku))
    const totalUnits = rows.reduce((acc, r) => acc + r.suggestedQuantity, 0)
    return {
      suggestions: rows.length,
      skus: skus.size,
      pairs: pairs.size,
      totalUnits,
    }
  }, [data])

  const activeRule = Form.useWatch('rule', form) as RecommendedTransferRule | undefined

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Recommended Transfer Report
        </Typography.Title>
        <Typography.Text type="secondary">
          RICS Ch. 4 p. 79 — advisory, does not make transfers
        </Typography.Text>
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          onFinish={handleRun}
          initialValues={{
            rule: 'OVER_UNDER_MODELS' as RecommendedTransferRule,
            turnoverRatioThreshold: 2,
            includeSkusWithoutModels: false,
            limit: 50000,
          }}
        >
          <Row gutter={16}>
            <Col xs={24} md={16}>
              <Form.Item label="Rule" name="rule">
                <Segmented<RecommendedTransferRule>
                  block
                  options={RULE_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
                />
              </Form.Item>
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: -16, marginBottom: 16 }}>
                <InfoCircleOutlined style={{ marginRight: 6 }} />
                {RULE_OPTIONS.find((o) => o.value === activeRule)?.hint}
              </Typography.Text>
            </Col>
            {activeRule === 'TURNOVER_VARIANCE' && (
              <Col xs={12} md={4}>
                <Form.Item label="Ratio ≥" name="turnoverRatioThreshold">
                  <InputNumber min={1.1} step={0.5} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            )}
            {activeRule === 'OVER_UNDER_MODELS' && (
              <Col xs={24} md={4}>
                <Form.Item label=" " name="includeSkusWithoutModels" valuePropName="checked">
                  <Checkbox>Include SKUs w/o models</Checkbox>
                </Form.Item>
              </Col>
            )}
          </Row>
          <Row gutter={16}>
            <Col xs={12} sm={8} md={4}>
              <Form.Item label="Store #s" name="storeNumbers">
                <Input placeholder="e.g. 1,2,5" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Form.Item label="Vendor Code" name="vendorCode">
                <Input placeholder="All" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Form.Item label="Category Min" name="categoryMin">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="Any" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Form.Item label="Category Max" name="categoryMax">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="Any" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Form.Item label="Season" name="season">
                <Input placeholder="e.g. A" maxLength={4} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Form.Item
                label="SKU safety cap"
                name="limit"
                tooltip="Upper bound, not a scope limit. Filters decide what's scanned."
              >
                <InputNumber min={100} max={200000} step={1000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              icon={<ThunderboltOutlined />}
              loading={isFetching}
            >
              Run
            </Button>
            <Button onClick={handleClear}>Clear</Button>
          </Space>
        </Form>
      </Card>

      <Alert
        type="info"
        showIcon
        message="Phase 1 — advisory only"
        description="This report reads live RICS data and computes suggestions. It does not create transfers. Use the Manual / Auto / Balancing Transfer wizards to materialize a suggestion (Phase 2 will complete the commit path)."
      />

      {error && !data && (
        <Alert
          type="error"
          showIcon
          message="Report failed"
          description={getErrorMessage(error, 'Unable to run recommended transfers.')}
        />
      )}
      {error && data && (
        <Alert
          type="warning"
          showIcon
          message="Last refresh failed — showing previous results"
          description={`${getErrorMessage(error, 'Refresh errored.')} Click Run to retry.`}
          closable
        />
      )}

      {!activeParams && (
        <Card>
          <Empty description="Pick a rule, optional filters, and click Run." />
        </Card>
      )}

      {activeParams && isLoading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
            <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
              Scanning every SKU that matches your filters (capped at {(activeParams.limit ?? 50000).toLocaleString()} for safety). Full-catalog runs can take a minute.
            </Typography.Paragraph>
          </div>
        </Card>
      )}

      {activeParams && data && (
        <>
          <Row gutter={16}>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Suggestions" value={summary.suggestions} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Distinct SKUs" value={summary.skus} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Store pairs" value={summary.pairs} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Units to move" value={summary.totalUnits} />
              </Card>
            </Col>
          </Row>
          {summary.suggestions === 0 ? (
            <Card>
              <Empty description="No suggestions under this rule + filters. Try a wider scan limit or a different rule." />
            </Card>
          ) : (
            <ResultsTable rows={data.rows} rule={activeParams.rule} />
          )}
        </>
      )}
    </Space>
  )
}

function ResultsTable({ rows, rule }: { rows: RecommendedTransferRow[]; rule: RecommendedTransferRule }) {
  return (
    <Card>
      <Table<RecommendedTransferRow>
        size="small"
        rowKey={(r) => `${r.sku}-${r.fromStore}-${r.toStore}`}
        dataSource={rows}
        pagination={{ pageSize: 50, showSizeChanger: true }}
        scroll={{ x: 1500 }}
        columns={[
          {
            title: 'SKU',
            dataIndex: 'sku',
            key: 'sku',
            width: 140,
            fixed: 'left',
            sorter: (a, b) => a.sku.localeCompare(b.sku),
            defaultSortOrder: 'ascend',
          },
          {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
            width: 200,
            sorter: (a, b) => (a.description ?? '').localeCompare(b.description ?? ''),
          },
          {
            title: 'Brand / Vendor',
            dataIndex: 'brand',
            key: 'brand',
            width: 120,
            sorter: (a, b) => (a.brand ?? '').localeCompare(b.brand ?? ''),
            render: (v: string | null) => (v ? <Tag>{v}</Tag> : '—'),
          },
          {
            title: 'Category',
            dataIndex: 'category',
            key: 'category',
            width: 90,
            align: 'right',
            sorter: (a, b) => (a.category ?? 0) - (b.category ?? 0),
            render: (v: number | null) => (v != null ? v : '—'),
          },
          {
            title: 'From',
            key: 'from',
            width: 180,
            sorter: (a, b) => a.fromStore - b.fromStore,
            render: (_, r) =>
              r.fromStoreName ? `${r.fromStore} — ${r.fromStoreName}` : String(r.fromStore),
          },
          {
            title: 'To',
            key: 'to',
            width: 180,
            sorter: (a, b) => a.toStore - b.toStore,
            render: (_, r) =>
              r.toStoreName ? `${r.toStore} — ${r.toStoreName}` : String(r.toStore),
          },
          {
            title: 'Qty',
            dataIndex: 'suggestedQuantity',
            key: 'suggestedQuantity',
            align: 'right',
            width: 70,
            sorter: (a, b) => a.suggestedQuantity - b.suggestedQuantity,
            render: (v: number) => <strong>{v}</strong>,
          },
          {
            title: rule === 'TURNOVER_VARIANCE' ? 'From YTD' : 'From OH',
            key: 'fromState',
            align: 'right',
            width: 110,
            sorter: (a, b) =>
              rule === 'TURNOVER_VARIANCE' ? a.fromYtd - b.fromYtd : a.fromOnHand - b.fromOnHand,
            render: (_, r) =>
              rule === 'TURNOVER_VARIANCE' ? r.fromYtd : `${r.fromOnHand} / M ${r.fromModel}`,
          },
          {
            title: rule === 'TURNOVER_VARIANCE' ? 'To YTD' : 'To OH',
            key: 'toState',
            align: 'right',
            width: 110,
            sorter: (a, b) =>
              rule === 'TURNOVER_VARIANCE' ? a.toYtd - b.toYtd : a.toOnHand - b.toOnHand,
            render: (_, r) =>
              rule === 'TURNOVER_VARIANCE' ? r.toYtd : `${r.toOnHand} / M ${r.toModel}`,
          },
          {
            title: 'Reason',
            dataIndex: 'reason',
            key: 'reason',
            ellipsis: true,
            width: 320,
          },
        ]}
      />
    </Card>
  )
}
