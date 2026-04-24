import React from 'react';
import { Alert, Button, message, Spin } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { HeaderCard } from './HeaderCard';
import { PicturePanel } from './PicturePanel';
import { PricingPanel } from './PricingPanel';
import { SalesRollupStrip } from './SalesRollupStrip';
import { ViewModeSelector, type ViewMode } from './ViewModeSelector';
import { ActionBar, type InquiryTab, type NeighborScope } from './ActionBar';
import { useInquiryData } from './useInquiryData';
import { SizeGrid as SizeGridComponent } from '../../../components/size-grid';
import { SkuLookup } from '../../../components/sku-lookup';
import type { InquiryGrids } from '../../../types/inventoryInquiry';
import { UpcsTab } from './tabs/UpcsTab';
import { InfoTab } from './tabs/InfoTab';
import { DetailTab } from './tabs/DetailTab';
import { PosTab } from './tabs/PosTab';
import { TrendTab } from './tabs/TrendTab';
import AttributeBadgeStrip from '../../../components/products/AttributeBadgeStrip';

const GRID_KEY_BY_MODE: Partial<Record<ViewMode, keyof InquiryGrids>> = {
  ON_HAND:            'onHand',
  MODEL:              'model',
  SHORT:              'short',
  MAX:                'max',
  REORDER:            'reorder',
  ALL_STORES_ON_HAND: 'allStoresOnHand',
  ALL_STORES_SUMMARY: 'allStoresSummary',
};

export interface InquiryBodyProps {
  /** SKU to inquire on. Empty string = show the "pick a SKU" landing. */
  skuCode: string;
  /** Optional per-store scoping (query param on the full-page route). */
  storeId?: number;
  /**
   * Called when the user picks a different SKU from the lookup inside this
   * body. The page-level wrapper navigates via React Router; the popup
   * wrapper re-points the popup at the new SKU.
   */
  onPickSku: (picked: { skuCode: string; skuId: string }) => void;
  mode: ViewMode;
  activeTab: InquiryTab | null;
  scope: NeighborScope;
  onModeChange: (mode: ViewMode) => void;
  onActiveTabChange: (tab: InquiryTab | null) => void;
  onScopeChange: (scope: NeighborScope) => void;
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
  onPickSku,
  mode,
  activeTab,
  scope,
  onModeChange,
  onActiveTabChange,
  onScopeChange,
}) => {
  const [lookupOpen, setLookupOpen] = React.useState(!skuCode);
  const [navLoading, setNavLoading] = React.useState(false);
  const prevSkuCodeRef = React.useRef(skuCode);

  React.useEffect(() => {
    if (prevSkuCodeRef.current === skuCode) return;
    prevSkuCodeRef.current = skuCode;
    setLookupOpen(!skuCode);
    if (!skuCode) onActiveTabChange(null);
  }, [skuCode, onActiveTabChange]);

  const { data, isLoading, error } = useInquiryData(skuCode, storeId);

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
          message.info(`No ${direction === 'next' ? 'next' : 'previous'} SKU in ${scopeLabel(scope)}.`);
          return;
        }
        onPickSku({ skuCode: sku, skuId: sku });
      } catch (err) {
        message.error((err as Error).message);
      } finally {
        setNavLoading(false);
      }
    },
    [skuCode, scope, onPickSku],
  );

  if (!skuCode) {
    return (
      <>
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Button type="primary" icon={<SearchOutlined />} onClick={() => setLookupOpen(true)}>
            Pick a SKU
          </Button>
        </div>
        <SkuLookup
          open={lookupOpen}
          onClose={() => setLookupOpen(false)}
          onSelect={handleLookupSelect}
        />
      </>
    );
  }

  if (isLoading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }} role="status" aria-label="Loading inquiry">
        <Spin size="large" />
        <div style={{ marginTop: 12, color: '#888' }}>Loading {skuCode}…</div>
      </div>
    );
  }
  if (error) return <Alert type="error" message={(error as Error).message} />;
  if (!data) return null;

  const gridKey = GRID_KEY_BY_MODE[mode];
  const grid = gridKey ? data.grids[gridKey] : undefined;

  return (
    <div style={{ fontSize: 12 }}>
      <SkuLookup
        open={lookupOpen}
        onClose={() => setLookupOpen(false)}
        onSelect={handleLookupSelect}
        initialQuery={skuCode}
      />

      {/* Top row: Header (left) | Pricing + Rollup + Picture (right) */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <div style={{ marginBottom: 4 }}>
            <Button size="small" icon={<SearchOutlined />} onClick={() => setLookupOpen(true)}>
              SKU Lookup
            </Button>
          </div>
          <HeaderCard inquiry={data} storeId={storeId} />
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

      {/* Extended-attribute badge strip — one pill per dim (buyer, company, cadena, descuento). */}
      <AttributeBadgeStrip skuCode={data.sku} />

      {/* View-mode selector */}
      <div style={{ marginBottom: 4 }}>
        <ViewModeSelector value={mode} onChange={onModeChange} />
      </div>

      {/* Size grid caption + body */}
      <div style={{ margin: '4px 0' }}>
        <div style={{ background: '#e6f0ff', padding: '2px 8px', fontWeight: 600, borderBottom: '1px solid #ccd8ea' }}>
          {gridCaptionFor(mode)}
        </div>
        {grid
          ? <SizeGridComponent grid={grid} />
          : <em style={{ color: '#999', padding: 8, display: 'block' }}>No data for this view mode.</em>}
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
        <div style={{ marginTop: 8 }}>
          {activeTab === 'UPCS' && <UpcsTab skuCode={data.sku} />}
          {activeTab === 'INFO' && data.info && <InfoTab info={data.info} />}
          {activeTab === 'DETAIL' && (
            <DetailTab skuCode={data.sku} description={data.description} storeId={storeId} />
          )}
          {activeTab === 'POS' && <PosTab />}
          {activeTab === 'TREND' && <TrendTab />}
        </div>
      )}
    </div>
  );
};

function scopeLabel(scope: NeighborScope): string {
  if (scope === 'vendor')   return 'the same vendor';
  if (scope === 'category') return 'the same category';
  return 'the catalog';
}

function gridCaptionFor(mode: ViewMode): string {
  switch (mode) {
    case 'ON_HAND':            return 'On Hand';
    case 'ON_ORDER_CURRENT':   return 'On Order (At-Once)';
    case 'ON_ORDER_FUTURE':    return 'On Order (Future)';
    case 'MODEL':              return 'Model Quantities';
    case 'SHORT':              return 'Short Quantities';
    case 'MTD_SALES':          return 'Month-to-Date Sales';
    case 'STD_SALES':          return 'Season-to-Date Sales';
    case 'YTD_SALES':          return 'Year-To-Date Sales';
    case 'LY_SALES':           return 'Last Year Sales';
    case 'SINGLE_COLUMN':      return 'Column Only';
    case 'ALL_STORES_ON_HAND': return 'All Stores - On Hand';
    case 'ALL_STORES_ONE_ROW': return 'All Stores - 1 Row';
    case 'ALL_STORES_SUMMARY': return 'All stores - Summary';
    case 'MAX':                return 'Max Quantities';
    case 'REORDER':            return 'Reorder Quantities';
    default:                   return '';
  }
}
