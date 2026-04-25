/**
 * Narrow helpers for surfacing the specific Prisma error codes that taxonomy
 * repositories care about as typed RepoErrors.
 *
 * We intentionally do not catch arbitrary exceptions here — connection loss,
 * SQL syntax errors, and other bugs should bubble up to the Express error
 * handler as 500s. The two codes recognized below map to user-visible 409 /
 * 404 responses respectively, so they need the typed Result treatment.
 */

import type { RepoError } from './repoResult';

export interface PrismaLikeError {
  code?: string;
  message?: string;
}

function asPrismaError(err: unknown): PrismaLikeError | null {
  if (err == null || typeof err !== 'object') return null;
  const candidate = err as PrismaLikeError;
  if (typeof candidate.code !== 'string') return null;
  return candidate;
}

/** True when the caught error is a Prisma P2002 (unique-constraint violation). */
export function isUniqueViolation(err: unknown): boolean {
  return asPrismaError(err)?.code === 'P2002';
}

/** True when the caught error is a Prisma P2025 (row not found during update/delete). */
export function isRecordNotFound(err: unknown): boolean {
  return asPrismaError(err)?.code === 'P2025';
}

export function duplicatePrimaryKey(message: string): RepoError {
  return { kind: 'DuplicatePrimaryKey', message };
}

export function notFound(message: string): RepoError {
  return { kind: 'NotFound', message };
}
