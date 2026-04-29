/**
 * Routes inventory-module reads between the RICS live adapter and the (future)
 * Postgres-backed path. Mirrors the `publicProductFacade` shape so the same
 * env-var idiom applies across modules.
 *
 * Current state: only `rics` is implemented. `local` throws a typed error the
 * route layer maps to HTTP 501.
 */

import * as ricsAdapter from './ricsInventoryAdapter';
import type {
  InventoryInquiry,
  FindBySizeParams,
  FindBySizeResult,
  InventoryDetailReportRow,
  InventoryDetailReportParams,
  ChangeDetailRow,
  ChangeDetailParams,
  TransferSummaryParams,
  TransferSummaryReport,
  SkuStoreRollupParams,
  SkuStoreRollupRow,
  SkuStoreCellRow,
  RecommendedTransferParams,
  RecommendedTransferRow,
  InquiryTrend,
  InquiryOpenPoRow,
  InquiryPurchaseOrderHistoryRow,
  InquiryInfoDetail,
} from './ricsInventoryAdapter';

export { ChangeDetailQueryTooBroadError, TransferSummaryInputError } from './ricsInventoryAdapter';

export class InventorySourceNotImplementedError extends Error {
  constructor(source: string) {
    super(`INVENTORY_SOURCE="${source}" is not implemented yet. Set INVENTORY_SOURCE=rics.`);
    this.name = 'InventorySourceNotImplementedError';
  }
}

function source(): string {
  return (process.env.INVENTORY_SOURCE || 'rics').toLowerCase();
}

export function sourceIsRics(): boolean {
  return source() === 'rics';
}

export async function getInventoryInquiry(
  sku: string,
  storeId?: number,
  selectedRow?: string | null,
): Promise<InventoryInquiry | null> {
  if (!sourceIsRics()) throw new InventorySourceNotImplementedError(source());
  return ricsAdapter.getInventoryInquiry(sku, storeId, selectedRow);
}

export async function getInquiryTrend(sku: string, storeId?: number): Promise<InquiryTrend | null> {
  if (!sourceIsRics()) throw new InventorySourceNotImplementedError(source());
  return ricsAdapter.getInquiryTrend(sku, storeId);
}

export async function getInquiryInfo(sku: string, storeId?: number): Promise<InquiryInfoDetail | null> {
  if (!sourceIsRics()) throw new InventorySourceNotImplementedError(source());
  return ricsAdapter.getInquiryInfo(sku, storeId);
}

export async function getInquiryOpenPoRows(sku: string, storeId?: number): Promise<InquiryOpenPoRow[]> {
  if (!sourceIsRics()) throw new InventorySourceNotImplementedError(source());
  return ricsAdapter.getInquiryOpenPoRows(sku, storeId);
}

export async function getInquiryPurchaseOrderHistory(
  sku: string,
  storeId?: number,
): Promise<InquiryPurchaseOrderHistoryRow[]> {
  if (!sourceIsRics()) throw new InventorySourceNotImplementedError(source());
  return ricsAdapter.getInquiryPurchaseOrderHistory(sku, storeId);
}

export async function findBySize(params: FindBySizeParams): Promise<FindBySizeResult> {
  if (!sourceIsRics()) throw new InventorySourceNotImplementedError(source());
  return ricsAdapter.findBySize(params);
}

export async function getInventoryDetailReport(
  params: InventoryDetailReportParams,
): Promise<InventoryDetailReportRow[]> {
  if (!sourceIsRics()) throw new InventorySourceNotImplementedError(source());
  return ricsAdapter.getInventoryDetailReport(params);
}

export async function getChangeDetail(params: ChangeDetailParams): Promise<ChangeDetailRow[]> {
  if (!sourceIsRics()) throw new InventorySourceNotImplementedError(source());
  return ricsAdapter.getChangeDetail(params);
}

export async function getTransferSummary(
  params: TransferSummaryParams,
): Promise<TransferSummaryReport> {
  if (!sourceIsRics()) throw new InventorySourceNotImplementedError(source());
  return ricsAdapter.getTransferSummary(params);
}

export async function getSkuStoreRollup(
  params: SkuStoreRollupParams,
): Promise<SkuStoreRollupRow[]> {
  if (!sourceIsRics()) throw new InventorySourceNotImplementedError(source());
  return ricsAdapter.getSkuStoreRollup(params);
}

export async function getSkuStoreCellRollup(
  params: SkuStoreRollupParams,
): Promise<SkuStoreCellRow[]> {
  if (!sourceIsRics()) throw new InventorySourceNotImplementedError(source());
  return ricsAdapter.getSkuStoreCellRollup(params);
}

export async function getRecommendedTransfers(
  params: RecommendedTransferParams,
): Promise<RecommendedTransferRow[]> {
  if (!sourceIsRics()) throw new InventorySourceNotImplementedError(source());
  return ricsAdapter.getRecommendedTransfers(params);
}

export async function warmup(): Promise<void> {
  if (!sourceIsRics()) return;
  return ricsAdapter.warmup();
}
