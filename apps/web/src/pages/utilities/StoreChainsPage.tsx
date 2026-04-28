import { useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Button,
  Card,
  Col,
  Empty,
  Input,
  InputNumber,
  Row,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link } from 'react-router-dom'
import { useCreateStoreChain, useStoreChains, useUpdateStoreChain } from '../../hooks/useStores'
import type { StoreChain } from '../../services/storeApi'

function slugifyChainCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function StoreChainsPage() {
  const { message } = AntApp.useApp()
  const { data: chains = [], isLoading } = useStoreChains()
  const createChain = useCreateStoreChain()
  const updateChain = useUpdateStoreChain()
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const [draftSortOrder, setDraftSortOrder] = useState(0)
  const [draftActive, setDraftActive] = useState(true)
  const [newCode, setNewCode] = useState('')
  const [newLabel, setNewLabel] = useState('')

  useEffect(() => {
    if (chains.length === 0) {
      setSelectedChainId(null)
      return
    }
    const firstChain = chains[0]
    if (firstChain && (!selectedChainId || !chains.some((chain) => chain.id === selectedChainId))) {
      setSelectedChainId(firstChain.id)
    }
  }, [chains, selectedChainId])

  const selectedChain = useMemo(
    () => chains.find((chain) => chain.id === selectedChainId) ?? null,
    [chains, selectedChainId],
  )

  useEffect(() => {
    if (!selectedChain) return
    setDraftLabel(selectedChain.label)
    setDraftSortOrder(selectedChain.sortOrder)
    setDraftActive(selectedChain.active)
  }, [selectedChain])

  const hasPendingEdit =
    selectedChain != null &&
    (draftLabel !== selectedChain.label ||
      draftSortOrder !== selectedChain.sortOrder ||
      draftActive !== selectedChain.active)

  async function onCreateChain() {
    const code = slugifyChainCode(newCode || newLabel)
    if (!code || !newLabel.trim()) {
      message.error('Code and label are required.')
      return
    }
    try {
      const chain = await createChain.mutateAsync({
        code,
        label: newLabel.trim(),
        sortOrder: chains.length * 10 + 10,
        active: true,
      })
      setNewCode('')
      setNewLabel('')
      setSelectedChainId(chain.id)
      message.success('Store chain created.')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to create store chain.')
    }
  }

  async function onSaveChain() {
    if (!selectedChain) return
    try {
      await updateChain.mutateAsync({
        id: selectedChain.id,
        input: {
          label: draftLabel.trim(),
          sortOrder: draftSortOrder,
          active: draftActive,
        },
      })
      message.success('Store chain updated.')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to update store chain.')
    }
  }

  const columns: ColumnsType<StoreChain> = [
    {
      title: 'Label',
      dataIndex: 'label',
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      title: 'Code',
      dataIndex: 'id',
      width: 160,
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: 'Stores',
      dataIndex: 'storeCount',
      width: 90,
      render: (value: number) => value,
    },
    {
      title: 'Status',
      dataIndex: 'active',
      width: 110,
      render: (value: boolean) => value ? <Tag color="blue">Active</Tag> : <Tag>Inactive</Tag>,
    },
  ]

  return (
    <div>
      <Typography.Title level={3}>Store Chains</Typography.Title>
      <Typography.Paragraph type="secondary">
        Manage chain definitions here. Store membership is edited from{' '}
        <Link to="/utilities/stores">Stores</Link>, where each store can be assigned to one chain.
      </Typography.Paragraph>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card title="Chains">
            <Table<StoreChain>
              rowKey="id"
              columns={columns}
              dataSource={chains}
              loading={isLoading}
              size="small"
              pagination={false}
              locale={{ emptyText: 'No store chains found.' }}
              rowSelection={{
                type: 'radio',
                selectedRowKeys: selectedChainId ? [selectedChainId] : [],
                onChange: (selectedRowKeys) => {
                  const nextId = selectedRowKeys[0]
                  setSelectedChainId(typeof nextId === 'string' ? nextId : String(nextId))
                },
              }}
              onRow={(record) => ({
                onClick: () => setSelectedChainId(record.id),
                style: { cursor: 'pointer' },
              })}
            />
          </Card>

          <Card title="Create Chain" style={{ marginTop: 16 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Input
                value={newLabel}
                onChange={(event) => {
                  const nextLabel = event.target.value
                  setNewLabel(nextLabel)
                  if (!newCode.trim()) setNewCode(slugifyChainCode(nextLabel))
                }}
                placeholder="Chain label"
              />
              <Input
                value={newCode}
                onChange={(event) => setNewCode(slugifyChainCode(event.target.value))}
                placeholder="chain-code"
              />
              <Button type="primary" onClick={() => void onCreateChain()} loading={createChain.isPending}>
                Create chain
              </Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={14}>
          <Card title="Chain Detail">
            {!selectedChain ? (
              <Empty description="Select a chain to edit it." />
            ) : (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <div>
                  <Typography.Text type="secondary">Code</Typography.Text>
                  <div>
                    <Typography.Text code>{selectedChain.id}</Typography.Text>
                  </div>
                </div>
                <div>
                  <Typography.Text type="secondary">Label</Typography.Text>
                  <Input value={draftLabel} onChange={(event) => setDraftLabel(event.target.value)} />
                </div>
                <div>
                  <Typography.Text type="secondary">Sort Order</Typography.Text>
                  <InputNumber
                    min={0}
                    value={draftSortOrder}
                    onChange={(value) => setDraftSortOrder(value ?? 0)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <Typography.Text type="secondary">Active</Typography.Text>
                  <div>
                    <Switch checked={draftActive} onChange={setDraftActive} />
                  </div>
                </div>
                <div>
                  <Typography.Text type="secondary">Member Stores</Typography.Text>
                  <div style={{ marginTop: 8 }}>
                    {selectedChain.storeNumbers.length === 0 ? (
                      <Typography.Text type="secondary">No stores assigned yet.</Typography.Text>
                    ) : (
                      <Space wrap>
                        {selectedChain.storeNumbers.map((storeNumber) => (
                          <Tag key={storeNumber}>{String(storeNumber).padStart(3, '0')}</Tag>
                        ))}
                      </Space>
                    )}
                  </div>
                </div>
                <Button
                  type="primary"
                  onClick={() => void onSaveChain()}
                  loading={updateChain.isPending}
                  disabled={!hasPendingEdit}
                >
                  Save chain
                </Button>
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
