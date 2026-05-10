import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'

export const MANUAL_REPORT_GC_TIME_MS = 30 * 60 * 1000

export interface ManualReportRun<TArgs> {
  args: TArgs
  runId: string
}

export const manualReportQueryOptions = {
  staleTime: Infinity,
  gcTime: MANUAL_REPORT_GC_TIME_MS,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const

export function manualReportQueryKey<TArgs>(
  baseKey: string,
  run: ManualReportRun<TArgs> | null,
): readonly [string, string | null, TArgs | null] {
  return [baseKey, run?.runId ?? null, run?.args ?? null]
}

function createManualReportRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function readStoredRun<TArgs>(storageKey: string): ManualReportRun<TArgs> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ManualReportRun<TArgs>>
    if (!parsed || typeof parsed.runId !== 'string' || parsed.args == null) return null
    return { runId: parsed.runId, args: parsed.args as TArgs }
  } catch {
    return null
  }
}

function writeStoredRun<TArgs>(storageKey: string, run: ManualReportRun<TArgs>): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(run))
  } catch {
    // Disabled storage or quota errors should not block report execution.
  }
}

function hasCachedReportResult<TArgs>(
  queryClient: QueryClient,
  queryKeyBase: string,
  run: ManualReportRun<TArgs>,
): boolean {
  return queryClient.getQueryData(manualReportQueryKey(queryKeyBase, run)) !== undefined
}

export function useManualReportRun<TArgs>({
  storageKey,
  queryKeyBase,
  hydrateArgs,
}: {
  storageKey: string
  queryKeyBase: string
  hydrateArgs?: (args: TArgs) => void
}) {
  const queryClient = useQueryClient()
  const storedRunRef = useRef<ManualReportRun<TArgs> | null>(readStoredRun<TArgs>(storageKey))
  const [run, setRun] = useState<ManualReportRun<TArgs> | null>(() => {
    const stored = storedRunRef.current
    if (!stored) return null
    return hasCachedReportResult(queryClient, queryKeyBase, stored) ? stored : null
  })
  const hydratedRef = useRef(false)

  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    const stored = storedRunRef.current
    if (stored) hydrateArgs?.(stored.args)
  }, [hydrateArgs])

  const commitRun = useCallback((args: TArgs): ManualReportRun<TArgs> => {
    const next = { args, runId: createManualReportRunId() }
    setRun(next)
    writeStoredRun(storageKey, next)
    return next
  }, [storageKey])

  return {
    run,
    query: run?.args ?? null,
    commitRun,
  }
}
