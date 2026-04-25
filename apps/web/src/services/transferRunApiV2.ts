import type {
  BalancingTransferPreviewRecordV2,
  CommitTransferRunV2Result,
  CreateBalancingTransferRunV2Payload,
} from '../types/transferRunsV2'

async function parseApiError(response: Response, fallback: string): Promise<Error> {
  const err = await response.json().catch(() => ({}))
  return new Error(err?.error?.message ?? err?.message ?? fallback)
}

export async function createBalancingTransferRunV2(
  payload: CreateBalancingTransferRunV2Payload,
): Promise<BalancingTransferPreviewRecordV2> {
  const res = await fetch('/api/v1/inventory/balancing-transfer-runs-v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw await parseApiError(res, `Failed to create balancing transfer v2 preview: ${res.status}`)
  }
  return res.json()
}

export async function fetchBalancingTransferRunPreviewV2(
  id: string,
): Promise<BalancingTransferPreviewRecordV2> {
  const res = await fetch(`/api/v1/inventory/balancing-transfer-runs-v2/${encodeURIComponent(id)}/preview`)
  if (!res.ok) {
    throw await parseApiError(res, `Failed to fetch balancing transfer v2 preview: ${res.status}`)
  }
  return res.json()
}

export async function commitBalancingTransferRunV2(id: string): Promise<CommitTransferRunV2Result> {
  const res = await fetch(`/api/v1/inventory/balancing-transfer-runs-v2/${encodeURIComponent(id)}/commit`, {
    method: 'POST',
  })
  if (!res.ok) {
    throw await parseApiError(res, `Failed to commit balancing transfer v2: ${res.status}`)
  }
  return res.json()
}
