import dayjs from 'dayjs'
import { DASH, fmtMoney, fmtMoneyInt } from '../../utils/reportFormatters'

export function fmtPercentRatio(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return DASH
  return `${(v * 100).toFixed(digits)}%`
}

export function fmtRecency(days: number | null | undefined): string {
  if (days == null) return DASH
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days`
  if (days < 365) return `${Math.round(days / 30)} mo`
  return `${(days / 365).toFixed(1)} y`
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return DASH
  return dayjs(value).format('YYYY-MM-DD')
}

export { fmtMoney, fmtMoneyInt }
