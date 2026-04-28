export class MatchingSetsApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'MatchingSetsApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    let code: string | undefined
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      code = body?.error?.code
      if (body?.error?.message) message = body.error.message
    } catch {
      /* ignore */
    }
    throw new MatchingSetsApiError(message, res.status, code)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const BASE = '/api/v1/products/matching-sets'

export interface MatchingSetTypeRole {
  code: string
  labelEs: string
  sortOrder: number
  requiredDefault: boolean
  active: boolean
}

export interface MatchingSetType {
  code: string
  labelEs: string
  descriptionEs: string | null
  sortOrder: number
  active: boolean
  roles: MatchingSetTypeRole[]
}

export interface MatchingSetGap {
  roleCode: string
  roleLabelEs: string
  severity: 'missing_required_role' | 'inactive_role'
}

export interface MatchingSetMember {
  skuId: string
  skuCode: string | null
  provisionalCode: string
  skuState: string
  familyCode: string | null
  roleCode: string
  roleLabelEs: string
  isPrimary: boolean
  quantityRatio: number
  description: string | null
  vendorId: string | null
  vendorSku: string | null
  colorCode: string | null
  season: string | null
  onHandTotal: number
  storeCountWithOnHand: number
  salesLast90Days: number | null
}

export interface MatchingSet {
  id: string
  code: string
  setTypeCode: string
  setTypeLabelEs: string
  descriptionEs: string | null
  vendorId: string | null
  vendorName: string | null
  vendorStyle: string | null
  sharedColorCode: string | null
  sharedColorLabel: string | null
  season: string | null
  notes: string | null
  active: boolean
  memberCount: number
  totalOnHand: number
  salesLast90Days: number | null
  gaps: MatchingSetGap[]
  members: MatchingSetMember[]
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface MatchingSetListItem extends Omit<MatchingSet, 'members'> {
  primaryMember: MatchingSetMember | null
}

export interface MatchingSetListFilters {
  q?: string
  setType?: string
  vendorId?: string
  sku?: string
  role?: string
  active?: boolean | null
  hasGap?: boolean | null
  page?: number
  pageSize?: number
}

export interface MatchingSetMemberInput {
  skuId?: string | null
  skuCode?: string | null
  provisionalCode?: string | null
  roleCode: string
  isPrimary?: boolean | null
  quantityRatio?: number | null
}

export interface MatchingSetInput {
  code?: string | null
  setTypeCode: string
  descriptionEs?: string | null
  vendorId?: string | null
  vendorStyle?: string | null
  sharedColorCode?: string | null
  sharedColorLabel?: string | null
  season?: string | null
  notes?: string | null
  members?: MatchingSetMemberInput[]
}

export type MatchingSetPatch = Partial<Omit<MatchingSetInput, 'members' | 'code'>>

export interface MatchingSetRoleInput {
  code?: string
  labelEs?: string
  sortOrder?: number
  requiredDefault?: boolean
  active?: boolean
}

export interface MatchingSetTypeInput {
  code?: string
  labelEs?: string
  descriptionEs?: string | null
  sortOrder?: number
  active?: boolean
}

function buildParams(filter?: MatchingSetListFilters): string {
  if (!filter) return ''
  const p = new URLSearchParams()
  if (filter.q) p.set('q', filter.q)
  if (filter.setType) p.set('setType', filter.setType)
  if (filter.vendorId) p.set('vendorId', filter.vendorId)
  if (filter.sku) p.set('sku', filter.sku)
  if (filter.role) p.set('role', filter.role)
  if (filter.active != null) p.set('active', String(filter.active))
  if (filter.hasGap != null) p.set('hasGap', String(filter.hasGap))
  if (filter.page != null) p.set('page', String(filter.page))
  if (filter.pageSize != null) p.set('pageSize', String(filter.pageSize))
  return p.toString() ? `?${p.toString()}` : ''
}

export const productMatchingSetsApi = {
  listTypes(): Promise<MatchingSetType[]> {
    return request<MatchingSetType[]>(`${BASE}/types`)
  },
  createType(input: MatchingSetTypeInput): Promise<MatchingSetType> {
    return request<MatchingSetType>(`${BASE}/types`, { method: 'POST', body: JSON.stringify(input) })
  },
  updateType(code: string, patch: MatchingSetTypeInput): Promise<MatchingSetType> {
    return request<MatchingSetType>(`${BASE}/types/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  createRole(typeCode: string, input: MatchingSetRoleInput): Promise<MatchingSetType> {
    return request<MatchingSetType>(`${BASE}/types/${encodeURIComponent(typeCode)}/roles`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  updateRole(typeCode: string, roleCode: string, patch: MatchingSetRoleInput): Promise<MatchingSetType> {
    return request<MatchingSetType>(
      `${BASE}/types/${encodeURIComponent(typeCode)}/roles/${encodeURIComponent(roleCode)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    )
  },
  list(filter?: MatchingSetListFilters): Promise<MatchingSetListItem[]> {
    return request<MatchingSetListItem[]>(`${BASE}${buildParams(filter)}`)
  },
  get(id: string): Promise<MatchingSet> {
    return request<MatchingSet>(`${BASE}/${encodeURIComponent(id)}`)
  },
  bySku(skuRef: string): Promise<MatchingSet[]> {
    return request<MatchingSet[]>(`${BASE}/by-sku/${encodeURIComponent(skuRef)}`)
  },
  create(input: MatchingSetInput): Promise<MatchingSet> {
    return request<MatchingSet>(BASE, { method: 'POST', body: JSON.stringify(input) })
  },
  update(id: string, patch: MatchingSetPatch): Promise<MatchingSet> {
    return request<MatchingSet>(`${BASE}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  archive(id: string): Promise<MatchingSet> {
    return request<MatchingSet>(`${BASE}/${encodeURIComponent(id)}/archive`, { method: 'POST' })
  },
  restore(id: string): Promise<MatchingSet> {
    return request<MatchingSet>(`${BASE}/${encodeURIComponent(id)}/restore`, { method: 'POST' })
  },
  addMember(id: string, input: MatchingSetMemberInput): Promise<MatchingSet> {
    return request<MatchingSet>(`${BASE}/${encodeURIComponent(id)}/members`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  updateMember(
    id: string,
    skuId: string,
    patch: Partial<Pick<MatchingSetMemberInput, 'roleCode' | 'isPrimary' | 'quantityRatio'>>,
  ): Promise<MatchingSet> {
    return request<MatchingSet>(
      `${BASE}/${encodeURIComponent(id)}/members/${encodeURIComponent(skuId)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    )
  },
  removeMember(id: string, skuId: string): Promise<MatchingSet> {
    return request<MatchingSet>(
      `${BASE}/${encodeURIComponent(id)}/members/${encodeURIComponent(skuId)}`,
      { method: 'DELETE' },
    )
  },
}
