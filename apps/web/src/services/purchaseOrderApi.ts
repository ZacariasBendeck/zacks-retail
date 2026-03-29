import type {
  PurchaseOrder,
  PoStatus,
  PoListParams,
  ReceivePurchaseOrderPayload,
} from '../types/purchaseOrder'
import type { PaginationEnvelope } from '../types/sku'
import { MOCK_SKUS } from '../mock/skuData'

const USE_MOCK = true

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
      vendorId: vendor.id,
      vendorName: vendor.name,
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

export async function fetchPurchaseOrders(
  params: PoListParams,
): Promise<PaginationEnvelope<PurchaseOrder>> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200))
    let filtered = [...MOCK_POS]

    if (params.status) {
      filtered = filtered.filter((po) => po.status === params.status)
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
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? `Failed to receive PO: ${res.status}`)
  }
  return res.json()
}
