import { useState, useCallback, useMemo } from 'react'
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
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAdjustments } from '../../hooks/useAdjustments'
import type { Adjustment, AdjustmentType, AdjustmentListParams } from '../../types/adjustment'
import ServerDataTable, {
  type ServerQueryChange,
  type ServerTableColumn,
} from '../../components/ServerDataTable'

// RICS Ch. 4 splits what our single "Adjustments" concept conflates into
// five distinct screens (p. 66 Manual Receipt / Return / Order; Ch. 10
// Physical Inventory; p. 67 Change Average Cost). This page mirrors that
// split with a Tabs UI so the operator sees each RICS screen one-to-one.
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
  icon: React.ReactNode
  ricsRef: string
  description: string
  filterType?: AdjustmentType // types to filter on
  newButtonLabel?: string
  newButtonHref?: string
}

const TABS: TabConfig[] = [
  {
    key: 'MANUAL_RECEIPT',
    label: 'Manual Receipt',
    icon: <InboxOutlined />,
    ricsRef: 'RICS Ch. 4 p. 66',
    description:
      'Add on-hand quantities to (Store × SKU × Column × Row) outside a PO. Per-size grid, cost + retail override, case-pack auto-fill, UPC scan.',
    filterType: 'RECEIPT',
    newButtonLabel: 'New Manual Receipt',
    newButtonHref: '/inventory/adjustments/new?type=RECEIPT',
  },
  {
    key: 'MANUAL_RETURN',
    label: 'Manual Return',
    icon: <RollbackOutlined />,
    ricsRef: 'RICS Ch. 4 p. 66',
    description:
      'Decrease on-hand for returns to vendor / shrink-outs. Shows donor on-hand for sanity-check before submit; prints a transaction journal.',
    filterType: 'RETURN',
    newButtonLabel: 'New Manual Return',
    newButtonHref: '/inventory/adjustments/new?type=RETURN',
  },
  {
    key: 'MANUAL_ORDER',
    label: 'Manual Order',
    icon: <FileAddOutlined />,
    ricsRef: 'RICS Ch. 4 p. 66',
    description:
      'Increment on-order without a PO header. Per the inventory spec, this now delegates to the purchasing module as a "Quick Order" — the button below routes there.',
    newButtonLabel: 'New Quick Order →',
    newButtonHref: '/purchasing/orders/new',
  },
  {
    key: 'PHYSICAL',
    label: 'Physical Count',
    icon: <AuditOutlined />,
    ricsRef: 'RICS Ch. 10',
    description:
      'Post variance from a physical count worksheet. Owned by the physical-inventory module in the target architecture; the pre-Phase-1 pipe still shows manual / damage / shrinkage adjustments here.',
    filterType: 'MANUAL_ADJUST',
    newButtonLabel: 'New Physical Adjustment',
    newButtonHref: '/inventory/adjustments/new?type=MANUAL_ADJUST',
  },
  {
    key: 'CHANGE_AVG_COST',
    label: 'Change Avg Cost',
    icon: <DollarOutlined />,
    ricsRef: 'RICS Ch. 4 p. 67',
    description:
      'Manual override of a SKU\'s average cost per store. Owned by the products module in the target architecture — the button below opens the SKU form where cost is editable.',
    newButtonLabel: 'Open SKU List →',
    newButtonHref: '/inventory/skus',
  },
]

export default function AdjustmentListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = (searchParams.get('tab') as AdjustmentTab) || 'MANUAL_RECEIPT'
  const activeTab: AdjustmentTab = TABS.some((t) => t.key === tabFromUrl)
    ? tabFromUrl
    : 'MANUAL_RECEIPT'
  const tabConfig = useMemo(() => TABS.find((t) => t.key === activeTab)!, [activeTab])

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small">
          <Typography.Title level={4} style={{ margin: 0 }}>
            Adjustments
          </Typography.Title>
          <Typography.Text type="secondary">
            RICS Ch. 4 pp. 66–67 + Ch. 10 — this screen splits into five RICS-faithful tabs.
          </Typography.Text>
        </Card>

        <Tabs
          activeKey={activeTab}
          destroyInactiveTabPane
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
            children: <TabPane key={t.key} tab={t} />,
          }))}
        />

        {/* Tab-level pointer for the tabs that delegate elsewhere */}
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

function TabPane({ tab }: { tab: TabConfig }) {
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

  const delegates = !tab.filterType // MANUAL_ORDER / CHANGE_AVG_COST have no filter and no list

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Row align="middle" justify="space-between">
          <Col flex="auto">
            <Typography.Text strong>{tab.label}</Typography.Text>
            <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
              {tab.ricsRef}
            </Typography.Text>
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
              {!delegates && (
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    refetch()
                    message.info('Refreshed')
                  }}
                />
              )}
            </Space>
          </Col>
        </Row>
      </Card>

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
