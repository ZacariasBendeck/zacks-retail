import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchInventoryBalances,
  INVENTORY_BALANCE_SORT_ALLOWLIST,
} from '../services/inventoryApi'

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

describe('inventoryApi cursor contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('maps cursor list query params to the inventory endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(
      buildOkResponse({
        data: [],
        nextCursor: null,
        limit: 50,
        appliedSort: { field: 'updatedAt', order: 'desc' },
        appliedFilters: {},
      }),
    )

    await fetchInventoryBalances({
      limit: 100,
      cursor: 'opaque-cursor-token',
      sort: 'quantityOnHand',
      order: 'asc',
      department: 'FORMAL',
      q: 'boot',
      active: true,
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/inventory')
    expect(url.searchParams.get('limit')).toBe('100')
    expect(url.searchParams.get('cursor')).toBe('opaque-cursor-token')
    expect(url.searchParams.get('sort')).toBe('quantityOnHand')
    expect(url.searchParams.get('order')).toBe('asc')
    expect(url.searchParams.get('department')).toBe('FORMAL')
    expect(url.searchParams.get('q')).toBe('boot')
    expect(url.searchParams.get('active')).toBe('true')
  })

  it('exports the cursor sort allowlist used by the balance table controls', () => {
    expect(INVENTORY_BALANCE_SORT_ALLOWLIST).toEqual([
      'quantityOnHand',
      'updatedAt',
      'skuCode',
      'department',
    ])
  })
})
