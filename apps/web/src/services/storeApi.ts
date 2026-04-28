export interface StoreSummary {
  id: number
  code: string
  name: string
  active: boolean
  chainId: string | null
  chainLabel: string | null
}

export interface StoreDetail extends StoreSummary {
  mailName: string | null
  address1: string | null
  address2: string | null
  city: string | null
  state: string | null
  zip: string | null
  email: string | null
  phone: string | null
  fax: string | null
  lastTicketUsed: number | null
  billToName: string | null
  billToAddress1: string | null
  billToAddress2: string | null
  billToCity: string | null
  billToState: string | null
  billToZip: string | null
  otherChargeDescription: string | null
  region: number | null
  dateLastChanged: string | null
}

export interface StoreChain {
  id: string
  label: string
  active: boolean
  sortOrder: number
  storeNumbers: number[]
  storeCount: number
}

async function parseJsonOrThrow<T>(res: Response, fallbackCode: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message =
      (body as { error?: { message?: string } })?.error?.message ?? fallbackCode
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export async function fetchStores(): Promise<StoreSummary[]> {
  const res = await fetch('/api/v1/stores')
  const body = await parseJsonOrThrow<{ stores: StoreSummary[] }>(res, 'FETCH_STORES_FAILED')
  return body.stores
}

export async function fetchStoreById(id: number): Promise<StoreDetail> {
  const res = await fetch(`/api/v1/stores/${encodeURIComponent(String(id))}`)
  return parseJsonOrThrow<StoreDetail>(res, 'FETCH_STORE_FAILED')
}

export async function fetchStoreChains(): Promise<StoreChain[]> {
  const res = await fetch('/api/v1/stores/chains')
  const body = await parseJsonOrThrow<{ chains: StoreChain[] }>(res, 'FETCH_STORE_CHAINS_FAILED')
  return body.chains
}

export async function createStoreChain(input: {
  code: string
  label: string
  active?: boolean
  sortOrder?: number
}): Promise<StoreChain> {
  const res = await fetch('/api/v1/stores/chains', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await parseJsonOrThrow<{ chain: StoreChain }>(res, 'CREATE_STORE_CHAIN_FAILED')
  return body.chain
}

export async function updateStoreChain(
  id: string,
  input: {
    label?: string
    active?: boolean
    sortOrder?: number
  },
): Promise<StoreChain> {
  const res = await fetch(`/api/v1/stores/chains/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await parseJsonOrThrow<{ chain: StoreChain }>(res, 'UPDATE_STORE_CHAIN_FAILED')
  return body.chain
}

export async function assignStoreChain(storeId: number, chainId: string | null): Promise<StoreDetail> {
  const res = await fetch(`/api/v1/stores/${encodeURIComponent(String(storeId))}/chain`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chainId }),
  })
  const body = await parseJsonOrThrow<{ store: StoreDetail }>(res, 'ASSIGN_STORE_CHAIN_FAILED')
  return body.store
}
