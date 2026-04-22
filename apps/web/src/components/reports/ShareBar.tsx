import type { ReactNode } from 'react'

interface Props {
  // The numeric value the bar represents. Null/undefined collapses to text only.
  value: number | null | undefined
  // The maximum in the visible set (usually the top row's value). Used to size
  // the bar as value / max. If max is 0 or missing, the bar is suppressed.
  max: number | null | undefined
  // The formatted label rendered to the right of the bar (e.g. "1,234,567").
  // Pass the already-formatted string — this component never formats numbers.
  label: ReactNode
  // Tailor the bar color to the metric context. Default blue works for
  // sales/profit; operators override for qty vs profit visuals.
  color?: string
}

/**
 * Tiny inline "share of top" bar for a numeric table column. Renders a flat
 * horizontal bar whose width is value/max, with the pre-formatted label
 * right-aligned. Use inside an Ant Table column's `render` so the bar lives
 * inside the cell next to the number.
 */
export default function ShareBar({ value, max, label, color = '#1677ff' }: Props) {
  const hasBar = value != null && max != null && max > 0 && Number.isFinite(value) && value > 0
  const pct = hasBar ? Math.min(100, Math.max(0, ((value as number) / (max as number)) * 100)) : 0
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
      }}
    >
      {hasBar ? (
        <div
          style={{
            flex: '1 1 auto',
            minWidth: 30,
            maxWidth: 120,
            height: 6,
            background: 'rgba(0, 0, 0, 0.06)',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: color }} />
        </div>
      ) : null}
      <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}
