import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  List,
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
  RadarChartOutlined,
} from '@ant-design/icons'
import { useTransferStores } from '../../hooks/useTransferRuns'
import {
  useCommitBalancingTransferRunV2,
  useCreateBalancingTransferRunV2,
} from '../../hooks/useTransferRunsV2'
import { StockMaintenanceHero } from '../../components/stock-maintenance'
import type {
  BalancingTransferMetricSnapshotV2,
  BalancingTransferPreviewLineV2,
  BalancingTransferPreviewRecordV2,
  CreateBalancingTransferRunV2Payload,
} from '../../types/transferRunsV2'

function splitCodes(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function prettyEnum(value: string): string {
  return value.replace(/_/g, ' ')
}

function formatMetric(
  metric: BalancingTransferMetricSnapshotV2,
  kind: 'ROI' | 'TURNS' | 'SELL_THRU',
): string {
  if (kind === 'TURNS') return metric.displayValue.toFixed(2)
  return `${metric.displayValue.toFixed(1)}%`
}

function passColor(pass: BalancingTransferPreviewLineV2['decisionContext']['decisionPass']): string {
  switch (pass) {
    case 'SERVICE_RESCUE':
      return 'red'
    case 'CURVE_REPAIR':
      return 'gold'
    case 'COVERAGE_REBALANCE':
      return 'blue'
    case 'DOWNWARD_SHARE':
      return 'purple'
    case 'SKELETON_CONSOLIDATION':
      return 'volcano'
    default:
      return 'default'
  }
}

function confidenceColor(confidence: BalancingTransferPreviewLineV2['decisionContext']['confidence']): string {
  if (confidence === 'HIGH') return 'green'
  if (confidence === 'MEDIUM') return 'gold'
  return 'default'
}

function prettyRouteBucket(value: string | null | undefined): string {
  if (!value) return 'Unspecified'
  return value.replace(/-/g, ' ')
}

function goalDefaults(goalPreset: 'DAILY_RESCUE' | 'WEEKLY_BALANCE' | 'SEASONAL_CONSOLIDATION') {
  if (goalPreset === 'DAILY_RESCUE') {
    return {
      salesPeriod: 'MONTH' as const,
      cooldownDays: 3,
      transferDoublesToLowerPriority: false,
      stripStoresBelowSizeCount: null,
      allowLowConfidenceMoves: false,
      limit: 250,
    }
  }
  if (goalPreset === 'SEASONAL_CONSOLIDATION') {
    return {
      salesPeriod: 'YEAR' as const,
      cooldownDays: 30,
      transferDoublesToLowerPriority: false,
      stripStoresBelowSizeCount: 2,
      allowLowConfidenceMoves: true,
      limit: 500,
    }
  }
  return {
    salesPeriod: 'YEAR' as const,
    cooldownDays: 14,
    transferDoublesToLowerPriority: false,
    stripStoresBelowSizeCount: null,
    allowLowConfidenceMoves: false,
    limit: 500,
  }
}

export default function BalancingTransferPreviewPageV2() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data: stores = [], isLoading: storesLoading, error: storesError } = useTransferStores()
  const createRun = useCreateBalancingTransferRunV2()
  const commitRun = useCommitBalancingTransferRunV2()

  const [storeIds, setStoreIds] = useState<number[]>([])
  const [goalPreset, setGoalPreset] = useState<'DAILY_RESCUE' | 'WEEKLY_BALANCE' | 'SEASONAL_CONSOLIDATION'>('WEEKLY_BALANCE')
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
  const [allowLowConfidenceMoves, setAllowLowConfidenceMoves] = useState(false)
  const [inTransitPos, setInTransitPos] = useState(false)
  const [cooldownDays, setCooldownDays] = useState(14)
  const [protectDaysOverride, setProtectDaysOverride] = useState<number | null>(null)
  const [vendorCodes, setVendorCodes] = useState('')
  const [seasons, setSeasons] = useState('')
  const [styleColors, setStyleColors] = useState('')
  const [groupCodes, setGroupCodes] = useState('')
  const [keywords, setKeywords] = useState('')
  const [skuCodes, setSkuCodes] = useState('')
  const [categoryMin, setCategoryMin] = useState<number | null>(null)
  const [categoryMax, setCategoryMax] = useState<number | null>(null)
  const [limit, setLimit] = useState<number | null>(500)
  const [includeOriginalRetailOnly, setIncludeOriginalRetailOnly] = useState(false)
  const [includeMarkdownOnly, setIncludeMarkdownOnly] = useState(false)
  const [includePerksOnly, setIncludePerksOnly] = useState(false)
  const [preview, setPreview] = useState<BalancingTransferPreviewRecordV2 | null>(null)

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
    passBreakdown: [],
  }
  const storeLoadErrorMessage = storesError instanceof Error ? storesError.message : null
  const canCommit = Boolean(preview && preview.lines.length > 0 && preview.status !== 'COMMITTED')

  useEffect(() => {
    const defaults = goalDefaults(goalPreset)
    setSalesPeriod(defaults.salesPeriod)
    setCooldownDays(defaults.cooldownDays)
    setTransferDoublesToLowerPriority(defaults.transferDoublesToLowerPriority)
    setStripStoresBelowSizeCount(defaults.stripStoresBelowSizeCount)
    setAllowLowConfidenceMoves(defaults.allowLowConfidenceMoves)
    setLimit(defaults.limit)
  }, [goalPreset])

  async function handlePreview() {
    if (effectiveStoreIds.length < 2) {
      message.error('Select at least two stores')
      return
    }
    if (includeOriginalRetailOnly && includeMarkdownOnly) {
      message.error('Use either Original Retail Only or Markdown Only, not both')
      return
    }

    const payload: CreateBalancingTransferRunV2Payload = {
      goalPreset,
      balancingMethod,
      performanceMetric,
      salesPeriod,
      sortOrder,
      tieBreakKind,
      tieBreakValue,
      transferDoublesToLowerPriority,
      stripStoresBelowSizeCount,
      inTransitPos,
      allowLowConfidenceMoves,
      cooldownDays,
      protectDaysOverride,
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
        limit: limit ?? undefined,
        includeOriginalRetailOnly,
        includeMarkdownOnly,
        includePerksOnly,
      },
    }

    try {
      const result = await createRun.mutateAsync(payload)
      setPreview(result)
      message.success(`Balancing v2 preview ready with ${result.summary.transferCount} transfer lines`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to compute balancing v2 transfers')
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
      message.success(`Committed ${result.totalTransfers} transfer document(s) from balancing v2`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to commit balancing v2 transfers')
    }
  }

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <StockMaintenanceHero
          eyebrow="Transfers"
          title="Balancing Transfers v2"
          subtitle="Strategic balancing protects donor floors, rescues missing core sizes first, repairs broken curves, then rebalances coverage. ROI, Turns, and Sell-Thru stay as supporting evidence instead of the primary trigger."
          ricsReference="RICS Ch. 4 p. 77 lineage"
          metrics={[
            { label: 'Stores in scope', value: effectiveStoreIds.length },
            { label: 'Goal', value: prettyEnum(goalPreset) },
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
                  Recompute v2 Preview
                </Button>
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={handleCommit}
                  disabled={!canCommit}
                  loading={commitRun.isPending}
                >
                  Commit v2
                </Button>
              </Space>
            </Space>
          }
          footer={
            <Typography.Text style={{ color: 'rgba(248, 250, 252, 0.82)' }}>
              Legacy balancing stays available separately. This page is the new pass-based engine with explainable decision context on every proposed transfer.
            </Typography.Text>
          }
        />

        {preview?.status === 'COMMITTED' ? (
          <Alert
            type="success"
            showIcon
            message="Balancing transfer v2 committed"
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
                <Card bordered={false} style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }} title="Run setup">
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Alert
                      type="info"
                      showIcon
                      message="Transfer lanes"
                      description="Balancing currently limits moves to same-city store pairs when Store Master city values are present."
                    />

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

                    <Row gutter={12}>
                      <Col span={12}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Goal
                        </Typography.Text>
                        <Select
                          value={goalPreset}
                          onChange={setGoalPreset}
                          style={{ width: '100%', marginTop: 6 }}
                          options={[
                            { value: 'DAILY_RESCUE', label: 'Daily Rescue' },
                            { value: 'WEEKLY_BALANCE', label: 'Weekly Balance' },
                            { value: 'SEASONAL_CONSOLIDATION', label: 'Seasonal Consolidation' },
                          ]}
                        />
                      </Col>
                      <Col span={12}>
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
                          Cooldown days
                        </Typography.Text>
                        <InputNumber min={0} value={cooldownDays} onChange={(value) => setCooldownDays(value ?? 0)} style={{ width: '100%', marginTop: 6 }} />
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

                    <Row gutter={12}>
                      <Col span={12}>
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
                      </Col>
                      <Col span={12}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Protect days override
                        </Typography.Text>
                        <InputNumber
                          min={1}
                          value={protectDaysOverride}
                          onChange={(value) => setProtectDaysOverride(value ?? null)}
                          placeholder="preset default"
                          style={{ width: '100%', marginTop: 6 }}
                        />
                      </Col>
                    </Row>

                    <Checkbox checked={transferDoublesToLowerPriority} onChange={(event) => setTransferDoublesToLowerPriority(event.target.checked)}>
                      Enable downward-share pass
                    </Checkbox>
                    <Checkbox checked={allowLowConfidenceMoves} onChange={(event) => setAllowLowConfidenceMoves(event.target.checked)}>
                      Allow low-confidence receiver moves
                    </Checkbox>
                    <Checkbox checked={inTransitPos} onChange={(event) => setInTransitPos(event.target.checked)}>
                      Commit as in-transit documents
                    </Checkbox>

                    <Row gutter={12}>
                      <Col span={12}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          SKU preview limit
                        </Typography.Text>
                        <InputNumber
                          min={1}
                          value={limit}
                          onChange={(value) => setLimit(value ?? null)}
                          placeholder="blank = all"
                          style={{ width: '100%', marginTop: 6 }}
                        />
                      </Col>
                      <Col span={12}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Category min
                        </Typography.Text>
                        <InputNumber min={0} value={categoryMin} onChange={(value) => setCategoryMin(value ?? null)} style={{ width: '100%', marginTop: 6 }} />
                      </Col>
                      <Col span={12}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Category max
                        </Typography.Text>
                        <InputNumber min={0} value={categoryMax} onChange={(value) => setCategoryMax(value ?? null)} style={{ width: '100%', marginTop: 6 }} />
                      </Col>
                    </Row>

                    <Input addonBefore="Vendors" value={vendorCodes} onChange={(event) => setVendorCodes(event.target.value)} placeholder="comma separated" />
                    <Input addonBefore="Seasons" value={seasons} onChange={(event) => setSeasons(event.target.value)} placeholder="comma separated" />
                    <Input addonBefore="Styles" value={styleColors} onChange={(event) => setStyleColors(event.target.value)} placeholder="comma separated" />
                    <Input addonBefore="Groups" value={groupCodes} onChange={(event) => setGroupCodes(event.target.value)} placeholder="comma separated" />
                    <Input addonBefore="Keywords" value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="comma separated" />
                    <Input addonBefore="SKUs" value={skuCodes} onChange={(event) => setSkuCodes(event.target.value)} placeholder="comma separated" />

                    <Checkbox checked={includeOriginalRetailOnly} onChange={(event) => setIncludeOriginalRetailOnly(event.target.checked)}>
                      Original retail only
                    </Checkbox>
                    <Checkbox checked={includeMarkdownOnly} onChange={(event) => setIncludeMarkdownOnly(event.target.checked)}>
                      Markdown only
                    </Checkbox>
                    <Checkbox checked={includePerksOnly} onChange={(event) => setIncludePerksOnly(event.target.checked)}>
                      Perks only
                    </Checkbox>

                    <Space wrap>
                      <Button
                        type="primary"
                        icon={<BranchesOutlined />}
                        onClick={handlePreview}
                        loading={createRun.isPending}
                      >
                        Preview Transfers
                      </Button>
                      <Button
                        icon={<CheckOutlined />}
                        onClick={handleCommit}
                        disabled={!canCommit}
                        loading={commitRun.isPending}
                      >
                        Commit Transfers
                      </Button>
                    </Space>
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
                    <Statistic title="Transfers" value={summaryMetrics.transferCount} />
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

              {preview ? (
                <Card bordered={false} style={{ borderRadius: 20 }} title="Run summary">
                  <Descriptions size="small" column={{ xs: 1, md: 2, xl: 3 }}>
                    <Descriptions.Item label="Goal">{prettyEnum(preview.goalPreset)}</Descriptions.Item>
                    <Descriptions.Item label="Method">{prettyEnum(preview.balancingMethod)}</Descriptions.Item>
                    <Descriptions.Item label="Metric">{preview.performanceMetric}</Descriptions.Item>
                    <Descriptions.Item label="Sales period">{preview.salesPeriod}</Descriptions.Item>
                    <Descriptions.Item label="Cooldown">{preview.cooldownDays} days</Descriptions.Item>
                    <Descriptions.Item label="Protect override">
                      {preview.protectDaysOverride == null ? 'Preset default' : preview.protectDaysOverride}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              ) : null}

              <Card bordered={false} style={{ borderRadius: 20 }} title="Decision passes">
                {summaryMetrics.passBreakdown.length > 0 ? (
                  <List
                    dataSource={summaryMetrics.passBreakdown}
                    renderItem={(item) => (
                      <List.Item>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Space>
                            <Tag color={passColor(item.decisionPass)}>{prettyEnum(item.decisionPass)}</Tag>
                            <Typography.Text>{item.transferCount} lines</Typography.Text>
                          </Space>
                          <Typography.Text strong>{item.totalUnits} units</Typography.Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty description="No v2 transfer passes yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>

              {preview?.comparison ? (
                <Card bordered={false} style={{ borderRadius: 20 }} title="Legacy comparison">
                  <Descriptions size="small" column={{ xs: 1, md: 2 }}>
                    <Descriptions.Item label="Legacy run">{preview.comparison.legacyRunId}</Descriptions.Item>
                    <Descriptions.Item label="Legacy transfers">{preview.comparison.legacyTransferCount}</Descriptions.Item>
                    <Descriptions.Item label="Legacy units">{preview.comparison.legacyTotalUnits}</Descriptions.Item>
                    <Descriptions.Item label="Delta transfers">{preview.comparison.deltaTransferCount}</Descriptions.Item>
                    <Descriptions.Item label="Delta units">{preview.comparison.deltaUnits}</Descriptions.Item>
                  </Descriptions>
                </Card>
              ) : null}

              <Card bordered={false} style={{ borderRadius: 20 }} title="Exceptions">
                {preview?.exceptions.length ? (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    {preview.exceptions.map((exception, index) => (
                      <Alert
                        key={`${exception.code}-${index}`}
                        type={exception.severity === 'error' ? 'error' : 'warning'}
                        showIcon
                        message={exception.code}
                        description={exception.message}
                      />
                    ))}
                  </Space>
                ) : (
                  <Empty description="No exceptions" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>

              <Card bordered={false} style={{ borderRadius: 20 }} title="Preview lines">
                <Table<BalancingTransferPreviewLineV2>
                  rowKey={(line) => `${line.skuId}-${line.fromStoreId}-${line.toStoreId}-${line.decisionContext.decisionPass}`}
                  pagination={{ pageSize: 25 }}
                  scroll={{ x: 1400 }}
                  dataSource={preview?.lines ?? []}
                  locale={{
                    emptyText: (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="Compute a v2 preview to review proposed transfers."
                      />
                    ),
                  }}
                  columns={[
                    {
                      title: 'SKU',
                      dataIndex: 'skuCode',
                      width: 130,
                      render: (_value, line) => (
                        <Space direction="vertical" size={0}>
                          <Typography.Text strong>{line.skuCode}</Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {line.description ?? 'No description'}
                          </Typography.Text>
                        </Space>
                      ),
                    },
                    {
                      title: 'From -> To',
                      width: 220,
                      render: (_value, line) => (
                        <Space direction="vertical" size={0}>
                          <Typography.Text>{line.fromStoreLabel}</Typography.Text>
                          <Typography.Text type="secondary">to {line.toStoreLabel}</Typography.Text>
                        </Space>
                      ),
                    },
                    {
                      title: 'Pass',
                      width: 160,
                      render: (_value, line) => (
                        <Tag color={passColor(line.decisionContext.decisionPass)}>
                          {prettyEnum(line.decisionContext.decisionPass)}
                        </Tag>
                      ),
                    },
                    {
                      title: 'Confidence',
                      width: 120,
                      render: (_value, line) => (
                        <Tag color={confidenceColor(line.decisionContext.confidence)}>
                          {line.decisionContext.confidence}
                        </Tag>
                      ),
                    },
                    {
                      title: 'Route',
                      width: 120,
                      render: (_value, line) => (
                        <Tag>{prettyRouteBucket(line.decisionContext.routeBucket)}</Tag>
                      ),
                    },
                    {
                      title: 'Qty',
                      dataIndex: 'suggestedQuantity',
                      width: 80,
                    },
                    {
                      title: 'Reason',
                      dataIndex: 'reason',
                      width: 320,
                    },
                    {
                      title: 'Need / Spare',
                      width: 190,
                      render: (_value, line) => (
                        <Space direction="vertical" size={0}>
                          <Typography.Text style={{ fontSize: 12 }}>
                            Need {line.decisionContext.receiverNeedQtyBefore} {'->'} {line.decisionContext.receiverNeedQtyAfter}
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 12 }}>
                            Spare {line.decisionContext.donorSpareQtyBefore} {'->'} {line.decisionContext.donorSpareQtyAfter}
                          </Typography.Text>
                        </Space>
                      ),
                    },
                    {
                      title: 'Metric shift',
                      width: 160,
                      render: (_value, line) => (
                        <Space direction="vertical" size={0}>
                          <Typography.Text style={{ fontSize: 12 }}>
                            From {formatMetric(line.fromMetric, preview?.performanceMetric ?? performanceMetric)}
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 12 }}>
                            To {formatMetric(line.toMetric, preview?.performanceMetric ?? performanceMetric)}
                          </Typography.Text>
                        </Space>
                      ),
                    },
                    {
                      title: 'Cells',
                      width: 220,
                      render: (_value, line) => (
                        <Space direction="vertical" size={4}>
                          {line.cells.map((cell) => (
                            <Tag key={`${cell.rowLabel}-${cell.columnLabel}`} icon={<RadarChartOutlined />}>
                              {cell.rowLabel || 'row'} / {cell.columnLabel || 'col'}: {cell.suggestedQuantity}
                            </Tag>
                          ))}
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            </Space>
          </Col>
        </Row>
      </Space>
    </App>
  )
}
