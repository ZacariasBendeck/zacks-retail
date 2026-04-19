/**
 * SKU service — orchestration over SkuRepository.
 *
 * Responsibilities beyond the repo:
 *   - Validation (required fields, at-least-one price slot populated).
 *   - Rename guard: RICS p. 154 — `code` cannot be changed once activity exists.
 *     A request body that includes a `code` on PATCH is rejected at the service
 *     level. (The repository enforces this too, but catching early gives a
 *     cleaner error.)
 *   - Audit-log every create / update / delete.
 *
 * Uses dependency injection for the repo + audit logger so unit tests can swap.
 */

import {
  SkuRepository,
  type Sku,
  type SkuInput,
} from '../../repositories/rics/SkuRepository';
import { Err, type Result, type RepoError } from '../../repositories/rics/repoResult';
import { auditLog, type AuditLogger } from './auditLog';

export interface SkuServiceOptions {
  actor?: string;
  audit?: AuditLogger;
  repo?: typeof SkuRepository;
}

const TABLE = 'InventoryMaster';

function validateCreate(input: SkuInput): RepoError | null {
  if (!input.code || typeof input.code !== 'string' || input.code.trim().length === 0) {
    return { kind: 'ConstraintViolation', message: 'SKU code is required.' };
  }
  if (input.code.trim().length > 15) {
    return { kind: 'ConstraintViolation', message: 'SKU code max length is 15.' };
  }
  if (!input.vendor || input.vendor.trim().length === 0) {
    return { kind: 'ConstraintViolation', message: 'Vendor is required (RICS p. 154).' };
  }
  if (input.category == null) {
    return { kind: 'ConstraintViolation', message: 'Category is required (RICS p. 154).' };
  }
  if (!input.description || input.description.trim().length === 0) {
    return { kind: 'ConstraintViolation', message: 'Description is required (RICS p. 154).' };
  }
  if (input.retailPrice == null || input.retailPrice < 0) {
    return { kind: 'ConstraintViolation', message: 'Retail price is required and must be non-negative.' };
  }
  return null;
}

export function createSkuService(opts: SkuServiceOptions = {}) {
  const repo = opts.repo ?? SkuRepository;
  const audit = opts.audit ?? auditLog;
  const actor = opts.actor ?? 'system';

  return {
    list(filter: Parameters<typeof SkuRepository.findAll>[0] = {}): Promise<Result<Sku[]>> {
      return repo.findAll(filter);
    },

    get(code: string): Promise<Result<Sku>> {
      return repo.findByCode(code);
    },

    async create(input: SkuInput): Promise<Result<Sku>> {
      const err = validateCreate(input);
      if (err) return Err(err);
      const result = await repo.create(input);
      if (result.ok) {
        await audit.record({
          actor,
          action: 'CREATE',
          targetTable: TABLE,
          targetPk: result.value.code,
          payload: { code: result.value.code, description: result.value.description, vendor: result.value.vendor },
        });
      }
      return result;
    },

    async update(code: string, patch: Partial<Omit<SkuInput, 'code'>> & { code?: string }): Promise<Result<Sku>> {
      // Rename guard — route accepts arbitrary body, but code changes are forbidden.
      if (patch.code && patch.code !== code) {
        return Err({
          kind: 'ConstraintViolation',
          message:
            'SKU code cannot be renamed (RICS p. 154). Use Discontinue SKUs to merge into a new code.',
        });
      }
      const { code: _drop, ...rest } = patch;
      const result = await repo.update(code, rest);
      if (result.ok) {
        await audit.record({
          actor,
          action: 'UPDATE',
          targetTable: TABLE,
          targetPk: result.value.code,
          payload: rest as Record<string, unknown>,
        });
      }
      return result;
    },

    async delete(code: string): Promise<Result<void>> {
      // Note: RICS semantics say "delete only if no activity" (p. 156). In Phase 1
      // we rely on the caller (the admin UI) to confirm. A deeper activity check
      // (sales / POs / inventory) is deferred — would require cross-MDB reads
      // that belong to the sales + purchasing modules. Exposed as open follow-up.
      const result = await repo.delete(code);
      if (result.ok) {
        await audit.record({
          actor,
          action: 'DELETE',
          targetTable: TABLE,
          targetPk: code,
          payload: { code },
        });
      }
      return result;
    },

    countByVendor(vendorCode: string): Promise<Result<number>> {
      return repo.countByVendor(vendorCode);
    },

    countByCategory(category: number): Promise<Result<number>> {
      return repo.countByCategory(category);
    },
  };
}

export const skuService = createSkuService();
export type SkuService = ReturnType<typeof createSkuService>;
