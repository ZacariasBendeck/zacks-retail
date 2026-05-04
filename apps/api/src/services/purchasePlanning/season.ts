import { shiftYearMonth } from './forecast';
import type { PurchasePlanSeason } from './types';

export const PURCHASE_PLAN_SEASONS: PurchasePlanSeason[] = ['spring', 'summer', 'fall', 'winter'];

const SEASON_START_MONTH: Record<PurchasePlanSeason, number> = {
  spring: 2,
  summer: 5,
  fall: 8,
  winter: 11,
};

export interface PurchasePlanSeasonWindowItem {
  season: PurchasePlanSeason;
  seasonYear: number;
  seasonLabel: string;
  months: string[];
}

export function buildSeasonMonths(season: PurchasePlanSeason, seasonYear: number): string[] {
  const startMonth = SEASON_START_MONTH[season];
  if (!startMonth || !Number.isInteger(seasonYear)) {
    throw new Error(`Invalid purchase-planning season: ${season} ${seasonYear}`);
  }
  const start = `${String(seasonYear).padStart(4, '0')}-${String(startMonth).padStart(2, '0')}`;
  return [0, 1, 2].map((offset) => shiftYearMonth(start, offset));
}

export function resolveYearMonth(raw?: string, now = new Date()): string {
  if (raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function currentSeasonForYearMonth(yearMonth: string): { season: PurchasePlanSeason; seasonYear: number } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    throw new Error(`Invalid purchase-planning year-month: ${yearMonth}`);
  }
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  if (month === 1) return { season: 'winter', seasonYear: year - 1 };
  if (month >= 2 && month <= 4) return { season: 'spring', seasonYear: year };
  if (month >= 5 && month <= 7) return { season: 'summer', seasonYear: year };
  if (month >= 8 && month <= 10) return { season: 'fall', seasonYear: year };
  return { season: 'winter', seasonYear: year };
}

export function nextSeason(season: PurchasePlanSeason, seasonYear: number): { season: PurchasePlanSeason; seasonYear: number } {
  const index = PURCHASE_PLAN_SEASONS.indexOf(season);
  if (index < 0) throw new Error(`Unexpected season: ${String(season)}`);
  const nextIndex = (index + 1) % PURCHASE_PLAN_SEASONS.length;
  return {
    season: PURCHASE_PLAN_SEASONS[nextIndex]!,
    seasonYear: nextIndex === 0 ? seasonYear + 1 : seasonYear,
  };
}

export function buildSeasonWindow(
  startSeason: PurchasePlanSeason,
  startSeasonYear: number,
  count = 5,
): PurchasePlanSeasonWindowItem[] {
  const out: PurchasePlanSeasonWindowItem[] = [];
  let cursorSeason = startSeason;
  let cursorYear = startSeasonYear;
  for (let i = 0; i < count; i++) {
    out.push({
      season: cursorSeason,
      seasonYear: cursorYear,
      seasonLabel: `${seasonLabel(cursorSeason)} ${cursorYear}`,
      months: buildSeasonMonths(cursorSeason, cursorYear),
    });
    const next = nextSeason(cursorSeason, cursorYear);
    cursorSeason = next.season;
    cursorYear = next.seasonYear;
  }
  return out;
}

export function buildSeasonWindowFromYearMonth(yearMonth?: string, count = 5): PurchasePlanSeasonWindowItem[] {
  const current = currentSeasonForYearMonth(resolveYearMonth(yearMonth));
  return buildSeasonWindow(current.season, current.seasonYear, count);
}

export function seasonLabel(season: PurchasePlanSeason): string {
  switch (season) {
    case 'spring':
      return 'Spring';
    case 'summer':
      return 'Summer';
    case 'fall':
      return 'Fall';
    case 'winter':
      return 'Winter';
    default:
      return assertNever(season);
  }
}

export function defaultPlanLabel(
  chainLabel: string | null | undefined,
  season: PurchasePlanSeason,
  seasonYear: number,
): string {
  return `${chainLabel?.trim() || 'Chain'} ${seasonLabel(season)} ${seasonYear}`;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected season: ${String(value)}`);
}
