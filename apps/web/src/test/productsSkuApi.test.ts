import { beforeEach, describe, expect, it, vi } from 'vitest'
import { productsSkuApi } from '../services/productsSkuApi'

function ok(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response
}

describe('productsSkuApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('serializes SKU-only pattern filters separately from broad q search', async () => {
    vi.mocked(fetch).mockResolvedValue(ok([]))

    await productsSkuApi.list({ sku: 'AB*01', q: 'widget' })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/products/skus?q=widget&sku=AB*01',
      expect.any(Object),
    )
  })
})
