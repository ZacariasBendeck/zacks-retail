import { resetDb } from '../src/db/database';
import * as svc from '../src/services/companySettingsService';

beforeEach(() => {
  resetDb();
});

describe('companySettingsService', () => {
  it('seeds otb.entry_method = CHANGE_OVER_LAST_YEAR by default', () => {
    expect(svc.getOtbEntryMethod()).toBe('CHANGE_OVER_LAST_YEAR');
  });

  it('round-trips a value', () => {
    svc.setOtbEntryMethod('FIXED_MONTHLY_MIX', 'admin');
    expect(svc.getOtbEntryMethod()).toBe('FIXED_MONTHLY_MIX');
  });

  it('returns the fallback default for an unknown key', () => {
    expect(svc.getCompanySetting('nonexistent.key', 'fallback')).toBe('fallback');
  });

  it('persists arbitrary JSON-serialisable values', () => {
    svc.setCompanySetting('custom.example', { a: 1, b: [2, 3] }, 'admin');
    expect(svc.getCompanySetting('custom.example', null)).toEqual({ a: 1, b: [2, 3] });
  });
});
