import { buildSeasonMonths } from '../../src/services/purchasePlanning/season';

describe('purchase planning seasons', () => {
  it('maps the four merchandise seasons to three-month windows', () => {
    expect(buildSeasonMonths('spring', 2026)).toEqual(['2026-02', '2026-03', '2026-04']);
    expect(buildSeasonMonths('summer', 2026)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(buildSeasonMonths('fall', 2026)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(buildSeasonMonths('winter', 2026)).toEqual(['2026-11', '2026-12', '2027-01']);
  });
});
