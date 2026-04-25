import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./useInquiryData', () => ({
  useInquiryData: vi.fn(),
}));

import { useInquiryData } from './useInquiryData';
import { InquiryPage } from './InquiryPage';

function renderPage(initialEntries = ['/products/inquiry/ZN02-NDPT']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/products/inquiry" element={<InquiryPage />} />
          <Route path="/products/inquiry/:skuCode" element={<InquiryPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('InquiryPage', () => {
  it('keeps the empty inquiry landing passive until the user clicks Pick a SKU', async () => {
    (useInquiryData as any).mockReturnValue({ isLoading: false, data: null, error: null });
    renderPage(['/products/inquiry']);
    expect(screen.queryByText(/sku lookup/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /pick a sku/i }));
    expect(screen.getByText(/sku lookup/i)).toBeInTheDocument();
  });

  it('shows a loading state while data is pending', () => {
    (useInquiryData as any).mockReturnValue({ isLoading: true, data: null, error: null });
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error alert when the fetch fails', () => {
    (useInquiryData as any).mockReturnValue({ isLoading: false, data: null, error: new Error('boom') });
    renderPage();
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
  });

  it('renders the selected mode grid', () => {
    (useInquiryData as any).mockReturnValue({
      isLoading: false, error: null,
      data: {
        sku: 'ZN02-NDPT',
        description: '…',
        category: { id: 0, name: '' }, vendor: { code: '', name: '' },
        vendorSku: null, styleColor: null,
        sizeType: { id: 0, name: '', columns: [], rows: [] },
        lastReceivedAt: null,
        pricing: { retail: 0, markdown1: 0, markdown2: 0, avgCost: 0, currentCost: 0, listPrice: 0, currentSlot: 'RETAIL' },
        rollup: { week: {qty:0,net:0,markdown:0,profit:0}, month:{qty:0,net:0,markdown:0,profit:0}, season:{qty:0,net:0,markdown:0,profit:0}, year:{qty:0,net:0,markdown:0,profit:0} },
        grids: {
          onHand: {
            columns: ['6', 'TOT'],
            rows: [{ label: 'Store 7', cells: [{ value: 2 }, { value: 2 }] }],
          },
          allStoresSummary: {
            columns: ['6', 'TOT'],
            rows: [{ label: 'On Hand', cells: [{ value: 8 }, { value: 8 }] }],
          },
        },
        pictureUrl: null,
        info: { seasonCode: null, labelCode: null, groupCode: null, firstReceivedAt: null, lastMarkdownAt: null, perks: null, comment: null },
      },
    });
    renderPage();
    expect(screen.getByRole('row', { name: /On Hand/ })).toBeInTheDocument();
  });

  it('honors the mode query param from the URL', () => {
    (useInquiryData as any).mockReturnValue({
      isLoading: false, error: null,
      data: {
        sku: 'ZN02-NDPT',
        description: '…',
        category: { id: 0, name: '' }, vendor: { code: '', name: '' },
        vendorSku: null, styleColor: null,
        sizeType: { id: 0, name: '', columns: [], rows: [] },
        lastReceivedAt: null,
        pricing: { retail: 0, markdown1: 0, markdown2: 0, avgCost: 0, currentCost: 0, listPrice: 0, currentSlot: 'RETAIL' },
        rollup: { week: {qty:0,net:0,markdown:0,profit:0}, month:{qty:0,net:0,markdown:0,profit:0}, season:{qty:0,net:0,markdown:0,profit:0}, year:{qty:0,net:0,markdown:0,profit:0} },
        grids: {
          onHand: {
            columns: ['6'],
            rows: [{ label: 'Store 7', cells: [{ value: 2 }] }],
          },
          allStoresSummary: {
            columns: ['6'],
            rows: [{ label: 'Summary Row', cells: [{ value: 8 }] }],
          },
        },
        pictureUrl: null,
        info: { seasonCode: null, labelCode: null, groupCode: null, firstReceivedAt: null, lastMarkdownAt: null, perks: null, comment: null },
      },
    });
    renderPage(['/products/inquiry/ZN02-NDPT?mode=ON_HAND']);
    expect(screen.getAllByText('On Hand').length).toBeGreaterThan(0);
    expect(screen.getByRole('row', { name: /Store 7/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Summary Row/ })).not.toBeInTheDocument();
  });

  it('renders the SKU code from the URL in the header on success', () => {
    (useInquiryData as any).mockReturnValue({
      isLoading: false,
      data: {
        sku: 'ZN02-NDPT',
        description: 'SandPtMetChar',
        category: { id: 567, name: 'Zap' },
        vendor: { code: 'KNIN', name: 'NINETY NINE' },
        vendorSku: 'ZN02 ND PT',
        styleColor: 'PT/ND',
        sizeType: { id: 309, name: 'Zap Dam-Cab', columns: [], rows: [] },
        lastReceivedAt: '2026-04-19',
        pricing: { retail: 665.22, markdown1: 332.61, markdown2: 598.70, avgCost: 0, currentCost: 241.82, listPrice: 765, currentSlot: 'RETAIL' },
        rollup: { week: { qty: 0, net: 0, markdown: 0, profit: 0 }, month: { qty: 0, net: 0, markdown: 0, profit: 0 }, season: { qty: 0, net: 0, markdown: 0, profit: 0 }, year: { qty: 14, net: 7317.42, markdown: 1995.66, profit: 3933.79 } },
        grids: {},
        pictureUrl: null,
        info: { seasonCode: null, labelCode: null, groupCode: null, firstReceivedAt: null, lastMarkdownAt: null, perks: null, comment: null },
      },
      error: null,
    });
    renderPage();
    expect(screen.getByText('ZN02-NDPT')).toBeInTheDocument();
    expect(screen.getByText('SandPtMetChar')).toBeInTheDocument();
  });
});
