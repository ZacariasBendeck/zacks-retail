/**
 * Types for the products-module SKU lifecycle (DRAFT → ACTIVE → DISCONTINUED).
 * Mirrors the shape of the backend `skuLifecycleService` response.
 *
 * Note: these live separately from the legacy `types/sku.ts` shapes — those
 * types are wired to the SQLite-backed `/api/v1/skus` routes and carry
 * ref-table IDs (colorId, shoeTypeId, etc). The lifecycle shape is the
 * Postgres-backed one and uses real-world values.
 *
 * 2026-04-23 — expanded to surface every column `app.sku` carries that the
 * RICS InventoryMaster also has (listPrice, markDownPrice1/2, sizeType,
 * location, groupCode, labelCode, pictureFileName, coupon, perks, discountCode,
 * …). Previously the lifecycle type only exposed a thin slice so the admin
 * form had to stash the rest in `legacyAttrs`.
 */

export type SkuState = 'DRAFT' | 'ACTIVE' | 'DISCONTINUED'

export interface SkuLifecycleRow {
  id: string
  provisionalCode: string
  code: string | null
  skuState: SkuState
  familyCode: string | null
  categoryNumber: number | null
  vendorId: string | null
  vendorSku: string | null
  brandId: number | null
  descriptionRics: string | null
  descriptionWeb: string | null
  comment: string | null
  keywords: string | null
  // Pricing (RICS p. 155)
  listPrice: number | null
  retailPrice: number | null
  markDownPrice1: number | null
  markDownPrice2: number | null
  currentCost: number | null
  currentPriceSlot: string | null
  perks: number | null
  discountCode: string | null
  // Classification / identity
  season: string | null
  style: string | null
  styleColor: string | null
  sizeType: number | null
  location: string | null
  labelCode: string | null
  colorCode: string | null
  groupCode: string | null
  pictureFileName: string | null
  manufacturer: string | null
  coupon: boolean
  orderMultiple: number | null
  orderUom: string | null
  activatedAt: string | null
  activatedBy: string | null
  discontinuedAt: string | null
  discontinuedBy: string | null
  createdAt: string
  createdBy: string
  updatedAt: string | null
  /** Transitional — carries the SKU form's ref-table IDs (colorId, shoeTypeId, …)
   *  until Phase 4 migrates them into the dimension framework. */
  legacyAttrs: Record<string, unknown> | null
}

export interface CreateDraftInput {
  familyCode?: string | null
  /** RICS category.number (integer). Maps to app.sku.category_number. */
  categoryNumber?: number | null
  vendorId?: string | null
  vendorSku?: string | null
  brandId?: number | null
  descriptionRics?: string | null
  descriptionWeb?: string | null
  comment?: string | null
  keywords?: string | null
  listPrice?: number | null
  retailPrice?: number | null
  markDownPrice1?: number | null
  markDownPrice2?: number | null
  currentCost?: number | null
  currentPriceSlot?: string | null
  perks?: number | null
  discountCode?: string | null
  season?: string | null
  style?: string | null
  styleColor?: string | null
  sizeType?: number | null
  location?: string | null
  labelCode?: string | null
  colorCode?: string | null
  groupCode?: string | null
  pictureFileName?: string | null
  manufacturer?: string | null
  coupon?: boolean | null
  orderMultiple?: number | null
  orderUom?: string | null
  legacyAttrs?: Record<string, unknown> | null
}

export type UpdateDraftInput = Partial<CreateDraftInput>

export interface FinalizeDraftInput {
  code: string
  /** Atomic finalize: bundle any pending field edits into the same transaction
   *  that flips DRAFT → ACTIVE. Omitting this is fine if the edit page already
   *  saved first — but sending it lets the server roll back every change
   *  together if validation fails. */
  data?: UpdateDraftInput
}
