import { useState } from 'react'
import { App, Button, Input, InputNumber, Popconfirm, Space, Table, Typography } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import {
  useDeleteVendorStoreAccount,
  useUpsertVendorStoreAccount,
  useVendorStoreAccounts,
} from '../../../hooks/useProductsVendors'
import type { VendorStoreAccount } from '../../../types/productsVendor'

interface Props {
  code: string
}

export default function VendorStoreAccountsEditor({ code }: Props) {
  const { message } = App.useApp()
  const { data, isLoading } = useVendorStoreAccounts(code)
  const upsert = useUpsertVendorStoreAccount()
  const remove = useDeleteVendorStoreAccount()
  const [newStoreId, setNewStoreId] = useState<number | null>(null)
  const [newAccountNo, setNewAccountNo] = useState('')

  const onAdd = async () => {
    if (newStoreId == null || !newAccountNo.trim()) {
      message.warning('Store ID and Account # are required')
      return
    }
    try {
      await upsert.mutateAsync({ code, storeId: newStoreId, accountNo: newAccountNo.trim() })
      setNewStoreId(null)
      setNewAccountNo('')
      message.success('Account added')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const onDelete = async (storeId: number) => {
    try {
      await remove.mutateAsync({ code, storeId })
      message.success('Removed')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <>
      <Typography.Paragraph type="secondary">
        Per-store account numbers used on POs printed for each store (RICS p. 153).
      </Typography.Paragraph>
      <Table<VendorStoreAccount>
        rowKey={(r) => `${r.code}:${r.storeId}`}
        dataSource={data}
        loading={isLoading}
        size="small"
        className="products-compact-table"
        pagination={false}
        columns={[
          { title: 'Store', dataIndex: 'storeId', width: 100 },
          { title: 'Account #', dataIndex: 'accountNo' },
          {
            title: '',
            key: 'actions',
            width: 50,
            render: (_: unknown, r: VendorStoreAccount) => (
              <Popconfirm title="Remove this store account?" onConfirm={() => onDelete(r.storeId)}>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
        footer={() => (
          <Space>
            <InputNumber
              placeholder="Store ID"
              min={1}
              value={newStoreId ?? undefined}
              onChange={(v) => setNewStoreId(typeof v === 'number' ? v : null)}
              style={{ width: 120 }}
            />
            <Input
              placeholder="Account #"
              value={newAccountNo}
              onChange={(e) => setNewAccountNo(e.target.value)}
              style={{ width: 220 }}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={onAdd}
              loading={upsert.isPending}
            >
              Add
            </Button>
          </Space>
        )}
      />
    </>
  )
}
