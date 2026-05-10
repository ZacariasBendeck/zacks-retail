import { describe, expect, it } from 'vitest'
import type { AttributeDimension, SkuAttributesBulk } from '../types/productsAttributes'
import {
  familyScopedDimensionAppliesToAllFamilies,
  getColorLabelSortText,
  getResultFamilyScope,
  getVisibleColorLabels,
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

describe('ChangeSkuAttributesPage color labels', () => {
  const bulk: SkuAttributesBulk = {
    bySku: {
      ABC123: {
        skuCode: 'ABC123',
        byDimension: {
          color: {
            isMultiValue: false,
            values: [
              {
                code: '1',
                labelEs: 'Negro',
                assignedBy: null,
                assignedAt: '2026-05-09T00:00:00.000Z',
              },
            ],
          },
        },
      },
    },
  }

  it('uses the visible color attribute label when present', () => {
    expect(getVisibleColorLabels(bulk, 'ABC123', 'Glossy Black')).toEqual(['Negro'])
  })

  it('falls back to legacy long color when the SKU has no color attribute label', () => {
    expect(getVisibleColorLabels(bulk, 'NOATTR', 'Glossy Black')).toEqual(['Glossy Black'])
  })

  it('uses the same label source for sorting', () => {
    expect(getColorLabelSortText(bulk, 'ABC123', null)).toBe('Negro')
  })
})
