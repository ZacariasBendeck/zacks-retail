import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchFindBySize } from '../services/ricsInventoryApi'

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

describe('ricsInventoryApi find-by-size contract', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('maps the widened find-by-size filters to query params', async () => {
    vi.mocked(fetch).mockResolvedValue(
      buildOkResponse({
        rows: [],
        totalMatches: 0,
        totalOnHand: 0,
      }),
    )

    await fetchFindBySize({
      seedSku: '349101-BKPT',
      sizeTypeCode: 3,
      columnLabel: '080',
      rowLabel: 'M',
      restrictToSizeType: true,
      vendorCode: 'NINA',
      category: 560,
      styleColor: 'BLACK',
      storeNumbers: [1, 2, 5],
      sort: 'DESCRIPTION',
      separateByStore: true,
      limit: 750,
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/inventory/find-by-size')
    expect(url.searchParams.get('seedSku')).toBe('349101-BKPT')
    expect(url.searchParams.get('sizeTypeCode')).toBe('3')
    expect(url.searchParams.get('columnLabel')).toBe('080')
    expect(url.searchParams.get('rowLabel')).toBe('M')
    expect(url.searchParams.get('restrictToSizeType')).toBe('true')
    expect(url.searchParams.get('vendorCode')).toBe('NINA')
    expect(url.searchParams.get('category')).toBe('560')
    expect(url.searchParams.get('styleColor')).toBe('BLACK')
    expect(url.searchParams.get('storeNumbers')).toBe('1,2,5')
    expect(url.searchParams.get('sort')).toBe('DESCRIPTION')
    expect(url.searchParams.get('separateByStore')).toBe('true')
    expect(url.searchParams.get('limit')).toBe('750')
  })
})
