export type CurrentPriceSlot = 'LIST' | 'RETAIL' | 'MD1' | 'MD2'

export interface Sku {
  code: string
  vendorSku: string | null
  category: number | null
  vendor: string | null
  sizeType: number | null
  description: string
  styleColor: string | null
  season: string | null
  location: string | null
  listPrice: number | null
  retailPrice: number
  mdPrice1: number | null
  mdPrice2: number | null
  currentPriceSlot: CurrentPriceSlot
  currentCost: number | null
  oversizeColumn: string | null
  oversizeAmount: number | null
  perks: number | null
  manufacturer: string | null
  labelCode: string | null
  colorCode: string | null
  comment: string | null
  groupCode: string | null
  keywords: string[]
  pictureFileName: string | null
  coupon: boolean
  lastPriceChange: string | null
  status: string | null
  dateLastChanged: string | null
  orderMultiple: number | null
  orderUom: string | null
  longColor: string | null
  boldDesc: string | null
  paraDesc: string | null
  catalogSku: string | null
  bulletText: string[]
  pictureName01: string | null
  pictureName02: string | null
  sizeText: string | null
  webFileName: string | null
}

export interface SkuInput {
  code: string
  vendorSku?: string | null
  category: number
  vendor: string
  sizeType?: number | null
  description: string
  styleColor?: string | null
  season?: string | null
  location?: string | null
  listPrice?: number | null
  retailPrice: number
  mdPrice1?: number | null
  mdPrice2?: number | null
  currentPriceSlot?: CurrentPriceSlot
  currentCost?: number | null
  oversizeColumn?: string | null
  oversizeAmount?: number | null
  perks?: number | null
  manufacturer?: string | null
  labelCode?: string | null
  colorCode?: string | null
  comment?: string | null
  groupCode?: string | null
  keywords?: string[]
  pictureFileName?: string | null
  coupon?: boolean
  status?: string | null
  orderMultiple?: number | null
  orderUom?: string | null
  longColor?: string | null
  boldDesc?: string | null
  paraDesc?: string | null
  catalogSku?: string | null
  bulletText?: string[]
  pictureName01?: string | null
  pictureName02?: string | null
  sizeText?: string | null
  webFileName?: string | null
}

export interface SkuListFilters {
  q?: string
  vendor?: string
  category?: number
  season?: string
  group?: string
  keyword?: string
  limit?: number
  offset?: number
}
