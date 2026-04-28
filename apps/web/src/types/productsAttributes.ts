/**
 * Types for the SKU extended-attribute API.
 * Spec: docs/dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md
 */

export interface AttributeDimensionValue {
  id: number
  code: string
  labelEs: string
  sortOrder: number
  isActive: boolean
  /** Present only when the catalog was fetched with `withCounts=true`. */
  skuCount?: number
}

export interface AttributeFamilyRule {
  familyCode: string
  enabled: boolean
  isRequired: boolean
  sortOrder: number
}

export interface AttributeDimension {
  id: number
  code: string
  labelEs: string
  descriptionEs: string | null
  sortOrder: number
  isMultiValue: boolean
  /** Empty array = universal (applies to every family). */
  familyRules: AttributeFamilyRule[]
  values: AttributeDimensionValue[]
}

/**
 * Reverse view used by the Families page — one row per dim ruled for a family.
 */
export interface FamilyAttributeRuleRow {
  dimensionId: number
  dimensionCode: string
  labelEs: string
  enabled: boolean
  isRequired: boolean
  sortOrder: number
}

export interface SkuAttributeAssignment {
  code: string
  labelEs: string
  assignedBy: string | null
  assignedAt: string
}

export interface SkuDimensionEntry {
  isMultiValue: boolean
  values: SkuAttributeAssignment[]
}

export interface SkuAttributes {
  skuCode: string
  byDimension: Record<string, SkuDimensionEntry>
}

export interface AttributeAssignmentInput {
  dimension_code: string
  value_code: string
}

export interface SetSkuAttributesInput {
  assignments: AttributeAssignmentInput[]
  /** Optional: when present, the atomic-replace only wipes these dim codes
   *  instead of every non-keyword assignment. Used by the main SKU form so a
   *  save of Apariencia / Diseño doesn't wipe Buyer / Company / Cadena. */
  scope?: string[]
}

export interface AttributeCoverageRow {
  dimensionCode: string
  labelEs: string
  totalSkus: number
  classifiedSkus: number
  coveragePct: number
  bySource: { keyword: number; excel: number; operator: number }
}

export interface AttributeMacroRuleSummary {
  sourceDimensionCode: string
  sourceDimensionLabelEs: string
  targetDimensionCode: string
  targetDimensionLabelEs: string
  mappedCount: number
  sourceValueCount: number
  updatedAt: string | null
}

export interface AttributeMacroRuleRow {
  sourceValueCode: string
  sourceLabelEs: string
  targetValueCode: string | null
  targetLabelEs: string | null
  updatedAt: string | null
  updatedBy: string | null
}

export interface AttributeMacroRuleSet {
  sourceDimensionCode: string
  sourceDimensionLabelEs: string
  targetDimensionCode: string
  targetDimensionLabelEs: string
  rules: AttributeMacroRuleRow[]
}
