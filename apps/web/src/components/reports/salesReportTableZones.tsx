import type { ReactNode } from 'react'
import type { ColumnGroupType, ColumnType, ColumnsType } from 'antd/es/table'

export const SALES_REPORT_TABLE_CLASS = 'sales-report-zone-table'

export type SalesReportColumnZone =
  | 'identity'
  | 'inventory'
  | 'sales'
  | 'profit'
  | 'performance'
  | 'priorYear'
  | 'onOrder'
  | 'status'
  | 'time'
  | 'ranking'
  | 'attributes'

const ZONE_LABELS: Record<SalesReportColumnZone, string> = {
  identity: 'Item',
  inventory: 'Inventory',
  sales: 'Sales',
  profit: 'Profit',
  performance: 'Performance',
  priorYear: 'Prior Year',
  onOrder: 'On Order',
  status: 'Status',
  time: 'Time',
  ranking: 'Rank',
  attributes: 'Attributes',
}

interface ZoneClassOptions {
  boundary?: boolean
  extraClassName?: string
}

export interface SalesReportColumnSpec<RecordType> extends ZoneClassOptions {
  column: ColumnType<RecordType>
  title?: ReactNode
  zone: SalesReportColumnZone
}

function joinClassNames(...values: Array<string | false | null | undefined>): string | undefined {
  const joined = values.filter(Boolean).join(' ')
  return joined || undefined
}

function isColumnGroup<RecordType>(
  column: ColumnGroupType<RecordType> | ColumnType<RecordType>,
): column is ColumnGroupType<RecordType> {
  return Array.isArray((column as ColumnGroupType<RecordType>).children)
}

export function salesReportTableClassName(
  ...classNames: Array<string | false | null | undefined>
): string {
  return joinClassNames(SALES_REPORT_TABLE_CLASS, ...classNames) ?? SALES_REPORT_TABLE_CLASS
}

export function salesReportZoneClassName(
  zone: SalesReportColumnZone,
  options: ZoneClassOptions = {},
): string {
  return joinClassNames(
    'sales-report-zone-cell',
    `sales-report-zone-${zone}`,
    options.boundary && 'sales-report-zone-boundary',
    options.extraClassName,
  ) ?? `sales-report-zone-${zone}`
}

export function salesReportGroupClassName(
  zone: SalesReportColumnZone,
  options: ZoneClassOptions = {},
): string {
  return joinClassNames(
    'sales-report-zone-group',
    `sales-report-zone-${zone}`,
    options.boundary && 'sales-report-zone-boundary',
    options.extraClassName,
  ) ?? `sales-report-zone-${zone}`
}

export function salesReportSummaryCellClassName(
  zone: SalesReportColumnZone,
  options: ZoneClassOptions = {},
): string {
  return salesReportZoneClassName(zone, options)
}

export function withSalesReportZone<RecordType>(
  column: ColumnType<RecordType>,
  zone: SalesReportColumnZone,
  options: ZoneClassOptions = {},
): ColumnType<RecordType> {
  const zoneClassName = salesReportZoneClassName(zone, options)
  return {
    ...column,
    className: joinClassNames(column.className, zoneClassName),
    onCell: (record, index) => {
      const base = column.onCell?.(record, index) ?? {}
      return {
        ...base,
        className: joinClassNames(base.className, zoneClassName),
      }
    },
    onHeaderCell: (col) => {
      const base = column.onHeaderCell?.(col) ?? {}
      return {
        ...base,
        className: joinClassNames(base.className, zoneClassName),
      }
    },
  }
}

function withSalesReportZoneRecursive<RecordType>(
  column: ColumnGroupType<RecordType> | ColumnType<RecordType>,
  zone: SalesReportColumnZone,
  options: ZoneClassOptions = {},
): ColumnGroupType<RecordType> | ColumnType<RecordType> {
  if (!isColumnGroup(column)) return withSalesReportZone(column, zone, options)

  return {
    ...column,
    className: joinClassNames(column.className, salesReportGroupClassName(zone, options)),
    onHeaderCell: (col) => {
      const base = column.onHeaderCell?.(col) ?? {}
      return {
        ...base,
        className: joinClassNames(base.className, salesReportGroupClassName(zone, options)),
      }
    },
    children: column.children.map((child, index) =>
      withSalesReportZoneRecursive(child, zone, {
        ...options,
        boundary: options.boundary && index === 0,
      }),
    ),
  }
}

export function salesReportColumnGroup<RecordType>(
  zone: SalesReportColumnZone,
  columns: ColumnsType<RecordType>,
  options: ZoneClassOptions & { key?: string; title?: ReactNode } = {},
): ColumnGroupType<RecordType> {
  const groupClassName = salesReportGroupClassName(zone, { boundary: options.boundary })
  return {
    title: options.title ?? ZONE_LABELS[zone],
    key: options.key ?? `sales-report-zone-${zone}`,
    className: groupClassName,
    onHeaderCell: (col) => ({
      className: joinClassNames(col.className, groupClassName),
    }),
    children: columns.map((column, index) =>
      withSalesReportZoneRecursive(column, zone, {
        boundary: options.boundary && index === 0,
        extraClassName: options.extraClassName,
      }),
    ),
  }
}

export function groupSalesReportColumnSpecs<RecordType>(
  specs: Array<SalesReportColumnSpec<RecordType>>,
): ColumnsType<RecordType> {
  const groups: ColumnsType<RecordType> = []
  let run: Array<SalesReportColumnSpec<RecordType>> = []

  const flush = () => {
    if (!run.length) return
    const first = run[0]
    if (!first) return
    groups.push(
      salesReportColumnGroup(
        first.zone,
        run.map((spec) => spec.column),
        {
          boundary: first.boundary,
          key: `sales-report-zone-${first.zone}-${groups.length}`,
          title: first.title,
        },
      ),
    )
    run = []
  }

  for (const spec of specs) {
    const last = run[run.length - 1]
    if (
      last &&
      (last.zone !== spec.zone || last.title !== spec.title || spec.boundary)
    ) {
      flush()
    }
    run.push(spec)
  }
  flush()

  return groups
}
