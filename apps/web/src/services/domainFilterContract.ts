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
  // Reports that read from app-owned Postgres data (sell-through,
  // inventory-aging) accept any non-empty string department and any positive
  // integer category, since the domain is data-driven by app.taxonomy_*
  // rather than the SQLite-era 6-name enum / 556..599 code window.
  allowAnyDepartment?: boolean
}

export interface ValidatedDomainFilterContract {
  department?: Department | string
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

function normalizeAnyDepartment(value: string | null | undefined): string | undefined {
  if (value == null) return undefined
  const trimmed = value.trim()
  return trimmed || undefined
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
  const allowAny = options?.allowAnyDepartment === true
  const department = allowAny
    ? normalizeAnyDepartment(contract.department)
    : normalizeDepartment(contract.department)
  const category = normalizeCategory(contract.category)
  const errors: string[] = []

  if (contract.department != null && department == null) {
    errors.push(allowAny
      ? 'Department must be a non-empty string.'
      : 'Department must be one of FORMAL, CASUAL, FIESTA, SANDALIAS, BOOTS, COMFORT.')
  }

  if (category != null) {
    if (Number.isNaN(category)) {
      errors.push('Category must be an integer.')
    } else if (allowAny) {
      if (!Number.isInteger(category) || category < 1) {
        errors.push('Category must be a positive integer.')
      }
    } else if (!isValidCategoryCode(category)) {
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
