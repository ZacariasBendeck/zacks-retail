import React from 'react';
import { Alert, Spin } from 'antd';
import { useParams, useSearchParams } from 'react-router-dom';
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
      <header>
        <h1>{data.sku}</h1>
        <p>{data.description}</p>
      </header>
      {/* Header, Pricing, Rollup, Picture, ViewModeSelector, ActionBar, tabs wired in following tasks */}
    </div>
  );
};
