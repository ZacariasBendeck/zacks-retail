import { useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Row,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import {
  PlusOutlined,
  EyeOutlined,
  ReloadOutlined,
  InboxOutlined,
  RollbackOutlined,
  DollarOutlined,
  AuditOutlined,
  FileAddOutlined,
  SwapOutlined,
  SearchOutlined,
  FundOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAdjustments } from '../../hooks/useAdjustments'
import { useManualReceiptStores, useManualReceipts } from '../../hooks/useManualReceipts'
import { useManualReturnStores, useManualReturns } from '../../hooks/useManualReturns'
import type { Adjustment, AdjustmentType, AdjustmentListParams } from '../../types/adjustment'
import type { ManualReceiptListItem, ManualReceiptListParams } from '../../types/manualReceipt'
import type { ManualReturnListItem, ManualReturnListParams } from '../../types/manualReturn'
import ServerDataTable, {
  type ServerQueryChange,
  type ServerTableColumn,
} from '../../components/ServerDataTable'
import {
  STOCK_MAINTENANCE_LAST_TAB_KEY,
  StockMaintenanceActionGrid,
  StockMaintenanceHero,
  persistString,
  readPersistedString,
} from '../../components/stock-maintenance'
import { SkuLink } from '../../components/sku-link'

type AdjustmentTab =
  | 'MANUAL_RECEIPT'
  | 'MANUAL_RETURN'
  | 'MANUAL_ORDER'
  | 'PHYSICAL'
  | 'CHANGE_AVG_COST'

const TYPE_COLORS: Record<AdjustmentType, string> = {
  RECEIPT: 'green',
  TRANSFER: 'blue',
  MANUAL_ADJUST: 'orange',
  RETURN: 'cyan',
  DAMAGE: 'red',
  SHRINKAGE: 'volcano',
}

interface TabConfig {
  key: AdjustmentTab
  label: string
  icon: ReactNode
  ricsRef: string
  description: string
  statusLabel: string
  statusTone: string
  filterType?: AdjustmentType
  newButtonLabel?: string
  newButtonHref?: string
}

const TABS: TabConfig[] = [
  {
    key: 'MANUAL_RECEIPT',
    label: 'Manual Receipt',
    icon: <InboxOutlined />,
    ricsRef: 'RICS Ch. 4 p. 66',
    statusLabel: 'Live now',
    statusTone: 'green',
    description:
      'Add on-hand quantities to (Store x SKU x Column x Row) outside a PO. Per-size grid, cost + retail override, case-pack auto-fill, UPC scan.',
    newButtonLabel: 'New Manual Receipt',
    newButtonHref: '/inventory/manual-receipts/new',
  },
  {
    key: 'MANUAL_RETURN',
    label: 'Manual Return',
    icon: <RollbackOutlined />,
    ricsRef: 'RICS Ch. 4 p. 66',
    statusLabel: 'Live now',
    statusTone: 'volcano',
    description:
      'Decrease on-hand for returns to vendor / shrink-outs. Shows donor on-hand for sanity-check before submit; prints a transaction journal.',
    newButtonLabel: 'New Manual Return',
    newButtonHref: '/inventory/manual-returns/new',
  },
  {
    key: 'MANUAL_ORDER',
    label: 'Manual Order',
    icon: <FileAddOutlined />,
    ricsRef: 'RICS Ch. 4 p. 66',
    statusLabel: 'Delegates',
    statusTone: 'blue',
    description:
      'Increment on-order without a PO header. Per the inventory spec, this now delegates to the purchasing module as a Quick Order.',
    newButtonLabel: 'New Quick Order ->',
    newButtonHref: '/purchasing/orders/new',
  },
  {
    key: 'PHYSICAL',
    label: 'Physical Count',
    icon: <AuditOutlined />,
    ricsRef: 'RICS Ch. 10',
    statusLabel: 'Bridge',
    statusTone: 'gold',
    description:
      'Post variance from a physical count worksheet. Owned by the physical-inventory module in the target architecture; the current pipe still shows manual adjustments here.',
    filterType: 'MANUAL_ADJUST',
    newButtonLabel: 'New Physical Adjustment',
    newButtonHref: '/inventory/adjustments/new?type=MANUAL_ADJUST',
  },
  {
    key: 'CHANGE_AVG_COST',
    label: 'Change Avg Cost',
    icon: <DollarOutlined />,
    ricsRef: 'RICS Ch. 4 p. 67',
    statusLabel: 'Delegates',
    statusTone: 'blue',
    description:
      "Manual override of a SKU's average cost per store. Owned by the products module in the target architecture; the button below opens the SKU form where cost is editable.",
    newButtonLabel: 'Open SKU List ->',
    newButtonHref: '/inventory/skus',
  },
]

export default function AdjustmentListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') as AdjustmentTab | null
  const persistedTab = readPersistedString(STOCK_MAINTENANCE_LAST_TAB_KEY) as AdjustmentTab | undefined
  const requestedTab = tabFromUrl || persistedTab || 'MANUAL_RECEIPT'
  const activeTab: AdjustmentTab = TABS.some((t) => t.key === tabFromUrl)
    ? (tabFromUrl as AdjustmentTab)
    : TABS.some((t) => t.key === requestedTab)
      ? requestedTab
    : 'MANUAL_RECEIPT'
  const tabConfig = useMemo(() => TABS.find((t) => t.key === activeTab)!, [activeTab])

  useEffect(() => {
    if (tabFromUrl) return
    if (!persistedTab || !TABS.some((tab) => tab.key === persistedTab)) return
    const next = new URLSearchParams(searchParams)
    next.set('tab', persistedTab)
    setSearchParams(next, { replace: true })
  }, [persistedTab, searchParams, setSearchParams, tabFromUrl])

  useEffect(() => {
    persistString(STOCK_MAINTENANCE_LAST_TAB_KEY, activeTab)
  }, [activeTab])

  const quickActions = [
    {
      key: 'receipt',
      title: 'Receive Stock',
      description: 'Create a manual receipt with size-grid entry, UPC support, and cost and retail control.',
      icon: <InboxOutlined />,
      accent: 'linear-gradient(135deg, #0f766e 0%, #0f766e 45%, #155e75 100%)',
      badge: 'Live',
      actionLabel: 'Open Receipt',
      onClick: () => navigate('/inventory/manual-receipts/new'),
    },
    {
      key: 'return',
      title: 'Return or Remove Stock',
      description: 'Decrease on-hand with guardrails against over-return and immediate inquiry visibility.',
      icon: <RollbackOutlined />,
      accent: 'linear-gradient(135deg, #b45309 0%, #b91c1c 100%)',
      badge: 'Live',
      actionLabel: 'Open Return',
      onClick: () => navigate('/inventory/manual-returns/new'),
    },
    {
      key: 'targets',
      title: 'Set Model Quantities',
      description: 'Edit Model, Max, and Reorder targets store by store with app-owned persistence.',
      icon: <FundOutlined />,
      accent: 'linear-gradient(135deg, #1d4ed8 0%, #0f766e 100%)',
      badge: 'Live',
      actionLabel: 'Open Targets',
      onClick: () => navigate('/inventory/replenishment'),
    },
    {
      key: 'size-search',
      title: 'Find by Size',
      description: 'Hunt for comparable stock by size across stores when the requested SKU is not available.',
      icon: <SearchOutlined />,
      accent: 'linear-gradient(135deg, #164e63 0%, #1d4ed8 100%)',
      actionLabel: 'Open Search',
      onClick: () => navigate('/inventory/find-by-size'),
    },
    {
      key: 'manual-transfer',
      title: 'Move Stock',
      description: 'Open the manual transfer workflow to move units between stores from the same inventory spine.',
      icon: <SwapOutlined />,
      accent: 'linear-gradient(135deg, #7c2d12 0%, #0f766e 100%)',
      badge: 'Next slice',
      actionLabel: 'Open Transfer',
      onClick: () => navigate('/inventory/transfers/manual'),
    },
    {
      key: 'auto-transfer',
      title: 'Automatic Transfers',
      description: 'Preview and post warehouse-to-store replenishment by Model quantity with deterministic store order.',
      icon: <FundOutlined />,
      accent: 'linear-gradient(135deg, #0f766e 0%, #1d4ed8 100%)',
      badge: 'Live',
      actionLabel: 'Open Auto',
      onClick: () => navigate('/inventory/transfers/automatic'),
    },
    {
      key: 'balancing-transfer-legacy',
      title: 'Balancing Transfers (Legacy)',
      description: 'Keep the current metric-driven balancing flow available for comparison and familiar operator workflows.',
      icon: <SwapOutlined />,
      accent: 'linear-gradient(135deg, #7c3aed 0%, #0f766e 100%)',
      badge: 'Live',
      actionLabel: 'Open Legacy',
      onClick: () => navigate('/inventory/transfers/balancing'),
    },
    {
      key: 'balancing-transfer-v2',
      title: 'Balancing Transfers v2',
      description: 'Run the new pass-based strategy that protects donor floors, rescues core sizes first, and explains every move.',
      icon: <SwapOutlined />,
      accent: 'linear-gradient(135deg, #0f766e 0%, #1f2937 100%)',
      badge: 'New',
      actionLabel: 'Open v2',
      onClick: () => navigate('/inventory/transfers/balancing-v2'),
    },
  ]

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <StockMaintenanceHero
          eyebrow="Inventory workspace"
          title="Stock Maintenance"
          subtitle="Receive stock, return stock, tune model quantities, and hand off into transfers from one operator workspace backed by the app-owned inventory ledger."
          ricsReference="RICS Ch. 4 pp. 66-80"
          metrics={[
            { label: 'Live write flows', value: '5' },
            { label: 'Inquiry surfaces linked', value: '2' },
            { label: 'Current focus', value: tabConfig.label },
            { label: 'Request authority', value: 'app.*' },
          ]}
          actions={
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Text style={{ color: 'rgba(248, 250, 252, 0.82)', fontWeight: 600 }}>
                Quick launch
              </Typography.Text>
              <Space wrap>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/inventory/manual-receipts/new')}>
                  New Receipt
                </Button>
                <Button icon={<RollbackOutlined />} onClick={() => navigate('/inventory/manual-returns/new')}>
                  New Return
                </Button>
                <Button icon={<FundOutlined />} onClick={() => navigate('/inventory/replenishment')}>
                  Model Quantities
                </Button>
                <Button icon={<SwapOutlined />} onClick={() => navigate('/inventory/transfers/automatic')}>
                  Auto Transfers
                </Button>
              </Space>
            </Space>
          }
          footer={
            <Typography.Text style={{ color: 'rgba(248, 250, 252, 0.82)' }}>
              Manual Receipts, Manual Returns, Model Quantities, Automatic Transfers, and both balancing-transfer versions are app-owned. Manual Orders and Change Avg Cost still open their module-owned surfaces.
            </Typography.Text>
          }
        />

        <StockMaintenanceActionGrid items={quickActions} />

        <Alert
          type="info"
          showIcon
          message={`${tabConfig.label} workspace`}
          description={tabConfig.description}
        />

        <Tabs
          activeKey={activeTab}
          destroyInactiveTabPane
          size="large"
          onChange={(k) => {
            const next = new URLSearchParams(searchParams)
            next.set('tab', k)
            setSearchParams(next)
          }}
          items={TABS.map((t) => ({
            key: t.key,
            label: (
              <Space size={6}>
                {t.icon}
                {t.label}
              </Space>
            ),
            children:
              t.key === 'MANUAL_RECEIPT' ? (
                <ManualReceiptTabPane tab={t} />
              ) : t.key === 'MANUAL_RETURN' ? (
                <ManualReturnTabPane tab={t} />
              ) : (
                <GenericAdjustmentTabPane key={t.key} tab={t} />
              ),
          }))}
        />

        {(activeTab === 'MANUAL_ORDER' || activeTab === 'CHANGE_AVG_COST') && (
          <Alert
            type="info"
            showIcon
            message="This screen belongs to another module"
            description={tabConfig.description}
          />
        )}
      </Space>
    </App>
  )
}

