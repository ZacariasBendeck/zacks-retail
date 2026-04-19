import React from 'react';
import { Empty, Spin, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { fetchSkuUpcs, type SkuUpc } from './upcsApi';

export const UpcsTab: React.FC<{ skuCode: string }> = ({ skuCode }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['sku-upcs', skuCode],
    queryFn: () => fetchSkuUpcs(skuCode),
    staleTime: 60_000,
  });

  if (isLoading) return <Spin />;
  if (!data || data.length === 0) return <Empty description="No UPCs" />;

  return (
    <Table<SkuUpc>
      rowKey="upc"
      size="small"
      pagination={false}
      dataSource={data}
      columns={[
        { title: 'UPC',    dataIndex: 'upc',         key: 'upc' },
        { title: 'Column', dataIndex: 'columnLabel', key: 'columnLabel' },
        { title: 'Row',    dataIndex: 'rowLabel',    key: 'rowLabel' },
        { title: 'Source', dataIndex: 'source',      key: 'source' },
      ]}
    />
  );
};
