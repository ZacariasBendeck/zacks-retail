import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SkuAiRecommendationModal } from './SkuAiRecommendationModal';

describe('SkuAiRecommendationModal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts operator notes and renders the structured recommendation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: 'Increase the model and plan a future buy.',
        styleTag: 'WINNER',
        decision: 'REBALANCE',
        urgency: 'MEDIUM',
        confidence: 'HIGH',
        baselineRisk: {
          daysUntilModelRisk: 45,
          estimatedModelRiskDate: '2026-06-10',
          basis: 'Month-to-date demand pace would exhaust excess above model in about 45 days.',
        },
        buyPlan: {
          shouldBuy: true,
          quantity: 24,
          orderByDate: '2026-03-12',
          estimatedArrivalDate: '2026-06-10',
          leadTimeDays: 90,
          basis: 'Buying 24 units keeps baseline coverage through the lead-time window.',
        },
        actions: [
          {
            type: 'MODEL_INCREASE',
            priority: 1,
            title: 'Raise model at store 29',
            details: 'Increase size 070 model at store 29 by 1 because it is repeatedly short.',
            targetStoreNumber: 29,
            targetStoreName: 'Unlimited GaleriasSP',
            size: '070',
            quantity: 1,
          },
        ],
        reasons: ['Chain stock is heavy overall.'],
        watchouts: ['Store 32 is closed for renovations.'],
        questions: [],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SkuAiRecommendationModal open skuCode="2501-BKPT" onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    const notesBox = screen.getByRole('textbox');
    expect(notesBox).toHaveValue(
      'Store 32 / Unlimited Premier is closed for renovations; do not recommend replenishment there unless explicitly staging inventory.',
    );

    await userEvent.type(notesBox, ' Prioritize warehouse transfers first.');
    await userEvent.click(screen.getByRole('button', { name: /Analyze SKU/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/inventory/inquiry/2501-BKPT/ai-recommendation',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestInit?.body).toContain('Store 32 / Unlimited Premier is closed for renovations');
    expect(requestInit?.body).toContain('Prioritize warehouse transfers first.');

    expect(await screen.findByText(/Increase the model and plan a future buy/i)).toBeInTheDocument();
    expect(screen.getByText('WINNER')).toBeInTheDocument();
    expect(screen.getByText(/Raise model at store 29/i)).toBeInTheDocument();
    expect(screen.getByText(/Estimated model-risk point: 45 days \(2026-06-10\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Buy 24 units. Order by 2026-03-12/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Store 32 is closed for renovations/i).length).toBeGreaterThan(0);
  });
});
