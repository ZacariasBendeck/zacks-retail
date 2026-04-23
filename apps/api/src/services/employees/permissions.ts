// Alphabetized by module prefix. Use string constants — no enum, because
// Role.permissions is stored as String[] and string comparison is simplest.
export const PERMISSIONS = {
  // accounts-receivable (future module)
  AR_POST_PAYMENT:        'accounts_receivable.post_payment',
  AR_VIEW:                'accounts_receivable.view',

  // employees (this module)
  EMPLOYEES_MANAGE:       'employees.manage',
  EMPLOYEES_VIEW:         'employees.view',

  // inventory
  INVENTORY_ADJUST:       'inventory.adjust',
  INVENTORY_VIEW:         'inventory.view',

  // otb-planning
  OTB_EDIT:               'otb.edit',
  OTB_VIEW:               'otb.view',

  // products
  PRODUCTS_WRITE:         'products.write',
  PRODUCTS_VIEW:          'products.view',

  // purchasing
  PURCHASING_APPROVE:     'purchasing.approve',
  PURCHASING_EDIT:        'purchasing.edit',
  PURCHASING_VIEW:        'purchasing.view',

  // reports (cross-cutting)
  REPORTS_ADMIN:          'reports.admin',
  REPORTS_VIEW:           'reports.view',

  // sales-pos
  SALES_POS_OPERATE:      'sales_pos.operate',
  SALES_REFUND:           'sales_pos.refund',

  // store-ops
  STORE_OPS_CONFIGURE:    'store_ops.configure',
  STORE_OPS_VIEW:         'store_ops.view',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];
export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);
