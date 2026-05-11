import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supplierQuotationsApi } from '../services/supplierQuotationsApi'

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response
}

function calledUrl(callIndex = 0): URL {
  return new URL(String(vi.mocked(fetch).mock.calls[callIndex]?.[0]), 'http://localhost')
}

describe('supplierQuotationsApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists quotations with filters', async () => {
    vi.mocked(fetch).mockResolvedValue(ok([]))

    await supplierQuotationsApi.list({ status: 'DRAFT', vendorCode: 'ABCD', q: 'loafer', pageSize: 25 })

    const url = calledUrl()
    expect(url.pathname).toBe('/api/v1/purchasing/supplier-quotations')
    expect(url.searchParams.get('status')).toBe('DRAFT')
    expect(url.searchParams.get('vendorCode')).toBe('ABCD')
    expect(url.searchParams.get('q')).toBe('loafer')
    expect(url.searchParams.get('pageSize')).toBe('25')
  })

  it('creates a quotation and adds a style line', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(ok({ id: 'q-1' }))
      .mockResolvedValueOnce(ok({ id: 'l-1' }))

    await supplierQuotationsApi.create({ vendorCode: 'ABCD', buyer: 'buyer' })
    await supplierQuotationsApi.addLine('q-1', { supplierStyle: 'LFR-100', unitCost: 10, quotedQty: 24 })

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/purchasing/supplier-quotations', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ vendorCode: 'ABCD', buyer: 'buyer' }),
    }))
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/v1/purchasing/supplier-quotations/q-1/lines', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ supplierStyle: 'LFR-100', unitCost: 10, quotedQty: 24 }),
    }))
  })

  it('pins a related SKU and converts to PO', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(ok({ id: 'rel-1' }))
      .mockResolvedValueOnce(ok({ purchaseOrders: [{ id: 'po-1' }], createdSkuIds: [] }))

    await supplierQuotationsApi.addRelation('l-1', {
      relationType: 'SIMILAR',
      targetType: 'SKU',
      targetId: 'sku-1',
    })
    await supplierQuotationsApi.convertToPo('q-1')

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/purchasing/supplier-quotations/lines/l-1/relations', expect.objectContaining({
      method: 'POST',
    }))
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/v1/purchasing/supplier-quotations/q-1/convert-to-po', expect.objectContaining({
      method: 'POST',
    }))
  })
})
