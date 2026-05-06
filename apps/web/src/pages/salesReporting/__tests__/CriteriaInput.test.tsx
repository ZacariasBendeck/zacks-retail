import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CriteriaInput from '../CriteriaInput'

describe('CriteriaInput', () => {
  it('renders the label, dropdown, and grammar text box', () => {
    render(
      <CriteriaInput
        label="Categories"
        mode="numeric"
        options={[{ value: 556, label: '556 — FLATS' }]}
        selected={[]}
        onSelectedChange={() => {}}
        rawText=""
        onRawTextChange={() => {}}
      />,
    )
    expect(screen.getByText('Categories')).toBeInTheDocument()
    // Ant Select placeholder is rendered inside the combobox
    expect(screen.getByText(/All Categories/i)).toBeInTheDocument()
    expect(screen.getByTestId('categories-criteria-picker')).toBeInTheDocument()
    // Grammar text box placeholder
    expect(screen.getByPlaceholderText(/556-599/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Categories grammar criteria')).toBeInTheDocument()
    expect(screen.getByTestId('categories-criteria-grammar')).toBeInTheDocument()
  })

  it('keeps grammar help in the tooltip instead of rendering inline text', () => {
    render(
      <CriteriaInput
        label="Categories"
        mode="numeric"
        options={[]}
        selected={[]}
        onSelectedChange={() => {}}
        rawText=""
        onRawTextChange={() => {}}
      />,
    )

    expect(screen.queryByText(/Ranges: 556-599/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Categories criteria help')).toHaveAttribute(
      'title',
      expect.stringContaining('Ranges: 556-599'),
    )
  })

  it('allows a blank select placeholder', () => {
    render(
      <CriteriaInput
        label="Stores"
        mode="numeric"
        options={[]}
        selected={[]}
        onSelectedChange={() => {}}
        rawText=""
        onRawTextChange={() => {}}
        placeholder=""
      />,
    )

    expect(screen.queryByText(/All Stores/i)).not.toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('fires onSelectedChange on dropdown change', async () => {
    const spy = vi.fn()
    render(
      <CriteriaInput
        label="Stores"
        mode="numeric"
        options={[
          { value: 2, label: '2 — Store 2' },
          { value: 16, label: '16 — Store 16' },
        ]}
        selected={[]}
        onSelectedChange={spy}
        rawText=""
        onRawTextChange={() => {}}
      />,
    )
    const combobox = screen.getByRole('combobox')
    fireEvent.mouseDown(combobox)
    const option = await screen.findByText('2 — Store 2')
    fireEvent.click(option)
    expect(spy).toHaveBeenCalled()
    expect(spy.mock.calls[0]?.[0]).toEqual([2])
  })

  it('fires onRawTextChange on text box input', () => {
    const spy = vi.fn()
    render(
      <CriteriaInput
        label="Categories"
        mode="numeric"
        options={[]}
        selected={[]}
        onSelectedChange={() => {}}
        rawText=""
        onRawTextChange={spy}
      />,
    )
    const input = screen.getByPlaceholderText(/556-599/i)
    fireEvent.change(input, { target: { value: '556-599' } })
    expect(spy).toHaveBeenCalledWith('556-599')
  })

  it('hides the dropdown when hideDropdown is true', () => {
    render(
      <CriteriaInput
        label="Keywords"
        mode="string"
        options={[]}
        selected={[]}
        onSelectedChange={() => {}}
        rawText=""
        onRawTextChange={() => {}}
        hideDropdown
      />,
    )
    expect(screen.queryByRole('combobox')).toBeNull()
    // String-mode placeholder
    expect(screen.getByPlaceholderText(/\*FORMAL\*|<>NIKE/i)).toBeInTheDocument()
  })
})
