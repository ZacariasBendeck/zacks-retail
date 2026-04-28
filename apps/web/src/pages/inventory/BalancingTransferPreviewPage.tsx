import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  BranchesOutlined,
  CheckOutlined,
} from '@ant-design/icons'
import {
  useCommitBalancingTransferRun,
  useCreateBalancingTransferRun,
  useTransferStores,
} from '../../hooks/useTransferRuns'
import { StockMaintenanceHero } from '../../components/stock-maintenance'
import type {
  BalancingTransferMetricSnapshot,
  BalancingTransferPreviewLine,
  BalancingTransferPreviewRecord,
  CreateBalancingTransferRunPayload,
} from '../../types/transferRuns'

function splitCodes(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function formatMetric(
  metric: BalancingTransferMetricSnapshot,
  kind: 'ROI' | 'TURNS' | 'SELL_THRU',
): string {
  if (kind === 'TURNS') {
    return metric.displayValue.toFixed(2)
  }
  return `${metric.displayValue.toFixed(1)}%`
}

export default function BalancingTransferPreviewPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data: stores = [], isLoading: storesLoading, error: storesError } = useTransferStores()
  const createRun = useCreateBalancingTransferRun()
  const commitRun = useCommitBalancingTransferRun()

  const [storeIds, setStoreIds] = useState<number[]>([])
  const [balancingMethod, setBalancingMethod] = useState<'OVER_UNDER_MODELS' | 'WITHOUT_MODELS' | 'WITHOUT_CONSIDERING_MODELS'>(
    'WITHOUT_CONSIDERING_MODELS',
  )
  const [performanceMetric, setPerformanceMetric] = useState<'ROI' | 'TURNS' | 'SELL_THRU'>('ROI')
  const [salesPeriod, setSalesPeriod] = useState<'MONTH' | 'SEASON' | 'YEAR'>('YEAR')
  const [sortOrder, setSortOrder] = useState<'SKU' | 'VENDOR' | 'CATEGORY'>('SKU')
  const [tieBreakKind, setTieBreakKind] = useState<'ABSOLUTE' | 'PERCENT'>('PERCENT')
  const [tieBreakValue, setTieBreakValue] = useState<number>(25)
  const [transferDoublesToLowerPriority, setTransferDoublesToLowerPriority] = useState(false)
  const [stripStoresBelowSizeCount, setStripStoresBelowSizeCount] = useState<number | null>(null)
  const [vendorCodes, setVendorCodes] = useState('')
  const [seasons, setSeasons] = useState('')
  const [styleColors, setStyleColors] = useState('')
  const [groupCodes, setGroupCodes] = useState('')
  const [keywords, setKeywords] = useState('')
  const [skuCodes, setSkuCodes] = useState('')
  const [categoryMin, setCategoryMin] = useState<number | null>(null)
  const [categoryMax, setCategoryMax] = useState<number | null>(null)
  const [includeOriginalRetailOnly, setIncludeOriginalRetailOnly] = useState(false)
  const [includeMarkdownOnly, setIncludeMarkdownOnly] = useState(false)
  const [includePerksOnly, setIncludePerksOnly] = useState(false)
  const [preview, setPreview] = useState<BalancingTransferPreviewRecord | null>(null)

  const effectiveStoreIds = useMemo(
    () => (storeIds.length > 0 ? storeIds : stores.map((store) => store.storeId)),
    [storeIds, stores],
  )

  const summaryMetrics = preview?.summary ?? {
    transferCount: 0,
    skuCount: 0,
    storePairCount: 0,
    totalUnits: 0,
    exceptionCount: 0,
  }
  const storeLoadErrorMessage = storesError instanceof Error ? storesError.message : null

  async function handlePreview() {
    if (effectiveStoreIds.length < 2) {
      message.error('Select at least two stores')
      return
    }
    if (includeOriginalRetailOnly && includeMarkdownOnly) {
      message.error('Use either Original Retail Only or Markdown Only, not both')
      return
    }

    const payload: CreateBalancingTransferRunPayload = {
      balancingMethod,
      performanceMetric,
      salesPeriod,
      sortOrder,
      tieBreakKind,
      tieBreakValue,
      transferDoublesToLowerPriority,
      stripStoresBelowSizeCount,
      criteria: {
        storeIds: storeIds.length > 0 ? storeIds : undefined,
        vendorCodes: splitCodes(vendorCodes),
        seasons: splitCodes(seasons),
        styleColors: splitCodes(styleColors),
        groupCodes: splitCodes(groupCodes),
        keywords: splitCodes(keywords),
        skuCodes: splitCodes(skuCodes),
        categoryMin,
        categoryMax,
        includeOriginalRetailOnly,
        includeMarkdownOnly,
        includePerksOnly,
      },
    }

    try {
      const result = await createRun.mutateAsync(payload)
      setPreview(result)
      message.success(`Balancing preview ready with ${result.summary.transferCount} transfer lines`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to compute balancing transfers')
    }
  }

  async function handleCommit() {
    if (!preview) return
    try {
      const result = await commitRun.mutateAsync(preview.id)
      setPreview((current) =>
        current
          ? {
              ...current,
              status: 'COMMITTED',
              committedAt: result.committedAt,
              generatedTransferIds: result.generatedTransferIds,
            }
          : current,
      )
      message.success(`Committed ${result.totalTransfers} transfer document(s)`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to commit balancing transfers')
    }
  }

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <StockMaintenanceHero
          eyebrow="Transfers"
          title="Balancing Transfers (Legacy)"
          subtitle="Preserve the current metric-driven balancing flow for operator familiarity and side-by-side comparison with the new v2 strategy. Preview shows the exact cells that move, the store-priority comparison behind each line, and any exceptions that would have been skipped in RICS."
          ricsReference="RICS Ch. 4 p. 77"
          metrics={[
            { label: 'Stores in scope', value: effectiveStoreIds.length },
            { label: 'Method', value: balancingMethod.split('_').join(' ') },
            { label: 'Transfer lines', value: summaryMetrics.transferCount },
            { label: 'Units proposed', value: summaryMetrics.totalUnits },
          ]}
          actions={
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Text style={{ color: 'rgba(248, 250, 252, 0.82)', fontWeight: 600 }}>
                Operator actions
              </Typography.Text>
              <Space wrap>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/inventory/adjustments')}>
                  Back to workspace
                </Button>
                <Button icon={<BranchesOutlined />} onClick={handlePreview} loading={createRun.isPending}>
                  Recompute Preview
                </Button>
              </Space>
            </Space>
          }
          footer={
            <Typography.Text style={{ color: 'rgba(248, 250, 252, 0.82)' }}>
              This legacy page stays app-owned: on hand, models, and the committed transfer documents all live in Postgres. Performance ranking currently uses app-native movement history only.
            </Typography.Text>
          }
        />

        {preview?.status === 'COMMITTED' ? (
          <Alert
            type="success"
            showIcon
            message="Balancing transfers committed"
            description={`This run created ${preview.generatedTransferIds.length} transfer document(s).`}
          />
        ) : null}

        {storeLoadErrorMessage ? (
          <Alert
            type="error"
            showIcon
            message="Store list unavailable"
            description={storeLoadErrorMessage}
          />
        ) : !storesLoading && stores.length === 0 ? (
          <Alert
            type="warning"
            showIcon
            message="No stores available for transfer setup"
            description="The transfer store list is empty. Verify that Store Master is loaded into app.store_master and refresh the page."
          />
        ) : null}

        <Row gutter={[16, 16]} align="top">
          <Col xs={24} xl={8}>
            <div style={{ position: 'sticky', top: 16 }}>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Card
                  bordered={false}
                  style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
                  title="Run setup"
                >
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Stores
                      </Typography.Text>
                      <Select
                        mode="multiple"
                        showSearch
                        optionFilterProp="label"
                        loading={storesLoading}
                        disabled={storesLoading || stores.length === 0}
                        placeholder="Blank = all transfer-capable stores"
                        value={storeIds}
                        onChange={setStoreIds}
                        style={{ width: '100%', marginTop: 6 }}
                        options={stores.map((store) => ({
                          value: store.storeId,
                          label: store.storeLabel,
                        }))}
                      />
                    </div>

                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Balancing method
                      </Typography.Text>
                      <Radio.Group
                        value={balancingMethod}
                        onChange={(event) => setBalancingMethod(event.target.value)}
                        style={{ width: '100%', marginTop: 6 }}
                      >
                        <Space direction="vertical">
                          <Radio value="OVER_UNDER_MODELS">Over / Under Models</Radio>
                          <Radio value="WITHOUT_MODELS">Without Models</Radio>
                          <Radio value="WITHOUT_CONSIDERING_MODELS">Ignore Models</Radio>
                        </Space>
                      </Radio.Group>
                    </div>

                    <Row gutter={12}>
                      <Col span={8}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Metric
                        </Typography.Text>
                        <Select
                          value={performanceMetric}
                          onChange={setPerformanceMetric}
                          style={{ width: '100%', marginTop: 6 }}
                          options={[
                            { value: 'ROI', label: 'ROI' },
                            { value: 'TURNS', label: 'Turns' },
                            { value: 'SELL_THRU', label: 'Sell-Thru' },
                          ]}
                        />
                      </Col>
                      <Col span={8}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Period
                        </Typography.Text>
                        <Select
                          value={salesPeriod}
                          onChange={setSalesPeriod}
                          style={{ width: '100%', marginTop: 6 }}
                          options={[
                            { value: 'MONTH', label: 'Month' },
                            { value: 'SEASON', label: 'Season' },
                            { value: 'YEAR', label: 'Year' },
                          ]}
                        />
                      </Col>
                      <Col span={8}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Sort by
                        </Typography.Text>
                        <Select
                          value={sortOrder}
                          onChange={setSortOrder}
                          style={{ width: '100%', marginTop: 6 }}
                          options={[
                            { value: 'SKU', label: 'SKU' },
                            { value: 'VENDOR', label: 'Vendor' },
                            { value: 'CATEGORY', label: 'Category' },
                          ]}
                        />
                      </Col>
                    </Row>

                    <Row gutter={12}>
                      <Col span={12}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Tie-break kind
                        </Typography.Text>
                        <Select
                          value={tieBreakKind}
                          onChange={setTieBreakKind}
                          style={{ width: '100%', marginTop: 6 }}
                          options={[
                            { value: 'ABSOLUTE', label: 'Absolute' },
                            { value: 'PERCENT', label: 'Percent' },
                          ]}
                        />
                      </Col>
                      <Col span={12}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Tie-break value
                        </Typography.Text>
                        <InputNumber
                          min={0}
                          step={tieBreakKind === 'PERCENT' ? 5 : 0.1}
                          value={tieBreakValue}
                          onChange={(value) => setTieBreakValue(value ?? 0)}
                          style={{ width: '100%', marginTop: 6 }}
                        />
                      </Col>
                    </Row>

                    <Checkbox
                      checked={transferDoublesToLowerPriority}
                      onChange={(event) => setTransferDoublesToLowerPriority(event.target.checked)}
                    >
                      Transfer doubles to lower-priority stores
                    </Checkbox>

                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Strip stores below size count
                      </Typography.Text>
                      <InputNumber
                        min={1}
                        value={stripStoresBelowSizeCount}
                        onChange={(value) => setStripStoresBelowSizeCount(value ?? null)}
                        placeholder="optional"
                        style={{ width: '100%', marginTop: 6 }}
                      />
                    </div>

                    <Row gutter={12}>
                      <Col span={12}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Category min
                        </Typography.Text>
                        <InputNumber
                          min={0}
                          value={categoryMin}
                          onChange={(value) => setCategoryMin(value ?? null)}
                          style={{ width: '100%', marginTop: 6 }}
                        />
                      </Col>
                      <Col span={12}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Category max
                        </Typography.Text>
                        <InputNumber
                          min={0}
                          value={categoryMax}
                          onChange={(value) => setCategoryMax(value ?? null)}
                          style={{ width: '100%', marginTop: 6 }}
                        />
                      </Col>
                    </Row>

                    <Space.Compact style={{ width: '100%' }}>
                      <Button disabled>Vendor</Button>
                      <Input
                        placeholder="comma-separated codes"
                        value={vendorCodes}
                        onChange={(event) => setVendorCodes(event.target.value)}
                      />
                    </Space.Compact>
                    <Space.Compact style={{ width: '100%' }}>
                      <Button disabled>Season</Button>
                      <Input
                        placeholder="comma-separated"
                        value={seasons}
                        onChange={(event) => setSeasons(event.target.value)}
                      />
                    </Space.Compact>
                    <Space.Compact style={{ width: '100%' }}>
                      <Button disabled>Style</Button>
                      <Input
                        placeholder="comma-separated"
                        value={styleColors}
                        onChange={(event) => setStyleColors(event.target.value)}
                      />
                    </Space.Compact>
                    <Space.Compact style={{ width: '100%' }}>
                      <Button disabled>Group</Button>
                      <Input
                        placeholder="comma-separated"
                        value={groupCodes}
                        onChange={(event) => setGroupCodes(event.target.value)}
                      />
                    </Space.Compact>
                    <Space.Compact style={{ width: '100%' }}>
                      <Button disabled>Keyword</Button>
                      <Input
                        placeholder="comma-separated"
                        value={keywords}
                        onChange={(event) => setKeywords(event.target.value)}
                      />
                    </Space.Compact>
                    <Space.Compact style={{ width: '100%' }}>
                      <Button disabled>SKU</Button>
                      <Input
                        placeholder="comma-separated codes"
                        value={skuCodes}
                        onChange={(event) => setSkuCodes(event.target.value)}
                      />
                    </Space.Compact>

                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                      <Checkbox
                        checked={includeOriginalRetailOnly}
                        onChange={(event) => {
                          setIncludeOriginalRetailOnly(event.target.checked)
                          if (event.target.checked) setIncludeMarkdownOnly(false)
                        }}
                      >
                        Original retail only
                      </Checkbox>
                      <Checkbox
                        checked={includeMarkdownOnly}
                        onChange={(event) => {
                          setIncludeMarkdownOnly(event.target.checked)
                          if (event.target.checked) setIncludeOriginalRetailOnly(false)
                        }}
                      >
                        Markdown only
                      </Checkbox>
                      <Checkbox
                        checked={includePerksOnly}
                        onChange={(event) => setIncludePerksOnly(event.target.checked)}
                      >
                        Perks only
                      </Checkbox>
                    </Space>

                    <Space wrap>
                      <Button type="primary" icon={<BranchesOutlined />} onClick={handlePreview} loading={createRun.isPending}>
                        Preview Transfers
                      </Button>
                      <Button
                        icon={<CheckOutlined />}
                        onClick={handleCommit}
                        loading={commitRun.isPending}
                        disabled={!preview || preview.lines.length === 0 || preview.status === 'COMMITTED'}
                      >
                        Commit Transfers
                      </Button>
                    </Space>
                  </Space>
                </Card>

                <Card
                  bordered={false}
                  style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
                  title="RICS behavior"
                >
                  <Space direction="vertical" size={10}>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      Balancing Transfers use store performance to move units from lower-priority stores to higher-priority stores, with separate rules for model-driven and no-model scenarios.
                    </Typography.Paragraph>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      Negative on hand is surfaced as an exception. The preview shows the lines that can commit now and the cells that need cleanup first.
                    </Typography.Paragraph>
                  </Space>
                </Card>
              </Space>
            </div>
          </Col>

          <Col xs={24} xl={16}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Row gutter={[16, 16]}>
                <Col xs={12} md={6}>
                  <Card bordered={false} style={{ borderRadius: 18 }}>
                    <Statistic title="Transfer lines" value={summaryMetrics.transferCount} />
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card bordered={false} style={{ borderRadius: 18 }}>
                    <Statistic title="SKUs" value={summaryMetrics.skuCount} />
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card bordered={false} style={{ borderRadius: 18 }}>
                    <Statistic title="Store pairs" value={summaryMetrics.storePairCount} />
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card bordered={false} style={{ borderRadius: 18 }}>
                    <Statistic title="Exceptions" value={summaryMetrics.exceptionCount} />
                  </Card>
                </Col>
              </Row>

              {preview?.exceptions.length ? (
                <Card
                  bordered={false}
                  style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
                  title="Exceptions"
                >
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    {preview.exceptions.map((exception, index) => (
                      <Alert
                        key={`${exception.code}-${index}`}
                        type={exception.severity === 'error' ? 'error' : 'warning'}
                        showIcon
                        message={exception.message}
                      />
                    ))}
                  </Space>
                </Card>
              ) : null}

              {!preview ? (
                <Card
                  bordered={false}
                  style={{ borderRadius: 20, minHeight: 260, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
                >
                  <Empty description="Build a preview to inspect the balancing journal before posting." />
                </Card>
              ) : preview.lines.length === 0 ? (
                <Card bordered={false} style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}>
                  <Empty description="No balancing opportunities matched the selected rules and criteria." />
                </Card>
              ) : (
                <Card
                  bordered={false}
                  style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
                  title="Preview journal"
                  extra={
                    <Tag color={preview.status === 'COMMITTED' ? 'green' : 'blue'}>
                      {preview.status === 'COMMITTED' ? 'Committed' : 'Previewed'}
                    </Tag>
                  }
                >
                  <Table<BalancingTransferPreviewLine>
                    size="small"
                    rowKey={(row) => `${row.skuId}-${row.fromStoreId}-${row.toStoreId}`}
                    dataSource={preview.lines}
                    pagination={{ pageSize: 25, showSizeChanger: true }}
                    scroll={{ x: 1500 }}
                    columns={[
                      {
                        title: 'SKU',
                        dataIndex: 'skuCode',
                        width: 140,
                        fixed: 'left',
                      },
                      {
                        title: 'Description',
                        dataIndex: 'description',
                        width: 220,
                        ellipsis: true,
                      },
                      {
                        title: 'From',
                        dataIndex: 'fromStoreLabel',
                        width: 120,
                      },
                      {
                        title: 'To',
                        dataIndex: 'toStoreLabel',
                        width: 120,
                      },
                      {
                        title: 'Qty',
                        dataIndex: 'suggestedQuantity',
                        width: 80,
                        align: 'right',
                        render: (value: number) => <strong>{value}</strong>,
                      },
                      {
                        title: 'From metric',
                        width: 120,
                        render: (_, row) => formatMetric(row.fromMetric, preview.performanceMetric),
                      },
                      {
                        title: 'To metric',
                        width: 120,
                        render: (_, row) => formatMetric(row.toMetric, preview.performanceMetric),
                      },
                      {
                        title: 'From OH / Model',
                        width: 130,
                        render: (_, row) => `${row.fromMetric.endingOnHand} / ${row.fromModelQty}`,
                      },
                      {
                        title: 'To OH / Model',
                        width: 130,
                        render: (_, row) => `${row.toMetric.endingOnHand} / ${row.toModelQty}`,
                      },
                      {
                        title: 'Reason',
                        dataIndex: 'reason',
                        width: 320,
                        ellipsis: true,
                      },
                      {
                        title: 'Cells',
                        key: 'cells',
                        width: 320,
                        render: (_, row) => (
                          <Space wrap>
                            {row.cells.map((cell) => (
                              <Tag key={`${cell.rowLabel}-${cell.columnLabel}`}>
                                {[cell.rowLabel, cell.columnLabel].filter(Boolean).join('-') || '(qty)'}: {cell.suggestedQuantity}
                              </Tag>
                            ))}
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              )}
            </Space>
          </Col>
        </Row>
      </Space>
    </App>
  )
}
