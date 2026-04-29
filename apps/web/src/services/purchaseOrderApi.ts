import type {
  CreatePurchaseOrderPayload,
  LegacyPurchaseOrderDetail,
  UpdatePurchaseOrderPayload,
  SubmitPurchaseOrderPayload,
  PurchaseOrder,
  PoStatus,
  PoStatusHistory,
  PoListParams,
  PurchaseOrderSkuOption,
  PurchaseOrderVendorOption,
  PurchaseOrderBuyerOption,
  ReceivePurchaseOrderPayload,
  DuplicatePurchaseOrderPayload,
  ReplicatePurchaseOrderPayload,
  ReplicatePurchaseOrderResult,
  CombinePurchaseOrdersPayload,
  ReceivePurchaseOrderFullPayload,
  PoReceipt,
  OverduePoException,
  TransferOrder,
  TransferOrderListParams,
  TransferOrderStatus,
} from '../types/purchaseOrder'
import type { PaginationEnvelope } from '../types/sku'
import { MOCK_SKUS } from '../mock/skuData'

// Backend routes are available for purchase orders; keep mocks off by default.
const USE_MOCK = false

async function throwPoApiError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new Error(body?.error?.message ?? body?.message ?? fallback)
}

const VENDORS = [
  { id: 'v-01', name: 'Nike MX Distribution' },
  { id: 'v-02', name: 'Adidas Latinoamérica' },
  { id: 'v-03', name: 'Clarks Import Group' },
  { id: 'v-04', name: 'Puma Regional' },
  { id: 'v-05', name: 'Timberland PRO' },
]

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function generateMockPOs(count: number): PurchaseOrder[] {
  const pos: PurchaseOrder[] = []
  const statuses: PoStatus[] = ['CONFIRMED', 'PARTIALLY_RECEIVED', 'CONFIRMED', 'CONFIRMED']

  for (let i = 0; i < count; i++) {
    const vendor = randomItem(VENDORS)
    const status = randomItem(statuses)
    const lineCount = Math.floor(Math.random() * 5) + 1
    const lineItems = []

    for (let j = 0; j < lineCount; j++) {
      const sku = randomItem(MOCK_SKUS)
      const qtyOrdered = Math.floor(Math.random() * 50) + 10
      const qtyReceived = status === 'PARTIALLY_RECEIVED'
        ? Math.floor(Math.random() * qtyOrdered)
        : 0
      const unitCost = Math.round((sku.price * 0.5 + Math.random() * 20) * 100) / 100

      lineItems.push({
        id: crypto.randomUUID(),
        poId: '',
        skuId: sku.id,
        skuCode: sku.skuCode,
        brand: sku.style,
        sizeType: null,
        casePackId: null,
        casePackMultiplier: null,
        sizeCells: [],
        quantityOrdered: qtyOrdered,
        quantityReceived: qtyReceived,
        unitCost,
        lineTotal: qtyOrdered * unitCost,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }

    const poId = crypto.randomUUID()
    lineItems.forEach((li) => { li.poId = poId })

    pos.push({
      id: poId,
      poNumber: `PO-${String(1000 + i).padStart(5, '0')}`,
      billToStoreId: 1,
      shipToStoreId: 1,
      vendorId: vendor.id,
      vendorName: vendor.name,
      orderType: 'RO',
      classification: 'AT_ONCE',
      origin: 'MANUAL',
      originSourcePoId: null,
      confirmationNumber: null,
      accountNumber: null,
      terms: null,
      shipVia: null,
      backorderAllowed: false,
      splitShipment: false,
      programCode: null,
      storeLabelsOnReceive: false,
      buyer: null,
      orderDate: new Date().toISOString(),
      shipDate: null,
      cancelDate: null,
      paymentDate: null,
      status,
      notes: null,
      cancellationReason: null,
      createdBy: 'admin@benlow.com',
      lineItems,
      subtotal: lineItems.reduce((s, li) => s + li.lineTotal, 0),
      createdAt: new Date(Date.now() - Math.random() * 14 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  return pos.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

const MOCK_POS = generateMockPOs(15)

function generateMockReceipts(po: PurchaseOrder): PoReceipt[] {
  const receipts: PoReceipt[] = []
  let remainingReceived = po.lineItems.reduce((sum, li) => sum + li.quantityReceived, 0)
  if (remainingReceived <= 0) return receipts

  const eventCount = Math.min(2, Math.max(1, Math.ceil(remainingReceived / 12)))
  for (let i = 0; i < eventCount; i++) {
    const receiptId = crypto.randomUUID()
    const lines = po.lineItems
      .filter((line) => line.quantityReceived > 0)
      .map((line) => {
        const allocated = i === eventCount - 1
          ? Math.min(remainingReceived, line.quantityReceived)
          : Math.min(Math.max(1, Math.floor(line.quantityReceived / eventCount)), remainingReceived)
        remainingReceived -= allocated
        return {
          id: crypto.randomUUID(),
          receiptId,
          poLineId: line.id,
          skuId: line.skuId,
          skuCode: line.skuCode,
          style: line.brand,
          skuSizeId: null,
          quantityReceived: allocated,
          unitCost: line.unitCost,
          discrepancyReason: null,
          auditReference: null,
          createdAt: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
        }
      })
      .filter((line) => line.quantityReceived > 0)

    if (!lines.length) continue

    receipts.push({
      id: receiptId,
      poId: po.id,
      locationId: 'loc-01',
      locationName: 'Almacen Principal',
      receivedBy: 'warehouse@benlow.com',
      referenceNumber: `RCV-${String(i + 1).padStart(3, '0')}`,
      discountPercent: 0,
      freightEach: 0,
      receivedAt: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
      createdAt: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
      lines,
    })
  }

  return receipts
}

function generateMockTransferOrders(count: number): TransferOrder[] {
  const statuses: TransferOrderStatus[] = ['DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED']
  const transfers: TransferOrder[] = []
  for (let i = 0; i < count; i++) {
    const from = randomItem([
      { id: 'loc-01', name: 'Almacen Principal' },
      { id: 'loc-02', name: 'Tienda Centro' },
      { id: 'loc-03', name: 'Tienda Norte' },
    ])
    const to = randomItem([
      { id: 'loc-02', name: 'Tienda Centro' },
      { id: 'loc-03', name: 'Tienda Norte' },
      { id: 'loc-04', name: 'Tienda Sur' },
    ].filter((loc) => loc.id !== from.id))
    const lineCount = Math.floor(Math.random() * 3) + 1
    const lines = Array.from({ length: lineCount }).map(() => {
      const sku = randomItem(MOCK_SKUS)
      return {
        id: crypto.randomUUID(),
        transferOrderId: '',
        skuId: sku.id,
        skuCode: sku.skuCode,
        style: sku.style,
        skuSizeId: null,
        quantity: Math.floor(Math.random() * 12) + 1,
        createdAt: new Date().toISOString(),
      }
    })
    const transferId = crypto.randomUUID()
    lines.forEach((line) => { line.transferOrderId = transferId })
    const status = randomItem(statuses)
    const shippedAt = status === 'IN_TRANSIT' || status === 'RECEIVED'
      ? new Date(Date.now() - Math.random() * 3 * 86400000).toISOString()
      : null
    const receivedAt = status === 'RECEIVED'
      ? new Date(Date.now() - Math.random() * 86400000).toISOString()
      : null

    transfers.push({
      id: transferId,
      fromLocationId: from.id,
      fromLocationName: from.name,
      toLocationId: to.id,
      toLocationName: to.name,
      status,
      requestedBy: 'planner@benlow.com',
      shippedAt,
      receivedAt,
      createdAt: new Date(Date.now() - Math.random() * 10 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
      lines,
    })
  }
  return transfers.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

const MOCK_TRANSFERS = generateMockTransferOrders(20)

export async function fetchPurchaseOrders(
  params: PoListParams,
): Promise<PaginationEnvelope<PurchaseOrder>> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200))
    let filtered = [...MOCK_POS]

    if (params.status) {
      filtered = filtered.filter((po) => po.status === params.status)
    }

    if (params.q) {
      const q = params.q.toLowerCase()
      filtered = filtered.filter((po) =>
        po.poNumber.toLowerCase().includes(q) || (po.notes ?? '').toLowerCase().includes(q)
      )
    }

    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 25
    const totalItems = filtered.length
    const totalPages = Math.ceil(totalItems / pageSize)
    const start = (page - 1) * pageSize

    return {
      data: filtered.slice(start, start + pageSize),
      pagination: { page, pageSize, totalItems, totalPages },
    }
  }

  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') searchParams.set(key, String(value))
  }
  const res = await fetch(`/api/v1/purchase-orders?${searchParams}`)
  if (!res.ok) throw new Error(`Failed to fetch purchase orders: ${res.status}`)
  return res.json()
}

export async function fetchPurchaseOrderVendorOptions(params: {
  q?: string
  pageSize?: number
} = {}): Promise<PurchaseOrderVendorOption[]> {
  const searchParams = new URLSearchParams()
  if (params.q?.trim()) searchParams.set('q', params.q.trim())
  if (params.pageSize != null) searchParams.set('pageSize', String(params.pageSize))
  const query = searchParams.toString()
  const res = await fetch(`/api/v1/purchase-orders/vendor-options${query ? `?${query}` : ''}`)
  if (!res.ok) throw new Error(`Failed to fetch purchase-order vendors: ${res.status}`)
  return res.json()
}

export async function fetchPurchaseOrderBuyerOptions(): Promise<PurchaseOrderBuyerOption[]> {
  const res = await fetch('/api/v1/purchase-orders/buyer-options')
  if (!res.ok) throw new Error(`Failed to fetch purchase-order buyers: ${res.status}`)
  return res.json()
}

export async function fetchPurchaseOrderSkuOptions(params: {
  q?: string
  vendorId?: string
  pageSize?: number
} = {}): Promise<PurchaseOrderSkuOption[]> {
  const searchParams = new URLSearchParams()
  if (params.q?.trim()) searchParams.set('q', params.q.trim())
  if (params.vendorId?.trim()) searchParams.set('vendorId', params.vendorId.trim())
  if (params.pageSize != null) searchParams.set('pageSize', String(params.pageSize))
  const query = searchParams.toString()
  const res = await fetch(`/api/v1/purchase-orders/sku-options${query ? `?${query}` : ''}`)
  if (!res.ok) throw new Error(`Failed to fetch purchase-order SKUs: ${res.status}`)
  return res.json()
}

export async function fetchPurchaseOrder(poId: string): Promise<PurchaseOrder> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 100))
    const po = MOCK_POS.find((p) => p.id === poId)
    if (!po) throw new Error('Purchase order not found')
    return po
  }
  const res = await fetch(`/api/v1/purchase-orders/${poId}`)
  if (!res.ok) throw new Error(`Failed to fetch purchase order: ${res.status}`)
  return res.json()
}

