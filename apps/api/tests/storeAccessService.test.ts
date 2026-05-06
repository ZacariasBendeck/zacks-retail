import {
  storeAccessSummaryAllowsStore,
  storeScopeAllowsStore,
} from '../src/services/identityAccess/storeAccessService';

describe('storeAccessService', () => {
  it('treats warehouse scopes as store-number access', () => {
    expect(storeScopeAllowsStore({ scopeType: 'WAREHOUSE', scopeId: '99' }, 99)).toBe(true);
    expect(storeScopeAllowsStore({ scopeType: 'WAREHOUSE', scopeId: '99' }, 2)).toBe(false);
  });

  it('allows warehouse ids carried in the effective store list', () => {
    expect(storeAccessSummaryAllowsStore({ allStores: false, storeIds: ['99'] }, 99)).toBe(true);
  });
});
