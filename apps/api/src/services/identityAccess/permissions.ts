// Alphabetized by module prefix. Use string constants because Role.permissions
// is stored as String[] and string comparison is simplest.
export const PERMISSIONS = {
  // accounts-receivable (future module)
  AR_POST_PAYMENT:        'accounts_receivable.post_payment',
  AR_VIEW:                'accounts_receivable.view',

  // employees
  EMPLOYEES_MANAGE:       'employees.manage',
  EMPLOYEES_VIEW:         'employees.view',
  TIME_CLOCK_MANAGE:      'employees.time_clock.manage',
  TIME_CLOCK_SELF:        'employees.time_clock.self',

  // inventory
  INVENTORY_ADJUST:       'inventory.adjust',
  INVENTORY_VIEW:         'inventory.view',

  // import-management
  IMPORT_MANAGEMENT_VIEW: 'import_management.view',
  IMPORT_MANAGEMENT_RECEIVE_ESTIMATED: 'import_management.receive_estimated',
  IMPORT_MANAGEMENT_FINAL_LIQUIDATION: 'import_management.final_liquidation',
  IMPORT_MANAGEMENT_COST_OVERRIDE: 'import_management.cost_override',
  IMPORT_MANAGEMENT_APPROVE_MISMATCH: 'import_management.approve_mismatch',

  // identity-access
  IDENTITY_ACCESS_MANAGE: 'identity_access.manage',
  IDENTITY_ACCESS_VIEW:   'identity_access.view',

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

  // segmentation
  SEGMENTATION_ACTIVATE:  'segmentation.activate',
  SEGMENTATION_ADMIN:     'segmentation.admin',
  SEGMENTATION_EVALUATE:  'segmentation.evaluate',
  SEGMENTATION_READ:      'segmentation.read',
  SEGMENTATION_WRITE:     'segmentation.write',

  // sales-pos
  SALES_POS_OPERATE:      'sales_pos.operate',
  SALES_REFUND:           'sales_pos.refund',

  // store-ops
  STORE_OPS_CONFIGURE:    'store_ops.configure',
  STORE_OPS_VIEW:         'store_ops.view',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];
export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

export interface PermissionDefinition {
  key: Permission;
  module: string;
  moduleLabel: string;
  label: string;
  description: string;
}

