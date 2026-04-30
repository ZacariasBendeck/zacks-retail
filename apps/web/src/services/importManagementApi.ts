import type {
  AllocateImportLandedCostPayload,
  AddImportShipmentLinePayload,
  ApplyImportInvoiceMatchSuggestionsPayload,
  ApplyImportInvoiceMatchSuggestionsResult,
  ApproveImportShipmentLineInvoiceMatchPayload,
  CreateGoodsInTransitForShipmentPayload,
  CreateGoodsInTransitForShipmentResult,
  CreateGoodsInTransitRecordPayload,
  CreateImportChargePayload,
  CreateImportContainerPayload,
  CreateImportInvoiceLinePayload,
  CreateImportPurchaseOrderDraftPayload,
  CreateImportPurchaseOrderDraftResult,
  CreateImportShipmentPayload,
  CreateImportSupplierInvoicePayload,
  ImportPurchaseOrderLinkingEnvelope,
  ImportInvoiceMatchSuggestion,
  ImportShipmentLineCandidate,
  ImportAllocationResult,
  ImportLiquidationReadiness,
  ImportOtbCommitmentsEnvelope,
  ImportOtbCommitmentsParams,
  ImportPayablesEnvelope,
  ImportReceivingActionResult,
  ImportReceivingHandoffEnvelope,
  ImportShipmentAuditEvent,
  ImportWorkbookImportResult,
  ImportWorkbookOptionsPayload,
  ImportWorkbookPreview,
  ImportShipmentDetail,
  ImportShipmentListEnvelope,
  ImportShipmentListParams,
  LinkImportInvoiceLineToPoPayload,
  LinkImportInvoiceLineToSkuPayload,
  MarkImportPayablePaidPayload,
  MarkImportPayablesSentPayload,
  MatchImportShipmentLineInvoicePayload,
  RecordImportVerificationCheckPayload,
  ReceiveImportShipmentPayload,
  StageImportPayablesResult,
  UpdateGoodsInTransitRecordPayload,
  UpdateImportChargePayload,
  UpdateImportContainerPayload,
  UpdateImportInvoiceLinePayload,
  UpdateImportShipmentLinePayload,
  UpdateImportShipmentStatusPayload,
  UpdateImportSuggestedPriceStatusPayload,
  UpdateImportSupplierInvoicePayload,
  VoidImportPayablePayload,
} from '../types/importManagement'

async function throwImportApiError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new Error(body?.error?.message ?? body?.message ?? fallback)
}

function dateString(value: unknown): string | null | undefined {
  if (!value) return value as null | undefined
  if (typeof value === 'string') return value
  const maybeDayjs = value as { format?: (format: string) => string }
  if (typeof maybeDayjs.format === 'function') return maybeDayjs.format('YYYY-MM-DD')
  return String(value)
}

export function normalizeImportPayloadDates<T extends Record<string, unknown>>(payload: T): T {
  const next = { ...payload }
  for (const key of [
    'expectedDepartureAt',
    'expectedArrivalAt',
    'actualArrivalAt',
    'invoiceDate',
    'fxDate',
    'defaultFxDate',
    'ownershipTransferAt',
    'expectedReceiptAt',
    'receivedAt',
    'paidAt',
  ]) {
    if (key in next) {
      next[key as keyof T] = dateString(next[key as keyof T]) as T[keyof T]
    }
  }
  return next
}

function workbookFormData(file: File, payload: ImportWorkbookOptionsPayload = {}): FormData {
  const formData = new FormData()
  formData.append('workbook', file)
  const normalized = normalizeImportPayloadDates(payload as unknown as Record<string, unknown>)
  for (const [key, value] of Object.entries(normalized)) {
    if (value == null || value === '') continue
    formData.append(key, String(value))
  }
  return formData
}

export async function fetchImportShipments(
  params: ImportShipmentListParams,
  signal?: AbortSignal,
): Promise<ImportShipmentListEnvelope> {
  const qs = new URLSearchParams()
  qs.set('page', String(params.page))
  qs.set('pageSize', String(params.pageSize))
  if (params.status) qs.set('status', params.status)
  if (params.q?.trim()) qs.set('q', params.q.trim())

  const res = await fetch(`/api/v1/import-management/shipments?${qs.toString()}`, { signal })
  if (!res.ok) await throwImportApiError(res, 'Failed to load import shipments')
  return res.json()
}

