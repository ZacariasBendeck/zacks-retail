import {
  assertFamilyScopedAttributeSkusInScope,
  BatchChangeValidationError,
  shouldPreserveSeedKeywordRowsOnAttributeReplace,
} from '../src/services/utilities/batchChangeService';

const rules = [
  { familyCode: 'suits', enabled: true },
  { familyCode: 'pants', enabled: false },
];

describe('batchChangeService family-scoped attribute validation', () => {
  it('accepts selected SKUs in enabled product families', () => {
    expect(() =>
      assertFamilyScopedAttributeSkusInScope(
        'fit',
        rules,
        [{ sku_code: 'A', family_code: 'suits' }],
        ['A'],
      ),
    ).not.toThrow();
  });

  it('rejects selected SKUs without a product family', () => {
    expect(() =>
      assertFamilyScopedAttributeSkusInScope(
        'fit',
        rules,
        [{ sku_code: 'A', family_code: null }],
        ['A'],
      ),
    ).toThrow(BatchChangeValidationError);
  });

  it('rejects selected SKUs outside enabled product families', () => {
    expect(() =>
      assertFamilyScopedAttributeSkusInScope(
        'fit',
        rules,
        [{ sku_code: 'A', family_code: 'pants' }],
        ['A'],
      ),
    ).toThrow(/does not apply/);
  });
});

describe('batchChangeService attribute replace semantics', () => {
  it('does not preserve keyword-seeded rows for single-value dimensions', () => {
    expect(shouldPreserveSeedKeywordRowsOnAttributeReplace(false)).toBe(false);
  });

  it('preserves keyword-seeded rows for multi-value dimensions', () => {
    expect(shouldPreserveSeedKeywordRowsOnAttributeReplace(true)).toBe(true);
  });
});