export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  {
    key: PERMISSIONS.IDENTITY_ACCESS_VIEW,
    module: 'identity_access',
    moduleLabel: 'Identity & Access',
    label: 'View users and access',
    description: 'See users, roles, effective access, login activity, and security audit records.',
  },
  {
    key: PERMISSIONS.IDENTITY_ACCESS_MANAGE,
    module: 'identity_access',
    moduleLabel: 'Identity & Access',
    label: 'Manage users and access',
    description: 'Create users, update accounts, assign roles/scopes, reset passwords, and revoke sessions.',
  },
  {
    key: PERMISSIONS.EMPLOYEES_VIEW,
    module: 'employees',
    moduleLabel: 'Employees',
    label: 'View employees',
    description: 'See employees, salespeople, employee settings, and employee operational records.',
  },
  {
    key: PERMISSIONS.EMPLOYEES_MANAGE,
    module: 'employees',
    moduleLabel: 'Employees',
    label: 'Manage employees',
    description: 'Create and update employee/salesperson records and employee operational settings.',
  },
  {
    key: PERMISSIONS.TIME_CLOCK_SELF,
    module: 'employees',
    moduleLabel: 'Employees',
    label: 'Use own time clock',
    description: 'Clock in/out and view personal time-clock access where applicable.',
  },
  {
    key: PERMISSIONS.TIME_CLOCK_MANAGE,
    module: 'employees',
    moduleLabel: 'Employees',
    label: 'Manage time clock',
    description: 'Manage time-clock policy, entries, reconciliation, adjustments, and time-clock reports.',
  },
  {
    key: PERMISSIONS.STORE_OPS_VIEW,
    module: 'store_ops',
    moduleLabel: 'Store Operations',
    label: 'View store operations',
    description: 'View store operations setup such as stores, chains, and operating context.',
  },
  {
    key: PERMISSIONS.STORE_OPS_CONFIGURE,
    module: 'store_ops',
    moduleLabel: 'Store Operations',
    label: 'Configure store operations',
    description: 'Change store operations setup and configuration.',
  },
  {
    key: PERMISSIONS.PRODUCTS_VIEW,
    module: 'products',
    moduleLabel: 'Products',
    label: 'View products',
    description: 'View product catalog, SKU details, taxonomy, product attributes, and lookup data.',
  },
  {
    key: PERMISSIONS.PRODUCTS_WRITE,
    module: 'products',
    moduleLabel: 'Products',
    label: 'Manage products',
    description: 'Create and update product catalog records, SKU attributes, taxonomy, and product setup.',
  },
  {
    key: PERMISSIONS.INVENTORY_VIEW,
    module: 'inventory',
    moduleLabel: 'Inventory',
    label: 'View inventory',
    description: 'View inventory balances, movement history, inquiry, and inventory reports.',
  },
  {
    key: PERMISSIONS.INVENTORY_ADJUST,
    module: 'inventory',
    moduleLabel: 'Inventory',
    label: 'Adjust inventory',
    description: 'Create stock adjustments, receipts, transfers, and other inventory-changing records.',
  },
  {
    key: PERMISSIONS.PURCHASING_VIEW,
    module: 'purchasing',
    moduleLabel: 'Purchasing',
    label: 'View purchasing',
    description: 'View purchase orders, purchasing reports, receiving history, and purchasing context.',
  },
  {
    key: PERMISSIONS.PURCHASING_EDIT,
    module: 'purchasing',
    moduleLabel: 'Purchasing',
    label: 'Edit purchasing',
    description: 'Create and edit draft purchase orders and purchasing work in progress.',
  },
  {
    key: PERMISSIONS.PURCHASING_APPROVE,
    module: 'purchasing',
    moduleLabel: 'Purchasing',
    label: 'Approve purchasing',
    description: 'Approve or confirm purchase-order workflow steps.',
  },
  {
    key: PERMISSIONS.IMPORT_MANAGEMENT_VIEW,
    module: 'import_management',
    moduleLabel: 'Import Management',
    label: 'View import management',
    description: 'View import shipments, import receiving progress, and import invoice/liquidation context.',
  },
  {
    key: PERMISSIONS.IMPORT_MANAGEMENT_RECEIVE_ESTIMATED,
    module: 'import_management',
    moduleLabel: 'Import Management',
    label: 'Receive imports at estimate',
    description: 'Receive import shipments using estimated costs before final liquidation.',
  },
  {
    key: PERMISSIONS.IMPORT_MANAGEMENT_FINAL_LIQUIDATION,
    module: 'import_management',
    moduleLabel: 'Import Management',
    label: 'Finalize import liquidation',
    description: 'Approve final import liquidation, final receiving, and inventory true-up posting.',
  },
  {
    key: PERMISSIONS.IMPORT_MANAGEMENT_COST_OVERRIDE,
    module: 'import_management',
    moduleLabel: 'Import Management',
    label: 'Override import costs',
    description: 'Change import FX, source costs, landed-cost estimates, and final landed-cost source documents.',
  },
  {
    key: PERMISSIONS.IMPORT_MANAGEMENT_APPROVE_MISMATCH,
    module: 'import_management',
    moduleLabel: 'Import Management',
    label: 'Approve import mismatches',
    description: 'Approve invoice-to-expected-PO quantity, currency, or amount mismatches with a documented reason.',
  },
  {
    key: PERMISSIONS.OTB_VIEW,
    module: 'otb',
    moduleLabel: 'OTB Planning',
    label: 'View OTB',
    description: 'View open-to-buy budgets, monthly plans, and planning reports.',
  },
  {
    key: PERMISSIONS.OTB_EDIT,
    module: 'otb',
    moduleLabel: 'OTB Planning',
    label: 'Edit OTB',
    description: 'Create and update open-to-buy plans and plan rows.',
  },
  {
    key: PERMISSIONS.REPORTS_VIEW,
    module: 'reports',
    moduleLabel: 'Reports',
    label: 'View reports',
    description: 'Run and view operational, sales, inventory, and management reports.',
  },
  {
    key: PERMISSIONS.REPORTS_ADMIN,
    module: 'reports',
    moduleLabel: 'Reports',
    label: 'Administer reports',
    description: 'Administer report templates, shared report runs, and report visibility.',
  },
  {
    key: PERMISSIONS.SALES_POS_OPERATE,
    module: 'sales_pos',
    moduleLabel: 'Sales POS',
    label: 'Operate POS',
    description: 'Use point-of-sale workflows such as selling, returns, shift operations, and POS lookups.',
  },
  {
    key: PERMISSIONS.SALES_REFUND,
    module: 'sales_pos',
    moduleLabel: 'Sales POS',
    label: 'Approve POS refunds',
    description: 'Perform or approve POS refund workflows that require manager access.',
  },
  {
    key: PERMISSIONS.AR_VIEW,
    module: 'accounts_receivable',
    moduleLabel: 'Accounts Receivable',
    label: 'View AR',
    description: 'View accounts-receivable customers, balances, payments, and account activity.',
  },
  {
    key: PERMISSIONS.AR_POST_PAYMENT,
    module: 'accounts_receivable',
    moduleLabel: 'Accounts Receivable',
    label: 'Post AR payments',
    description: 'Post accounts-receivable payments and payment adjustments.',
  },
  {
    key: PERMISSIONS.SEGMENTATION_READ,
    module: 'segmentation',
    moduleLabel: 'Customer Segmentation',
    label: 'View segmentation',
    description: 'View customer segments, segment membership, and customer intelligence outputs.',
  },
  {
    key: PERMISSIONS.SEGMENTATION_WRITE,
    module: 'segmentation',
    moduleLabel: 'Customer Segmentation',
    label: 'Manage segmentation',
    description: 'Create and update customer segmentation definitions and rules.',
  },
  {
    key: PERMISSIONS.SEGMENTATION_ACTIVATE,
    module: 'segmentation',
    moduleLabel: 'Customer Segmentation',
    label: 'Activate segments',
    description: 'Activate/deactivate customer segments used by promotions and operations.',
  },
  {
    key: PERMISSIONS.SEGMENTATION_EVALUATE,
    module: 'segmentation',
    moduleLabel: 'Customer Segmentation',
    label: 'Evaluate segments',
    description: 'Run segment evaluation jobs and preview segment membership.',
  },
  {
    key: PERMISSIONS.SEGMENTATION_ADMIN,
    module: 'segmentation',
    moduleLabel: 'Customer Segmentation',
    label: 'Administer segmentation',
    description: 'Access advanced segmentation administration and system-level segmentation tools.',
  },
];

export const PERMISSION_BY_KEY = new Map(PERMISSION_CATALOG.map((permission) => [permission.key, permission]));
