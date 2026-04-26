import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/ricsInventoryApi', () => ({
  fetchInquiryTrend: vi.fn().mockResolvedValue({
    scopeLabel: 'ALL stores',
    columns: [
      { label: '7', availWeek: 32, availPeriod: 59, recTranAdj: null, sales: 1, stWeekly: 3.1, stPeriod: 1.7, periodReset: false },
      { label: 'Current', availWeek: 22, availPeriod: 34, recTranAdj: null, sales: null, stWeekly: null, stPeriod: null, periodReset: false },
    ],
  }),
}));

import { TrendTab } from './TrendTab';

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TrendTab skuCode="BG211-55-BGPU" onClose={() => {}} />
    </QueryClientProvider>
  );
}

describe('TrendTab', () => {
  it('renders the trend popup with weekly and period rows', async () => {
    renderTab();
    expect(await screen.findByText(/Trending for SKU BG211-55-BGPU for ALL stores/i)).toBeInTheDocument();
    expect(screen.getByText('Avail/Week')).toBeInTheDocument();
    expect(screen.getByText('ST%/Period')).toBeInTheDocument();
    expect(screen.getByText('3.1')).toBeInTheDocument();
  });
});
