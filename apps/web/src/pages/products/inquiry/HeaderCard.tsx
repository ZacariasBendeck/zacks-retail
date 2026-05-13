import React from 'react';
import { Button, Space, Tag } from 'antd';
import type { InventoryInquiry } from '../../../types/inventoryInquiry';

// Compact header mirroring the RICS Inventory Inquiry layout:
// a dense label|value grid where the label is right-aligned grey and
// the value column carries the data. Two paired columns per row.

const cellLabel: React.CSSProperties = {
  color: '#666',
  textAlign: 'right',
  padding: '2px 8px 2px 0',
  whiteSpace: 'nowrap',
  fontWeight: 500,
};
const cellValue: React.CSSProperties = {
  padding: '2px 16px 2px 4px',
  borderBottom: '1px solid #eee',
  whiteSpace: 'nowrap',
};

export const HeaderCard: React.FC<{
  inquiry: InventoryInquiry;
  storeId?: number;
  onPickSku?: (picked: { skuCode: string; skuId: string }) => void;
}> = ({
  inquiry,
  storeId,
  onPickSku,
}) => {
  const replacedBy = inquiry.replacementContext?.replacedBy ?? null;
  const supersedes = inquiry.replacementContext?.supersedes ?? [];

  return (
    <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
      <tbody>
        <tr>
          <th style={cellLabel}>SKU</th>
          <td style={cellValue}><strong>{inquiry.sku}</strong></td>
          <th style={cellLabel}>Description</th>
          <td style={cellValue}>{inquiry.description}</td>
        </tr>
        <tr>
          <th style={cellLabel}>Category</th>
          <td style={cellValue}>
            {inquiry.category?.id} {inquiry.category?.name}
          </td>
          <th style={cellLabel}>Vendor</th>
          <td style={cellValue}>
            {inquiry.vendor?.code} {inquiry.vendor?.name}
          </td>
        </tr>
        <tr>
          <th style={cellLabel}>Vendor SKU</th>
          <td style={cellValue}>{inquiry.vendorSku ?? '-'}</td>
          <th style={cellLabel}>Style/Color</th>
          <td style={cellValue}>{inquiry.styleColor ?? '-'}</td>
        </tr>
        <tr>
          <th style={cellLabel}>Size Type</th>
          <td style={cellValue}>
            {inquiry.sizeType?.id} {inquiry.sizeType?.name}
          </td>
          <th style={cellLabel}>Last Received</th>
          <td style={cellValue}>{inquiry.lastReceivedAt ?? '-'}</td>
        </tr>
        <tr>
          <th style={cellLabel}>Store</th>
          <td style={cellValue}>{storeId != null ? `Store ${storeId}` : 'All Stores'}</td>
          <th style={cellLabel}>SKU State</th>
          <td style={cellValue}>
            <Space size={6} wrap>
              <Tag color={statusColor(inquiry.status)} style={{ marginRight: 0 }}>
                {formatStatus(inquiry.status)}
              </Tag>
              {replacedBy ? (
                <Button
                  type="link"
                  size="small"
                  onClick={() => onPickSku?.({
                    skuCode: replacedBy.replacementSkuCode,
                    skuId: replacedBy.replacementSkuId,
                  })}
                  style={{ padding: 0, height: 'auto', lineHeight: 1 }}
                >
                  Replaced by {replacedBy.replacementSkuCode}
                </Button>
              ) : null}
            </Space>
          </td>
        </tr>
        {supersedes.length > 0 ? (
          <tr>
            <th style={cellLabel}>Replaces</th>
            <td colSpan={3} style={{ ...cellValue, whiteSpace: 'normal' }}>
              <Space size={[6, 4]} wrap>
                {supersedes.map((item) => (
                  <Space key={item.id} size={4} wrap>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => onPickSku?.({
                        skuCode: item.oldSkuCode,
                        skuId: item.oldSkuId,
                      })}
                      style={{ padding: 0, height: 'auto', lineHeight: 1 }}
                    >
                      {item.oldSkuCode}
                    </Button>
                    {item.transferDemand ? (
                      <Tag color="blue" style={{ marginRight: 0 }}>
                        demand
                      </Tag>
                    ) : null}
                  </Space>
                ))}
              </Space>
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
};

function formatStatus(status: string | null | undefined): string {
  const normalized = status?.trim().toUpperCase();
  if (!normalized) return 'ACTIVE';
  if (normalized === 'D') return 'DISCONTINUED';
  return normalized;
}

function statusColor(status: string | null | undefined): string {
  const normalized = formatStatus(status);
  if (normalized === 'ACTIVE') return 'green';
  if (normalized === 'DISCONTINUED') return 'red';
  if (normalized === 'DRAFT') return 'gold';
  return 'default';
}
