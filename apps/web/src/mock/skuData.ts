import type { Department, Sku } from '../types/sku'

const BRAND_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const COLOR_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const STYLES = ['Oxford', 'Loafer', 'Boot', 'Sandal', 'Sneaker', 'Pump', 'Flat', 'Mule', 'Derby', 'Chelsea']
const DEPARTMENTS: Department[] = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT']
const CATEGORY_IDS = Array.from({ length: 44 }, (_, i) => 556 + i)

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function generateSkus(count: number): Sku[] {
  const skus: Sku[] = []
  for (let i = 0; i < count; i++) {
    const dept = randomItem(DEPARTMENTS)
    const brandId = randomItem(BRAND_IDS)
    const colorId = randomItem(COLOR_IDS)
    const categoryId = randomItem(CATEGORY_IDS)
    skus.push({
      id: crypto.randomUUID(),
      skuCode: `${dept.slice(0, 3)}-B${brandId}-C${colorId}-${String(i + 1).padStart(3, '0')}`,
      style: randomItem(STYLES),
      price: Math.round((29.99 + Math.random() * 220) * 100) / 100,
      cost: null,
      categoryId,
      department: dept,
      vendorId: crypto.randomUUID(),
      vendorSku: null,
      barcode: Math.random() > 0.3 ? String(1000000000000 + Math.floor(Math.random() * 9000000000000)) : null,
      ricsDescription: null,
      webDescription: null,
      comment: null,
      keywords: null,
      season: null,
      manufacturer: null,
      pictureUrl: null,
      brandId,
      colorId,
      colorFamilyId: null,
      shoeTypeId: null,
      heelShapeId: null,
      heelHeightId: null,
      toeShapeId: null,
      closureTypeId: null,
      upperMaterialId: null,
      outsoleMaterialId: null,
      finishId: null,
      widthTypeId: null,
      patternId: null,
      occasionId: null,
      targetAudienceId: null,
      accessoryId: null,
      seasonId: null,
      sizeTypeId: null,
      labelTypeId: null,
      heelMaterialId: null,
      heelType: null,
      material: null,
      active: Math.random() > 0.05,
      currentStock: Math.floor(Math.random() * 150),
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  return skus
}

export const MOCK_SKUS = generateSkus(500)