export async function fetchLegacyPurchaseOrder(poNumber: string): Promise<LegacyPurchaseOrderDetail> {
  const res = await fetch(`/api/v1/purchase-orders/legacy/${encodeURIComponent(poNumber)}`)
  if (!res.ok) throw new Error(`Failed to fetch legacy purchase order: ${res.status}`)
  return res.json()
}

export async function fetchPurchaseOrderHistory(poId: string): Promise<PoStatusHistory[]> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 100))
    return []
  }

  const res = await fetch(`/api/v1/purchase-orders/${poId}/history`)
  if (res.status === 404) throw new Error('Purchase order not found')
  if (!res.ok) throw new Error(`Failed to fetch PO history: ${res.status}`)
  return res.json()
}

export async function createPurchaseOrder(payload: CreatePurchaseOrderPayload): Promise<PurchaseOrder> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200))
    const vendor = VENDORS.find((item) => item.id === payload.vendorId) ?? VENDORS[0]!
    const poId = crypto.randomUUID()
    const lineItems = payload.lineItems.map((line) => {
      const sku = MOCK_SKUS.find((item) => item.id === line.skuId)
      return {
        id: crypto.randomUUID(),
        poId,
        skuId: line.skuId,
        skuCode: sku?.skuCode,
        brand: sku?.style,
        sizeType: null,
        casePackId: null,
        casePackMultiplier: null,
        sizeCells: [],
        quantityOrdered: line.quantity,
        quantityReceived: 0,
        unitCost: line.unitCost,
        lineTotal: line.quantity * line.unitCost,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    })

    const po: PurchaseOrder = {
      id: poId,
      poNumber: `PO-${String(1000 + MOCK_POS.length).padStart(5, '0')}`,
      billToStoreId: payload.billToStoreId ?? null,
      shipToStoreId: payload.shipToStoreId ?? null,
      vendorId: vendor.id,
      vendorName: vendor.name,
      orderType: payload.orderType ?? 'RO',
      classification: payload.classification ?? 'AT_ONCE',
      origin: 'MANUAL',
      originSourcePoId: null,
      confirmationNumber: payload.confirmationNumber ?? null,
      accountNumber: payload.accountNumber ?? null,
      terms: payload.terms ?? null,
      shipVia: payload.shipVia ?? null,
      backorderAllowed: payload.backorderAllowed ?? false,
      splitShipment: payload.splitShipment ?? false,
      programCode: payload.programCode ?? null,
      storeLabelsOnReceive: payload.storeLabelsOnReceive ?? false,
      buyer: null,
      orderDate: payload.orderDate ?? new Date().toISOString(),
      shipDate: payload.shipDate ?? null,
      cancelDate: payload.cancelDate ?? null,
      paymentDate: payload.paymentDate ?? null,
      status: 'DRAFT',
      notes: payload.notes ?? null,
      cancellationReason: null,
      createdBy: 'planner@benlow.com',
      lineItems,
      subtotal: lineItems.reduce((sum, line) => sum + line.lineTotal, 0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    MOCK_POS.unshift(po)
    return po
  }

  const res = await fetch('/api/v1/purchase-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await throwPoApiError(res, `Failed to create PO: ${res.status}`)
  }
  return res.json()
}

export async function updatePurchaseOrder(
  poId: string,
  payload: UpdatePurchaseOrderPayload,
): Promise<PurchaseOrder> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 180))
    const po = MOCK_POS.find((item) => item.id === poId)
    if (!po) throw new Error('Purchase order not found')
    if (po.status !== 'DRAFT') throw new Error('Only draft purchase orders can be edited.')
    if (payload.notes !== undefined) po.notes = payload.notes
    if (payload.lineItems) {
      po.lineItems = payload.lineItems.map((line) => {
        const sku = MOCK_SKUS.find((item) => item.id === line.skuId)
        return {
          id: crypto.randomUUID(),
          poId: po.id,
          skuId: line.skuId,
          skuCode: sku?.skuCode,
          brand: sku?.style,
          sizeType: null,
          casePackId: null,
          casePackMultiplier: null,
          sizeCells: [],
          quantityOrdered: line.quantity,
          quantityReceived: 0,
          unitCost: line.unitCost,
          lineTotal: line.quantity * line.unitCost,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      })
      po.subtotal = po.lineItems.reduce((sum, line) => sum + line.lineTotal, 0)
    }
    po.updatedAt = new Date().toISOString()
    return po
  }

  const res = await fetch(`/api/v1/purchase-orders/${poId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await throwPoApiError(res, `Failed to update PO: ${res.status}`)
  }
  return res.json()
}

export async function submitPurchaseOrder(
  poId: string,
  payload: SubmitPurchaseOrderPayload = {},
): Promise<PurchaseOrder> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 160))
    const po = MOCK_POS.find((item) => item.id === poId)
    if (!po) throw new Error('Purchase order not found')
    if (po.status !== 'DRAFT') throw new Error('Invalid status transition.')
    po.status = 'SUBMITTED'
    po.updatedAt = new Date().toISOString()
    return po
  }

  const res = await fetch(`/api/v1/purchase-orders/${poId}/submit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await throwPoApiError(res, `Failed to submit PO: ${res.status}`)
  }
  return res.json()
}

