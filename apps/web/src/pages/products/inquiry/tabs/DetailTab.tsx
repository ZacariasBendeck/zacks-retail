import React from 'react';
import { Empty, Spin, Table, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useChangeDetail } from '../../../../hooks/useRicsInventory';
import type { ChangeDetailRow } from '../../../../services/ricsInventoryApi';

// Movement type metadata — mirrors the ChangeDetailPage legend.
const CHG_TYPE_META: Record<string, { color: string; hint: string }> = {
  POR: { color: 'green',    hint: 'Purchase Order Receipt' },
  RET: { color: 'volcano',  hint: 'Return' },
  PHY: { color: 'geekblue', hint: 'Physical inventory count' },
  TOU: { color: 'orange',   hint: 'Transfer Out' },
  TIN: { color: 'cyan',     hint: 'Transfer In' },
  REC: { color: 'purple',   hint: 'Receive (misc)' },
};

export const DetailTab: React.FC<{ skuCode: string }> = ({ skuCode }) => {
  // Pre-populate the last 90 days so the query fires automatically when the
  // tab is opened. The operator can always visit the standalone Change Detail
  // page for broader filters.
  const params = React.useMemo(
    () => ({
      sku: skuCode,
      limit: 200,
    }),
    [skuCode],
  );

  const { data, isLoading } = useChangeDetail(params);

  if (isLoading) return <Spin />;
  if (!data || data.rows.length === 0)
    return <Empty description="No movement history" />;

  return (
    <Table<ChangeDetailRow>
      rowKey={(r, i) => `${r.date}-${r.store}-${r.changeType}-${i}`}
      size="small"
      pagination={{ pageSize: 50, showSizeChanger: true }}
      scroll={{ x: 900 }}
      dataSource={data.rows}
      columns={[
        {
          title: 'Date',
          dataIndex: 'date',
          key: 'date',
          width: 150,
          render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'),
          sorter: (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
          defaultSortOrder: 'descend',
        },
        { title: 'Store', dataIndex: 'store', key: 'store', width: 70 },
        {
          title: 'Type',
          dataIndex: 'changeType',
          key: 'changeType',
          width: 90,
          render: (v: string) => {
            const meta = CHG_TYPE_META[v];
            const tag = <Tag color={meta?.color ?? 'default'}>{v || '—'}</Tag>;
            return meta ? <Tooltip title={meta.hint}>{tag}</Tooltip> : tag;
          },
        },
        {
          title: 'Row / Col',
          key: 'rowCol',
          width: 110,
          render: (_: unknown, r: ChangeDetailRow) => {
            const parts = [r.rowLabel, r.columnLabel].filter(Boolean).join(' · ');
            return parts || <Typography.Text type="secondary">—</Typography.Text>;
          },
        },
        {
          title: 'Qty',
          dataIndex: 'quantity',
          key: 'quantity',
          align: 'right',
          width: 70,
          render: (v: number) => (
            <Typography.Text type={v < 0 ? 'danger' : undefined} strong>
              {v}
            </Typography.Text>
          ),
        },
        {
          title: 'Cost',
          dataIndex: 'cost',
          key: 'cost',
          align: 'right',
          width: 90,
          render: (v: number) =>
            v
              ? v.toLocaleString('es-HN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '—',
        },
        {
          title: 'PO',
          dataIndex: 'purchaseOrder',
          key: 'purchaseOrder',
          width: 110,
          render: (v: string | null) =>
            v ?? <Typography.Text type="secondary">—</Typography.Text>,
        },
        {
          title: 'RMA',
          dataIndex: 'rmaNumber',
          key: 'rmaNumber',
          width: 100,
          render: (v: string | null) =>
            v ?? <Typography.Text type="secondary">—</Typography.Text>,
        },
        {
          title: 'Counterpart',
          dataIndex: 'otherStore',
          key: 'otherStore',
          width: 110,
          render: (v: number | null) =>
            v != null ? `Store ${v}` : <Typography.Text type="secondary">—</Typography.Text>,
        },
      ]}
    />
  );
};
