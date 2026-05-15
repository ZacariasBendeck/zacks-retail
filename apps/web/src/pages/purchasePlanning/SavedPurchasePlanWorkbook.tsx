import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Empty, Input, InputNumber, Row, Segmented, Space, Table, Tabs, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import {
  type SavedPurchasePlanDetail,
  type SavedPurchasePlanRow,
  type SavedPurchasePlanRowsUpdateRequest,
  type SavedPurchasePlanSalesTrendDirection,
  type SavedPurchasePlanSalesTrendSummary,
} from '../../services/purchasePlanningApi'
import './SavedPurchasePlanWorkbook.css'

const { Title, Text } = Typography

const integerFmt = new Intl.NumberFormat('en-US')

type WorksheetColumnMode = 'months' | 'seasons'
type WorksheetTabKey = 'sales-projection' | 'on-hand-projection'

type WorksheetMetricKey =
  | 'currentBoh'
  | 'lastYearSalesUnits'
  | 'lastYearBeginningOnHand'
  | 'yearBeforeLastSalesUnits'
  | 'lastYearVsPriorChangePct'
  | 'yearBeforeLastBeginningOnHand'
  | 'lastYearSellThroughPct'
  | 'currentProjSales'
  | 'salesUnitDelta'
  | 'salesUnitChangePct'
  | 'currentEohTarget'
  | 'baselineBuy'
  | 'currentBuy'
  | 'currentEohActual'
  | 'stockPosition'
  | 'normalizationFactor'

type EditableWorksheetMetricKey = 'currentProjSales' | 'currentEohTarget' | 'currentBuy'

interface WorksheetMetric {
  key: WorksheetMetricKey
  label: string
  aggregate: 'sum' | 'first' | 'last' | 'average'
  editableKey?: EditableWorksheetMetricKey
  inputLabel?: string
  format: 'integer' | 'percent'
  signed?: boolean
}

interface WorksheetPeriod {
  key: string
  label: string
  months: string[]
  mode: WorksheetColumnMode
}

interface WorksheetPivotRow {
  key: string
  departmentKey: string
  departmentLabel: string
  metric: WorksheetMetric
}

interface SalesProjectionSummary {
  lastYear12MonthSales: number | null
  projectedNext12MonthSales: number
  suggestedProjectionIncreasePct: number | null
  userProjectedIncreasePct: number | null
}

const SALES_PROJECTION_METRICS: WorksheetMetric[] = [
  { key: 'lastYearSalesUnits', label: "Last year's sales units", aggregate: 'sum', format: 'integer' },
  { key: 'lastYearBeginningOnHand', label: "Last year's beginning on hand", aggregate: 'sum', format: 'integer' },
  { key: 'yearBeforeLastSalesUnits', label: 'Year before last sales units', aggregate: 'sum', format: 'integer' },
  { key: 'lastYearVsPriorChangePct', label: 'Increase last year vs prior', aggregate: 'average', format: 'percent', signed: true },
  { key: 'yearBeforeLastBeginningOnHand', label: 'Year before last beginning on hand', aggregate: 'sum', format: 'integer' },
  { key: 'lastYearSellThroughPct', label: 'Sell thru for the month', aggregate: 'average', format: 'percent' },
  { key: 'currentProjSales', label: 'Projected sales', aggregate: 'sum', editableKey: 'currentProjSales', inputLabel: 'projected sales', format: 'integer' },
  { key: 'salesUnitDelta', label: 'Compared sales units', aggregate: 'sum', format: 'integer', signed: true },
]

const ON_HAND_PROJECTION_METRICS: WorksheetMetric[] = [
  { key: 'currentProjSales', label: 'Projected sales', aggregate: 'sum', format: 'integer' },
  { key: 'currentBoh', label: 'Projected BOH', aggregate: 'first', format: 'integer' },
  { key: 'currentEohTarget', label: 'EOH target', aggregate: 'last', editableKey: 'currentEohTarget', inputLabel: 'EOH target', format: 'integer' },
  { key: 'baselineBuy', label: 'Baseline buy', aggregate: 'sum', format: 'integer' },
  { key: 'currentBuy', label: 'Current buy', aggregate: 'sum', editableKey: 'currentBuy', inputLabel: 'current buy', format: 'integer' },
  { key: 'currentEohActual', label: 'Projected EOH', aggregate: 'last', format: 'integer' },
  { key: 'stockPosition', label: 'Stock position', aggregate: 'last', format: 'integer' },
  { key: 'normalizationFactor', label: 'Norm', aggregate: 'average', format: 'percent' },
]

export interface SavedPurchasePlanWorkbookProps {
  detail: SavedPurchasePlanDetail | null | undefined
  loading?: boolean
  error?: unknown
  emptyDescription?: string
  saveLoading?: boolean
  recalculateLoading?: boolean
  archiveLoading?: boolean
  confirmLoading?: boolean
  showArchive?: boolean
  confirmLabel?: string
  extraControls?: ReactNode
  salesTrendSummary?: SavedPurchasePlanSalesTrendSummary | null
  onSaveRows: (planId: string, payload: SavedPurchasePlanRowsUpdateRequest) => void
  onRecalculate?: (planId: string) => void
  onArchive?: (planId: string) => void
  onConfirm?: (planId: string) => void
}