export async function confirmPurchaseOrder(poId: string): Promise<PurchaseOrder> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 120))
    const po = MOCK_POS.find((item) => item.id === poId)
    if (!po) throw new Error('Purchase order not found')
    if (po.status !== 'SUBMITTED') throw new Error('Invalid status transition.')
    po.status = 'CONFIRMED'
    po.updatedAt = new Date().toISOString()
    return po
  }

  const res = await fetch(`/api/v1/purchase-orders/${poId}/confirm`, {
    method: 'PATCH',
  })
  if (!res.ok) {
    await throwPoApiError(res, `Failed to confirm PO: ${res.status}`)
  }
  return res.json()
}

export async function cancelPurchaseOrder(
  poId: string,
  reason?: string,
): Promise<PurchaseOrder> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 120))
    const po = MOCK_POS.find((item) => item.id === poId)
    if (!po) throw new Error('Purchase order not found')
    if (po.status !== 'DRAFT' && po.status !== 'SUBMITTED' && po.status !== 'CONFIRMED') {
      throw new Error('Invalid status transition.')
    }
    po.status = 'CANCELLED'
    po.cancellationReason = reason ?? null
    po.updatedAt = new Date().toISOString()
    return po
  }

  const res = await fetch(`/api/v1/purchase-orders/${poId}/cancel`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reason ? { reason } : {}),
  })
  if (!res.ok) {
    await throwPoApiError(res, `Failed to cancel PO: ${res.status}`)
  }
  return res.json()
}

