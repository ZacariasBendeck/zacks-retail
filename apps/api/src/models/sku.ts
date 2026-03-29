export type Department = 'FORMAL' | 'CASUAL' | 'FIESTA' | 'SANDALIAS' | 'BOOTS' | 'COMFORT';

export interface SkuRow {
  id: string;
  sku_code: string;
  brand: string;
  style: string;
  color: string;
  size: string;
  price: number;
  category: number;
  department: Department;
  vendor_id: string;
  barcode: string | null;
  description: string | null;
  heel_type: string | null;
  material: string | null;
  active: number; // SQLite boolean
  created_at: string;
  updated_at: string;
}

export interface Sku {
  id: string;
  skuCode: string;
  brand: string;
  style: string;
  color: string;
  size: string;
  price: number;
  category: number;
  department: Department;
  vendorId: string;
  barcode: string | null;
  description: string | null;
  heelType: string | null;
  material: string | null;
  active: boolean;
  currentStock?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SkuListParams {
  page: number;
  pageSize: number;
  sort: string;
  order: 'asc' | 'desc';
  brand?: string;
  department?: Department;
  category?: number;
  vendorId?: string;
  active?: boolean;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  size?: string;
}

export interface PaginationEnvelope<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export function rowToSku(row: SkuRow, currentStock?: number): Sku {
  return {
    id: row.id,
    skuCode: row.sku_code,
    brand: row.brand,
    style: row.style,
    color: row.color,
    size: row.size,
    price: row.price,
    category: row.category,
    department: row.department,
    vendorId: row.vendor_id,
    barcode: row.barcode,
    description: row.description,
    heelType: row.heel_type,
    material: row.material,
    active: row.active === 1,
    currentStock,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
