import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SalesRollupStrip } from './SalesRollupStrip';

const rollup = {
  week:   { qty: 0,  net: 0,        markdown: 0,        profit: 0 },
  month:  { qty: 0,  net: 0,        markdown: 0,        profit: 0 },
  season: { qty: 0,  net: 0,        markdown: 0,        profit: 0 },
  year:   { qty: 14, net: 7317.42, markdown: 1995.66, profit: 3933.79 },
};

describe('SalesRollupStrip', () => {
  it('renders the four periods × four measures grid', () => {
    render(<SalesRollupStrip rollup={rollup} />);
    ['Qty', 'Net', 'Markdown', 'Profit'].forEach((col) =>
      expect(screen.getByRole('columnheader', { name: col })).toBeInTheDocument()
    );
    ['Week', 'Month', 'Season', 'Year'].forEach((row) =>
      expect(screen.getByRole('cell', { name: row })).toBeInTheDocument()
    );
  });

  it('formats values with thousands separators and no currency symbol', () => {
    render(<SalesRollupStrip rollup={rollup} />);
    const yearRow = screen.getByRole('row', { name: /Year/ });
    expect(within(yearRow).getByText('14')).toBeInTheDocument();
    expect(within(yearRow).getByText('7,317.42')).toBeInTheDocument();
  });
});
