import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InquiryBody } from './InquiryBody';

vi.mock('./useInquiryData', () => ({
  useInquiryData: vi.fn(),
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

import { useInquiryData } from './useInquiryData';

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
});