export async function fetchImportShipment(shipmentId: string, signal?: AbortSignal): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}`, { signal })
  if (!res.ok) await throwImportApiError(res, 'Failed to load import shipment')
  return res.json()
}

export async function fetchImportOtbCommitments(
  params: ImportOtbCommitmentsParams = {},
  signal?: AbortSignal,
): Promise<ImportOtbCommitmentsEnvelope> {
  const qs = new URLSearchParams()
  if (params.buyer?.trim()) qs.set('buyer', params.buyer.trim())
  if (params.monthFrom) qs.set('monthFrom', params.monthFrom)
  if (params.monthTo) qs.set('monthTo', params.monthTo)
  if (params.departmentNumber != null) qs.set('departmentNumber', String(params.departmentNumber))
  if (params.categoryNumber != null) qs.set('categoryNumber', String(params.categoryNumber))

  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  const res = await fetch(`/api/v1/import-management/otb-commitments${suffix}`, { signal })
  if (!res.ok) await throwImportApiError(res, 'Failed to load import OTB commitments')
  return res.json()
}

export async function fetchImportLiquidationReadiness(
  shipmentId: string,
  signal?: AbortSignal,
): Promise<ImportLiquidationReadiness> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/liquidation-readiness`, { signal })
  if (!res.ok) await throwImportApiError(res, 'Failed to load liquidation readiness')
  return res.json()
}

export async function fetchImportPayables(
  shipmentId: string,
  signal?: AbortSignal,
): Promise<ImportPayablesEnvelope> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/payables`, { signal })
  if (!res.ok) await throwImportApiError(res, 'Failed to load import payables')
  return res.json()
}

export async function fetchImportShipmentAuditEvents(
  shipmentId: string,
  signal?: AbortSignal,
): Promise<ImportShipmentAuditEvent[]> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/audit-events?limit=100`, { signal })
  if (!res.ok) await throwImportApiError(res, 'Failed to load import shipment audit events')
  const body = await res.json()
  return body.events ?? []
}

export async function fetchImportReceivingHandoff(
  shipmentId: string,
  signal?: AbortSignal,
): Promise<ImportReceivingHandoffEnvelope> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/receiving-handoff`, { signal })
  if (!res.ok) await throwImportApiError(res, 'Failed to load import receiving handoff')
  return res.json()
}

export async function fetchImportPurchaseOrderLinking(
  shipmentId: string,
  signal?: AbortSignal,
): Promise<ImportPurchaseOrderLinkingEnvelope> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/purchase-order-linking`, { signal })
  if (!res.ok) await throwImportApiError(res, 'Failed to load import PO linking')
  return res.json()
}

export async function fetchImportShipmentLineCandidates(
  shipmentId: string,
  params: {
    q?: string;
    vendorCode?: string;
    buyer?: string;
    sourceCurrency?: string;
    incotermCode?: string;
    poStatus?: string;
  } = {},
  signal?: AbortSignal,
): Promise<ImportShipmentLineCandidate[]> {
  const qs = new URLSearchParams()
  if (params.q?.trim()) qs.set('q', params.q.trim())
  if (params.vendorCode?.trim()) qs.set('vendorCode', params.vendorCode.trim())
  if (params.buyer?.trim()) qs.set('buyer', params.buyer.trim())
  if (params.sourceCurrency?.trim()) qs.set('sourceCurrency', params.sourceCurrency.trim())
  if (params.incotermCode?.trim()) qs.set('incotermCode', params.incotermCode.trim())
  if (params.poStatus?.trim()) qs.set('poStatus', params.poStatus.trim())
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/po-line-candidates${suffix}`, { signal })
  if (!res.ok) await throwImportApiError(res, 'Failed to load PO-line candidates')
  return res.json()
}

export async function fetchImportInvoiceMatchSuggestions(
  shipmentId: string,
  signal?: AbortSignal,
): Promise<ImportInvoiceMatchSuggestion[]> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/invoice-match-suggestions`, { signal })
  if (!res.ok) await throwImportApiError(res, 'Failed to load invoice match suggestions')
  return res.json()
}

export async function applyImportInvoiceMatchSuggestions(
  shipmentId: string,
  payload: ApplyImportInvoiceMatchSuggestionsPayload,
): Promise<ApplyImportInvoiceMatchSuggestionsResult> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/invoice-match-suggestions/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to apply invoice match suggestions')
  return res.json()
}

