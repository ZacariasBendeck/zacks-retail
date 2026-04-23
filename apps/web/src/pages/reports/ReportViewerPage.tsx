import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Checkbox, Dropdown, Select, Space, Spin, Table, Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useSalesAnalysis, type SalesAnalysisArgs } from '../../hooks/useReports'
import type {
  SalesAnalysisDimension,
  SalesAnalysisReportType,
  SalesAnalysisStoreOption,
  SalesAnalysisRow,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import FilterChips from '../../components/reports/FilterChips'
import { GpBadge, ChangePctBadge } from '../../components/reports/gpBadge'
import { fmtMoney, fmtQty, fmtPct1, fmtPctBare1, DASH } from '../../utils/reportFormatters'

const { Title, Text } = Typography

// ─────────────────────── Column zones ──────────────────────────────────
// Each column is classified into a zone. Zone drives background tint on the
// header row and (optionally) subtle column tint on data rows. Identity
// columns (SKU / label / store) stay neutral so the visual rhythm is the
// three sales/inventory bands, not every column.

type Zone = 'identity' | 'on-hand' | 'current' | 'comparison'

interface ColumnDef {
  key: string
  title: string
  zone: Zone
  align?: 'left' | 'right'
  width?: number
  // If true, the column aggregates numerically into subtotals/grand-totals.
  sumable?: boolean
  render: (row: SalesAnalysisRow) => React.ReactNode
  // Sort by numeric or string value for the column header's sort control.
  sortValue?: (row: SalesAnalysisRow) => number | string
}

// Soft tints scoped to the viewer. Header gets the full tint; data cells get
// a much lighter wash so rows stay legible but the grouping reads.
const ZONE_HEADER_BG: Record<Zone, string> = {
  identity: 'transparent',
  'on-hand': 'rgba(140, 140, 140, 0.14)',
  current: 'rgba(22, 119, 255, 0.10)',
  comparison: 'rgba(250, 173, 20, 0.14)',
}

const ZONE_CELL_BG: Record<Zone, string> = {
  identity: 'transparent',
  'on-hand': 'rgba(140, 140, 140, 0.04)',
  current: 'rgba(22, 119, 255, 0.035)',
  comparison: 'rgba(250, 173, 20, 0.045)',
}

const ZONE_LABELS: Record<Zone, string> = {
  identity: 'Identity',
  'on-hand': 'On-hand / Inventory',
  current: 'Current period',
  comparison: 'Comparison period',
}

function buildColumnDefs(keyColumnTitle: string, hasPriorYear: boolean): ColumnDef[] {
  const cols: ColumnDef[] = [
    {
      key: 'dimensionKey', title: keyColumnTitle, zone: 'identity', width: 180,
      render: (r) => r.dimensionKey,
      sortValue: (r) => r.dimensionKey,
    },
    {
      key: 'dimensionLabel', title: 'Label', zone: 'identity', width: 220,
      render: (r) => r.dimensionLabel ?? DASH,
      sortValue: (r) => r.dimensionLabel ?? '',
    },
    {
      key: 'storeNumber', title: 'Store', zone: 'identity', width: 80,
      render: (r) => r.storeNumber ?? '(all)',
      sortValue: (r) => r.storeNumber ?? 0,
    },
    {
      key: 'onHandAtCost', title: 'Inv (Cost)', zone: 'on-hand', align: 'right', width: 130, sumable: true,
      render: (r) => fmtMoney(r.onHandAtCost),
      sortValue: (r) => r.onHandAtCost,
    },
    {
      key: 'turns', title: 'Turns', zone: 'on-hand', align: 'right', width: 80,
      render: (r) => fmtPctBare1(r.turns),
      sortValue: (r) => r.turns ?? 0,
    },
    {
      key: 'roiPct', title: 'ROI', zone: 'on-hand', align: 'right', width: 90,
      render: (r) => r.roiPct == null ? DASH : `${fmtPctBare1(r.roiPct)}×`,
      sortValue: (r) => r.roiPct ?? 0,
    },
    {
      key: 'qty', title: 'Qty', zone: 'current', align: 'right', width: 90, sumable: true,
      render: (r) => fmtQty(r.qty),
      sortValue: (r) => r.qty,
    },
    {
      key: 'netSales', title: 'Net Sales', zone: 'current', align: 'right', width: 140, sumable: true,
      render: (r) => fmtMoney(r.netSales),
      sortValue: (r) => r.netSales,
    },
    {
      key: 'cogs', title: 'COGS', zone: 'current', align: 'right', width: 140, sumable: true,
      render: (r) => fmtMoney(r.cogs),
      sortValue: (r) => r.cogs,
    },
    {
      key: 'grossProfit', title: 'Gross Profit', zone: 'current', align: 'right', width: 140, sumable: true,
      render: (r) => fmtMoney(r.grossProfit),
      sortValue: (r) => r.grossProfit,
    },
    {
      key: 'gpPct', title: 'GP %', zone: 'current', align: 'right', width: 90,
      render: (r) => <GpBadge value={r.gpPct} />,
      sortValue: (r) => r.gpPct ?? 0,
    },
  ]
  if (hasPriorYear) {
    cols.push(
      {
        key: 'priorYearNetSales', title: 'Prior Yr Net', zone: 'comparison', align: 'right', width: 140, sumable: true,
        render: (r) => fmtMoney(r.priorYearNetSales),
        sortValue: (r) => r.priorYearNetSales ?? 0,
      },
      {
        key: 'pyPctChange', title: 'PY % Δ', zone: 'comparison', align: 'right', width: 100,
        render: (r) => <ChangePctBadge value={r.pyPctChange} />,
        sortValue: (r) => r.pyPctChange ?? 0,
      },
    )
  }
  return cols
}

// ─────────────────────── Grouping helpers ──────────────────────────────

type GroupBy = 'none' | 'storeNumber'

interface SubtotalRow {
  _type: 'subtotal'
  groupKey: string
  sums: Record<string, number>
}

interface DataRowWrap {
  _type: 'data'
  row: SalesAnalysisRow
}

type RenderRow = DataRowWrap | SubtotalRow

function computeSubtotals(rows: SalesAnalysisRow[], sumableKeys: readonly string[]): Record<string, number> {
  const sums: Record<string, number> = {}
  for (const k of sumableKeys) sums[k] = 0
  for (const r of rows) {
    for (const k of sumableKeys) {
      const v = (r as unknown as Record<string, number | null | undefined>)[k]
      if (typeof v === 'number' && !Number.isNaN(v)) sums[k]! += v
    }
  }
  return sums
}

function buildFlatRows(
  rows: SalesAnalysisRow[],
  groupBy: GroupBy,
  sumableKeys: readonly string[],
): RenderRow[] {
  if (groupBy === 'none') {
    return rows.map((row) => ({ _type: 'data' as const, row }))
  }
  // Group by store number. Per-store subtotal row follows each group.
  const groups = new Map<string, SalesAnalysisRow[]>()
  for (const row of rows) {
    const key = groupBy === 'storeNumber'
      ? (row.storeNumber == null ? '(all)' : String(row.storeNumber))
      : '(all)'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }
  const out: RenderRow[] = []
  for (const [groupKey, groupRows] of groups) {
    for (const row of groupRows) out.push({ _type: 'data', row })
    out.push({
      _type: 'subtotal',
      groupKey,
      sums: computeSubtotals(groupRows, sumableKeys),
    })
  }
  return out
}

// ─────────────────────── Query param plumbing ──────────────────────────

function readSalesAnalysisArgs(sp: URLSearchParams): SalesAnalysisArgs {
  const csvNum = (v: string | null): number[] | undefined => {
    if (!v) return undefined
    const arr = v.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n))
    return arr.length ? arr : undefined
  }
  const csvStr = (v: string | null): string[] | undefined => {
    if (!v) return undefined
    const arr = v.split(',').map((x) => x.trim()).filter(Boolean)
    return arr.length ? arr : undefined
  }
  return {
    dimension: (sp.get('dimension') ?? 'CATEGORY') as SalesAnalysisDimension,
    reportType: (sp.get('reportType') ?? 'SKU_DETAIL') as SalesAnalysisReportType,
    storeOption: (sp.get('storeOption') ?? 'COMBINE') as SalesAnalysisStoreOption,
    startDate: sp.get('startDate') ?? undefined,
    endDate: sp.get('endDate') ?? undefined,
    stores: csvNum(sp.get('stores')),
    categories: csvNum(sp.get('categories')),
    groups: csvStr(sp.get('groups')),
    storesRaw: sp.get('storesRaw') ?? undefined,
    categoriesRaw: sp.get('categoriesRaw') ?? undefined,
    vendorsRaw: sp.get('vendorsRaw') ?? undefined,
    seasonsRaw: sp.get('seasonsRaw') ?? undefined,
    styleColorRaw: sp.get('styleColorRaw') ?? undefined,
    skusRaw: sp.get('skusRaw') ?? undefined,
    groupsRaw: sp.get('groupsRaw') ?? undefined,
    keywordsRaw: sp.get('keywordsRaw') ?? undefined,
    priorYear: sp.get('priorYear') === 'true',
  }
}

