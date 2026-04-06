/**
 * Purchasing Contract Adapter for OTB Module
 *
 * Governed interface through which OTB consumes purchasing data.
 * OTB must NOT directly join purchase_orders, purchase_order_lines, or skus tables.
 * All purchasing data flows through this contract per ZAI-137 / ZAI-145.
 */
import { getDb } from '../db/database';

export interface DepartmentCommitment {
  department: string;
  year: number;
  month: number;
  totalAmount: number;
}

export interface PoLineDepartmentTotal {
  department: string;
  totalAmount: number;
}

export interface PurchasingContractAdapter {
  /**
   * Get committed PO totals grouped by department and period.
   * Committed = POs in SUBMITTED, CONFIRMED, or PARTIALLY_RECEIVED status.
   */
  getCommittedByDepartmentPeriod(year: number, month?: number, department?: string): DepartmentCommitment[];

  /**
   * Get received PO totals grouped by department and period.
   * Received = POs in PARTIALLY_RECEIVED, RECEIVED, or CLOSED status.
   */
  getReceivedByDepartmentPeriod(year: number, month?: number, department?: string): DepartmentCommitment[];

  /**
   * Get a PO's creation date and existence check.
   * Returns null if PO not found.
   */
  getPoMeta(poId: string): { id: string; createdAt: string; status: string } | null;

  /**
   * Get PO line totals grouped by SKU department for a specific PO.
   */
  getPoLineTotalsByDepartment(poId: string): PoLineDepartmentTotal[];

  /**
   * Get committed totals for a department/period, excluding a specific PO.
   */
  getCommittedExcludingPo(department: string, year: number, month: number, excludePoId: string): number;
}

/**
 * Default implementation backed by SQL queries against purchasing tables.
 * This adapter owns the cross-module queries — OTB service never touches these tables directly.
 */
export function createPurchasingContractAdapter(): PurchasingContractAdapter {
  return {
    getCommittedByDepartmentPeriod(year: number, month?: number, department?: string): DepartmentCommitment[] {
      const db = getDb();
      const conditions: string[] = ['CAST(strftime(\'%Y\', po.created_at) AS INTEGER) = ?'];
      const values: (string | number)[] = [year];

      if (month) {
        conditions.push('CAST(strftime(\'%m\', po.created_at) AS INTEGER) = ?');
        values.push(month);
      }
      if (department) {
        conditions.push('s.department = ?');
        values.push(department);
      }

      return db.prepare(`
        SELECT
          s.department,
          CAST(strftime('%Y', po.created_at) AS INTEGER) as year,
          CAST(strftime('%m', po.created_at) AS INTEGER) as month,
          SUM(pol.quantity_ordered * pol.unit_cost) as totalAmount
        FROM purchase_order_lines pol
        JOIN purchase_orders po ON po.id = pol.po_id
        JOIN skus s ON s.id = pol.sku_id
        WHERE po.status IN ('SUBMITTED','CONFIRMED','PARTIALLY_RECEIVED')
          AND ${conditions.join(' AND ')}
        GROUP BY s.department, year, month
      `).all(...values) as unknown as DepartmentCommitment[];
    },

    getReceivedByDepartmentPeriod(year: number, month?: number, department?: string): DepartmentCommitment[] {
      const db = getDb();
      const conditions: string[] = ['CAST(strftime(\'%Y\', po.created_at) AS INTEGER) = ?'];
      const values: (string | number)[] = [year];

      if (month) {
        conditions.push('CAST(strftime(\'%m\', po.created_at) AS INTEGER) = ?');
        values.push(month);
      }
      if (department) {
        conditions.push('s.department = ?');
        values.push(department);
      }

      return db.prepare(`
        SELECT
          s.department,
          CAST(strftime('%Y', po.created_at) AS INTEGER) as year,
          CAST(strftime('%m', po.created_at) AS INTEGER) as month,
          SUM(pol.quantity_received * pol.unit_cost) as totalAmount
        FROM purchase_order_lines pol
        JOIN purchase_orders po ON po.id = pol.po_id
        JOIN skus s ON s.id = pol.sku_id
        WHERE po.status IN ('PARTIALLY_RECEIVED','RECEIVED','CLOSED')
          AND ${conditions.join(' AND ')}
        GROUP BY s.department, year, month
      `).all(...values) as unknown as DepartmentCommitment[];
    },

    getPoMeta(poId: string): { id: string; createdAt: string; status: string } | null {
      const db = getDb();
      const row = db.prepare(
        'SELECT id, created_at as createdAt, status FROM purchase_orders WHERE id = ?'
      ).get(poId) as { id: string; createdAt: string; status: string } | undefined;
      return row ?? null;
    },

    getPoLineTotalsByDepartment(poId: string): PoLineDepartmentTotal[] {
      const db = getDb();
      return db.prepare(`
        SELECT s.department, SUM(pol.quantity_ordered * pol.unit_cost) as totalAmount
        FROM purchase_order_lines pol
        JOIN skus s ON s.id = pol.sku_id
        WHERE pol.po_id = ?
        GROUP BY s.department
      `).all(poId) as unknown as PoLineDepartmentTotal[];
    },

    getCommittedExcludingPo(department: string, year: number, month: number, excludePoId: string): number {
      const db = getDb();
      const row = db.prepare(`
        SELECT COALESCE(SUM(pol.quantity_ordered * pol.unit_cost), 0) as total
        FROM purchase_order_lines pol
        JOIN purchase_orders po ON po.id = pol.po_id
        JOIN skus s ON s.id = pol.sku_id
        WHERE s.department = ?
          AND CAST(strftime('%Y', po.created_at) AS INTEGER) = ?
          AND CAST(strftime('%m', po.created_at) AS INTEGER) = ?
          AND po.status IN ('SUBMITTED', 'CONFIRMED', 'PARTIALLY_RECEIVED')
          AND po.id != ?
      `).get(department, year, month, excludePoId) as unknown as { total: number };
      return row.total;
    },
  };
}

/** Singleton instance for production use */
let _defaultAdapter: PurchasingContractAdapter | null = null;

export function getPurchasingContract(): PurchasingContractAdapter {
  if (!_defaultAdapter) {
    _defaultAdapter = createPurchasingContractAdapter();
  }
  return _defaultAdapter;
}

/** For testing — inject a mock adapter */
export function setPurchasingContract(adapter: PurchasingContractAdapter | null): void {
  _defaultAdapter = adapter;
}