export async function createImportShipment(payload: CreateImportShipmentPayload): Promise<ImportShipmentDetail> {
  const res = await fetch('/api/v1/import-management/shipments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeImportPayloadDates(payload as unknown as Record<string, unknown>)),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to create import shipment')
  return res.json()
}

export async function updateImportShipmentStatus(
  shipmentId: string,
  payload: UpdateImportShipmentStatusPayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to update import shipment status')
  return res.json()
}

export async function addImportShipmentLine(
  shipmentId: string,
  payload: AddImportShipmentLinePayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/shipment-lines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to add expected PO line')
  return res.json()
}

export async function updateImportShipmentLine(
  shipmentLineId: string,
  payload: UpdateImportShipmentLinePayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/shipment-lines/${shipmentLineId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to update expected PO line')
  return res.json()
}

export async function removeImportShipmentLine(shipmentLineId: string): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/shipment-lines/${shipmentLineId}`, {
    method: 'DELETE',
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to remove expected PO line')
  return res.json()
}

export async function matchImportShipmentLineInvoice(
  shipmentLineId: string,
  payload: MatchImportShipmentLineInvoicePayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/shipment-lines/${shipmentLineId}/invoice-line`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to match invoice line')
  return res.json()
}

export async function approveImportShipmentLineInvoiceMatch(
  shipmentLineId: string,
  payload: ApproveImportShipmentLineInvoiceMatchPayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/shipment-lines/${shipmentLineId}/invoice-match-approval`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to update invoice match approval')
  return res.json()
}

export async function addImportSupplierInvoice(
  shipmentId: string,
  payload: CreateImportSupplierInvoicePayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/supplier-invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeImportPayloadDates(payload as unknown as Record<string, unknown>)),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to add supplier invoice')
  return res.json()
}

export async function updateImportSupplierInvoice(
  invoiceId: string,
  payload: UpdateImportSupplierInvoicePayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/supplier-invoices/${invoiceId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeImportPayloadDates(payload as unknown as Record<string, unknown>)),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to update supplier invoice')
  return res.json()
}

export async function addImportInvoiceLine(
  invoiceId: string,
  payload: CreateImportInvoiceLinePayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/supplier-invoices/${invoiceId}/lines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeImportPayloadDates(payload as unknown as Record<string, unknown>)),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to add invoice line')
  return res.json()
}

export async function updateImportInvoiceLine(
  invoiceLineId: string,
  payload: UpdateImportInvoiceLinePayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/invoice-lines/${invoiceLineId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeImportPayloadDates(payload as unknown as Record<string, unknown>)),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to update invoice line')
  return res.json()
}

export async function addImportCharge(
  shipmentId: string,
  payload: CreateImportChargePayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/charges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeImportPayloadDates(payload as unknown as Record<string, unknown>)),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to add import charge')
  return res.json()
}

export async function updateImportCharge(
  chargeId: string,
  payload: UpdateImportChargePayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/charges/${chargeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeImportPayloadDates(payload as unknown as Record<string, unknown>)),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to update import charge')
  return res.json()
}

export async function allocateImportLandedCost(
  shipmentId: string,
  payload: AllocateImportLandedCostPayload,
): Promise<ImportAllocationResult> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/allocate-landed-cost`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to allocate landed cost')
  return res.json()
}

export async function addImportContainer(
  shipmentId: string,
  payload: CreateImportContainerPayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/containers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeImportPayloadDates(payload as unknown as Record<string, unknown>)),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to add import container')
  return res.json()
}

export async function updateImportContainer(
  containerId: string,
  payload: UpdateImportContainerPayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/containers/${containerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeImportPayloadDates(payload as unknown as Record<string, unknown>)),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to update import container')
  return res.json()
}

export async function addGoodsInTransitRecord(
  shipmentId: string,
  payload: CreateGoodsInTransitRecordPayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/goods-in-transit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeImportPayloadDates(payload as unknown as Record<string, unknown>)),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to add goods-in-transit record')
  return res.json()
}

export async function createGoodsInTransitForShipment(
  shipmentId: string,
  payload: CreateGoodsInTransitForShipmentPayload,
): Promise<CreateGoodsInTransitForShipmentResult> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/goods-in-transit/from-lines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeImportPayloadDates(payload as unknown as Record<string, unknown>)),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to create goods-in-transit records')
  return res.json()
}

