import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  reportRunsApi,
  type CreateRunInput,
  type ReportType,
  type RunListScope,
  type UpdateRunInput,
} from '../services/reportRunsApi'

const STALE_MS = 60 * 1000

function invalidateRuns(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['report-runs'] })
}

export function useReportRunsList(
  scope: RunListScope,
  opts?: {
    reportType?: ReportType
    sourceTemplateId?: string
    limit?: number
    offset?: number
  },
) {
  return useQuery({
    queryKey: [
      'report-runs',
      'list',
      scope,
      opts?.reportType ?? null,
      opts?.sourceTemplateId ?? null,
      opts?.limit ?? 50,
      opts?.offset ?? 0,
    ],
    queryFn: () =>
      reportRunsApi.list({
        scope,
        reportType: opts?.reportType,
        sourceTemplateId: opts?.sourceTemplateId,
        limit: opts?.limit,
        offset: opts?.offset,
      }),
    staleTime: STALE_MS,
  })
}

export function useReportRun(id: string | undefined) {
  return useQuery({
    queryKey: ['report-runs', 'one', id],
    queryFn: () => reportRunsApi.get(id!),
    enabled: !!id,
    // Snapshots are immutable — once fetched we can lean on cache aggressively.
    // The PATCH mutation below invalidates this key for the one row being
    // edited, so title/visibility edits still round-trip cleanly.
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateReportRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRunInput) => reportRunsApi.create(input),
    onSuccess: () => invalidateRuns(qc),
  })
}

export function useUpdateReportRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateRunInput }) =>
      reportRunsApi.update(id, patch),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['report-runs', 'one', vars.id] })
      invalidateRuns(qc)
    },
  })
}

export function useDeleteReportRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => reportRunsApi.delete(id),
    onSuccess: () => invalidateRuns(qc),
  })
}
