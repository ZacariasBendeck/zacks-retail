import {
  buildSeasonMonths,
  buildSeasonWindowFromYearMonth,
  currentSeasonForYearMonth,
} from '../../src/services/purchasePlanning/season';

describe('purchase planning seasons', () => {
  it('maps the four merchandise seasons to three-month windows', () => {
    expect(buildSeasonMonths('spring', 2026)).toEqual(['2026-02', '2026-03', '2026-04']);
    expect(buildSeasonMonths('summer', 2026)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(buildSeasonMonths('fall', 2026)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(buildSeasonMonths('winter', 2026)).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('derives the current strict-calendar season from a year-month', () => {
    expect(currentSeasonForYearMonth('2026-05')).toEqual({ season: 'summer', seasonYear: 2026 });
    expect(currentSeasonForYearMonth('2027-01')).toEqual({ season: 'winter', seasonYear: 2026 });
  });

  it('builds five consecutive seasons for the enterprise workbook window', () => {
    const window = buildSeasonWindowFromYearMonth('2026-05', 5);
    expect(window.map((season) => season.seasonLabel)).toEqual([
      'Summer 2026',
      'Fall 2026',
      'Winter 2026',
      'Spring 2027',
      'Summer 2027',
    ]);
    expect(window.flatMap((season) => season.months)).toHaveLength(15);
    expect(window.flatMap((season) => season.months).at(-1)).toBe('2027-07');
  });
});
