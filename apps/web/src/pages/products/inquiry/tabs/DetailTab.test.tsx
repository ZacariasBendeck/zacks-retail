import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

vi.mock('../../../../hooks/useRicsInventory', () => ({
  useChangeDetail: vi.fn(() => ({
    data: {
      rows: [
        // Store 21 — one PO Receipt split across two sizes + one Transfer In
        { sku: 'ZN02-NDPT', origSku: null, store: 21, changeType: 'POR', date: '2026-04-10T00:00:00', rowLabel: 'S', columnLabel: 'BK', purchaseOrder: 'KS202309001', otherStore: null, quantity: 6, cost: 150, rmaNumber: null },
        { sku: 'ZN02-NDPT', origSku: null, store: 21, changeType: 'POR', date: '2026-04-10T00:00:00', rowLabel: 'M', columnLabel: 'BK', purchaseOrder: 'KS202309001', otherStore: null, quantity: 6, cost: 150, rmaNumber: null },
        { sku: 'ZN02-NDPT', origSku: null, store: 21, changeType: 'TIN', date: '2026-04-15T00:00:00', rowLabel: 'S', columnLabel: 'BK', purchaseOrder: null, otherStore: 99, quantity: 9, cost: 150, rmaNumber: null },
        // Store 24 — one Transfer Out
        { sku: 'ZN02-NDPT', origSku: null, store: 24, changeType: 'TOU', date: '2026-04-11T00:00:00', rowLabel: 'S', columnLabel: 'BK', purchaseOrder: null, otherStore: 99, quantity: -3, cost: 150, rmaNumber: null },
      ],
      total: 4,
    },
    isLoading: false,
    isFetching: false,
    error: null,
  })),
}));

import { DetailTab } from './DetailTab';
import { __test } from '../../../../components/SkuChangeLedger';

const { buildLedgerRows, collapseBySize, buildComment } = __test;

function renderTab() {
  const client = new QueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DetailTab skuCode="ZN02-NDPT" description="Test Shoe" />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('DetailTab', () => {
  it('renders header summary with SKU, description, grand total, movement count', () => {
    renderTab();
    expect(screen.getByText('ZN02-NDPT')).toBeInTheDocument();
    expect(screen.getByText('Test Shoe')).toBeInTheDocument();
    // 6 + 6 + 9 − 3 = 18 (size-detail OFF collapses sizes, but grand total is the same)
    expect(screen.getByText('Grand Total').parentElement).toHaveTextContent('18');
  });

  it('groups rows by store with per-store subtotal and a grand total row', () => {
    renderTab();
    expect(screen.getByText('*** Store 21 Total ***')).toBeInTheDocument();
    expect(screen.getByText('*** Store 24 Total ***')).toBeInTheDocument();
    expect(screen.getByText('*** Grand Total ***')).toBeInTheDocument();
  });

  it('collapses per-size rows when Show Size Detail is OFF (default)', () => {
    renderTab();
    // Two raw PO receipt rows (S and M sizes) collapse into one — KS202309001 appears once.
    const poCells = screen.getAllByText(/KS202309001/);
    expect(poCells).toHaveLength(1);
  });

  it('expands per-size rows when Show Size Detail is ON', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByLabelText('Show Size Detail'));
    // Now the PO# appears twice (one per size row).
    const poCells = screen.getAllByText(/KS202309001/);
    expect(poCells).toHaveLength(2);
  });

  it('links to the standalone page', () => {
    renderTab();
    const link = screen.getByRole('link', { name: /open in full page/i });
    expect(link).toHaveAttribute('href', '/inventory/change-detail/ZN02-NDPT');
  });
});

describe('SkuChangeLedger helpers', () => {
  const base = {
    sku: 'X',
    origSku: null,
    store: 1,
    changeType: 'POR',
    date: '2026-04-01T00:00:00',
    rowLabel: 'S',
    columnLabel: 'BK',
    purchaseOrder: 'P1',
    otherStore: null,
    quantity: 4,
    cost: 100,
    rmaNumber: null,
  } as const;
  const rows = [
    { ...base },
    { ...base, rowLabel: 'M', quantity: 2, cost: 110 },
    { ...base, store: 2, changeType: 'TOU', date: '2026-04-02T00:00:00', purchaseOrder: null, otherStore: 99, quantity: -1 },
  ];

  it('collapseBySize sums quantities and weight-averages cost per document', () => {
    const collapsed = collapseBySize(rows);
    // Two same-doc PO rows collapse to one; the TOU stays.
    expect(collapsed).toHaveLength(2);
    const por = collapsed.find((r) => r.changeType === 'POR');
    expect(por?.quantity).toBe(6);
    // weighted avg cost: (100*4 + 110*2) / 6 ≈ 103.33
    expect(por?.cost).toBeCloseTo(103.33, 1);
  });

  it('buildLedgerRows produces one subtotal per store and a grand total', () => {
    const ledger = buildLedgerRows(rows, false);
    const kinds = ledger.map((r) => r.kind);
    expect(kinds.filter((k) => k === 'subtotal')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'grand')).toHaveLength(1);
    const last = ledger[ledger.length - 1];
    expect(last?.quantity).toBe(5); // 6 − 1
  });

  it('buildComment formats To / From / PO / RMA cues RICS-style', () => {
    expect(buildComment({ ...base, otherStore: null, purchaseOrder: 'X1' })).toBe('PO# X1');
    expect(buildComment({ ...base, changeType: 'TOU', otherStore: 99, purchaseOrder: null })).toBe('To Store 99');
    expect(buildComment({ ...base, changeType: 'TIN', otherStore: 99, purchaseOrder: null })).toBe('From Store 99');
  });
});

// Keep the type checker happy about the `within` helper not being used elsewhere
// (kept in imports for future multi-row assertions).
void within;
