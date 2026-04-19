import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../hooks/useRicsInventory', () => ({
  useChangeDetail: vi.fn(() => ({
    data: {
      rows: [
        {
          sku: 'ZN02-NDPT',
          origSku: null,
          store: 1,
          changeType: 'POR',
          date: '2026-04-10T00:00:00',
          rowLabel: 'S',
          columnLabel: 'BK',
          purchaseOrder: 'PO#123',
          otherStore: null,
          quantity: 12,
          cost: 150,
          rmaNumber: null,
        },
        {
          sku: 'ZN02-NDPT',
          origSku: null,
          store: 1,
          changeType: 'RET',
          date: '2026-04-15T00:00:00',
          rowLabel: 'M',
          columnLabel: 'BK',
          purchaseOrder: null,
          otherStore: null,
          quantity: -1,
          cost: 150,
          rmaNumber: 'RMA#555',
        },
      ],
      total: 2,
    },
    isLoading: false,
    error: null,
  })),
}));

import { DetailTab } from './DetailTab';

describe('DetailTab', () => {
  it('renders each movement row', () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <DetailTab skuCode="ZN02-NDPT" />
      </QueryClientProvider>
    );
    expect(screen.getByText('PO#123')).toBeInTheDocument();
    expect(screen.getByText('RMA#555')).toBeInTheDocument();
  });

  it('shows POR and RET change types', () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <DetailTab skuCode="ZN02-NDPT" />
      </QueryClientProvider>
    );
    expect(screen.getByText('POR')).toBeInTheDocument();
    expect(screen.getByText('RET')).toBeInTheDocument();
  });
});
