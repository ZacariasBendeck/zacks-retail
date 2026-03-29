export interface DepartmentOnHand {
  department: string
  totalSkus: number
  totalUnits: number
  totalCostValue: number
}

export interface CategoryOnHand {
  category: number
  department: string
  totalSkus: number
  totalUnits: number
  totalCostValue: number
}

export interface OnHandDetail {
  skuId: string
  skuCode: string
  brand: string
  style: string
  color: string
  size: string
  price: number
  category: number
  department: string
  quantityOnHand: number
  costValue: number
}

export interface OnHandDepartmentResponse {
  departments: DepartmentOnHand[]
}

export interface OnHandDrillDownResponse {
  department: string
  categories: CategoryOnHand[]
  details: OnHandDetail[]
}

export async function fetchOnHandByDepartment(): Promise<OnHandDepartmentResponse> {
  const res = await fetch('/api/v1/reports/on-hand')
  if (!res.ok) throw new Error(`Failed to fetch on-hand report: ${res.status}`)
  return res.json()
}

export async function fetchOnHandDrillDown(
  department: string,
  category?: number,
): Promise<OnHandDrillDownResponse> {
  const params = new URLSearchParams({ department })
  if (category != null) params.set('category', String(category))
  const res = await fetch(`/api/v1/reports/on-hand?${params}`)
  if (!res.ok) throw new Error(`Failed to fetch on-hand drill-down: ${res.status}`)
  return res.json()
}

export function getOnHandCsvUrl(department?: string, category?: number): string {
  const params = new URLSearchParams({ format: 'csv' })
  if (department) params.set('department', department)
  if (category != null) params.set('category', String(category))
  return `/api/v1/reports/on-hand?${params}`
}
