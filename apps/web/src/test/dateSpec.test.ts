import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import {
  describeDateSpec,
  presetFromSpec,
  readDateSpecFromParams,
  resolveDateSpec,
  specFromPreset,
  type DateSpec,
} from '../utils/dateSpec'

// All tests pin "today" to 2026-04-22 so the trailing/this_* math is
// deterministic — otherwise CI runs would drift daily.
const today = dayjs('2026-04-22')

describe('resolveDateSpec', () => {
  it('returns literal dates for fixed', () => {
    expect(resolveDateSpec({ type: 'fixed', startDate: '2026-01-05', endDate: '2026-01-31' }, today))
      .toEqual({ startDate: '2026-01-05', endDate: '2026-01-31' })
  })

  it('this_month starts at first of the current month', () => {
    expect(resolveDateSpec({ type: 'this_month' }, today))
      .toEqual({ startDate: '2026-04-01', endDate: '2026-04-22' })
  })

  it('this_year starts Jan 1 of the current year', () => {
    expect(resolveDateSpec({ type: 'this_year' }, today))
      .toEqual({ startDate: '2026-01-01', endDate: '2026-04-22' })
  })

  it('trailing_days 7 ending today yields an inclusive 7-day window', () => {
    // 2026-04-16 → 2026-04-22 inclusive = 7 days (matches the pre-DateSpec
    // default of dayjs().subtract(6, 'day') → today).
    expect(resolveDateSpec({ type: 'trailing_days', days: 7 }, today))
      .toEqual({ startDate: '2026-04-16', endDate: '2026-04-22' })
  })

  it('trailing_days 30 ending today yields a 30-day window', () => {
    expect(resolveDateSpec({ type: 'trailing_days', days: 30 }, today))
      .toEqual({ startDate: '2026-03-24', endDate: '2026-04-22' })
  })

  it('trailing_months 12 ending today spans ~a year', () => {
    // "Trailing 12 months" ending 2026-04-22 resolves to 2025-04-23 → 2026-04-22.
    expect(resolveDateSpec({ type: 'trailing_months', months: 12 }, today))
      .toEqual({ startDate: '2025-04-23', endDate: '2026-04-22' })
  })

  it('trailing_months 3 ending today spans a quarter', () => {
    expect(resolveDateSpec({ type: 'trailing_months', months: 3 }, today))
      .toEqual({ startDate: '2026-01-23', endDate: '2026-04-22' })
  })

  it('clamps trailing_days to at least 1', () => {
    expect(resolveDateSpec({ type: 'trailing_days', days: 0 }, today))
      .toEqual({ startDate: '2026-04-22', endDate: '2026-04-22' })
  })
})

describe('describeDateSpec', () => {
  it('fixed shows the literal range only (no prefix)', () => {
    expect(describeDateSpec({ type: 'fixed', startDate: '2026-01-05', endDate: '2026-01-31' }, today))
      .toBe('2026-01-05 → 2026-01-31')
  })

  it('relative specs include the name and the resolved window in parens', () => {
    expect(describeDateSpec({ type: 'this_month' }, today))
      .toBe('This month (2026-04-01 → 2026-04-22)')
    expect(describeDateSpec({ type: 'this_year' }, today))
      .toBe('Year to date (2026-01-01 → 2026-04-22)')
    expect(describeDateSpec({ type: 'trailing_days', days: 7 }, today))
      .toBe('Trailing 7 days (2026-04-16 → 2026-04-22)')
    expect(describeDateSpec({ type: 'trailing_months', months: 12 }, today))
      .toBe('Trailing 12 months (2025-04-23 → 2026-04-22)')
  })
})

describe('presetFromSpec / specFromPreset round-trip', () => {
  const cases: Array<[ReturnType<typeof presetFromSpec>, DateSpec]> = [
    ['fixed', { type: 'fixed', startDate: '2026-01-01', endDate: '2026-01-31' }],
    ['this_month', { type: 'this_month' }],
    ['this_year', { type: 'this_year' }],
    ['trailing_7_days', { type: 'trailing_days', days: 7 }],
    ['trailing_30_days', { type: 'trailing_days', days: 30 }],
    ['trailing_90_days', { type: 'trailing_days', days: 90 }],
    ['trailing_3_months', { type: 'trailing_months', months: 3 }],
    ['trailing_6_months', { type: 'trailing_months', months: 6 }],
    ['trailing_12_months', { type: 'trailing_months', months: 12 }],
  ]

  for (const [preset, spec] of cases) {
    it(`presetFromSpec(${spec.type}) → ${preset}`, () => {
      expect(presetFromSpec(spec)).toBe(preset)
    })
  }

  it('non-standard trailing_days falls back to fixed in the dropdown', () => {
    // 14 isn't one of the canned values — surfaces as 'fixed' so the
    // RangePicker appears with today's resolved window as the seed.
    expect(presetFromSpec({ type: 'trailing_days', days: 14 })).toBe('fixed')
  })

  it('specFromPreset with fallback produces a sensible fixed spec', () => {
    const fallback = { startDate: '2026-04-01', endDate: '2026-04-22' }
    expect(specFromPreset('fixed', fallback))
      .toEqual({ type: 'fixed', startDate: '2026-04-01', endDate: '2026-04-22' })
  })
})

describe('readDateSpecFromParams (legacy-compat)', () => {
  it('returns null when params has neither dateSpec nor legacy dates', () => {
    expect(readDateSpecFromParams({})).toBeNull()
    expect(readDateSpecFromParams(null)).toBeNull()
    expect(readDateSpecFromParams('not-an-object')).toBeNull()
  })

  it('returns the dateSpec when present', () => {
    expect(readDateSpecFromParams({ dateSpec: { type: 'trailing_months', months: 12 } }))
      .toEqual({ type: 'trailing_months', months: 12 })
  })

  it('wraps legacy startDate/endDate as a fixed spec', () => {
    // This is the backward-compat path for templates saved before the
    // DateSpec migration. Without this, an old template would fail to
    // hydrate its date window.
    expect(readDateSpecFromParams({ startDate: '2026-01-01', endDate: '2026-03-31' }))
      .toEqual({ type: 'fixed', startDate: '2026-01-01', endDate: '2026-03-31' })
  })

  it('prefers new dateSpec over legacy strings when both are present', () => {
    expect(readDateSpecFromParams({
      dateSpec: { type: 'this_year' },
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    })).toEqual({ type: 'this_year' })
  })

  it('rejects an unknown dateSpec.type', () => {
    expect(readDateSpecFromParams({ dateSpec: { type: 'bogus' } })).toBeNull()
  })
})
