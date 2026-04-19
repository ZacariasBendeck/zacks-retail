import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAdjustment, fetchAdjustments } from '../services/adjustmentApi'

function buildOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response
}

function getCalledUrl(): URL {
  const called = vi.mocked(fetch).mock.calls[0]?.[0]
  return new URL(String(called), 'http://localhost')
}

describe('adjustmentApi contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('maps adjustment list server-table query params', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ data: [], pagination: {} }))

    await fetchAdjustments({
      page: 3,
      pageSize: 50,
      sort: 'type',
      order: 'asc',
      type: 'TRANSFER',
      fromDate: '2026-04-01T00:00:00.000Z',
      toDate: '2026-04-07T23:59:59.000Z',
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/inventory/adjustments')
    expect(url.searchParams.get('page')).toBe('3')
    expect(url.searchParams.get('pageSize')).toBe('50')
    expect(url.searchParams.get('sort')).toBe('type')
    expect(url.searchParams.get('order')).toBe('asc')
    expect(url.searchParams.get('type')).toBe('TRANSFER')
    expect(url.searchParams.get('fromDate')).toBe('2026-04-01T00:00:00.000Z')
    expect(url.searchParams.get('toDate')).toBe('2026-04-07T23:59:59.000Z')
  })

  it('creates adjustments through POST contract', async () => {
    const payload = {
      type: 'DAMAGE' as const,
      lineItems: [{ skuId: 'sku-1', quantity: -2 }],
      reason: 'Damage from handling',
    }
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ id: 'adj-1' }))

    await createAdjustment(payload)

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/inventory/adjustments',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )
  })
})
