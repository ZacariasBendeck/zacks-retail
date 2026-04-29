export interface RicsSalesperson {
  id: string
  salespersonCode: string
  displayName: string
  active: boolean
  otherInformation: string | null
  commissionRate: number | null
  commissionBase: 'NET_SALES' | 'GROSS_PROFIT'
  ricsCommissionMethod: string | null
  timeClockEnabled: boolean
  timeClockAdmin: boolean
  timeClockFullUser: boolean
  hasTimeClockPin: boolean
  hasLegacyCashierPin: boolean
  ricsSalespersonChangedAt: string | null
  ricsSalespersonImportedAt: string | null
}

export type RicsSalespersonCreate = Pick<
  RicsSalesperson,
  | 'salespersonCode'
  | 'displayName'
  | 'active'
  | 'otherInformation'
  | 'commissionRate'
  | 'commissionBase'
  | 'timeClockEnabled'
  | 'timeClockAdmin'
  | 'timeClockFullUser'
>

export type RicsSalespersonPatch = Partial<Pick<
  RicsSalesperson,
  | 'displayName'
  | 'active'
  | 'otherInformation'
  | 'commissionRate'
  | 'commissionBase'
  | 'timeClockEnabled'
  | 'timeClockAdmin'
  | 'timeClockFullUser'
>>

async function parseEmployeeResponse(res: Response): Promise<{ salesperson: RicsSalesperson }> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message = body?.error?.message || `Employee request failed: ${res.status}`
    throw new Error(message)
  }
  return res.json()
}

async function parseSalespeopleResponse(res: Response): Promise<{ salespeople: RicsSalesperson[] }> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message = body?.error?.message || `Employee request failed: ${res.status}`
    throw new Error(message)
  }
  return res.json()
}

export async function fetchRicsSalespeople(): Promise<RicsSalesperson[]> {
  const res = await fetch('/api/v1/employees/salespeople')
  const body = await parseSalespeopleResponse(res)
  return body.salespeople
}

export async function createRicsSalesperson(input: RicsSalespersonCreate): Promise<RicsSalesperson> {
  const res = await fetch('/api/v1/employees/salespeople', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await parseEmployeeResponse(res)
  return body.salesperson
}

export async function fetchRicsSalesperson(code: string): Promise<RicsSalesperson> {
  const res = await fetch(`/api/v1/employees/salespeople/${encodeURIComponent(code)}`)
  const body = await parseEmployeeResponse(res)
  return body.salesperson
}

export async function updateRicsSalesperson(
  code: string,
  patch: RicsSalespersonPatch,
): Promise<RicsSalesperson> {
  const res = await fetch(`/api/v1/employees/salespeople/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const body = await parseEmployeeResponse(res)
  return body.salesperson
}

export async function deleteRicsSalesperson(code: string): Promise<void> {
  const res = await fetch(`/api/v1/employees/salespeople/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message = body?.error?.message || `Employee request failed: ${res.status}`
    throw new Error(message)
  }
}
