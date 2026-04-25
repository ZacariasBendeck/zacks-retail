import type {
  CustomerSearchResult,
  PosBootstrap,
  PosClosePreview,
  PosProductLookup,
  PosReceipt,
  PosShift,
  PosTicket,
  PosTicketListItem,
} from '../types/salesPos'

const POS_API_BASE = '/api/v1/pos'
const EMPLOYEE_API_BASE = '/api/v1/employees'
const CUSTOMER_API_BASE = '/api/v1/customers'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText, code: 'HTTP_ERROR' } }))
    const error = new Error(body?.error?.message ?? `HTTP ${res.status}`) as Error & { code?: string }
    error.code = body?.error?.code
    throw error
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export interface PosBootstrapParams {
  storeId?: number
  registerCode?: string
}

export interface PosTenderInput {
  tenderTypeId: string
  amount: number
  accountNumber?: string | null
  reference?: string | null
}

export interface PosLineInput {
  code: string
  quantity?: number
  columnLabel?: string
  rowLabel?: string
  unitPrice?: number
  priceMode?: 'RETAIL' | 'MARKDOWN1' | 'MARKDOWN2' | 'LIST' | 'MANUAL'
  discountPct?: number | null
  discountAmount?: number | null
  taxable?: boolean
  secondaryTaxRate?: number
  salespersonUserId?: string | null
  salespersonCode?: string | null
  salespersonName?: string | null
  familyMemberId?: string | null
  returnCode?: number | null
  comment?: string | null
}

export interface PosLinePatch extends Omit<PosLineInput, 'code'> {}

export interface PosHeaderPatchInput {
  cashierUserId?: string
  cashierName?: string | null
  customerId?: string | null
  customerAccountNumber?: string | null
  customerName?: string | null
  headerDiscountPct?: number | null
  promotionCode?: string | null
  shipToState?: string | null
  transactionType?: string
  comment?: string | null
  otherCharges?: number
}

export interface PosVerifyPinInput {
  pin: string
  scope: 'VOID' | 'REFUND' | 'REPRINT' | 'CLOSE_BATCH' | 'PAY_OUT'
  ticketId?: string
  action?: string
}

export const salesPosApi = {
  getBootstrap: async (params: PosBootstrapParams = {}): Promise<PosBootstrap> => {
    const search = new URLSearchParams()
    if (params.storeId) search.set('storeId', String(params.storeId))
    if (params.registerCode) search.set('registerCode', params.registerCode)
    const suffix = search.size > 0 ? `?${search.toString()}` : ''
    return request<PosBootstrap>(`${POS_API_BASE}/bootstrap${suffix}`)
  },

  lookupProduct: (code: string) =>
    request<PosProductLookup>(`${POS_API_BASE}/catalog/lookup?code=${encodeURIComponent(code)}`),

  openShift: (input: { storeId: number; registerCode?: string; openingCashFloat?: number }) =>
    request<PosBootstrap>(`${POS_API_BASE}/shifts/open`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getClosePreview: (shiftId: string) =>
    request<PosClosePreview>(`${POS_API_BASE}/shifts/${shiftId}/close-preview`),

  closeShift: (shiftId: string, input: { actualCashTotal: number; notes?: string | null; countedTenders?: Array<{ tenderTypeId: string; amount: number }>; overrideToken?: string }) =>
    request<{ shift: PosShift }>(`${POS_API_BASE}/shifts/${shiftId}/close`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getTicket: (ticketId: string) =>
    request<{ ticket: PosTicket }>(`${POS_API_BASE}/tickets/${ticketId}`),

  patchHeader: (ticketId: string, patch: PosHeaderPatchInput) =>
    request<{ ticket: PosTicket }>(`${POS_API_BASE}/tickets/${ticketId}/header`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  addLine: (ticketId: string, input: PosLineInput) =>
    request<{ ticket: PosTicket }>(`${POS_API_BASE}/tickets/${ticketId}/lines`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateLine: (ticketId: string, lineId: string, patch: PosLinePatch) =>
    request<{ ticket: PosTicket }>(`${POS_API_BASE}/tickets/${ticketId}/lines/${lineId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  rotateLinePrice: (ticketId: string, lineId: string) =>
    request<{ ticket: PosTicket }>(`${POS_API_BASE}/tickets/${ticketId}/lines/${lineId}/rotate-price`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  removeLine: (ticketId: string, lineId: string) =>
    request<{ ticket: PosTicket }>(`${POS_API_BASE}/tickets/${ticketId}/lines/${lineId}`, {
      method: 'DELETE',
    }),

  voidTicket: (ticketId: string, overrideToken?: string) =>
    request<{ ticket: PosTicket }>(`${POS_API_BASE}/tickets/${ticketId}/void`, {
      method: 'POST',
      body: JSON.stringify({ overrideToken }),
    }),

  completeTicket: (ticketId: string, input: { tenders: PosTenderInput[]; comment?: string | null; promotionCode?: string | null; otherCharges?: number; overrideToken?: string }) =>
    request<{ ticket: PosTicket; receipt: PosReceipt; nextTicket: PosTicket }>(`${POS_API_BASE}/tickets/${ticketId}/complete`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getReclaimableTickets: (shiftId: string) =>
    request<{ tickets: PosTicketListItem[] }>(`${POS_API_BASE}/shifts/${shiftId}/reclaimable-tickets`),

  reclaimTicket: (ticketId: string) =>
    request<{ ticket: PosTicket }>(`${POS_API_BASE}/tickets/${ticketId}/reclaim`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getCompletedTickets: (shiftId: string) =>
    request<{ tickets: PosTicketListItem[] }>(`${POS_API_BASE}/shifts/${shiftId}/completed-tickets`),

  reprintTicket: (ticketId: string, overrideToken?: string) =>
    request<{ ticket: PosTicket; receipt: PosReceipt }>(`${POS_API_BASE}/tickets/${ticketId}/reprint`, {
      method: 'POST',
      body: JSON.stringify({ overrideToken }),
    }),

  createPayout: (input: { shiftId: string; categoryId: string; amount: number; note?: string | null; overrideToken?: string }) =>
    request<{ payout: { id: string; amount: number; categoryLabel: string; createdAt: string }; closePreview: PosClosePreview }>(`${POS_API_BASE}/payouts`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  verifySalesPin: (input: PosVerifyPinInput) =>
    request<{ overrideToken: string; expiresAt: string }>(`${EMPLOYEE_API_BASE}/sales-passwords/verify`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  searchCustomers: async (q: string): Promise<CustomerSearchResult[]> => {
    if (!q.trim()) return []
    const body = await request<{ data: CustomerSearchResult[] }>(`${CUSTOMER_API_BASE}/search?q=${encodeURIComponent(q)}&limit=8`)
    return body.data
  },
}