export function formatPurchasePlanMonth(yearMonth: string): string {
  return dayjs(`${yearMonth}-01`).format('MMM YYYY')
}

function seasonForYearMonth(yearMonth: string): { key: string; label: string } {
  const [rawYear, rawMonth] = yearMonth.split('-')
  const year = Number(rawYear)
  const month = Number(rawMonth)
  if (month >= 2 && month <= 4) return { key: `spring-${year}`, label: `Spring ${year}` }
  if (month >= 5 && month <= 7) return { key: `summer-${year}`, label: `Summer ${year}` }
  if (month >= 8 && month <= 10) return { key: `fall-${year}`, label: `Fall ${year}` }
  if (month >= 11 && month <= 12) return { key: `winter-${year}`, label: `Winter ${year}` }
  return { key: `winter-${year - 1}`, label: `Winter ${year - 1}` }
}

export function buildPurchasePlanWorksheetPeriods(months: string[], mode: WorksheetColumnMode): WorksheetPeriod[] {
  const sortedMonths = [...new Set(months)].sort()
  if (mode === 'months') {
    return sortedMonths.map((month) => ({
      key: month,
      label: formatPurchasePlanMonth(month),
      months: [month],
      mode,
    }))
  }

  const periods: WorksheetPeriod[] = []
  for (const month of sortedMonths) {
    const season = seasonForYearMonth(month)
    const current = periods[periods.length - 1]
    if (current?.key === season.key) {
      current.months.push(month)
    } else {
      periods.push({ key: season.key, label: season.label, months: [month], mode })
    }
  }
  return periods
}

function formatInt(value: number | null | undefined): string {
  return integerFmt.format(Math.round(value ?? 0))
}

function formatSignedPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return 'N/A'
  const rounded = Math.round(Number(value) * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

function formatTrendMonthRange(fromYearMonth: string | null | undefined, toYearMonth: string | null | undefined): string {
  if (!fromYearMonth || !toYearMonth) return 'N/A'
  if (fromYearMonth === toYearMonth) return formatPurchasePlanMonth(fromYearMonth)
  return `${formatPurchasePlanMonth(fromYearMonth)}-${formatPurchasePlanMonth(toYearMonth)}`
}

function renderTrendWindowHelp(label: string, trendWindow: SavedPurchasePlanSalesTrendSummary['last12']): ReactNode {
  return (
    <div>
      <strong>{label}:</strong>{' '}
      {formatTrendMonthRange(trendWindow.currentFromYearMonth, trendWindow.currentToYearMonth)} vs{' '}
      {formatTrendMonthRange(trendWindow.comparisonFromYearMonth, trendWindow.comparisonToYearMonth)}
      {' '}({formatInt(trendWindow.currentUnits)} units vs {formatInt(trendWindow.comparisonUnits)} units)
    </div>
  )
}

function renderCategoryTrendTooltip(summary: SavedPurchasePlanSalesTrendSummary): ReactNode {
  return (
    <div className="purchase-plan-trend-tooltip">
      <div><strong>Trend calculations</strong></div>
      <div>Uses complete workbook history through {formatPurchasePlanMonth(summary.historyToYearMonth)}.</div>
      <div>Enterprise sales and on-hand calculations include all stores and warehouses.</div>
      {renderTrendWindowHelp('Last 12M', summary.last12)}
      {renderTrendWindowHelp('Recent 6M', summary.recent6)}
      {renderTrendWindowHelp('Recent 3M', summary.recent3)}
      <div>Change % = (current units - comparison units) / comparison units.</div>
      <div>If comparison units are zero, percent is shown as N/A.</div>
    </div>
  )
}

function formUnit(value: number | null | undefined): number {
  if (value == null || Number.isNaN(Number(value))) return 0
  return Math.max(0, Math.round(Number(value)))
}

function trendDirectionLabel(direction: SavedPurchasePlanSalesTrendDirection): string {
  switch (direction) {
    case 'increasing':
      return 'Increasing'
    case 'decreasing':
      return 'Decreasing'
    case 'flat':
      return 'Flat'
    case 'insufficient_history':
      return 'Insufficient history'
    default:
      return direction
  }
}

function trendDirectionColor(direction: SavedPurchasePlanSalesTrendDirection): string {
  if (direction === 'increasing') return 'green'
  if (direction === 'decreasing') return 'red'
  if (direction === 'flat') return 'blue'
  return 'default'
}

function confidenceColor(confidence: SavedPurchasePlanSalesTrendSummary['confidence']): string {
  if (confidence === 'high') return 'green'
  if (confidence === 'medium') return 'gold'
  return 'red'
}

function worksheetMetricValue(row: SavedPurchasePlanRow, metric: WorksheetMetric): number | null {
  if (metric.key === 'salesUnitDelta') {
    return row.lastYearSalesUnits == null ? null : row.currentProjSales - row.lastYearSalesUnits
  }
  if (metric.key === 'salesUnitChangePct') {
    if (row.lastYearSalesUnits == null || row.lastYearSalesUnits === 0) return null
    return (row.currentProjSales - row.lastYearSalesUnits) / row.lastYearSalesUnits
  }
  if (metric.key === 'lastYearVsPriorChangePct') {
    if (
      row.lastYearSalesUnits == null
      || row.yearBeforeLastSalesUnits == null
      || row.yearBeforeLastSalesUnits === 0
    ) return null
    return (row.lastYearSalesUnits - row.yearBeforeLastSalesUnits) / row.yearBeforeLastSalesUnits
  }
  if (metric.key === 'lastYearSellThroughPct') {
    if (
      row.lastYearSalesUnits == null
      || row.lastYearNextMonthBeginningOnHand == null
      || row.lastYearNextMonthBeginningOnHand <= 0
    ) return null
    return row.lastYearSalesUnits / row.lastYearNextMonthBeginningOnHand
  }
  const value = row[metric.key as keyof SavedPurchasePlanRow]
  return value == null ? null : Number(value)
}

function aggregateWorksheetMetric(rows: SavedPurchasePlanRow[], metric: WorksheetMetric): number | null {
  if (rows.length === 0) return null
  if (metric.key === 'salesUnitChangePct') {
    const lastYearSales = rows.reduce((sum, row) => sum + (row.lastYearSalesUnits ?? 0), 0)
    if (lastYearSales === 0) return null
    const projectedSales = rows.reduce((sum, row) => sum + row.currentProjSales, 0)
    return (projectedSales - lastYearSales) / lastYearSales
  }
  if (metric.key === 'lastYearVsPriorChangePct') {
    const comparableRows = rows.filter((row) => (
      row.lastYearSalesUnits != null
      && row.yearBeforeLastSalesUnits != null
    ))
    const priorSales = comparableRows.reduce((sum, row) => sum + (row.yearBeforeLastSalesUnits ?? 0), 0)
    if (priorSales === 0) return null
    const lastYearSales = comparableRows.reduce((sum, row) => sum + (row.lastYearSalesUnits ?? 0), 0)
    return (lastYearSales - priorSales) / priorSales
  }
  if (metric.key === 'lastYearSellThroughPct') {
    const rowsWithSellThroughBasis = rows.filter((row) => (
      row.lastYearSalesUnits != null
      && row.lastYearNextMonthBeginningOnHand != null
      && row.lastYearNextMonthBeginningOnHand > 0
    ))
    const sales = rowsWithSellThroughBasis.reduce((sum, row) => sum + (row.lastYearSalesUnits ?? 0), 0)
    const beginningOnHand = rowsWithSellThroughBasis.reduce((sum, row) => sum + (row.lastYearNextMonthBeginningOnHand ?? 0), 0)
    return beginningOnHand > 0 ? sales / beginningOnHand : null
  }
  const values = rows
    .map((row) => worksheetMetricValue(row, metric))
    .filter((value): value is number => value != null)
  if (values.length === 0) return null
  switch (metric.aggregate) {
    case 'first':
      return values[0] ?? null
    case 'last':
      return values[values.length - 1] ?? null
    case 'average':
      return values.reduce((sum, value) => sum + value, 0) / values.length
    case 'sum':
      return values.reduce((sum, value) => sum + value, 0)
    default:
      return null
  }
}

function formatWorksheetMetric(value: number | null, metric: WorksheetMetric): string {
  if (value == null) return '-'
  const sign = metric.signed && value > 0 ? '+' : ''
  if (metric.format === 'percent') return `${sign}${Math.round(value * 1000) / 10}%`
  return `${sign}${formatInt(value)}`
}

function formatSummaryUnits(value: number | null | undefined): string {
  if (value == null) return 'N/A'
  return `${formatInt(value)} units`
}

function buildSalesWorksheetChanges(
  rows: SavedPurchasePlanRow[],
  originals: Map<string, SavedPurchasePlanRow>,
): SavedPurchasePlanRowsUpdateRequest['rows'] {
  return rows.flatMap((row) => {
    const original = originals.get(row.id)
    if (!original) return []
    const change: SavedPurchasePlanRowsUpdateRequest['rows'][number] = { rowId: row.id }
    if (row.currentProjSales !== original.currentProjSales) change.currentProjSales = row.currentProjSales
    return change.currentProjSales == null ? [] : [change]
  })
}

function buildOnHandWorksheetChanges(
  rows: SavedPurchasePlanRow[],
  originals: Map<string, SavedPurchasePlanRow>,
): SavedPurchasePlanRowsUpdateRequest['rows'] {
  return rows.flatMap((row) => {
    const original = originals.get(row.id)
    if (!original) return []
    const change: SavedPurchasePlanRowsUpdateRequest['rows'][number] = { rowId: row.id }
    if (row.currentEohTarget !== original.currentEohTarget) change.currentEohTarget = row.currentEohTarget
    if (row.currentBuy !== original.currentBuy) change.currentBuy = row.currentBuy
    return change.currentEohTarget == null && change.currentBuy == null ? [] : [change]
  })
}

export function SavedPurchasePlanWorkbook({
  detail,
  loading,
  error,
  emptyDescription = 'No monthly rows for this worksheet.',
  saveLoading,
  recalculateLoading,
  archiveLoading,
  confirmLoading,
  showArchive = true,
  confirmLabel = 'Confirm sales projection',
  extraControls,
  salesTrendSummary,
  onSaveRows,
  onRecalculate,
  onArchive,
  onConfirm,
}: SavedPurchasePlanWorkbookProps) {
  const [worksheetRows, setWorksheetRows] = useState<SavedPurchasePlanRow[]>([])
  const [activeWorksheetTab, setActiveWorksheetTab] = useState<WorksheetTabKey>('sales-projection')
  const [autoBuyRowIds, setAutoBuyRowIds] = useState<Set<string>>(new Set())
  const [projectionPct, setProjectionPct] = useState<number>(0)
  const [salesWorksheetReason, setSalesWorksheetReason] = useState('Worksheet edit')
  const [onHandWorksheetReason, setOnHandWorksheetReason] = useState('On hand projection edit')
  const [worksheetColumnMode, setWorksheetColumnMode] = useState<WorksheetColumnMode>('months')

  const sourceWorksheetRows = useMemo<SavedPurchasePlanRow[]>(() => (
    detail?.departments.flatMap((department) => department.months) ?? []
  ), [detail])
  const originalRowsById = useMemo(() => (
    new Map(sourceWorksheetRows.map((row) => [row.id, row]))
  ), [sourceWorksheetRows])
  const suggestedProjectionPct = salesTrendSummary?.suggestedProjectionPct ?? 0

  useEffect(() => {
    setActiveWorksheetTab('sales-projection')
  }, [detail?.plan.id])

  useEffect(() => {
    setWorksheetRows(sourceWorksheetRows.map((row) => ({ ...row })))
    setAutoBuyRowIds(new Set())
    setProjectionPct(suggestedProjectionPct)
    setSalesWorksheetReason('Worksheet edit')
    setOnHandWorksheetReason('On hand projection edit')
  }, [sourceWorksheetRows, suggestedProjectionPct])

  const showWorksheetDepartment = (detail?.departments.length ?? 0) > 1
  const worksheetPeriods = useMemo(() => {
    const months = detail?.plan.seasonMonths.length
      ? detail.plan.seasonMonths
      : worksheetRows.map((row) => row.yearMonth)
    return buildPurchasePlanWorksheetPeriods(months, worksheetColumnMode)
  }, [detail, worksheetColumnMode, worksheetRows])

  const worksheetRowByDepartmentMonth = useMemo(() => {
    const out = new Map<string, SavedPurchasePlanRow>()
    for (const row of worksheetRows) {
      out.set(`${row.departmentKey}|${row.yearMonth}`, row)
    }
    return out
  }, [worksheetRows])

  const buildWorksheetPivotRows = (metrics: WorksheetMetric[]): WorksheetPivotRow[] => {
    const departmentsByKey = new Map<string, string>()
    for (const row of worksheetRows) {
      if (!departmentsByKey.has(row.departmentKey)) departmentsByKey.set(row.departmentKey, row.departmentLabel)
    }
    return [...departmentsByKey.entries()].flatMap(([departmentKey, departmentLabel]) =>
      metrics.map((metric) => ({
        key: `${departmentKey}-${metric.key}`,
        departmentKey,
        departmentLabel,
        metric,
      })),
    )
  }
  const salesWorksheetPivotRows = useMemo<WorksheetPivotRow[]>(
    () => buildWorksheetPivotRows(SALES_PROJECTION_METRICS),
    [worksheetRows],
  )
  const onHandWorksheetPivotRows = useMemo<WorksheetPivotRow[]>(
    () => buildWorksheetPivotRows(ON_HAND_PROJECTION_METRICS),
    [worksheetRows],
  )

  const salesWorksheetChanges = useMemo(() => buildSalesWorksheetChanges(worksheetRows, originalRowsById), [originalRowsById, worksheetRows])
  const onHandWorksheetChanges = useMemo(() => buildOnHandWorksheetChanges(worksheetRows, originalRowsById), [originalRowsById, worksheetRows])
  const salesProjectionSummary = useMemo<SalesProjectionSummary>(() => {
    const projectionMonths = (detail?.plan.seasonMonths.length
      ? [...detail.plan.seasonMonths]
      : worksheetRows.map((row) => row.yearMonth)
    )
      .filter((month, index, months) => months.indexOf(month) === index)
      .sort()
      .slice(0, 12)
    const projectionMonthSet = new Set(projectionMonths)
    const projectedNext12MonthSales = worksheetRows.reduce((sum, row) => (
      projectionMonthSet.has(row.yearMonth) ? sum + row.currentProjSales : sum
    ), 0)
    const lastYearRows = worksheetRows.filter((row) => (
      projectionMonthSet.has(row.yearMonth)
      && row.lastYearSalesUnits != null
    ))
    const fallbackLastYear12MonthSales = lastYearRows.length > 0
      ? lastYearRows.reduce((sum, row) => sum + (row.lastYearSalesUnits ?? 0), 0)
      : null
    const lastYear12MonthSales = salesTrendSummary?.last12.currentUnits ?? fallbackLastYear12MonthSales
    const userProjectedIncreasePct = lastYear12MonthSales && lastYear12MonthSales > 0
      ? ((projectedNext12MonthSales - lastYear12MonthSales) / lastYear12MonthSales) * 100
      : null
    return {
      lastYear12MonthSales,
      projectedNext12MonthSales,
      suggestedProjectionIncreasePct: salesTrendSummary?.suggestedProjectionPct ?? null,
      userProjectedIncreasePct,
    }
  }, [detail, salesTrendSummary, worksheetRows])

  function recalculateWorksheetRows(rows: SavedPurchasePlanRow[], autoBuyIds: Set<string>): SavedPurchasePlanRow[] {
    const byDepartment = new Map<string, SavedPurchasePlanRow[]>()
    for (const row of rows) {
      const group = byDepartment.get(row.departmentKey) ?? []
      group.push(row)
      byDepartment.set(row.departmentKey, group)
    }

    const recalculatedById = new Map<string, SavedPurchasePlanRow>()
    for (const departmentRows of byDepartment.values()) {
      const sortedRows = [...departmentRows].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
      let runningBoh = sortedRows[0]?.currentBoh ?? 0
      sortedRows.forEach((row, index) => {
        const currentBoh = index === 0 ? row.currentBoh : runningBoh
        const currentBuy = autoBuyIds.has(row.id)
          ? Math.max(0, row.currentProjSales + row.currentEohTarget - currentBoh)
          : row.currentBuy
        const currentEohActual = currentBoh + currentBuy - row.currentProjSales
        const next = { ...row, currentBoh, currentBuy, currentEohActual }
        recalculatedById.set(row.id, next)
        runningBoh = currentEohActual
      })
    }
    return rows.map((row) => recalculatedById.get(row.id) ?? row)
  }

  function updateSalesProjectionCell(rowId: string, currentProjSales: number): void {
    setWorksheetRows((rows) => recalculateWorksheetRows(
      rows.map((row) => row.id === rowId ? { ...row, currentProjSales } : row),
      new Set(),
    ))
  }

  function updateOnHandProjectionCell(rowId: string, changes: Partial<Pick<SavedPurchasePlanRow, 'currentEohTarget' | 'currentBuy'>>): void {
    const nextAutoBuyIds = new Set(autoBuyRowIds)
    if (changes.currentBuy != null) nextAutoBuyIds.delete(rowId)
    if (changes.currentEohTarget != null) nextAutoBuyIds.add(rowId)
    setAutoBuyRowIds(nextAutoBuyIds)
    setWorksheetRows((rows) => recalculateWorksheetRows(
      rows.map((row) => row.id === rowId ? { ...row, ...changes } : row),
      nextAutoBuyIds,
    ))
  }

  function applyProjectionPercentValue(value: number): void {
    const pct = Number(value)
    if (!Number.isFinite(pct) || pct < -100) return
    const multiplier = 1 + pct / 100
    setWorksheetRows((rows) => recalculateWorksheetRows(
      rows.map((row) => ({
        ...row,
        currentProjSales: formUnit(row.currentProjSales * multiplier),
      })),
      new Set(),
    ))
  }

  function applyProjectionPercent(): void {
    applyProjectionPercentValue(projectionPct)
  }

  function applySuggestedProjectionPercent(): void {
    setProjectionPct(suggestedProjectionPct)
    setSalesWorksheetReason(`Suggested category trend ${formatSignedPercent(suggestedProjectionPct)}`)
    applyProjectionPercentValue(suggestedProjectionPct)
  }

  function resetSalesWorksheet(): void {
    setWorksheetRows((rows) => recalculateWorksheetRows(
      rows.map((row) => {
        const original = originalRowsById.get(row.id)
        return original ? { ...row, currentProjSales: original.currentProjSales } : row
      }),
      new Set(),
    ))
    setProjectionPct(suggestedProjectionPct)
    setSalesWorksheetReason('Worksheet edit')
  }

  function resetOnHandWorksheet(): void {
    setWorksheetRows((rows) => recalculateWorksheetRows(
      rows.map((row) => {
        const original = originalRowsById.get(row.id)
        return original
          ? { ...row, currentEohTarget: original.currentEohTarget, currentBuy: original.currentBuy }
          : row
      }),
      new Set(),
    ))
    setAutoBuyRowIds(new Set())
    setOnHandWorksheetReason('On hand projection edit')
  }

  function saveSalesWorksheet(): void {
    if (!detail?.plan.id || salesWorksheetChanges.length === 0) return
    onSaveRows(detail.plan.id, {
      rows: salesWorksheetChanges,
      reason: salesWorksheetReason.trim() || 'Worksheet edit',
      appliedBy: 'buyer',
    })
  }

  function saveOnHandWorksheet(): void {
    if (!detail?.plan.id || onHandWorksheetChanges.length === 0) return
    onSaveRows(detail.plan.id, {
      rows: onHandWorksheetChanges,
      reason: onHandWorksheetReason.trim() || 'On hand projection edit',
      appliedBy: 'buyer',
    })
  }

  function renderWorksheetPivotCell(row: WorksheetPivotRow, period: WorksheetPeriod): ReactNode {
    const periodRows = period.months
      .map((month) => worksheetRowByDepartmentMonth.get(`${row.departmentKey}|${month}`))
      .filter((value): value is SavedPurchasePlanRow => Boolean(value))
    const metric = row.metric
    const monthlyRow = period.mode === 'months' ? periodRows[0] : undefined

    if (monthlyRow && metric.editableKey) {
      const original = originalRowsById.get(monthlyRow.id)
      const currentValue = monthlyRow[metric.editableKey]
      return (
        <InputNumber
          aria-label={`${showWorksheetDepartment ? `${row.departmentLabel} ` : ''}${period.label} ${metric.inputLabel}`}
          className="purchase-plan-workbook-grid-input"
          min={0}
          precision={0}
          size="small"
          value={currentValue}
          status={original?.[metric.editableKey] === currentValue ? undefined : 'warning'}
          onChange={(value) => {
            const nextValue = formUnit(value)
            if (metric.editableKey === 'currentProjSales') {
              updateSalesProjectionCell(monthlyRow.id, nextValue)
            } else {
              updateOnHandProjectionCell(monthlyRow.id, { [metric.editableKey!]: nextValue })
            }
          }}
          style={{ width: 92 }}
        />
      )
    }

    const value = aggregateWorksheetMetric(periodRows, metric)
    if (metric.key === 'lastYearSellThroughPct' && value != null && value > 0.3) {
      return (
        <Space direction="vertical" size={2} className="purchase-plan-workbook-sell-through-warning">
          <Text type="warning">{formatWorksheetMetric(value, metric)}</Text>
          <Tag color="orange" style={{ marginInlineEnd: 0 }}>constrained</Tag>
        </Space>
      )
    }

    return (
      <Text strong={metric.key === 'currentBuy'}>
        {formatWorksheetMetric(value, metric)}
      </Text>
    )
  }

  const worksheetColumns = useMemo<ColumnsType<WorksheetPivotRow>>(() => [
    ...(showWorksheetDepartment ? [{
      title: 'Department',
      dataIndex: 'departmentLabel',
      fixed: 'left' as const,
      width: 220,
      render: (value: string) => <Text>{value}</Text>,
    }] : []),
    {
      title: 'Worksheet row',
      dataIndex: ['metric', 'label'],
      fixed: 'left' as const,
      width: 150,
      render: (_: unknown, row) => <Text>{row.metric.label}</Text>,
    },
    ...worksheetPeriods.map((period, index) => ({
      title: period.label,
      key: period.key,
      align: 'right' as const,
      width: period.mode === 'months' ? 118 : 132,
      className: index % 2 === 0 ? 'purchase-plan-workbook-grid-period-even' : 'purchase-plan-workbook-grid-period-odd',
      render: (_: unknown, row: WorksheetPivotRow) => renderWorksheetPivotCell(row, period),
    })),
  ], [originalRowsById, showWorksheetDepartment, worksheetPeriods, worksheetRowByDepartmentMonth])

  if (error) {
    return <Alert type="error" message={error instanceof Error ? error.message : String(error)} />
  }
  if (loading && !detail) {
    return <Card loading size="small" />
  }
  if (!detail) {
    return <Card size="small"><Empty description={emptyDescription} image={Empty.PRESENTED_IMAGE_SIMPLE} /></Card>
  }

  return (
    <Card
      size="small"
      title={detail.plan.label}
      extra={(
        <Space>
          <Tag>{detail.plan.planningScopeLabel ?? detail.plan.storeGroupLabel ?? detail.plan.storeGroupCode}</Tag>
          <Tag>{detail.plan.seasonMonths.length > 3 ? '15-month workbook' : `${detail.plan.season} ${detail.plan.seasonYear}`}</Tag>
          {onRecalculate ? (
            <Button htmlType="button" onClick={() => onRecalculate(detail.plan.id)} loading={recalculateLoading}>
              Recalculate
            </Button>
          ) : null}
          {onConfirm && activeWorksheetTab === 'sales-projection' ? (
            <Button type="primary" htmlType="button" onClick={() => onConfirm(detail.plan.id)} loading={confirmLoading}>
              {confirmLabel}
            </Button>
          ) : null}
          {showArchive && onArchive ? (
            <Button danger htmlType="button" onClick={() => onArchive(detail.plan.id)} loading={archiveLoading}>
              Archive
            </Button>
          ) : null}
        </Space>
      )}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Text type="secondary">Months: {detail.plan.seasonMonths.map(formatPurchasePlanMonth).join(', ')}</Text>
        <Text type="secondary">History: {detail.plan.historyFromYearMonth} to {detail.plan.historyToYearMonth}</Text>
        <Text type="secondary">Forecast: {detail.plan.forecastMethod}</Text>
        {detail.plan.discountNormalization ? <Tag color="blue">discount normalization</Tag> : null}
      </Space>
      <Tabs
        activeKey={activeWorksheetTab}
        destroyInactiveTabPane
        onChange={(key) => setActiveWorksheetTab(key as WorksheetTabKey)}
        items={[
          {
            key: 'sales-projection',
            label: 'Sales Projection',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {salesTrendSummary ? (
                  <div className="purchase-plan-trend-panel">
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Space wrap align="center">
                        <Text type="secondary">Category trend</Text>
                        <Tooltip title={renderCategoryTrendTooltip(salesTrendSummary)} placement="top">
                          <Button
                            aria-label="How category trend is calculated"
                            className="purchase-plan-trend-help"
                            htmlType="button"
                            icon={<QuestionCircleOutlined />}
                            size="small"
                            type="text"
                          />
                        </Tooltip>
                        <Tag color={trendDirectionColor(salesTrendSummary.direction)}>
                          {trendDirectionLabel(salesTrendSummary.direction)}
                        </Tag>
                        <Tag color={confidenceColor(salesTrendSummary.confidence)}>
                          {salesTrendSummary.confidence} confidence
                        </Tag>
                      </Space>
                      <Row gutter={[12, 8]}>
                        <Col xs={12} md={5}>
                          <Text type="secondary">Last 12M</Text>
                          <div>
                            <Text strong>{formatInt(salesTrendSummary.last12.currentUnits)} units</Text>
                            <Text type="secondary"> {formatSignedPercent(salesTrendSummary.last12.changePct)}</Text>
                          </div>
                          <Text type="secondary">vs {formatInt(salesTrendSummary.last12.comparisonUnits)} units</Text>
                        </Col>
                        <Col xs={12} md={5}>
                          <Text type="secondary">Recent 6M YoY</Text>
                          <div>
                            <Text strong>{formatInt(salesTrendSummary.recent6.currentUnits)} units</Text>
                            <Text type="secondary"> {formatSignedPercent(salesTrendSummary.recent6.changePct)}</Text>
                          </div>
                          <Text type="secondary">vs {formatInt(salesTrendSummary.recent6.comparisonUnits)} units</Text>
                        </Col>
                        <Col xs={12} md={5}>
                          <Text type="secondary">Recent 3M YoY</Text>
                          <div>
                            <Text strong>{formatInt(salesTrendSummary.recent3.currentUnits)} units</Text>
                            <Text type="secondary"> {formatSignedPercent(salesTrendSummary.recent3.changePct)}</Text>
                          </div>
                          <Text type="secondary">vs {formatInt(salesTrendSummary.recent3.comparisonUnits)} units</Text>
                        </Col>
                        <Col xs={12} md={4}>
                          <Text type="secondary">Slope</Text>
                          <div>
                            <Text strong>{formatSignedPercent(salesTrendSummary.monthlySlopePct)}</Text>
                          </div>
                        </Col>
                        <Col xs={24} md={5}>
                          <Text type="secondary">Suggested projection</Text>
                          <Space>
                            <Text strong>{formatSignedPercent(salesTrendSummary.suggestedProjectionPct)}</Text>
                            <Button size="small" htmlType="button" onClick={applySuggestedProjectionPercent} disabled={worksheetRows.length === 0}>
                              Apply suggested %
                            </Button>
                          </Space>
                        </Col>
                      </Row>
                      {salesTrendSummary.notes?.[0] ? (
                        <Text type="secondary">{salesTrendSummary.notes[0]}</Text>
                      ) : null}
                    </Space>
                  </div>
                ) : null}
                <Space wrap align="end">
                  <Space direction="vertical" size={2}>
                    <Text type="secondary">Columns</Text>
                    <Segmented<WorksheetColumnMode>
                      aria-label="Worksheet columns"
                      value={worksheetColumnMode}
                      onChange={setWorksheetColumnMode}
                      options={[
                        { label: 'Months', value: 'months' },
                        { label: 'Seasons', value: 'seasons' },
                      ]}
                    />
                  </Space>
                  <Space direction="vertical" size={2}>
                    <Text type="secondary">Projection %</Text>
                    <InputNumber
                      aria-label="Projection percent"
                      min={-100}
                      max={500}
                      precision={1}
                      value={projectionPct}
                      onChange={(value) => setProjectionPct(Number(value ?? 0))}
                      style={{ width: 110 }}
                    />
                  </Space>
                  <Button htmlType="button" onClick={applyProjectionPercent} disabled={worksheetRows.length === 0}>
                    Apply projection %
                  </Button>
                  <Space direction="vertical" size={2}>
                    <Text type="secondary">Reason</Text>
                    <Input
                      aria-label="Worksheet reason"
                      value={salesWorksheetReason}
                      onChange={(event) => setSalesWorksheetReason(event.target.value)}
                      style={{ width: 260 }}
                    />
                  </Space>
                  <Button
                    type="primary"
                    htmlType="button"
                    onClick={saveSalesWorksheet}
                    loading={saveLoading}
                    disabled={salesWorksheetChanges.length === 0}
                  >
                    Save worksheet
                  </Button>
                  <Button htmlType="button" onClick={resetSalesWorksheet} disabled={salesWorksheetChanges.length === 0}>
                    Reset worksheet
                  </Button>
                  {salesWorksheetChanges.length > 0 ? <Tag color="gold">{salesWorksheetChanges.length} changed</Tag> : null}
                </Space>
                <div>
                  <Title level={5} style={{ marginTop: 0 }}>Sales projection worksheet</Title>
                  <Table<WorksheetPivotRow>
                    aria-label="Sales projection worksheet"
                    className="purchase-plan-workbook-grid"
                    dataSource={salesWorksheetPivotRows}
                    columns={worksheetColumns}
                    rowKey="key"
                    size="small"
                    loading={loading}
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: emptyDescription }}
                  />
                </div>
                <div className="purchase-plan-sales-summary" aria-label="Sales projection summary">
                  <Title level={5} style={{ margin: 0 }}>Sales projection summary</Title>
                  <div className="purchase-plan-sales-summary-grid">
                    <div className="purchase-plan-sales-summary-item">
                      <Text type="secondary">Last year's 12 month sales</Text>
                      <Text strong>{formatSummaryUnits(salesProjectionSummary.lastYear12MonthSales)}</Text>
                    </div>
                    <div className="purchase-plan-sales-summary-item">
                      <Text type="secondary">Projected sales for next 12 months</Text>
                      <Text strong>{formatSummaryUnits(salesProjectionSummary.projectedNext12MonthSales)}</Text>
                    </div>
                    <div className="purchase-plan-sales-summary-item">
                      <Text type="secondary">Suggested sales projection increase for the year</Text>
                      <Text strong>{formatSignedPercent(salesProjectionSummary.suggestedProjectionIncreasePct)}</Text>
                    </div>
                    <div className="purchase-plan-sales-summary-item">
                      <Text type="secondary">Projected sales increase</Text>
                      <Text strong>{formatSignedPercent(salesProjectionSummary.userProjectedIncreasePct)}</Text>
                    </div>
                  </div>
                </div>
              </Space>
            ),
          },
          {
            key: 'on-hand-projection',
            label: 'On Hand Projection',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Space wrap align="end">
                  {extraControls}
                  <Space direction="vertical" size={2}>
                    <Text type="secondary">Columns</Text>
                    <Segmented<WorksheetColumnMode>
                      aria-label="Worksheet columns"
                      value={worksheetColumnMode}
                      onChange={setWorksheetColumnMode}
                      options={[
                        { label: 'Months', value: 'months' },
                        { label: 'Seasons', value: 'seasons' },
                      ]}
                    />
                  </Space>
                  <Space direction="vertical" size={2}>
                    <Text type="secondary">Reason</Text>
                    <Input
                      aria-label="On hand worksheet reason"
                      value={onHandWorksheetReason}
                      onChange={(event) => setOnHandWorksheetReason(event.target.value)}
                      style={{ width: 260 }}
                    />
                  </Space>
                  <Button
                    type="primary"
                    htmlType="button"
                    onClick={saveOnHandWorksheet}
                    loading={saveLoading}
                    disabled={onHandWorksheetChanges.length === 0}
                  >
                    Save on hand projection
                  </Button>
                  <Button htmlType="button" onClick={resetOnHandWorksheet} disabled={onHandWorksheetChanges.length === 0}>
                    Reset on hand projection
                  </Button>
                  {onHandWorksheetChanges.length > 0 ? <Tag color="gold">{onHandWorksheetChanges.length} changed</Tag> : null}
                </Space>
                <div>
                  <Title level={5} style={{ marginTop: 0 }}>On Hand Projection worksheet</Title>
                  <Table<WorksheetPivotRow>
                    aria-label="On hand projection worksheet"
                    className="purchase-plan-workbook-grid"
                    dataSource={onHandWorksheetPivotRows}
                    columns={worksheetColumns}
                    rowKey="key"
                    size="small"
                    loading={loading}
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: emptyDescription }}
                  />
                </div>
              </Space>
            ),
          },
        ]}
      />
    </Card>
  )
}
