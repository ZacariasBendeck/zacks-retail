export type ChurnRisk = 'LOW' | 'MEDIUM' | 'HIGH'
export type CustomerStoreChainKey = 'unlimited' | 'magic_shoes' | 'la_femme' | 'online' | 'other'

export type CustomerKpiSegment =
  | 'vip'
  | 'loyal'
  | 'at_risk'
  | 'dormant'
  | 'promo_sensitive'
  | 'omnichannel'
  | 'new'
  | 'lost'
  | 'other'

export interface CustomerMetrics {
  customerId: string
  dataSource: 'transaction_fact' | 'legacy_sales_summary' | 'none'
  lifetimeValue: number
  totalOrders: number
  avgOrderValue: number
  marginValue: number
  orders30d: number
  orders90d: number
  orders365d: number
  avgDaysBetweenOrders: number | null
  lastPurchaseDate: string | null
  recencyDays: number | null
  isActive: boolean
  discountRatio: number | null
  primaryStoreId: string | null
  storeLoyaltyRatio: number | null
  onlineRatio: number | null
  churnRisk: ChurnRisk | null
  isDormant: boolean
  rScore: number | null
  fScore: number | null
  mScore: number | null
  updatedAt: string | null
}

export interface CustomerMetricsSummary {
  totalCustomers: number
  activeCustomers: number
  dormantCustomers: number
  avgLifetimeValue: number
  highChurnRisk: number
  churnDistribution: {
    low: number
    medium: number
    high: number
    unknown: number
  }
  channelDistribution: {
    storeOnly: number
    onlineOnly: number
    omnichannel: number
    unknown: number
  }
  ltvDistribution: Array<{ band: string; count: number }>
  rfmDistribution: Array<{ segment: string; count: number }>
}

export interface CustomerKpiListRow {
  customerId: string
  accountNumber: string | null
  displayName: string
  email: string | null
  phone: string | null
  primaryStoreId: string | null
  primaryStoreName: string | null
  primaryStoreCity: string | null
  primaryStoreChain: string | null
  lifetimeValue: number
  totalOrders: number
  avgOrderValue: number
  marginValue: number
  orders30d: number
  orders90d: number
  orders365d: number
  avgDaysBetweenOrders: number | null
  lastPurchaseDate: string | null
  recencyDays: number | null
  isActive: boolean
  isDormant: boolean
  discountRatio: number | null
  storeLoyaltyRatio: number | null
  onlineRatio: number | null
  churnRisk: ChurnRisk | null
  rScore: number | null
  fScore: number | null
  mScore: number | null
  segment: CustomerKpiSegment
}

export interface CustomerKpiListParams {
  page?: number
  pageSize?: number
  q?: string
  churnRisk?: ChurnRisk
  segment?: Exclude<CustomerKpiSegment, 'other'>
  channel?: 'store' | 'online' | 'omnichannel'
  minLtv?: number
  maxLtv?: number
  minRecency?: number
  maxRecency?: number
  minDiscountRatio?: number
  primaryStoreId?: string
  primaryStoreCity?: string
  primaryStoreChain?: CustomerStoreChainKey
  active?: boolean
  dormant?: boolean
  sort?:
    | 'lifetimeValue'
    | 'totalOrders'
    | 'avgOrderValue'
    | 'recencyDays'
    | 'discountRatio'
    | 'lastPurchaseDate'
    | 'displayName'
  order?: 'asc' | 'desc'
}

export interface CustomerKpiListEnvelope {
  data: CustomerKpiListRow[]
  summary: {
    customerCount: number
    totalLifetimeValue: number
    totalOrders: number
    avgLifetimeValue: number
    avgOrderValue: number
    avgRecencyDays: number | null
  }
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

export interface RecommendedAction {
  type:
    | 'VIP_RETENTION'
    | 'WIN_BACK'
    | 'CONTROLLED_DISCOUNT'
    | 'NEW_CUSTOMER_NURTURE'
    | 'STEADY_LOYAL'
    | 'INACTIVE_OUTREACH'
    | 'NEUTRAL'
  title: string
  message: string
  tone: 'positive' | 'warning' | 'neutral'
}

export interface CustomerKpiFilterOption {
  key: string
  label: string
  customerCount: number
}

export interface CustomerKpiStoreFilterOption {
  storeId: string
  storeName: string
  city: string | null
  chainKey: CustomerStoreChainKey
  chainLabel: string
  customerCount: number
}

export interface CustomerKpiFilterOptions {
  chains: Array<CustomerKpiFilterOption & { key: CustomerStoreChainKey }>
  cities: CustomerKpiFilterOption[]
  stores: CustomerKpiStoreFilterOption[]
}
