import type {
  CreateOtbPlanRowPayload,
  OtbPlanRow,
  OtbPlanRowAudit,
  OtbPlanRowListParams,
  OtbPlanRowListResult,
  UpdateOtbPlanRowPayload,
} from '../types/otbPlanRow'

const BASE = '/api/v1/otb/plan-rows'

async function assertOk(res: Response, fallback: string): Promise<void> {
  if (res.ok) return
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; detail?: { code?: string } } }
  const msg = body?.error?.detail?.code ?? body?.error?.code ?? fallback
  throw new Error(msg)
}

export async function fetchOtbPlanRows(params: OtbPlanRowListParams): Promise<OtbPlanRowListResult> {
  const qs = new URLSearchParams()
  if (params.page !== undefined) qs.set('page', String(params.page))
  if (params.pageSize !== undefined) qs.set('pageSize', String(params.pageSize))
  if (params.storeId) qs.set('storeId', params.storeId)
  if (params.categoryId) qs.set('categoryId', params.categoryId)
  if (params.fiscalYear !== undefined) qs.set('fiscalYear', String(params.fiscalYear))
  const res = await fetch(`${BASE}?${qs.toString()}`)
  await assertOk(res, 'FETCH_FAILED')
  return res.json()
}

export async function fetchOtbPlanRow(id: string): Promise<OtbPlanRow> {
  const res = await fetch(`${BASE}/${id}`)
  await assertOk(res, 'NOT_FOUND')
  return res.json()
}

export async function createOtbPlanRow(payload: CreateOtbPlanRowPayload): Promise<OtbPlanRow> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  await assertOk(res, 'CREATE_FAILED')
  return res.json()
}

export async function updateOtbPlanRow(id: string, payload: UpdateOtbPlanRowPayload): Promise<OtbPlanRow> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  await assertOk(res, 'UPDATE_FAILED')
  return res.json()
}

export async function deleteOtbPlanRow(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  await assertOk(res, 'DELETE_FAILED')
}

export async function recalculateOtbPlanRow(id: string, changedBy?: string): Promise<OtbPlanRow> {
  const res = await fetch(`${BASE}/${id}/recalculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changedBy }),
  })
  await assertOk(res, 'RECALCULATE_FAILED')
  return res.json()
}

export async function copyOtbPlanRow(id: string, targetStoreId: string, targetCategoryId: string, changedBy?: string): Promise<OtbPlanRow> {
  const res = await fetch(`${BASE}/${id}/copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetStoreId, targetCategoryId, changedBy }),
  })
  await assertOk(res, 'COPY_FAILED')
  return res.json()
}

export async function fetchOtbPlanRowAudit(id: string): Promise<OtbPlanRowAudit[]> {
  const res = await fetch(`${BASE}/${id}/audit`)
  await assertOk(res, 'AUDIT_FETCH_FAILED')
  return res.json()
}
