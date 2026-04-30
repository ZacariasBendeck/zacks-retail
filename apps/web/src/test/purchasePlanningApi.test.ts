import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addSavedPurchasePlanAdjustment,
  createSavedPurchasePlan,
  fetchSavedPurchasePlans,
  generateSeasonalPurchaseReport,
} from '../services/purchasePlanningApi'

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response
}

function calledUrl(): URL {
  return new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]), 'http://localhost')
}

describe('purchasePlanningApi saved plans', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists saved plans with query params', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ plans: [] }))

    await fetchSavedPurchasePlans({ status: 'draft', storeGroupCode: 'unlimited' })

    const url = calledUrl()
    expect(url.pathname).toBe('/api/v1/purchase-planning/plans')
    expect(url.searchParams.get('status')).toBe('draft')
    expect(url.searchParams.get('storeGroupCode')).toBe('unlimited')
  })

  it('creates a saved chain department season plan', async () => {
    const payload = {
      storeGroupCode: 'unlimited',
      season: 'spring' as const,
      seasonYear: 2026,
      departmentNumbers: [5],
      forecast: { method: 'holtWinters' as const },
    }
    vi.mocked(fetch).mockResolvedValue(ok({ plan: { id: 'plan-1' } }))

    await createSavedPurchasePlan(payload)

    expect(fetch).toHaveBeenCalledWith('/api/v1/purchase-planning/plans', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }))
  })

  it('posts department adjustments', async () => {
    const payload = { departmentKey: '5', kind: 'absolute_total' as const, value: 120, reason: 'buyer judgment' }
    vi.mocked(fetch).mockResolvedValue(ok({ plan: { id: 'plan-1' } }))

    await addSavedPurchasePlanAdjustment('plan-1', payload)

    expect(fetch).toHaveBeenCalledWith('/api/v1/purchase-planning/plans/plan-1/adjustments', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(payload),
    }))
  })

  it('generates a consolidated seasonal report', async () => {
    const payload = {
      storeGroupCode: 'all-stores',
      departmentNumber: 4,
      year: 2026,
      forecast: { method: 'holtWinters' as const },
    }
    vi.mocked(fetch).mockResolvedValue(ok({ seasons: [] }))

    await generateSeasonalPurchaseReport(payload)

    expect(fetch).toHaveBeenCalledWith('/api/v1/purchase-planning/seasonal-report', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }))
  })
})
