import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AttributeBadgeStrip from './AttributeBadgeStrip';

vi.mock('../../hooks/useProductsAttributes', () => ({
  useSkuAttributes: vi.fn(() => ({
    isLoading: false,
    isError: false,
    data: {
      skuCode: '25604-RDPT',
      byDimension: {
        buyer: {
          isMultiValue: false,
          values: [
            {
              code: 'zb',
              labelEs: 'Zacarias Bendeck',
              assignedBy: 'seed:keyword:test',
              assignedAt: '2026-04-23T20:21:39.498Z',
            },
          ],
        },
        color: {
          isMultiValue: false,
          values: [],
        },
      },
    },
  })),
}));

describe('AttributeBadgeStrip', () => {
  it('shows only unassigned dimensions in the default strip', () => {
    render(<AttributeBadgeStrip skuCode="25604-RDPT" />);

    expect(screen.getByText('Unassigned Attributes:')).toBeInTheDocument();
    expect(screen.getByText('Color')).toBeInTheDocument();
    expect(screen.queryByText('Zacarias Bendeck')).not.toBeInTheDocument();
  });

  it('shows only assigned values in assigned mode', () => {
    render(<AttributeBadgeStrip skuCode="25604-RDPT" mode="assigned" />);

    expect(screen.getByText('Merchandising Attributes:')).toBeInTheDocument();
    expect(screen.getByText('Comprador:')).toBeInTheDocument();
    expect(screen.getByText('Zacarias Bendeck')).toBeInTheDocument();
    expect(screen.queryByText('Unassigned Attributes:')).not.toBeInTheDocument();
  });
});
