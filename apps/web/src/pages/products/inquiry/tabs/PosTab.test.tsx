import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
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
  fetchInquiryPurchaseOrderHistory: vi.fn().mockResolvedValue({
    rows: [
      {
        poNumber: 'PO-1001',
        shipStore: 22,
        vendorCode: 'VEND1',
        buyer: 'BUYER',
        orderDate: '2026-04-01T00:00:00.000Z',
        dueDate: '2026-04-25T00:00:00.000Z',
        lastReceivedAt: '2026-04-20T00:00:00.000Z',
        orderType: 'AT_ONCE',
        legacyStatus: 'OPEN',
        current: true,
        orderedQty: 6,
        receivedQty: 2,
        openQty: 4,
        lineCount: 1,
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
      <MemoryRouter>
        <PosTab skuCode="BG211-55-BGPU" storeId={22} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PosTab', () => {
  it('renders open purchase order lines for the SKU', async () => {
    renderTab();
    expect(await screen.findAllByText('PO-1001')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'PO-1001' })[0]).toHaveAttribute('href', '/purchasing/legacy-orders/PO-1001');
    expect(await screen.findByText('Purchase Order History')).toBeInTheDocument();
    expect(screen.getAllByText('4').length).toBeGreaterThan(0);
  });
});
