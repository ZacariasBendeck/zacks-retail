/**
 * Shared client types for the products-module Vendor admin UI.
 *
 * Mirrors the backend domain shape in
 * [apps/api/src/repositories/rics/VendorRepository.ts].
 */

export interface Vendor {
  code: string
  name: string
  mailName: string
  addr1: string | null
  addr2: string | null
  city: string | null
  state: string | null
  zip: string | null
  phone: string | null
  fax: string | null
  contact: string | null
  terms: string | null
  shipInst: string | null
  comment: string | null
  manuCode: string | null
  manuName: string | null
  qualifierId: string | null
  qualifierCode: string | null
  colorCode: boolean
  longComment: string | null
  email: string | null
  dateLastChanged: string | null
}

export interface VendorInput {
  code: string
  name: string
  mailName: string
  addr1?: string | null
  addr2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  phone?: string | null
  fax?: string | null
  contact?: string | null
  terms?: string | null
  shipInst?: string | null
  comment?: string | null
  manuCode?: string | null
  manuName?: string | null
  qualifierId?: string | null
  qualifierCode?: string | null
  colorCode?: boolean
  longComment?: string | null
  email?: string | null
}

export interface VendorStoreAccount {
  code: string
  storeId: number
  accountNo: string
  dateLastChanged: string | null
}
