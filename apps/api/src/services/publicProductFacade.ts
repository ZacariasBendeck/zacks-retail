/**
 * Routing layer in front of the public-product data sources.
 *
 * PRODUCT_SOURCE=rics  → live read-through to legacy RICS MDB files
 *                        via ricsProductAdapter (PowerShell + OLEDB)
 * PRODUCT_SOURCE=local → legacy SQLite path in publicProductService.
 *                        Kept available for regression comparison and tests.
 *
 * The route handlers call this module exclusively; they do not reach into
 * either source directly.
 */

import * as sqliteService from './publicProductService';
import * as ricsAdapter from './ricsProductAdapter';
import type {
  ProductListParams,
  FacetFilterParams,
  PaginatedProducts,
  ProductDetail,
  FacetsResult,
} from './publicProductService';

function sourceIsRics(): boolean {
  return (process.env.PRODUCT_SOURCE || 'local').toLowerCase() === 'rics';
}

export async function listProducts(params: ProductListParams): Promise<PaginatedProducts> {
  if (sourceIsRics()) {
    return ricsAdapter.listProducts(params);
  }
  return sqliteService.listProducts(params);
}

export async function getProductById(id: string): Promise<ProductDetail | null> {
  if (sourceIsRics()) {
    return ricsAdapter.getProductById(id);
  }
  return sqliteService.getProductById(id);
}

export async function getProductFacets(filters: FacetFilterParams): Promise<FacetsResult> {
  if (sourceIsRics()) {
    return ricsAdapter.getProductFacets(filters);
  }
  return sqliteService.getProductFacets(filters);
}
