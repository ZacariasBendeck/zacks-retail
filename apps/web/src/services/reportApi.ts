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

// ── Sales Performance Report ──────────────────────────────────────

export interface SalesDepartmentSummary {
  department: string
  totalUnitsSold: number
  totalRevenue: number
  avgSellingPrice: number
}

export interface SalesCategorySummary {
  category: number
  department: string
  totalUnitsSold: number
  totalRevenue: number
  avgSellingPrice: number
}

export interface SalesDetail {
  skuId: string
  skuCode: string
  brand: string
  style: string
  color: string
  size: string
  department: string
  category: number
  totalUnitsSold: number
  totalRevenue: number
  avgSellingPrice: number
}

export interface SalesDepartmentResponse {
  startDate: string
  endDate: string
  departments: SalesDepartmentSummary[]
}

export interface SalesDrillDownResponse {
  startDate: string
  endDate: string
  department: string
  categories: SalesCategorySummary[]
  details: SalesDetail[]
}

export async function fetchSalesPerformanceByDepartment(
  startDate: string,
  endDate: string,
): Promise<SalesDepartmentResponse> {
  const params = new URLSearchParams({ startDate, endDate })
  const res = await fetch(`/api/v1/reports/sales-performance?${params}`)
  if (!res.ok) throw new Error(`Failed to fetch sales report: ${res.status}`)
  return res.json()
}

export async function fetchSalesPerformanceDrillDown(
  startDate: string,
  endDate: string,
  department: string,
  category?: number,
): Promise<SalesDrillDownResponse> {
  const params = new URLSearchParams({ startDate, endDate, department })
  if (category != null) params.set('category', String(category))
  const res = await fetch(`/api/v1/reports/sales-performance?${params}`)
  if (!res.ok) throw new Error(`Failed to fetch sales drill-down: ${res.status}`)
  return res.json()
}

export function getSalesPerformanceCsvUrl(
  startDate: string,
  endDate: string,
  department?: string,
  category?: number,
): string {
  const params = new URLSearchParams({ startDate, endDate, format: 'csv' })
  if (department) params.set('department', department)
  if (category != null) params.set('category', String(category))
  return `/api/v1/reports/sales-performance?${params}`
}

// ── Inventory Turnover Report ────────────────────────────────────

export interface DepartmentTurnover {
  department: string
  totalSkus: number
  totalCogs: number
  totalInventoryValue: number
  turnoverRatio: number
}

export interface CategoryTurnover {
  category: number
  department: string
  totalSkus: number
  totalCogs: number
  totalInventoryValue: number
  turnoverRatio: number
}

export interface TurnoverDetail {
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
  inventoryValue: number
  cogs: number
  turnoverRatio: number
}

export interface TurnoverDepartmentResponse {
  startDate: string | null
  endDate: string | null
  departments: DepartmentTurnover[]
}

export interface TurnoverDrillDownResponse {
  startDate: string | null
  endDate: string | null
  department: string
  categories: CategoryTurnover[]
  details: TurnoverDetail[]
}

export async function fetchTurnoverByDepartment(
  startDate?: string,
  endDate?: string,
): Promise<TurnoverDepartmentResponse> {
  const params = new URLSearchParams()
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  const qs = params.toString()
  const res = await fetch(`/api/v1/reports/inventory-turnover${qs ? '?' + qs : ''}`)
  if (!res.ok) throw new Error(`Failed to fetch turnover report: ${res.status}`)
  return res.json()
}

export async function fetchTurnoverDrillDown(
  department: string,
  startDate?: string,
  endDate?: string,
  category?: number,
): Promise<TurnoverDrillDownResponse> {
  const params = new URLSearchParams({ department })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  if (category != null) params.set('category', String(category))
  const res = await fetch(`/api/v1/reports/inventory-turnover?${params}`)
  if (!res.ok) throw new Error(`Failed to fetch turnover drill-down: ${res.status}`)
  return res.json()
}

export function getTurnoverCsvUrl(
  startDate?: string,
  endDate?: string,
  department?: string,
  category?: number,
): string {
  const params = new URLSearchParams({ format: 'csv' })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  if (department) params.set('department', department)
  if (category != null) params.set('category', String(category))
  return `/api/v1/reports/inventory-turnover?${params}`
}