export async function closePurchaseOrder(poId: string): Promise<PurchaseOrder> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 120))
    const po = MOCK_POS.find((item) => item.id === poId)
    if (!po) throw new Error('Purchase order not found')
    if (po.status !== 'RECEIVED') throw new Error('Invalid status transition.')
    po.status = 'CLOSED'
    po.updatedAt = new Date().toISOString()
    return po
  }

  const res = await fetch(`/api/v1/purchase-orders/${poId}/close`, {
    method: 'PATCH',
  })
  if (!res.ok) {
    await throwPoApiError(res, `Failed to close PO: ${res.status}`)
  }
  return res.json()
}

export async function receivePurchaseOrder(
  poId: string,
  payload: ReceivePurchaseOrderPayload,
): Promise<PurchaseOrder> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 300))
    const po = MOCK_POS.find((p) => p.id === poId)
    if (!po) throw new Error('Purchase order not found')

    for (const line of payload.lines) {
      const poLine = po.lineItems.find((li) => li.id === line.lineId)
      if (!poLine) throw new Error(`Line ${line.lineId} not found`)
      if (poLine.quantityReceived + line.quantityReceived > poLine.quantityOrdered) {
        throw new Error(
          `Received qty (${poLine.quantityReceived + line.quantityReceived}) exceeds ordered (${poLine.quantityOrdered}) for ${poLine.skuCode}`,
        )
      }
      poLine.quantityReceived += line.quantityReceived
    }

    const allReceived = po.lineItems.every(
      (li) => li.quantityReceived >= li.quantityOrdered,
    )
    po.status = allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED'
    po.updatedAt = new Date().toISOString()
    return po
  }

  const res = await fetch(`/api/v1/purchase-orders/${poId}/receive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await throwPoApiError(res, `Failed to receive PO: ${res.status}`)
  }
  return res.json()
}

export async function receivePurchaseOrderFull(
  poId: string,
  payload: ReceivePurchaseOrderFullPayload,
): Promise<PurchaseOrder> {
  const res = await fetch(`/api/v1/purchase-orders/${poId}/receive/full`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await throwPoApiError(res, `Failed to fully receive PO: ${res.status}`)
  }
  return res.json()
}

export async function duplicatePurchaseOrder(
  poId: string,
  payload: DuplicatePurchaseOrderPayload = {},
): Promise<PurchaseOrder> {
  const res = await fetch(`/api/v1/purchase-orders/${poId}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await throwPoApiError(res, `Failed to duplicate PO: ${res.status}`)
  }
  return res.json()
}

