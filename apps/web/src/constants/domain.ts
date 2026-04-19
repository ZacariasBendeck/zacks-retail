import type { Department } from '../types/sku'

export const ALLOWED_DEPARTMENTS: Department[] = [
  'FORMAL',
  'CASUAL',
  'FIESTA',
  'SANDALIAS',
  'BOOTS',
  'COMFORT',
]

export const CATEGORY_MIN = 556
export const CATEGORY_MAX = 599

export function isValidDepartment(value: string | null | undefined): value is Department {
  if (!value) return false
  return ALLOWED_DEPARTMENTS.includes(value as Department)
}

export function isValidCategoryCode(code: number | null | undefined): boolean {
  if (code == null) return false
  return code >= CATEGORY_MIN && code <= CATEGORY_MAX
}
