import type { ColumnsType } from 'antd/es/table'
import { salesReportColumnGroup } from './salesReportTableZones'

export const SALES_ANALYSIS_TABLE_CLASS = 'sales-analysis-table'

export const SALES_ANALYSIS_COLUMN_WIDTH = {
  hierarchy: 260,
  key: 150,
  label: 180,
  store: 70,
  unitsOnHand: 72,
  inventoryUnitCost: 72,
  onHandAtCost: 92,
  percentOfTotal: 48,
  qty: 62,
  netSales: 92,
  cogs: 88,
  grossProfit: 96,
  gpPct: 58,
  turns: 50,
  roi: 60,
  priorYearQty: 70,
  priorYearMoney: 92,
  priorYearChangePct: 72,
  onOrderQty: 84,
  onOrderUnitCost: 98,
  onOrderCost: 98,
} as const

interface SalesAnalysisScrollOptions {
  priorYear: boolean
  includeOnOrder: boolean
  showPercentOfTotal: boolean
}

interface SalesAnalysisColumnGroupOptions extends SalesAnalysisScrollOptions {
  identityColumnCount: number
}

export function salesAnalysisRowClassName(_record: unknown, index: number): string {
  return index % 2 === 1 ? 'report-zebra-row' : ''
}

export function salesAnalysisTreeScrollX(options: SalesAnalysisScrollOptions): number {
  const w = SALES_ANALYSIS_COLUMN_WIDTH
  return (
    w.hierarchy +
    w.unitsOnHand +
    w.inventoryUnitCost +
    w.onHandAtCost +
    w.qty +
    w.netSales +
    w.cogs +
    w.grossProfit +
    w.gpPct +
    w.turns +
    w.roi +
    (options.showPercentOfTotal ? w.percentOfTotal * 4 : 0) +
    (options.priorYear
      ? w.priorYearQty + w.priorYearMoney * 3 + w.priorYearChangePct * 3
      : 0) +
    (options.includeOnOrder ? w.onOrderQty + w.onOrderUnitCost + w.onOrderCost : 0)
  )
}

export function salesAnalysisFlatScrollX(
  options: SalesAnalysisScrollOptions & { hasLabelColumn: boolean },
): number {
  const w = SALES_ANALYSIS_COLUMN_WIDTH
  return (
    w.key +
    (options.hasLabelColumn ? w.label : 0) +
    w.store +
    w.unitsOnHand +
    w.inventoryUnitCost +
    w.onHandAtCost +
    w.qty +
    w.netSales +
    w.cogs +
    w.grossProfit +
    w.gpPct +
    w.turns +
    w.roi +
    (options.showPercentOfTotal ? w.percentOfTotal * 4 : 0) +
    (options.priorYear
      ? w.priorYearQty + w.priorYearMoney * 3 + w.priorYearChangePct * 3
      : 0) +
    (options.includeOnOrder ? w.onOrderQty + w.onOrderUnitCost + w.onOrderCost : 0)
  )
}

export function groupSalesAnalysisColumns<RecordType>(
  columns: ColumnsType<RecordType>,
  options: SalesAnalysisColumnGroupOptions,
): ColumnsType<RecordType> {
  let cursor = 0
  const take = (count: number): ColumnsType<RecordType> => {
    const next = columns.slice(cursor, cursor + count)
    cursor += count
    return next
  }

  const grouped: ColumnsType<RecordType> = [
    salesReportColumnGroup('identity', take(options.identityColumnCount), { title: 'Group' }),
    salesReportColumnGroup('inventory', take(3 + (options.showPercentOfTotal ? 1 : 0)), {
      boundary: true,
      title: 'Inventory',
    }),
    salesReportColumnGroup('sales', take(2 + (options.showPercentOfTotal ? 2 : 0)), {
      boundary: true,
      title: 'Sales',
    }),
    salesReportColumnGroup('profit', take(3 + (options.showPercentOfTotal ? 1 : 0)), {
      boundary: true,
      title: 'Profit',
    }),
    salesReportColumnGroup('performance', take(2), { boundary: true, title: 'Performance' }),
  ]

  if (options.priorYear) {
    grouped.push(salesReportColumnGroup('priorYear', take(7), { boundary: true, title: 'Prior Year' }))
  }
  if (options.includeOnOrder) {
    grouped.push(salesReportColumnGroup('onOrder', take(3), { boundary: true, title: 'On Order' }))
  }

  if (cursor < columns.length) {
    grouped.push(salesReportColumnGroup('attributes', take(columns.length - cursor), { boundary: true }))
  }

  return grouped
}
