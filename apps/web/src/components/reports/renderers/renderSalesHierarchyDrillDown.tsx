import { Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { SalesHierarchyNode, SalesHierarchyReport } from '../../../services/reportApi'
import { SummaryLabelCell, SummaryNumericCell } from '../SummaryRow'
import { GpBadge, ChangePctBadge } from '../gpBadge'
import {
  fmtMoney, fmtQty, fmtPct1, fmtPctBare1, DASH,
} from '../../../utils/reportFormatters'

// Same rowKey annotation the live page uses — concatenates ancestor keys so
// every row is unique across the tree.
interface TreeRow extends SalesHierarchyNode {
  rowKey: string
  children?: TreeRow[]
}
function annotateKeys(nodes: SalesHierarchyNode[] | undefined, prefix = ''): TreeRow[] | undefined {
  if (!nodes || nodes.length === 0) return undefined
  return nodes.map((n) => {
    const rowKey = `${prefix}${n.level}:${n.key}`
    return { ...n, rowKey, children: annotateKeys(n.children, `${rowKey}|`) }
  })
}

function rowClassName(r: TreeRow): string {
  if (r.level === 'store') return 'hierarchy-row-store'
  if (r.level === 'department') return 'hierarchy-row-department'
  if (r.level === 'category') return 'hierarchy-row-category'
  return ''
}

/**
 * Read-only renderer for a captured Sales Hierarchy Drill-Down snapshot.
 * Preserves the tree structure so the operator can still drill down inside
 * the frozen data — expand/collapse is a pure client-side UI concern and
 * does not re-query.
 */
export default function RenderSalesHierarchyDrillDown({ result }: { result: SalesHierarchyReport }) {
  const treeRows = annotateKeys(result.roots) ?? []
  const priorYear = result.priorYear

  const columns: ColumnsType<TreeRow> = [
    {
      title: 'Row',
      dataIndex: 'label',
      key: 'label',
      width: 380,
      render: (_v: string, r: TreeRow) => {
        const weight =
          r.level === 'department' || r.level === 'store' ? 600 :
          r.level === 'category' ? 500 : 400
        return <span style={{ fontWeight: weight }}>{r.label}</span>
      },
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
  return (
    <>
      <style>{`
        .hierarchy-row-store > td { background: #f0f5ff !important; }
        .hierarchy-row-department > td { background: #fafafa !important; }
        .hierarchy-row-category > td { background: #fdfdfd !important; }
      `}</style>
      <Table<TreeRow>
        dataSource={treeRows}
        columns={columns}
        rowKey="rowKey"
        size="small"
        pagination={false}
        rowClassName={rowClassName}
        expandable={{ defaultExpandAllRows: false, indentSize: 20 }}
        summary={() => {
          const priorYearCols = priorYear ? 2 : 0
          return (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <SummaryLabelCell index={0} colSpan={1} variant="grand">Totals</SummaryLabelCell>
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
                {priorYearCols > 0 ? (
                  <>
                    <SummaryNumericCell index={9} variant="grand">{fmtMoney(t.priorYearNetSales)}</SummaryNumericCell>
                    <SummaryNumericCell index={10} variant="grand">{DASH}</SummaryNumericCell>
                  </>
                ) : null}
              </Table.Summary.Row>
            </Table.Summary>
          )
        }}
      />
    </>
  )
}
