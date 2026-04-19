import React from 'react';
import type { InquiryPricing, PriceSlot } from '../../../types/inventoryInquiry';

const money = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyNoDecimals = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const ROWS: Array<{ label: string; key: keyof InquiryPricing; slot?: PriceSlot; formatter?: Intl.NumberFormat }> = [
  { label: 'Retail Price',  key: 'retail',      slot: 'RETAIL',    formatter: money },
  { label: 'Markdown 1',    key: 'markdown1',   slot: 'MARKDOWN1', formatter: money },
  { label: 'Markdown 2',    key: 'markdown2',   slot: 'MARKDOWN2', formatter: money },
  { label: 'Average Cost',  key: 'avgCost',                        formatter: money },
  { label: 'Current Cost',  key: 'currentCost',                    formatter: money },
  { label: 'List Price',    key: 'listPrice',   slot: 'LIST',      formatter: moneyNoDecimals },
];

export const PricingPanel: React.FC<{ pricing: InquiryPricing }> = ({ pricing }) => (
  <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
    <tbody>
      {ROWS.map(({ label, key, slot, formatter }) => {
        const isCurrent = slot !== undefined && pricing.currentSlot === slot;
        const fmt = formatter ?? money;
        return (
          <tr
            key={key}
            data-current={isCurrent ? 'true' : undefined}
            style={{ fontWeight: isCurrent ? 600 : 400 }}
          >
            <th style={{ textAlign: 'right', padding: '1px 8px 1px 0', color: '#666', fontWeight: 500 }}>{label}</th>
            <td style={{ textAlign: 'right', padding: '1px 4px', minWidth: 70 }}>{fmt.format(pricing[key] as number)}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);
