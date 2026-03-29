export type Department = 'FORMAL' | 'CASUAL' | 'FIESTA' | 'SANDALIAS' | 'BOOTS' | 'COMFORT'

export interface ReferenceItem {
  id: number
  name: string
  active: boolean
}

export type ReferenceDataMap = Record<string, ReferenceItem[]>

export interface Sku {
  id: string
  skuCode: string
  brand: string
  style: string
  color: string
  size: string
  price: number
  cost: number | null
  category: number
  department: Department
  vendorId: string
  vendorSku: string | null
  barcode: string | null
  description: string | null
  comment: string | null
  keywords: string | null
  season: string | null
  manufacturer: string | null
  pictureUrl: string | null
  colorFamilyId: number | null
  shoeTypeId: number | null
  heelShapeId: number | null
  heelHeightId: number | null
  toeShapeId: number | null
  closureTypeId: number | null
  upperMaterialId: number | null
  outsoleMaterialId: number | null
  finishId: number | null
  widthTypeId: number | null
  patternId: number | null
  occasionId: number | null
  targetAudienceId: number | null
  accessoryId: number | null
  seasonId: number | null
  sizeTypeId: number | null
  labelTypeId: number | null
  heelType: string | null
  material: string | null
  active: boolean
  currentStock?: number
  createdAt: string
  updatedAt: string
}

export interface SkuListParams {
  page?: number
  pageSize?: number
  sort?: string
  order?: 'asc' | 'desc'
  brand?: string
  department?: Department
  category?: number
  vendorId?: string
  active?: boolean
  q?: string
  minPrice?: number
  maxPrice?: number
  size?: string
}

export interface SkuCreatePayload {
  brand: string
  style: string
  color: string
  size: string
  price: number
  category: number
  department: Department
  vendorId: string
  skuCode?: string | null
  barcode?: string | null
  description?: string | null
  active?: boolean
  cost?: number | null
  vendorSku?: string | null
  comment?: string | null
  keywords?: string | null
  season?: string | null
  manufacturer?: string | null
  pictureUrl?: string | null
  colorFamilyId?: number | null
  shoeTypeId?: number | null
  heelShapeId?: number | null
  heelHeightId?: number | null
  toeShapeId?: number | null
  closureTypeId?: number | null
  upperMaterialId?: number | null
  outsoleMaterialId?: number | null
  finishId?: number | null
  widthTypeId?: number | null
  patternId?: number | null
  occasionId?: number | null
  targetAudienceId?: number | null
  accessoryId?: number | null
  seasonId?: number | null
  sizeTypeId?: number | null
  labelTypeId?: number | null
}

export type SkuUpdatePayload = Partial<SkuCreatePayload>

export interface ImageAnalysisResult {
  shoe_type: string | null
  heel_height: string | null
  heel_shape: string | null
  toe_shape: string | null
  color_family: string | null
  upper_material: string | null
  finish: string | null
  pattern: string | null
  occasion: string | null
  department: string | null
  color: string | null
  description: string | null
}

/** Enhanced response from analyze-image when backend supports mapped attributes */
export interface EnhancedAnalysisResult {
  raw: ImageAnalysisResult
  mapped?: Record<string, number | null>
}

/** Mapping from AI attribute key to form field + reference table */
export interface AiFillMapping {
  formField: string
  type: 'text' | 'enum' | 'reference'
  refTable?: string
  aiKey: keyof ImageAnalysisResult
}

/** Result of AI fill operation for UI feedback */
export interface AiFillSummary {
  filled: string[]
  skipped: string[]
  total: number
}

export interface Vendor {
  id: string
  name: string
  contactEmail?: string | null
}

export interface PaginationEnvelope<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}
