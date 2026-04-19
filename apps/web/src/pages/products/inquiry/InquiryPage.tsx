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

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Button icon={<SearchOutlined />} onClick={() => setLookupOpen(true)}>
          SKU Lookup
        </Button>
      </div>
      <SkuLookup
        open={lookupOpen}
        onClose={() => setLookupOpen(false)}
        onSelect={goToSku}
        initialQuery={skuCode}
      />
      <HeaderCard inquiry={data} />
      <PicturePanel pictureUrl={data.pictureUrl} alt={data.sku} />
      <PricingPanel pricing={data.pricing} />
      <SalesRollupStrip rollup={data.rollup} />
      <ViewModeSelector value={mode} onChange={setMode} />
      {(() => {
        const gridKey = GRID_KEY_BY_MODE[mode];
        const grid = gridKey ? data.grids[gridKey] : undefined;
        return grid
          ? <SizeGridComponent grid={grid} />
          : <em>No data for this view mode.</em>;
      })()}
      <ActionBar activeTab={activeTab} onTab={setActiveTab} onPrev={onPrev} onNext={onNext} onClear={onClear} />
      {activeTab === 'UPCS' && <UpcsTab skuCode={data.sku} />}
      {activeTab === 'INFO' && data.info && <InfoTab info={data.info} />}
      {activeTab === 'DETAIL' && <DetailTab skuCode={data.sku} />}
      {activeTab === 'POS' && <PosTab />}
      {activeTab === 'TREND' && <TrendTab />}
    </div>
  );
};
