import React from 'react';
import { Empty } from 'antd';
import type { SizeGrid as SizeGridData } from './types';

// Compact size-grid renderer. RICS shows these with very tight cell padding
// so ~10 stores × 6 size columns fit in a single screen without horizontal
// scroll. AntD's `<Table size="small">` defaults to ~8px side padding which
// wastes width; we use a plain `<table>` with 2-3px padding instead.

function formatCell(value: number | null, nullDisplay: string): string {
  if (value === null || value === undefined) return nullDisplay;
  return new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

const headRow: React.CSSProperties = {
  background: '#bfdbfe',
  borderBottom: '2px solid #2563eb',
};

const thLabel: React.CSSProperties = {
  textAlign: 'left',
  padding: '2px 6px',
  fontWeight: 700,
  fontSize: 11,
  color: '#0f172a',
  background: '#bfdbfe',
  borderBottom: '2px solid #2563eb',
  whiteSpace: 'nowrap',
};

const thCol: React.CSSProperties = {
  textAlign: 'right',
  padding: '2px 4px',
  fontWeight: 700,
  fontSize: 11,
  color: '#0f172a',
  background: '#bfdbfe',
  borderBottom: '2px solid #2563eb',
  minWidth: 28,
};

const tdLabel: React.CSSProperties = {
  textAlign: 'left',
  padding: '1px 6px',
  fontWeight: 500,
  fontSize: 12,
  whiteSpace: 'nowrap',
  borderBottom: '1px solid #f0f0f0',
};

const tdCell: React.CSSProperties = {
  textAlign: 'right',
  padding: '1px 4px',
  fontSize: 12,
  borderBottom: '1px solid #f0f0f0',
  minWidth: 28,
};

function isTotalRow(label: string): boolean {
  return label.trim().toLowerCase() === 'total';
}

function rowBackground(label: string, rowIndex: number): string {
  if (isTotalRow(label)) return '#bfdbfe';
  return rowIndex % 2 === 0 ? '#ffffff' : '#dbeafe';
}

export interface SizeGridProps {
  grid: SizeGridData;
  nullDisplay?: string;
}

export const SizeGrid: React.FC<SizeGridProps> = ({ grid, nullDisplay = '—' }) => {
  if (grid.rows.length === 0 || grid.columns.length === 0) {
    return <Empty description="No data" />;
  }

  return (
    <>
      {grid.caption && <div style={{ marginBottom: 4, fontSize: 12 }}>{grid.caption}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: 'max-content', minWidth: '100%' }}>
          <thead>
            <tr style={headRow}>
              <th scope="col" style={thLabel}></th>
              {grid.columns.map((col, idx) => (
                <th key={`col-${idx}`} scope="col" style={thCol}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, rIdx) => {
              const fill = rowBackground(row.label, rIdx);
              const totalRow = isTotalRow(row.label);
              return (
                <tr key={`row-${rIdx}`} style={{ background: fill }}>
                  <th
                    scope="row"
                    style={{
                      ...tdLabel,
                      background: fill,
                      fontWeight: totalRow ? 600 : 500,
                      borderTop: totalRow ? '1px solid #60a5fa' : tdLabel.borderBottom,
                    }}
                  >
                    {row.label}
                  </th>
                  {grid.columns.map((_, cIdx) => (
                    <td
                      key={`cell-${rIdx}-${cIdx}`}
                      style={{
                        ...tdCell,
                        background: fill,
                        fontWeight: totalRow ? 600 : 400,
                        borderTop: totalRow ? '1px solid #60a5fa' : tdCell.borderBottom,
                      }}
                    >
                      {formatCell(row.cells[cIdx]?.value ?? null, nullDisplay)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};
