/**
 * Type definitions for the products-module taxonomy entities exposed at
 * /api/v1/taxonomy/*. The shapes match the backend repositories'
 * domain types 1:1 — if you change one, change the other.
 */

export interface Department {
  number: number
  description: string
  begCateg: number
  endCateg: number
  dateLastChanged: string | null
}

export interface DepartmentInput {
  number: number
  description: string
  begCateg: number
  endCateg: number
}

export interface Category {
  number: number
  description: string
  dateLastChanged: string | null
}

export interface CategoryInput {
  number: number
  description: string
}

export interface Group {
  code: string
  description: string
  dateLastChanged: string | null
}

export interface GroupInput {
  code: string
  description: string
}

export interface Keyword {
  keyword: string
  description: string
  dateLastChanged: string | null
}

export interface KeywordInput {
  keyword: string
  description: string
}

export interface Sector {
  number: number
  description: string
  begDept: number
  endDept: number
  dateLastChanged: string | null
}

export interface SectorInput {
  number: number
  description: string
  begDept: number
  endDept: number
}

export interface Season {
  code: string
  description: string | null
  skuCount: number
}

export interface SeasonInput {
  code: string
  description: string
}

export interface ReturnCode {
  code: number
  description: string
  trackable: boolean
  dateLastChanged: string | null
}

export interface ReturnCodeInput {
  code: number
  description: string
  trackable: boolean
}

export interface PromotionCode {
  code: string
  description: string
  date: string | null
  pieces: number | null
  cost: number | null
  dateLastChanged: string | null
}

export interface PromotionCodeInput {
  code: string
  description: string
  date?: string | null
  pieces?: number | null
  cost?: number | null
}

export interface SizeType {
  code: number
  description: string
  columnDescription: string
  rowDescription: string
  tableType: string | null
  columns: string[]
  rows: string[]
  maxColumns: number
  maxRows: number
  dateLastChanged: string | null
}

export interface SizeTypeInput {
  code: number
  description: string
  columnDescription: string
  rowDescription: string
  tableType?: string | null
  columns: string[]
  rows: string[]
}

export interface NrfCodeCell {
  sizeTypeCode: number
  rowLabel: number
  columnPosition: number
  nrfCode: number
}

export interface TaxonomyApiError {
  code: string
  message: string
}
