import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useChangeDetail } from '../hooks/useRicsInventory';
import type { ChangeDetailRow } from '../services/ricsInventoryApi';
import { getErrorMessage } from '../utils/errors';

// RICS Ch. 2 p. 55 / Ch. 4 p. 72 — Inventory Inquiry [Detail] popup, per SKU,
// across all stores. Backed by rics_mirror.inv_changes (Phase A).
// Shared by the Product Inquiry "Detail" tab and the standalone route
// /inventory/change-detail/:sku so the UX is identical everywhere.

const CHG_TYPE_META: Record<string, { label: string; color: string; hint: string }> = {
  POR: { label: 'PO Receipt',     color: 'green',    hint: 'Purchase Order Receipt' },
  RET: { label: 'Return',         color: 'volcano',  hint: 'Return' },
  PHY: { label: 'Physical',       color: 'geekblue', hint: 'Physical inventory count' },
  TOU: { label: 'Transfer Out',   color: 'orange',   hint: 'Transfer Out' },
  TIN: { label: 'Transfer In',    color: 'cyan',     hint: 'Transfer In' },
  REC: { label: 'Receive',        color: 'purple',   hint: 'Receive (misc)' },
  SAL: { label: 'Sale',           color: 'magenta',  hint: 'POS sale (from ticket detail)' },
};

const INITIAL_LIMIT = 1000;
const MAX_LIMIT = 5000;

type LedgerRowKind = 'data' | 'subtotal' | 'grand';

interface LedgerRow {
  kind: LedgerRowKind;
  rowKey: string;
  store: number | null;
  date: string | null;
  changeType: string | null;
  typeLabel: string | null;
  rowLabel: string;
  columnLabel: string;
  quantity: number;
  cost: number | null;
  comment: string | null;
  purchaseOrder: string | null;
  otherStore: number | null;
  rmaNumber: string | null;
  // number of underlying raw rows this row represents (for size-detail-off mode)
  aggregatedCount?: number;
}

