import { describe, expect, it } from 'vitest'
import { buildSkuListFiltersFromState, type SkuListFilterState } from '../pages/inventory/skuListFilters'

function state(overrides: Partial<SkuListFilterState> = {}): SkuListFilterState {
  return {
    q: '',
    skuPattern: '',
    vendorCodes: [],
    sectorNumber: null,
    departmentNumber: null,
    productFamilyCode: null,
    effectiveCategories: undefined,
    seasonCodes: [],
    groupCodes: [],
    keywordCodes: [],
    styleColor: '',
    description: '',
    attrSelections: {},
    ...overrides,
  }
}

describe('buildSkuListFiltersFromState', () => {
  it('keeps SKU wildcards in the sku filter instead of the broad q filter', () => {
    expect(buildSkuListFiltersFromState(state({ skuPattern: 'AB*12' }))).toMatchObject({
      sku: 'AB*12',
    })
    expect(buildSkuListFiltersFromState(state({ skuPattern: 'AB*12' })).q).toBeUndefined()
  })

  it('preserves description wildcards and style/color contains filters', () => {
    expect(
      buildSkuListFiltersFromState(state({
        description: 'BOOT*CUERO',
        styleColor: 'black',
      })),
    ).toMatchObject({
      description: 'BOOT*CUERO',
      styleColor: 'black',
    })
  })

  it('keeps attribute filters and drops blank values', () => {
    expect(
      buildSkuListFiltersFromState(state({
        attrSelections: {
          color: ['negro', ''],
          heel: [],
        },
      })).attributes,
    ).toEqual({ color: ['negro'] })
  })
})
