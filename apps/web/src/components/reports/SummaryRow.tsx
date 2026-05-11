import { Table, Typography } from 'antd'
import type { CSSProperties, ReactNode } from 'react'

const { Text } = Typography

// Subtotal row: low-contrast background, no top border. Used for
// intra-group rollups (e.g. per-department subtotal inside a multi-
// department report).
const SUBTOTAL_BG = 'rgba(0, 0, 0, 0.025)'

// Grand-total row: stronger background + top border so the eye stops on
// it. Used for the single outer row at the bottom of a Table.summary.
const GRAND_BG = 'rgba(22, 119, 255, 0.06)'
const GRAND_BORDER_TOP = '1px solid rgba(22, 119, 255, 0.3)'

export function subtotalCellStyle(): CSSProperties {
  return { background: SUBTOTAL_BG, fontWeight: 500 }
}

export function grandTotalCellStyle(): CSSProperties {
  return {
    background: GRAND_BG,
    borderTop: GRAND_BORDER_TOP,
    fontWeight: 600,
  }
}

interface RowProps {
  children: ReactNode
}

/**
 * Wrap `Table.Summary.Cell` children so the row reads as a subtotal line.
 * Callers are responsible for laying out the cells themselves — we only
 * provide the shell + styling conventions, because cell layout (colSpan,
 * align, which cells to emphasize) is always report-specific.
 */
export function SubtotalRow({ children }: RowProps) {
  return <Table.Summary.Row>{children}</Table.Summary.Row>
}

export function GrandTotalRow({ children }: RowProps) {
  return <Table.Summary.Row>{children}</Table.Summary.Row>
}

interface LabelCellProps {
  index: number
  colSpan?: number
  children: ReactNode
  className?: string
  variant?: 'subtotal' | 'grand'
}

/**
 * Convenience cell for the left-most "Label:" slot of a summary row so the
 * most common shape ("Total" / "Subtotal — Dept 10" spanning several
 * columns) is a one-liner at the call site.
 */
export function SummaryLabelCell({
  index,
  colSpan,
  children,
  className,
  variant = 'subtotal',
}: LabelCellProps) {
  const style = variant === 'grand' ? grandTotalCellStyle() : subtotalCellStyle()
  return (
    <Table.Summary.Cell index={index} colSpan={colSpan} className={className}>
      <div style={style}>
        <Text strong={variant === 'grand'}>{children}</Text>
      </div>
    </Table.Summary.Cell>
  )
}

interface NumericCellProps {
  index: number
  children: ReactNode
  className?: string
  variant?: 'subtotal' | 'grand'
}

export function SummaryNumericCell({
  index,
  children,
  className,
  variant = 'subtotal',
}: NumericCellProps) {
  const style = variant === 'grand' ? grandTotalCellStyle() : subtotalCellStyle()
  return (
    <Table.Summary.Cell index={index} align="right" className={className}>
      <div style={{ ...style, textAlign: 'right' }}>
        <Text strong={variant === 'grand'}>{children}</Text>
      </div>
    </Table.Summary.Cell>
  )
}