// ── Sell-Through Analysis Report ────────────────────────────────

export interface SellThroughDepartmentSummary {
  department: string
  totalStyles: number
  totalUnitsSold: number
  totalUnitsReceived: number
  sellThroughPct: number
}

export interface SellThroughCategorySummary {
  category: number
  department: string
  totalStyles: number
  totalUnitsSold: number
  totalUnitsReceived: number
  sellThroughPct: number
}

export interface SellThroughDetail {
  skuId: string
  skuCode: string
  brand: string
  style: string
  color: string
  size: string
  price: number
  category: number
  department: string
  unitsSold: number
  unitsReceived: number
  sellThroughPct: number
}

export interface SellThroughDepartmentResponse {
  startDate: string | null
  endDate: string | null
  departments: SellThroughDepartmentSummary[]
}

export interface SellThroughDrillDownResponse {
  startDate: string | null
  endDate: string | null
  department: string
  categories: SellThroughCategorySummary[]
  details: SellThroughDetail[]
}

export async function fetchSellThroughByDepartment(
  startDate?: string,
  endDate?: string,
): Promise<SellThroughDepartmentResponse> {
  const params = new URLSearchParams()
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  const qs = params.toString()
  const res = await fetch(`/api/v1/reports/sell-through${qs ? '?' + qs : ''}`)
  if (!res.ok) throw new Error(`Failed to fetch sell-through report: ${res.status}`)
  return res.json()
}

export async function fetchSellThroughDrillDown(
  department: string,
  startDate?: string,
  endDate?: string,
  category?: number,
): Promise<SellThroughDrillDownResponse> {
  const params = new URLSearchParams({ department })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  if (category != null) params.set('category', String(category))
  const res = await fetch(`/api/v1/reports/sell-through?${params}`)
  if (!res.ok) throw new Error(`Failed to fetch sell-through drill-down: ${res.status}`)
  return res.json()
}

export function getSellThroughCsvUrl(
  startDate?: string,
  endDate?: string,
  department?: string,
  category?: number,
): string {
  const params = new URLSearchParams({ format: 'csv' })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  if (department) params.set('department', department)
  if (category != null) params.set('category', String(category))
  return `/api/v1/reports/sell-through?${params}`
}

// ── Inventory Aging Report ──────────────────────────────────────

export interface AgingBucket {
  bucket: string
  totalSkus: number
  totalUnits: number
  totalCostValue: number
}

export interface AgingDepartmentSummary {
  department: string
  buckets: AgingBucket[]
  totalSkus: number
  totalUnits: number
  totalCostValue: number
  flaggedUnits: number
  flaggedValue: number
}

export interface AgingDetail {
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
  daysOnHand: number
  agingBucket: string
  flagged: boolean
  lastReceivedAt: string | null
}

export interface AgingDepartmentResponse {
  departments: AgingDepartmentSummary[]
}

export interface AgingDrillDownResponse {
  department: string
  details: AgingDetail[]
}

export async function fetchAgingByDepartment(): Promise<AgingDepartmentResponse> {
  const res = await fetch('/api/v1/reports/inventory-aging')
  if (!res.ok) throw new Error(`Failed to fetch aging report: ${res.status}`)
  return res.json()
}

export async function fetchAgingDrillDown(
  department: string,
  category?: number,
): Promise<AgingDrillDownResponse> {
  const params = new URLSearchParams({ department })
  if (category != null) params.set('category', String(category))
  const res = await fetch(`/api/v1/reports/inventory-aging?${params}`)
  if (!res.ok) throw new Error(`Failed to fetch aging drill-down: ${res.status}`)
  return res.json()
}

export function getAgingCsvUrl(department?: string, category?: number): string {
  const params = new URLSearchParams({ format: 'csv' })
  if (department) params.set('department', department)
  if (category != null) params.set('category', String(category))
  return `/api/v1/reports/inventory-aging?${params}`
}

export function getOnHandCsvUrl(department?: string, category?: number): string {
  const params = new URLSearchParams({ format: 'csv' })
  if (department) params.set('department', department)
  if (category != null) params.set('category', String(category))
  return `/api/v1/reports/on-hand?${params}`
}
