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
  type DimensionRow,
  type DimensionValueRow,
  type DimensionWithValues,
  type FamilyRuleRow,
  type SkuAttributesResponse,
  type CoverageRow,
  type AttributeMacroRuleSet,
  type AttributeMacroRuleSummary,
} from '../../repositories/products/AttributesRepository';
import { type Result } from '../../repositories/rics/repoResult';
import { auditLog, type AuditLogger } from './auditLog';

const TABLE = 'app.sku_attribute_assignment';
const TABLE_DIM = 'app.attribute_dimension';
const TABLE_VAL = 'app.attribute_value';
const TABLE_RULE = 'app.attribute_family_rule';
const TABLE_DERIVATION = 'app.attribute_derivation_rule';

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

    listMacroRuleSummaries(): Promise<Result<AttributeMacroRuleSummary[]>> {
      return repo.listAttributeMacroRuleSummaries();
    },

    getMacroRuleSet(
      sourceDimensionCode: string,
      targetDimensionCode: string,
    ): Promise<Result<AttributeMacroRuleSet>> {
      return repo.getAttributeMacroRuleSet(sourceDimensionCode, targetDimensionCode);
    },

    async replaceMacroRules(
      sourceDimensionCode: string,
      targetDimensionCode: string,
      rules: { sourceValueCode: string; targetValueCode: string | null }[],
    ): Promise<Result<AttributeMacroRuleSet>> {
      const result = await repo.replaceAttributeMacroRules(
        sourceDimensionCode,
        targetDimensionCode,
        rules,
        actor,
      );
      if (!result.ok) return result;
      await audit.record({
        actor,
        action: 'attribute_derivation_rules_replace',
        targetTable: TABLE_DERIVATION,
        targetPk: `${sourceDimensionCode}->${targetDimensionCode}`,
        payload: { rules },
      });
      return result;
    },

    /**
     * Atomic-replace for operator overrides — PUT /skus/:code/attributes.
     * Returns the fresh read-back of the per-SKU attribute set.
     *
     * `scopedDimensionCodes` (optional) narrows the wipe to just those dims.
     * Used by the main SKU form so saving Apariencia / Diseño doesn't clobber
     * Buyer / Company / Cadena (which live under a different form tab).
     */
    async setForSku(
      skuCode: string,
      assignments: AssignmentInput[],
      scopedDimensionCodes?: string[],
    ): Promise<Result<SkuAttributesResponse>> {
      const result = await repo.replaceSkuAttributes(skuCode, assignments, actor, scopedDimensionCodes);
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
          ...(scopedDimensionCodes ? { scope: scopedDimensionCodes } : {}),
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

    // ──────────────── Dimension CRUD (admin) ────────────────

    async createDimension(input: {
      code: string;
      labelEs: string;
      descriptionEs: string | null;
      sortOrder: number;
      isMultiValue: boolean;
      familyCode?: string | null;
    }): Promise<Result<DimensionRow>> {
      const result = await repo.createDimension({ ...input, actor });
      if (!result.ok) return result;
      await audit.record({
        actor,
        action: 'attribute_dimension_create',
        targetTable: TABLE_DIM,
        targetPk: input.code,
        payload: { ...input },
      });
      return result;
    },

    async updateDimension(
      code: string,
      patch: Partial<{ labelEs: string; descriptionEs: string | null; sortOrder: number; isMultiValue: boolean }>,
    ): Promise<Result<DimensionRow>> {
      const result = await repo.updateDimension(code, patch);
      if (!result.ok) return result;
      await audit.record({
        actor,
        action: 'attribute_dimension_update',
        targetTable: TABLE_DIM,
        targetPk: code,
        payload: { patch },
      });
      return result;
    },

    async deleteDimension(code: string): Promise<Result<{ deleted: true }>> {
      const result = await repo.deleteDimension(code);
      if (!result.ok) return result;
      await audit.record({
        actor,
        action: 'attribute_dimension_delete',
        targetTable: TABLE_DIM,
        targetPk: code,
        payload: {},
      });
      return result;
    },

    async reorderDimensions(entries: { code: string; sortOrder: number }[]): Promise<Result<{ updated: number }>> {
      const result = await repo.reorderDimensions(entries);
      if (!result.ok) return result;
      await audit.record({
        actor,
        action: 'attribute_dimension_reorder',
        targetTable: TABLE_DIM,
        targetPk: 'batch',
        payload: { entries },
      });
      return result;
    },

    // ──────────────── Value CRUD (admin) ────────────────

    async createValue(
      dimensionCode: string,
      input: { code: string; labelEs: string; descriptionEs?: string | null; sortOrder: number },
    ): Promise<Result<DimensionValueRow>> {
      const result = await repo.createValue(dimensionCode, input);
      if (!result.ok) return result;
      await audit.record({
        actor,
        action: 'attribute_value_create',
        targetTable: TABLE_VAL,
        targetPk: `${dimensionCode}/${input.code}`,
        payload: { ...input, dimensionCode },
      });
      return result;
    },

    async updateValue(
      valueId: number,
      patch: Partial<{ labelEs: string; descriptionEs: string | null; sortOrder: number; isActive: boolean }>,
    ): Promise<Result<DimensionValueRow>> {
      const result = await repo.updateValue(valueId, patch);
      if (!result.ok) return result;
      await audit.record({
        actor,
        action: patch.isActive === false
          ? 'attribute_value_deactivate'
          : patch.isActive === true
            ? 'attribute_value_reactivate'
            : 'attribute_value_update',
        targetTable: TABLE_VAL,
        targetPk: String(valueId),
        payload: { patch },
      });
      return result;
    },

    async deleteValue(valueId: number): Promise<Result<{ deleted: true }>> {
      const result = await repo.deleteValue(valueId);
      if (!result.ok) return result;
      await audit.record({
        actor,
        action: 'attribute_value_delete',
        targetTable: TABLE_VAL,
        targetPk: String(valueId),
        payload: {},
      });
      return result;
    },

    async reorderValues(
      dimensionCode: string,
      entries: { valueId: number; sortOrder: number }[],
    ): Promise<Result<{ updated: number }>> {
      const result = await repo.reorderValues(dimensionCode, entries);
      if (!result.ok) return result;
      await audit.record({
        actor,
        action: 'attribute_value_reorder',
        targetTable: TABLE_VAL,
        targetPk: dimensionCode,
        payload: { entries },
      });
      return result;
    },

    async mergeValues(sourceId: number, targetId: number): Promise<Result<{ moved: number }>> {
      const result = await repo.mergeValues(sourceId, targetId);
      if (!result.ok) return result;
      await audit.record({
        actor,
        action: 'attribute_value_merge',
        targetTable: TABLE_VAL,
        targetPk: `${sourceId}->${targetId}`,
        payload: { sourceId, targetId, moved: result.value.moved },
      });
      return result;
    },

    // ──────────────── Family-rule management ────────────────

    listRulesForDimension(dimensionCode: string): Promise<Result<FamilyRuleRow[]>> {
      return repo.listFamilyRulesForDimension(dimensionCode);
    },

    async replaceRulesForDimension(
      dimensionCode: string,
      input: { universal: true } | { universal: false; rules: { familyCode: string; enabled: boolean; isRequired: boolean; sortOrder?: number }[] },
    ): Promise<Result<FamilyRuleRow[]>> {
      const result = await repo.replaceDimensionFamilyRules(
        dimensionCode,
        input.universal ? null : input.rules,
        actor,
      );
      if (!result.ok) return result;
      await audit.record({
        actor,
        action: 'attribute_family_rules_replace_by_dim',
        targetTable: TABLE_RULE,
        targetPk: dimensionCode,
        payload: input,
      });
      return result;
    },

    async upsertRule(
      dimensionCode: string,
      familyCode: string,
      patch: { enabled?: boolean; isRequired?: boolean; sortOrder?: number },
    ): Promise<Result<FamilyRuleRow>> {
      const result = await repo.upsertFamilyRule(dimensionCode, familyCode, patch, actor);
      if (!result.ok) return result;
      await audit.record({
        actor,
        action: 'attribute_family_rule_upsert',
        targetTable: TABLE_RULE,
        targetPk: `${dimensionCode}/${familyCode}`,
        payload: { patch },
      });
      return result;
    },

    async deleteRule(dimensionCode: string, familyCode: string): Promise<Result<{ deleted: true }>> {
      const result = await repo.deleteFamilyRule(dimensionCode, familyCode);
      if (!result.ok) return result;
      await audit.record({
        actor,
        action: 'attribute_family_rule_delete',
        targetTable: TABLE_RULE,
        targetPk: `${dimensionCode}/${familyCode}`,
        payload: {},
      });
      return result;
    },

    listRulesForFamily(familyCode: string) {
      return repo.listRulesForFamily(familyCode);
    },

    async replaceRulesForFamily(
      familyCode: string,
      rules: { dimensionCode: string; enabled: boolean; isRequired: boolean; sortOrder?: number }[],
    ): Promise<Result<{ updated: number }>> {
      const result = await repo.replaceFamilyAttributeRules(familyCode, rules, actor);
      if (!result.ok) return result;
      await audit.record({
        actor,
        action: 'attribute_family_rules_replace_by_family',
        targetTable: TABLE_RULE,
        targetPk: familyCode,
        payload: { rules },
      });
      return result;
    },
  };
}

export const attributesService = createAttributesService();
export type AttributesService = ReturnType<typeof createAttributesService>;