function GenericAdjustmentTabPane({ tab }: { tab: TabConfig }) {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [params, setParams] = useState<AdjustmentListParams>({
    page: 1,
    pageSize: 25,
    sort: 'createdAt',
    order: 'desc',
    type: tab.filterType,
  })

  const effectiveParams = useMemo<AdjustmentListParams>(
    () => ({ ...params, type: tab.filterType }),
    [params, tab.filterType],
  )

  const { data, isLoading, isFetching, refetch } = useAdjustments(effectiveParams)

  const handleTableChange = useCallback((query: ServerQueryChange) => {
    setParams((prev) => ({
      ...prev,
      page: query.page,
      pageSize: query.pageSize,
      sort: (query.sort as AdjustmentListParams['sort']) ?? prev.sort,
      order: query.order ?? prev.order,
    }))
  }, [])

  const columns: ServerTableColumn<Adjustment>[] = [
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      sorter: true,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
      exportValue: (record) => dayjs(record.createdAt).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 130,
      sorter: true,
      render: (type: AdjustmentType) => (
        <Tag color={TYPE_COLORS[type]}>{type.replace('_', ' ')}</Tag>
      ),
      exportValue: (record) => record.type,
    },
    {
      title: 'SKU(s)',
      key: 'skus',
      width: 220,
      ellipsis: true,
      render: (_: unknown, record: Adjustment) =>
        record.lineItems.map((li) => li.skuCode ?? li.skuId).join(', '),
      exportValue: (record) => record.lineItems.map((li) => li.skuCode ?? li.skuId).join(', '),
    },
    {
      title: 'Qty',
      key: 'quantity',
      width: 80,
      align: 'right' as const,
      render: (_: unknown, record: Adjustment) => {
        const total = record.lineItems.reduce((s, li) => s + li.quantity, 0)
        return (
          <Typography.Text type={total < 0 ? 'danger' : 'success'}>
            {total > 0 ? `+${total}` : total}
          </Typography.Text>
        )
      },
      exportValue: (record) => record.lineItems.reduce((s, li) => s + li.quantity, 0),
    },
    {
      title: 'From',
      dataIndex: 'fromLocationName',
      key: 'from',
      width: 140,
      render: (v: string | null) => v ?? '-',
      exportValue: (record) => record.fromLocationName ?? '-',
    },
    {
      title: 'To',
      dataIndex: 'toLocationName',
      key: 'to',
      width: 140,
      render: (v: string | null) => v ?? '-',
      exportValue: (record) => record.toLocationName ?? '-',
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      width: 200,
      ellipsis: true,
      render: (v: string | null) => v ?? '-',
      exportValue: (record) => record.reason ?? '-',
    },
    {
      title: 'By',
      dataIndex: 'createdBy',
      key: 'createdBy',
      width: 140,
      ellipsis: true,
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: unknown, record: Adjustment) => (
        <Button
          type="text"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/inventory/adjustments/${record.id}`)}
        />
      ),
    },
  ]

  const delegates = !tab.filterType

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <TabHeader tab={tab} onRefresh={delegates ? undefined : () => {
        refetch()
        message.info('Refreshed')
      }} />

      {!delegates && (
        <Card size="small" title="Filters">
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={8} md={6}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                From Date
              </Typography.Text>
              <DatePicker
                style={{ width: '100%' }}
                value={params.fromDate ? dayjs(params.fromDate) : null}
                onChange={(d) =>
                  setParams((p) => ({
                    ...p,
                    fromDate: d ? d.startOf('day').toISOString() : undefined,
                    page: 1,
                  }))
                }
              />
            </Col>
            <Col xs={24} sm={8} md={6}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                To Date
              </Typography.Text>
              <DatePicker
                style={{ width: '100%' }}
                value={params.toDate ? dayjs(params.toDate) : null}
                onChange={(d) =>
                  setParams((p) => ({
                    ...p,
                    toDate: d ? d.endOf('day').toISOString() : undefined,
                    page: 1,
                  }))
                }
              />
            </Col>
          </Row>
        </Card>
      )}

      {delegates ? (
        <Card>
          <Empty
            description={
              tab.key === 'MANUAL_ORDER'
                ? 'Manual Orders are created through the Purchasing module. Click the button above to open a new PO.'
                : 'Average cost is edited from the SKU form in the Products module. Click the button above to open the SKU List.'
            }
          />
        </Card>
      ) : (
        <Card size="small">
          <ServerDataTable<Adjustment>
            title={<Typography.Text strong>{tab.label} entries</Typography.Text>}
            data={data?.data}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            fetching={isFetching}
            pagination={data?.pagination}
            onQueryChange={handleTableChange}
            expectedTotalRows={data?.pagination.totalItems}
            exportFileName={`${tab.key.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`}
            scrollX={1100}
          />
        </Card>
      )}
    </Space>
  )
}

function ManualReceiptTabPane({ tab }: { tab: TabConfig }) {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [params, setParams] = useState<ManualReceiptListParams>({
    page: 1,
    pageSize: 25,
    sort: 'movementAt',
    order: 'desc',
  })
  const { data: stores } = useManualReceiptStores()
  const { data, isLoading, isFetching, refetch } = useManualReceipts(params)

  const handleTableChange = useCallback((query: ServerQueryChange) => {
    setParams((prev) => ({
      ...prev,
      page: query.page,
      pageSize: query.pageSize,
      sort: (query.sort as ManualReceiptListParams['sort']) ?? prev.sort,
      order: query.order ?? prev.order,
    }))
  }, [])

  const columns: ServerTableColumn<ManualReceiptListItem>[] = [
    {
      title: 'Date',
      dataIndex: 'movementAt',
      key: 'movementAt',
      width: 160,
      sorter: true,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
      exportValue: (record) => dayjs(record.movementAt).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: 'SKU',
      dataIndex: 'skuCode',
      key: 'skuCode',
      width: 160,
      render: (skuCode: string, record: ManualReceiptListItem) => (
        <SkuLink skuCode={skuCode} storeId={record.storeId}>
          {skuCode}
        </SkuLink>
      ),
      exportValue: (record) => record.skuCode,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 260,
      ellipsis: true,
      render: (value: string | null) => value ?? '-',
      exportValue: (record) => record.description ?? '-',
    },
    {
      title: 'Qty',
      dataIndex: 'totalUnits',
      key: 'totalUnits',
      width: 90,
      align: 'right' as const,
      render: (value: number) => <Typography.Text type="success">+{value}</Typography.Text>,
      exportValue: (record) => record.totalUnits,
    },
    {
      title: 'Store',
      dataIndex: 'storeLabel',
      key: 'storeLabel',
      width: 180,
      render: (value: string) => value,
      exportValue: (record) => record.storeLabel,
    },
    {
      title: 'Reference',
      dataIndex: 'referenceNumber',
      key: 'referenceNumber',
      width: 180,
      ellipsis: true,
      render: (value: string | null) => value ?? '-',
      exportValue: (record) => record.referenceNumber ?? '-',
    },
    {
      title: 'By',
      dataIndex: 'performedBy',
      key: 'performedBy',
      width: 160,
      ellipsis: true,
      exportValue: (record) => record.performedBy,
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: unknown, record: ManualReceiptListItem) => (
        <Button
          type="text"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/inventory/manual-receipts/${record.id}`)}
        />
      ),
    },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <TabHeader tab={tab} onRefresh={() => {
        refetch()
        message.info('Refreshed')
      }} />

      <Card size="small" title="Filters">
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Store
            </Typography.Text>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              placeholder="All stores"
              value={params.storeId}
              onChange={(value) =>
                setParams((prev) => ({
                  ...prev,
                  storeId: typeof value === 'number' ? value : undefined,
                  page: 1,
                }))
              }
              options={(stores ?? []).map((store) => ({
                value: store.storeId,
                label: store.storeLabel,
              }))}
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              From Date
            </Typography.Text>
            <DatePicker
              style={{ width: '100%' }}
              value={params.fromDate ? dayjs(params.fromDate) : null}
              onChange={(d) =>
                setParams((prev) => ({
                  ...prev,
                  fromDate: d ? d.startOf('day').toISOString() : undefined,
                  page: 1,
                }))
              }
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              To Date
            </Typography.Text>
            <DatePicker
              style={{ width: '100%' }}
              value={params.toDate ? dayjs(params.toDate) : null}
              onChange={(d) =>
                setParams((prev) => ({
                  ...prev,
                  toDate: d ? d.endOf('day').toISOString() : undefined,
                  page: 1,
                }))
              }
            />
          </Col>
        </Row>
      </Card>

      <Card size="small">
        <ServerDataTable<ManualReceiptListItem>
          title={<Typography.Text strong>{tab.label} entries</Typography.Text>}
          data={data?.data}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          fetching={isFetching}
          pagination={data?.pagination}
          onQueryChange={handleTableChange}
          expectedTotalRows={data?.pagination.totalItems}
          exportFileName={`manual-receipts-${new Date().toISOString().slice(0, 10)}`}
          scrollX={1150}
        />
      </Card>
    </Space>
  )
}

