import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HeaderCard } from './HeaderCard';

const inquiry = {
  sku: 'ZN02-NDPT',
  description: 'SandPtMetChar',
  category: { id: 567, name: 'Zap T/Med' },
  vendor: { code: 'KNIN', name: 'NINETY NINE' },
  vendorSku: 'ZN02 ND PT',
  styleColor: 'PT/ND',
  status: 'ACTIVE',
  sizeType: { id: 309, name: 'Zap Dam-Cab', columns: [], rows: [] },
  lastReceivedAt: '2026-04-19',
} as any;

describe('HeaderCard', () => {
  it('renders every identity field from the RICS inquiry header', () => {
    render(<HeaderCard inquiry={inquiry} storeId={21} />);
    expect(screen.getByText('ZN02-NDPT')).toBeInTheDocument();
    expect(screen.getByText('SandPtMetChar')).toBeInTheDocument();
    expect(screen.getByText(/567/)).toBeInTheDocument();
    expect(screen.getByText(/KNIN/)).toBeInTheDocument();
    expect(screen.getByText('ZN02 ND PT')).toBeInTheDocument();
    expect(screen.getByText('PT/ND')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText(/Zap Dam-Cab/)).toBeInTheDocument();
    expect(screen.getByText('2026-04-19')).toBeInTheDocument();
    expect(screen.getByText('Store 21')).toBeInTheDocument();
  });

  it('lists the old SKUs replaced by the current SKU and opens them from the header', async () => {
    const onPickSku = vi.fn();
    render(
      <HeaderCard
        inquiry={{
          ...inquiry,
          replacementContext: {
            replacedBy: null,
            supersedes: [
              {
                id: 'replacement-1',
                oldSkuId: 'old-1',
                oldSkuCode: 'ZN01-NDPT',
                oldDescription: 'Previous sandal',
                replacementSkuId: 'new-1',
                replacementSkuCode: 'ZN02-NDPT',
                replacementDescription: 'SandPtMetChar',
                replacementType: 'EXACT',
                transferDemand: true,
                effectiveAt: '2026-05-12T00:00:00.000Z',
                retiredAt: null,
                note: null,
                createdAt: '2026-05-12T00:00:00.000Z',
                createdBy: 'system',
                updatedAt: '2026-05-12T00:00:00.000Z',
                updatedBy: 'system',
              },
            ],
          },
        }}
        onPickSku={onPickSku}
      />,
    );

    expect(screen.getByText('Replaces')).toBeInTheDocument();
    expect(screen.getByText('demand')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ZN01-NDPT' }));
    expect(onPickSku).toHaveBeenCalledWith({ skuCode: 'ZN01-NDPT', skuId: 'old-1' });
  });
});
