import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SkuLink } from './SkuLink';

// Stub the popup provider for tests — SkuLink reads `openInquiry` from it.
// The real provider lives in main.tsx; under test we just confirm the link
// invokes it on plain click.
const openInquiry = vi.fn();
vi.mock('../inquiry-popup', () => ({
  useInquiryPopup: () => ({ openInquiry, closeInquiry: vi.fn() }),
}));

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('SkuLink', () => {
  it('renders the SKU code as link text by default', () => {
    renderWithRouter(<SkuLink skuCode="ZN02-NDPT" />);
    const anchor = screen.getByRole('link', { name: 'ZN02-NDPT' });
    expect(anchor).toHaveAttribute('href', '/products/inquiry/ZN02-NDPT');
  });

  it('appends storeId when provided', () => {
    renderWithRouter(<SkuLink skuCode="ZN02-NDPT" storeId={1} />);
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/products/inquiry/ZN02-NDPT?storeId=1'
    );
  });

  it('URL-encodes SKUs containing special characters', () => {
    renderWithRouter(<SkuLink skuCode="|DMTDU1BN" />);
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/products/inquiry/%7CDMTDU1BN'
    );
  });

  it('renders custom children when provided', () => {
    renderWithRouter(<SkuLink skuCode="ABC">Open inquiry</SkuLink>);
    expect(screen.getByRole('link', { name: 'Open inquiry' })).toBeInTheDocument();
  });

  it('opens the inquiry popup on plain click (no navigation)', async () => {
    openInquiry.mockClear();
    renderWithRouter(<SkuLink skuCode="ZN02-NDPT" storeId={1} />);
    await userEvent.click(screen.getByRole('link'));
    expect(openInquiry).toHaveBeenCalledWith({ skuCode: 'ZN02-NDPT', storeId: 1 });
  });
});