function ManualReturnTabPane({ tab }: { tab: TabConfig }) {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [params, setParams] = useState<ManualReturnListParams>({
    page: 1,
    pageSize: 25,
    sort: 'movementAt',
    order: 'desc',
  })
  const { data: stores } = useManualReturnStores()
  const { data, isLoading, isFetching, refetch } = useManualReturns(params)

  const handleTableChange = useCallback((query: ServerQueryChange) => {
    setParams((prev) => ({
      ...prev,
      page: query.page,
      pageSize: query.pageSize,
      sort: (query.sort as ManualReturnListParams['sort']) ?? prev.sort,
      order: query.order ?? prev.order,
    }))
  }, [])

  const columns: ServerTableColumn<ManualReturnListItem>[] = [
    {
      title: 'Date',
      dataIndex: 'movementAt',
      key: 'movementAt',
      width: 160,
      sorter: true,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
      exportValue: (record) => dayjs(record.movementAt).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: 'SKU',
      dataIndex: 'skuCode',
      key: 'skuCode',
      width: 160,
      render: (skuCode: string, record: ManualReturnListItem) => (
        <SkuLink skuCode={skuCode} storeId={record.storeId}>
          {skuCode}
        </SkuLink>
      ),
      exportValue: (record) => record.skuCode,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 260,
      ellipsis: true,
      render: (value: string | null) => value ?? '-',
      exportValue: (record) => record.description ?? '-',
    },
    {
      title: 'Qty',
      dataIndex: 'totalUnits',
      key: 'totalUnits',
      width: 90,
      align: 'right' as const,
      render: (value: number) => <Typography.Text type="danger">-{value}</Typography.Text>,
      exportValue: (record) => record.totalUnits,
    },
    {
      title: 'Store',
      dataIndex: 'storeLabel',
      key: 'storeLabel',
      width: 180,
      render: (value: string) => value,
      exportValue: (record) => record.storeLabel,
    },
    {
      title: 'Reason',
      dataIndex: 'returnReasonCode',
      key: 'returnReasonCode',
      width: 180,
      ellipsis: true,
      render: (value: string | null) => value ?? '-',
      exportValue: (record) => record.returnReasonCode ?? '-',
    },
    {
      title: 'RMA',
      dataIndex: 'rmaNumber',
      key: 'rmaNumber',
      width: 160,
      ellipsis: true,
      render: (value: string | null) => value ?? '-',
      exportValue: (record) => record.rmaNumber ?? '-',
    },
    {
      title: 'By',
      dataIndex: 'performedBy',
      key: 'performedBy',
      width: 160,
      ellipsis: true,
      exportValue: (record) => record.performedBy,
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: unknown, record: ManualReturnListItem) => (
        <Button
          type="text"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/inventory/manual-returns/${record.id}`)}
        />
      ),
    },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <TabHeader tab={tab} onRefresh={() => {
        refetch()
        message.info('Refreshed')
      }} />

      <Card size="small" title="Filters">
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Store
            </Typography.Text>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              placeholder="All stores"
              value={params.storeId}
              onChange={(value) =>
                setParams((prev) => ({
                  ...prev,
                  storeId: typeof value === 'number' ? value : undefined,
                  page: 1,
                }))
              }
              options={(stores ?? []).map((store) => ({
                value: store.storeId,
                label: store.storeLabel,
              }))}
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              From Date
            </Typography.Text>
            <DatePicker
              style={{ width: '100%' }}
              value={params.fromDate ? dayjs(params.fromDate) : null}
              onChange={(d) =>
                setParams((prev) => ({
                  ...prev,
                  fromDate: d ? d.startOf('day').toISOString() : undefined,
                  page: 1,
                }))
              }
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              To Date
            </Typography.Text>
            <DatePicker
              style={{ width: '100%' }}
              value={params.toDate ? dayjs(params.toDate) : null}
              onChange={(d) =>
                setParams((prev) => ({
                  ...prev,
                  toDate: d ? d.endOf('day').toISOString() : undefined,
                  page: 1,
                }))
              }
            />
          </Col>
        </Row>
      </Card>

      <Card size="small">
        <ServerDataTable<ManualReturnListItem>
          title={<Typography.Text strong>{tab.label} entries</Typography.Text>}
          data={data?.data}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          fetching={isFetching}
          pagination={data?.pagination}
          onQueryChange={handleTableChange}
          expectedTotalRows={data?.pagination.totalItems}
          exportFileName={`manual-returns-${new Date().toISOString().slice(0, 10)}`}
          scrollX={1240}
        />
      </Card>
    </Space>
  )
}

function TabHeader({
  tab,
  onRefresh,
}: {
  tab: TabConfig
  onRefresh?: () => void
}) {
  const navigate = useNavigate()

  return (
    <Card
      bordered={false}
      style={{
        borderRadius: 20,
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)',
      }}
    >
      <Row align="middle" justify="space-between">
        <Col flex="auto">
          <Space wrap size={10}>
            <Typography.Text strong>{tab.label}</Typography.Text>
            <Tag color={tab.statusTone}>{tab.statusLabel}</Tag>
            <Typography.Text type="secondary">{tab.ricsRef}</Typography.Text>
          </Space>
          <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
            {tab.description}
          </Typography.Paragraph>
        </Col>
        <Col>
          <Space>
            {tab.newButtonHref && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate(tab.newButtonHref!)}
              >
                {tab.newButtonLabel ?? 'New'}
              </Button>
            )}
            {onRefresh && (
              <Button icon={<ReloadOutlined />} onClick={onRefresh} />
            )}
          </Space>
        </Col>
      </Row>
    </Card>
  )
}
