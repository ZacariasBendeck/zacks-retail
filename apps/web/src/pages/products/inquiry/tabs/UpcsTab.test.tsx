import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./upcsApi', () => ({
  fetchSkuUpcs: vi.fn().mockResolvedValue([
    { upc: '012345678901', columnLabel: '8', rowLabel: null, source: 'VENDOR_GMAIC' },
  ]),
}));

import { UpcsTab } from './UpcsTab';

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UpcsTab skuCode="ZN02-NDPT" />
    </QueryClientProvider>
  );
}

describe('UpcsTab', () => {
  it('renders UPCs for the SKU', async () => {
    renderTab();
    expect(await screen.findByText('012345678901')).toBeInTheDocument();
  });
});
