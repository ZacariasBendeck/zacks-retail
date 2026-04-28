import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { InquiryBody } from './InquiryBody';

vi.mock('./useInquiryData', () => ({
  useInquiryData: vi.fn(),
}));

vi.mock('../../../components/products/AttributeBadgeStrip', () => ({
  default: () => null,
}));

vi.mock('../../../components/sku-lookup', () => ({
  SkuLookup: ({
    open,
    onClose,
  }: {
    open: boolean;
    onClose: () => void;
  }) =>
    open ? (
      <div>
        <div>SKU Lookup</div>
        <button type="button" onClick={onClose}>
          Close SKU Lookup
        </button>
      </div>
    ) : null,
}));

vi.mock('./SkuAiRecommendationModal', () => ({
  SkuAiRecommendationModal: ({ open }: { open: boolean }) =>
    open ? <div>Recommended reorder modal</div> : null,
}));

import { useInquiryData } from './useInquiryData';

const baseInquiry = {
  sku: 'ZN02-NDPT',
  description: 'Test Product',
  category: { id: 1, name: '' },
  vendor: { code: 'TBR', name: 'Test Brand' },
  vendorSku: null,
  styleColor: 'BLACK',
  sizeType: {
    id: 3,
    name: 'Shoe',
    columns: ['7', '8'],
    rows: ['M'],
  },
  lastReceivedAt: null,
  pricing: {
    retail: 1499,
    markdown1: 1199,
    markdown2: 999,
    avgCost: 750,
    currentCost: 750,
    listPrice: 1699,
    currentSlot: 'RETAIL' as const,
  },
  rollup: {
    week: { qty: 0, net: 0, markdown: 0, profit: 0 },
    month: { qty: 0, net: 0, markdown: 0, profit: 0 },
    season: { qty: 0, net: 0, markdown: 0, profit: 0 },
    year: { qty: 0, net: 0, markdown: 0, profit: 0 },
  },
  grids: {
    model: {
      columns: ['7', '8'],
      rows: [{ label: 'Store 21', cells: [{ value: 4 }, { value: 2 }] }],
      total: 6,
    },
    short: {
      columns: ['7', '8'],
      rows: [
        { label: 'Store 21', cells: [{ value: 3 }, { value: 1 }] },
        { label: 'Total', cells: [{ value: 3 }, { value: 1 }] },
      ],
      total: 4,
    },
  },
  pictureUrl: null,
  info: {
    seasonCode: null,
    labelCode: null,
    groupCode: null,
    firstReceivedAt: null,
    lastMarkdownAt: null,
    perks: null,
    comment: null,
  },
};

function renderInquiryBody(overrides: Partial<ComponentProps<typeof InquiryBody>> = {}) {
  return render(
    <InquiryBody
      skuCode="ZN02-NDPT"
      selectedRow={null}
      onPickSku={vi.fn()}
      mode="SHORT"
      activeTab={null}
      scope="general"
      onModeChange={vi.fn()}
      onActiveTabChange={vi.fn()}
      onScopeChange={vi.fn()}
      onSelectedRowChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe('InquiryBody', () => {
  it('does not auto-open the SKU lookup on the empty landing — only the Pick a SKU button opens it', async () => {
    vi.mocked(useInquiryData).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useInquiryData>);

    const { rerender } = render(
      <InquiryBody
        skuCode=""
        selectedRow={null}
        onPickSku={vi.fn()}
        mode="ALL_STORES_SUMMARY"
        activeTab={null}
        scope="general"
        onModeChange={vi.fn()}
        onActiveTabChange={vi.fn()}
        onScopeChange={vi.fn()}
        onSelectedRowChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('SKU Lookup')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Pick a SKU/i }));
    expect(screen.getByText('SKU Lookup')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close SKU Lookup' }));
    expect(screen.queryByText('SKU Lookup')).not.toBeInTheDocument();

    rerender(
      <InquiryBody
        skuCode=""
        selectedRow={null}
        onPickSku={vi.fn()}
        mode="ALL_STORES_SUMMARY"
        activeTab={null}
        scope="general"
        onModeChange={vi.fn()}
        onActiveTabChange={vi.fn()}
        onScopeChange={vi.fn()}
        onSelectedRowChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('SKU Lookup')).not.toBeInTheDocument();
  });

  it('shows short total, model total, short percent, and a per-size total row', () => {
    vi.mocked(useInquiryData).mockReturnValue({
      data: baseInquiry,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useInquiryData>);

    renderInquiryBody();

    expect(screen.getByTestId('inquiry-grid-caption')).toHaveTextContent(
      /Short Quantities\s*4 \/ 6 \(66.67%\)/,
    );

    const totalRow = screen.getByRole('row', { name: /Total/ });
    expect(within(totalRow).getByRole('rowheader')).toHaveTextContent('Total');
    expect(within(totalRow).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['3', '1']);
  });

  it('opens the recommendation modal from the Recommended reorder button', async () => {
    vi.mocked(useInquiryData).mockReturnValue({
      data: baseInquiry,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useInquiryData>);

    renderInquiryBody();

    await userEvent.click(screen.getByRole('button', { name: /Recommended reorder/i }));
    expect(screen.getByText('Recommended reorder modal')).toBeInTheDocument();
  });

  it('calls the edit handler from the Edit SKU button', async () => {
    const onEditSku = vi.fn();
    vi.mocked(useInquiryData).mockReturnValue({
      data: baseInquiry,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useInquiryData>);

    renderInquiryBody({ onEditSku });

    await userEvent.click(screen.getByRole('button', { name: /Edit SKU/i }));
    expect(onEditSku).toHaveBeenCalledWith('ZN02-NDPT');
  });
});
