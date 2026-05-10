import { DASH, fmtPct1 } from '../../utils/reportFormatters'

export const SALES_PIVOT_MEASURE_KEYS = [
  'onHandQty',
  'onHandCostVal',
  'onHandSkuCount',
  'qtyTY',
  'netSalesTY',
  'profitTY',
  'qtyLY',
  'netSalesLY',
  'profitLY',
] as const

export type SalesPivotMeasureKey = typeof SALES_PIVOT_MEASURE_KEYS[number]

export type SalesPivotMeasureRecord = Record<SalesPivotMeasureKey, number>

export interface SalesPivotPercentNode extends SalesPivotMeasureRecord {
  rowKey: string
  children?: SalesPivotPercentNode[]
}

export function buildParentTotalsByRowKey<T extends SalesPivotPercentNode>(
  nodes: T[],
  rootTotals: SalesPivotMeasureRecord,
): Map<string, SalesPivotMeasureRecord> {
  const parentTotalsByRowKey = new Map<string, SalesPivotMeasureRecord>()

  const walk = (node: SalesPivotPercentNode, parentTotals: SalesPivotMeasureRecord): void => {
    parentTotalsByRowKey.set(node.rowKey, parentTotals)
    for (const child of node.children ?? []) {
      walk(child, node)
    }
  }

  for (const node of nodes) {
    walk(node, rootTotals)
  }

  return parentTotalsByRowKey
}

export function percentOfParent(value: number, parentValue: number | null | undefined): number | null {
  if (!Number.isFinite(value)) return null
  if (parentValue == null || !Number.isFinite(parentValue) || parentValue === 0) return null
  return (value / parentValue) * 100
}

export function formatParentPercent(value: number, parentValue: number | null | undefined): string {
  const pct = percentOfParent(value, parentValue)
  return pct == null ? DASH : fmtPct1(pct)
}
