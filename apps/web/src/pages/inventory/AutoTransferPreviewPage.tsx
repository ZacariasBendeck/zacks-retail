import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Input,
  InputNumber,
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
  CheckOutlined,
  ReloadOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import {
  useCommitAutoTransferRun,
  useCreateAutoTransferRun,
  useTransferStores,
} from '../../hooks/useTransferRuns'
import { StockMaintenanceHero } from '../../components/stock-maintenance'
import type {
  AutoTransferPreviewLine,
  AutoTransferPreviewRecord,
  CreateAutoTransferRunPayload,
} from '../../types/transferRuns'

function splitCodes(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function formatCellTag(line: AutoTransferPreviewLine) {
  return line.cells.map((cell) => (
    <Tag key={`${cell.rowLabel}-${cell.columnLabel}`}>
      {[cell.rowLabel, cell.columnLabel].filter(Boolean).join('-') || '(qty)'}: {cell.suggestedQuantity}
    </Tag>
  ))
}

export default function AutoTransferPreviewPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data: stores = [], isLoading: storesLoading, error: storesError } = useTransferStores()
  const createRun = useCreateAutoTransferRun()
  const commitRun = useCommitAutoTransferRun()

  const [warehouseStoreId, setWarehouseStoreId] = useState<number | undefined>()
  const [targetStoreIds, setTargetStoreIds] = useState<number[]>([])
  const [sortOrder, setSortOrder] = useState<'SKU' | 'VENDOR' | 'CATEGORY' | 'LOCATION'>('SKU')
  const [categoryMin, setCategoryMin] = useState<number | null>(null)
  const [categoryMax, setCategoryMax] = useState<number | null>(null)
  const [vendorCodes, setVendorCodes] = useState('')
  const [seasons, setSeasons] = useState('')
  const [groupCodes, setGroupCodes] = useState('')
  const [keywords, setKeywords] = useState('')
  const [skuCodes, setSkuCodes] = useState('')
  const [preview, setPreview] = useState<AutoTransferPreviewRecord | null>(null)

  useEffect(() => {
    if (warehouseStoreId != null || stores.length === 0) return
    const preferred = stores.find((store) => store.storeId === 99)?.storeId
    setWarehouseStoreId(preferred ?? stores[stores.length - 1]?.storeId)
  }, [warehouseStoreId, stores])

  const selectableTargets = useMemo(
    () => stores.filter((store) => store.storeId !== warehouseStoreId),
    [stores, warehouseStoreId],
  )

  const summaryMetrics = preview?.summary ?? {
    transferCount: 0,
    skuCount: 0,
    receiverStoreCount: targetStoreIds.length,
    totalUnits: 0,
    exceptionCount: 0,
  }
  const storeLoadErrorMessage = storesError instanceof Error ? storesError.message : null

  async function handlePreview() {
    if (warehouseStoreId == null) {
      message.error('Select a warehouse store first')
      return
    }
    if (targetStoreIds.length === 0) {
      message.error('Select at least one target store')
      return
    }

    const payload: CreateAutoTransferRunPayload = {
      warehouseStoreId,
      targetStoreIds,
      sortOrder,
      criteria: {
        vendorCodes: splitCodes(vendorCodes),
        categoryMin,
        categoryMax,
        seasons: splitCodes(seasons),
        groupCodes: splitCodes(groupCodes),
        keywords: splitCodes(keywords),
        skuCodes: splitCodes(skuCodes),
      },
    }

    try {
      const result = await createRun.mutateAsync(payload)
      setPreview(result)
      message.success(`Preview ready with ${result.summary.transferCount} transfer lines`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to compute automatic transfers')
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
      message.error(error instanceof Error ? error.message : 'Failed to commit automatic transfers')
    }
  }

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <StockMaintenanceHero
          eyebrow="Transfers"
          title="Automatic Transfers"
          subtitle="Warehouse-to-store replenishment based on Model quantities. Stores are processed in ascending store order so the preview and the committed result stay deterministic."
          ricsReference="RICS Ch. 4 p. 76"
          metrics={[
            { label: 'Warehouse', value: warehouseStoreId ?? 'Choose' },
            { label: 'Target stores', value: targetStoreIds.length },
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
                <Button icon={<SwapOutlined />} onClick={() => navigate('/inventory/transfers/manual')}>
                  Manual Transfer
                </Button>
                <Button icon={<ReloadOutlined />} onClick={handlePreview} loading={createRun.isPending}>
                  Recompute Preview
                </Button>
              </Space>
            </Space>
          }
          footer={
            <Typography.Text style={{ color: 'rgba(248, 250, 252, 0.82)' }}>
              Default behavior matches RICS: commit posts the transfers immediately into inventory. In-transit transfer mode stays off in the UI for now.
            </Typography.Text>
          }
        />

        {preview?.status === 'COMMITTED' ? (
          <Alert
            type="success"
            showIcon
            message="Automatic transfers committed"
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
                        Warehouse store
                      </Typography.Text>
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="Select warehouse"
                        loading={storesLoading}
                        disabled={storesLoading || stores.length === 0}
                        value={warehouseStoreId}
                        onChange={(value) => {
                          setWarehouseStoreId(value)
                          setTargetStoreIds((current) => current.filter((storeId) => storeId !== value))
                        }}
                        style={{ width: '100%', marginTop: 6 }}
                        options={stores.map((store) => ({
                          value: store.storeId,
                          label: store.storeLabel,
                        }))}
                      />
                    </div>

                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Transfer into stores
                      </Typography.Text>
                      <Select
                        mode="multiple"
                        showSearch
                        optionFilterProp="label"
                        disabled={storesLoading || selectableTargets.length === 0}
                        placeholder="Choose target stores"
                        value={targetStoreIds}
                        onChange={setTargetStoreIds}
                        style={{ width: '100%', marginTop: 6 }}
                        options={selectableTargets.map((store) => ({
                          value: store.storeId,
                          label: store.storeLabel,
                        }))}
                      />
                    </div>

                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Sort journal by
                      </Typography.Text>
                      <Select
                        value={sortOrder}
                        onChange={setSortOrder}
                        style={{ width: '100%', marginTop: 6 }}
                        options={[
                          { value: 'SKU', label: 'SKU' },
                          { value: 'VENDOR', label: 'Vendor' },
                          { value: 'CATEGORY', label: 'Category' },
                          { value: 'LOCATION', label: 'Location' },
                        ]}
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

                    <Space wrap>
                      <Button type="primary" icon={<ReloadOutlined />} onClick={handlePreview} loading={createRun.isPending}>
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
                      Automatic Transfers pull stock from one warehouse into multiple stores wherever on hand is below Model. Lower-numbered target stores are processed first.
                    </Typography.Paragraph>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      Only full warehouse-fill lines are proposed. If the warehouse cannot cover a store's shortfall for a cell, that line is skipped.
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
                    <Statistic title="Receiver stores" value={summaryMetrics.receiverStoreCount} />
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
                  <Empty description="Build a preview to see the transfer journal before posting." />
                </Card>
              ) : preview.lines.length === 0 ? (
                <Card bordered={false} style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}>
                  <Empty description="No automatic transfer opportunities matched the selected criteria." />
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
                  <Table<AutoTransferPreviewLine>
                    size="small"
                    rowKey={(row) => `${row.skuId}-${row.fromStoreId}-${row.toStoreId}`}
                    dataSource={preview.lines}
                    pagination={{ pageSize: 25, showSizeChanger: true }}
                    scroll={{ x: 1200 }}
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
                        title: 'Vendor',
                        dataIndex: 'vendorCode',
                        width: 100,
                        render: (value: string | null) => value ?? '—',
                      },
                      {
                        title: 'Category',
                        dataIndex: 'categoryNumber',
                        width: 90,
                        align: 'right',
                        render: (value: number | null) => value ?? '—',
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
                        title: 'Cells',
                        key: 'cells',
                        width: 360,
                        render: (_, row) => <Space wrap>{formatCellTag(row)}</Space>,
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
