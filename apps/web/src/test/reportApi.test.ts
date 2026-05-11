import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainFilterContractError } from '../services/domainFilterContract'
import {
  fetchOnHandDrillDown,
  fetchSalesPerformanceDrillDown,
  fetchTurnoverDrillDown,
  fetchSellThroughDrillDown,
  fetchSalesPivot,
  getSalesAnalysisXlsxUrl,
  ReportApiError,
} from '../services/reportApi'

function buildOkResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response
}

function getCalledUrl(): URL {
  const called = vi.mocked(fetch).mock.calls[0]?.[0]
  return new URL(String(called), 'http://localhost')
}

describe('reportApi drill-down query mapping', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(buildOkResponse({})))
  })

  it('maps on-hand drill-down query params', async () => {
    await fetchOnHandDrillDown('FORMAL', 556, {
      page: 2,
      pageSize: 100,
      sort: 'costValue',
      order: 'desc',
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/reports/on-hand')
    expect(url.searchParams.get('department')).toBe('FORMAL')
    expect(url.searchParams.get('category')).toBe('556')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('pageSize')).toBe('100')
    expect(url.searchParams.get('sort')).toBe('costValue')
    expect(url.searchParams.get('order')).toBe('desc')
  })

  it('maps sales drill-down query params', async () => {
    await fetchSalesPerformanceDrillDown('2026-01-01', '2026-01-31', 'CASUAL', 557, {
      page: 3,
      pageSize: 25,
      sort: 'totalRevenue',
      order: 'desc',
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/reports/sales-performance')
    expect(url.searchParams.get('startDate')).toBe('2026-01-01')
    expect(url.searchParams.get('endDate')).toBe('2026-01-31')
    expect(url.searchParams.get('department')).toBe('CASUAL')
    expect(url.searchParams.get('category')).toBe('557')
    expect(url.searchParams.get('page')).toBe('3')
    expect(url.searchParams.get('pageSize')).toBe('25')
    expect(url.searchParams.get('sort')).toBe('totalRevenue')
    expect(url.searchParams.get('order')).toBe('desc')
  })

  it('maps turnover drill-down query params', async () => {
    await fetchTurnoverDrillDown('FIESTA', '2026-02-01', '2026-02-28', 558, {
      page: 4,
      pageSize: 75,
      sort: 'turnoverRatio',
      order: 'asc',
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/reports/inventory-turnover')
    expect(url.searchParams.get('department')).toBe('FIESTA')
    expect(url.searchParams.get('startDate')).toBe('2026-02-01')
    expect(url.searchParams.get('endDate')).toBe('2026-02-28')
    expect(url.searchParams.get('category')).toBe('558')
    expect(url.searchParams.get('page')).toBe('4')
    expect(url.searchParams.get('pageSize')).toBe('75')
    expect(url.searchParams.get('sort')).toBe('turnoverRatio')
    expect(url.searchParams.get('order')).toBe('asc')
  })

  it('maps sell-through drill-down query params', async () => {
    await fetchSellThroughDrillDown('BOOTS', '2026-03-01', '2026-03-31', 559, {
      page: 5,
      pageSize: 60,
      sort: 'sellThroughPct',
      order: 'asc',
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/reports/sell-through')
    expect(url.searchParams.get('department')).toBe('BOOTS')
    expect(url.searchParams.get('startDate')).toBe('2026-03-01')
    expect(url.searchParams.get('endDate')).toBe('2026-03-31')
    expect(url.searchParams.get('category')).toBe('559')
    expect(url.searchParams.get('page')).toBe('5')
    expect(url.searchParams.get('pageSize')).toBe('60')
    expect(url.searchParams.get('sort')).toBe('sellThroughPct')
    expect(url.searchParams.get('order')).toBe('asc')
  })

  it('rejects drill-down requests with category and no department', async () => {
    await expect(
      fetchOnHandDrillDown('', 560, {
        page: 1,
        pageSize: 50,
      }),
    ).rejects.toBeInstanceOf(DomainFilterContractError)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('surfaces API validation errors as ReportApiError', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'department: Invalid enum value',
        },
      }),
    } as Response)

    await expect(
      fetchTurnoverDrillDown('FORMAL', '2026-02-01', '2026-02-28'),
    ).rejects.toMatchObject({
      name: 'ReportApiError',
      status: 400,
      code: 'VALIDATION_ERROR',
    } as Partial<ReportApiError>)
  })

  it('maps custom sales pivot attribute levels', async () => {
    await fetchSalesPivot({
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      variant: 'custom',
      levels: ['department', 'category', 'attribute'],
      chains: ['unlimited'],
      departments: [10],
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/reports/sales/sales-pivot')
    expect(url.searchParams.get('variant')).toBe('custom')
    expect(url.searchParams.get('level1')).toBe('department')
    expect(url.searchParams.get('level2')).toBe('category')
    expect(url.searchParams.get('level3')).toBe('attribute')
    expect(url.searchParams.get('chains')).toBe('unlimited')
    expect(url.searchParams.get('departments')).toBe('10')
  })

  it('builds Sales Analysis XLSX export URLs with the full query surface', () => {
    const url = new URL(getSalesAnalysisXlsxUrl({
      dimension: 'CATEGORY',
      reportType: 'SKU_DETAIL',
      storeOption: 'COMBINE',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      stores: [1, 2],
      chains: ['NORTH'],
      sectors: [5],
      departments: [50],
      categories: [216],
      seasons: ['A'],
      groups: ['IBL'],
      vendorsRaw: 'AGO',
      skusRaw: '6608*',
      priorYear: true,
      includeAttributes: true,
      includeOnOrder: true,
      exportLayout: 'hierarchy',
      hierarchyDepth: 3,
      level1: 'department',
      level2: 'category',
      level3: 'attribute',
      groupOrder: 'LEFT_GROUP_ASC',
      attributeDimensionCode: 'color',
      showPercentOfTotal: true,
    }), 'http://localhost')

    expect(url.pathname).toBe('/api/v1/reports/sales/sales-analysis')
    expect(url.searchParams.get('format')).toBe('xlsx')
    expect(url.searchParams.get('stores')).toBe('1,2')
    expect(url.searchParams.get('chains')).toBe('NORTH')
    expect(url.searchParams.get('sectors')).toBe('5')
    expect(url.searchParams.get('departments')).toBe('50')
    expect(url.searchParams.get('categories')).toBe('216')
    expect(url.searchParams.get('seasons')).toBe('A')
    expect(url.searchParams.get('groups')).toBe('IBL')
    expect(url.searchParams.get('vendorsRaw')).toBe('AGO')
    expect(url.searchParams.get('skusRaw')).toBe('6608*')
    expect(url.searchParams.get('priorYear')).toBe('true')
    expect(url.searchParams.get('includeAttributes')).toBe('true')
    expect(url.searchParams.get('includeOnOrder')).toBe('true')
    expect(url.searchParams.get('exportLayout')).toBe('hierarchy')
    expect(url.searchParams.get('hierarchyDepth')).toBe('3')
    expect(url.searchParams.get('level1')).toBe('department')
    expect(url.searchParams.get('level2')).toBe('category')
    expect(url.searchParams.get('level3')).toBe('attribute')
    expect(url.searchParams.get('groupOrder')).toBe('LEFT_GROUP_ASC')
    expect(url.searchParams.get('attributeDimensionCode')).toBe('color')
    expect(url.searchParams.get('showPercentOfTotal')).toBe('true')
  })
})
