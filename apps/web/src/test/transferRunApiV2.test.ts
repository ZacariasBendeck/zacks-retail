import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  commitBalancingTransferRunV2,
  createBalancingTransferRunV2,
  fetchBalancingTransferRunPreviewV2,
} from '../services/transferRunApiV2'
import type { CreateBalancingTransferRunV2Payload } from '../types/transferRunsV2'

function buildOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response
}

describe('transferRunApiV2 contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('creates v2 previews through the dedicated v2 endpoint', async () => {
    const payload: CreateBalancingTransferRunV2Payload = {
      goalPreset: 'WEEKLY_BALANCE',
      balancingMethod: 'WITHOUT_CONSIDERING_MODELS',
      performanceMetric: 'ROI',
      salesPeriod: 'YEAR',
      tieBreakKind: 'PERCENT',
      tieBreakValue: 25,
    }
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ id: 'run-v2-1' }))

    await createBalancingTransferRunV2(payload)

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/inventory/balancing-transfer-runs-v2',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )
  })

  it('loads v2 previews from the dedicated preview endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ id: 'run-v2-2' }))

    await fetchBalancingTransferRunPreviewV2('run-v2-2')

    expect(fetch).toHaveBeenCalledWith('/api/v1/inventory/balancing-transfer-runs-v2/run-v2-2/preview')
  })

  it('commits v2 previews through the dedicated commit endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(buildOkResponse({ status: 'COMMITTED' }))

    await commitBalancingTransferRunV2('run-v2-3')

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/inventory/balancing-transfer-runs-v2/run-v2-3/commit',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })
})
