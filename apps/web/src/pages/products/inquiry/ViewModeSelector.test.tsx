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

  it('keeps the newly wired inventory modes enabled', () => {
    render(<ViewModeSelector value="ALL_STORES_SUMMARY" onChange={() => {}} />);
    const poButton = screen.getByRole('button', { name: /On Order \(At-Once\)/ });
    const mtdButton = screen.getByRole('button', { name: /Month-to-Date Sales/ });
    expect(poButton).toBeEnabled();
    expect(mtdButton).toBeEnabled();
  });

  it('calls onChange when a live mode is clicked', async () => {
    const onChange = vi.fn();
    render(<ViewModeSelector value="ALL_STORES_SUMMARY" onChange={onChange} />);
    // Use the exact F2 shortcut to disambiguate from "All Stores - On Hand" (Shift+F1).
    await userEvent.click(screen.getByRole('button', { name: /On Hand\s+F2/ }));
    expect(onChange).toHaveBeenCalledWith('ON_HAND');
  });
});
