import React from 'react';
import { Empty, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { SizeGrid as SizeGridData, SizeGridRow } from './types';

function formatCell(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export interface SizeGridProps {
  grid: SizeGridData;
}

export const SizeGrid: React.FC<SizeGridProps> = ({ grid }) => {
  if (grid.rows.length === 0 || grid.columns.length === 0) {
    return <Empty description="No data" />;
  }

  const columns: ColumnsType<SizeGridRow & { key: string }> = [
    {
      title: '',
      dataIndex: 'label',
      key: 'label',
      width: 140,
      fixed: 'left',
      render: (label: string) => <strong>{label}</strong>,
    },
    ...grid.columns.map((col, idx) => ({
      title: col,
      key: `col-${idx}`,
      align: 'right' as const,
      render: (_: unknown, record: SizeGridRow) => formatCell(record.cells[idx]?.value ?? null),
    })),
  ];

  const dataSource = grid.rows.map((row, idx) => ({ ...row, key: `row-${idx}` }));

  return (
    <>
      {grid.caption && <div style={{ marginBottom: 8 }}>{grid.caption}</div>}
      <Table
        size="small"
        pagination={false}
        columns={columns}
        dataSource={dataSource}
        scroll={{ x: 'max-content' }}
      />
    </>
  );
};
