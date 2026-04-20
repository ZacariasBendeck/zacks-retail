import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { InquiryBody } from './InquiryBody';

/**
 * Route-level host for the Inventory Inquiry at `/products/inquiry/:skuCode`.
 *
 * Thin wrapper — reads the SKU and `storeId` query param from the URL and
 * hands them to the shared `<InquiryBody>` which is the same view rendered
 * by the app-wide inquiry popup triggered from `<SkuLink>`.
 */
export const InquiryPage: React.FC = () => {
  const { skuCode = '' } = useParams<{ skuCode: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const storeIdRaw = params.get('storeId');
  const storeId = storeIdRaw ? Number(storeIdRaw) : undefined;

  const onPickSku = (picked: { skuCode: string }) => {
    const nextParams = new URLSearchParams(params);
    const qs = nextParams.toString();
    navigate(`/products/inquiry/${encodeURIComponent(picked.skuCode)}${qs ? `?${qs}` : ''}`);
  };

  return <InquiryBody skuCode={skuCode} storeId={storeId} onPickSku={onPickSku} />;
};
