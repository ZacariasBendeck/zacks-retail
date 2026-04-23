import { Table, Tag } from 'antd'
import type { SalesAnalysisReport } from '../../../services/reportApi'
import { SummaryLabelCell, SummaryNumericCell } from '../SummaryRow'
import { GpBadge, ChangePctBadge } from '../gpBadge'
import {
  fmtMoney, fmtQty, fmtPct1, fmtPctBare1, DASH,
} from '../../../utils/reportFormatters'

/**
 * Read-only renderer for a captured Sales Analysis snapshot.
 * Matches the flat-table view on SalesAnalysisPage; no re-query, no filters.
 * Driven purely by resultJson so we never touch live RICS data when showing
 * a snapshot.
 */
export default function RenderSalesAnalysis({ result }: { result: SalesAnalysisReport }) {
  const isSkuDetail = result.reportType === 'SKU_DETAIL'
  const keyColumnTitle = isSkuDetail
    ? 'SKU'
    : result.reportType === 'CATEGORY_SUMMARY'
    ? 'Category'
    : result.reportType === 'DEPT_SUMMARY'
    ? 'Department'
    : result.reportType === 'VENDOR_SUMMARY'
    ? 'Vendor'
    : result.reportType === 'PRICE_POINT_SUMMARY'
    ? 'Price Point'
    : 'Key'

  const priorYear = result.rows.some((r) => r.priorYearNetSales != null)

  const columns = [
    { title: keyColumnTitle, dataIndex: 'dimensionKey', key: 'dimensionKey', width: 160 },
    ...(result.reportType === 'DEPT_SUMMARY'
      ? [{ title: 'Label', dataIndex: 'dimensionLabel', key: 'dimensionLabel', width: 200, render: (v: string | null) => v ?? DASH }]
      : []),
    {
      title: 'Store', dataIndex: 'storeNumber', key: 'storeNumber', width: 80,
      render: (v: number | null) => v ?? '(all)',
    },
    { title: 'Qty', dataIndex: 'qty', key: 'qty', width: 80, align: 'right' as const, render: (v: number) => fmtQty(v) },
    { title: 'Net Sales', dataIndex: 'netSales', key: 'netSales', width: 130, align: 'right' as const, render: (v: number) => fmtMoney(v) },
    { title: 'COGS', dataIndex: 'cogs', key: 'cogs', width: 130, align: 'right' as const, render: (v: number) => fmtMoney(v) },
    { title: 'Gross Profit', dataIndex: 'grossProfit', key: 'grossProfit', width: 130, align: 'right' as const, render: (v: number) => fmtMoney(v) },
    { title: 'GP %', dataIndex: 'gpPct', key: 'gpPct', width: 90, align: 'right' as const, render: (v: number | null) => <GpBadge value={v} /> },
    { title: 'Inv (Cost)', dataIndex: 'onHandAtCost', key: 'onHandAtCost', width: 130, align: 'right' as const, render: (v: number) => fmtMoney(v) },
    { title: 'Turns', dataIndex: 'turns', key: 'turns', width: 80, align: 'right' as const, render: (v: number | null) => fmtPctBare1(v) },
    {
      title: 'ROI', dataIndex: 'roiPct', key: 'roiPct', width: 90, align: 'right' as const,
      render: (v: number | null) =>
        v == null ? DASH : <Tag color={v >= 5 ? 'green' : v >= 2 ? 'gold' : 'red'}>{fmtPctBare1(v)}×</Tag>,
    },
    ...(priorYear
      ? [
          { title: 'Prior Yr Net', dataIndex: 'priorYearNetSales', key: 'priorYearNetSales', width: 130, align: 'right' as const, render: (v: number | null) => fmtMoney(v) },
          { title: 'PY % Δ', dataIndex: 'pyPctChange', key: 'pyPctChange', width: 90, align: 'right' as const, render: (v: number | null) => <ChangePctBadge value={v} /> },
        ]
      : []),
  ]

  const t = result.totals
  const deptCol = result.reportType === 'DEPT_SUMMARY' ? 1 : 0
  const labelSpan = 2 + deptCol
  return (
    <Table
      dataSource={result.rows}
      columns={columns}
      rowKey={(r) => `${r.dimensionKey}|${r.storeNumber ?? '*'}`}
      size="small"
      pagination={{ pageSize: 50 }}
      summary={() => (
        <Table.Summary fixed>
          <Table.Summary.Row>
            <SummaryLabelCell index={0} colSpan={labelSpan} variant="grand">Totals</SummaryLabelCell>
            <SummaryNumericCell index={1} variant="grand">{fmtQty(t.qty)}</SummaryNumericCell>
            <SummaryNumericCell index={2} variant="grand">{fmtMoney(t.netSales)}</SummaryNumericCell>
            <SummaryNumericCell index={3} variant="grand">{fmtMoney(t.cogs)}</SummaryNumericCell>
            <SummaryNumericCell index={4} variant="grand">{fmtMoney(t.grossProfit)}</SummaryNumericCell>
            <SummaryNumericCell index={5} variant="grand">{fmtPct1(t.gpPct)}</SummaryNumericCell>
            <SummaryNumericCell index={6} variant="grand">{fmtMoney(t.onHandAtCost)}</SummaryNumericCell>
            <SummaryNumericCell index={7} variant="grand">{fmtPctBare1(t.turns)}</SummaryNumericCell>
            <SummaryNumericCell index={8} variant="grand">
              {t.roiPct == null ? DASH : `${fmtPctBare1(t.roiPct)}×`}
            </SummaryNumericCell>
            {priorYear ? (
              <>
                <SummaryNumericCell index={9} variant="grand">{fmtMoney(t.priorYearNetSales)}</SummaryNumericCell>
                <SummaryNumericCell index={10} variant="grand">{DASH}</SummaryNumericCell>
              </>
            ) : null}
          </Table.Summary.Row>
        </Table.Summary>
      )}
    />
  )
}
