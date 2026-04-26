import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Empty, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { fetchInquiryOpenPos, type InquiryOpenPoRow } from '../../../../services/ricsInventoryApi';

const columns: ColumnsType<InquiryOpenPoRow> = [
  {
    title: 'PO #',
    dataIndex: 'poNumber',
    key: 'poNumber',
    width: 140,
  },
  {
    title: 'Store',
    dataIndex: 'storeId',
    key: 'storeId',
    width: 80,
  },
  {
    title: 'Type',
    dataIndex: 'orderClass',
    key: 'orderClass',
    width: 110,
    render: (value: InquiryOpenPoRow['orderClass']) => (
      <Tag color={value === 'AT_ONCE' ? 'blue' : 'gold'}>
        {value === 'AT_ONCE' ? 'At-Once' : 'Future'}
      </Tag>
    ),
  },
  {
    title: 'Due',
    dataIndex: 'dueDate',
    key: 'dueDate',
    width: 110,
    render: (value: string | null) => value?.slice(0, 10) ?? '',
  },
  {
    title: 'Row',
    dataIndex: 'rowLabel',
    key: 'rowLabel',
    width: 72,
    render: (value: string) => value || 'Qty',
  },
  {
    title: 'Size',
    dataIndex: 'columnLabel',
    key: 'columnLabel',
    width: 88,
  },
  {
    title: 'Ordered',
    dataIndex: 'orderedQty',
    key: 'orderedQty',
    align: 'right',
    width: 88,
  },
  {
    title: 'Received',
    dataIndex: 'receivedQty',
    key: 'receivedQty',
    align: 'right',
    width: 88,
  },
  {
    title: 'Open',
    dataIndex: 'openQty',
    key: 'openQty',
    align: 'right',
    width: 88,
  },
];

export const PosTab: React.FC<{ skuCode: string; storeId?: number }> = ({ skuCode, storeId }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['inquiry-open-pos', skuCode, storeId ?? null],
    queryFn: () => fetchInquiryOpenPos(skuCode, storeId),
    staleTime: 30_000,
  });

  if (error) {
    return <Typography.Text type="danger">{(error as Error).message}</Typography.Text>;
  }

  if (!isLoading && (data?.rows.length ?? 0) === 0) {
    return <Empty description="No open purchase orders for this SKU" />;
  }

  return (
    <Table<InquiryOpenPoRow>
      size="small"
      loading={isLoading}
      columns={columns}
      dataSource={data?.rows ?? []}
      pagination={false}
      rowKey={(row) => `${row.poNumber}-${row.storeId}-${row.rowLabel}-${row.columnLabel}`}
      scroll={{ x: 860 }}
    />
  );
};
