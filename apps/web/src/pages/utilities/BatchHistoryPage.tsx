/**
 * Batch History - list every batch operation (most recent first) with undo action.
 */

import { App, Button, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link, useNavigate } from 'react-router-dom'
import { useBatchOperations, useUndoBatch } from '../../hooks/useUtilities'
import type { BatchOperation } from '../../services/utilitiesApi'
import {
  describeBatchOperationChange,
  describeBatchSkuQuery,
  humanizeBatchOperation,
} from './batchHistoryFormatters'

export default function BatchHistoryPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useBatchOperations({ limit: 50 })
  const undo = useUndoBatch()

  const onUndo = async (id: string) => {
    try {
      const res = await undo.mutateAsync(id)
      message.success(`Reversed ${res.reversed} SKU${res.reversed === 1 ? '' : 's'}.`)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const columns: ColumnsType<BatchOperation> = [
    {
      title: 'When',
      dataIndex: 'startedAt',
      render: (v: string) => new Date(v).toLocaleString(),
      width: 180,
    },
    { title: 'Operator', dataIndex: 'actor', width: 160 },
    {
      title: 'Operation',
      dataIndex: 'operationType',
      render: (v: string) => <Tag>{humanizeBatchOperation(v)}</Tag>,
      width: 180,
    },
    {
      title: 'Change',
      render: (_: unknown, r: BatchOperation) => {
        const text = describeBatchOperationChange(r)
        return (
          <Typography.Text ellipsis={{ tooltip: text }} style={{ display: 'inline-block', maxWidth: 280 }}>
            {text}
          </Typography.Text>
        )
      },
      width: 300,
    },
    {
      title: 'SKU Query',
      render: (_: unknown, r: BatchOperation) => {
        const text = describeBatchSkuQuery(r.criteriaJson)
        return (
          <Typography.Text ellipsis={{ tooltip: text }} style={{ display: 'inline-block', maxWidth: 360 }}>
            {text}
          </Typography.Text>
        )
      },
      width: 380,
    },
    {
      title: 'SKUs',
      dataIndex: 'affectedCount',
      align: 'right' as const,
      width: 80,
    },
    {
      title: 'Status',
      render: (_: unknown, r: BatchOperation) =>
        r.undoneAt ? <Tag color="red">Undone</Tag>
          : r.completedAt ? <Tag color="green">Applied</Tag>
          : <Tag color="orange">In flight</Tag>,
      width: 100,
    },
    {
      title: 'Actions',
      render: (_: unknown, r: BatchOperation) => (
        <Space>
          <Link to={`/utilities/batch-history/${r.id}`}>Details</Link>
          {r.completedAt && !r.undoneAt && (
            <Popconfirm
              title="Undo this batch?"
              description={`Reverses change on ${r.affectedCount} SKU${r.affectedCount === 1 ? '' : 's'}.`}
              okText="Undo"
              cancelText="Cancel"
              onConfirm={() => onUndo(r.id)}
            >
              <Button size="small" danger loading={undo.isPending}>
                Undo
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
      width: 180,
    },
  ]

  return (
    <div>
      <Typography.Title level={3}>Batch History</Typography.Title>
      <Typography.Paragraph type="secondary">
        Every utilities batch operation, newest first. Click Details to see per-SKU before/after.
      </Typography.Paragraph>
      <Space style={{ marginBottom: 12 }}>
        <Button onClick={() => navigate('/utilities')}>Back to Utilities</Button>
      </Space>
      <Table<BatchOperation>
        rowKey="id"
        columns={columns}
        dataSource={data?.rows ?? []}
        loading={isLoading}
        size="small"
        pagination={{ pageSize: 20 }}
        scroll={{ x: 1400 }}
      />
    </div>
  )
}
