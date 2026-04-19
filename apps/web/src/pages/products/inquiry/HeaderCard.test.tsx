import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeaderCard } from './HeaderCard';

const inquiry = {
  sku: 'ZN02-NDPT',
  description: 'SandPtMetChar',
  category: { id: 567, name: 'Zap T/Med' },
  vendor: { code: 'KNIN', name: 'NINETY NINE' },
  vendorSku: 'ZN02 ND PT',
  styleColor: 'PT/ND',
  sizeType: { id: 309, name: 'Zap Dam-Cab', columns: [], rows: [] },
  lastReceivedAt: '2026-04-19',
} as any;

describe('HeaderCard', () => {
  it('renders every identity field from the RICS inquiry header', () => {
    render(<HeaderCard inquiry={inquiry} />);
    expect(screen.getByText('ZN02-NDPT')).toBeInTheDocument();
    expect(screen.getByText('SandPtMetChar')).toBeInTheDocument();
    expect(screen.getByText(/567/)).toBeInTheDocument();
    expect(screen.getByText(/KNIN/)).toBeInTheDocument();
    expect(screen.getByText('ZN02 ND PT')).toBeInTheDocument();
    expect(screen.getByText('PT/ND')).toBeInTheDocument();
    expect(screen.getByText(/Zap Dam-Cab/)).toBeInTheDocument();
    expect(screen.getByText('2026-04-19')).toBeInTheDocument();
  });
});
