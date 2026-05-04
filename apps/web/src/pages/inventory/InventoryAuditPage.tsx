import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Flex,
  Form,
  Input,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { AuditOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useChangeDetail, useInventoryInquiry } from '../../hooks/useRicsInventory';
import { useStores } from '../../hooks/useStores';
import type { ChangeDetailRow } from '../../services/ricsInventoryApi';
import { SkuLookup } from '../../components/sku-lookup';
import { getErrorMessage } from '../../utils/errors';
import { InlinePageHelp, useRegisterPageHelp } from '../../components/page-help';
import { inventoryAuditHelp } from '../../content/help/pageHelp';

// Inventory Audit — one (SKU × Store), full movement history from rics_mirror
// including SALES (unioned from ticket_detail), with a running on-hand balance
// anchored to inventory_quantities so the ending balance should equal current
// on-hand. If it doesn't, something is missing from the ledger (or the row cap
// was hit) — the summary surfaces the reconciliation status.

const CHG_TYPE_META: Record<string, { label: string; color: string; hint: string }> = {
  POR: { label: 'PO Receipt',   color: 'green',    hint: 'Purchase Order Receipt' },
  RET: { label: 'Return',       color: 'volcano',  hint: 'Return' },
  PHY: { label: 'Physical',     color: 'geekblue', hint: 'Physical inventory count' },
  TOU: { label: 'Transfer Out', color: 'orange',   hint: 'Transfer Out' },
  TIN: { label: 'Transfer In',  color: 'cyan',     hint: 'Transfer In' },
  REC: { label: 'Receive',      color: 'purple',   hint: 'Receive (misc)' },
  SAL: { label: 'Sale',         color: 'magenta',  hint: 'POS sale (ticket detail)' },
};

// Per-row limit — matches the ChangeDetail API cap.
const AUDIT_LIMIT = 1000;

interface AuditRow extends ChangeDetailRow {
  runningBalance: number;
}

