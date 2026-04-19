import type { Department } from './sku'
import type { PaginationEnvelope } from './sku'

export type SalesChannel = 'STORE' | 'ONLINE' | 'WHOLESALE'

export interface SalesLedgerRow {
  id: string
  saleDate: string
  skuCode: string
  style: string
  department: Department
  category: number
  channel: SalesChannel
  unitsSold: number
  netRevenue: number
}

export interface SalesLedgerParams {
  page?: number
  pageSize?: number
  department?: Department
  category?: number
  channel?: SalesChannel
  skuCode?: string
  style?: string
  startDate?: string
  endDate?: string
  sort?: string
  order?: 'asc' | 'desc'
}

export type SalesLedgerResponse = PaginationEnvelope<SalesLedgerRow>
