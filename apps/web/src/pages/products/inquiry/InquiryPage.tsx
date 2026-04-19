import React from 'react';
import { Alert, Button, Empty, Space, Spin } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { HeaderCard } from './HeaderCard';
import { PicturePanel } from './PicturePanel';
import { PricingPanel } from './PricingPanel';
import { SalesRollupStrip } from './SalesRollupStrip';
import { ViewModeSelector, type ViewMode } from './ViewModeSelector';
import { ActionBar, type InquiryTab } from './ActionBar';
import { useInquiryData } from './useInquiryData';
import { SizeGrid as SizeGridComponent } from '../../../components/size-grid';
import { SkuLookup } from '../../../components/sku-lookup';
import type { InquiryGrids } from '../../../types/inventoryInquiry';
import { UpcsTab } from './tabs/UpcsTab';
import { InfoTab } from './tabs/InfoTab';
import { DetailTab } from './tabs/DetailTab';
import { PosTab } from './tabs/PosTab';
import { TrendTab } from './tabs/TrendTab';

const GRID_KEY_BY_MODE: Partial<Record<ViewMode, keyof InquiryGrids>> = {
  ON_HAND:            'onHand',
  MODEL:              'model',
  SHORT:              'short',
  MAX:                'max',
  REORDER:            'reorder',
  ALL_STORES_ON_HAND: 'allStoresOnHand',
  ALL_STORES_SUMMARY: 'allStoresSummary',
};

export const InquiryPage: React.FC = () => {
  const { skuCode = '' } = useParams<{ skuCode: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const storeIdRaw = params.get('storeId');
  const storeId = storeIdRaw ? Number(storeIdRaw) : undefined;
  const mode = (params.get('mode') as ViewMode) || 'ALL_STORES_SUMMARY';
  const setMode = (next: ViewMode) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('mode', next);
    setParams(nextParams, { replace: true });
  };
  const [activeTab, setActiveTab] = React.useState<InquiryTab | null>(null);
  const [lookupOpen, setLookupOpen] = React.useState(!skuCode);

  React.useEffect(() => {
    setLookupOpen(!skuCode);
  }, [skuCode]);

  const onPrev = () => {};
  const onNext = () => {};
  const onClear = () => setActiveTab(null);

  const goToSku = (picked: { skuCode: string }) => {
    const nextParams = new URLSearchParams(params);
    const qs = nextParams.toString();
    navigate(`/products/inquiry/${encodeURIComponent(picked.skuCode)}${qs ? `?${qs}` : ''}`);
  };

  const { data, isLoading, error } = useInquiryData(skuCode, storeId);

  // No SKU in URL — render a landing card and auto-open the lookup.
  if (!skuCode) {
    return (
      <>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Pick a SKU to open Inventory Inquiry"
        >
          <Space>
            <Button type="primary" icon={<SearchOutlined />} onClick={() => setLookupOpen(true)}>
              SKU Lookup
            </Button>
          </Space>
        </Empty>
        <SkuLookup
          open={lookupOpen}
          onClose={() => setLookupOpen(false)}
          onSelect={goToSku}
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
        onSelect={goToSku}
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
          <HeaderCard inquiry={data} />
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

      {/* View-mode selector (compact) */}
      <div style={{ marginBottom: 4 }}>
        <ViewModeSelector value={mode} onChange={setMode} />
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
        <ActionBar activeTab={activeTab} onTab={setActiveTab} onPrev={onPrev} onNext={onNext} onClear={onClear} />
      </div>

      {/* Active tab panel */}
      {activeTab && (
        <div style={{ marginTop: 8 }}>
          {activeTab === 'UPCS' && <UpcsTab skuCode={data.sku} />}
          {activeTab === 'INFO' && data.info && <InfoTab info={data.info} />}
          {activeTab === 'DETAIL' && <DetailTab skuCode={data.sku} />}
          {activeTab === 'POS' && <PosTab />}
          {activeTab === 'TREND' && <TrendTab />}
        </div>
      )}
    </div>
  );
};

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
