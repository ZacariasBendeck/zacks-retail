import { ALL_PERMISSIONS, PERMISSIONS } from '../../src/services/employees/permissions';
import { ROLE_CATALOG, ROLE_NAMES } from '../../src/services/employees/roleCatalog';

describe('permission + role catalog', () => {
  it('PERMISSIONS values are unique strings', () => {
    const values = Object.values(PERMISSIONS);
    expect(new Set(values).size).toBe(values.length);
    values.forEach((v) => expect(typeof v).toBe('string'));
  });

  it('OWNER has every permission', () => {
    expect(ROLE_CATALOG.OWNER.permissions.length).toBe(ALL_PERMISSIONS.length);
  });

  it('every role permission exists in the catalog', () => {
    for (const role of ROLE_NAMES) {
      for (const p of ROLE_CATALOG[role].permissions) {
        expect(ALL_PERMISSIONS).toContain(p);
      }
    }
  });

  it('SALESPERSON cannot refund', () => {
    expect(ROLE_CATALOG.SALESPERSON.permissions).not.toContain(PERMISSIONS.SALES_REFUND);
  });

  it('MANAGER can refund', () => {
    expect(ROLE_CATALOG.MANAGER.permissions).toContain(PERMISSIONS.SALES_REFUND);
  });
});
