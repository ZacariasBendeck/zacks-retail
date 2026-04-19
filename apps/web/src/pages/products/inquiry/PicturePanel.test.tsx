import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PicturePanel } from './PicturePanel';

describe('PicturePanel', () => {
  it('renders an <img> when pictureUrl is provided', () => {
    render(<PicturePanel pictureUrl="/rics-images/ZN02.jpg" alt="ZN02-NDPT" />);
    const img = screen.getByRole('img', { name: 'ZN02-NDPT' });
    expect(img).toHaveAttribute('src', '/rics-images/ZN02.jpg');
  });

  it('renders a placeholder when pictureUrl is null', () => {
    render(<PicturePanel pictureUrl={null} alt="ZN02-NDPT" />);
    expect(screen.getByText(/no picture/i)).toBeInTheDocument();
  });
});
