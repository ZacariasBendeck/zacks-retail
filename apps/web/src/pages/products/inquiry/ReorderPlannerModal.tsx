import React from 'react';
import {
  Alert,
  Button,
  Descriptions,
  InputNumber,
  Modal,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  createInquiryReorderDraftPo,
  fetchInquiryReorderPlan,
  saveInquiryReorderDefaults,
  type CreateReorderDraftPoResult,
  type ReorderPlan,
  type ReorderPlanChain,
  type ReorderPlanSizeLine,
} from '../../../services/ricsInventoryApi';

interface ReorderPlannerModalProps {
  open: boolean;
  skuCode: string;
  onClose: () => void;
}

type QuantityMap = Record<string, number>;

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function lineKey(line: Pick<ReorderPlanSizeLine, 'rowLabel' | 'columnLabel'>): string {
  return `${line.rowLabel}|${line.columnLabel}`;
}

function chainKey(chain: ReorderPlanChain, index: number): string {
  return chain.chainId ?? `fallback-${index}`;
}

function sourceLabel(source: ReorderPlanSizeLine['curveSource']): string {
  switch (source) {
    case 'SKU_SALES': return 'SKU 12M';
    case 'CATEGORY_SALES': return 'Category';
    case 'MODEL': return 'Model';
    case 'PREVIOUS_ORDER': return 'Previous';
    default: return 'None';
  }
}

const PROJECTED_FORMULA =
  'Projected = ceil((adjusted sales by size after last received / elapsed months) * coverage months). Uses up to two months after the last received date; December sales count as one third.';

