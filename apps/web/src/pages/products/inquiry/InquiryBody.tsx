import React from 'react';
import { Alert, Button, Select, Space, Typography, message, Spin } from 'antd';
import { EditOutlined, RobotOutlined, SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useTranslation } from '@benlow-rics/i18n/react';
import { HeaderCard } from './HeaderCard';
import { PicturePanel } from './PicturePanel';
import { PricingPanel } from './PricingPanel';
import { SalesRollupStrip } from './SalesRollupStrip';
import { ViewModeSelector, type ViewMode } from './ViewModeSelector';
import { ActionBar, type InquiryTab, type NeighborScope } from './ActionBar';
import { useInquiryData } from './useInquiryData';
import { SizeGrid as SizeGridComponent } from '../../../components/size-grid';
import { SkuLookup } from '../../../components/sku-lookup';
import type { InquiryGrids, InquirySizeGrid } from '../../../types/inventoryInquiry';
import { UpcsTab } from './tabs/UpcsTab';
import { InfoTab } from './tabs/InfoTab';
import { DetailTab } from './tabs/DetailTab';
import { PosTab } from './tabs/PosTab';
import { TrendTab } from './tabs/TrendTab';
import { SkuAiRecommendationModal } from './SkuAiRecommendationModal';
import MatchingSetsCard from '../../../components/products/MatchingSetsCard';
import { ReorderPlannerModal } from './ReorderPlannerModal';

const GRID_TOTAL_MODES = new Set<ViewMode>(['ON_HAND', 'SHORT', 'MTD_SALES', 'STD_SALES', 'YTD_SALES', 'LY_SALES']);
const GRID_TOTAL_ROW_MODES = new Set<ViewMode>([
  'ON_HAND',
  'ON_ORDER_CURRENT',
  'ON_ORDER_FUTURE',
  'MODEL',
  'SHORT',
  'MTD_SALES',
  'STD_SALES',
  'YTD_SALES',
  'LY_SALES',
  'ALL_STORES_ON_HAND',
  'MAX',
  'REORDER',
]);

const GRID_KEY_BY_MODE: Partial<Record<ViewMode, keyof InquiryGrids>> = {
  ON_HAND:             'onHand',
  ON_ORDER_CURRENT:    'onOrderCurrent',
  ON_ORDER_FUTURE:     'onOrderFuture',
  MODEL:               'model',
  SHORT:               'short',
  MTD_SALES:           'mtdSales',
  STD_SALES:           'stdSales',
  YTD_SALES:           'ytdSales',
  LY_SALES:            'lySales',
  SINGLE_COLUMN:       'singleColumn',
  ALL_STORES_ON_HAND:  'allStoresOnHand',
  ALL_STORES_SUMMARY:  'allStoresSummary',
  MAX:                 'max',
  REORDER:             'reorder',
};

export interface InquiryBodyProps {
  /** SKU to inquire on. Empty string = show the "pick a SKU" landing. */
  skuCode: string;
  /** Optional per-store scoping (query param on the full-page route). */
  storeId?: number;
  selectedRow?: string | null;
  /**
   * Called when the user picks a different SKU from the lookup inside this
   * body. The page-level wrapper navigates via React Router; the popup
   * wrapper re-points the popup at the new SKU.
   */
  onPickSku: (picked: { skuCode: string; skuId: string }) => void;
  onEditSku?: (skuCode: string) => void;
  onOpenMatchingSets?: () => void;
  mode: ViewMode;
  activeTab: InquiryTab | null;
  scope: NeighborScope;
  onModeChange: (mode: ViewMode) => void;
  onActiveTabChange: (tab: InquiryTab | null) => void;
  onScopeChange: (scope: NeighborScope) => void;
  onSelectedRowChange: (row: string | null) => void;
}

