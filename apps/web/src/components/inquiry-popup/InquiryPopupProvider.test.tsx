import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { InquiryPopupProvider, useInquiryPopup } from './InquiryPopupProvider';

vi.mock('../draggable-modal', () => ({
  DraggableModal: ({ open, title, width, onCancel, children }: any) =>
    open ? (
      <div role="dialog" aria-label={title} data-width={width}>
        <button type="button" onClick={onCancel}>Close</button>
        <div>{title}</div>
        {children}
      </div>
    ) : null,
}));

vi.mock('../../pages/products/inquiry/InquiryBody', () => ({
  InquiryBody: ({
    skuCode,
    storeId,
    onOpenMatchingSets,
  }: {
    skuCode: string
    storeId?: number
    onOpenMatchingSets?: () => void
  }) => (
    <div data-testid="inquiry-body">
      {skuCode} / {storeId}
      <button type="button" onClick={onOpenMatchingSets}>
        Open matching sets
      </button>
    </div>
  ),
}));

function OpenInquiryButton() {
  const { openInquiry } = useInquiryPopup();
  return (
    <button type="button" onClick={() => openInquiry({ skuCode: 'ZN02-NDPT', storeId: 21 })}>
      Open inquiry
    </button>
  );
}

describe('InquiryPopupProvider', () => {
  it('opens the Inventory Inquiry as a modal over the current page', async () => {
    render(
      <MemoryRouter>
        <InquiryPopupProvider>
          <OpenInquiryButton />
        </InquiryPopupProvider>
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: /open inquiry/i }));

    const dialog = screen.getByRole('dialog', { name: 'Inventory Inquiry - ZN02-NDPT' });
    expect(dialog).toHaveAttribute('data-width', '92vw');
    expect(screen.getByTestId('inquiry-body')).toHaveTextContent('ZN02-NDPT / 21');
  });

  it('lets popup content close the inquiry before navigating elsewhere', async () => {
    render(
      <MemoryRouter>
        <InquiryPopupProvider>
          <OpenInquiryButton />
        </InquiryPopupProvider>
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole('button', { name: /open inquiry/i }));
    expect(screen.getByRole('dialog', { name: 'Inventory Inquiry - ZN02-NDPT' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /open matching sets/i }));
    expect(screen.queryByRole('dialog', { name: 'Inventory Inquiry - ZN02-NDPT' })).not.toBeInTheDocument();
  });
});
