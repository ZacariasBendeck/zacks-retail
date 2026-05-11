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
  type ReorderCasePackChoice,
  type ReorderCasePackSuggestion,
  type ReorderPlanSizeLine,
} from '../../../services/ricsInventoryApi';

interface ReorderPlannerModalProps {
  open: boolean;
  skuCode: string;
  onClose: () => void;
}

type QuantityMap = Record<string, number>;

type PackSelection = {
  casePackId: string;
  casePackMultiplier: number;
};

type MatrixMetric =
  | 'onHand'
  | 'onOrder'
  | 'modelQty'
  | 'modelShort'
  | 'previousOrderQty'
  | 'skuSalesQty'
  | 'categorySalesQty'
  | 'forecastDemandQty'
  | 'baselineMonthlyDemand'
  | 'curve'
  | 'suggested'
  | 'cases'
  | 'order';

interface SizeMatrixRow {
  key: MatrixMetric;
  label: React.ReactNode;
}

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function lineKey(line: Pick<ReorderPlanSizeLine, 'rowLabel' | 'columnLabel'>): string {
  return `${line.rowLabel}|${line.columnLabel}`;
}

function casePackQuantityMap(
  pack: ReorderCasePackSuggestion | ReorderCasePackChoice | null | undefined,
  multiplier?: number,
): QuantityMap {
  if (!pack) return {};
  const safeDefaultMultiplier = Math.max(1, Math.trunc(Number(pack.multiplier) || 1));
  const safeMultiplier = Math.max(1, Math.trunc(Number(multiplier ?? pack.multiplier) || 1));
  return Object.fromEntries(pack.sizeCells.map((cell) => {
    const perPackQty = Math.max(0, Math.round(cell.quantity / safeDefaultMultiplier));
    return [`${cell.rowLabel}|${cell.columnLabel}`, perPackQty * safeMultiplier];
  }));
}

function recommendedQuantityMap(chain: ReorderPlanChain): QuantityMap {
  return Object.fromEntries(chain.sizeLines.map((line) => [lineKey(line), line.recommendedQty]));
}

function shouldAutoApplyCasePack(suggestion: ReorderCasePackSuggestion | null | undefined): boolean {
  return suggestion?.autoApply === true;
}

function initialQuantityMap(chain: ReorderPlanChain): QuantityMap {
  return shouldAutoApplyCasePack(chain.casePackSuggestion)
    ? casePackQuantityMap(chain.casePackSuggestion)
    : recommendedQuantityMap(chain);
}

function badgeLabel(badge: ReorderCasePackChoice['badges'][number]): string {
  switch (badge) {
    case 'PREVIOUS_SKU': return 'Previous SKU';
    case 'CATEGORY_USED': return 'Category used';
    case 'BEST_FIT': return 'Best fit';
    default: return badge;
  }
}

function badgeColor(badge: ReorderCasePackChoice['badges'][number]): string {
  switch (badge) {
    case 'PREVIOUS_SKU': return 'green';
    case 'CATEGORY_USED': return 'blue';
    case 'BEST_FIT': return 'purple';
    default: return 'default';
  }
}

function findCasePackChoice(chain: ReorderPlanChain, casePackId: string | null | undefined): ReorderCasePackChoice | null {
  if (!casePackId) return null;
  return chain.casePackChoices.find((choice) => choice.code === casePackId) ?? null;
}

function quantityFitSummary(chain: ReorderPlanChain, quantityMap: QuantityMap) {
  let shortageQty = 0;
  let excessQty = 0;
  let differenceQty = 0;
  for (const line of chain.sizeLines) {
    const target = Math.max(0, Math.trunc(line.recommendedQty));
    const quantity = Math.max(0, Math.trunc(Number(quantityMap[lineKey(line)] ?? 0)));
    shortageQty += Math.max(0, target - quantity);
    excessQty += Math.max(0, quantity - target);
    differenceQty += Math.abs(quantity - target);
  }
  return { shortageQty, excessQty, differenceQty };
}

