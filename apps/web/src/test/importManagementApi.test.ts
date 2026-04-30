import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addImportShipmentLine,
  applyImportInvoiceMatchSuggestions,
  approveImportShipmentLineInvoiceMatch,
  fetchImportShipmentAuditEvents,
  fetchImportInvoiceMatchSuggestions,
  fetchImportOtbCommitments,
  fetchImportShipmentLineCandidates,
  fetchImportShipments,
  importWorkbook,
  markImportPayablePaid,
  matchImportShipmentLineInvoice,
  recordImportVerificationCheck,
  receiveImportShipmentEstimated,
  removeImportShipmentLine,
  updateImportShipmentLine,
  updateImportSuggestedPriceStatus,
  voidImportPayable,
} from '../services/importManagementApi'

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

describe('importManagementApi contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('maps shipment list query params', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ data: [], pagination: {} }))

    await fetchImportShipments({
      page: 2,
      pageSize: 50,
      status: 'IN_TRANSIT',
      q: 'PANAMA',
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/import-management/shipments')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('pageSize')).toBe('50')
    expect(url.searchParams.get('status')).toBe('IN_TRANSIT')
    expect(url.searchParams.get('q')).toBe('PANAMA')
  })

  it('maps OTB commitment filters for estimated and final import cost consumption', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ commitments: [], summary: [] }))

    await fetchImportOtbCommitments({
      buyer: 'IB',
      monthFrom: '2026-05',
      monthTo: '2026-06',
      departmentNumber: 56,
      categoryNumber: 556,
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/import-management/otb-commitments')
    expect(url.searchParams.get('buyer')).toBe('IB')
    expect(url.searchParams.get('monthFrom')).toBe('2026-05')
    expect(url.searchParams.get('monthTo')).toBe('2026-06')
    expect(url.searchParams.get('departmentNumber')).toBe('56')
    expect(url.searchParams.get('categoryNumber')).toBe('556')
  })

  it('maps PO-first expected line candidate filters', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse([]))

    await fetchImportShipmentLineCandidates('shipment-1', {
      q: 'PO-1001',
      vendorCode: 'KSF',
      buyer: 'IB',
      sourceCurrency: 'CNY',
      incotermCode: 'FOB',
      poStatus: 'CONFIRMED',
    })

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/import-management/shipments/shipment-1/po-line-candidates')
    expect(url.searchParams.get('q')).toBe('PO-1001')
    expect(url.searchParams.get('vendorCode')).toBe('KSF')
    expect(url.searchParams.get('buyer')).toBe('IB')
    expect(url.searchParams.get('sourceCurrency')).toBe('CNY')
    expect(url.searchParams.get('incotermCode')).toBe('FOB')
    expect(url.searchParams.get('poStatus')).toBe('CONFIRMED')
  })

  it('posts PO-first expected shipment lines before invoices exist', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ shipmentLines: [] }))

    await addImportShipmentLine('shipment-1', {
      purchaseOrderLineId: 'po-line-1',
      expectedQuantity: 10,
      estimatedLandedUnitCostHnl: 225,
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/import-management/shipments/shipment-1/shipment-lines',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseOrderLineId: 'po-line-1',
          expectedQuantity: 10,
          estimatedLandedUnitCostHnl: 225,
        }),
      }),
    )
  })

  it('updates and removes PO-first expected shipment lines', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ shipmentLines: [] }))

    await updateImportShipmentLine('shipment-line-1', {
      expectedQuantity: 8,
      notes: 'Factory partial shipment',
    })
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/import-management/shipment-lines/shipment-line-1',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedQuantity: 8,
          notes: 'Factory partial shipment',
        }),
      }),
    )

    await removeImportShipmentLine('shipment-line-1')
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/import-management/shipment-lines/shipment-line-1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('matches later supplier invoice lines back to expected shipment lines', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ shipmentLines: [] }))

    await matchImportShipmentLineInvoice('shipment-line-1', {
      invoiceLineId: 'invoice-line-1',
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/import-management/shipment-lines/shipment-line-1/invoice-line',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceLineId: 'invoice-line-1' }),
      }),
    )
  })

  it('loads invoice match suggestions for expected shipment lines', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse([]))

    await fetchImportInvoiceMatchSuggestions('shipment-1')

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/import-management/shipments/shipment-1/invoice-match-suggestions')
  })

  it('loads shipment audit events for import workflow history', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ events: [{ id: 'audit-1' }] }))

    const events = await fetchImportShipmentAuditEvents('shipment-1')

    const url = getCalledUrl()
    expect(url.pathname).toBe('/api/v1/import-management/shipments/shipment-1/audit-events')
    expect(url.searchParams.get('limit')).toBe('100')
    expect(events).toEqual([{ id: 'audit-1' }])
  })

  it('applies high-confidence invoice match suggestions in bulk', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ shipment: {}, appliedCount: 2, skippedCount: 0 }))

    await applyImportInvoiceMatchSuggestions('shipment-1', {
      minScore: 85,
      allowWarnings: false,
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/import-management/shipments/shipment-1/invoice-match-suggestions/apply',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minScore: 85,
          allowWarnings: false,
        }),
      }),
    )
  })

  it('approves and clears invoice match mismatch review state', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ shipmentLines: [] }))

    await approveImportShipmentLineInvoiceMatch('shipment-line-1', {
      approved: true,
      reason: 'Supplier short-shipped and buyer approved.',
    })

    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/import-management/shipment-lines/shipment-line-1/invoice-match-approval',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved: true,
          reason: 'Supplier short-shipped and buyer approved.',
        }),
      }),
    )

    await approveImportShipmentLineInvoiceMatch('shipment-line-1', { approved: false })

    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/import-management/shipment-lines/shipment-line-1/invoice-match-approval',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: false }),
      }),
    )
  })

  it('normalizes estimated receiving dates before posting', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ action: 'RECEIVE_ESTIMATED' }))
    const receivedAt = { format: vi.fn(() => '2026-05-12') }

    await receiveImportShipmentEstimated('shipment-1', {
      locationId: '1',
      receivedAt: receivedAt as unknown as string,
      containerId: 'container-1',
      shipmentLineIds: ['shipment-line-1'],
      goodsInTransitRecordIds: ['git-1'],
      auditReason: 'Warehouse needs stock before final liquidation.',
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/import-management/shipments/shipment-1/receiving-handoff/receive-estimated',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: '1',
          receivedAt: '2026-05-12',
          containerId: 'container-1',
          shipmentLineIds: ['shipment-line-1'],
          goodsInTransitRecordIds: ['git-1'],
          auditReason: 'Warehouse needs stock before final liquidation.',
        }),
      }),
    )
  })

  it('posts suggested-price status updates through the pricing handoff endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ suggestedPrices: [] }))

    await updateImportSuggestedPriceStatus('suggested-1', { approvalStatus: 'POSTED' })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/import-management/suggested-prices/suggested-1/status',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalStatus: 'POSTED' }),
      }),
    )
  })

  it('marks an import payable paid with normalized payment date', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ payables: [] }))
    const paidAt = { format: vi.fn(() => '2026-05-30') }

    await markImportPayablePaid('handoff-1', {
      paymentReference: 'WIRE-123',
      paidAt: paidAt as unknown as string,
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/import-management/payables/handoff-1/mark-paid',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentReference: 'WIRE-123',
          paidAt: '2026-05-30',
        }),
      }),
    )
  })

  it('voids an import payable handoff with a required reason', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ payables: [] }))

    await voidImportPayable('handoff-1', {
      reason: 'Duplicate freight invoice.',
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/import-management/payables/handoff-1/void',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Duplicate freight invoice.',
        }),
      }),
    )
  })

  it('records verification checks through the shipment upsert endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ verificationChecks: [] }))

    await recordImportVerificationCheck('shipment-1', {
      checkCode: 'CUSTOMS_POLICY_TOTAL',
      status: 'PASS',
      expectedHnlAmount: 2450,
      actualHnlAmount: 2450,
      varianceHnlAmount: 0,
      message: 'Invoice and charge totals match liquidation.',
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/import-management/shipments/shipment-1/verification-checks',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkCode: 'CUSTOMS_POLICY_TOTAL',
          status: 'PASS',
          expectedHnlAmount: 2450,
          actualHnlAmount: 2450,
          varianceHnlAmount: 0,
          message: 'Invoice and charge totals match liquidation.',
        }),
      }),
    )
  })

  it('sends workbook uploads as multipart form data with normalized FX dates', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ shipment: { id: 'shipment-1' } }))
    const file = new File(['xlsx'], 'panama.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const defaultFxDate = { format: vi.fn(() => '2026-04-29') }

    await importWorkbook(file, {
      defaultFxRate: 24.5,
      defaultFxDate: defaultFxDate as unknown as string,
      sourceCurrency: 'USD',
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/import-management/workbooks/import',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
    )
    const body = vi.mocked(fetch).mock.calls[0]?.[1]?.body as FormData
    expect(body.get('workbook')).toBe(file)
    expect(body.get('defaultFxRate')).toBe('24.5')
    expect(body.get('defaultFxDate')).toBe('2026-04-29')
    expect(body.get('sourceCurrency')).toBe('USD')
  })
})
