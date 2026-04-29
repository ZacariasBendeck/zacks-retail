/**
 * Utilities module — shared types.
 *
 * Spec: docs/dev/specs/2026-04-21-utilities-batch-change-design.md
 */

/** Criteria accepted by findSkusByCriteria. All fields optional; empty = no filter on that axis. */
export interface SkuCriteria {
  skus?: string[];
  categories?: number[];
  vendors?: string[];
  seasons?: string[];
  /** Case-insensitive substring match (OR across substrings). */
  stylesColors?: string[];
  groups?: string[];
  /** Effective keywords (RICS string ∪ ADD-overrides − REMOVE-overrides). */
  keywords?: string[];
  /** Extended app-owned SKU attributes. Union within a dimension, intersection across dimensions. */
  attributes?: Record<string, string[]>;
  /** Disabled for now — rics_mirror has no price-changes table. */
  onlyFuturePriceChanges?: boolean;
  /** Disabled for now — reserved for WTD sales filter once ticket history is wired. */
  onlyWtdSales?: boolean;
}

export type BatchOperationType =
  | 'CHANGE_KEYWORDS_ADD'
  | 'CHANGE_KEYWORDS_REMOVE'
  | 'CHANGE_CATEGORY'
  | 'CHANGE_VENDOR'
  | 'CHANGE_SEASON'
  | 'CHANGE_GROUP_CODE'
  | 'CHANGE_SKU_ATTRIBUTE'
  | 'CHANGE_SIZE_COLUMN'
  | 'CHANGE_SIZE_TYPE_STRUCTURE';

export type AttributeChange =
  | { type: 'CHANGE_KEYWORDS_ADD'; keyword: string }
  | { type: 'CHANGE_KEYWORDS_REMOVE'; keyword: string }
  | { type: 'CHANGE_CATEGORY'; category: number }
  | { type: 'CHANGE_VENDOR'; vendor: string }
  | { type: 'CHANGE_SEASON'; season: string }
  | { type: 'CHANGE_GROUP_CODE'; groupCode: string }
  | {
      type: 'CHANGE_SKU_ATTRIBUTE';
      dimensionCode: string;
      valueCodes: string[];
      mode: 'REPLACE' | 'ADD' | 'REMOVE';
    }
  | { type: 'CHANGE_SIZE_COLUMN'; oldLabel: string; newLabel: string }
  | { type: 'CHANGE_SIZE_TYPE_STRUCTURE'; code: number; columns: string[]; rows: string[] };

/**
 * SKU with overrides merged on top of rics_mirror.inventory_master.
 * Used by the criteria-picker preview and the SKU warmup re-invalidation path.
 */
export interface EffectiveSku {
  sku: string;
  category: number | null;
  vendor: string | null;
  season: string | null;
  groupCode: string | null;
  styleColor: string | null;
  keywords: string[];
  retailPrice: number | null;
  description: string | null;
}
