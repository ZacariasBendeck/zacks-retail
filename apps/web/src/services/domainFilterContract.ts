import { CATEGORY_MAX, CATEGORY_MIN, isValidCategoryCode, isValidDepartment } from '../constants/domain'
import type { Department } from '../types/sku'

export type SortOrder = 'asc' | 'desc'

export interface ServerTableContract {
  page?: number
  pageSize?: number
  sort?: string
  order?: SortOrder
}

export interface DomainFilterContract {
  department?: string | null
  category?: number | null
}

export interface DomainFilterContractOptions {
  requireDepartmentForCategory?: boolean
}

export interface ValidatedDomainFilterContract {
  department?: Department
  category?: number
}

export interface ValidationResult<T> {
  value: T
  errors: string[]
}

export class DomainFilterContractError extends Error {
  readonly code = 'FILTER_CONTRACT_INVALID'
  readonly details: string[]

  constructor(details: string[]) {
    super(details.join(' '))
    this.name = 'DomainFilterContractError'
    this.details = details
  }
}

function normalizeDepartment(value: string | null | undefined): Department | undefined {
  if (value == null) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return isValidDepartment(trimmed) ? trimmed : undefined
}

function normalizeCategory(value: number | null | undefined): number | undefined {
  if (value == null) return undefined
  if (!Number.isInteger(value)) return Number.NaN
  return value
}

export function validateDomainFilterContract(
  contract: DomainFilterContract,
  options?: DomainFilterContractOptions,
): ValidationResult<ValidatedDomainFilterContract> {
  const department = normalizeDepartment(contract.department)
  const category = normalizeCategory(contract.category)
  const errors: string[] = []

  if (contract.department != null && department == null) {
    errors.push('Department must be one of FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT.')
  }

  if (category != null) {
    if (Number.isNaN(category) || !isValidCategoryCode(category)) {
      errors.push(`Category must be an integer within ${CATEGORY_MIN}-${CATEGORY_MAX}.`)
    }
    if (options?.requireDepartmentForCategory && !department) {
      errors.push('Category filters require a department selection.')
    }
  }

  return {
    value: {
      department,
      category: category != null && !Number.isNaN(category) ? category : undefined,
    },
    errors,
  }
}

export function assertDomainFilterContract(
  contract: DomainFilterContract,
  options?: DomainFilterContractOptions,
): ValidatedDomainFilterContract {
  const result = validateDomainFilterContract(contract, options)
  if (result.errors.length > 0) {
    throw new DomainFilterContractError(result.errors)
  }
  return result.value
}

export function appendDomainFilterContract(
  params: URLSearchParams,
  contract: DomainFilterContract,
  options?: DomainFilterContractOptions,
): void {
  const normalized = assertDomainFilterContract(contract, options)
  if (normalized.department) params.set('department', normalized.department)
  if (normalized.category != null) params.set('category', String(normalized.category))
}

export function appendServerTableContract(
  params: URLSearchParams,
  contract?: ServerTableContract,
): void {
  if (!contract) return
  if (contract.page != null) params.set('page', String(contract.page))
  if (contract.pageSize != null) params.set('pageSize', String(contract.pageSize))
  if (contract.sort) params.set('sort', contract.sort)
  if (contract.order) params.set('order', contract.order)
}
