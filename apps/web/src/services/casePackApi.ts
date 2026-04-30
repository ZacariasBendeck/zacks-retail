export interface CasePackSummary {
  code: string
  description: string | null
  sizeTypeCode: number
  active: boolean
  dateLastChanged: string | null
  totalUnits: number
  cellCount: number
  skuCount: number
}

export interface CasePackCell {
  columnLabel: string
  rowLabel: string
  quantity: number
}

export interface CasePackDetail extends CasePackSummary {
  cells: CasePackCell[]
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

export async function fetchCasePacks(params: { sizeTypeCode?: number } = {}): Promise<CasePackSummary[]> {
  const searchParams = new URLSearchParams()
  if (params.sizeTypeCode != null) searchParams.set('sizeTypeCode', String(params.sizeTypeCode))
  const query = searchParams.toString()
  const res = await fetch(`/api/v1/case-packs${query ? `?${query}` : ''}`)
  const body = await parseJsonOrThrow<{ casePacks: CasePackSummary[] }>(res, 'FETCH_CASE_PACKS_FAILED')
  return body.casePacks
}

export async function fetchCasePackByCode(code: string): Promise<CasePackDetail> {
  const res = await fetch(`/api/v1/case-packs/${encodeURIComponent(code)}`)
  const body = await parseJsonOrThrow<{ casePack: CasePackDetail }>(res, 'FETCH_CASE_PACK_FAILED')
  return body.casePack
}
