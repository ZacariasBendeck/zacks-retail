import { MOCK_SKUS } from '../mock/skuData'
import type { SalesLedgerParams, SalesLedgerResponse, SalesLedgerRow } from '../types/salesLedger'

// Ledger endpoint is available; use live API by default and allow explicit mock opt-in.
const USE_MOCK = import.meta.env.VITE_USE_MOCK_SALES_LEDGER === 'true'

const CHANNELS: SalesLedgerRow['channel'][] = ['STORE', 'ONLINE', 'WHOLESALE']

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T
}

function generateMockSalesRows(count: number): SalesLedgerRow[] {
  const rows: SalesLedgerRow[] = []
  for (let i = 0; i < count; i += 1) {
    const sku = randomItem(MOCK_SKUS)
    const unitsSold = Math.floor(Math.random() * 8) + 1
    const unitPrice = Math.max(15, sku.price * (0.85 + Math.random() * 0.35))
    const saleDate = new Date(Date.now() - Math.random() * 45 * 24 * 60 * 60 * 1000).toISOString()
    rows.push({
      id: `${sku.id}-${i}`,
      saleDate,
      skuCode: sku.skuCode,
      style: sku.style,
      department: sku.department,
      category: sku.categoryId ?? 556,
      channel: randomItem(CHANNELS),
      unitsSold,
      netRevenue: Math.round(unitsSold * unitPrice * 100) / 100,
    })
  }
  return rows.sort((a, b) => b.saleDate.localeCompare(a.saleDate))
}

const MOCK_SALES_ROWS = generateMockSalesRows(1800)

function compareRows(
  left: SalesLedgerRow,
  right: SalesLedgerRow,
  sortField: string,
  direction: 'asc' | 'desc',
) {
  const multiplier = direction === 'asc' ? 1 : -1
  const a = (left as unknown as Record<string, unknown>)[sortField]
  const b = (right as unknown as Record<string, unknown>)[sortField]

  if (typeof a === 'number' && typeof b === 'number') {
    return (a - b) * multiplier
  }
  return String(a ?? '').localeCompare(String(b ?? '')) * multiplier
}

export async function fetchSalesLedger(params: SalesLedgerParams): Promise<SalesLedgerResponse> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 180))
    let rows = [...MOCK_SALES_ROWS]

    if (params.department) {
      rows = rows.filter((row) => row.department === params.department)
    }
    if (params.category != null) {
      rows = rows.filter((row) => row.category === params.category)
    }
    if (params.channel) {
      rows = rows.filter((row) => row.channel === params.channel)
    }
    if (params.skuCode) {
      const skuNeedle = params.skuCode.toLowerCase()
      rows = rows.filter((row) => row.skuCode.toLowerCase().includes(skuNeedle))
    }
    if (params.style) {
      const styleNeedle = params.style.toLowerCase()
      rows = rows.filter((row) => row.style.toLowerCase().includes(styleNeedle))
    }
    if (params.startDate) {
      rows = rows.filter((row) => row.saleDate.slice(0, 10) >= params.startDate!)
    }
    if (params.endDate) {
      rows = rows.filter((row) => row.saleDate.slice(0, 10) <= params.endDate!)
    }

    const sort = params.sort ?? 'saleDate'
    const order = params.order ?? 'desc'
    rows.sort((a, b) => compareRows(a, b, sort, order))

    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 50
    const totalItems = rows.length
    const start = (page - 1) * pageSize

    return {
      data: rows.slice(start, start + pageSize),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.max(Math.ceil(totalItems / pageSize), 1),
      },
    }
  }

  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') searchParams.set(key, String(value))
  }
  const res = await fetch(`/api/v1/sales/ledger?${searchParams}`)
  if (!res.ok) throw new Error(`Failed to fetch sales ledger: ${res.status}`)
  return res.json()
}
