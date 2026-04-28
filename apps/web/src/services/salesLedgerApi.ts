import type { SalesLedgerParams, SalesLedgerResponse } from '../types/salesLedger'

export async function fetchSalesLedger(params: SalesLedgerParams): Promise<SalesLedgerResponse> {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') searchParams.set(key, String(value))
  }
  const res = await fetch(`/api/v1/sales/ledger?${searchParams}`)
  if (!res.ok) throw new Error(`Failed to fetch sales ledger: ${res.status}`)
  return res.json()
}
