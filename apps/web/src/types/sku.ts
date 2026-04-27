export type Department = 'FORMAL' | 'CASUAL' | 'FIESTA' | 'SANDALIAS' | 'BOOTS' | 'COMFORT'

export interface ReferenceItem {
  id: number
  name: string
  code?: string
  active: boolean
}

export interface CategoryItem extends ReferenceItem {
  ricsCode: number
  deptMacro: Department
}

export interface ColorItem extends ReferenceItem {
  colorFamilyId: number | null
}

export interface SizeLabelItem {
  id: number
  sizeTypeId: number
  label: string
  sortOrder: number
  active: boolean
}

export type ReferenceDataMap = Record<string, ReferenceItem[]>

export interface SkuSize {
  id: string
  skuId: string
  sizeLabel: string
  sortOrder: number
  active: boolean
  stock?: number
}

export interface Sku {
  id: string
  skuCode: string
  style: string
  price: number
  cost: number | null
  categoryId: number | null
  department: Department
  vendorId: string
  vendorSku: string | null
  barcode: string | null
  ricsDescription: string | null
  webDescription: string | null
  comment: string | null
  keywords: string | null
  season: string | null
  manufacturer: string | null
  pictureUrl: string | null
  pictureFileName?: string | null
  brandId: number | null
  colorId: number | null
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
  heelMaterialId: number | null
  heelType: string | null
  heelTypeCode?: string | null
  material: string | null
  heelMaterialTypeCode?: string | null
  styleColor?: StyleColorLink | null
  active: boolean
  currentStock?: number
  sizes?: SkuSize[]
  createdAt: string
  updatedAt: string
}

export interface StyleColorLink {
  styleColorId: string
  brandId: number
  style: string
  colorId: number
  categoryId: number
  department: Department
  heelTypeCode: string | null
  heelMaterialTypeCode: string | null
  season: string | null
  active: boolean
}

export interface SkuListParams {
  page?: number
  pageSize?: number
  sort?: string
  order?: 'asc' | 'desc'
  brandId?: number
  department?: Department
  categoryId?: number
  vendorId?: string
  active?: boolean
  q?: string
  minPrice?: number
  maxPrice?: number
}

export interface SkuCreatePayload {
  style: string
  price: number
  department: Department
  vendorId: string
  skuCode?: string | null
  barcode?: string | null
  ricsDescription?: string | null
  webDescription?: string | null
  active?: boolean
  cost?: number | null
  vendorSku?: string | null
  comment?: string | null
  keywords?: string | null
  season?: string | null
  manufacturer?: string | null
  pictureUrl?: string | null
  brandId?: number | null
  colorId?: number | null
  categoryId?: number | null
  heelMaterialId?: number | null
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
  heelTypeCode?: string | null
  heelMaterialTypeCode?: string | null
  sizes?: string[]
}

export type SkuUpdatePayload = Partial<SkuCreatePayload>

export interface ImageAnalysisResult {
  shoe_type: string | null
  heel_height: string | null
  heel_shape: string | null
  toe_shape: string | null
  color: string | null
  upper_material: string | null
  outsole_material: string | null
  heel_material: string | null
  finish: string | null
  pattern: string | null
  occasion: string | null
  target_audience: string | null
  accessory: string | null
  description: string | null
  category: string | null
}

export interface AiFillConfigEntry {
  aiKey: string
  formField: string
  type: 'text' | 'enum' | 'reference'
  refTable?: string
}

/** Resolved Postgres category + department the AI picked. Null when AI returned
 *  no category or the picked category isn't mapped in app.category_product_family. */
export interface AiCategoryResolution {
  categoryNumber: number
  categoryDesc: string
  departmentNumber: number
  departmentDesc: string
  familyCode: string
  familyLabelEs: string
}

/** Canonical analyze-image response */
export interface EnhancedAnalysisResult {
  raw: ImageAnalysisResult
  mapped?: Record<string, number | string | null>
  config?: AiFillConfigEntry[]
  resolution?: AiCategoryResolution | null
  /**
   * Non-null when the backend rejected the AI's category pick (e.g. a number
   * outside the selected family's allow-list). The form should surface this
   * so the operator knows why the category field stayed blank and picks one
   * manually.
   */
  warning?: string | null
}

/** One Product Family from the catalog. Pulled from GET /api/v1/products/families. */
export interface ProductFamily {
  code: string
  labelEs: string
  descriptionEs: string | null
  sortOrder: number
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

export interface StyleColorListParams {
  brandId?: number
  colorId?: number
  department?: Department
  active?: boolean
}
