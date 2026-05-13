import { z } from 'zod';
import { reportTypeSchema } from '../../services/reports/reportTypes';

const MAX_PARAMS_BYTES = 64 * 1024; // 64 KB

const paramsJsonSchema = z
  .record(z.unknown())
  .refine((v) => !Array.isArray(v), { message: 'paramsJson must be an object, not an array' })
  .refine((v) => JSON.stringify(v).length <= MAX_PARAMS_BYTES, {
    message: `paramsJson exceeds ${MAX_PARAMS_BYTES} bytes`,
  });

export const visibilitySchema = z.enum(['private', 'shared']);
export type Visibility = z.infer<typeof visibilitySchema>;

export const createTemplateSchema = z.object({
  reportType: reportTypeSchema,
  title: z.string().trim().min(1).max(100),
  paramsJson: paramsJsonSchema,
  visibility: visibilitySchema.default('private'),
});
export type CreateTemplateBody = z.infer<typeof createTemplateSchema>;

// Partial update — owner may change any of title/paramsJson/visibility.
export const updateTemplateSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    paramsJson: paramsJsonSchema.optional(),
    visibility: visibilitySchema.optional(),
  })
  .refine((v) => v.title !== undefined || v.paramsJson !== undefined || v.visibility !== undefined, {
    message: 'At least one field must be provided',
  });
export type UpdateTemplateBody = z.infer<typeof updateTemplateSchema>;

export const listScopeSchema = z.enum(['mine', 'all']).default('mine');
export type ListScope = z.infer<typeof listScopeSchema>;

export const listTemplatesQuerySchema = z.object({
  scope: listScopeSchema,
  reportType: reportTypeSchema.optional(),
});
export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;

// ─────────────────────────── Report Runs (Snapshots) ─────────────────────
//
// Runs store the full result_json blob — much bigger than templates'
// paramsJson. Cap at 20 MB per plan §1.1 to keep list endpoints fast and
// snapshot storage bounded. Anything over this gets rejected with a clear
// error at the edge instead of silently truncating.

const MAX_RESULT_BYTES = 20 * 1024 * 1024; // 20 MB

const resultJsonSchema = z.unknown().refine(
  (v) => v !== undefined && v !== null && JSON.stringify(v).length <= MAX_RESULT_BYTES,
  { message: `resultJson must be present and ≤ ${MAX_RESULT_BYTES} bytes (20 MB)` },
);

export const createRunSchema = z.object({
  reportType: reportTypeSchema,
  title: z.string().trim().min(1).max(100).optional(),
  paramsJson: paramsJsonSchema,
  resultJson: resultJsonSchema,
  visibility: visibilitySchema.default('private'),
  sourceTemplateId: z.string().uuid().optional(),
});
export type CreateRunBody = z.infer<typeof createRunSchema>;

// Only title + visibility can be patched — paramsJson / resultJson are
// intentionally frozen after capture (that's the point of a snapshot).
export const updateRunSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    visibility: visibilitySchema.optional(),
  })
  .refine((v) => v.title !== undefined || v.visibility !== undefined, {
    message: 'At least one of title or visibility must be provided',
  });
export type UpdateRunBody = z.infer<typeof updateRunSchema>;

// `limit` defaults to 50 (matches the Phase 1.1 spec). Paging via offset
// allows covering results beyond the page size.
export const listRunsQuerySchema = z.object({
  scope: listScopeSchema,
  reportType: reportTypeSchema.optional(),
  sourceTemplateId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListRunsQuery = z.infer<typeof listRunsQuerySchema>;
