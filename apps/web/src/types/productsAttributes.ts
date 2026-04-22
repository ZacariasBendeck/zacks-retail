/**
 * Types for the SKU extended-attribute API.
 * Spec: docs/dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md
 */

export interface AttributeDimensionValue {
  code: string
  labelEs: string
  sortOrder: number
  /** Present only when the catalog was fetched with `withCounts=true`. */
  skuCount?: number
}

export interface AttributeDimension {
  code: string
  labelEs: string
  sortOrder: number
  isMultiValue: boolean
  values: AttributeDimensionValue[]
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
}

export interface AttributeCoverageRow {
  dimensionCode: string
  labelEs: string
  totalSkus: number
  classifiedSkus: number
  coveragePct: number
  bySource: { keyword: number; excel: number; operator: number }
}
