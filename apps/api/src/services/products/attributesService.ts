/**
 * Extended-attributes service — validation, audit, actor wiring over
 * AttributesRepository.
 *
 * Spec: docs/dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md
 *
 * Responsibilities beyond the repo:
 *   - Thread the actor (user email, id, or 'system') into writes.
 *   - Audit every write via the shared ProductsAuditLog.
 *   - Expose `bulkAssign` as the utilities batch-change seam.
 */

import {
  AttributesRepository,
  type AssignmentInput,
  type AssignmentDetail,
  type DimensionWithValues,
  type SkuAttributesResponse,
  type CoverageRow,
} from '../../repositories/products/AttributesRepository';
import { type Result } from '../../repositories/rics/repoResult';
import { auditLog, type AuditLogger } from './auditLog';

const TABLE = 'app.sku_attribute_assignment';

export interface AttributesServiceOptions {
  actor?: string;
  audit?: AuditLogger;
  repo?: typeof AttributesRepository;
}

export function createAttributesService(opts: AttributesServiceOptions = {}) {
  const repo = opts.repo ?? AttributesRepository;
  const audit = opts.audit ?? auditLog;
  const actor = opts.actor ?? 'system';

  return {
    listDimensions(withCounts = false): Promise<Result<DimensionWithValues[]>> {
      return repo.listDimensionsWithValues({ withCounts });
    },

    getForSku(skuCode: string): Promise<Result<SkuAttributesResponse>> {
      return repo.getSkuAttributes(skuCode);
    },

    findSkuCodesByAttributeFilters(
      filters: { dimensionCode: string; valueCodes: string[] }[]
    ): Promise<Result<Set<string>>> {
      return repo.findSkuCodesByAttributeFilters(filters);
    },

    getCoverage(): Promise<Result<CoverageRow[]>> {
      return repo.getCoverage();
    },

    /**
     * Atomic-replace for operator overrides — PUT /skus/:code/attributes.
     * Returns the fresh read-back of the per-SKU attribute set.
     */
    async setForSku(
      skuCode: string,
      assignments: AssignmentInput[]
    ): Promise<Result<SkuAttributesResponse>> {
      const result = await repo.replaceSkuAttributes(skuCode, assignments, actor);
      if (!result.ok) return result;

      await audit.record({
        actor,
        action: 'sku_attributes_set',
        targetTable: TABLE,
        targetPk: skuCode,
        payload: {
          previous: result.value.previous.map((a) => ({ code: a.code, by: a.assignedBy })),
          next: result.value.next.map((a) => ({ code: a.code, by: a.assignedBy })),
          requested: assignments,
        },
      });

      return repo.getSkuAttributes(skuCode);
    },

    /**
     * Bulk assign (used by `utilities` batch-change). Writes a single audit row
     * for the whole operation — per-SKU before/after lives in the utilities
     * batch-operation-item audit trail already.
     */
    async bulkAssign(input: {
      skuCodes: string[];
      dimensionCode: string;
      valueCodes: string[];
      actor: string;
    }): Promise<Result<{ affected: number }>> {
      const result = await repo.bulkAssign(input);
      if (!result.ok) return result;
      await audit.record({
        actor: input.actor,
        action: 'sku_attributes_bulk_assign',
        targetTable: TABLE,
        targetPk: `bulk:${input.dimensionCode}`,
        payload: {
          dimensionCode: input.dimensionCode,
          valueCodes: input.valueCodes,
          skuCount: input.skuCodes.length,
          affected: result.value,
        },
      });
      return { ok: true, value: { affected: result.value } };
    },
  };
}

export const attributesService = createAttributesService();
export type AttributesService = ReturnType<typeof createAttributesService>;
