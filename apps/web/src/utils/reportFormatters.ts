// Number formatting for every report cell in the app. Single source of truth
// for the CLAUDE.md "Currency" policy: no currency symbol ($ / L / USD) and no
// Intl currency style — plain numbers with grouped thousands separators.
// "Amounts in Lempira (HNL)" is disclosed once per page by ReportHeader.

export const DASH = '—'

const money2 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const money0 = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

const integer = new Intl.NumberFormat('en-US')

const pct1 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const pct2 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function nullish(v: number | null | undefined): boolean {
  return v == null || Number.isNaN(v)
}

export function fmtMoney(v: number | null | undefined): string {
  return nullish(v) ? DASH : money2.format(v as number)
}

export function fmtMoneyOrDash(v: number | null | undefined): string {
  return fmtMoney(v)
}

export function fmtMoneyInt(v: number | null | undefined): string {
  return nullish(v) ? DASH : money0.format(v as number)
}

export function fmtInt(v: number | null | undefined): string {
  return nullish(v) ? DASH : integer.format(Math.round(v as number))
}

export function fmtQty(v: number | null | undefined): string {
  if (nullish(v)) return DASH
  const n = v as number
  return Number.isInteger(n) ? integer.format(n) : money2.format(n)
}

export function fmtPct1(v: number | null | undefined): string {
  return nullish(v) ? DASH : `${pct1.format(v as number)}%`
}

export function fmtPct2(v: number | null | undefined): string {
  return nullish(v) ? DASH : `${pct2.format(v as number)}%`
}

export function fmtPctBare1(v: number | null | undefined): string {
  return nullish(v) ? DASH : pct1.format(v as number)
}

export function fmtChangePct(v: number | null | undefined): string {
  if (nullish(v)) return DASH
  const n = v as number
  if (n === 0) return `${pct1.format(0)}%`
  const sign = n > 0 ? '+' : '−'
  return `${sign}${pct1.format(Math.abs(n))}%`
}

export function fmtChangeMoney(v: number | null | undefined): string {
  if (nullish(v)) return DASH
  const n = v as number
  if (n === 0) return money2.format(0)
  const sign = n > 0 ? '+' : '−'
  return `${sign}${money2.format(Math.abs(n))}`
}
