import type { Product, Facets, ProductListParams, ProductListResponse } from '@/types/product'

const SHOE_IMAGES = [
  'https://placehold.co/400x400/f5f5dc/333?text=Zapato+1',
  'https://placehold.co/400x400/d4a574/333?text=Zapato+2',
  'https://placehold.co/400x400/8b4513/fff?text=Zapato+3',
  'https://placehold.co/400x400/2f4f4f/fff?text=Zapato+4',
]

const BRANDS = ['Nike', 'Adidas', 'Clarks', 'Steve Madden', 'Sam Edelman', 'Cole Haan', 'UGG', 'Skechers', 'New Balance', 'ALDO']
const CATEGORIES = ['Sandalias', 'Botas', 'Casual', 'Formal', 'Fiesta', 'Comfort']
const COLORS = [
  { id: 1, name: 'Negro', code: 'NEG', hex: '#000000' },
  { id: 2, name: 'Blanco', code: 'BLA', hex: '#FFFFFF' },
  { id: 3, name: 'Café', code: 'CAF', hex: '#8B4513' },
  { id: 4, name: 'Rojo', code: 'ROJ', hex: '#DC143C' },
  { id: 5, name: 'Azul', code: 'AZU', hex: '#1E90FF' },
  { id: 6, name: 'Rosa', code: 'ROS', hex: '#FF69B4' },
  { id: 7, name: 'Beige', code: 'BEI', hex: '#F5DEB3' },
  { id: 8, name: 'Dorado', code: 'DOR', hex: '#FFD700' },
]
const SIZES = ['5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '11']
const MATERIALS = ['Cuero', 'Sintético', 'Tela', 'Gamuza', 'Charol']
const STYLES = ['Plataforma', 'Tacón Alto', 'Tacón Bajo', 'Flat', 'Cuña', 'Deportivo']

const PRODUCT_NAMES = [
  'Elegance Stiletto', 'Urban Walker', 'Comfort Plus', 'Classic Oxford',
  'Summer Breeze Sandal', 'Power Stride', 'Moonlight Pump', 'Terra Boot',
  'City Flex Loafer', 'Crystal Evening Shoe', 'Beach Walk Slide', 'Sport Edge Runner',
  'Velvet Dream Heel', 'Canyon Hiker', 'Silk Touch Flat', 'Storm Winter Boot',
  'Garden Party Wedge', 'Metro Sneaker', 'Pearl Accent Mule', 'Riviera Espadrille',
]

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return s / 2147483647
  }
}

function generateProducts(): Product[] {
  const rand = seededRandom(42)
  const products: Product[] = []

  for (let i = 1; i <= 96; i++) {
    const brand = BRANDS[Math.floor(rand() * BRANDS.length)]!
    const name = PRODUCT_NAMES[Math.floor(rand() * PRODUCT_NAMES.length)]!
    const category = CATEGORIES[Math.floor(rand() * CATEGORIES.length)]!
    const price = Math.round((30 + rand() * 170) * 100) / 100
    const hasDiscount = rand() > 0.7
    const colorCount = 1 + Math.floor(rand() * 4)
    const productColors = []
    const usedIndices = new Set<number>()
    for (let c = 0; c < colorCount; c++) {
      let idx: number
      do { idx = Math.floor(rand() * COLORS.length) } while (usedIndices.has(idx))
      usedIndices.add(idx)
      productColors.push(COLORS[idx]!)
    }
    const sizeStart = Math.floor(rand() * 4)
    const sizeCount = 4 + Math.floor(rand() * 6)
    const productSizes = SIZES.slice(sizeStart, sizeStart + sizeCount)

    products.push({
      id: i,
      sku_number: `SKU-${String(i).padStart(5, '0')}`,
      brand,
      name,
      price,
      original_price: hasDiscount ? Math.round(price * (1.2 + rand() * 0.4) * 100) / 100 : undefined,
      rating: Math.round((3 + rand() * 2) * 10) / 10,
      review_count: Math.floor(rand() * 500),
      image_url: SHOE_IMAGES[Math.floor(rand() * SHOE_IMAGES.length)]!,
      images: SHOE_IMAGES.slice(0, 2 + Math.floor(rand() * 3)),
      colors: productColors,
      sizes: productSizes,
      category,
      category_path: ['Zapatos', category],
      department: category === 'Sandalias' ? 'SANDALIAS' : category === 'Botas' ? 'BOOTS' : category === 'Formal' ? 'FORMAL' : 'CASUAL',
      material: MATERIALS[Math.floor(rand() * MATERIALS.length)],
      style: STYLES[Math.floor(rand() * STYLES.length)],
      description: `${brand} ${name} - Zapato de alta calidad diseñado para comodidad y estilo.`,
      web_description: `Descubre el ${name} de ${brand}. Un zapato ${category.toLowerCase()} que combina elegancia y comodidad para el día a día.`,
      specifications: {
        'Material': MATERIALS[Math.floor(rand() * MATERIALS.length)]!,
        'Tipo de Suela': rand() > 0.5 ? 'Goma' : 'Cuero',
        'País de Origen': rand() > 0.5 ? 'México' : 'Brasil',
        'Temporada': rand() > 0.5 ? 'Primavera/Verano' : 'Otoño/Invierno',
      },
    })
  }
  return products
}

