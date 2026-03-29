export type Department = 'FORMAL' | 'CASUAL' | 'FIESTA' | 'SANDALIAS' | 'BOOTS' | 'COMFORT';

export interface SkuRow {
  id: string;
  sku_code: string;
  brand: string;
  style: string;
  color: string;
  size: string;
  price: number;
  cost: number | null;
  category: number;
  department: Department;
  vendor_id: string;
  vendor_sku: string | null;
  barcode: string | null;
  description: string | null;
  comment: string | null;
  keywords: string | null;
  season: string | null;
  manufacturer: string | null;
  picture_url: string | null;
  color_family_id: number | null;
  shoe_type_id: number | null;
  heel_shape_id: number | null;
  heel_height_id: number | null;
  toe_shape_id: number | null;
  closure_type_id: number | null;
  upper_material_id: number | null;
  outsole_material_id: number | null;
  finish_id: number | null;
  width_type_id: number | null;
  pattern_id: number | null;
  occasion_id: number | null;
  target_audience_id: number | null;
  accessory_id: number | null;
  season_id: number | null;
  size_type_id: number | null;
  label_type_id: number | null;
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
  cost: number | null;
  category: number;
  department: Department;
  vendorId: string;
  vendorSku: string | null;
  barcode: string | null;
  description: string | null;
  comment: string | null;
  keywords: string | null;
  season: string | null;
  manufacturer: string | null;
  pictureUrl: string | null;
  colorFamilyId: number | null;
  shoeTypeId: number | null;
  heelShapeId: number | null;
  heelHeightId: number | null;
  toeShapeId: number | null;
  closureTypeId: number | null;
  upperMaterialId: number | null;
  outsoleMaterialId: number | null;
  finishId: number | null;
  widthTypeId: number | null;
  patternId: number | null;
  occasionId: number | null;
  targetAudienceId: number | null;
  accessoryId: number | null;
  seasonId: number | null;
  sizeTypeId: number | null;
  labelTypeId: number | null;
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

export interface ReferenceItem {
  id: number;
  name: string;
  active: boolean;
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
    cost: row.cost,
    category: row.category,
    department: row.department,
    vendorId: row.vendor_id,
    vendorSku: row.vendor_sku,
    barcode: row.barcode,
    description: row.description,
    comment: row.comment,
    keywords: row.keywords,
    season: row.season,
    manufacturer: row.manufacturer,
    pictureUrl: row.picture_url,
    colorFamilyId: row.color_family_id,
    shoeTypeId: row.shoe_type_id,
    heelShapeId: row.heel_shape_id,
    heelHeightId: row.heel_height_id,
    toeShapeId: row.toe_shape_id,
    closureTypeId: row.closure_type_id,
    upperMaterialId: row.upper_material_id,
    outsoleMaterialId: row.outsole_material_id,
    finishId: row.finish_id,
    widthTypeId: row.width_type_id,
    patternId: row.pattern_id,
    occasionId: row.occasion_id,
    targetAudienceId: row.target_audience_id,
    accessoryId: row.accessory_id,
    seasonId: row.season_id,
    sizeTypeId: row.size_type_id,
    labelTypeId: row.label_type_id,
    heelType: row.heel_type,
    material: row.material,
    active: row.active === 1,
    currentStock,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