export function ReorderPlannerModal({ open, skuCode, onClose }: ReorderPlannerModalProps) {
  const [plan, setPlan] = React.useState<ReorderPlan | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [savingDefaults, setSavingDefaults] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [createdPo, setCreatedPo] = React.useState<CreateReorderDraftPoResult | null>(null);
  const [activeChainKey, setActiveChainKey] = React.useState<string>('0');
  const [leadTimeDays, setLeadTimeDays] = React.useState(90);
  const [orderCycleDays, setOrderCycleDays] = React.useState(90);
  const [moqQty, setMoqQty] = React.useState(0);
  const [quantitiesByChain, setQuantitiesByChain] = React.useState<Record<string, QuantityMap>>({});

  const loadPlan = React.useCallback(async (params?: { leadTimeDays?: number; orderCycleDays?: number; moqQty?: number }) => {
    if (!open || !skuCode) return;
    setLoading(true);
    setError(null);
    setCreateError(null);
    setCreatedPo(null);
    try {
      const next = await fetchInquiryReorderPlan(skuCode, params);
      setPlan(next);
      setLeadTimeDays(next.planning.leadTimeDays);
      setOrderCycleDays(next.planning.orderCycleDays);
      setMoqQty(next.planning.moqQty);
      const nextQuantities: Record<string, QuantityMap> = {};
      next.chains.forEach((chain, index) => {
        const key = chainKey(chain, index);
        nextQuantities[key] = Object.fromEntries(
          chain.sizeLines.map((line) => [lineKey(line), line.recommendedQty]),
        );
      });
      setQuantitiesByChain(nextQuantities);
      setActiveChainKey(next.chains[0] ? chainKey(next.chains[0], 0) : '0');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [open, skuCode]);

  React.useEffect(() => {
    if (open) void loadPlan();
  }, [open, loadPlan]);

  const activeChain = React.useMemo(() => {
    if (!plan) return null;
    return plan.chains.find((chain, index) => chainKey(chain, index) === activeChainKey) ?? plan.chains[0] ?? null;
  }, [activeChainKey, plan]);

  const activeQuantities = activeChain ? quantitiesByChain[activeChainKey] ?? {} : {};
  const activeTotal = activeChain
    ? activeChain.sizeLines.reduce((sum, line) => sum + Number(activeQuantities[lineKey(line)] ?? 0), 0)
    : 0;

  const updateQuantity = (line: ReorderPlanSizeLine, value: number | null) => {
    const nextValue = Math.max(0, Math.trunc(Number(value ?? 0)));
    setQuantitiesByChain((current) => ({
      ...current,
      [activeChainKey]: {
        ...(current[activeChainKey] ?? {}),
        [lineKey(line)]: nextValue,
      },
    }));
  };

  const handleSaveDefaults = async () => {
    setSavingDefaults(true);
    try {
      await saveInquiryReorderDefaults(skuCode, {
        scopeType: 'SKU',
        leadTimeDays,
        orderCycleDays,
        moqQty,
        updatedBy: 'system',
      });
      message.success('Reorder defaults saved.');
      await loadPlan({ leadTimeDays, orderCycleDays, moqQty });
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSavingDefaults(false);
    }
  };

  const handleCreatePo = async () => {
    if (!activeChain) return;
    const sizeCells = activeChain.sizeLines
      .map((line) => ({
        rowLabel: line.rowLabel,
        columnLabel: line.columnLabel,
        quantity: Number(activeQuantities[lineKey(line)] ?? 0),
      }))
      .filter((cell) => cell.quantity > 0);
    if (sizeCells.length === 0) {
      message.warning('Enter at least one reorder quantity.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    setCreatedPo(null);
    try {
      const result = await createInquiryReorderDraftPo(skuCode, {
        chainId: activeChain.chainId,
        chainLabel: activeChain.chainLabel,
        leadTimeDays,
        orderCycleDays,
        moqQty,
        createdBy: 'system',
        sizeCells,
      });
      setCreatedPo(result);
      message.success(`Draft PO ${result.poNumber} created for ${formatNumber(result.totalQuantity)} units.`);
    } catch (err) {
      const messageText = (err as Error).message;
      setCreateError(messageText);
      message.error(messageText);
    } finally {
      setCreating(false);
    }
  };

  const columns: ColumnsType<ReorderPlanSizeLine> = [
    { title: 'Size', dataIndex: 'sizeLabel', key: 'sizeLabel', fixed: 'left', width: 96 },
    { title: <Tooltip title="Includes warehouse on-hand">On hand</Tooltip>, dataIndex: 'onHand', key: 'onHand', width: 84, align: 'right' },
    { title: 'On order', dataIndex: 'onOrder', key: 'onOrder', width: 84, align: 'right' },
    { title: 'Model', dataIndex: 'modelQty', key: 'modelQty', width: 76, align: 'right' },
    { title: 'Short', dataIndex: 'modelShort', key: 'modelShort', width: 76, align: 'right' },
    { title: 'Prev order', dataIndex: 'previousOrderQty', key: 'previousOrderQty', width: 96, align: 'right' },
    { title: 'SKU 12M', dataIndex: 'skuSalesQty', key: 'skuSalesQty', width: 86, align: 'right' },
    { title: 'Cat sales', dataIndex: 'categorySalesQty', key: 'categorySalesQty', width: 86, align: 'right' },
    { title: 'Projected', dataIndex: 'projectedSales', key: 'projectedSales', width: 92, align: 'right' },
    {
      title: 'Curve',
      key: 'curve',
      width: 120,
      render: (_, line) => (
        <Space size={4}>
          <Tag>{sourceLabel(line.curveSource)}</Tag>
          <Typography.Text type="secondary">{formatNumber(line.curvePct * 100, 1)}%</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Order',
      key: 'orderQty',
      fixed: 'right',
      width: 110,
      align: 'right',
      render: (_, line) => (
        <InputNumber
          min={0}
          precision={0}
          value={activeQuantities[lineKey(line)] ?? line.recommendedQty}
          onChange={(value) => updateQuantity(line, value)}
          style={{ width: 88 }}
        />
      ),
    },
  ];

  return (
    <Modal
      open={open}
      title={`Reorder planner - ${skuCode}`}
      onCancel={onClose}
      width="min(1180px, 96vw)"
      destroyOnClose
      footer={[
        <Button key="close" onClick={onClose}>Close</Button>,
        createdPo ? (
          <Button key="open-po" type="primary" href={`/purchasing/orders/${createdPo.poId}`}>
            Open draft PO
          </Button>
        ) : null,
        <Button key="save" onClick={handleSaveDefaults} loading={savingDefaults} disabled={!plan}>
          Save defaults
        </Button>,
        <Button
          key="recalc"
          onClick={() => loadPlan({ leadTimeDays, orderCycleDays, moqQty })}
          loading={loading}
          disabled={!plan}
        >
          Recalculate
        </Button>,
        <Button key="create" type={createdPo ? 'default' : 'primary'} onClick={handleCreatePo} loading={creating} disabled={!activeChain || activeTotal <= 0}>
          Create draft PO
        </Button>,
      ]}
    >
      {loading && !plan ? (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : error ? (
        <Alert type="error" message={error} />
      ) : plan ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {plan.warnings.map((warning) => (
            <Alert key={warning} type="warning" showIcon message={warning} />
          ))}
          {createError && (
            <Alert type="error" showIcon message="Draft PO was not created" description={createError} />
          )}
          {createdPo && (
            <Alert
              type="success"
              showIcon
              message={`Draft PO ${createdPo.poNumber} created`}
              description={`${formatNumber(createdPo.totalQuantity)} units were saved with per-size quantities.`}
              action={<Button size="small" href={`/purchasing/orders/${createdPo.poId}`}>Open</Button>}
            />
          )}

          <Descriptions size="small" bordered column={4}>
            <Descriptions.Item label="Vendor">{plan.sku.vendorCode ?? 'None'}</Descriptions.Item>
            <Descriptions.Item label="Category">{plan.sku.category ?? 'None'}</Descriptions.Item>
            <Descriptions.Item label="Order multiple">{plan.sku.orderMultiple ?? 'None'}</Descriptions.Item>
            <Descriptions.Item label="Default source">{plan.defaults.scope}</Descriptions.Item>
          </Descriptions>

          <Space wrap>
            <Space size="small">
              <Typography.Text>Lead time</Typography.Text>
              <InputNumber min={1} precision={0} value={leadTimeDays} onChange={(value) => setLeadTimeDays(Number(value ?? 1))} />
              <Typography.Text type="secondary">days</Typography.Text>
            </Space>
            <Space size="small">
              <Typography.Text>Order cycle</Typography.Text>
              <InputNumber min={1} precision={0} value={orderCycleDays} onChange={(value) => setOrderCycleDays(Number(value ?? 1))} />
              <Typography.Text type="secondary">days</Typography.Text>
            </Space>
            <Space size="small">
              <Typography.Text>MOQ</Typography.Text>
              <InputNumber min={0} precision={0} value={moqQty} onChange={(value) => setMoqQty(Number(value ?? 0))} />
            </Space>
            <Typography.Text type="secondary">
              Coverage: {formatNumber(leadTimeDays + orderCycleDays)} days
            </Typography.Text>
          </Space>

          <Tabs
            activeKey={activeChainKey}
            onChange={setActiveChainKey}
            items={plan.chains.map((chain, index) => {
              const key = chainKey(chain, index);
              const quantityMap = quantitiesByChain[key] ?? {};
              const total = chain.sizeLines.reduce((sum, line) => sum + Number(quantityMap[lineKey(line)] ?? 0), 0);
              return {
                key,
                label: `${chain.chainLabel} (${formatNumber(total)})`,
                children: (
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Descriptions size="small" column={4}>
                      <Descriptions.Item label="Stores">{chain.storeCount}</Descriptions.Item>
                      <Descriptions.Item label="Model short">{formatNumber(chain.totals.modelShort)}</Descriptions.Item>
                      <Descriptions.Item label={<Tooltip title={PROJECTED_FORMULA}>Projected</Tooltip>}>
                        {formatNumber(chain.totals.projectedSales)}
                      </Descriptions.Item>
                      <Descriptions.Item label="Previous PO">
                        {chain.previousOrder.poNumber
                          ? `${chain.previousOrder.poNumber}${chain.previousOrder.source ? ` (${chain.previousOrder.source})` : ''}`
                          : 'None'}
                      </Descriptions.Item>
                    </Descriptions>
                    <Table
                      size="small"
                      rowKey={(line) => lineKey(line)}
                      columns={columns}
                      dataSource={chain.sizeLines}
                      pagination={false}
                      scroll={{ x: 1050, y: 420 }}
                      summary={() => (
                        <Table.Summary fixed>
                          <Table.Summary.Row>
                            <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
                            <Table.Summary.Cell index={1} align="right">{formatNumber(chain.totals.onHand)}</Table.Summary.Cell>
                            <Table.Summary.Cell index={2} align="right">
                              {formatNumber(chain.totals.currentOnOrder + chain.totals.futureOnOrder)}
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={3} align="right">{formatNumber(chain.totals.modelQty)}</Table.Summary.Cell>
                            <Table.Summary.Cell index={4} align="right">{formatNumber(chain.totals.modelShort)}</Table.Summary.Cell>
                            <Table.Summary.Cell index={5} align="right">{formatNumber(chain.totals.previousOrderQty)}</Table.Summary.Cell>
                            <Table.Summary.Cell index={6} align="right">{formatNumber(chain.totals.skuSalesQty)}</Table.Summary.Cell>
                            <Table.Summary.Cell index={7} align="right">{formatNumber(chain.totals.categorySalesQty)}</Table.Summary.Cell>
                            <Table.Summary.Cell index={8} align="right">{formatNumber(chain.totals.projectedSales)}</Table.Summary.Cell>
                            <Table.Summary.Cell index={9} />
                            <Table.Summary.Cell index={10} align="right">{formatNumber(total)}</Table.Summary.Cell>
                          </Table.Summary.Row>
                        </Table.Summary>
                      )}
                    />
                  </Space>
                ),
              };
            })}
          />
        </Space>
      ) : null}
    </Modal>
  );
}
