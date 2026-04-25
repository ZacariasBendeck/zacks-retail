/**
 * Informal store-chain rosters per docs/COMPANY.md "Chain structure".
 *
 * Until `app.store_group` + `app.store_group_member` land with purchase-planning
 * v2, this is the canonical client-side mapping. Update both this file and
 * `docs/COMPANY.md` when the rosters change.
 */

export interface StoreChain {
  /** Stable id used as the Select value. */
  id: string
  /** Display label. */
  label: string
  /** Authoritative store numbers in this chain (per docs/COMPANY.md). */
  storeNumbers: number[]
}

export const STORE_CHAINS: StoreChain[] = [
  {
    id: 'unlimited',
    label: 'Unlimited',
    storeNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 26, 28, 29, 30, 31, 32, 33, 34],
  },
  {
    id: 'magic-shoes',
    label: 'Magic Shoes & Fashion',
    storeNumbers: [10, 16, 17, 20, 21, 22, 24, 25, 35, 41, 42, 43],
  },
]
