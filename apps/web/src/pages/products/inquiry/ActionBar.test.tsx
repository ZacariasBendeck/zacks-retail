import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionBar } from './ActionBar';

const baseProps = {
  activeTab: null,
  onTab: () => {},
  onPrev: () => {},
  onNext: () => {},
  onClear: () => {},
  scope: 'general' as const,
  onScopeChange: () => {},
};

describe('ActionBar', () => {
  it('renders all nine action buttons', () => {
    render(<ActionBar {...baseProps} />);
    ['Clear', 'Prev', 'Next', 'UPCs', 'POs', 'Trend', 'Info', 'Detail', 'Print'].forEach((label) =>
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    );
  });

  it('disables stubbed buttons (POs / Trend / Print)', () => {
    render(<ActionBar {...baseProps} />);
    expect(screen.getByRole('button', { name: 'POs' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trend' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
  });

  it('invokes onTab when a live tab is clicked', async () => {
    const onTab = vi.fn();
    render(<ActionBar {...baseProps} onTab={onTab} />);
    await userEvent.click(screen.getByRole('button', { name: 'UPCs' }));
    expect(onTab).toHaveBeenCalledWith('UPCS');
  });

  it('invokes onPrev and onNext when those buttons are clicked', async () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<ActionBar {...baseProps} onPrev={onPrev} onNext={onNext} />);
    await userEvent.click(screen.getByRole('button', { name: 'Prev' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPrev).toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
  });
});
