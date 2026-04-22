import { Tag, Tooltip } from 'antd'
import { fmtPct1, fmtChangePct, DASH } from '../../utils/reportFormatters'

// Single home for the color breakpoints. Tune once, every report updates.
// Numbers are percent values (30 means 30%), NOT fractions.
export const GP_PCT_GOOD = 30
export const GP_PCT_OKAY = 10

export type AntTagColor = 'green' | 'gold' | 'red' | 'default'

export function gpColor(pct: number | null | undefined): AntTagColor {
  if (pct == null || Number.isNaN(pct)) return 'default'
  if (pct >= GP_PCT_GOOD) return 'green'
  if (pct >= GP_PCT_OKAY) return 'gold'
  return 'red'
}

/**
 * Render a gross-profit percentage (or any signed-but-thresholded percent)
 * as a colored Ant Tag. Null/undefined renders as a plain em-dash without
 * a tag so the column doesn't look noisy when data is missing.
 */
export function GpBadge({ value }: { value: number | null | undefined }) {
  if (value == null || Number.isNaN(value)) return <span>{DASH}</span>
  return <Tag color={gpColor(value)}>{fmtPct1(value)}</Tag>
}

export function changePctColor(pct: number | null | undefined): AntTagColor {
  if (pct == null || Number.isNaN(pct)) return 'default'
  if (pct > 0) return 'green'
  if (pct < 0) return 'red'
  return 'default'
}

/**
 * Signed change percent (e.g. "year-over-year delta") as a colored Tag.
 * Positive is green, negative is red, zero is neutral. Null/undefined
 * renders as a plain em-dash.
 */
export function ChangePctBadge({ value }: { value: number | null | undefined }) {
  if (value == null || Number.isNaN(value)) return <span>{DASH}</span>
  return <Tag color={changePctColor(value)}>{fmtChangePct(value)}</Tag>
}

/**
 * Tiny inline legend explaining the GP% thresholds. Drop beneath a table
 * where a page renders GP badges so operators aren't guessing what the
 * colors mean. Render once per page at most.
 */
export function GpBadgeLegend() {
  return (
    <Tooltip
      title={
        <>
          GP%: ≥ {GP_PCT_GOOD}% green · ≥ {GP_PCT_OKAY}% gold · below red
        </>
      }
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: 'rgba(0, 0, 0, 0.45)',
          fontSize: 12,
        }}
      >
        <Tag color="green" style={{ margin: 0 }}>
          ≥ {GP_PCT_GOOD}%
        </Tag>
        <Tag color="gold" style={{ margin: 0 }}>
          ≥ {GP_PCT_OKAY}%
        </Tag>
        <Tag color="red" style={{ margin: 0 }}>
          &lt; {GP_PCT_OKAY}%
        </Tag>
      </span>
    </Tooltip>
  )
}
