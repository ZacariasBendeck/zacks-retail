import { describe, expect, it } from 'vitest'
import {
  describeBatchOperationChange,
  describeBatchSkuQuery,
  humanizeBatchOperation,
} from '../pages/utilities/batchHistoryFormatters'

describe('batch history formatters', () => {
  it('summarizes extended SKU attribute changes', () => {
    expect(humanizeBatchOperation('CHANGE_SKU_ATTRIBUTE')).toBe('SKU attribute')
    expect(describeBatchOperationChange({
      operationType: 'CHANGE_SKU_ATTRIBUTE',
      changeJson: {
        type: 'CHANGE_SKU_ATTRIBUTE',
        dimensionCode: 'color',
        valueCodes: ['NEGRO', 'CAFE'],
        mode: 'REPLACE',
      },
    })).toBe('Set color to NEGRO, CAFE')
  })

  it('summarizes source query filters and selected SKU count', () => {
    expect(describeBatchSkuQuery({
      skus: ['A1', 'A2', 'A3'],
      sourceQuery: {
        departments: [12],
        categories: [1201],
        vendors: ['NIKE'],
        attributes: { color: ['NEGRO'] },
      },
    })).toBe('Department in 12; Category in 1201; Vendor in NIKE; color in NEGRO; Selection: 3 SKUs')
  })

  it('falls back to the exact SKU list for older batches', () => {
    expect(describeBatchSkuQuery({
      skus: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'],
    })).toBe('Selected SKUs: A1, A2, A3, A4, A5, A6 +1 more')
  })
})
