import { shiftYearMonth } from './forecast';
import type { PurchasePlanSeason } from './types';

export const PURCHASE_PLAN_SEASONS: PurchasePlanSeason[] = ['spring', 'summer', 'fall', 'winter'];

const SEASON_START_MONTH: Record<PurchasePlanSeason, number> = {
  spring: 2,
  summer: 5,
  fall: 8,
  winter: 11,
};

export function buildSeasonMonths(season: PurchasePlanSeason, seasonYear: number): string[] {
  const startMonth = SEASON_START_MONTH[season];
  if (!startMonth || !Number.isInteger(seasonYear)) {
    throw new Error(`Invalid purchase-planning season: ${season} ${seasonYear}`);
  }
  const start = `${String(seasonYear).padStart(4, '0')}-${String(startMonth).padStart(2, '0')}`;
  return [0, 1, 2].map((offset) => shiftYearMonth(start, offset));
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
