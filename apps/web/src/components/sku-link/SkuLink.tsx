import React from 'react';
import { Link } from 'react-router-dom';

export interface SkuLinkProps {
  skuCode: string;
  storeId?: number;
  children?: React.ReactNode;
  className?: string;
}

export const SkuLink: React.FC<SkuLinkProps> = ({ skuCode, storeId, children, className }) => {
  const encoded = encodeURIComponent(skuCode);
  const qs = storeId !== undefined ? `?storeId=${storeId}` : '';
  const to = `/products/inquiry/${encoded}${qs}`;
  return (
    <Link to={to} className={className}>
      {children ?? skuCode}
    </Link>
  );
};