function buildComment(r: ChangeDetailRow): string | null {
  const parts: string[] = [];
  if (r.purchaseOrder) parts.push(`PO# ${r.purchaseOrder}`);
  if (r.rmaNumber) parts.push(`RMA# ${r.rmaNumber}`);
  if (r.otherStore != null) {
    parts.push(r.changeType === 'TOU' ? `To Store ${r.otherStore}` : `From Store ${r.otherStore}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

// Collapse raw rows that share the same (date, store, type, PO, RMA, counterpart)
// into one per-document row. Preserves qty sum and weight-averages cost by |qty|.
function collapseBySize(rows: ChangeDetailRow[]): ChangeDetailRow[] {
  const buckets = new Map<string, ChangeDetailRow[]>();
  for (const r of rows) {
    const key = [
      r.date,
      r.store,
      r.changeType,
      r.purchaseOrder ?? '',
      r.rmaNumber ?? '',
      r.otherStore ?? '',
    ].join('|');
    const list = buckets.get(key);
    if (list) list.push(r);
    else buckets.set(key, [r]);
  }
  const out: ChangeDetailRow[] = [];
  for (const group of buckets.values()) {
    const first = group[0];
    if (!first) continue;
    if (group.length === 1) {
      out.push(first);
      continue;
    }
    const qtySum = group.reduce((acc, g) => acc + g.quantity, 0);
    const weightDenom = group.reduce((acc, g) => acc + Math.abs(g.quantity), 0);
    const withCost = group.find((g) => g.cost != null);
    const costAvg =
      weightDenom > 0
        ? group.reduce((acc, g) => acc + (g.cost || 0) * Math.abs(g.quantity), 0) / weightDenom
        : withCost?.cost ?? 0;
    out.push({
      ...first,
      rowLabel: '',
      columnLabel: '',
      quantity: qtySum,
      cost: costAvg,
    });
  }
  return out;
}

// Turn raw rows into a display list with per-store subtotals and grand total.
// Sort: store asc, date desc within store.
function buildLedgerRows(rows: ChangeDetailRow[], showSizeDetail: boolean): LedgerRow[] {
  const working = showSizeDetail ? rows : collapseBySize(rows);
  const byStore = new Map<number, ChangeDetailRow[]>();
  for (const r of working) {
    const key = r.store ?? 0;
    const list = byStore.get(key);
    if (list) list.push(r);
    else byStore.set(key, [r]);
  }
  const stores = Array.from(byStore.keys()).sort((a, b) => a - b);
  const out: LedgerRow[] = [];
  let grandQty = 0;
  let grandCount = 0;
  for (const store of stores) {
    const storeRows = byStore.get(store) ?? [];
    storeRows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    let storeTotal = 0;
    let i = 0;
    for (const r of storeRows) {
      storeTotal += r.quantity;
      out.push({
        kind: 'data',
        rowKey: `d-${store}-${r.date}-${r.changeType}-${r.rowLabel}-${r.columnLabel}-${i}`,
        store: r.store,
        date: r.date,
        changeType: r.changeType,
        typeLabel: CHG_TYPE_META[r.changeType]?.label ?? r.changeType,
        rowLabel: r.rowLabel,
        columnLabel: r.columnLabel,
        quantity: r.quantity,
        cost: r.cost ?? null,
        comment: buildComment(r),
        purchaseOrder: r.purchaseOrder,
        otherStore: r.otherStore,
        rmaNumber: r.rmaNumber,
      });
      i += 1;
    }
    out.push({
      kind: 'subtotal',
      rowKey: `s-${store}`,
      store,
      date: null,
      changeType: null,
      typeLabel: `*** Store ${store} Total ***`,
      rowLabel: '',
      columnLabel: '',
      quantity: storeTotal,
      cost: null,
      comment: null,
      purchaseOrder: null,
      otherStore: null,
      rmaNumber: null,
    });
    grandQty += storeTotal;
    grandCount += storeRows.length;
  }
  out.push({
    kind: 'grand',
    rowKey: 'g',
    store: null,
    date: null,
    changeType: null,
    typeLabel: '*** Grand Total ***',
    rowLabel: '',
    columnLabel: '',
    quantity: grandQty,
    cost: null,
    comment: null,
    purchaseOrder: null,
    otherStore: null,
    rmaNumber: null,
    aggregatedCount: grandCount,
  });
  return out;
}

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCsv(skuCode: string, rows: ChangeDetailRow[]): void {
  const header = [
    'Store', 'Date', 'Type', 'Row', 'Col', 'Qty', 'Cost', 'PO', 'RMA', 'Counterpart',
  ];
  const lines = rows.map((r) => [
    r.store,
    r.date ? dayjs(r.date).format('YYYY-MM-DD HH:mm') : '',
    r.changeType,
    r.rowLabel,
    r.columnLabel,
    r.quantity,
    r.cost ?? '',
    r.purchaseOrder ?? '',
    r.rmaNumber ?? '',
    r.otherStore ?? '',
  ].map(csvEscape).join(','));
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `change-detail-${skuCode}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface SkuChangeLedgerProps {
  skuCode: string;
  description?: string | null;
  /** Title shown above the summary strip; hidden when embedded as a tab. */
  title?: string;
}

export function SkuChangeLedger({ skuCode, description, title }: SkuChangeLedgerProps) {
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const [showSizeDetail, setShowSizeDetail] = useState(false);
  const [includeSales, setIncludeSales] = useState(false);

  const params = useMemo(
    () => ({ sku: skuCode, limit, includeSales }),
    [skuCode, limit, includeSales],
  );
  const { data, isLoading, isFetching, error } = useChangeDetail(params);

  const rawRows = data?.rows ?? [];
  const ledgerRows = useMemo(
    () => buildLedgerRows(rawRows, showSizeDetail),
    [rawRows, showSizeDetail],
  );

  const dateRangeLabel = useMemo(() => {
    const first = rawRows[0];
    if (!first) return null;
    let min = first.date;
    let max = first.date;
    for (const r of rawRows) {
      if (r.date < min) min = r.date;
      if (r.date > max) max = r.date;
    }
    if (!min || !max) return null;
    return `${dayjs(min).format('YYYY-MM-DD')} → ${dayjs(max).format('YYYY-MM-DD')}`;
  }, [rawRows]);

  const grand = ledgerRows.find((r) => r.kind === 'grand');
  const grandQty = grand?.quantity ?? 0;
  const rowCount = grand?.aggregatedCount ?? 0;
  const hitLimit = rawRows.length >= limit;

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message="Change Detail query failed"
        description={getErrorMessage(error, 'Unable to load Change Detail.')}
      />
    );
  }

  if (!data || data.rows.length === 0) {
    return <Empty description="No movement history for this SKU." />;
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        {title && (
          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>
            {title}
          </Typography.Title>
        )}
        <Space wrap size="large" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{skuCode}</Typography.Text>
            {description && (
              <Typography.Text type="secondary">{description}</Typography.Text>
            )}
            {dateRangeLabel && (
              <Typography.Text type="secondary">{dateRangeLabel}</Typography.Text>
            )}
          </Space>
          <Space size="large">
            <Statistic
              title="Grand Total"
              value={grandQty}
              valueStyle={{ color: grandQty < 0 ? '#cf1322' : undefined }}
            />
            <Statistic title="Movements" value={rowCount} />
          </Space>
        </Space>
        <Space style={{ marginTop: 12 }} wrap>
          <Checkbox
            checked={showSizeDetail}
            onChange={(e) => setShowSizeDetail(e.target.checked)}
          >
            Show Size Detail
          </Checkbox>
          <Checkbox
            checked={includeSales}
            onChange={(e) => setIncludeSales(e.target.checked)}
          >
            Include Sales
          </Checkbox>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => exportCsv(skuCode, rawRows)}
          >
            Export CSV
          </Button>
          {hitLimit && limit < MAX_LIMIT && (
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={isFetching}
              onClick={() => setLimit((n) => Math.min(n * 2, MAX_LIMIT))}
            >
              Load more (showing {limit})
            </Button>
          )}
          {hitLimit && limit >= MAX_LIMIT && (
            <Typography.Text type="warning">
              Hit {MAX_LIMIT}-row cap. Narrow by date via the Change Detail page to see older history.
            </Typography.Text>
          )}
        </Space>
      </Card>

      <Table<LedgerRow>
        dataSource={ledgerRows}
        rowKey="rowKey"
        size="small"
        pagination={false}
        scroll={{ x: 1100, y: 520 }}
        rowClassName={(r) =>
          r.kind === 'grand' ? 'ledger-grand' : r.kind === 'subtotal' ? 'ledger-subtotal' : ''
        }
        columns={[
          {
            title: 'Str',
            dataIndex: 'store',
            key: 'store',
            width: 70,
            render: (_v, r) =>
              r.kind === 'grand' ? '' : r.store != null ? r.store : '—',
          },
          {
            title: 'Date',
            dataIndex: 'date',
            key: 'date',
            width: 150,
            render: (_v, r) =>
              r.kind === 'data' && r.date ? dayjs(r.date).format('YYYY-MM-DD HH:mm') : '',
          },
          {
            title: 'Type',
            key: 'type',
            width: 140,
            render: (_v, r) => {
              if (r.kind !== 'data') {
                return (
                  <Typography.Text strong>{r.typeLabel}</Typography.Text>
                );
              }
              const meta = r.changeType ? CHG_TYPE_META[r.changeType] : undefined;
              const tag = (
                <Tag color={meta?.color ?? 'default'}>
                  {meta?.label ?? r.changeType ?? '—'}
                </Tag>
              );
              return meta ? <Tooltip title={meta.hint}>{tag}</Tooltip> : tag;
            },
          },
          {
            title: 'Row / Col',
            key: 'rowCol',
            width: 110,
            render: (_v, r) => {
              if (r.kind !== 'data') return '';
              const parts = [r.rowLabel, r.columnLabel].filter(Boolean).join(' · ');
              return parts || <Typography.Text type="secondary">—</Typography.Text>;
            },
          },
          {
            title: 'Qty',
            dataIndex: 'quantity',
            key: 'quantity',
            width: 80,
            align: 'right',
            render: (v: number, r) => (
              <Typography.Text
                strong={r.kind !== 'data'}
                type={v < 0 ? 'danger' : undefined}
              >
                {v.toLocaleString('en-US')}
              </Typography.Text>
            ),
          },
          {
            title: 'Cost',
            dataIndex: 'cost',
            key: 'cost',
            width: 100,
            align: 'right',
            render: (v: number | null, r) =>
              r.kind !== 'data' || v == null
                ? ''
                : v.toLocaleString('es-HN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }),
          },
          {
            title: 'Comment',
            dataIndex: 'comment',
            key: 'comment',
            render: (v: string | null, r) => {
              if (r.kind !== 'data') return '';
              return v || <Typography.Text type="secondary">—</Typography.Text>;
            },
          },
        ]}
      />
    </Space>
  );
}

// Internal exports for unit tests.
export const __test = { buildLedgerRows, collapseBySize, buildComment };
