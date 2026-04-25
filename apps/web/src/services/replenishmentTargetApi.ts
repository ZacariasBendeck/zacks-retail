import type {
  ReplenishmentTargetRecord,
  UpdateReplenishmentTargetPayload,
} from '../types/replenishmentTarget'

async function parseApiError(response: Response, fallback: string): Promise<Error> {
  const err = await response.json().catch(() => ({}))
  return new Error(err?.error?.message ?? err?.message ?? fallback)
}

export async function fetchReplenishmentTarget(skuCode: string): Promise<ReplenishmentTargetRecord> {
  const res = await fetch(`/api/v1/inventory/replenishment-targets/${encodeURIComponent(skuCode)}`)
  if (!res.ok) {
    throw await parseApiError(res, `Failed to fetch replenishment target: ${res.status}`)
  }
  return res.json()
}

export async function updateReplenishmentTargetStore(
  skuCode: string,
  storeId: number,
  payload: UpdateReplenishmentTargetPayload,
): Promise<ReplenishmentTargetRecord> {
  const res = await fetch(
    `/api/v1/inventory/replenishment-targets/${encodeURIComponent(skuCode)}/${storeId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  if (!res.ok) {
    throw await parseApiError(res, `Failed to update replenishment targets: ${res.status}`)
  }
  return res.json()
}
