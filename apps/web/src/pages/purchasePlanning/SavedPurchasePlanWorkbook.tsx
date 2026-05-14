import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, Button, Card, Col, Empty, Input, InputNumber, Row, Segmented, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import {
  type SavedPurchasePlanDetail,
  type SavedPurchasePlanRow,
  type SavedPurchasePlanRowsUpdateRequest,
} from '../../services/purchasePlanningApi'

const { Title, Text } = Typography

const integerFmt = new Intl.NumberFormat('en-US')

type WorksheetColumnMode = 'months' | 'seasons'

type WorksheetMetricKey =
  | 'currentBoh'
  | 'currentProjSales'
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

const WORKSHEET_METRICS: WorksheetMetric[] = [
  { key: 'currentBoh', label: 'Projected BOH', aggregate: 'first', format: 'integer' },
  { key: 'currentProjSales', label: 'Projected sales', aggregate: 'sum', editableKey: 'currentProjSales', inputLabel: 'projected sales', format: 'integer' },
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

function formUnit(value: number | null | undefined): number {
  if (value == null || Number.isNaN(Number(value))) return 0
  return Math.max(0, Math.round(Number(value)))
}

function worksheetMetricValue(row: SavedPurchasePlanRow, metric: WorksheetMetric): number | null {
  const value = row[metric.key]
  return value == null ? null : Number(value)
}

function aggregateWorksheetMetric(rows: SavedPurchasePlanRow[], metric: WorksheetMetric): number | null {
  if (rows.length === 0) return null
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
  if (metric.format === 'percent') return `${Math.round(value * 1000) / 10}%`
  return formatInt(value)
}

function buildWorksheetChanges(
  rows: SavedPurchasePlanRow[],
  originals: Map<string, SavedPurchasePlanRow>,
): SavedPurchasePlanRowsUpdateRequest['rows'] {
  return rows.flatMap((row) => {
    const original = originals.get(row.id)
    if (!original) return []
    const change: SavedPurchasePlanRowsUpdateRequest['rows'][number] = { rowId: row.id }
    if (row.currentProjSales !== original.currentProjSales) change.currentProjSales = row.currentProjSales
    if (row.currentEohTarget !== original.currentEohTarget) change.currentEohTarget = row.currentEohTarget
    if (row.currentBuy !== original.currentBuy) change.currentBuy = row.currentBuy
    return change.currentProjSales == null && change.currentEohTarget == null && change.currentBuy == null ? [] : [change]
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
  onSaveRows,
  onRecalculate,
  onArchive,
  onConfirm,
}: SavedPurchasePlanWorkbookProps) {
  const [worksheetRows, setWorksheetRows] = useState<SavedPurchasePlanRow[]>([])
  const [autoBuyRowIds, setAutoBuyRowIds] = useState<Set<string>>(new Set())
  const [projectionPct, setProjectionPct] = useState<number>(0)
  const [worksheetReason, setWorksheetReason] = useState('Worksheet edit')
  const [worksheetColumnMode, setWorksheetColumnMode] = useState<WorksheetColumnMode>('months')

  const sourceWorksheetRows = useMemo<SavedPurchasePlanRow[]>(() => (
    detail?.departments.flatMap((department) => department.months) ?? []
  ), [detail])
  const originalRowsById = useMemo(() => (
    new Map(sourceWorksheetRows.map((row) => [row.id, row]))
  ), [sourceWorksheetRows])

  useEffect(() => {
    setWorksheetRows(sourceWorksheetRows.map((row) => ({ ...row })))
    setAutoBuyRowIds(new Set())
    setProjectionPct(0)
    setWorksheetReason('Worksheet edit')
  }, [sourceWorksheetRows])

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

  const worksheetPivotRows = useMemo<WorksheetPivotRow[]>(() => {
    const departmentsByKey = new Map<string, string>()
    for (const row of worksheetRows) {
      if (!departmentsByKey.has(row.departmentKey)) departmentsByKey.set(row.departmentKey, row.departmentLabel)
    }
    return [...departmentsByKey.entries()].flatMap(([departmentKey, departmentLabel]) =>
      WORKSHEET_METRICS.map((metric) => ({
        key: `${departmentKey}-${metric.key}`,
        departmentKey,
        departmentLabel,
        metric,
      })),
    )
  }, [worksheetRows])

  const worksheetChanges = useMemo(() => buildWorksheetChanges(worksheetRows, originalRowsById), [originalRowsById, worksheetRows])
  const worksheetTotals = useMemo(() => {
    const totals = worksheetRows.reduce((acc, row) => ({
      baselineTotalBuy: acc.baselineTotalBuy + row.baselineBuy,
      currentTotalBuy: acc.currentTotalBuy + row.currentBuy,
    }), {
      baselineTotalBuy: 0,
      currentTotalBuy: 0,
    })
    return {
      ...totals,
      deltaBuy: totals.currentTotalBuy - totals.baselineTotalBuy,
    }
  }, [worksheetRows])

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

  function updateWorksheetCell(rowId: string, changes: Partial<Pick<SavedPurchasePlanRow, 'currentProjSales' | 'currentEohTarget' | 'currentBuy'>>): void {
    const nextAutoBuyIds = new Set(autoBuyRowIds)
    if (changes.currentBuy != null) nextAutoBuyIds.delete(rowId)
    if (changes.currentProjSales != null || changes.currentEohTarget != null) nextAutoBuyIds.add(rowId)
    setAutoBuyRowIds(nextAutoBuyIds)
    setWorksheetRows((rows) => recalculateWorksheetRows(
      rows.map((row) => row.id === rowId ? { ...row, ...changes } : row),
      nextAutoBuyIds,
    ))
  }

  function applyProjectionPercent(): void {
    const pct = Number(projectionPct)
    if (!Number.isFinite(pct) || pct < -100) return
    const multiplier = 1 + pct / 100
    const nextAutoBuyIds = new Set(autoBuyRowIds)
    worksheetRows.forEach((row) => nextAutoBuyIds.add(row.id))
    setAutoBuyRowIds(nextAutoBuyIds)
    setWorksheetRows((rows) => recalculateWorksheetRows(
      rows.map((row) => ({
        ...row,
        currentProjSales: formUnit(row.currentProjSales * multiplier),
        currentEohTarget: formUnit(row.currentEohTarget * multiplier),
      })),
      nextAutoBuyIds,
    ))
  }

  function resetWorksheet(): void {
    setWorksheetRows(sourceWorksheetRows.map((row) => ({ ...row })))
    setAutoBuyRowIds(new Set())
    setProjectionPct(0)
    setWorksheetReason('Worksheet edit')
  }

  function saveWorksheet(): void {
    if (!detail?.plan.id || worksheetChanges.length === 0) return
    onSaveRows(detail.plan.id, {
      rows: worksheetChanges,
      reason: worksheetReason.trim() || 'Worksheet edit',
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
          min={0}
          precision={0}
          size="small"
          value={currentValue}
          status={original?.[metric.editableKey] === currentValue ? undefined : 'warning'}
          onChange={(value) => updateWorksheetCell(monthlyRow.id, { [metric.editableKey!]: formUnit(value) })}
          style={{ width: 92 }}
        />
      )
    }

    return (
      <Text strong={metric.key === 'currentBuy'}>
        {formatWorksheetMetric(aggregateWorksheetMetric(periodRows, metric), metric)}
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
    ...worksheetPeriods.map((period) => ({
      title: period.label,
      key: period.key,
      align: 'right' as const,
      width: period.mode === 'months' ? 118 : 132,
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
          {onConfirm ? (
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
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Text type="secondary">Baseline buy</Text>
          <Title level={4} style={{ margin: 0 }}>{formatInt(worksheetTotals.baselineTotalBuy)}</Title>
        </Col>
        <Col xs={24} sm={8}>
          <Text type="secondary">Current buy</Text>
          <Title level={4} style={{ margin: 0 }}>{formatInt(worksheetTotals.currentTotalBuy)}</Title>
        </Col>
        <Col xs={24} sm={8}>
          <Text type="secondary">Adjusted delta</Text>
          <Title level={4} style={{ margin: 0 }}>{worksheetTotals.deltaBuy > 0 ? '+' : ''}{formatInt(worksheetTotals.deltaBuy)}</Title>
        </Col>
      </Row>
      <Space wrap align="end" style={{ marginBottom: 12 }}>
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
            value={worksheetReason}
            onChange={(event) => setWorksheetReason(event.target.value)}
            style={{ width: 260 }}
          />
        </Space>
        <Button
          type="primary"
          htmlType="button"
          onClick={saveWorksheet}
          loading={saveLoading}
          disabled={worksheetChanges.length === 0}
        >
          Save worksheet
        </Button>
        <Button htmlType="button" onClick={resetWorksheet} disabled={worksheetChanges.length === 0}>
          Reset worksheet
        </Button>
        {worksheetChanges.length > 0 ? <Tag color="gold">{worksheetChanges.length} changed</Tag> : null}
      </Space>
      <Table<WorksheetPivotRow>
        aria-label="Worksheet grid"
        dataSource={worksheetPivotRows}
        columns={worksheetColumns}
        rowKey="key"
        size="small"
        loading={loading}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: emptyDescription }}
      />
    </Card>
  )
}
