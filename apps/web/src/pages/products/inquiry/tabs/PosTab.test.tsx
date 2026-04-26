import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/ricsInventoryApi', () => ({
  fetchInquiryOpenPos: vi.fn().mockResolvedValue({
    rows: [
      {
        poNumber: 'PO-1001',
        storeId: 22,
        orderClass: 'AT_ONCE',
        dueDate: '2026-04-25T00:00:00.000Z',
        rowLabel: 'M',
        columnLabel: '8',
        orderedQty: 6,
        receivedQty: 2,
        openQty: 4,
      },
    ],
    total: 1,
  }),
}));

import { PosTab } from './PosTab';

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PosTab skuCode="BG211-55-BGPU" storeId={22} />
    </QueryClientProvider>
  );
}

describe('PosTab', () => {
  it('renders open purchase order lines for the SKU', async () => {
    renderTab();
    expect(await screen.findByText('PO-1001')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});
