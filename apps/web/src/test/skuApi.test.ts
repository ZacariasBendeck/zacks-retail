import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analyzeImage, fetchVendors } from '../services/skuApi'

function buildOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response
}

describe('skuApi canonical contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('reads vendor list from paginated contract envelope', async () => {
    const vendors = [
      { id: 'vendor-1', name: 'Alpha Shoes' },
      { id: 'vendor-2', name: 'Bravo Imports' },
    ]
    vi.mocked(fetch).mockResolvedValue(
      buildOkResponse({
        data: vendors,
        pagination: { page: 1, pageSize: 200, totalItems: 2, totalPages: 1 },
      }),
    )

    const result = await fetchVendors()

    expect(fetch).toHaveBeenCalledWith('/api/v1/vendors?page=1&pageSize=200&sort=name&order=asc')
    expect(result).toEqual(vendors)
  })

  it('returns canonical image analysis payload with raw and mapped fields', async () => {
    const apiPayload = {
      raw: {
        shoe_type: 'Pump',
        heel_height: 'High',
        heel_shape: null,
        toe_shape: null,
        color_family: 'Black',
        upper_material: 'Leather',
        finish: null,
        pattern: null,
        occasion: 'Formal',
        department: 'FORMAL',
        color: 'Black',
        description: 'Black formal pump',
        category: '560',
      },
      mapped: {
        shoeTypeId: 10,
        colorId: 2,
      },
      config: [],
    }
    vi.mocked(fetch).mockResolvedValue(buildOkResponse(apiPayload))

    const file = new File(['binary'], 'pump.jpg', { type: 'image/jpeg' })
    const result = await analyzeImage({ file, family: 'zapatos' })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/skus/analyze-image',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
    )
    expect(result).toEqual(apiPayload)
  })
})
