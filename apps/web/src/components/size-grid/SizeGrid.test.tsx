import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SizeGrid } from './SizeGrid';

describe('SizeGrid', () => {
  const grid = {
    columns: ['6', '7', '8', 'TOT'],
    rows: [
      { label: 'On Hand', cells: [{ value: 8 }, { value: 7 }, { value: null }, { value: 15 }] },
      { label: 'Model',   cells: [{ value: 2 }, { value: 2 }, { value: 2 }, { value: 6 }] },
    ],
  };

  it('renders column headers', () => {
    render(<SizeGrid grid={grid} />);
    expect(screen.getByRole('columnheader', { name: '6' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'TOT' })).toBeInTheDocument();
  });

  it('renders each metric row with values (null → dash)', () => {
    render(<SizeGrid grid={grid} />);
    const onHand = screen.getByRole('row', { name: /On Hand/ });
    expect(within(onHand).getByText('8')).toBeInTheDocument();
    expect(within(onHand).getByText('—')).toBeInTheDocument(); // null cell
  });

  it('renders empty-state when grid has no rows', () => {
    render(<SizeGrid grid={{ columns: [], rows: [] }} />);
    // AntD Empty renders "No data" in both an SVG <title> and the description div;
    // use getAllByText to handle multiple matches.
    expect(screen.getAllByText(/no data/i).length).toBeGreaterThanOrEqual(2);
  });

  it('accepts an optional total scalar without throwing', () => {
    render(<SizeGrid grid={{ columns: ['6'], rows: [{ label: 'On Hand', cells: [{ value: 1 }] }], total: 42 }} />);
    // Not rendered today — this just confirms the optional field is accepted.
    expect(screen.getByRole('columnheader', { name: '6' })).toBeInTheDocument();
  });

  it('can render null cells as blanks for summary-style grids', () => {
    render(
      <SizeGrid
        grid={{ columns: ['6'], rows: [{ label: 'On Hand', cells: [{ value: null }] }] }}
        nullDisplay=""
      />
    );
    const row = screen.getByRole('row', { name: /On Hand/ });
    expect(within(row).getByRole('cell')).toHaveTextContent('');
  });
});
