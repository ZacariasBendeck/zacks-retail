export type Department = 'FORMAL' | 'CASUAL' | 'FIESTA' | 'SANDALIAS' | 'BOOTS' | 'COMFORT';

export interface SkuRow {
  id: string;
  sku_code: string;
  style: string;
  price: number;
  cost: number | null;
  category_id: number | null;
  department: Department;
  vendor_id: string;
  vendor_sku: string | null;
  barcode: string | null;
  rics_description: string | null;
  web_description: string | null;
  comment: string | null;
  keywords: string | null;
  season: string | null;
  manufacturer: string | null;
  picture_url: string | null;
  brand_id: number | null;
  color_id: number | null;
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
  heel_material_id: number | null;
  heel_type: string | null;
  material: string | null;
  active: number; // SQLite boolean
  created_at: string;
  updated_at: string;
}

export interface Sku {
  id: string;
  skuCode: string;
  style: string;
  price: number;
  cost: number | null;
  categoryId: number | null;
  department: Department;
  vendorId: string;
  vendorSku: string | null;
  barcode: string | null;
  ricsDescription: string | null;
  webDescription: string | null;
  comment: string | null;
  keywords: string | null;
  season: string | null;
  manufacturer: string | null;
  pictureUrl: string | null;
  brandId: number | null;
  colorId: number | null;
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
  heelMaterialId: number | null;
  heelType: string | null;
  material: string | null;
  active: boolean;
  currentStock?: number;
  sizes?: SkuSize[];
  createdAt: string;
  updatedAt: string;
}

export interface SkuSize {
  id: string;
  skuId: string;
  sizeLabel: string;
  sortOrder: number;
  active: boolean;
  stock?: number;
}

export interface SkuSizeRow {
  id: string;
  sku_id: string;
  size_label: string;
  sort_order: number;
  active: number;
}

export interface SkuListParams {
  page: number;
  pageSize: number;
  sort: string;
  order: 'asc' | 'desc';
  brandId?: number;
  department?: Department;
  categoryId?: number;
  vendorId?: string;
  active?: boolean;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
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
  code?: string;
  active: boolean;
}

export interface CategoryItem extends ReferenceItem {
  ricsCode: number;
  deptMacro: string;
}

export interface ColorItem extends ReferenceItem {
  colorFamilyId: number | null;
}

export interface SizeLabelItem {
  id: number;
  sizeTypeId: number;
  label: string;
  sortOrder: number;
  active: boolean;
}

export function rowToSku(row: SkuRow, currentStock?: number, sizes?: SkuSize[]): Sku {
  return {
    id: row.id,
    skuCode: row.sku_code,
    style: row.style,
    price: row.price,
    cost: row.cost,
    categoryId: row.category_id,
    department: row.department,
    vendorId: row.vendor_id,
    vendorSku: row.vendor_sku,
    barcode: row.barcode,
    ricsDescription: row.rics_description,
    webDescription: row.web_description,
    comment: row.comment,
    keywords: row.keywords,
    season: row.season,
    manufacturer: row.manufacturer,
    pictureUrl: row.picture_url,
    brandId: row.brand_id,
    colorId: row.color_id,
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
    heelMaterialId: row.heel_material_id,
    heelType: row.heel_type,
    material: row.material,
    active: row.active === 1,
    currentStock,
    sizes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
