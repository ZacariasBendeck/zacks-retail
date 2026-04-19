// POS SKU lookup — reads directly from the RICS adapter (live InventoryMaster)
// via /api/v1/pos/skus. Admin-entered SKUs come through the same search path
// once they're promoted to the warehouse, but Stage 1 Phase 1 uses RICS as the
// source of truth. See docs/modules/sales-pos.md + plan #3 in the Stage 1 plan.

export interface PosSku {
  skuCode: string
  description: string | null
  styleColor: string | null
  vendorCode: string | null
  vendorName: string | null
  categoryNumber: number | null
  categoryName: string | null
  department: string | null
  sizeType: number | null
  currentPriceSlot: 1 | 2 | 3 | 4
  currentPrice: number
  listPrice: number | null
  retailPrice: number | null
  markDown1: number | null
  markDown2: number | null
  currentCost: number | null
  perks: number | null
  coupon: boolean
  overSizeColumn: string | null
  overSizeAmount: number | null
  pictureFileName: string | null
  status: string | null
}

export interface PriceSlots {
  skuCode: string
  currentSlot: 1 | 2 | 3 | 4
  list: number | null
  retail: number | null
  markDown1: number | null
  markDown2: number | null
  nextPriceRotation: Array<{ slot: 1 | 2 | 3 | 4; label: string; value: number }>
}

export async function searchPosSkus(q: string, limit = 20): Promise<PosSku[]> {
  if (!q.trim()) return []
  const res = await fetch(`/api/v1/pos/skus?q=${encodeURIComponent(q.trim())}&limit=${limit}`)
  if (!res.ok) throw new Error(`SKU search failed: ${res.status}`)
  const body = (await res.json()) as { data: PosSku[] }
  return body.data
}

export async function getPosSku(skuCode: string): Promise<PosSku | null> {
  const res = await fetch(`/api/v1/pos/skus/${encodeURIComponent(skuCode)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`SKU lookup failed: ${res.status}`)
  return res.json()
}

export async function getPriceSlots(skuCode: string): Promise<PriceSlots | null> {
  const res = await fetch(`/api/v1/pos/skus/${encodeURIComponent(skuCode)}/price-slots`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Price slot lookup failed: ${res.status}`)
  return res.json()
}
