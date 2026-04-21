import React from 'react';
import { Space, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { SkuChangeLedger } from '../../../../components/SkuChangeLedger';

// RICS Ch. 2 p. 55 / Ch. 4 p. 72 — Inventory Inquiry [Detail] button.
// Presentation lives in the shared SkuChangeLedger so the standalone route
// /inventory/change-detail/:sku renders the same view.

export const DetailTab: React.FC<{ skuCode: string; description?: string | null }> = ({
  skuCode,
  description,
}) => {
  return (
    <Space direction="vertical" size="small" style={{ width: '100%' }}>
      <Typography.Text type="secondary">
        Every PO receipt, transfer, return, and physical adjustment for this SKU across all stores.{' '}
        <Link to={`/inventory/change-detail/${encodeURIComponent(skuCode)}`}>
          Open in full page →
        </Link>
      </Typography.Text>
      <SkuChangeLedger skuCode={skuCode} description={description} />
    </Space>
  );
};
