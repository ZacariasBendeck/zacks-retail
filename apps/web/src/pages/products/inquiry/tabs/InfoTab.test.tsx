import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/ricsInventoryApi', () => ({
  fetchInquiryInfo: vi.fn().mockResolvedValue({
    scopeLabel: 'ALL stores',
    seasonCode: 'A',
    seasonDescription: 'NAV 25',
    labelCode: 'H',
    groupCode: 'IBL',
    groupDescription: 'Inversiones Benlow',
    firstReceivedAt: '2025-11-24T00:00:00.000Z',
    lastMarkdownAt: '2025-11-24T00:00:00.000Z',
    perks: 0,
    keywords: 'IBL ZB C2528 2D50 10 MAGI FASH',
    comment: null,
    prior12Months: [
      { label: 'April', qty: 0, sales: 0 },
      { label: 'November', qty: 10, sales: 6926.51 },
    ],
    totals: { qty: 123, sales: 88565.98 },
    metrics: {
      mtd: { gpPct: null, roi: null, turns: 0 },
      std: { gpPct: null, roi: null, turns: 0 },
      ytd: { gpPct: 66.5, roi: 802, turns: 4 },
    },
  }),
}));

import { InfoTab } from './InfoTab';

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InfoTab skuCode="BG211-55-BGPU" onClose={() => {}} />
    </QueryClientProvider>
  );
}

describe('InfoTab', () => {
  it('renders the inquiry info popup with sales history and metric rows', async () => {
    renderTab();
    expect(await screen.findByText(/Information for SKU BG211-55-BGPU for ALL stores/i)).toBeInTheDocument();
    expect(screen.getByText('A - NAV 25')).toBeInTheDocument();
    expect(screen.getByText('IBL - Inversiones Benlow')).toBeInTheDocument();
    expect(screen.getByText('Prior 12 Months Sales')).toBeInTheDocument();
    expect(screen.getByText('November')).toBeInTheDocument();
    expect(screen.getByText('66.5')).toBeInTheDocument();
    expect(screen.getByText('802')).toBeInTheDocument();
  });
});
