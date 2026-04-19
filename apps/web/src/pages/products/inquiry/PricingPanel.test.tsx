import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PricingPanel } from './PricingPanel';

const pricing = {
  retail: 665.22, markdown1: 332.61, markdown2: 598.70,
  avgCost: 0, currentCost: 241.82, listPrice: 765,
  currentSlot: 'RETAIL' as const,
};

describe('PricingPanel', () => {
  it('renders all six price fields', () => {
    render(<PricingPanel pricing={pricing} />);
    expect(screen.getByText('665.22')).toBeInTheDocument();
    expect(screen.getByText('332.61')).toBeInTheDocument();
    expect(screen.getByText('598.70')).toBeInTheDocument();
    expect(screen.getByText('241.82')).toBeInTheDocument();
    expect(screen.getByText('765')).toBeInTheDocument();
  });

  it('highlights the current price slot', () => {
    render(<PricingPanel pricing={pricing} />);
    const retailRow = screen.getByText('Retail Price').closest('tr');
    expect(retailRow).toHaveAttribute('data-current', 'true');
  });

  it('omits the currency symbol (amounts in Lempira; symbol shown elsewhere)', () => {
    render(<PricingPanel pricing={pricing} />);
    expect(screen.queryByText(/L\s*665/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
