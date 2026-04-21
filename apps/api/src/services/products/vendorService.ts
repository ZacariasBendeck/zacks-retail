/**
 * Vendor service — orchestration over VendorRepository.
 *
 * Responsibilities beyond the repo:
 *   - EDI "both-or-neither" validation (qualifierId + qualifierCode populated together).
 *   - Delete guard: block when SKUs in InventoryMaster reference the vendor.
 *   - Audit log every create / update / delete (including store-account CRUD).
 *
 * Validation that's purely shape (required fields, max length) lives in the
 * repository's `VENDOR_FIELD_LIMITS` / `insertParams` path. Validation that's
 * cross-field or cross-table lives here.
 *
 * See Phase 1 design doc:
 *   docs/dev/specs/2026-04-18-products-phase1-design.md
 */

import { VendorRepository, type Vendor, type VendorInput, type VendorStoreAccount } from '../../repositories/rics/VendorRepository';
import { Err, Ok, type Result, type RepoError } from '../../repositories/rics/repoResult';
import { auditLog, type AuditLogger } from './auditLog';

export interface VendorServiceOptions {
  actor?: string;
  audit?: AuditLogger;
  repo?: typeof VendorRepository;
}

const TABLE = 'Vendor Master';
const STORE_ACCT_TABLE = 'Vendor Accounts';

function validateEdi(input: Pick<VendorInput, 'qualifierId' | 'qualifierCode'>): RepoError | null {
  const hasId = typeof input.qualifierId === 'string' && input.qualifierId.trim().length > 0;
  const hasCode = typeof input.qualifierCode === 'string' && input.qualifierCode.trim().length > 0;
  if (hasId !== hasCode) {
    return {
      kind: 'ConstraintViolation',
      message: 'EDI Qualifier ID and Qualifier Code must both be set or both be empty.',
    };
  }
  return null;
}

export function createVendorService(opts: VendorServiceOptions = {}) {
  const repo = opts.repo ?? VendorRepository;
  const audit = opts.audit ?? auditLog;
  const actor = opts.actor ?? 'system';

  return {
    list(q?: string, limit?: number): Promise<Result<Vendor[]>> {
      return repo.findAll({ q, limit });
    },

    get(code: string): Promise<Result<Vendor>> {
      return repo.findByCode(code);
    },

    async create(input: VendorInput): Promise<Result<Vendor>> {
      const ediErr = validateEdi(input);
      if (ediErr) return Err(ediErr);

      const result = await repo.create(input);
      if (result.ok) {
        await audit.record({
          actor,
          action: 'CREATE',
          targetTable: TABLE,
          targetPk: result.value.code,
          payload: { code: result.value.code, name: result.value.name },
        });
      }
      return result;
    },

    async update(code: string, patch: Partial<Omit<VendorInput, 'code'>>): Promise<Result<Vendor>> {
      if (patch.qualifierId !== undefined || patch.qualifierCode !== undefined) {
        // Load the current record so we can evaluate EDI coherence on the merged state.
        const existing = await repo.findByCode(code);
        if (!existing.ok) return existing;
        const merged = {
          qualifierId: patch.qualifierId !== undefined ? patch.qualifierId : existing.value.qualifierId,
          qualifierCode: patch.qualifierCode !== undefined ? patch.qualifierCode : existing.value.qualifierCode,
        };
        const ediErr = validateEdi(merged);
        if (ediErr) return Err(ediErr);
      }

      const result = await repo.update(code, patch);
      if (result.ok) {
        await audit.record({
          actor,
          action: 'UPDATE',
          targetTable: TABLE,
          targetPk: result.value.code,
          payload: patch as Record<string, unknown>,
        });
      }
      return result;
    },

    async delete(code: string): Promise<Result<void>> {
      const count = await repo.countSkusUsingVendor(code);
      if (!count.ok) return Err(count.error);
      if (count.value > 0) {
        return Err({
          kind: 'ConstraintViolation',
          message: `Cannot delete vendor '${code}' — ${count.value} SKU(s) reference it. Reassign or discontinue those SKUs first.`,
        });
      }

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

    skuCount(code: string): Promise<Result<number>> {
      return repo.countSkusUsingVendor(code);
    },

    skuCountsAll(): Promise<Result<Record<string, number>>> {
      return repo.countSkusPerVendor();
    },

    listStoreAccounts(code: string): Promise<Result<VendorStoreAccount[]>> {
      return repo.findStoreAccounts(code);
    },

    async upsertStoreAccount(
      code: string,
      storeId: number,
      accountNo: string,
    ): Promise<Result<VendorStoreAccount>> {
      const result = await repo.upsertStoreAccount(code, storeId, accountNo);
      if (result.ok) {
        await audit.record({
          actor,
          action: 'UPSERT_STORE_ACCOUNT',
          targetTable: STORE_ACCT_TABLE,
          targetPk: `${code}:${storeId}`,
          payload: { code, storeId, accountNo },
        });
      }
      return result;
    },

    async deleteStoreAccount(code: string, storeId: number): Promise<Result<void>> {
      const result = await repo.deleteStoreAccount(code, storeId);
      if (result.ok) {
        await audit.record({
          actor,
          action: 'DELETE_STORE_ACCOUNT',
          targetTable: STORE_ACCT_TABLE,
          targetPk: `${code}:${storeId}`,
          payload: { code, storeId },
        });
      }
      return result;
    },
  };
}

export const vendorService = createVendorService();
export type VendorService = ReturnType<typeof createVendorService>;
