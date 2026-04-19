import React from 'react';
import { Alert, Spin } from 'antd';
import { useParams, useSearchParams } from 'react-router-dom';
import { HeaderCard } from './HeaderCard';
import { PicturePanel } from './PicturePanel';
import { PricingPanel } from './PricingPanel';
import { SalesRollupStrip } from './SalesRollupStrip';
import { useInquiryData } from './useInquiryData';

export const InquiryPage: React.FC = () => {
  const { skuCode = '' } = useParams<{ skuCode: string }>();
  const [params] = useSearchParams();
  const storeIdRaw = params.get('storeId');
  const storeId = storeIdRaw ? Number(storeIdRaw) : undefined;

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
      {/* ViewModeSelector, ActionBar, tabs wired in following tasks */}
    </div>
  );
};
