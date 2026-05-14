import type { SkuListFilters } from '../../types/productsSku'

const NO_MATCH_CATEGORY = -2147483648

export interface SkuListFilterState {
  q: string
  skuPattern: string
  vendorCodes: string[]
  sectorNumber: number | null
  departmentNumber: number | null
  productFamilyCode: string | null
  effectiveCategories: number[] | undefined
  seasonCodes: string[]
  groupCodes: string[]
  keywordCodes: string[]
  styleColor: string
  description: string
  attrSelections: Record<string, string[]>
}

export function buildSkuListFiltersFromState(state: SkuListFilterState): SkuListFilters {
  const attrsPayload: Record<string, string[]> = {}
  for (const [dimensionCode, values] of Object.entries(state.attrSelections)) {
    const cleanValues = values.filter(Boolean)
    if (cleanValues.length > 0) attrsPayload[dimensionCode] = cleanValues
  }

  return {
    q: state.q.trim() || undefined,
    sku: state.skuPattern.trim() || undefined,
    vendors: state.vendorCodes.length > 0 ? state.vendorCodes : undefined,
    sectors: state.sectorNumber != null ? [state.sectorNumber] : undefined,
    departments: state.departmentNumber != null ? [state.departmentNumber] : undefined,
    families: state.productFamilyCode ? [state.productFamilyCode] : undefined,
    categories:
      state.effectiveCategories === undefined
        ? undefined
        : state.effectiveCategories.length > 0
          ? state.effectiveCategories
          : [NO_MATCH_CATEGORY],
    seasons: state.seasonCodes.length > 0 ? state.seasonCodes : undefined,
    groups: state.groupCodes.length > 0 ? state.groupCodes : undefined,
    keywords: state.keywordCodes.length > 0 ? state.keywordCodes : undefined,
    styleColor: state.styleColor.trim() || undefined,
    description: state.description.trim() || undefined,
    attributes: Object.keys(attrsPayload).length > 0 ? attrsPayload : undefined,
  }
}
