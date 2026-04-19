import type { PaginationEnvelope } from '../types/sku'
import type {
  Customer,
  CustomerWithFamily,
  CustomerCreatePayload,
  CustomerUpdatePayload,
  CustomerListParams,
  CustomerBalances,
  FamilyMember,
  FamilyMemberCreatePayload,
  FamilyMemberUpdatePayload,
} from '../types/customer'

export class CustomerApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'CustomerApiError'
    this.status = status
    this.code = code
  }
}

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  const code = typeof body?.error?.code === 'string' ? body.error.code : undefined
  const message = typeof body?.error?.message === 'string' ? body.error.message : fallback
  throw new CustomerApiError(message, res.status, code)
}

export async function fetchCustomers(params: CustomerListParams): Promise<PaginationEnvelope<Customer>> {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') search.set(k, String(v))
  }
  const res = await fetch(`/api/v1/customers?${search}`)
  if (!res.ok) await throwApiError(res, 'Failed to fetch customers')
  return res.json()
}

export async function searchCustomers(q: string, limit = 10): Promise<Customer[]> {
  const res = await fetch(`/api/v1/customers/search?q=${encodeURIComponent(q)}&limit=${limit}`)
  if (!res.ok) await throwApiError(res, 'Failed to search customers')
  const body = (await res.json()) as { data: Customer[] }
  return body.data
}

export async function fetchCustomer(id: string): Promise<CustomerWithFamily> {
  const res = await fetch(`/api/v1/customers/${id}`)
  if (!res.ok) await throwApiError(res, 'Failed to fetch customer')
  return res.json()
}

export async function fetchCustomerByAccount(accountNumber: string): Promise<Customer> {
  const res = await fetch(`/api/v1/customers/by-account/${encodeURIComponent(accountNumber)}`)
  if (!res.ok) await throwApiError(res, 'Failed to fetch customer')
  return res.json()
}

export async function fetchCustomerBalances(id: string): Promise<CustomerBalances> {
  const res = await fetch(`/api/v1/customers/${id}/balances`)
  if (!res.ok) await throwApiError(res, 'Failed to fetch balances')
  return res.json()
}

export async function createCustomer(payload: CustomerCreatePayload): Promise<Customer> {
  const res = await fetch('/api/v1/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, 'Failed to create customer')
  return res.json()
}

export async function updateCustomer(id: string, payload: CustomerUpdatePayload): Promise<Customer> {
  const res = await fetch(`/api/v1/customers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, 'Failed to update customer')
  return res.json()
}

export async function deleteCustomer(id: string): Promise<void> {
  const res = await fetch(`/api/v1/customers/${id}`, { method: 'DELETE' })
  if (!res.ok) await throwApiError(res, 'Failed to delete customer')
}

// --- family members --------------------------------------------------------

export async function fetchFamilyMembers(customerId: string): Promise<FamilyMember[]> {
  const res = await fetch(`/api/v1/customers/${customerId}/family`)
  if (!res.ok) await throwApiError(res, 'Failed to fetch family members')
  const body = (await res.json()) as { data: FamilyMember[] }
  return body.data
}

export async function createFamilyMember(customerId: string, payload: FamilyMemberCreatePayload): Promise<FamilyMember> {
  const res = await fetch(`/api/v1/customers/${customerId}/family`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, 'Failed to add family member')
  return res.json()
}

export async function updateFamilyMember(customerId: string, familyId: string, payload: FamilyMemberUpdatePayload): Promise<FamilyMember> {
  const res = await fetch(`/api/v1/customers/${customerId}/family/${familyId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, 'Failed to update family member')
  return res.json()
}

export async function deleteFamilyMember(customerId: string, familyId: string): Promise<void> {
  const res = await fetch(`/api/v1/customers/${customerId}/family/${familyId}`, { method: 'DELETE' })
  if (!res.ok) await throwApiError(res, 'Failed to delete family member')
}
