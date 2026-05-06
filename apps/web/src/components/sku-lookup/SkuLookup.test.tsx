import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SkuLookup } from './SkuLookup';
import type { SkuLookupProps } from './SkuLookup';

vi.mock('../../services/skuApi', () => ({
  searchSkusForLookup: vi.fn(),
  fetchSkuLookupFacets: vi.fn(),
  SkuApiError: class extends Error {},
}));

import * as skuApi from '../../services/skuApi';

function renderLookup(
  onSelect = vi.fn(),
  extraProps: Partial<SkuLookupProps> = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ConfigProvider>
          <SkuLookup
            open={true}
            onClose={() => {}}
            onSelect={onSelect}
            {...extraProps}
          />
        </ConfigProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return onSelect;
}

describe('SkuLookup', () => {
  beforeEach(() => {
    vi.mocked(skuApi.searchSkusForLookup).mockResolvedValue({
      rows: [
        { skuId: 'A1', skuCode: 'A1', description: 'Widget', vendor: 'ACME', category: '10', styleColor: null, currentPrice: 9.99,  pictureUrl: null },
        { skuId: 'A2', skuCode: 'A2', description: 'Gadget', vendor: 'ACME', category: '10', styleColor: null, currentPrice: 19.99, pictureUrl: null },
      ],
      total: 2,
    });
    vi.mocked(skuApi.fetchSkuLookupFacets).mockResolvedValue({
      seasons: [
        { code: '24S1', name: 'Spring 2024', label: '24S1 - Spring 2024' },
        { code: '24F1', name: 'Fall 2024', label: '24F1 - Fall 2024' },
      ],
      vendors: [{ code: 'ACME', label: 'ACME — Acme Co' }],
      departments: [{ number: 1, name: 'FORMAL' }],
    });
  });

  it('renders the six-column table from the RICS screenshot', async () => {
    renderLookup();
    await screen.findByText('A1');
    ['SKU', 'Description', 'Vendor', 'Categ.', 'Style/Color', 'Price'].forEach((header) => {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    });
  });

  it('loads facets and renders Season / Vendor / Department filter dropdowns', async () => {
    renderLookup();
    await screen.findByText('A1');
    await waitFor(() => expect(skuApi.fetchSkuLookupFacets).toHaveBeenCalled());
    expect(screen.getByText('Restrict to:')).toBeInTheDocument();
    // One combobox for the search input + three for the Select filters.
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
  });

  it('reloads dependent facets when a Season is selected', async () => {
    vi.mocked(skuApi.fetchSkuLookupFacets).mockImplementation(async (query = {}) => {
      if (query.season === '24S1') {
        return {
          seasons: [
            { code: '24S1', name: 'Spring 2024', label: '24S1 - Spring 2024' },
            { code: '24F1', name: 'Fall 2024', label: '24F1 - Fall 2024' },
          ],
          vendors: [{ code: 'ACME', label: 'ACME - Acme Co' }],
          departments: [{ number: 1, name: 'FORMAL' }],
        };
      }
      return {
        seasons: [
          { code: '24S1', name: 'Spring 2024', label: '24S1 - Spring 2024' },
          { code: '24F1', name: 'Fall 2024', label: '24F1 - Fall 2024' },
        ],
        vendors: [
          { code: 'ACME', label: 'ACME - Acme Co' },
          { code: 'BETA', label: 'BETA - Beta Co' },
        ],
        departments: [
          { number: 1, name: 'FORMAL' },
          { number: 2, name: 'CASUAL' },
        ],
      };
    });

    renderLookup();
    await screen.findByText('A1');
    const [seasonSelect] = screen.getAllByRole('combobox');
    expect(seasonSelect).toBeDefined();
    await userEvent.click(seasonSelect!);
    const seasonOptions = await screen.findAllByText('24S1 - Spring 2024');
    const selectedSeasonOption = seasonOptions[seasonOptions.length - 1];
    expect(selectedSeasonOption).toBeDefined();
    await userEvent.click(selectedSeasonOption!);

    await waitFor(() =>
      expect(skuApi.fetchSkuLookupFacets).toHaveBeenCalledWith(
        expect.objectContaining({ season: '24S1' }),
      ),
    );
  });

  it('starts with caller-provided lookup filters', async () => {
    renderLookup(vi.fn(), { initialFilters: { vendor: 'ACME' } });
    await screen.findByText('A1');

    await waitFor(() =>
      expect(skuApi.searchSkusForLookup).toHaveBeenCalledWith(
        expect.objectContaining({ vendor: 'ACME' }),
      ),
    );
    expect(skuApi.fetchSkuLookupFacets).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: 'ACME' }),
    );
  });

  it('defaults SKU lookup searches to contains mode', async () => {
    renderLookup();
    await screen.findByText('A1');

    await waitFor(() =>
      expect(skuApi.searchSkusForLookup).toHaveBeenCalledWith(
        expect.objectContaining({ searchField: 'SKU', skuMatchMode: 'contains' }),
      ),
    );
  });

  it('passes prefix mode when the operator selects Starts with', async () => {
    renderLookup();
    await screen.findByText('A1');

    await userEvent.click(screen.getByText('Starts with'));

    await waitFor(() =>
      expect(skuApi.searchSkusForLookup).toHaveBeenLastCalledWith(
        expect.objectContaining({ searchField: 'SKU', skuMatchMode: 'prefix' }),
      ),
    );
  });

  it('calls onSelect when user double-clicks a row', async () => {
    const onSelect = renderLookup();
    await screen.findByText('A1');
    await userEvent.dblClick(screen.getByText('A1'));
    expect(onSelect).toHaveBeenCalledWith({ skuCode: 'A1', skuId: 'A1' });
  });

  it('calls onSelect when user selects a row and clicks Save', async () => {
    const onSelect = renderLookup();
    await screen.findByText('A1');
    await userEvent.click(screen.getByText('A2'));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSelect).toHaveBeenCalledWith({ skuCode: 'A2', skuId: 'A2' });
  });

  it('ArrowDown from the input highlights the first row, Enter confirms it', async () => {
    const onSelect = renderLookup();
    await screen.findByText('A1');
    // Focus the search input (autoFocus already put it there, but be explicit).
    const input = screen.getByPlaceholderText(/SKU matches anywhere/i);
    input.focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith({ skuCode: 'A1', skuId: 'A1' });
  });

  it('ArrowDown twice then Enter picks the second row', async () => {
    const onSelect = renderLookup();
    await screen.findByText('A1');
    const input = screen.getByPlaceholderText(/SKU matches anywhere/i);
    input.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledWith({ skuCode: 'A2', skuId: 'A2' });
  });

  it('submits the typed SKU when Enter is pressed with no results', async () => {
    vi.mocked(skuApi.searchSkusForLookup).mockResolvedValueOnce({ rows: [], total: 0 });
    const onSubmitQuery = vi.fn();
    renderLookup(vi.fn(), { initialQuery: 'NEW-SKU-123', onSubmitQuery });
    await waitFor(() => expect(skuApi.searchSkusForLookup).toHaveBeenCalled());
    const input = screen.getByPlaceholderText(/SKU matches anywhere/i);
    input.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSubmitQuery).toHaveBeenCalledWith('NEW-SKU-123');
  });
});
