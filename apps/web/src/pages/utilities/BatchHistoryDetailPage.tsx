/**
 * Batch History Detail - per-SKU before/after view of one batch operation + undo.
 */

import { App, Button, Card, Descriptions, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate, useParams } from 'react-router-dom'
import { useBatchOperation, useUndoBatch } from '../../hooks/useUtilities'
import type { BatchOperationItem } from '../../services/utilitiesApi'
import {
  describeBatchOperationChange,
  describeBatchSkuQuery,
  humanizeBatchOperation,
} from './batchHistoryFormatters'

export default function BatchHistoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading } = useBatchOperation(id)
  const undo = useUndoBatch()

  const onUndo = async () => {
    if (!id) return
    try {
      const res = await undo.mutateAsync(id)
      message.success(`Reversed ${res.reversed} SKU${res.reversed === 1 ? '' : 's'}.`)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const columns: ColumnsType<BatchOperationItem> = [
    { title: 'SKU', dataIndex: 'ricsSkuCode', width: 180 },
    {
      title: 'Before',
      render: (_: unknown, r: BatchOperationItem) =>
        r.beforeJson ? <pre style={{ margin: 0 }}>{JSON.stringify(r.beforeJson, null, 0)}</pre> : '-',
    },
    {
      title: 'After',
      render: (_: unknown, r: BatchOperationItem) =>
        r.afterJson ? <pre style={{ margin: 0 }}>{JSON.stringify(r.afterJson, null, 0)}</pre> : '-',
    },
  ]

  return (
    <div>
      <Typography.Title level={3}>Batch Operation</Typography.Title>
      <Space style={{ marginBottom: 12 }}>
        <Button onClick={() => navigate('/utilities/batch-history')}>Back</Button>
        {data && data.completedAt && !data.undoneAt && (
          <Popconfirm
            title="Undo this batch?"
            description={`Reverses change on ${data.affectedCount} SKU${data.affectedCount === 1 ? '' : 's'}.`}
            okText="Undo"
            cancelText="Cancel"
            onConfirm={onUndo}
          >
            <Button danger loading={undo.isPending}>Undo</Button>
          </Popconfirm>
        )}
      </Space>

      {data && (
        <>
          <Card size="small" style={{ marginBottom: 16 }}>
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="ID">{data.id}</Descriptions.Item>
              <Descriptions.Item label="Operator">{data.actor}</Descriptions.Item>
              <Descriptions.Item label="Operation">{humanizeBatchOperation(data.operationType)}</Descriptions.Item>
              <Descriptions.Item label="Affected">{data.affectedCount}</Descriptions.Item>
              <Descriptions.Item label="Started">{new Date(data.startedAt).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="Completed">
                {data.completedAt ? new Date(data.completedAt).toLocaleString() : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                {data.undoneAt
                  ? <Tag color="red">Undone {new Date(data.undoneAt).toLocaleString()}</Tag>
                  : data.completedAt
                    ? <Tag color="green">Applied</Tag>
                    : <Tag color="orange">In flight</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="Change summary" span={2}>
                {describeBatchOperationChange(data)}
              </Descriptions.Item>
              <Descriptions.Item label="SKU query" span={2}>
                {describeBatchSkuQuery(data.criteriaJson)}
              </Descriptions.Item>
              <Descriptions.Item label="Criteria JSON" span={2}>
                <pre style={{ margin: 0 }}>{JSON.stringify(data.criteriaJson, null, 2)}</pre>
              </Descriptions.Item>
              <Descriptions.Item label="Change JSON" span={2}>
                <pre style={{ margin: 0 }}>{JSON.stringify(data.changeJson, null, 2)}</pre>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Table<BatchOperationItem>
            rowKey="id"
            columns={columns}
            dataSource={data.items ?? []}
            loading={isLoading}
            size="small"
            pagination={{ pageSize: 50 }}
          />
        </>
      )}
    </div>
  )
}
