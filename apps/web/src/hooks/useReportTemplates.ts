import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  reportTemplatesApi,
  type CreateTemplateInput,
  type ReportType,
  type TemplateListScope,
  type UpdateTemplateInput,
} from '../services/reportTemplatesApi'

const STALE_MS = 60 * 1000 // templates list refreshes cheaply

function invalidateTemplates(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['report-templates'] })
}

export function useReportTemplatesList(
  scope: TemplateListScope,
  reportType?: ReportType,
) {
  return useQuery({
    queryKey: ['report-templates', 'list', scope, reportType ?? null],
    queryFn: () => reportTemplatesApi.list({ scope, reportType }),
    staleTime: STALE_MS,
  })
}

export function useReportTemplate(id: string | undefined) {
  return useQuery({
    queryKey: ['report-templates', 'one', id],
    queryFn: () => reportTemplatesApi.get(id!),
    enabled: !!id,
    staleTime: STALE_MS,
  })
}

export function useCreateReportTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTemplateInput) => reportTemplatesApi.create(input),
    onSuccess: () => invalidateTemplates(qc),
  })
}

export function useUpdateReportTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTemplateInput }) =>
      reportTemplatesApi.update(id, patch),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['report-templates', 'one', vars.id] })
      invalidateTemplates(qc)
    },
  })
}

export function useDeleteReportTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => reportTemplatesApi.delete(id),
    onSuccess: () => invalidateTemplates(qc),
  })
}

// Fire-and-forget lastUsedAt bump. Not awaited by the caller — if it fails we
// just log and move on.
export function useTouchReportTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => reportTemplatesApi.touch(id),
    onSuccess: () => invalidateTemplates(qc),
  })
}
