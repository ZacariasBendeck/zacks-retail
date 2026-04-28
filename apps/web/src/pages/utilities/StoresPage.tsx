import { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link } from 'react-router-dom'
import { useAssignStoreChain, useStore, useStoreChains, useStores } from '../../hooks/useStores'
import type { StoreDetail, StoreSummary } from '../../services/storeApi'

function renderValue(value: string | number | null | undefined) {
  if (value == null || value === '') {
    return <Typography.Text type="secondary">-</Typography.Text>
  }
  return String(value)
}

function renderAddress(detail: StoreDetail, kind: 'store' | 'billTo') {
  const line1 = kind === 'store' ? detail.address1 : detail.billToAddress1
  const line2 = kind === 'store' ? detail.address2 : detail.billToAddress2
  const city = kind === 'store' ? detail.city : detail.billToCity
  const state = kind === 'store' ? detail.state : detail.billToState
  const zip = kind === 'store' ? detail.zip : detail.billToZip

  const lines = [
    line1,
    line2,
    [city, state].filter(Boolean).join(', '),
    zip,
  ].filter((value): value is string => !!value && value.trim().length > 0)

  if (lines.length === 0) {
    return <Typography.Text type="secondary">-</Typography.Text>
  }

  return (
    <span>
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </span>
  )
}

function renderChainTag(chainLabel: string | null) {
  if (!chainLabel) return <Tag>Unassigned</Tag>
  return <Tag color="blue">{chainLabel}</Tag>
}

