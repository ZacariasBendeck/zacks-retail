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
import { fmtMoney, fmtQty, fmtPctBare1, DASH } from '../../utils/reportFormatters'
import ReportThumbnail from '../../components/reports/ReportThumbnail'

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

// Extended-attribute dimensions whose rendering is already covered by a
// dedicated fixed column, so surfacing them as a tier-2 "ext:" column would
// produce a visible duplicate. `company` is the obvious case — it aliases
// `inventory_master.manufacturer`, which is already rendered as the
// "Company" column (attr:manufacturer).
const REDUNDANT_EXTENDED_DIMS: ReadonlySet<string> = new Set(['company', 'manufacturer'])

// Extended (tier-2) dimension columns — one per operator-assigned dimension
// that actually appeared in the current result. Default-hidden (there can be
// many; operator ticks what they want). Identity zone so the color band stays
// contiguous with the other SKU-attribute columns.
//
// Dimensions listed in REDUNDANT_EXTENDED_DIMS are skipped entirely — their
// data is already surfaced by a dedicated fixed column elsewhere, so showing
// them twice just confuses operators.
function buildExtendedColumnDefs(dimensions: string[]): ColumnDef[] {
  return dimensions
    .filter((dim) => !REDUNDANT_EXTENDED_DIMS.has(dim.toLowerCase()))
    .map((dim) => ({
      key: `ext:${dim}`,
      title: dim.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      zone: 'identity' as const,
      width: 110,
      render: (r: SalesAnalysisRow) => r.attributes?.extended?.[dim] ?? DASH,
      sortValue: (r: SalesAnalysisRow) => r.attributes?.extended?.[dim] ?? '',
    }))
}

/**
 * Column layout for SKU_DETAIL runs in the fullscreen viewer.
 *
 * Order (operator-requested):
 *   Image · Dept · Category · Vendor · SKU · Description · Label · Style/Color
 *     · <extended dims>
 *     · Inv (Units) · Current Cost · Total Cost · Current Price
 *     · Qty (Sales) · Net Sales · COGS · Gross Profit · GP% · ROI · Turns
 *     · [Prior Yr Net · PY% Δ when priorYear=true]
 *     · Store
 *
 * Store moves to the far right per operator request. Widths tuned slim so
 * the SKU_DETAIL grid fits more columns on screen; money columns stay wide
 * enough for 6-digit totals (999,999.99).
 */