const ALL_PRODUCTS = generateProducts()

function buildFacets(products: Product[]): Facets {
  const count = (arr: string[]) => {
    const map = new Map<string, number>()
    for (const v of arr) map.set(v, (map.get(v) ?? 0) + 1)
    return Array.from(map.entries())
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => b.count - a.count)
  }

  return {
    brands: count(products.map(p => p.brand)),
    sizes: count(products.flatMap(p => p.sizes)).sort((a, b) => parseFloat(a.value) - parseFloat(b.value)),
    colors: count(products.flatMap(p => p.colors.map(c => c.name))),
    price_ranges: [
      { value: '0-50', label: '$0 - $50', count: products.filter(p => p.price < 50).length },
      { value: '50-100', label: '$50 - $100', count: products.filter(p => p.price >= 50 && p.price < 100).length },
      { value: '100-150', label: '$100 - $150', count: products.filter(p => p.price >= 100 && p.price < 150).length },
      { value: '150+', label: '$150+', count: products.filter(p => p.price >= 150).length },
    ].filter(r => r.count > 0),
    categories: count(products.map(p => p.category)),
    materials: count(products.map(p => p.material).filter((m): m is string => !!m)),
    styles: count(products.map(p => p.style).filter((s): s is string => !!s)),
  }
}

export function mockFetchProducts(params: ProductListParams): ProductListResponse {
  let filtered = [...ALL_PRODUCTS]

  if (params.q) {
    const q = params.q.toLowerCase()
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    )
  }
  if (params.category) {
    filtered = filtered.filter(p => p.category === params.category)
  }
  if (params.brand?.length) {
    filtered = filtered.filter(p => params.brand!.includes(p.brand))
  }
  if (params.size?.length) {
    filtered = filtered.filter(p => p.sizes.some(s => params.size!.includes(s)))
  }
  if (params.color?.length) {
    filtered = filtered.filter(p => p.colors.some(c => params.color!.includes(c.name)))
  }
  if (params.material?.length) {
    filtered = filtered.filter(p => p.material && params.material!.includes(p.material))
  }
  if (params.style?.length) {
    filtered = filtered.filter(p => p.style && params.style!.includes(p.style))
  }
  if (params.price_min != null) {
    filtered = filtered.filter(p => p.price >= params.price_min!)
  }
  if (params.price_max != null) {
    filtered = filtered.filter(p => p.price <= params.price_max!)
  }

  const facets = buildFacets(filtered)

  switch (params.sort) {
    case 'price_asc': filtered.sort((a, b) => a.price - b.price); break
    case 'price_desc': filtered.sort((a, b) => b.price - a.price); break
    case 'newest': filtered.sort((a, b) => b.id - a.id); break
    case 'rating': filtered.sort((a, b) => b.rating - a.rating); break
  }

  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 24
  const start = (page - 1) * pageSize
  const data = filtered.slice(start, start + pageSize)

  return {
    data,
    facets,
    pagination: {
      page,
      pageSize,
      totalItems: filtered.length,
      totalPages: Math.ceil(filtered.length / pageSize),
    },
  }
}

export function mockFetchProduct(id: number): Product | undefined {
  return ALL_PRODUCTS.find(p => p.id === id)
}
