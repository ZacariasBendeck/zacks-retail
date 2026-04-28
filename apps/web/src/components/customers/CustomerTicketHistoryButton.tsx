import { useMemo, useState } from 'react'
import { Alert, Button, Empty, Space, Table, Tag, Typography } from 'antd'
import type { ButtonProps, TableColumnsType } from 'antd'
import { ProfileOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useCustomerTicketHistory } from '../../hooks/useCustomers'
import type { CustomerTicketHistoryEntry } from '../../types/customer'
import { DraggableModal } from '../draggable-modal'

export interface CustomerTicketHistoryButtonProps {
  customerId: string
  customerName?: string | null
  buttonText?: string
  buttonProps?: ButtonProps
}

export function CustomerTicketHistoryButton({
  customerId,
  customerName,
  buttonText = 'Tickets',
  buttonProps,
}: CustomerTicketHistoryButtonProps) {
  const [open, setOpen] = useState(false)
  const { data, isLoading, isError, error, refetch, isFetching } = useCustomerTicketHistory(customerId, open)
  const amountFormatter = new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const percentFormatter = new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })

  const columns = useMemo<TableColumnsType<CustomerTicketHistoryEntry>>(
    () => [
      {
        title: 'Date',
        dataIndex: 'purchasedAt',
        key: 'purchasedAt',
        width: 150,
        render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
      },
      {
        title: 'Store',
        key: 'store',
        width: 220,
        render: (_: unknown, row) => {
          if (row.storeId == null) return <Typography.Text type="secondary">-</Typography.Text>
          return row.storeName ? `${row.storeId} · ${row.storeName}` : String(row.storeId)
        },
      },
      {
        title: 'Vendor',
        dataIndex: 'vendorSummary',
        key: 'vendorSummary',
        width: 170,
        render: (value: string | null) => value ?? <Typography.Text type="secondary">-</Typography.Text>,
      },
      {
        title: 'Department',
        dataIndex: 'categorySummary',
        key: 'categorySummary',
        width: 180,
        render: (value: string | null) => value ?? <Typography.Text type="secondary">-</Typography.Text>,
      },
      {
        title: 'Qty',
        dataIndex: 'quantity',
        key: 'quantity',
        width: 80,
        align: 'right',
      },
      {
        title: 'Lines',
        dataIndex: 'lineCount',
        key: 'lineCount',
        width: 80,
        align: 'right',
      },
      {
        title: 'Total',
        dataIndex: 'totalAmountCents',
        key: 'totalAmountCents',
        width: 120,
        align: 'right',
        render: (value: number) => amountFormatter.format(value / 100),
      },
      {
        title: 'GP %',
        dataIndex: 'grossProfitPct',
        key: 'grossProfitPct',
        width: 95,
        align: 'right',
        render: (value: number | null) =>
          value == null ? <Typography.Text type="secondary">-</Typography.Text> : `${percentFormatter.format(value)}%`,
      },
      {
        title: 'Channel',
        dataIndex: 'channel',
        key: 'channel',
        width: 100,
        render: (value: string) => <Tag>{value}</Tag>,
      },
    ],
    [amountFormatter, percentFormatter],
  )

  return (
    <>
      <Button
        icon={<ProfileOutlined />}
        onClick={() => setOpen(true)}
        {...buttonProps}
      >
        {buttonText}
      </Button>

      <DraggableModal
        open={open}
        onCancel={() => setOpen(false)}
        title={customerName ? `Ticket History · ${customerName}` : 'Ticket History'}
        width={1100}
        footer={null}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Typography.Text type="secondary">Amounts in Lempira (HNL)</Typography.Text>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void refetch()}
              loading={isFetching}
            >
              Refresh
            </Button>
          </Space>

          {isError ? (
            <Alert
              type="error"
              showIcon
              message="Unable to load ticket history"
              description={error instanceof Error ? error.message : 'The ticket history request failed.'}
            />
          ) : (
            <Table<CustomerTicketHistoryEntry>
              rowKey="id"
              size="small"
              loading={isLoading}
              columns={columns}
              dataSource={data ?? []}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              scroll={{ x: 1000 }}
              locale={{
                emptyText: isLoading ? 'Loading tickets...' : <Empty description="No purchase tickets found" />,
              }}
            />
          )}
        </Space>
      </DraggableModal>
    </>
  )
}

export default CustomerTicketHistoryButton
