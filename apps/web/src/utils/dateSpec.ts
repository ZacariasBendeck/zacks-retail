import dayjs, { type Dayjs } from 'dayjs'

// A DateSpec describes a start/end date window *symbolically*. Relative specs
// (this_month, this_year, trailing_*) resolve against "today" at run time, so
// a saved template with dateSpec={ type: 'trailing_months', months: 12 } shows
// a fresh 12-month window every time it's replayed.
//
// Pre-DateSpec templates stored startDate + endDate strings directly. Callers
// that hydrate from an older paramsJson shape should detect that and wrap the
// legacy pair as { type: 'fixed', startDate, endDate }.
export type DateSpec =
  | { type: 'fixed'; startDate: string; endDate: string }
  | { type: 'this_month' }
  | { type: 'this_year' } // a.k.a. YTD
  | { type: 'trailing_days'; days: number }
  | { type: 'trailing_months'; months: number }

export interface ResolvedDateRange {
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD, inclusive
}

function fmt(d: Dayjs): string {
  return d.format('YYYY-MM-DD')
}

/**
 * Resolve a DateSpec to concrete ISO dates. `today` is injectable so callers
 * can render deterministic previews at any point in time (the date-range
 * control uses the current wall clock; tests pass a fixed dayjs).
 *
 * Convention: end is always "today" (or the fixed end date). Start is
 * inclusive; "trailing N days" ending 2026-04-22 resolves to 2026-04-16
 * through 2026-04-22 (a 7-day inclusive window, matching what the pages
 * previously used for their defaultRange helpers).
 */
export function resolveDateSpec(
  spec: DateSpec,
  today: Dayjs = dayjs(),
): ResolvedDateRange {
  switch (spec.type) {
    case 'fixed':
      return { startDate: spec.startDate, endDate: spec.endDate }
    case 'this_month':
      return { startDate: fmt(today.startOf('month')), endDate: fmt(today) }
    case 'this_year':
      return { startDate: fmt(today.startOf('year')), endDate: fmt(today) }
    case 'trailing_days': {
      // "Trailing 7 days" ending today = today minus 6 days, inclusive.
      const start = today.subtract(Math.max(1, spec.days) - 1, 'day')
      return { startDate: fmt(start), endDate: fmt(today) }
    }
    case 'trailing_months': {
      // "Trailing 12 months" ending today = same-day-of-month N months back,
      // plus one day, through today. For 12 months on 2026-04-22 that's
      // 2025-04-23 → 2026-04-22 (366 inclusive days).
      const start = today.subtract(Math.max(1, spec.months), 'month').add(1, 'day')
      return { startDate: fmt(start), endDate: fmt(today) }
    }
  }
}

/**
 * Short human label for a spec — used in filter chips, the Save-as-template
 * preview line, and the templates-list summary column. Fixed ranges show the
 * literal dates; relative specs show their name plus the resolved window in
 * parens so operators can see what a template will run against right now.
 */
export function describeDateSpec(spec: DateSpec, today: Dayjs = dayjs()): string {
  const { startDate, endDate } = resolveDateSpec(spec, today)
  const window = `${startDate} → ${endDate}`
  switch (spec.type) {
    case 'fixed':
      return window
    case 'this_month':
      return `This month (${window})`
    case 'this_year':
      return `Year to date (${window})`
    case 'trailing_days':
      return `Trailing ${spec.days} days (${window})`
    case 'trailing_months':
      return `Trailing ${spec.months} months (${window})`
  }
}

/**
 * Stable discriminator for use in a Select. A DateSpec maps to one of these
 * keys plus, for the parameterized specs, a numeric count. Callers use this
 * to drive a preset dropdown without forcing a full spec round-trip through
 * the Select's `value` prop.
 */
export type DateSpecPreset =
  | 'fixed'
  | 'this_month'
  | 'this_year'
  | 'trailing_7_days'
  | 'trailing_30_days'
  | 'trailing_90_days'
  | 'trailing_3_months'
  | 'trailing_6_months'
  | 'trailing_12_months'

export const DATE_SPEC_PRESETS: { value: DateSpecPreset; label: string }[] = [
  { value: 'fixed', label: 'Fixed range' },
  { value: 'this_month', label: 'This month' },
  { value: 'this_year', label: 'Year to date' },
  { value: 'trailing_7_days', label: 'Trailing 7 days' },
  { value: 'trailing_30_days', label: 'Trailing 30 days' },
  { value: 'trailing_90_days', label: 'Trailing 90 days' },
  { value: 'trailing_3_months', label: 'Trailing 3 months' },
  { value: 'trailing_6_months', label: 'Trailing 6 months' },
  { value: 'trailing_12_months', label: 'Trailing 12 months' },
]

export function presetFromSpec(spec: DateSpec): DateSpecPreset {
  switch (spec.type) {
    case 'fixed':
      return 'fixed'
    case 'this_month':
      return 'this_month'
    case 'this_year':
      return 'this_year'
    case 'trailing_days':
      if (spec.days === 7) return 'trailing_7_days'
      if (spec.days === 30) return 'trailing_30_days'
      if (spec.days === 90) return 'trailing_90_days'
      return 'fixed'
    case 'trailing_months':
      if (spec.months === 3) return 'trailing_3_months'
      if (spec.months === 6) return 'trailing_6_months'
      if (spec.months === 12) return 'trailing_12_months'
      return 'fixed'
  }
}

/**
 * Build a spec from a preset key. For `fixed`, the caller must supply the
 * current start/end they want to preserve (typically the resolved window
 * from the previous spec, so switching preset → fixed leaves the visible
 * dates unchanged).
 */
export function specFromPreset(
  preset: DateSpecPreset,
  fixedFallback: ResolvedDateRange,
): DateSpec {
  switch (preset) {
    case 'fixed':
      return { type: 'fixed', ...fixedFallback }
    case 'this_month':
      return { type: 'this_month' }
    case 'this_year':
      return { type: 'this_year' }
    case 'trailing_7_days':
      return { type: 'trailing_days', days: 7 }
    case 'trailing_30_days':
      return { type: 'trailing_days', days: 30 }
    case 'trailing_90_days':
      return { type: 'trailing_days', days: 90 }
    case 'trailing_3_months':
      return { type: 'trailing_months', months: 3 }
    case 'trailing_6_months':
      return { type: 'trailing_months', months: 6 }
    case 'trailing_12_months':
      return { type: 'trailing_months', months: 12 }
  }
}

/**
 * Best-effort read of a DateSpec from an arbitrary paramsJson blob. Returns
 * null when no recognizable shape is present, so callers can fall back to
 * their page's default. Accepts (a) a new-style { dateSpec: DateSpec } shape,
 * (b) legacy { startDate, endDate } strings from pre-DateSpec templates.
 */
export function readDateSpecFromParams(params: unknown): DateSpec | null {
  if (!params || typeof params !== 'object') return null
  const p = params as Record<string, unknown>
  const ds = p.dateSpec as DateSpec | undefined
  if (ds && typeof ds === 'object' && typeof ds.type === 'string') {
    // Basic shape check — untrusted input, but the report pages tolerate
    // unknown types via their default-fallbacks anyway.
    const ok = ['fixed', 'this_month', 'this_year', 'trailing_days', 'trailing_months']
    if (ok.includes(ds.type)) return ds
  }
  if (typeof p.startDate === 'string' && typeof p.endDate === 'string') {
    return { type: 'fixed', startDate: p.startDate, endDate: p.endDate }
  }
  return null
}
