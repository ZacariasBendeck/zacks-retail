import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildMovementReconciliationQueryParams,
  buildMovementTimelineQueryParams,
  fetchMovementTimeline,
  mapMovementReconciliationRow,
  mapMovementTimelineRow,
} from '../services/inventoryMovementApi'

function buildOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response
}

describe('inventoryMovementApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('builds timeline query params with server pagination, sorting, and filters', () => {
    const params = buildMovementTimelineQueryParams({
      page: 3,
      pageSize: 100,
      sort: 'movementAt',
      order: 'desc',
      skuCode: 'AB-12',
      locationId: 'loc-main',
      startDate: '2026-04-01',
      endDate: '2026-04-08',
      movementTypes: ['sale', 'adjustment'],
      macroDepartments: ['FORMAL', 'CASUAL'],
      categoryMin: 556,
      categoryMax: 599,
    })

    expect(params.get('page')).toBe('3')
    expect(params.get('pageSize')).toBe('100')
    expect(params.get('sort')).toBe('movementAt')
    expect(params.get('order')).toBe('desc')
    expect(params.get('skuCode')).toBe('AB-12')
    expect(params.get('locationId')).toBe('loc-main')
    expect(params.get('startDate')).toBe('2026-04-01')
    expect(params.get('endDate')).toBe('2026-04-08')
    expect(params.get('categoryMin')).toBe('556')
    expect(params.get('categoryMax')).toBe('599')
    expect(params.getAll('movementType')).toEqual(['sale', 'adjustment'])
    expect(params.getAll('macroDepartment')).toEqual(['FORMAL', 'CASUAL'])
  })

  it('builds reconciliation query params with shared filter contract', () => {
    const params = buildMovementReconciliationQueryParams({
      page: 1,
      pageSize: 25,
      sort: 'lastMovementAt',
      order: 'asc',
      macroDepartments: ['BOOTS'],
      categoryMin: 560,
    })

    expect(params.get('page')).toBe('1')
    expect(params.get('pageSize')).toBe('25')
    expect(params.get('sort')).toBe('lastMovementAt')
    expect(params.get('order')).toBe('asc')
    expect(params.get('categoryMin')).toBe('560')
    expect(params.getAll('macroDepartment')).toEqual(['BOOTS'])
  })

  it('maps timeline rows from snake_case payload aliases and derives source-document references', () => {
    const mapped = mapMovementTimelineRow({
      id: 'ml-1',
      sku_id: 'sku-1',
      sku_code: 'SKU-001',
      location_id: 'loc-1',
      location_code: 'MAIN',
      movement_type: 'sale',
      quantity_delta: '-3',
      unit_cost_snapshot: 42.5,
      movement_at: '2026-04-08T12:00:00.000Z',
      macro_department: 'FORMAL',
      category: 560,
      source_sale_id: 9102,
      source_document_number: 'INV-9102',
    })

    expect(mapped).toEqual(
      expect.objectContaining({
        id: 'ml-1',
        skuId: 'sku-1',
        skuCode: 'SKU-001',
        locationId: 'loc-1',
        movementType: 'sale',
        quantityDelta: -3,
        unitCostSnapshot: 42.5,
        macroDepartment: 'FORMAL',
        category: 560,
        sourceDocumentType: 'sale',
        sourceDocumentId: '9102',
        sourceDocumentNumber: 'INV-9102',
      }),
    )
  })

  it('maps reconciliation rows safely when optional fields are absent', () => {
    const mapped = mapMovementReconciliationRow({
      skuId: 'sku-2',
      skuCode: 'SKU-002',
      locationId: 'loc-2',
      expected_stock_delta: '7',
      movement_row_count: 4,
    })

    expect(mapped.id).toBe('sku-2:loc-2')
    expect(mapped.expectedStockDelta).toBe(7)
    expect(mapped.movementRowCount).toBe(4)
    expect(mapped.firstMovementAt).toBeNull()
    expect(mapped.lastMovementAt).toBeNull()
    expect(mapped.sourceDocumentId).toBeUndefined()
  })

  it('warns when an unknown movement type is received and defaults to adjustment', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const mapped = mapMovementTimelineRow({
      sku_id: 'sku-9',
      location_id: 'loc-9',
      movement_type: 'warehouse_recount',
      movement_at: '2026-04-08T12:00:00.000Z',
    })

    expect(mapped.movementType).toBe('adjustment')
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('fetches timeline data with centralized mapping and pagination envelope', async () => {
    vi.mocked(fetch).mockResolvedValue(
      buildOkResponse({
        data: [
          {
            id: 'ml-2',
            sku_id: 'sku-4',
            sku_code: 'SKU-004',
            location_id: 'loc-8',
            movement_type: 'transfer_in',
            quantity_delta: 10,
            movement_at: '2026-04-08T10:00:00.000Z',
            source_transfer_line_id: 'tr-1',
          },
        ],
        pagination: { page: 2, pageSize: 50, totalItems: 501, totalPages: 11 },
      }),
    )

    const result = await fetchMovementTimeline({
      page: 2,
      pageSize: 50,
      sort: 'movementAt',
      order: 'desc',
      movementTypes: ['transfer_in'],
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/inventory/movements/timeline?page=2&pageSize=50&sort=movementAt&order=desc&movementType=transfer_in',
    )
    expect(result.pagination.totalItems).toBe(501)
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'ml-2',
        sourceDocumentType: 'transfer',
        sourceDocumentId: 'tr-1',
      }),
    )
  })
})
