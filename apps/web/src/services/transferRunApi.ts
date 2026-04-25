import type {
  AutoTransferPreviewRecord,
  BalancingTransferPreviewRecord,
  CommitTransferRunResult,
  CreateAutoTransferRunPayload,
  CreateBalancingTransferRunPayload,
  TransferStoreOption,
} from '../types/transferRuns'

async function parseApiError(response: Response, fallback: string): Promise<Error> {
  const err = await response.json().catch(() => ({}))
  return new Error(err?.error?.message ?? err?.message ?? fallback)
}

export async function fetchTransferStores(): Promise<TransferStoreOption[]> {
  const res = await fetch('/api/v1/inventory/transfer-stores')
  if (!res.ok) {
    throw await parseApiError(res, `Failed to fetch transfer stores: ${res.status}`)
  }
  return res.json()
}

export async function createAutoTransferRun(
  payload: CreateAutoTransferRunPayload,
): Promise<AutoTransferPreviewRecord> {
  const res = await fetch('/api/v1/inventory/auto-transfer-runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw await parseApiError(res, `Failed to create automatic transfer preview: ${res.status}`)
  }
  return res.json()
}

export async function fetchAutoTransferRunPreview(id: string): Promise<AutoTransferPreviewRecord> {
  const res = await fetch(`/api/v1/inventory/auto-transfer-runs/${encodeURIComponent(id)}/preview`)
  if (!res.ok) {
    throw await parseApiError(res, `Failed to fetch automatic transfer preview: ${res.status}`)
  }
  return res.json()
}

export async function commitAutoTransferRun(id: string): Promise<CommitTransferRunResult> {
  const res = await fetch(`/api/v1/inventory/auto-transfer-runs/${encodeURIComponent(id)}/commit`, {
    method: 'POST',
  })
  if (!res.ok) {
    throw await parseApiError(res, `Failed to commit automatic transfers: ${res.status}`)
  }
  return res.json()
}

export async function createBalancingTransferRun(
  payload: CreateBalancingTransferRunPayload,
): Promise<BalancingTransferPreviewRecord> {
  const res = await fetch('/api/v1/inventory/balancing-transfer-runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw await parseApiError(res, `Failed to create balancing transfer preview: ${res.status}`)
  }
  return res.json()
}

export async function fetchBalancingTransferRunPreview(
  id: string,
): Promise<BalancingTransferPreviewRecord> {
  const res = await fetch(`/api/v1/inventory/balancing-transfer-runs/${encodeURIComponent(id)}/preview`)
  if (!res.ok) {
    throw await parseApiError(res, `Failed to fetch balancing transfer preview: ${res.status}`)
  }
  return res.json()
}

export async function commitBalancingTransferRun(id: string): Promise<CommitTransferRunResult> {
  const res = await fetch(`/api/v1/inventory/balancing-transfer-runs/${encodeURIComponent(id)}/commit`, {
    method: 'POST',
  })
  if (!res.ok) {
    throw await parseApiError(res, `Failed to commit balancing transfers: ${res.status}`)
  }
  return res.json()
}
