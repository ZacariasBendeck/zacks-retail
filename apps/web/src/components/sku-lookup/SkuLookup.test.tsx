import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SkuLookup } from './SkuLookup';

vi.mock('../../services/skuApi', () => ({
  searchSkusForLookup: vi.fn(),
  SkuApiError: class extends Error {},
}));

import * as skuApi from '../../services/skuApi';

function renderLookup(onSelect = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ConfigProvider>
          <SkuLookup open={true} onClose={() => {}} onSelect={onSelect} />
        </ConfigProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return onSelect;
}

describe('SkuLookup', () => {
  beforeEach(() => {
    vi.mocked(skuApi.searchSkusForLookup).mockResolvedValue({
      rows: [
        { skuId: 'A1', skuCode: 'A1', description: 'Widget', vendor: 'ACME', category: '10', styleColor: null, currentPrice: 9.99 },
        { skuId: 'A2', skuCode: 'A2', description: 'Gadget', vendor: 'ACME', category: '10', styleColor: null, currentPrice: 19.99 },
      ],
      total: 2,
    });
  });

  it('renders the six-column table from the RICS screenshot', async () => {
    renderLookup();
    await screen.findByText('A1');
    ['SKU', 'Description', 'Vendor', 'Categ.', 'Style/Color', 'Price'].forEach((header) => {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    });
  });

  it('passes descContains filter to the API', async () => {
    renderLookup();
    await screen.findByText('A1');
    await userEvent.type(screen.getByLabelText(/descriptions containing/i), 'wid');
    await userEvent.click(screen.getByRole('button', { name: /go/i }));
    await waitFor(() =>
      expect(skuApi.searchSkusForLookup).toHaveBeenCalledWith(
        expect.objectContaining({ descContains: 'wid' })
      )
    );
  });

  it('calls onSelect when user double-clicks a row', async () => {
    const onSelect = renderLookup();
    await screen.findByText('A1');
    await userEvent.dblClick(screen.getByText('A1'));
    expect(onSelect).toHaveBeenCalledWith({ skuCode: 'A1', skuId: 'A1' });
  });

  it('calls onSelect when user selects a row and clicks Save', async () => {
    const onSelect = renderLookup();
    await screen.findByText('A1');
    await userEvent.click(screen.getByText('A2'));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSelect).toHaveBeenCalledWith({ skuCode: 'A2', skuId: 'A2' });
  });
});
