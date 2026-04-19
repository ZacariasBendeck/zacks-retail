import React from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { InquiryRollup } from '../../../types/inventoryInquiry';

const fmtQty = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtMoney = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Row {
  key: string;
  label: string;
  qty: number;
  net: number;
  markdown: number;
  profit: number;
}

export const SalesRollupStrip: React.FC<{ rollup: InquiryRollup }> = ({ rollup }) => {
  const data: Row[] = [
    { key: 'week',   label: 'Week',   ...rollup.week },
    { key: 'month',  label: 'Month',  ...rollup.month },
    { key: 'season', label: 'Season', ...rollup.season },
    { key: 'year',   label: 'Year',   ...rollup.year },
  ];

  const columns: ColumnsType<Row> = [
    { title: 'Sales',    dataIndex: 'label',    key: 'label' },
    { title: 'Qty',      dataIndex: 'qty',      key: 'qty',      align: 'right', render: (v) => fmtQty.format(v) },
    { title: 'Net',      dataIndex: 'net',      key: 'net',      align: 'right', render: (v) => fmtMoney.format(v) },
    { title: 'Markdown', dataIndex: 'markdown', key: 'markdown', align: 'right', render: (v) => fmtMoney.format(v) },
    { title: 'Profit',   dataIndex: 'profit',   key: 'profit',   align: 'right', render: (v) => fmtMoney.format(v) },
  ];

  return <Table size="small" pagination={false} columns={columns} dataSource={data} />;
};