export default function StoresPage() {
  const { message } = AntApp.useApp()
  const { data: stores = [], isLoading: storesLoading } = useStores()
  const { data: chains = [] } = useStoreChains()
  const assignChain = useAssignStoreChain()
  const [search, setSearch] = useState('')
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null)
  const [pendingChainId, setPendingChainId] = useState<string | undefined>(undefined)

  const filteredStores = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return stores
    return stores.filter((store) =>
      store.code.toLowerCase().includes(needle) ||
      store.name.toLowerCase().includes(needle) ||
      (store.chainLabel ?? '').toLowerCase().includes(needle),
    )
  }, [stores, search])

  useEffect(() => {
    if (filteredStores.length === 0) {
      setSelectedStoreId(null)
      return
    }
    const firstStore = filteredStores[0]
    if (firstStore && (selectedStoreId == null || !filteredStores.some((store) => store.id === selectedStoreId))) {
      setSelectedStoreId(firstStore.id)
    }
  }, [filteredStores, selectedStoreId])

  const { data: storeDetail, isLoading: storeDetailLoading } = useStore(selectedStoreId)

  useEffect(() => {
    setPendingChainId(storeDetail?.chainId ?? undefined)
  }, [storeDetail?.chainId, storeDetail?.id])

  const chainOptions = useMemo(
    () =>
      chains
        .filter((chain) => chain.active || chain.id === storeDetail?.chainId)
        .map((chain) => ({
          value: chain.id,
          label: `${chain.label} (${chain.storeCount})`,
        })),
    [chains, storeDetail?.chainId],
  )

  const hasPendingChainChange = (pendingChainId ?? null) !== (storeDetail?.chainId ?? null)

  async function onSaveChain() {
    if (!selectedStoreId) return
    try {
      await assignChain.mutateAsync({ storeId: selectedStoreId, chainId: pendingChainId ?? null })
      message.success('Store chain updated.')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to update store chain.')
    }
  }

  const columns: ColumnsType<StoreSummary> = [
    {
      title: 'Code',
      dataIndex: 'code',
      width: 90,
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: 'Store Name',
      dataIndex: 'name',
      render: (value: string, record: StoreSummary) => (
        <button
          type="button"
          onClick={() => setSelectedStoreId(record.id)}
          style={{
            background: 'none',
            border: 0,
            padding: 0,
            color: '#1677ff',
            cursor: 'pointer',
            font: 'inherit',
            textAlign: 'left',
          }}
        >
          {value}
        </button>
      ),
    },
    {
      title: 'Chain',
      dataIndex: 'chainLabel',
      width: 180,
      render: (_value: string | null, record: StoreSummary) => renderChainTag(record.chainLabel),
    },
  ]

  return (
    <div>
      <Typography.Title level={3}>Stores</Typography.Title>
      <Typography.Paragraph type="secondary">
        Store roster and detail view. Assign each store to a chain here, and use{' '}
        <Link to="/utilities/store-chains">Store Chains</Link> to manage the chain definitions themselves.
      </Typography.Paragraph>

      <Row gutter={16} align="stretch">
        <Col xs={24} lg={10}>
          <Card
            title="Store List"
            extra={
              <Link to="/utilities/store-chains">
                <Button size="small">Manage chains</Button>
              </Link>
            }
          >
            <Input.Search
              placeholder="Search by code, store name, or chain"
              allowClear
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ marginBottom: 12 }}
            />
            <Table<StoreSummary>
              rowKey="id"
              columns={columns}
              dataSource={filteredStores}
              loading={storesLoading}
              size="small"
              pagination={{ pageSize: 12, hideOnSinglePage: true }}
              rowSelection={{
                type: 'radio',
                selectedRowKeys: selectedStoreId != null ? [selectedStoreId] : [],
                onChange: (selectedRowKeys) => {
                  const nextId = selectedRowKeys[0]
                  setSelectedStoreId(typeof nextId === 'number' ? nextId : Number(nextId))
                },
              }}
              onRow={(record) => ({
                onClick: () => setSelectedStoreId(record.id),
                style: { cursor: 'pointer' },
              })}
              locale={{
                emptyText: storesLoading ? 'Loading stores...' : 'No stores match the current filter.',
              }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card
            title="Store Detail"
            extra={
              storeDetail ? (
                <Space>
                  {renderChainTag(storeDetail.chainLabel)}
                  <Tag color="blue">
                    {storeDetail.code} | {storeDetail.active ? 'Active' : 'Inactive'}
                  </Tag>
                </Space>
              ) : null
            }
          >
            {storeDetailLoading ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <Spin />
              </div>
            ) : !storeDetail ? (
              <Empty description="Select a store to view its information." />
            ) : (
              <>
                <Typography.Title level={4} style={{ marginTop: 0 }}>
                  {storeDetail.name}
                </Typography.Title>

                <Card size="small" title="Chain Assignment" style={{ marginBottom: 16 }}>
                  <Row gutter={[12, 12]} align="middle">
                    <Col xs={24} md={14}>
                      <Select
                        allowClear
                        placeholder="No chain assigned"
                        value={pendingChainId}
                        onChange={(value) => setPendingChainId(value)}
                        options={chainOptions}
                        style={{ width: '100%' }}
                        disabled={assignChain.isPending}
                      />
                    </Col>
                    <Col xs={24} md={10}>
                      <Space>
                        <Button
                          type="primary"
                          onClick={() => void onSaveChain()}
                          loading={assignChain.isPending}
                          disabled={!hasPendingChainChange}
                        >
                          Save chain
                        </Button>
                        <Link to="/utilities/store-chains">Edit chains</Link>
                      </Space>
                    </Col>
                  </Row>
                </Card>

                <Descriptions
                  bordered
                  size="small"
                  column={2}
                  style={{ marginBottom: 16 }}
                  title="General"
                >
                  <Descriptions.Item label="Store Number">
                    <Typography.Text code>{storeDetail.code}</Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Chain">
                    {renderChainTag(storeDetail.chainLabel)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Mail Name">
                    {renderValue(storeDetail.mailName)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Email">
                    {renderValue(storeDetail.email)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Phone">
                    {renderValue(storeDetail.phone)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Fax">
                    {renderValue(storeDetail.fax)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Last Ticket Used">
                    {renderValue(storeDetail.lastTicketUsed)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Other Charge Description">
                    {renderValue(storeDetail.otherChargeDescription)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Region">
                    {renderValue(storeDetail.region)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Last Changed" span={2}>
                    {storeDetail.dateLastChanged
                      ? new Date(storeDetail.dateLastChanged).toLocaleString()
                      : <Typography.Text type="secondary">-</Typography.Text>}
                  </Descriptions.Item>
                </Descriptions>

                <Descriptions
                  bordered
                  size="small"
                  column={2}
                  style={{ marginBottom: 16 }}
                  title="Store Address"
                >
                  <Descriptions.Item label="Address" span={2}>
                    {renderAddress(storeDetail, 'store')}
                  </Descriptions.Item>
                  <Descriptions.Item label="City">
                    {renderValue(storeDetail.city)}
                  </Descriptions.Item>
                  <Descriptions.Item label="State">
                    {renderValue(storeDetail.state)}
                  </Descriptions.Item>
                  <Descriptions.Item label="ZIP" span={2}>
                    {renderValue(storeDetail.zip)}
                  </Descriptions.Item>
                </Descriptions>

                <Descriptions bordered size="small" column={2} title="Bill-To Address">
                  <Descriptions.Item label="Bill-To Name" span={2}>
                    {renderValue(storeDetail.billToName)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Address" span={2}>
                    {renderAddress(storeDetail, 'billTo')}
                  </Descriptions.Item>
                  <Descriptions.Item label="Bill-To City">
                    {renderValue(storeDetail.billToCity)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Bill-To State">
                    {renderValue(storeDetail.billToState)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Bill-To ZIP" span={2}>
                    {renderValue(storeDetail.billToZip)}
                  </Descriptions.Item>
                </Descriptions>
              </>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
