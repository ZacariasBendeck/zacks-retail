import React from 'react';
import type { InquiryRollup } from '../../../types/inventoryInquiry';

// Compact rollup grid mirroring the RICS inquiry panel: plain <table>
// with small fonts and tight padding. AntD Table was overkill for a
// fixed 4×4 grid and bloated the vertical footprint.

const fmtQty = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtMoney = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PERIODS: Array<{ key: keyof InquiryRollup; label: string }> = [
  { key: 'week',   label: 'Week' },
  { key: 'month',  label: 'Month' },
  { key: 'season', label: 'Season' },
  { key: 'year',   label: 'Year' },
];

const th: React.CSSProperties = {
  textAlign: 'right',
  padding: '1px 6px',
  color: '#666',
  fontWeight: 500,
  borderBottom: '1px solid #ddd',
};
const td: React.CSSProperties = {
  textAlign: 'right',
  padding: '1px 6px',
  minWidth: 60,
};

export const SalesRollupStrip: React.FC<{ rollup: InquiryRollup }> = ({ rollup }) => (
  <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
    <thead>
      <tr>
        <th scope="col" style={{ ...th, textAlign: 'left' }}>Sales</th>
        <th scope="col" style={th}>Qty</th>
        <th scope="col" style={th}>Net</th>
        <th scope="col" style={th}>Markdown</th>
        <th scope="col" style={th}>Profit</th>
      </tr>
    </thead>
    <tbody>
      {PERIODS.map(({ key, label }) => {
        const cell = rollup[key];
        return (
          <tr key={key}>
            {/* role "cell" (plain <td>) not "rowheader" — test asserts getByRole('cell', …) */}
            <td style={{ ...td, textAlign: 'left', color: '#666', fontWeight: 500 }}>{label}</td>
            <td style={td}>{fmtQty.format(cell.qty)}</td>
            <td style={td}>{fmtMoney.format(cell.net)}</td>
            <td style={td}>{fmtMoney.format(cell.markdown)}</td>
            <td style={td}>{fmtMoney.format(cell.profit)}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);