/**
 * The visual body of the Inventory Inquiry — header, pricing, rollup,
 * picture, view-mode selector, size grid, action bar, and tabs.
 *
 * Decoupled from React Router so it can render inside:
 *   - the full-page route `/products/inquiry/:skuCode` (via `<InquiryPage />`)
 *   - an app-wide popup triggered from any `<SkuLink>` click
 *
 * View-mode and active-tab state are internal to this body; a mount inside
 * a popup starts fresh, which matches "open a fresh inquiry window per SKU".
 */
export const InquiryBody: React.FC<InquiryBodyProps> = ({
  skuCode,
  storeId,
  selectedRow,
  onPickSku,
  onEditSku,
  onOpenMatchingSets,
  mode,
  activeTab,
  scope,
  onModeChange,
  onActiveTabChange,
  onScopeChange,
  onSelectedRowChange,
}) => {
  const { t } = useTranslation(['inquiry', 'common']);
  const [lookupOpen, setLookupOpen] = React.useState(false);
  const [aiModalOpen, setAiModalOpen] = React.useState(false);
  const [reorderModalOpen, setReorderModalOpen] = React.useState(false);
  const [reorderBlockedMessage, setReorderBlockedMessage] = React.useState<string | null>(null);
  const [navLoading, setNavLoading] = React.useState(false);
  const activeTabPanelRef = React.useRef<HTMLDivElement | null>(null);
  const prevSkuCodeRef = React.useRef(skuCode);

  React.useEffect(() => {
    if (prevSkuCodeRef.current === skuCode) return;
    prevSkuCodeRef.current = skuCode;
    setLookupOpen(false);
    setAiModalOpen(false);
    setReorderModalOpen(false);
    setReorderBlockedMessage(null);
    if (!skuCode) onActiveTabChange(null);
  }, [skuCode, onActiveTabChange]);

  const { data, isLoading, error } = useInquiryData(skuCode, storeId, selectedRow);

  React.useEffect(() => {
    if (!activeTab) return;
    window.requestAnimationFrame(() => {
      activeTabPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [activeTab]);

  const handleLookupSelect = (picked: { skuCode: string; skuId: string }) => {
    setLookupOpen(false);
    onPickSku(picked);
  };

  const navigateNeighbor = React.useCallback(
    async (direction: 'next' | 'prev') => {
      if (!skuCode) return;
      setNavLoading(true);
      try {
        const url =
          `/api/v1/inventory/inquiry/${encodeURIComponent(skuCode)}/neighbor` +
          `?direction=${direction}&scope=${scope}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`neighbor lookup failed: ${response.status}`);
        const { sku } = (await response.json()) as { sku: string | null };
        if (!sku) {
          message.info(t('inquiry:messages.noNeighbor', {
            direction: t(`common:actions.${direction === 'next' ? 'next' : 'previous'}`),
            scope: scopeLabel(scope, t),
          }));
          return;
        }
        onPickSku({ skuCode: sku, skuId: sku });
      } catch (err) {
        message.error((err as Error).message);
      } finally {
        setNavLoading(false);
      }
    },
    [skuCode, scope, onPickSku, t],
  );

  const rowOptions = (data?.sizeType?.rows ?? []).filter((label) => label.trim().length > 0);
  const needsRowSelection = isRowSensitiveMode(mode) && rowOptions.length > 0;
  const effectiveSelectedRow =
    needsRowSelection && selectedRow && rowOptions.includes(selectedRow)
      ? selectedRow
      : (needsRowSelection ? rowOptions[0] ?? null : null);

  React.useEffect(() => {
    if (!data || !needsRowSelection || !effectiveSelectedRow) return;
    if (selectedRow === effectiveSelectedRow) return;
    onSelectedRowChange(effectiveSelectedRow);
  }, [data, effectiveSelectedRow, needsRowSelection, onSelectedRowChange, selectedRow]);

  if (!skuCode) {
    return (
      <>
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Button type="primary" icon={<SearchOutlined />} onClick={() => setLookupOpen(true)}>
            {t('inquiry:pickSku')}
          </Button>
        </div>
        {lookupOpen && (
          <SkuLookup
            open={lookupOpen}
            onClose={() => setLookupOpen(false)}
            onSelect={handleLookupSelect}
          />
        )}
      </>
    );
  }

  if (isLoading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }} role="status" aria-label={t('inquiry:loadingAria')}>
        <Spin size="large" />
        <div style={{ marginTop: 12, color: '#888' }}>{t('inquiry:loadingSku', { sku: skuCode })}</div>
      </div>
    );
  }
  if (error) return <Alert type="error" message={(error as Error).message} />;
  if (!data) return null;

  const gridKey = GRID_KEY_BY_MODE[mode];
  const sourceGrid = gridKey ? data.grids[gridKey] : undefined;
  const grid = withDisplayTotals(sourceGrid, mode);
  const headerTotal = GRID_TOTAL_MODES.has(mode) ? resolveGridTotal(sourceGrid) : undefined;
  const gridNullDisplay =
    mode === 'ALL_STORES_SUMMARY' || mode === 'SINGLE_COLUMN'
      ? ''
      : '—';
  const hasVisibleInventoryActivity = hasAnyGridValue(data.grids);
  const replacementContext = data.replacementContext ?? { replacedBy: null, supersedes: [] };
  const replacedBy = replacementContext.replacedBy;
  const supersedesWithDemand = replacementContext.supersedes.filter((item) => item.transferDemand);
  const replacementReorderWarning = replacedBy
    ? t('inquiry:messages.replacementWarning', {
        sku: data.sku,
        replacementSku: replacedBy.replacementSkuCode,
      })
    : null;
  const blockReorderIfReplaced = () => {
    if (!replacementReorderWarning) return false;
    setReorderBlockedMessage(replacementReorderWarning);
    message.warning(replacementReorderWarning);
    return true;
  };

  return (
    <div style={{ fontSize: 12 }}>
      {lookupOpen && (
        <SkuLookup
          open={lookupOpen}
          onClose={() => setLookupOpen(false)}
          onSelect={handleLookupSelect}
          initialQuery={skuCode}
        />
      )}

      {aiModalOpen && (
        <SkuAiRecommendationModal
          open={aiModalOpen}
          skuCode={skuCode}
          onClose={() => setAiModalOpen(false)}
        />
      )}

      {reorderModalOpen && (
        <ReorderPlannerModal
          open={reorderModalOpen}
          skuCode={skuCode}
          onClose={() => setReorderModalOpen(false)}
        />
      )}

      {replacedBy && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
          message={t('inquiry:messages.replacedBy', { sku: replacedBy.replacementSkuCode })}
          description={t('inquiry:messages.replacedDescription')}
          action={
            <Button
              size="small"
              onClick={() => onPickSku({
                skuCode: replacedBy.replacementSkuCode,
                skuId: replacedBy.replacementSkuId,
              })}
            >
              {t('inquiry:buttons.openReplacement')}
            </Button>
          }
        />
      )}

      {reorderBlockedMessage && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
          message={reorderBlockedMessage}
          action={replacedBy ? (
            <Button
              size="small"
              onClick={() => onPickSku({
                skuCode: replacedBy.replacementSkuCode,
                skuId: replacedBy.replacementSkuId,
              })}
            >
              {t('inquiry:buttons.openReplacement')}
            </Button>
          ) : undefined}
        />
      )}

      {!replacedBy && supersedesWithDemand.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 8 }}
          message={t('inquiry:messages.demandIncludes', {
            count: supersedesWithDemand.length,
            skus: supersedesWithDemand.map((item) => item.oldSkuCode).join(', '),
          })}
          description={t('inquiry:messages.demandIncludesDescription')}
        />
      )}

      {/* Top row: Header (left) | Pricing + Rollup + Picture (right) */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <div style={{ marginBottom: 4 }}>
            <Space size="small">
              <Button size="small" icon={<SearchOutlined />} onClick={() => setLookupOpen(true)}>
                {t('inquiry:buttons.skuLookup')}
              </Button>
              <Button
                size="small"
                icon={<RobotOutlined />}
                onClick={() => {
                  if (blockReorderIfReplaced()) return;
                  setAiModalOpen(true);
                }}
              >
                {t('inquiry:buttons.recommendedReorder')}
              </Button>
              <Button
                size="small"
                icon={<ShoppingCartOutlined />}
                onClick={() => {
                  if (blockReorderIfReplaced()) return;
                  setReorderModalOpen(true);
                }}
              >
                {t('inquiry:buttons.reorder')}
              </Button>
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => onEditSku?.(data.sku)}
              >
                {t('inquiry:buttons.editSku')}
              </Button>
            </Space>
          </div>
          <HeaderCard inquiry={data} storeId={storeId} onPickSku={onPickSku} />
          <MatchingSetsCard skuRef={data.sku} compact onOpenMatchingSets={onOpenMatchingSets} />
        </div>

        <div style={{ flex: '0 0 auto', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PricingPanel pricing={data.pricing} />
            <SalesRollupStrip rollup={data.rollup} />
          </div>
          {data.pictureUrl && (
            <div style={{ flex: '0 0 140px' }}>
              <PicturePanel pictureUrl={data.pictureUrl} alt={data.sku} />
            </div>
          )}
        </div>
      </div>

      {/* View-mode selector */}
      <div style={{ marginBottom: 4 }}>
        <ViewModeSelector value={mode} onChange={onModeChange} />
      </div>

      {/* Size grid caption + body */}
      <div style={{ margin: '4px 0' }}>
        <div
          data-testid="inquiry-grid-caption"
          style={{ background: '#e6f0ff', padding: '2px 8px', fontWeight: 600, borderBottom: '1px solid #ccd8ea' }}
        >
          <span>{t(`inquiry:modes.${mode}`)}</span>
          {headerTotal != null && (
            <span style={{ marginLeft: 12, fontWeight: 500 }}>
              {formatHeaderTotal(mode, headerTotal, data.grids)}
            </span>
          )}
        </div>
        {!hasVisibleInventoryActivity && (
          <Alert
            type="info"
            showIcon
            style={{ margin: 8 }}
            message={t('inquiry:messages.noActivity')}
            description={t('inquiry:messages.noActivityDescription', { sku: data.sku })}
          />
        )}
        {needsRowSelection && effectiveSelectedRow && rowOptions.length > 1 && (
          <Space size="small" style={{ padding: '6px 8px', borderBottom: '1px solid #eef2f7' }}>
            <Typography.Text type="secondary">{t('inquiry:row')}</Typography.Text>
            <Select
              size="small"
              value={effectiveSelectedRow}
              options={rowOptions.map((row) => ({ value: row, label: row }))}
              onChange={(nextRow) => onSelectedRowChange(nextRow)}
              popupMatchSelectWidth={false}
              style={{ minWidth: 96 }}
            />
          </Space>
        )}
        {grid
          ? <SizeGridComponent grid={grid} nullDisplay={gridNullDisplay} />
          : <em style={{ color: '#999', padding: 8, display: 'block' }}>{t('inquiry:messages.noDataForMode')}</em>}
      </div>

      {/* Action bar */}
      <div style={{ marginTop: 8 }}>
        <ActionBar
          activeTab={activeTab}
          onTab={onActiveTabChange}
          onPrev={() => navigateNeighbor('prev')}
          onNext={() => navigateNeighbor('next')}
          onClear={() => onActiveTabChange(null)}
          scope={scope}
          onScopeChange={onScopeChange}
          navLoading={navLoading}
        />
      </div>

      {/* Active tab panel */}
      {activeTab && (
        <div ref={activeTabPanelRef} style={{ marginTop: 8 }}>
          {activeTab === 'UPCS' && <UpcsTab skuCode={data.sku} />}
          {activeTab === 'INFO' && (
            <InfoTab skuCode={data.sku} storeId={storeId} onClose={() => onActiveTabChange(null)} />
          )}
          {activeTab === 'DETAIL' && (
            <DetailTab skuCode={data.sku} description={data.description} storeId={storeId} />
          )}
          {activeTab === 'POS' && <PosTab skuCode={data.sku} storeId={storeId} />}
          {activeTab === 'TREND' && (
            <TrendTab skuCode={data.sku} storeId={storeId} onClose={() => onActiveTabChange(null)} />
          )}
        </div>
      )}
    </div>
  );
};

function isRowSensitiveMode(mode: ViewMode): boolean {
  return mode === 'SINGLE_COLUMN' || mode === 'ALL_STORES_ON_HAND';
}

function hasAnyGridValue(grids: InquiryGrids): boolean {
  return Object.values(grids).some((grid) =>
    grid?.rows.some((row: { cells: Array<{ value: number | null }> }) =>
      row.cells.some((cell: { value: number | null }) => cell.value != null && cell.value !== 0))
  );
}

function scopeLabel(scope: NeighborScope, t: (key: string) => string): string {
  if (scope === 'vendor')   return t('inquiry:scope.sameVendor');
  if (scope === 'category') return t('inquiry:scope.sameCategory');
  return t('inquiry:scope.catalog');
}

function formatGridTotal(total: number): string {
  return new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(total);
}

function formatHeaderTotal(mode: ViewMode, total: number, grids: InquiryGrids): string {
  if (mode !== 'SHORT') return formatGridTotal(total);

  const modelTotal = resolveGridTotal(grids.model);
  if (modelTotal == null) return formatGridTotal(total);

  const shortPct = modelTotal === 0 ? null : (total / modelTotal) * 100;
  const prefix = `${formatGridTotal(total)} / ${formatGridTotal(modelTotal)}`;
  if (shortPct == null) return prefix;
  return `${prefix} (${formatPercent(shortPct)})`;
}

function resolveGridTotal(grid: InquirySizeGrid | undefined): number | undefined {
  if (!grid) return undefined;
  if (grid.total != null) return grid.total;
  return grid.rows
    .filter((row) => row.label.trim().toLowerCase() !== 'total')
    .reduce(
      (sum, row) => sum + row.cells.reduce((rowSum, cell) => rowSum + Number(cell.value ?? 0), 0),
      0,
    );
}

function withDisplayTotals(grid: InquirySizeGrid | undefined, mode: ViewMode): InquirySizeGrid | undefined {
  if (!grid) return undefined;
  const withTotalColumn = appendRowTotalColumn(grid);
  return GRID_TOTAL_ROW_MODES.has(mode) ? appendColumnTotalRow(withTotalColumn) : withTotalColumn;
}

function appendRowTotalColumn(grid: InquirySizeGrid): InquirySizeGrid {
  if (grid.columns.some((column) => column.trim().toUpperCase() === 'TOT')) return grid;

  return {
    ...grid,
    columns: [...grid.columns, 'TOT'],
    rows: grid.rows.map((row) => ({
      ...row,
      cells: [
        ...row.cells,
        {
          value: row.cells.reduce((sum, cell) => sum + Number(cell.value ?? 0), 0),
        },
      ],
    })),
  };
}

function appendColumnTotalRow(grid: InquirySizeGrid): InquirySizeGrid {
  if (grid.rows.some((row) => row.label.trim().toLowerCase() === 'total')) return grid;
  return {
    ...grid,
    rows: [
      ...grid.rows,
      {
        label: 'Total',
        cells: grid.columns.map((_, columnIndex) => ({
          value: grid.rows.reduce((sum, row) => sum + Number(row.cells[columnIndex]?.value ?? 0), 0),
        })),
      },
    ],
  };
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)}%`;
}
