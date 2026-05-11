import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  manualReportQueryKey,
  useManualReportRun,
  type ManualReportRun,
} from '../hooks/useManualReportRun'

interface TestArgs {
  label: string
}

const STORAGE_KEY = 'manual-report-run:test:v1'
const QUERY_KEY_BASE = 'manual-test-report'

function renderHarness({
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  onHydrate = vi.fn(),
}: {
  client?: QueryClient
  onHydrate?: (args: TestArgs) => void
} = {}) {
  function Harness() {
    const { run, query, commitRun } = useManualReportRun<TestArgs>({
      storageKey: STORAGE_KEY,
      queryKeyBase: QUERY_KEY_BASE,
      hydrateArgs: onHydrate,
    })

    return (
      <div>
        <div data-testid="query-label">{query?.label ?? 'none'}</div>
        <div data-testid="run-id">{run?.runId ?? 'none'}</div>
        <button type="button" onClick={() => commitRun({ label: 'alpha' })}>
          Run alpha
        </button>
      </div>
    )
  }

  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    ),
  }
}

describe('useManualReportRun', () => {
  afterEach(() => {
    window.sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('stores committed args and creates a run id', () => {
    renderHarness()

    fireEvent.click(screen.getByRole('button', { name: /Run alpha/i }))

    expect(screen.getByTestId('query-label')).toHaveTextContent('alpha')
    expect(screen.getByTestId('run-id')).not.toHaveTextContent('none')
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '{}') as ManualReportRun<TestArgs>
    expect(stored.args).toEqual({ label: 'alpha' })
    expect(typeof stored.runId).toBe('string')
  })

  it('restores a stored run only when the matching query result is still cached', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const stored: ManualReportRun<TestArgs> = { args: { label: 'cached' }, runId: 'run-cached' }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    client.setQueryData(manualReportQueryKey(QUERY_KEY_BASE, stored), { rows: [] })
    const onHydrate = vi.fn()

    renderHarness({ client, onHydrate })

    expect(screen.getByTestId('query-label')).toHaveTextContent('cached')
    expect(screen.getByTestId('run-id')).toHaveTextContent('run-cached')
    expect(onHydrate).toHaveBeenCalledWith({ label: 'cached' })
  })

  it('hydrates form args but does not restore the run when cached data is gone', () => {
    const stored: ManualReportRun<TestArgs> = { args: { label: 'stale' }, runId: 'run-stale' }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    const onHydrate = vi.fn()

    renderHarness({ onHydrate })

    expect(screen.getByTestId('query-label')).toHaveTextContent('none')
    expect(screen.getByTestId('run-id')).toHaveTextContent('none')
    expect(onHydrate).toHaveBeenCalledWith({ label: 'stale' })
  })

  it('creates a new run id for every explicit run', () => {
    renderHarness()

    fireEvent.click(screen.getByRole('button', { name: /Run alpha/i }))
    const firstRunId = screen.getByTestId('run-id').textContent
    fireEvent.click(screen.getByRole('button', { name: /Run alpha/i }))

    expect(screen.getByTestId('run-id').textContent).not.toBe(firstRunId)
  })
})
