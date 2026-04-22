/**
 * Batch History — list every batch operation (most recent first) with undo action.
 */

import { App, Button, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link, useNavigate } from 'react-router-dom'
import { useBatchOperations, useUndoBatch } from '../../hooks/useUtilities'
import type { BatchOperation } from '../../services/utilitiesApi'

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
      render: (v: string) => <Tag>{humanizeOp(v)}</Tag>,
    },
    {
      title: 'Change',
      render: (_: unknown, r: BatchOperation) => describeChange(r),
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
      />
    </div>
  )
}

function humanizeOp(op: string): string {
  switch (op) {
    case 'CHANGE_KEYWORDS_ADD': return 'Add keyword'
    case 'CHANGE_KEYWORDS_REMOVE': return 'Remove keyword'
    case 'CHANGE_CATEGORY': return 'Category'
    case 'CHANGE_VENDOR': return 'Vendor'
    case 'CHANGE_SEASON': return 'Season'
    case 'CHANGE_GROUP_CODE': return 'Group code'
    case 'CHANGE_SIZE_COLUMN': return 'Size column rename'
    case 'CHANGE_SIZE_TYPE_STRUCTURE': return 'Size type structure'
    default: return op
  }
}

function describeChange(r: BatchOperation): string {
  const c = r.changeJson as Record<string, unknown>
  switch (r.operationType) {
    case 'CHANGE_KEYWORDS_ADD':
    case 'CHANGE_KEYWORDS_REMOVE':
      return `keyword "${String(c.keyword ?? '')}"`
    case 'CHANGE_CATEGORY':   return `category → ${c.category}`
    case 'CHANGE_VENDOR':     return `vendor → ${String(c.vendor ?? '')}`
    case 'CHANGE_SEASON':     return `season → ${String(c.season ?? '')}`
    case 'CHANGE_GROUP_CODE': return `group → ${String(c.groupCode ?? '')}`
    default:                  return ''
  }
}
