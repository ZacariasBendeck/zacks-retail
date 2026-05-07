import { describe, expect, it } from 'vitest'
import type { AttributeDimension } from '../types/productsAttributes'
import {
  familyScopedDimensionAppliesToAllFamilies,
  getResultFamilyScope,
  getVisibleActionDimensions,
} from '../pages/utilities/ChangeSkuAttributesPage'

function dimension(
  code: string,
  familyCodes: string[] = [],
): AttributeDimension {
  return {
    id: code.length,
    code,
    labelEs: code,
    descriptionEs: null,
    sortOrder: 0,
    isMultiValue: false,
    familyRules: familyCodes.map((familyCode) => ({
      familyCode,
      enabled: true,
      isRequired: false,
      sortOrder: 0,
    })),
    values: [],
  }
}

describe('ChangeSkuAttributesPage attribute action scope', () => {
  it('derives result families from SKU categories', () => {
    const scope = getResultFamilyScope(
      [10, 20, 30],
      [
        { number: 10, productFamilyCode: 'suits' },
        { number: 20, productFamilyCode: 'suits' },
      ],
    )

    expect(scope.familyCodes).toEqual(['suits'])
    expect(scope.hasUnknownFamily).toBe(true)
  })

  it('requires family-scoped dimensions to apply to every result family', () => {
    const familyScope = { familyCodes: ['pants', 'suits'], hasUnknownFamily: false }

    expect(familyScopedDimensionAppliesToAllFamilies(dimension('fit', ['suits']), familyScope)).toBe(false)
    expect(familyScopedDimensionAppliesToAllFamilies(dimension('shared', ['suits', 'pants']), familyScope)).toBe(true)
  })

  it('uses the full catalog, then hides family dimensions that do not apply to all result families', () => {
    const fullCatalog = [
      dimension('marca'),
      dimension('suit_detail', ['suits']),
      dimension('pants_detail', ['pants']),
      dimension('shared_detail', ['suits', 'pants']),
    ]
    const visible = getVisibleActionDimensions(
      fullCatalog,
      true,
      { familyCodes: ['suits'], hasUnknownFamily: false },
    ).map((row) => row.code)

    expect(visible).toEqual(['marca', 'suit_detail', 'shared_detail'])
  })

  it('shows family dimensions before query so the UI can render them disabled', () => {
    const visible = getVisibleActionDimensions(
      [dimension('marca'), dimension('suit_detail', ['suits'])],
      false,
      { familyCodes: [], hasUnknownFamily: false },
    ).map((row) => row.code)

    expect(visible).toEqual(['marca', 'suit_detail'])
  })
})
