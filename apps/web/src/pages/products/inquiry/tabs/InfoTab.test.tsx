import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoTab } from './InfoTab';

describe('InfoTab', () => {
  it('renders the seven Info fields', () => {
    render(<InfoTab info={{
      seasonCode: 'S', labelCode: 'H', groupCode: 'ZB',
      firstReceivedAt: '2026-01-10', lastMarkdownAt: '2026-04-01',
      perks: 5, comment: 'Short comment',
    }} />);
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText('H')).toBeInTheDocument();
    expect(screen.getByText('ZB')).toBeInTheDocument();
    expect(screen.getByText('2026-01-10')).toBeInTheDocument();
    expect(screen.getByText('2026-04-01')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Short comment')).toBeInTheDocument();
  });
});
