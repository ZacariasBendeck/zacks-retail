import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ViewModeSelector, VIEW_MODES } from './ViewModeSelector';

describe('ViewModeSelector', () => {
  it('renders all 15 modes', () => {
    render(<ViewModeSelector value="ALL_STORES_SUMMARY" onChange={() => {}} />);
    expect(VIEW_MODES).toHaveLength(15);
    VIEW_MODES.forEach((m) => expect(screen.getByText(m.label)).toBeInTheDocument());
  });

  it('disables modes that are not v1-live', () => {
    render(<ViewModeSelector value="ALL_STORES_SUMMARY" onChange={() => {}} />);
    const poButton = screen.getByRole('button', { name: /On Order \(At-Once\)/ });
    expect(poButton).toBeDisabled();
  });

  it('calls onChange when a live mode is clicked', async () => {
    const onChange = vi.fn();
    render(<ViewModeSelector value="ALL_STORES_SUMMARY" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /On Hand/ }));
    expect(onChange).toHaveBeenCalledWith('ON_HAND');
  });
});
