import { describe, expect, it } from 'vitest'
import type { ColumnGroupType } from 'antd/es/table'
import {
  groupSalesReportColumnSpecs,
  salesReportSummaryCellClassName,
  salesReportTableClassName,
} from '../components/reports/salesReportTableZones'

interface Row {
  sku: string
  qty: number
  netSales: number
  profit: number
}

describe('salesReportTableZones', () => {
  it('groups contiguous column specs and applies zone classes to leaf columns', () => {
    const columns = groupSalesReportColumnSpecs<Row>([
      { zone: 'identity', title: 'Item', column: { title: 'SKU', dataIndex: 'sku', key: 'sku' } },
      { zone: 'sales', title: 'Sales', boundary: true, column: { title: 'Qty', dataIndex: 'qty', key: 'qty' } },
      { zone: 'sales', title: 'Sales', column: { title: 'Net Sales', dataIndex: 'netSales', key: 'netSales' } },
      { zone: 'profit', title: 'Profit', boundary: true, column: { title: 'Profit', dataIndex: 'profit', key: 'profit' } },
    ])

    expect(columns).toHaveLength(3)
    expect(columns.map((column) => column.title)).toEqual(['Item', 'Sales', 'Profit'])

    const salesGroup = columns[1] as ColumnGroupType<Row>
    expect(salesGroup.className).toContain('sales-report-zone-sales')
    expect(salesGroup.className).toContain('sales-report-zone-boundary')
    expect(salesGroup.children).toHaveLength(2)
    expect(salesGroup.children[0]?.className).toContain('sales-report-zone-sales')
    expect(salesGroup.children[0]?.className).toContain('sales-report-zone-boundary')
    expect(salesGroup.children[1]?.className).toContain('sales-report-zone-sales')
  })

  it('returns stable table and summary class names', () => {
    expect(salesReportTableClassName('custom-table')).toBe('sales-report-zone-table custom-table')
    expect(salesReportSummaryCellClassName('inventory', { boundary: true }))
      .toBe('sales-report-zone-cell sales-report-zone-inventory sales-report-zone-boundary')
  })
})