export async function replicatePurchaseOrder(
  poId: string,
  payload: ReplicatePurchaseOrderPayload,
): Promise<ReplicatePurchaseOrderResult> {
  const res = await fetch(`/api/v1/purchase-orders/${poId}/replicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await throwPoApiError(res, `Failed to replicate PO: ${res.status}`)
  }
  return res.json()
}

export async function combinePurchaseOrders(
  payload: CombinePurchaseOrdersPayload,
): Promise<PurchaseOrder> {
  const res = await fetch('/api/v1/purchase-orders/combine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await throwPoApiError(res, `Failed to combine POs: ${res.status}`)
  }
  return res.json()
}

export async function fetchPurchaseOrderReceipts(poId: string): Promise<PoReceipt[]> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 120))
    const po = MOCK_POS.find((p) => p.id === poId)
    if (!po) throw new Error('Purchase order not found')
    return generateMockReceipts(po)
  }

  const res = await fetch(`/api/v1/purchase-orders/${poId}/receipts`)
  if (res.status === 404) throw new Error('Purchase order not found')
  if (!res.ok) throw new Error(`Failed to fetch PO receipts: ${res.status}`)
  return res.json()
}

export async function fetchPurchaseOrderOverdueExceptions(): Promise<OverduePoException[]> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 100))
    return MOCK_POS
      .filter((po) => po.status === 'SUBMITTED' || po.status === 'CONFIRMED')
      .slice(0, 3)
      .map((po, index) => ({
        poId: po.id,
        poNumber: po.poNumber,
        vendorId: po.vendorId,
        vendorName: po.vendorName ?? po.vendorId,
        status: po.status,
        leadTimeDays: 14,
        submittedAt: new Date(Date.now() - (18 + index) * 86400000).toISOString(),
        expectedDeliveryDate: new Date(Date.now() - (4 + index) * 86400000).toISOString().slice(0, 10),
        daysOverdue: 4 + index,
      }))
  }

  const res = await fetch('/api/v1/purchase-orders/overdue-exceptions')
  if (!res.ok) throw new Error(`Failed to fetch overdue purchase order exceptions: ${res.status}`)
  return res.json()
}

export async function fetchTransferOrders(
  params: TransferOrderListParams,
): Promise<PaginationEnvelope<TransferOrder>> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 160))
    let filtered = [...MOCK_TRANSFERS]
    if (params.status) filtered = filtered.filter((transfer) => transfer.status === params.status)
    if (params.fromLocationId) {
      filtered = filtered.filter((transfer) => transfer.fromLocationId === params.fromLocationId)
    }
    if (params.toLocationId) {
      filtered = filtered.filter((transfer) => transfer.toLocationId === params.toLocationId)
    }
    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 25
    const totalItems = filtered.length
    const totalPages = Math.ceil(totalItems / pageSize)
    const start = (page - 1) * pageSize

    return {
      data: filtered.slice(start, start + pageSize),
      pagination: { page, pageSize, totalItems, totalPages },
    }
  }

  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') searchParams.set(key, String(value))
  }
  const res = await fetch(`/api/v1/transfer-orders?${searchParams}`)
  if (!res.ok) throw new Error(`Failed to fetch transfer orders: ${res.status}`)
  return res.json()
}
