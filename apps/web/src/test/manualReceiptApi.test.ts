import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createManualReceipt,
  fetchManualReceiptContext,
  fetchManualReceipts,
  fetchManualReceiptStores,
} from '../services/manualReceiptApi'

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

describe('manualReceiptApi contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('loads store options from the dedicated endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse([]))

    await fetchManualReceiptStores()

    expect(fetch).toHaveBeenCalledWith('/api/v1/inventory/manual-receipts/stores')
  })

  it('maps context query params for store plus sku', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({}))

    await fetchManualReceiptContext({ storeId: 7, skuCode: 'ABC123' })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/inventory/manual-receipts/context')
    expect(url.searchParams.get('storeId')).toBe('7')
    expect(url.searchParams.get('skuCode')).toBe('ABC123')
    expect(url.searchParams.get('upc')).toBeNull()
  })

  it('maps server-table query params for receipt history', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ data: [], pagination: {} }))

    await fetchManualReceipts({
      page: 2,
      pageSize: 50,
      sort: 'createdAt',
      order: 'asc',
      storeId: 3,
      fromDate: '2026-04-01T00:00:00.000Z',
      toDate: '2026-04-07T23:59:59.000Z',
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/inventory/manual-receipts')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('pageSize')).toBe('50')
    expect(url.searchParams.get('sort')).toBe('createdAt')
    expect(url.searchParams.get('order')).toBe('asc')
    expect(url.searchParams.get('storeId')).toBe('3')
    expect(url.searchParams.get('fromDate')).toBe('2026-04-01T00:00:00.000Z')
    expect(url.searchParams.get('toDate')).toBe('2026-04-07T23:59:59.000Z')
  })

  it('creates manual receipts through the dedicated POST contract', async () => {
    const payload = {
      storeId: 1,
      skuId: 'sku-1',
      storeLabelsOnReceive: true,
      lines: [{ columnLabel: '7', rowLabel: 'A', quantity: 2 }],
    }
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ id: 'mr-1' }))

    await createManualReceipt(payload)

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/inventory/manual-receipts',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )
  })
})
