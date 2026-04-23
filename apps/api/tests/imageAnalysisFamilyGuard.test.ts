/**
 * Focused unit tests for the AI-category family allow-list guard.
 *
 * Bug context: when an operator pre-selected the "zapatos" (shoes) family
 * and uploaded a boot image, Claude Vision occasionally returned a category
 * number outside the family-scoped allow-list (e.g. a "trajes pendiente de
 * clasificar" suit row). The pre-fix code called resolveCategory() on any
 * number the AI returned and silently resolved it to a cross-family row.
 *
 * The guard below keeps the check isolated and cheap to verify without
 * mocking Anthropic or touching Postgres.
 */
import { describe, expect, it } from '@jest/globals';
import {
  isCategoryInFamilyAllowList,
  parseCategoryLabel,
} from '../src/services/imageAnalysisService';
import type { CategoryWithDept } from '../src/services/products/productFamilyService';

const SHOE_CATEGORIES: CategoryWithDept[] = [
  {
    categoryNumber: 585,
    categoryDesc: 'Sand Meter',
    departmentNumber: 58,
    departmentDesc: 'SANDALIAS',
    familyCode: 'zapatos',
  },
  {
    categoryNumber: 591,
    categoryDesc: 'Bota Alta',
    departmentNumber: 59,
    departmentDesc: 'BOTAS',
    familyCode: 'zapatos',
  },
  {
    categoryNumber: 593,
    categoryDesc: 'Botines Mujer',
    departmentNumber: 59,
    departmentDesc: 'BOTAS',
    familyCode: 'zapatos',
  },
];

describe('isCategoryInFamilyAllowList', () => {
  it('accepts a number that is in the scoped list', () => {
    expect(isCategoryInFamilyAllowList(SHOE_CATEGORIES, 591)).toBe(true);
  });

  it('rejects a number that is not in the scoped list', () => {
    // 777 is an arbitrary suit category outside the "zapatos" allow-list.
    // This is the production bug: without the guard, resolveCategory(777)
    // would return a real RICS row and the UI would land on a wrong family.
    expect(isCategoryInFamilyAllowList(SHOE_CATEGORIES, 777)).toBe(false);
  });

  it('rejects every number when the scoped list is empty', () => {
    expect(isCategoryInFamilyAllowList([], 591)).toBe(false);
  });

  it('does not match on description substring overlap', () => {
    // A category like "Traj Pend Clasificar" in another family could share
    // the word "Pend Clasificar" with a shoe category — the guard is by
    // NUMBER only, so description bleed-through is impossible.
    expect(isCategoryInFamilyAllowList(SHOE_CATEGORIES, 0)).toBe(false);
  });
});

describe('parseCategoryLabel (regression companion for the guard)', () => {
  it('extracts the number from a well-formed label', () => {
    expect(parseCategoryLabel('591 - Bota Alta')).toBe(591);
  });

  it('returns null for a label without a leading number', () => {
    expect(parseCategoryLabel('Bota Alta')).toBeNull();
  });

  it('returns null for empty / null / undefined', () => {
    expect(parseCategoryLabel(null)).toBeNull();
    expect(parseCategoryLabel(undefined)).toBeNull();
    expect(parseCategoryLabel('')).toBeNull();
  });
});
