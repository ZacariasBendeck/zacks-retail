import type { OtbEntryMethod } from '../types/otbPlanRow'

const BASE = '/api/v1/company-settings'

export async function fetchOtbEntryMethod(): Promise<OtbEntryMethod> {
  const res = await fetch(`${BASE}/otb-entry-method`)
  if (!res.ok) throw new Error('FETCH_OTB_ENTRY_METHOD_FAILED')
  const body = await res.json()
  return body.value as OtbEntryMethod
}

export async function setOtbEntryMethod(value: OtbEntryMethod, changedBy?: string): Promise<OtbEntryMethod> {
  const res = await fetch(`${BASE}/otb-entry-method`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value, changedBy }),
  })
  if (!res.ok) throw new Error('SET_OTB_ENTRY_METHOD_FAILED')
  const body = await res.json()
  return body.value as OtbEntryMethod
}