export async function updateGoodsInTransitRecord(
  recordId: string,
  payload: UpdateGoodsInTransitRecordPayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/goods-in-transit/${recordId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeImportPayloadDates(payload as unknown as Record<string, unknown>)),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to update goods-in-transit record')
  return res.json()
}

export async function updateImportSuggestedPriceStatus(
  suggestedPriceId: string,
  payload: UpdateImportSuggestedPriceStatusPayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/suggested-prices/${suggestedPriceId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to update suggested-price status')
  return res.json()
}

export async function stageImportPayables(shipmentId: string): Promise<StageImportPayablesResult> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/payables/stage`, {
    method: 'POST',
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to stage import payables')
  return res.json()
}

export async function markImportPayablesSent(
  shipmentId: string,
  payload: MarkImportPayablesSentPayload = {},
): Promise<ImportPayablesEnvelope> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/payables/mark-sent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to mark import payables sent')
  return res.json()
}

export async function markImportPayablePaid(
  handoffId: string,
  payload: MarkImportPayablePaidPayload = {},
): Promise<ImportPayablesEnvelope> {
  const res = await fetch(`/api/v1/import-management/payables/${handoffId}/mark-paid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeImportPayloadDates(payload as unknown as Record<string, unknown>)),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to mark import payable paid')
  return res.json()
}

export async function voidImportPayable(
  handoffId: string,
  payload: VoidImportPayablePayload,
): Promise<ImportPayablesEnvelope> {
  const res = await fetch(`/api/v1/import-management/payables/${handoffId}/void`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to void import payable')
  return res.json()
}

export async function recordImportVerificationCheck(
  shipmentId: string,
  payload: RecordImportVerificationCheckPayload,
): Promise<ImportShipmentDetail> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/verification-checks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to record import verification check')
  return res.json()
}

export async function receiveImportShipmentEstimated(
  shipmentId: string,
  payload: ReceiveImportShipmentPayload,
): Promise<ImportReceivingActionResult> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/receiving-handoff/receive-estimated`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeImportPayloadDates(payload as unknown as Record<string, unknown>)),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to record estimated import receipt')
  return res.json()
}

export async function receiveImportShipmentFinal(
  shipmentId: string,
  payload: ReceiveImportShipmentPayload = {},
): Promise<ImportReceivingActionResult> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/receiving-handoff/receive-final`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeImportPayloadDates(payload as unknown as Record<string, unknown>)),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to record final import receipt')
  return res.json()
}

export async function createImportPurchaseOrderDraft(
  shipmentId: string,
  payload: CreateImportPurchaseOrderDraftPayload,
): Promise<CreateImportPurchaseOrderDraftResult> {
  const res = await fetch(`/api/v1/import-management/shipments/${shipmentId}/purchase-order-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to create import draft PO')
  return res.json()
}

export async function linkImportInvoiceLineToPurchaseOrderLine(
  invoiceLineId: string,
  payload: LinkImportInvoiceLineToPoPayload,
): Promise<ImportPurchaseOrderLinkingEnvelope> {
  const res = await fetch(`/api/v1/import-management/invoice-lines/${invoiceLineId}/purchase-order-line`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to link import line to PO line')
  return res.json()
}

export async function linkImportInvoiceLineToSku(
  invoiceLineId: string,
  payload: LinkImportInvoiceLineToSkuPayload,
): Promise<ImportPurchaseOrderLinkingEnvelope> {
  const res = await fetch(`/api/v1/import-management/invoice-lines/${invoiceLineId}/sku`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to map import line to SKU')
  return res.json()
}

export async function previewImportWorkbook(
  file: File,
  payload: ImportWorkbookOptionsPayload = {},
): Promise<ImportWorkbookPreview> {
  const res = await fetch('/api/v1/import-management/workbooks/preview', {
    method: 'POST',
    body: workbookFormData(file, payload),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to preview import workbook')
  return res.json()
}

export async function importWorkbook(
  file: File,
  payload: ImportWorkbookOptionsPayload = {},
): Promise<ImportWorkbookImportResult> {
  const res = await fetch('/api/v1/import-management/workbooks/import', {
    method: 'POST',
    body: workbookFormData(file, payload),
  })
  if (!res.ok) await throwImportApiError(res, 'Failed to import workbook')
  return res.json()
}
