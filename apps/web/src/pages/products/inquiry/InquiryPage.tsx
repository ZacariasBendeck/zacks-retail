import React from 'react';
import { Alert, Spin } from 'antd';
import { useParams, useSearchParams } from 'react-router-dom';
import { HeaderCard } from './HeaderCard';
import { PicturePanel } from './PicturePanel';
import { PricingPanel } from './PricingPanel';
import { SalesRollupStrip } from './SalesRollupStrip';
import { ViewModeSelector, type ViewMode } from './ViewModeSelector';
import { ActionBar, type InquiryTab } from './ActionBar';
import { useInquiryData } from './useInquiryData';
import { SizeGrid as SizeGridComponent } from '../../../components/size-grid';
import type { InquiryGrids } from '../../../types/inventoryInquiry';
import { UpcsTab } from './tabs/UpcsTab';
import { InfoTab } from './tabs/InfoTab';

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
  const storeIdRaw = params.get('storeId');
  const storeId = storeIdRaw ? Number(storeIdRaw) : undefined;
  const mode = (params.get('mode') as ViewMode) || 'ALL_STORES_SUMMARY';
  const setMode = (next: ViewMode) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('mode', next);
    setParams(nextParams, { replace: true });
  };
  const [activeTab, setActiveTab] = React.useState<InquiryTab | null>(null);
  const onPrev = () => {};
  const onNext = () => {};
  const onClear = () => setActiveTab(null);

  const { data, isLoading, error } = useInquiryData(skuCode, storeId);

  if (isLoading) return <Spin role="status" />;
  if (error) return <Alert type="error" message={(error as Error).message} />;
  if (!data) return null;

  return (
    <div>
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
    </div>
  );
};