// ─────────────────────── Main page ─────────────────────────────────────

const COLUMN_STORAGE_KEY = 'report-viewer:sales-analysis:columns'

export default function ReportViewerPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const type = searchParams.get('type') ?? 'sales-analysis'
  const args = useMemo(() => readSalesAnalysisArgs(searchParams), [searchParams])
  const { data, isFetching, error } = useSalesAnalysis(args)

  const keyColumnTitle =
    args.reportType === 'SKU_DETAIL' ? 'SKU'
    : args.reportType === 'CATEGORY_SUMMARY' ? 'Category'
    : args.reportType === 'DEPT_SUMMARY' ? 'Department'
    : args.reportType === 'VENDOR_SUMMARY' ? 'Vendor'
    : args.reportType === 'PRICE_POINT_SUMMARY' ? 'Price Point'
    : 'Key'

  const allColumns = useMemo(
    () => buildColumnDefs(keyColumnTitle, !!args.priorYear),
    [keyColumnTitle, args.priorYear],
  )

  // Column visibility — persisted per user in localStorage. Default: all on.
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set(allColumns.map((c) => c.key))
    try {
      const saved = window.localStorage.getItem(COLUMN_STORAGE_KEY)
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch {
      // ignore parse errors, fall through to default
    }
    return new Set(allColumns.map((c) => c.key))
  })

  useEffect(() => {
    // Whenever priorYear toggles, make sure newly-added columns are visible
    // by default. Existing preferences for other columns are preserved.
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      for (const c of allColumns) {
        if (!prev.has(c.key) && !saved(c.key)) next.add(c.key)
      }
      return next
    })
    function saved(_key: string): boolean {
      try {
        const s = window.localStorage.getItem(COLUMN_STORAGE_KEY)
        if (!s) return false
        return JSON.parse(s) === false
      } catch {
        return false
      }
    }
  }, [allColumns])

  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify([...visibleKeys]))
    } catch {
      // Quota exceeded or disabled storage — viewer still works, just
      // doesn't remember preferences across reloads.
    }
  }, [visibleKeys])

  const columns = useMemo(
    () => allColumns.filter((c) => visibleKeys.has(c.key)),
    [allColumns, visibleKeys],
  )

  const sumableKeys = useMemo(
    () => columns.filter((c) => c.sumable).map((c) => c.key),
    [columns],
  )

  const [groupBy, setGroupBy] = useState<GroupBy>('none')

  const renderRows = useMemo(
    () => (data ? buildFlatRows(data.rows, groupBy, sumableKeys) : []),
    [data, groupBy, sumableKeys],
  )

  // Grand totals computed from visible `sumable` columns, summed across every
  // data row (not per-group). Displayed in the table's Table.Summary row.
  const grandTotals = useMemo(
    () => (data ? computeSubtotals(data.rows, sumableKeys) : ({} as Record<string, number>)),
    [data, sumableKeys],
  )

  const antColumns = columns.map((c, colIdx) => ({
    title: (
      <span
        style={{
          background: ZONE_HEADER_BG[c.zone],
          display: 'block',
          margin: '-8px -8px',
          padding: '8px',
          textAlign: c.align ?? 'left',
        }}
      >
        {c.title}
      </span>
    ),
    key: c.key,
    dataIndex: c.key,
    width: c.width,
    align: c.align,
    render: (_: unknown, record: RenderRow) => {
      if (record._type === 'subtotal') {
        if (colIdx === 0) {
          return (
            <Text strong>Subtotal — {record.groupKey}</Text>
          )
        }
        if (c.sumable) {
          return (
            <Text strong>
              {c.key === 'qty' ? fmtQty(record.sums[c.key] ?? 0) : fmtMoney(record.sums[c.key] ?? 0)}
            </Text>
          )
        }
        return null
      }
      return (
        <div style={{ background: ZONE_CELL_BG[c.zone], margin: '-4px -8px', padding: '4px 8px' }}>
          {c.render(record.row)}
        </div>
      )
    },
  }))

  if (type !== 'sales-analysis') {
    return (
      <ViewerShell>
        <Alert
          type="warning"
          message="Unsupported report type"
          description={`The report viewer currently only supports type=sales-analysis. Received type=${type}.`}
        />
      </ViewerShell>
    )
  }

  return (
    <ViewerShell>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '12px 20px',
          borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
          background: '#fff',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          Back
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          Sales Analysis
        </Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Amounts in Lempira (HNL)
        </Text>
        <div style={{ flex: 1 }} />
        <Space>
          <Select<GroupBy>
            value={groupBy}
            onChange={setGroupBy}
            options={[
              { value: 'none', label: 'No grouping' },
              { value: 'storeNumber', label: 'Group by store' },
            ]}
            style={{ width: 160 }}
          />
          <Dropdown
            trigger={['click']}
            menu={{
              items: allColumns.map((c) => ({
                key: c.key,
                label: (
                  <Checkbox
                    checked={visibleKeys.has(c.key)}
                    onChange={(e) => {
                      setVisibleKeys((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(c.key)
                        else next.delete(c.key)
                        return next
                      })
                    }}
                  >
                    {c.title}
                  </Checkbox>
                ),
              })),
            }}
          >
            <Button icon={<SettingOutlined />}>Columns</Button>
          </Dropdown>
          <Button icon={<DownloadOutlined />} disabled title="CSV export — coming soon">
            CSV
          </Button>
          <Button icon={<FileExcelOutlined />} disabled title="XLSX export — coming soon">
            XLSX
          </Button>
        </Space>
      </div>

      <div style={{ padding: 20 }}>
        <FilterChips
          chips={[
            { label: 'Report', value: args.reportType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) },
            { label: 'Analyze', value: args.dimension.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) },
            args.storeOption ? { label: 'Stores', value: args.storeOption.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) } : null,
            args.startDate && args.endDate ? { label: 'Period', value: `${args.startDate} → ${args.endDate}` } : null,
            args.priorYear ? { label: 'Compare', value: 'Prior year' } : null,
            args.stores?.length ? { label: 'Stores in', value: args.stores.join(', ') } : null,
            args.categories?.length ? { label: 'Categories in', value: args.categories.join(', ') } : null,
            args.groups?.length ? { label: 'Groups in', value: args.groups.join(', ') } : null,
          ]}
        />
        <ZoneLegend priorYear={!!args.priorYear} />

        {error && (
          <Alert
            type="error"
            message="Failed to load report"
            description={getErrorMessage(error)}
            style={{ marginBottom: 16 }}
          />
        )}
        {isFetching && !data ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" tip="Querying RICS databases…" />
          </div>
        ) : data ? (
          <Table<RenderRow>
            dataSource={renderRows}
            columns={antColumns}
            rowKey={(r, i) => r._type === 'subtotal' ? `sub-${r.groupKey}` : `row-${i}`}
            size="small"
            pagination={{ pageSize: 100, showSizeChanger: true }}
            sticky
            rowClassName={(r, i) =>
              r._type === 'subtotal' ? 'report-viewer-subtotal' : (i % 2 === 1 ? 'report-zebra-row' : '')
            }
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  {columns.map((c, colIdx) => (
                    <Table.Summary.Cell
                      index={colIdx}
                      key={c.key}
                      align={c.align}
                    >
                      <div
                        style={{
                          background: 'rgba(22, 119, 255, 0.08)',
                          borderTop: '1px solid rgba(22, 119, 255, 0.3)',
                          margin: '-4px -8px',
                          padding: '4px 8px',
                          fontWeight: 600,
                        }}
                      >
                        {colIdx === 0 ? (
                          'Totals'
                        ) : c.sumable ? (
                          c.key === 'qty' ? fmtQty(grandTotals[c.key] ?? 0) : fmtMoney(grandTotals[c.key] ?? 0)
                        ) : null}
                      </div>
                    </Table.Summary.Cell>
                  ))}
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        ) : null}
      </div>
    </ViewerShell>
  )
}

function ViewerShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh' }}>
      {children}
    </div>
  )
}

function ZoneLegend({ priorYear }: { priorYear: boolean }) {
  const zones: Zone[] = ['on-hand', 'current']
  if (priorYear) zones.push('comparison')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        Column groups:
      </Text>
      {zones.map((z) => (
        <span
          key={z}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'rgba(0, 0, 0, 0.65)',
          }}
        >
          <span
            style={{
              width: 14,
              height: 14,
              background: ZONE_HEADER_BG[z],
              borderRadius: 3,
              display: 'inline-block',
              border: '1px solid rgba(0, 0, 0, 0.08)',
            }}
          />
          {ZONE_LABELS[z]}
        </span>
      ))}
      <Link
        to="/reports/sales/analysis"
        style={{
          fontSize: 12,
          marginLeft: 'auto',
          color: 'rgba(0, 0, 0, 0.45)',
        }}
      >
        Back to filter form ↗
      </Link>
    </div>
  )
}