function buildSkuDetailColumns(hasPriorYear: boolean, extendedDimensions: string[]): ColumnDef[] {
  return [
    // ── Identity — SKU context chain ─────────────────────────────────
    // Dept → Cat → Vendor → SKU → Image → Description, with less-used
    // identity columns (Label, Style/Color, Company, extended dims) trailing
    // and default-hidden. Widths trimmed vs the prior pass so the default
    // row fits more columns without horizontal scrolling.
    {
      key: 'attr:departmentDesc', title: 'Dept', zone: 'identity', width: 100,
      render: (r) => {
        const n = r.attributes?.departmentNumber
        const d = r.attributes?.departmentDesc
        if (n == null && !d) return DASH
        if (n != null && d) return `${n} — ${d}`
        return d ?? String(n ?? '')
      },
      sortValue: (r) => r.attributes?.departmentNumber ?? 0,
    },
    {
      key: 'attr:category', title: 'Category', zone: 'identity', width: 120,
      render: (r) => {
        const n = r.attributes?.categoryNumber
        const d = r.attributes?.categoryDesc
        if (n == null && !d) return DASH
        if (n != null && d) return `${n} — ${d}`
        return d ?? String(n ?? '')
      },
      sortValue: (r) => r.attributes?.categoryNumber ?? 0,
    },
    {
      key: 'attr:vendorCode', title: 'Vendor', zone: 'identity', width: 70,
      render: (r) => r.attributes?.vendorCode ?? DASH,
      sortValue: (r) => r.attributes?.vendorCode ?? '',
    },
    {
      key: 'dimensionKey', title: 'SKU', zone: 'identity', width: 130,
      render: (r) => r.dimensionKey,
      sortValue: (r) => r.dimensionKey,
    },
    // Thumbnail immediately after the SKU — matches operator's scanning flow
    // (find the SKU by code, then confirm by image). Uses the shared
    // ReportThumbnail component so the size matches Products → SKUs.
    {
      key: 'attr:pictureUrl', title: 'Image', zone: 'identity', width: 135,
      render: (r) => <ReportThumbnail url={r.attributes?.pictureUrl} />,
      sortValue: (r) => r.attributes?.pictureUrl ?? '',
    },
    {
      key: 'attr:description', title: 'Description', zone: 'identity', width: 190,
      render: (r) => r.attributes?.description ?? DASH,
      sortValue: (r) => r.attributes?.description ?? '',
    },
    // Default-hidden identity columns — still available in the chooser.
    {
      key: 'dimensionLabel', title: 'Label', zone: 'identity', width: 130,
      render: (r) => r.dimensionLabel ?? DASH,
      sortValue: (r) => r.dimensionLabel ?? '',
    },
    {
      key: 'attr:styleColor', title: 'Style/Color', zone: 'identity', width: 95,
      render: (r) => r.attributes?.styleColor ?? DASH,
      sortValue: (r) => r.attributes?.styleColor ?? '',
    },
    {
      key: 'attr:manufacturer', title: 'Company', zone: 'identity', width: 150,
      render: (r) => r.attributes?.manufacturer ?? DASH,
      sortValue: (r) => r.attributes?.manufacturer ?? '',
    },
    ...buildExtendedColumnDefs(extendedDimensions),
    // ── On-hand / Inventory ──────────────────────────────────────────
    {
      key: 'attr:unitsOnHand', title: 'Inv (Units)', zone: 'on-hand', align: 'right', width: 80, sumable: true,
      render: (r) => fmtQty(r.attributes?.unitsOnHand ?? 0),
      sortValue: (r) => r.attributes?.unitsOnHand ?? 0,
    },
    {
      key: 'attr:currentCost', title: 'Current Cost', zone: 'on-hand', align: 'right', width: 90,
      render: (r) => fmtMoney(r.attributes?.currentCost ?? null),
      sortValue: (r) => r.attributes?.currentCost ?? 0,
    },
    {
      key: 'onHandAtCost', title: 'Total Cost', zone: 'on-hand', align: 'right', width: 100, sumable: true,
      render: (r) => fmtMoney(r.onHandAtCost),
      sortValue: (r) => r.onHandAtCost,
    },
    {
      key: 'attr:currentPrice', title: 'Current Price', zone: 'on-hand', align: 'right', width: 90,
      render: (r) => fmtMoney(r.attributes?.currentPrice ?? null),
      sortValue: (r) => r.attributes?.currentPrice ?? 0,
    },
    // ── Current period sales + derived metrics ───────────────────────
    {
      key: 'qty', title: 'Qty (Sales)', zone: 'current', align: 'right', width: 75, sumable: true,
      render: (r) => fmtQty(r.qty),
      sortValue: (r) => r.qty,
    },
    {
      key: 'netSales', title: 'Net Sales', zone: 'current', align: 'right', width: 100, sumable: true,
      render: (r) => fmtMoney(r.netSales),
      sortValue: (r) => r.netSales,
    },
    {
      key: 'cogs', title: 'COGS', zone: 'current', align: 'right', width: 95, sumable: true,
      render: (r) => fmtMoney(r.cogs),
      sortValue: (r) => r.cogs,
    },
    {
      key: 'grossProfit', title: 'Gross Profit', zone: 'current', align: 'right', width: 100, sumable: true,
      render: (r) => fmtMoney(r.grossProfit),
      sortValue: (r) => r.grossProfit,
    },
    {
      key: 'gpPct', title: 'GP %', zone: 'current', align: 'right', width: 60,
      render: (r) => <GpBadge value={r.gpPct} />,
      sortValue: (r) => r.gpPct ?? 0,
    },
    {
      key: 'roiPct', title: 'ROI', zone: 'current', align: 'right', width: 65,
      render: (r) => r.roiPct == null ? DASH : `${fmtPctBare1(r.roiPct)}×`,
      sortValue: (r) => r.roiPct ?? 0,
    },
    {
      key: 'turns', title: 'Turns', zone: 'current', align: 'right', width: 60,
      render: (r) => fmtPctBare1(r.turns),
      sortValue: (r) => r.turns ?? 0,
    },
    // ── Comparison period (optional) ─────────────────────────────────
    ...(hasPriorYear
      ? ([
          {
            key: 'priorYearNetSales', title: 'Prior Yr Net', zone: 'comparison', align: 'right', width: 100, sumable: true,
            render: (r: SalesAnalysisRow) => fmtMoney(r.priorYearNetSales),
            sortValue: (r: SalesAnalysisRow) => r.priorYearNetSales ?? 0,
          },
          {
            key: 'pyPctChange', title: 'PY % Δ', zone: 'comparison', align: 'right', width: 70,
            render: (r: SalesAnalysisRow) => <ChangePctBadge value={r.pyPctChange} />,
            sortValue: (r: SalesAnalysisRow) => r.pyPctChange ?? 0,
          },
        ] as ColumnDef[])
      : []),
    // ── Store — far right, per operator request ──────────────────────
    {
      key: 'storeNumber', title: 'Store', zone: 'identity', width: 60,
      render: (r) => r.storeNumber ?? '(all)',
      sortValue: (r) => r.storeNumber ?? 0,
    },
  ]
}

