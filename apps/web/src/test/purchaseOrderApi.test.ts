import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelPurchaseOrder,
  closePurchaseOrder,
  confirmPurchaseOrder,
  createPurchaseOrder,
  fetchPurchaseOrderOverdueExceptions,
  fetchPurchaseOrderHistory,
  fetchPurchaseOrders,
  receivePurchaseOrder,
  submitPurchaseOrder,
} from '../services/purchaseOrderApi'

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

describe('purchaseOrderApi contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('maps list query params including sort/order and filters', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ data: [], pagination: {} }))

    await fetchPurchaseOrders({
      page: 2,
      pageSize: 100,
      sort: 'poNumber',
      order: 'asc',
      status: 'SUBMITTED',
      vendorId: 'vendor-1',
      q: 'PO-0001',
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/purchase-orders')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('pageSize')).toBe('100')
    expect(url.searchParams.get('sort')).toBe('poNumber')
    expect(url.searchParams.get('order')).toBe('asc')
    expect(url.searchParams.get('status')).toBe('SUBMITTED')
    expect(url.searchParams.get('vendorId')).toBe('vendor-1')
    expect(url.searchParams.get('q')).toBe('PO-0001')
  })

  it('creates a purchase order through POST contract', async () => {
    const payload = {
      vendorId: 'vendor-1',
      notes: 'test note',
      lineItems: [{ skuId: 'sku-1', quantity: 12, unitCost: 45.5 }],
    }
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ id: 'po-1' }))

    await createPurchaseOrder(payload)

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/purchase-orders',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )
  })

  it('submits and confirms purchase orders with dedicated transition endpoints', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ id: 'po-1' }))

    await submitPurchaseOrder('po-1', { force: true, overrideReasonCode: 'OTB-OVR' })
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/purchase-orders/po-1/submit',
      expect.objectContaining({
        method: 'PATCH',
      }),
    )

    await confirmPurchaseOrder('po-1')
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/purchase-orders/po-1/confirm',
      expect.objectContaining({
        method: 'PATCH',
      }),
    )
  })

  it('cancels and closes purchase orders with dedicated endpoints', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ id: 'po-1' }))

    await cancelPurchaseOrder('po-1', 'Vendor delay')
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/purchase-orders/po-1/cancel',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ reason: 'Vendor delay' }),
      }),
    )

    await closePurchaseOrder('po-1')
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/purchase-orders/po-1/close',
      expect.objectContaining({
        method: 'PATCH',
      }),
    )
  })

  it('reads purchase order status history from history endpoint', async () => {
    const history = [
      { id: 'h1', poId: 'po-1', fromStatus: null, toStatus: 'DRAFT', changedBy: 'planner', reason: null, createdAt: '2026-04-01T00:00:00Z' },
    ]
    vi.mocked(fetch).mockResolvedValue(buildOkResponse(history))

    const result = await fetchPurchaseOrderHistory('po-1')

    expect(fetch).toHaveBeenCalledWith('/api/v1/purchase-orders/po-1/history')
    expect(result).toEqual(history)
  })

  it('reads overdue supplier exceptions from the dedicated endpoint', async () => {
    const overdue = [{ poId: 'po-1', poNumber: 'PO-001', daysOverdue: 3 }]
    vi.mocked(fetch).mockResolvedValue(buildOkResponse(overdue))

    const result = await fetchPurchaseOrderOverdueExceptions()

    expect(fetch).toHaveBeenCalledWith('/api/v1/purchase-orders/overdue-exceptions')
    expect(result).toEqual(overdue)
  })

  it('submits receive payload with discrepancy reason and audit references', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ id: 'po-1', status: 'PARTIALLY_RECEIVED' }))

    await receivePurchaseOrder('po-1', {
      lines: [{ lineId: 'line-1', quantityReceived: 2 }],
      locationId: 'loc-01',
      referenceNumber: 'RCV-001',
      receivedBy: 'warehouse.user',
      idempotencyKey: 'idem-123',
      reason: 'SHORT_SHIPMENT: Vendor short packed',
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/purchase-orders/po-1/receive',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: [{ lineId: 'line-1', quantityReceived: 2 }],
          locationId: 'loc-01',
          referenceNumber: 'RCV-001',
          receivedBy: 'warehouse.user',
          idempotencyKey: 'idem-123',
          reason: 'SHORT_SHIPMENT: Vendor short packed',
        }),
      }),
    )
  })
})
