import type { PaginationEnvelope } from './sku'

export type SalesChannel = 'STORE' | 'ONLINE' | 'WHOLESALE'

export interface SalesLedgerRow {
  id: string
  saleDate: string
  storeId: number | null
  storeName: string | null
  storeLabel: string
  skuCode: string
  style: string
  department: string
  category: number | null
  channel: SalesChannel
  unitsSold: number
  netRevenue: number
}

export interface SalesLedgerParams {
  page?: number
  pageSize?: number
  storeId?: number
  department?: string
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
