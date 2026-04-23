/**
 * Shared Result type and RepoError variants for the RICS Access repositories.
 *
 * Repositories never throw for expected failure modes (missing row, duplicate
 * primary key, constraint violation, Access connection failure). They return
 * `Err(...)` with a typed variant so route layers can map to HTTP cleanly.
 *
 * Truly unexpected errors (bugs, bad SQL) still throw — they bubble up to the
 * Express error handler as 500s.
 */

export type RepoErrorKind =
  | 'NotFound'
  | 'ConstraintViolation'
  | 'DuplicatePrimaryKey'
  | 'ConcurrentModification'
  | 'AccessConnectionError'
  | 'WriteNotSupported';

export interface RepoError {
  kind: RepoErrorKind;
  message: string;
  /** Optional nested cause (e.g., the raw OLE DB error) kept for logging. */
  cause?: unknown;
}

export type Result<T, E = RepoError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function Err<E = RepoError>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function errorFromAccess(err: unknown, fallback = 'Access connection failed'): RepoError {
  const message = err instanceof Error ? err.message : String(err ?? fallback);

  // Best-effort string sniffing — OLE DB errors have no useful error code over
  // PowerShell. We look for the strings Access/Jet puts in its SQLSTATE text
  // when a unique-index collision happens, to separate duplicate-key from
  // generic write failures.
  if (
    /duplicate value|cannot contain a null value|not unique|violation of PRIMARY KEY|duplicate key/i.test(
      message,
    )
  ) {
    return { kind: 'DuplicatePrimaryKey', message, cause: err };
  }
  return { kind: 'AccessConnectionError', message, cause: err };
}

export function repoHttpStatus(err: RepoError): number {
  switch (err.kind) {
    case 'NotFound':
      return 404;
    case 'ConstraintViolation':
      return 422;
    case 'DuplicatePrimaryKey':
    case 'ConcurrentModification':
      return 409;
    case 'WriteNotSupported':
      return 501;
    case 'AccessConnectionError':
    default:
      return 503;
  }
}

export function repoHttpCode(err: RepoError): string {
  switch (err.kind) {
    case 'NotFound':
      return 'NOT_FOUND';
    case 'ConstraintViolation':
      return 'CONSTRAINT_VIOLATION';
    case 'DuplicatePrimaryKey':
      return 'DUPLICATE_PRIMARY_KEY';
    case 'ConcurrentModification':
      return 'CONCURRENT_MODIFICATION';
    case 'WriteNotSupported':
      return 'WRITE_NOT_SUPPORTED';
    case 'AccessConnectionError':
    default:
      return 'ACCESS_CONNECTION_ERROR';
  }
}
