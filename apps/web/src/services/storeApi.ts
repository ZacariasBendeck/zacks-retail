export interface Store {
  id: number
  code: string
  name: string
  active: boolean
}

export async function fetchStores(): Promise<Store[]> {
  const res = await fetch('/api/v1/stores')
  if (!res.ok) throw new Error('FETCH_STORES_FAILED')
  const body = (await res.json()) as { stores: Store[] }
  return body.stores
}
