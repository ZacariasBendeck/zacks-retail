import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  departmentsApi,
  categoriesApi,
  groupsApi,
  keywordsApi,
  sectorsApi,
  returnCodesApi,
  promotionCodesApi,
  sizeTypesApi,
  seasonsApi,
  nrfCodesApi,
  TaxonomyApiError,
} from '../services/productsTaxonomyApi'

function ok(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

function err(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => body,
  } as Response
}

function urlOf(call: number = 0) {
  const c = vi.mocked(fetch).mock.calls[call]?.[0]
  return String(c)
}

function initOf(call: number = 0) {
  return vi.mocked(fetch).mock.calls[call]?.[1]
}

describe('productsTaxonomyApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('lists departments from /api/v1/taxonomy/departments', async () => {
    vi.mocked(fetch).mockResolvedValue(ok([]))
    await departmentsApi.list()
    expect(urlOf()).toBe('/api/v1/taxonomy/departments')
  })

  it('POSTs to create a department', async () => {
    vi.mocked(fetch).mockResolvedValue(
      ok({ number: 1, description: 'a', begCateg: 1, endCateg: 2, dateLastChanged: null }, 201),
    )
    await departmentsApi.create({ number: 1, description: 'a', begCateg: 1, endCateg: 2 })
    expect(urlOf()).toBe('/api/v1/taxonomy/departments')
    const init = initOf()
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      number: 1,
      description: 'a',
      begCateg: 1,
      endCateg: 2,
    })
  })

  it('maps backend error payloads to TaxonomyApiError', async () => {
    vi.mocked(fetch).mockResolvedValue(
      err(422, { error: { code: 'CONSTRAINT_VIOLATION', message: 'bad' } }),
    )
    await expect(departmentsApi.create({ number: 0, description: '', begCateg: 0, endCateg: 0 })).rejects.toMatchObject({
      name: 'TaxonomyApiError',
      status: 422,
      code: 'CONSTRAINT_VIOLATION',
      message: 'bad',
    })
  })

  it('returns undefined for 204 DELETE responses', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 204, json: async () => undefined } as Response)
    const result = await categoriesApi.remove(5)
    expect(result).toBeUndefined()
    expect(initOf()?.method).toBe('DELETE')
    expect(urlOf()).toBe('/api/v1/taxonomy/categories/5')
  })

  it('URL-encodes string keys for groups/keywords/promotion codes', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ code: 'A/B', description: 'x', dateLastChanged: null }))
    await groupsApi.get('A/B')
    expect(urlOf()).toBe('/api/v1/taxonomy/groups/A%2FB')

    vi.mocked(fetch).mockResolvedValue(ok([]))
    await keywordsApi.remove('foo bar')
    expect(urlOf(1)).toBe('/api/v1/taxonomy/keywords/foo%20bar')
  })

  it('sends sector CRUD to the right endpoints', async () => {
    vi.mocked(fetch).mockResolvedValue(ok([]))
    await sectorsApi.list()
    expect(urlOf()).toBe('/api/v1/taxonomy/sectors')
  })

  it('sends return code CRUD to the right endpoints', async () => {
    vi.mocked(fetch).mockResolvedValue(ok([]))
    await returnCodesApi.list()
    expect(urlOf()).toBe('/api/v1/taxonomy/return-codes')
  })

  it('sends promotion code CRUD to the right endpoints', async () => {
    vi.mocked(fetch).mockResolvedValue(ok([]))
    await promotionCodesApi.list()
    expect(urlOf()).toBe('/api/v1/taxonomy/promotion-codes')
  })

  it('sends size type CRUD to the right endpoints', async () => {
    vi.mocked(fetch).mockResolvedValue(ok([]))
    await sizeTypesApi.list()
    expect(urlOf()).toBe('/api/v1/taxonomy/size-types')
  })

  it('sends NRF lookup with query params', async () => {
    vi.mocked(fetch).mockResolvedValue(ok([]))
    await nrfCodesApi.lookup(10, 2, 3)
    const url = new URL(urlOf(), 'http://localhost')
    expect(url.pathname).toBe('/api/v1/taxonomy/nrf-codes')
    expect(url.searchParams.get('sizeTypeCode')).toBe('10')
    expect(url.searchParams.get('rowLabel')).toBe('2')
    expect(url.searchParams.get('columnPosition')).toBe('3')
  })

  it('lists seasons (read-only)', async () => {
    vi.mocked(fetch).mockResolvedValue(ok([]))
    await seasonsApi.list()
    expect(urlOf()).toBe('/api/v1/taxonomy/seasons')
  })

  it('emits a TaxonomyApiError with a graceful fallback when backend body is missing', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('bad JSON')
      },
    } as unknown as Response)
    await expect(departmentsApi.list()).rejects.toThrow(TaxonomyApiError)
  })
})