function numericMetricValue(line: ReorderPlanSizeLine, metric: MatrixMetric): number {
  switch (metric) {
    case 'onHand': return line.onHand;
    case 'onOrder': return line.onOrder;
    case 'modelQty': return line.modelQty;
    case 'modelShort': return line.modelShort;
    case 'previousOrderQty': return line.previousOrderQty;
    case 'skuSalesQty': return line.skuSalesQty;
    case 'categorySalesQty': return line.categorySalesQty;
    case 'forecastDemandQty': return line.forecastDemandQty;
    case 'baselineMonthlyDemand': return line.baselineMonthlyDemand;
    default: return 0;
  }
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
  'Forecast demand = recent SKU sales de-seasonalized by the department all-store monthly index, then re-seasonalized across the coverage months. Order = model + forecast demand - on hand - on order.';

const MATRIX_METRIC_COLUMN_WIDTH = 92;
const MATRIX_SIZE_COLUMN_WIDTH = 46;
const MATRIX_TOTAL_COLUMN_WIDTH = 62;
const MATRIX_ORDER_INPUT_WIDTH = 42;

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
  const [packSelectionsByChain, setPackSelectionsByChain] = React.useState<Record<string, PackSelection | null>>({});

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
      const nextPackSelections: Record<string, PackSelection | null> = {};
      next.chains.forEach((chain, index) => {
        const key = chainKey(chain, index);
        const suggestion = chain.casePackSuggestion;
        nextQuantities[key] = initialQuantityMap(chain);
        nextPackSelections[key] = shouldAutoApplyCasePack(suggestion) && suggestion
          ? { casePackId: suggestion.code, casePackMultiplier: suggestion.multiplier }
          : null;
      });
      setQuantitiesByChain(nextQuantities);
      setPackSelectionsByChain(nextPackSelections);
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
  const createButtonLabel = plan?.vendorDraftPo ? 'Add to draft PO' : 'Create draft PO';

  const updateQuantity = (targetChainKey: string, line: ReorderPlanSizeLine, value: number | null) => {
    const nextValue = Math.max(0, Math.trunc(Number(value ?? 0)));
    setQuantitiesByChain((current) => ({
      ...current,
      [targetChainKey]: {
        ...(current[targetChainKey] ?? {}),
        [lineKey(line)]: nextValue,
      },
    }));
  };

  const applyCasePackChoice = (targetChainKey: string, choice: ReorderCasePackChoice, multiplier = choice.multiplier) => {
    const safeMultiplier = Math.max(1, Math.trunc(Number(multiplier) || 1));
    setPackSelectionsByChain((current) => ({
      ...current,
      [targetChainKey]: {
        casePackId: choice.code,
        casePackMultiplier: safeMultiplier,
      },
    }));
    setQuantitiesByChain((current) => ({
      ...current,
      [targetChainKey]: casePackQuantityMap(choice, safeMultiplier),
    }));
  };

  const updateCasePackMultiplier = (
    targetChainKey: string,
    chain: ReorderPlanChain,
    selection: PackSelection | null,
    value: number | null,
  ) => {
    const choice = findCasePackChoice(chain, selection?.casePackId);
    if (!choice) return;
    applyCasePackChoice(targetChainKey, choice, Math.max(1, Math.trunc(Number(value ?? 1))));
  };

  const clearCasePackSelection = (targetChainKey: string, chain: ReorderPlanChain) => {
    setPackSelectionsByChain((current) => ({
      ...current,
      [targetChainKey]: null,
    }));
    setQuantitiesByChain((current) => ({
      ...current,
      [targetChainKey]: recommendedQuantityMap(chain),
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
      const packSelection = packSelectionsByChain[activeChainKey] ?? null;
      const result = await createInquiryReorderDraftPo(skuCode, {
        chainId: activeChain.chainId,
        chainLabel: activeChain.chainLabel,
        leadTimeDays,
        orderCycleDays,
        moqQty,
        casePackId: packSelection?.casePackId ?? null,
        casePackMultiplier: packSelection?.casePackMultiplier ?? null,
        createdBy: 'system',
        sizeCells,
      });
      setCreatedPo(result);
      message.success(
        result.appendedToExistingPo
          ? `Added ${formatNumber(result.totalQuantity)} units to draft PO ${result.poNumber}.`
          : `Draft PO ${result.poNumber} created for ${formatNumber(result.totalQuantity)} units.`,
      );
    } catch (err) {
      const messageText = (err as Error).message;
      setCreateError(messageText);
      message.error(messageText);
    } finally {
      setCreating(false);
    }
  };

  const matrixRows: SizeMatrixRow[] = [
    { key: 'onHand', label: <Tooltip title="Includes warehouse on-hand">On hand</Tooltip> },
    { key: 'onOrder', label: 'On order' },
    { key: 'modelQty', label: 'Model' },
    { key: 'modelShort', label: 'Short' },
    { key: 'previousOrderQty', label: 'Prev order' },
    { key: 'skuSalesQty', label: 'SKU 12M' },
    { key: 'categorySalesQty', label: 'Cat sales' },
    { key: 'forecastDemandQty', label: <Tooltip title={PROJECTED_FORMULA}>Forecast</Tooltip> },
    { key: 'baselineMonthlyDemand', label: 'Base/mo' },
    { key: 'curve', label: 'Curve' },
    { key: 'suggested', label: 'Suggested' },
    { key: 'cases', label: 'Cases' },
    { key: 'order', label: 'Order' },
  ];

  const renderMatrixCell = (
    row: SizeMatrixRow,
    line: ReorderPlanSizeLine,
    targetChainKey: string,
    quantityMap: QuantityMap,
    caseQuantityMap: QuantityMap,
  ) => {
    const key = lineKey(line);
    if (row.key === 'order') {
      return (
        <InputNumber
          size="small"
          controls={false}
          min={0}
          precision={0}
          value={quantityMap[key] ?? 0}
          onChange={(value) => updateQuantity(targetChainKey, line, value)}
          style={{ width: MATRIX_ORDER_INPUT_WIDTH, textAlign: 'right' }}
        />
      );
    }
    if (row.key === 'cases') return formatNumber(caseQuantityMap[key] ?? 0);
    if (row.key === 'suggested') return formatNumber(line.recommendedQty);
    if (row.key === 'curve') {
      return (
        <Space size={1} direction="vertical" style={{ lineHeight: 1.05 }}>
          <Tooltip title={sourceLabel(line.curveSource)}>
            <Tag style={{ marginRight: 0, paddingInline: 2, fontSize: 10 }}>
              {sourceLabel(line.curveSource).slice(0, 3)}
            </Tag>
          </Tooltip>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {formatNumber(line.curvePct * 100, 0)}%
          </Typography.Text>
        </Space>
      );
    }
    if (row.key === 'baselineMonthlyDemand') return formatNumber(line.baselineMonthlyDemand, 1);
    return formatNumber(numericMetricValue(line, row.key));
  };

  const buildMatrixColumns = (
    chain: ReorderPlanChain,
    targetChainKey: string,
    quantityMap: QuantityMap,
    selectedPack: PackSelection | null,
    selectedChoice: ReorderCasePackChoice | null,
  ): ColumnsType<SizeMatrixRow> => {
    const caseQuantities = selectedPack && selectedChoice
      ? casePackQuantityMap(selectedChoice, selectedPack.casePackMultiplier)
      : {};
    const visibleLines = chain.sizeLines.filter((line) => {
      const key = lineKey(line);
      return [
        line.onHand,
        line.onOrder,
        line.modelQty,
        line.modelShort,
        line.previousOrderQty,
        line.skuSalesQty,
        line.categorySalesQty,
        line.forecastDemandQty,
        line.baselineMonthlyDemand,
        line.recommendedQty,
        caseQuantities[key] ?? 0,
        quantityMap[key] ?? 0,
      ].some((value) => Math.abs(Number(value) || 0) > 0);
    });
    const totalForRow = (row: SizeMatrixRow) => {
      if (row.key === 'order') {
        return formatNumber(visibleLines.reduce((sum, line) => sum + Number(quantityMap[lineKey(line)] ?? 0), 0));
      }
      if (row.key === 'cases') {
        return formatNumber(visibleLines.reduce((sum, line) => sum + Number(caseQuantities[lineKey(line)] ?? 0), 0));
      }
      if (row.key === 'suggested') {
        return formatNumber(visibleLines.reduce((sum, line) => sum + line.recommendedQty, 0));
      }
      if (row.key === 'curve') {
        const totalCurve = visibleLines.reduce((sum, line) => sum + line.curvePct, 0);
        return totalCurve > 0 ? `${formatNumber(totalCurve * 100, 1)}%` : '';
      }
      if (row.key === 'baselineMonthlyDemand') {
        return formatNumber(visibleLines.reduce((sum, line) => sum + line.baselineMonthlyDemand, 0), 1);
      }
      return formatNumber(visibleLines.reduce((sum, line) => sum + numericMetricValue(line, row.key), 0));
    };
    return [
      {
        title: 'Metric',
        dataIndex: 'label',
        key: 'metric',
        width: MATRIX_METRIC_COLUMN_WIDTH,
        ellipsis: true,
      },
      ...visibleLines.map((line) => ({
        title: line.sizeLabel,
        key: lineKey(line),
        width: MATRIX_SIZE_COLUMN_WIDTH,
        align: 'right' as const,
        ellipsis: true,
        render: (_: unknown, row: SizeMatrixRow) => renderMatrixCell(row, line, targetChainKey, quantityMap, caseQuantities),
      })),
      {
        title: 'Total',
        key: 'total',
        width: MATRIX_TOTAL_COLUMN_WIDTH,
        align: 'right' as const,
        ellipsis: true,
        render: (_: unknown, row: SizeMatrixRow) => <Typography.Text strong>{totalForRow(row)}</Typography.Text>,
      },
    ];
  };

  return (
    <Modal
      open={open}
      title={`Reorder planner - ${skuCode}`}
      onCancel={onClose}
      width="min(1180px, 96vw)"
      destroyOnHidden
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
          {createButtonLabel}
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
          <style>
            {`
              .reorder-planner-matrix .ant-table-cell {
                padding: 4px 3px !important;
                font-size: 14px;
                line-height: 1.25;
                white-space: nowrap;
              }
              .reorder-planner-matrix .ant-input-number {
                width: 100%;
                max-width: ${MATRIX_ORDER_INPUT_WIDTH}px;
              }
              .reorder-planner-matrix .ant-input-number-input {
                padding-inline: 2px;
                text-align: right;
                font-size: 14px;
              }
            `}
          </style>
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
              message={createdPo.appendedToExistingPo ? `Added to draft PO ${createdPo.poNumber}` : `Draft PO ${createdPo.poNumber} created`}
              description={`${formatNumber(createdPo.totalQuantity)} units were saved with per-size quantities.`}
              action={<Button size="small" href={`/purchasing/orders/${createdPo.poId}`}>Open</Button>}
            />
          )}

          <Descriptions size="small" bordered column={4}>
            <Descriptions.Item label="Vendor">{plan.sku.vendorCode ?? 'None'}</Descriptions.Item>
            <Descriptions.Item label="Category">{plan.sku.category ?? 'None'}</Descriptions.Item>
            <Descriptions.Item label="Order multiple">{plan.sku.orderMultiple ?? 'None'}</Descriptions.Item>
            <Descriptions.Item label="Default source">{plan.defaults.scope}</Descriptions.Item>
            <Descriptions.Item label="Seasonality dept">{plan.seasonality.departmentLabel ?? 'Neutral'}</Descriptions.Item>
            <Descriptions.Item label="Seasonality thru">{plan.planning.seasonalityHistoryEndMonth} ({plan.seasonality.sampleMonths} months)</Descriptions.Item>
            <Descriptions.Item label="Forecast months">{plan.planning.forecastMonths.join(', ')}</Descriptions.Item>
            <Descriptions.Item label="Index">
              {plan.seasonality.departmentNumber != null ? (
                <Button
                  type="link"
                  size="small"
                  href={`/reports/sales/seasonality-index?department=${plan.seasonality.departmentNumber}`}
                  style={{ padding: 0 }}
                >
                  View
                </Button>
              ) : 'Neutral'}
            </Descriptions.Item>
            <Descriptions.Item label="Vendor draft PO">
              {plan.vendorDraftPo ? (
                <Button
                  type="link"
                  size="small"
                  href={`/purchasing/orders/${plan.vendorDraftPo.poId}`}
                  style={{ padding: 0 }}
                >
                  {plan.vendorDraftPo.poNumber} ({formatNumber(plan.vendorDraftPo.totalQuantity)})
                </Button>
              ) : 'None'}
            </Descriptions.Item>
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
              Coverage: {formatNumber(leadTimeDays + orderCycleDays)} days, starting after {formatNumber(leadTimeDays)} day lead time
            </Typography.Text>
          </Space>

          <Tabs
            activeKey={activeChainKey}
            onChange={setActiveChainKey}
            items={plan.chains.map((chain, index) => {
              const key = chainKey(chain, index);
              const quantityMap = quantitiesByChain[key] ?? {};
              const packSelection = packSelectionsByChain[key] ?? null;
              const selectedChoice = findCasePackChoice(chain, packSelection?.casePackId);
              const selectedCaseQuantities = selectedChoice && packSelection
                ? casePackQuantityMap(selectedChoice, packSelection.casePackMultiplier)
                : {};
              const selectedFit = quantityFitSummary(chain, selectedCaseQuantities);
              const selectedTotalUnits = selectedChoice && packSelection
                ? selectedChoice.unitsPerPack * packSelection.casePackMultiplier
                : 0;
              const total = chain.sizeLines.reduce((sum, line) => sum + Number(quantityMap[lineKey(line)] ?? 0), 0);
              const previousPack = chain.previousOrder.casePackId
                ? ` · ${chain.previousOrder.casePackId}${chain.previousOrder.casePackMultiplier ? ` x ${chain.previousOrder.casePackMultiplier}` : ''}`
                : '';
              const casePackColumns: ColumnsType<ReorderCasePackChoice> = [
                {
                  title: 'Case pack',
                  key: 'pack',
                  width: 260,
                  render: (_, choice) => (
                    <Space size={2} direction="vertical">
                      <Space wrap size={[4, 2]}>
                        <Tag color={packSelection?.casePackId === choice.code ? 'purple' : 'default'}>{choice.code}</Tag>
                        {choice.badges.map((badge) => (
                          <Tag key={badge} color={badgeColor(badge)}>{badgeLabel(badge)}</Tag>
                        ))}
                      </Space>
                      {choice.description ? <Typography.Text>{choice.description}</Typography.Text> : null}
                    </Space>
                  ),
                },
                {
                  title: 'Category use',
                  key: 'usage',
                  width: 150,
                  render: (_, choice) => (
                    <Space size={2} direction="vertical">
                      <Typography.Text>{formatNumber(choice.categorySkuCount)} SKUs</Typography.Text>
                      <Typography.Text type="secondary">
                        {formatNumber(choice.categoryUsageCount)} POs
                        {choice.categoryLastUsedAt ? ` - last ${choice.categoryLastUsedAt.slice(0, 10)}` : ''}
                      </Typography.Text>
                    </Space>
                  ),
                },
                {
                  title: 'Fit',
                  key: 'fit',
                  width: 260,
                  render: (_, choice) => (
                    <Space wrap size={[4, 2]}>
                      <Typography.Text type="secondary">
                        {formatNumber(choice.unitsPerPack)} units/pack x {formatNumber(choice.multiplier)} = {formatNumber(choice.totalUnits)}
                      </Typography.Text>
                      <Tag color={choice.shortageQty > 0 ? 'orange' : 'green'}>Short {formatNumber(choice.shortageQty)}</Tag>
                      <Tag color={choice.excessQty > 0 ? 'blue' : 'green'}>Excess {formatNumber(choice.excessQty)}</Tag>
                      {choice.overbuyQty > 0 ? (
                        <Tag color={choice.overbuyQty > choice.overbuyLimitQty ? 'orange' : 'blue'}>
                          Overbuy {formatNumber(choice.overbuyQty)}
                        </Tag>
                      ) : null}
                    </Space>
                  ),
                },
                {
                  title: '',
                  key: 'action',
                  width: 110,
                  align: 'right',
                  render: (_, choice) => {
                    const selected = packSelection?.casePackId === choice.code;
                    return (
                      <Button
                        size="small"
                        type={selected ? 'primary' : 'default'}
                        onClick={() => applyCasePackChoice(key, choice)}
                      >
                        {selected ? `Selected ${choice.code}` : `Use ${choice.code}`}
                      </Button>
                    );
                  },
                },
              ];
              return {
                key,
                label: `${chain.chainLabel} (${formatNumber(total)})`,
                children: (
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Descriptions size="small" column={5}>
                      <Descriptions.Item label="Stores">{chain.storeCount}</Descriptions.Item>
                      <Descriptions.Item label="Model short">{formatNumber(chain.totals.modelShort)}</Descriptions.Item>
                      <Descriptions.Item label={<Tooltip title={PROJECTED_FORMULA}>Forecast</Tooltip>}>
                        {formatNumber(chain.totals.forecastDemandQty)}
                      </Descriptions.Item>
                      <Descriptions.Item label="Suggested order">{formatNumber(chain.totals.recommendedQty)}</Descriptions.Item>
                      <Descriptions.Item label="Previous PO">
                        {chain.previousOrder.poNumber
                          ? `${chain.previousOrder.poNumber}${chain.previousOrder.source ? ` (${chain.previousOrder.source})` : ''}${previousPack}`
                          : 'None'}
                      </Descriptions.Item>
                    </Descriptions>
                    {chain.casePackChoices.length > 0 ? (
                      <Space direction="vertical" size="small" style={{ width: '100%' }}>
                        {selectedChoice && packSelection ? (
                          <Space wrap size={[8, 4]}>
                            <Typography.Text>Selected pack</Typography.Text>
                            <Tag color="purple">{selectedChoice.code}</Tag>
                            <Typography.Text>Multiplier</Typography.Text>
                            <InputNumber
                              size="small"
                              min={1}
                              precision={0}
                              value={packSelection.casePackMultiplier}
                              onChange={(value) => updateCasePackMultiplier(key, chain, packSelection, value)}
                              style={{ width: 72 }}
                            />
                            <Typography.Text type="secondary">
                              {formatNumber(selectedChoice.unitsPerPack)} units/pack = {formatNumber(selectedTotalUnits)}
                            </Typography.Text>
                            <Tag color={selectedFit.shortageQty > 0 ? 'orange' : 'green'}>
                              Short {formatNumber(selectedFit.shortageQty)}
                            </Tag>
                            <Tag color={selectedFit.excessQty > 0 ? 'blue' : 'green'}>
                              Excess {formatNumber(selectedFit.excessQty)}
                            </Tag>
                            <Button size="small" onClick={() => clearCasePackSelection(key, chain)}>
                              Clear pack
                            </Button>
                          </Space>
                        ) : (
                          <Typography.Text type="secondary">No case pack selected.</Typography.Text>
                        )}
                        <Table<ReorderCasePackChoice>
                          size="small"
                          rowKey={(choice) => choice.code}
                          columns={casePackColumns}
                          dataSource={chain.casePackChoices}
                          pagination={false}
                          tableLayout="fixed"
                          scroll={{ x: 'max-content' }}
                        />
                      </Space>
                    ) : (
                      <Typography.Text type="secondary">No category-used case packs found for this SKU size type.</Typography.Text>
                    )}
                    <Table
                      size="small"
                      className="reorder-planner-matrix"
                      rowKey={(row) => row.key}
                      columns={buildMatrixColumns(chain, key, quantityMap, packSelection, selectedChoice)}
                      dataSource={matrixRows}
                      pagination={false}
                      tableLayout="fixed"
                      style={{ width: '100%' }}
                      scroll={{
                        x: 'max-content',
                        y: 520,
                      }}
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
