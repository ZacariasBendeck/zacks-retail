import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Empty, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import {
  fetchInquiryOpenPos,
  fetchInquiryPurchaseOrderHistory,
  type InquiryOpenPoRow,
  type InquiryPurchaseOrderHistoryRow,
} from '../../../../services/ricsInventoryApi';

function legacyPoLink(poNumber: string): string {
  return `/purchasing/legacy-orders/${encodeURIComponent(poNumber)}`;
}

function formatDate(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

const columns: ColumnsType<InquiryOpenPoRow> = [
  {
    title: 'PO #',
    dataIndex: 'poNumber',
    key: 'poNumber',
    width: 140,
    render: (value: string) => (
      <Link to={legacyPoLink(value)}>
        {value}
      </Link>
    ),
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
    render: formatDate,
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

const historyColumns: ColumnsType<InquiryPurchaseOrderHistoryRow> = [
  {
    title: 'PO #',
    dataIndex: 'poNumber',
    key: 'poNumber',
    width: 140,
    render: (value: string) => (
      <Link to={legacyPoLink(value)}>
        {value}
      </Link>
    ),
  },
  {
    title: 'Store',
    dataIndex: 'shipStore',
    key: 'shipStore',
    width: 80,
    render: (value: number | null) => value ?? '',
  },
  {
    title: 'Vendor',
    dataIndex: 'vendorCode',
    key: 'vendorCode',
    width: 110,
    render: (value: string | null) => value ?? '',
  },
  {
    title: 'Order Date',
    dataIndex: 'orderDate',
    key: 'orderDate',
    width: 110,
    render: formatDate,
  },
  {
    title: 'Last Received',
    dataIndex: 'lastReceivedAt',
    key: 'lastReceivedAt',
    width: 120,
    render: formatDate,
  },
  {
    title: 'Type',
    dataIndex: 'orderType',
    key: 'orderType',
    width: 120,
    render: (_: string | null, row) =>
      row.orderType ?? row.legacyStatus ?? (row.current === false ? 'Future' : 'Current'),
  },
  {
    title: 'Buyer',
    dataIndex: 'buyer',
    key: 'buyer',
    width: 100,
    render: (value: string | null) => value ?? '',
  },
  {
    title: 'Lines',
    dataIndex: 'lineCount',
    key: 'lineCount',
    align: 'right',
    width: 80,
  },
  {
    title: 'Ordered',
    dataIndex: 'orderedQty',
    key: 'orderedQty',
    align: 'right',
    width: 90,
  },
  {
    title: 'Received',
    dataIndex: 'receivedQty',
    key: 'receivedQty',
    align: 'right',
    width: 90,
  },
  {
    title: 'Open',
    dataIndex: 'openQty',
    key: 'openQty',
    align: 'right',
    width: 90,
  },
];

export const PosTab: React.FC<{ skuCode: string; storeId?: number }> = ({ skuCode, storeId }) => {
  const openPos = useQuery({
    queryKey: ['inquiry-open-pos', skuCode, storeId ?? null],
    queryFn: () => fetchInquiryOpenPos(skuCode, storeId),
    staleTime: 30_000,
  });

  const history = useQuery({
    queryKey: ['inquiry-po-history', skuCode, storeId ?? null],
    queryFn: () => fetchInquiryPurchaseOrderHistory(skuCode, storeId),
    staleTime: 30_000,
  });

  const error = openPos.error ?? history.error;
  if (error) {
    return <Typography.Text type="danger">{(error as Error).message}</Typography.Text>;
  }

  const hasOpenRows = (openPos.data?.rows.length ?? 0) > 0;
  const hasHistoryRows = (history.data?.rows.length ?? 0) > 0;
  if (!openPos.isLoading && !history.isLoading && !hasOpenRows && !hasHistoryRows) {
    return <Empty description="No purchase orders found for this SKU" />;
  }

  return (
    <Space direction="vertical" size="small" style={{ width: '100%' }}>
      <Card size="small" title="Open Purchase Orders">
        <Table<InquiryOpenPoRow>
          size="small"
          loading={openPos.isLoading}
          columns={columns}
          dataSource={openPos.data?.rows ?? []}
          pagination={false}
          rowKey={(row) => `${row.poNumber}-${row.storeId}-${row.rowLabel}-${row.columnLabel}`}
          scroll={{ x: 860 }}
        />
      </Card>
      <Card
        size="small"
        title="Purchase Order History"
        extra={<Typography.Text type="secondary">Click a PO number to open the full legacy PO.</Typography.Text>}
      >
        <Table<InquiryPurchaseOrderHistoryRow>
          size="small"
          loading={history.isLoading}
          columns={historyColumns}
          dataSource={history.data?.rows ?? []}
          pagination={{ pageSize: 10, size: 'small' }}
          rowKey={(row) => row.poNumber}
          scroll={{ x: 1120 }}
        />
      </Card>
    </Space>
  );
};
