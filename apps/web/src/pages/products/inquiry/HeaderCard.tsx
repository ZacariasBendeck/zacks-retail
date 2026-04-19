import React from 'react';
import { Descriptions } from 'antd';
import type { InventoryInquiry } from '../../../types/inventoryInquiry';

export const HeaderCard: React.FC<{ inquiry: InventoryInquiry }> = ({ inquiry }) => (
  <Descriptions title={inquiry.sku} size="small" column={2} bordered>
    <Descriptions.Item label="Description">{inquiry.description}</Descriptions.Item>
    <Descriptions.Item label="Category">
      {inquiry.category?.id} {inquiry.category?.name}
    </Descriptions.Item>
    <Descriptions.Item label="Vendor">
      {inquiry.vendor?.code} {inquiry.vendor?.name}
    </Descriptions.Item>
    <Descriptions.Item label="Vendor SKU">{inquiry.vendorSku ?? '—'}</Descriptions.Item>
    <Descriptions.Item label="Style/Color">{inquiry.styleColor ?? '—'}</Descriptions.Item>
    <Descriptions.Item label="Size Type">
      {inquiry.sizeType?.id} {inquiry.sizeType?.name}
    </Descriptions.Item>
    <Descriptions.Item label="Last Received">{inquiry.lastReceivedAt ?? '—'}</Descriptions.Item>
  </Descriptions>
);
