import type { Department, Sku } from '../types/sku'

const BRANDS = ['Nike', 'Adidas', 'Puma', 'Clarks', 'Steve Madden', 'Aldo', 'Cole Haan', 'Timberland', 'Dr. Martens', 'Skechers']
const COLORS = ['Black', 'Brown', 'White', 'Navy', 'Tan', 'Red', 'Grey', 'Burgundy', 'Beige', 'Multi']
const STYLES = ['Oxford', 'Loafer', 'Boot', 'Sandal', 'Sneaker', 'Pump', 'Flat', 'Mule', 'Derby', 'Chelsea']
const DEPARTMENTS: Department[] = ['FORMAL', 'CASUAL', 'FIESTA', 'SANDALIAS', 'BOOTS', 'COMFORT']
const SIZES = ['5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '12', '13']

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function generateSkus(count: number): Sku[] {
  const skus: Sku[] = []
  for (let i = 0; i < count; i++) {
    const dept = randomItem(DEPARTMENTS)
    const brand = randomItem(BRANDS)
    const color = randomItem(COLORS)
    const size = randomItem(SIZES)
    const category = 556 + Math.floor(Math.random() * 44)
    skus.push({
      id: crypto.randomUUID(),
      skuCode: `${dept.slice(0, 3)}-${brand.slice(0, 3).toUpperCase()}-${color.slice(0, 3).toUpperCase()}-${size}-${String(i + 1).padStart(3, '0')}`,
      brand,
      style: randomItem(STYLES),
      color,
      size,
      price: Math.round((29.99 + Math.random() * 220) * 100) / 100,
      category,
      department: dept,
      vendorId: crypto.randomUUID(),
      barcode: Math.random() > 0.3 ? String(1000000000000 + Math.floor(Math.random() * 9000000000000)) : null,
      description: null,
      active: Math.random() > 0.05,
      currentStock: Math.floor(Math.random() * 150),
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  return skus
}

export const MOCK_SKUS = generateSkus(500)
