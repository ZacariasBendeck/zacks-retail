import { getDb } from '../db/database';

export interface DepartmentOnHandRow {
  department: string;
  total_skus: number;
  total_units: number;
  total_cost_value: number;
}

export interface CategoryOnHandRow {
  category: number;
  department: string;
  total_skus: number;
  total_units: number;
  total_cost_value: number;
}

export interface OnHandDetailRow {
  sku_id: string;
  sku_code: string;
  brand: string;
  style: string;
  color: string;
  size: string;
  price: number;
  category: number;
  department: string;
  quantity_on_hand: number;
  cost_value: number;
}

export interface DepartmentSummary {
  department: string;
  totalSkus: number;
  totalUnits: number;
  totalCostValue: number;
}

export interface CategorySummary {
  category: number;
  department: string;
  totalSkus: number;
  totalUnits: number;
  totalCostValue: number;
}

export interface OnHandDetail {
  skuId: string;
  skuCode: string;
  brand: string;
  style: string;
  color: string;
  size: string;
  price: number;
  category: number;
  department: string;
  quantityOnHand: number;
  costValue: number;
}

export function getOnHandByDepartment(): DepartmentSummary[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT
      s.department,
      COUNT(DISTINCT s.id) AS total_skus,
      COALESCE(SUM(i.quantity_on_hand), 0) AS total_units,
      COALESCE(SUM(i.quantity_on_hand * s.price), 0) AS total_cost_value
    FROM skus s
    LEFT JOIN inventory i ON i.sku_id = s.id
    WHERE s.active = 1
    GROUP BY s.department
    ORDER BY s.department
  `).all() as unknown as DepartmentOnHandRow[];

  return rows.map((r) => ({
    department: r.department,
    totalSkus: r.total_skus,
    totalUnits: r.total_units,
    totalCostValue: r.total_cost_value,
  }));
}

export function getOnHandByCategory(department: string): CategorySummary[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT
      s.category,
      s.department,
      COUNT(DISTINCT s.id) AS total_skus,
      COALESCE(SUM(i.quantity_on_hand), 0) AS total_units,
      COALESCE(SUM(i.quantity_on_hand * s.price), 0) AS total_cost_value
    FROM skus s
    LEFT JOIN inventory i ON i.sku_id = s.id
    WHERE s.active = 1 AND s.department = ?
    GROUP BY s.category
    ORDER BY s.category
  `).all(department) as unknown as CategoryOnHandRow[];

  return rows.map((r) => ({
    category: r.category,
    department: r.department,
    totalSkus: r.total_skus,
    totalUnits: r.total_units,
    totalCostValue: r.total_cost_value,
  }));
}

export function getOnHandDetails(filters: { department?: string; category?: number }): OnHandDetail[] {
  const db = getDb();

  const conditions = ['s.active = 1'];
  const params: (string | number)[] = [];

  if (filters.department) {
    conditions.push('s.department = ?');
    params.push(filters.department);
  }
  if (filters.category != null) {
    conditions.push('s.category = ?');
    params.push(filters.category);
  }

  const where = conditions.join(' AND ');

  const rows = db.prepare(`
    SELECT
      s.id AS sku_id,
      s.sku_code,
      s.brand,
      s.style,
      s.color,
      s.size,
      s.price,
      s.category,
      s.department,
      COALESCE(i.quantity_on_hand, 0) AS quantity_on_hand,
      COALESCE(i.quantity_on_hand * s.price, 0) AS cost_value
    FROM skus s
    LEFT JOIN inventory i ON i.sku_id = s.id
    WHERE ${where}
    ORDER BY s.department, s.category, s.brand, s.sku_code
  `).all(...params as any) as unknown as OnHandDetailRow[];

  return rows.map((r) => ({
    skuId: r.sku_id,
    skuCode: r.sku_code,
    brand: r.brand,
    style: r.style,
    color: r.color,
    size: r.size,
    price: r.price,
    category: r.category,
    department: r.department,
    quantityOnHand: r.quantity_on_hand,
    costValue: r.cost_value,
  }));
}
