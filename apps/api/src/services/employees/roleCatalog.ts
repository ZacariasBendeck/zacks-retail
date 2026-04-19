import { ALL_PERMISSIONS, PERMISSIONS as P } from './permissions';

export const ROLE_CATALOG = {
  OWNER: {
    name: 'OWNER',
    permissions: [...ALL_PERMISSIONS],
  },
  ADMIN: {
    name: 'ADMIN',
    permissions: [
      P.EMPLOYEES_MANAGE, P.EMPLOYEES_VIEW,
      P.STORE_OPS_CONFIGURE, P.STORE_OPS_VIEW,
      P.PRODUCTS_WRITE, P.PRODUCTS_VIEW,
      P.INVENTORY_ADJUST, P.INVENTORY_VIEW,
      P.PURCHASING_VIEW, P.OTB_VIEW, P.AR_VIEW,
      P.REPORTS_VIEW, P.SALES_POS_OPERATE,
    ],
  },
  FINANCE: {
    name: 'FINANCE',
    permissions: [
      P.AR_POST_PAYMENT, P.AR_VIEW,
      P.REPORTS_VIEW, P.STORE_OPS_VIEW,
      P.INVENTORY_VIEW, P.PRODUCTS_VIEW,
    ],
  },
  BUYER: {
    name: 'BUYER',
    permissions: [
      P.PURCHASING_APPROVE, P.PURCHASING_EDIT, P.PURCHASING_VIEW,
      P.OTB_EDIT, P.OTB_VIEW,
      P.PRODUCTS_WRITE, P.PRODUCTS_VIEW,
      P.INVENTORY_VIEW, P.REPORTS_VIEW,
    ],
  },
  MANAGER: {
    name: 'MANAGER',
    permissions: [
      P.SALES_REFUND, P.SALES_POS_OPERATE,
      P.INVENTORY_VIEW, P.INVENTORY_ADJUST,
      P.PRODUCTS_VIEW, P.REPORTS_VIEW,
      P.STORE_OPS_VIEW, P.EMPLOYEES_VIEW,
    ],
  },
  SALESPERSON: {
    name: 'SALESPERSON',
    permissions: [
      P.SALES_POS_OPERATE,
      P.PRODUCTS_VIEW, P.INVENTORY_VIEW,
    ],
  },
} as const;

export type RoleName = keyof typeof ROLE_CATALOG;
export const ROLE_NAMES = Object.keys(ROLE_CATALOG) as RoleName[];