/**
 * Column layout for summary report types (CATEGORY_SUMMARY, DEPT_SUMMARY,
 * VENDOR_SUMMARY, PRICE_POINT_SUMMARY). These aggregate across SKUs so the
 * per-SKU attributes aren't meaningful. Widths slimmed to match the denser
 * SKU_DETAIL grid.
 */
function buildSummaryColumns(keyColumnTitle: string, hasPriorYear: boolean): ColumnDef[] {
  const cols: ColumnDef[] = [
    {
      key: 'dimensionKey', title: keyColumnTitle, zone: 'identity', width: 140,
      render: (r) => r.dimensionKey,
      sortValue: (r) => r.dimensionKey,
    },
    {
      key: 'dimensionLabel', title: 'Label', zone: 'identity', width: 180,
      render: (r) => r.dimensionLabel ?? DASH,
      sortValue: (r) => r.dimensionLabel ?? '',
    },
    {
      key: 'onHandAtCost', title: 'Total Cost', zone: 'on-hand', align: 'right', width: 105, sumable: true,
      render: (r) => fmtMoney(r.onHandAtCost),
      sortValue: (r) => r.onHandAtCost,
    },
    {
      key: 'qty', title: 'Qty (Sales)', zone: 'current', align: 'right', width: 80, sumable: true,
      render: (r) => fmtQty(r.qty),
      sortValue: (r) => r.qty,
    },
    {
      key: 'netSales', title: 'Net Sales', zone: 'current', align: 'right', width: 105, sumable: true,
      render: (r) => fmtMoney(r.netSales),
      sortValue: (r) => r.netSales,
    },
    {
      key: 'cogs', title: 'COGS', zone: 'current', align: 'right', width: 100, sumable: true,
      render: (r) => fmtMoney(r.cogs),
      sortValue: (r) => r.cogs,
    },
    {
      key: 'grossProfit', title: 'Gross Profit', zone: 'current', align: 'right', width: 105, sumable: true,
      render: (r) => fmtMoney(r.grossProfit),
      sortValue: (r) => r.grossProfit,
    },
    {
      key: 'gpPct', title: 'GP %', zone: 'current', align: 'right', width: 65,
      render: (r) => <GpBadge value={r.gpPct} />,
      sortValue: (r) => r.gpPct ?? 0,
    },
    {
      key: 'roiPct', title: 'ROI', zone: 'current', align: 'right', width: 70,
      render: (r) => r.roiPct == null ? DASH : `${fmtPctBare1(r.roiPct)}×`,
      sortValue: (r) => r.roiPct ?? 0,
    },
    {
      key: 'turns', title: 'Turns', zone: 'current', align: 'right', width: 65,
      render: (r) => fmtPctBare1(r.turns),
      sortValue: (r) => r.turns ?? 0,
    },
  ]
  if (hasPriorYear) {
    cols.push(
      {
        key: 'priorYearNetSales', title: 'Prior Yr Net', zone: 'comparison', align: 'right', width: 105, sumable: true,
        render: (r) => fmtMoney(r.priorYearNetSales),
        sortValue: (r) => r.priorYearNetSales ?? 0,
      },
      {
        key: 'pyPctChange', title: 'PY % Δ', zone: 'comparison', align: 'right', width: 75,
        render: (r) => <ChangePctBadge value={r.pyPctChange} />,
        sortValue: (r) => r.pyPctChange ?? 0,
      },
    )
  }
  cols.push({
    key: 'storeNumber', title: 'Store', zone: 'identity', width: 65,
    render: (r) => r.storeNumber ?? '(all)',
    sortValue: (r) => r.storeNumber ?? 0,
  })
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

// Resolve a column key to a numeric value on a row. Metric columns map
// directly to top-level fields; `attr:*` columns route through the row's
// `attributes` bag so we can sum units-on-hand, current cost, etc.
function getNumericForKey(row: SalesAnalysisRow, key: string): number | null {
  if (key.startsWith('attr:')) {
    const field = key.slice('attr:'.length) as keyof NonNullable<SalesAnalysisRow['attributes']>
    const v = row.attributes?.[field]
    return typeof v === 'number' && !Number.isNaN(v) ? v : null
  }
  const v = (row as unknown as Record<string, number | null | undefined>)[key]
  return typeof v === 'number' && !Number.isNaN(v) ? v : null
}

function computeSubtotals(rows: SalesAnalysisRow[], sumableKeys: readonly string[]): Record<string, number> {
  const sums: Record<string, number> = {}
  for (const k of sumableKeys) sums[k] = 0
  for (const r of rows) {
    for (const k of sumableKeys) {
      const v = getNumericForKey(r, k)
      if (v != null) sums[k]! += v
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

// Bumped to :v3 when thumbnail moved after SKU and default-hidden list was
// expanded to include operator-side extended dims (Buyer / Discount type /
// Company). Earlier preferences are invalidated so operators see the new
// defaults on their next visit. Bump again on any future reshape.
const COLUMN_STORAGE_KEY = 'report-viewer:sales-analysis:columns:v3'

// Columns hidden by default on SKU_DETAIL's first run. Operator still has
// them one click away via the Columns chooser; we just don't show them out
// of the box because the default grid is meant to be lean.
//
// Extended ("ext:*") dimensions are ALSO added to the hidden set dynamically
// (every run — see defaultHiddenKeys in the component). The explicit entries
// below are the ones we know the operator always wants default-hidden
// regardless of whether they show up in the data — listing them here means
// a stale localStorage set carried over from v2 still gets the toggle fix.
const DEFAULT_HIDDEN_SKU_DETAIL_KEYS: ReadonlySet<string> = new Set([
  'dimensionLabel',          // "Label" — redundant with SKU + Description
  'attr:styleColor',          // Style/Color — operator-opts-in
  'attr:manufacturer',        // "Company" — operator-opts-in
  'ext:buyer',                // "Buyer" extended dim — operator-opts-in
  'ext:discount_type',        // "Discount type" extended dim — operator-opts-in
  'ext:discount-type',        // tolerate either kebab-case variant of the dim code
])

export default function ReportViewerPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const type = searchParams.get('type') ?? 'sales-analysis'
  // The viewer always asks for per-SKU attribute enrichment so the column
  // chooser has data to work with. The inline builder preview does not.
  const args = useMemo(() => {
    const base = readSalesAnalysisArgs(searchParams)
    return base.reportType === 'SKU_DETAIL' ? { ...base, includeAttributes: true } : base
  }, [searchParams])
  const { data, isFetching, error } = useSalesAnalysis(args)

  const keyColumnTitle =
    args.reportType === 'SKU_DETAIL' ? 'SKU'
    : args.reportType === 'CATEGORY_SUMMARY' ? 'Category'
    : args.reportType === 'DEPT_SUMMARY' ? 'Department'
    : args.reportType === 'VENDOR_SUMMARY' ? 'Vendor'
    : args.reportType === 'PRICE_POINT_SUMMARY' ? 'Price Point'
    : 'Key'

  // Extended attribute dimensions that actually showed up in this response.
  // Empty when reportType isn't SKU_DETAIL or no operator has assigned any.
  const extendedDimensions = useMemo(() => {
    if (!data?.rows?.length) return [] as string[]
    const seen = new Set<string>()
    for (const r of data.rows) {
      if (r.attributes?.extended) {
        for (const k of Object.keys(r.attributes.extended)) seen.add(k)
      }
    }
    return Array.from(seen).sort()
  }, [data])

  // Build the final ordered column set. SKU_DETAIL gets the rich attribute
  // layout (image, dept/category/vendor before SKU, units/costs, store at
  // the end). Summary report types use the slimmer aggregate layout — they
  // aggregate across SKUs so per-SKU attributes don't apply.
  const allColumns = useMemo(() => {
    if (args.reportType === 'SKU_DETAIL') {
      return buildSkuDetailColumns(!!args.priorYear, extendedDimensions)
    }
    return buildSummaryColumns(keyColumnTitle, !!args.priorYear)
  }, [keyColumnTitle, args.priorYear, args.reportType, extendedDimensions])

  // Every column in `allColumns` that should be hidden by default on this
  // run. SKU_DETAIL combines the fixed hidden set with every extended-dim
  // column (those are default-opt-in). Summary reports hide nothing by
  // default — every column in the layout is useful out of the box.
  const defaultHiddenKeys = useMemo(() => {
    if (args.reportType !== 'SKU_DETAIL') return new Set<string>()
    const hidden = new Set<string>(DEFAULT_HIDDEN_SKU_DETAIL_KEYS)
    for (const dim of extendedDimensions) hidden.add(`ext:${dim}`)
    return hidden
  }, [args.reportType, extendedDimensions])

  // Column visibility — persisted per user in localStorage under the v2 key.
  // Initial set: every column in `allColumns` EXCEPT `defaultHiddenKeys`.
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(() => {
    const seedFromDefaults = (): Set<string> =>
      new Set(allColumns.filter((c) => !defaultHiddenKeys.has(c.key)).map((c) => c.key))
    if (typeof window === 'undefined') return seedFromDefaults()
    try {
      const saved = window.localStorage.getItem(COLUMN_STORAGE_KEY)
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch {
      // ignore parse errors, fall through to default
    }
    return seedFromDefaults()
  })

  useEffect(() => {
    // When the column set changes (priorYear toggles, reportType changes,
    // new extended dim shows up) add any newly-available columns to the
    // visible set — except those that should be hidden by default, which
    // stay off until the operator opts in via the Columns chooser.
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      for (const c of allColumns) {
        if (!prev.has(c.key) && !defaultHiddenKeys.has(c.key)) next.add(c.key)
      }
      return next
    })
  }, [allColumns, defaultHiddenKeys])

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
          // Unit-count columns use the integer formatter; everything else
          // (money sums) uses the 2-dp money formatter.
          const isUnitCol = c.key === 'qty' || c.key === 'attr:unitsOnHand'
          return (
            <Text strong>
              {isUnitCol ? fmtQty(record.sums[c.key] ?? 0) : fmtMoney(record.sums[c.key] ?? 0)}
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
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => {
            // Prefer browser Back when there's meaningful history (user clicked
            // through from /reports/templates or a list page); fall back to the
            // Sales Analysis builder when the viewer was opened directly from a
            // bookmarked URL — that's the most useful place to land.
            if (window.history.length > 1) {
              navigate(-1)
            } else {
              navigate('/reports/sales/analysis')
            }
          }}
        >
          <span>Back</span>
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