export default function InventoryAuditPage() {
  useRegisterPageHelp(inventoryAuditHelp);

  const [skuCode, setSkuCode] = useState<string>('');
  const [storeId, setStoreId] = useState<number | null>(null);
  const [lookupOpen, setLookupOpen] = useState(false);

  // Pull per-store on-hand from the inquiry endpoint to anchor the running
  // balance. The dropdown uses store master so zero-balance stores can still
  // be audited for movement history.
  const { data: inquiry, isLoading: inquiryLoading } = useInventoryInquiry(skuCode || null);
  const { data: stores = [], isLoading: storesLoading } = useStores();

  const storeOptions = useMemo(
    () =>
      (inquiry?.stores ?? []).map((s) => ({
        value: s.storeNumber,
        label: `${s.storeNumber}${s.storeName ? ` — ${s.storeName}` : ''} (on-hand ${s.totals.onHand})`,
      })),
    [inquiry],
  );

  const auditStoreOptions = useMemo(
    () =>
      stores.length > 0
        ? stores.map((store) => {
            const inquiryStore = inquiry?.stores.find((s) => s.storeNumber === store.id);
            const onHand = inquiryStore?.totals.onHand ?? 0;
            return {
              value: store.id,
              label: `${store.id}${store.name ? ` - ${store.name}` : ''} (on-hand ${onHand})`,
            };
          })
        : storeOptions,
    [inquiry, storeOptions, stores],
  );

  const currentOnHand = useMemo(() => {
    if (!inquiry || storeId == null) return null;
    const match = inquiry.stores.find((s) => s.storeNumber === storeId);
    return match?.totals.onHand ?? 0;
  }, [inquiry, storeId]);

  const ledgerParams = useMemo(
    () =>
      skuCode && storeId != null
        ? {
            sku: skuCode,
            store: storeId,
            includeSales: true,
            limit: AUDIT_LIMIT,
          }
        : null,
    [skuCode, storeId],
  );

  const {
    data: ledger,
    isLoading: ledgerLoading,
    error: ledgerError,
  } = useChangeDetail(ledgerParams);

  // Compute running balance walking oldest→newest, anchored backward from
  // current on-hand. If every movement fit under the limit, startingBalance =
  // currentOnHand - sum(deltas), and running after the last row = currentOnHand.
  const auditRows = useMemo<AuditRow[]>(() => {
    if (!ledger?.rows || currentOnHand == null) return [];
    // API returns date DESC; reverse to ASC for running-balance walk.
    const ascending = [...ledger.rows].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
    const totalDelta = ascending.reduce((acc, r) => acc + r.quantity, 0);
    const startingBalance = currentOnHand - totalDelta;
    let running = startingBalance;
    return ascending.map((r) => {
      running += r.quantity;
      return { ...r, runningBalance: running };
    });
  }, [ledger?.rows, currentOnHand]);

  const sumInWindow = useMemo(
    () => (ledger?.rows ?? []).reduce((acc, r) => acc + r.quantity, 0),
    [ledger?.rows],
  );

  const startingBalance =
    currentOnHand != null ? currentOnHand - sumInWindow : null;

  const hitLimit = (ledger?.total ?? 0) >= AUDIT_LIMIT;
  const reconciled =
    auditRows.length === 0
      ? null
      : auditRows[auditRows.length - 1]?.runningBalance === currentOnHand;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Flex align="flex-start" justify="space-between" gap={12} wrap="wrap">
          <div>
            <Typography.Title level={4} style={{ marginTop: 0 }}>
              <AuditOutlined /> Inventory Audit
            </Typography.Title>
            <Typography.Text type="secondary">
              Full movement history for one (SKU × Store) — PO receipts, transfers, returns,
              physical counts, and POS sales — with a running on-hand balance anchored to
              today's inventory. Lets you prove exactly how the SKU reached its current
              on-hand number.
            </Typography.Text>
          </div>
          <InlinePageHelp entry={inventoryAuditHelp} mode="popover" />
        </Flex>

        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Space wrap align="end">
            <Form.Item label="SKU" style={{ marginBottom: 0 }}>
              <Space.Compact>
                <Input
                  placeholder="e.g. B1592-BKNU"
                  value={skuCode}
                  onChange={(e) => {
                    setSkuCode(e.target.value.trim());
                    setStoreId(null);
                  }}
                  onPressEnter={(e) => setSkuCode((e.target as HTMLInputElement).value.trim())}
                  allowClear
                  style={{ width: 220 }}
                />
                <Button
                  icon={<SearchOutlined />}
                  onClick={() => setLookupOpen(true)}
                  title="Look up SKU"
                />
              </Space.Compact>
            </Form.Item>
            <Form.Item label="Store" style={{ marginBottom: 0 }}>
              <Select
                placeholder={skuCode ? 'Select store' : 'Enter a SKU first'}
                value={storeId ?? undefined}
                onChange={(v) => setStoreId(v)}
                options={auditStoreOptions}
                disabled={!skuCode || storesLoading}
                loading={storesLoading || inquiryLoading}
                style={{ width: 320 }}
                allowClear
              />
            </Form.Item>
            <Form.Item label=" " style={{ marginBottom: 0 }}>
              <Checkbox checked disabled>
                Include Sales
              </Checkbox>
            </Form.Item>
          </Space>
        </Form>
      </Card>

      {ledgerError && (
        <Alert
          type="error"
          showIcon
          message="Audit query failed"
          description={getErrorMessage(ledgerError, 'Unable to load audit data.')}
        />
      )}

      {!ledgerParams && !ledgerError && (
        <Card>
          <Empty description="Pick a SKU and store to run the audit." />
        </Card>
      )}

      {ledgerParams && ledgerLoading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        </Card>
      )}

      {ledgerParams && !ledgerError && ledger && (
        <>
          <Card size="small">
            <Space size="large" wrap>
              <Statistic
                title="Current On-Hand"
                value={currentOnHand ?? 0}
                valueStyle={{ color: (currentOnHand ?? 0) < 0 ? '#cf1322' : undefined }}
              />
              <Statistic
                title="Starting Balance (oldest row)"
                value={startingBalance ?? 0}
              />
              <Statistic
                title="Movements in Window"
                value={ledger.total}
              />
              <Statistic
                title="Net Qty Δ"
                value={sumInWindow}
                valueStyle={{ color: sumInWindow < 0 ? '#cf1322' : undefined }}
              />
              <Statistic
                title="Reconciles?"
                value={reconciled == null ? '—' : reconciled ? 'Yes' : 'Mismatch'}
                valueStyle={{
                  color: reconciled == null ? undefined : reconciled ? '#389e0d' : '#cf1322',
                }}
              />
            </Space>
            {hitLimit && (
              <Alert
                style={{ marginTop: 12 }}
                type="warning"
                showIcon
                message={`Ledger capped at ${AUDIT_LIMIT} rows — starting balance may be incomplete. Older movements are not shown.`}
              />
            )}
            {reconciled === false && (
              <Alert
                style={{ marginTop: 12 }}
                type="error"
                showIcon
                message="Ending running balance does not match current on-hand."
                description="Either the ledger is missing rows for this (SKU × Store), or the Phase-A mirror is out of sync with RICS. Re-run pnpm sync:rics and check."
              />
            )}
          </Card>

          {auditRows.length === 0 ? (
            <Card>
              <Empty description="No movement history for this SKU in this store." />
            </Card>
          ) : (
            <Table<AuditRow>
              dataSource={auditRows}
              rowKey={(r, i) => `${r.date}-${r.changeType}-${i}`}
              size="small"
              pagination={{ pageSize: 100, showSizeChanger: true }}
              scroll={{ x: 1100 }}
              columns={[
                {
                  title: 'Date',
                  dataIndex: 'date',
                  key: 'date',
                  width: 150,
                  render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'),
                },
                {
                  title: 'Type',
                  dataIndex: 'changeType',
                  key: 'type',
                  width: 140,
                  render: (v: string) => {
                    const meta = CHG_TYPE_META[v];
                    const tag = <Tag color={meta?.color ?? 'default'}>{meta?.label ?? v}</Tag>;
                    return meta ? <Tooltip title={meta.hint}>{tag}</Tooltip> : tag;
                  },
                },
                {
                  title: 'Row / Col',
                  key: 'rowCol',
                  width: 110,
                  render: (_v, r) => {
                    const parts = [r.rowLabel, r.columnLabel].filter(Boolean).join(' · ');
                    return parts || <Typography.Text type="secondary">—</Typography.Text>;
                  },
                },
                {
                  title: 'Qty Δ',
                  dataIndex: 'quantity',
                  key: 'qty',
                  width: 90,
                  align: 'right',
                  render: (v: number) => (
                    <Typography.Text type={v < 0 ? 'danger' : undefined} strong>
                      {v > 0 ? `+${v}` : v}
                    </Typography.Text>
                  ),
                },
                {
                  title: 'Balance',
                  dataIndex: 'runningBalance',
                  key: 'balance',
                  width: 100,
                  align: 'right',
                  render: (v: number) => (
                    <Typography.Text strong type={v < 0 ? 'danger' : undefined}>
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
                  key: 'po',
                  width: 120,
                  render: (v: string | null) => v || <Typography.Text type="secondary">—</Typography.Text>,
                },
                {
                  title: 'Counterpart',
                  dataIndex: 'otherStore',
                  key: 'counterpart',
                  width: 120,
                  render: (v: number | null) =>
                    v != null ? `Store ${v}` : <Typography.Text type="secondary">—</Typography.Text>,
                },
              ]}
            />
          )}
        </>
      )}

      <SkuLookup
        open={lookupOpen}
        onClose={() => setLookupOpen(false)}
        onSelect={(picked) => {
          setSkuCode(picked.skuCode);
          setStoreId(null);
          setLookupOpen(false);
        }}
        initialQuery={skuCode}
      />
    </Space>
  );
}
