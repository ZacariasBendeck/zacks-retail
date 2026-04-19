import type {
  CashTotals,
  Payout,
  PayoutCategory,
  Register,
  SalesTicket,
  SalesTicketLine,
  SalesTicketTender,
  Shift,
  Store,
  TenderType,
} from '../types/pos'

export class PosApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'PosApiError'
    this.status = status
    this.code = code
  }
}

async function send<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    let code: string | undefined
    let message = `Request failed: ${res.status}`
    try {
      const body = await res.json()
      if (body?.error?.code) code = body.error.code
      if (body?.error?.message) message = body.error.message
    } catch {
      /* ignore non-JSON bodies */
    }
    throw new PosApiError(message, res.status, code)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// --- Catalog ---------------------------------------------------------------

export function fetchStores(): Promise<{ stores: Store[] }> {
  return send('/api/v1/pos/stores')
}

export function fetchRegisters(storeId?: number): Promise<{ registers: Register[] }> {
  const q = storeId != null ? `?storeId=${storeId}` : ''
  return send(`/api/v1/pos/registers${q}`)
}

export function fetchTenderTypes(storeId: number): Promise<{ tenderTypes: TenderType[] }> {
  return send(`/api/v1/pos/stores/${storeId}/tender-types`)
}

export function fetchPayoutCategories(storeId: number): Promise<{ payoutCategories: PayoutCategory[] }> {
  return send(`/api/v1/pos/stores/${storeId}/payout-categories`)
}

// --- Shifts ---------------------------------------------------------------

export function fetchOpenShifts(storeId?: number): Promise<{ shifts: Shift[] }> {
  const q = storeId != null ? `?storeId=${storeId}` : ''
  return send(`/api/v1/shifts${q}`)
}

export function fetchShift(shiftId: string): Promise<Shift> {
  return send(`/api/v1/shifts/${shiftId}`)
}

export function openShift(payload: {
  storeId: number
  registerId: string
  openedByUserId: string
  openingCashFloat: number
  postingMode?: 'REALTIME' | 'BATCH'
}): Promise<Shift> {
  return send('/api/v1/shifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function fetchCashTotals(shiftId: string): Promise<CashTotals> {
  return send(`/api/v1/shifts/${shiftId}/cash-totals`)
}

export function closeShift(
  shiftId: string,
  payload: {
    closingCashCount: number
    closingDepositCount: number
    closedByUserId: string
    managerPassword?: string
  }
): Promise<Shift> {
  return send(`/api/v1/shifts/${shiftId}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function postShiftToInventory(
  shiftId: string,
  postedByUserId: string,
): Promise<Shift> {
  return send(`/api/v1/shifts/${shiftId}/post`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postedByUserId }),
  })
}

// --- Tickets --------------------------------------------------------------

export function createTicket(payload: {
  shiftId: string
  cashierUserId: string
  customerAccountId?: string
  promotionCode?: string
}): Promise<SalesTicket> {
  return send('/api/v1/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function fetchTicket(ticketId: string): Promise<SalesTicket> {
  return send(`/api/v1/tickets/${ticketId}`)
}

export function addLine(
  ticketId: string,
  payload: {
    /** RICS SKU code (preferred Phase-1 path). */
    skuCode?: string
    /** Admin-DB SKU id (UUID) for SKUs entered via the admin app. */
    skuId?: string
    quantity: number
    unitPrice?: number
    priceSlotUsed?: string
    comment?: string
  }
): Promise<SalesTicketLine> {
  return send(`/api/v1/tickets/${ticketId}/lines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function removeLine(ticketId: string, lineId: string): Promise<SalesTicket> {
  return send(`/api/v1/tickets/${ticketId}/lines/${lineId}`, {
    method: 'DELETE',
  })
}

export function addTender(
  ticketId: string,
  payload: { tenderTypeId: string; amount: number; accountNumber?: string }
): Promise<SalesTicketTender> {
  return send(`/api/v1/tickets/${ticketId}/tenders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function endTicket(ticketId: string): Promise<SalesTicket> {
  return send(`/api/v1/tickets/${ticketId}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
}

export function voidTicket(
  ticketId: string,
  payload: { actorUserId: string; reason?: string; password?: string }
): Promise<SalesTicket> {
  return send(`/api/v1/tickets/${ticketId}/void`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function reprintTicket(
  ticketId: string,
  payload: { actorUserId: string; giftReceipt?: boolean; channel?: 'PRINT' | 'PDF' | 'EMAIL' }
): Promise<SalesTicket> {
  return send(`/api/v1/tickets/${ticketId}/reprint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

// --- Payouts --------------------------------------------------------------

export function createPayout(payload: {
  shiftId: string
  cashierUserId: string
  categoryId: string
  amount: number
  note?: string
}): Promise<Payout> {
  return send('/api/v1/pay-outs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function fetchPayoutsForShift(shiftId: string): Promise<{ payouts: Payout[] }> {
  return send(`/api/v1/pay-outs?shiftId=${encodeURIComponent(shiftId)}`)
}

// --- Sales passwords (RICS p. 52) -----------------------------------------

export function fetchSalesPasswordStatus(
  storeId: number,
  kind: 'MANAGER' | 'TICKET',
): Promise<{ set: boolean; updatedAt: string | null }> {
  return send(`/api/v1/pos/stores/${storeId}/sales-passwords/${kind}/status`)
}

export function setSalesPassword(
  storeId: number,
  kind: 'MANAGER' | 'TICKET',
  plain: string,
  updatedByUserId: string,
): Promise<{ id: string; kind: string; updatedAt: string }> {
  return send(`/api/v1/pos/stores/${storeId}/sales-passwords/${kind}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plain, updatedByUserId }),
  })
}
