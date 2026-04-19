import { describe, expect, it } from 'vitest'
import {
  DomainFilterContractError,
  appendDomainFilterContract,
  appendServerTableContract,
} from '../services/domainFilterContract'

describe('domainFilterContract', () => {
  it('serializes valid department/category filters', () => {
    const params = new URLSearchParams()
    appendDomainFilterContract(params, { department: 'FORMAL', category: 556 })

    expect(params.get('department')).toBe('FORMAL')
    expect(params.get('category')).toBe('556')
  })

  it('rejects category values outside womens range', () => {
    const params = new URLSearchParams()

    expect(() =>
      appendDomainFilterContract(params, { department: 'CASUAL', category: 700 }),
    ).toThrow(DomainFilterContractError)
  })

  it('rejects invalid department values', () => {
    const params = new URLSearchParams()

    expect(() =>
      appendDomainFilterContract(params, { department: 'UNKNOWN' }),
    ).toThrow(DomainFilterContractError)
  })

  it('rejects category-only filters when department is required', () => {
    const params = new URLSearchParams()

    expect(() =>
      appendDomainFilterContract(
        params,
        { category: 560 },
        { requireDepartmentForCategory: true },
      ),
    ).toThrow('Category filters require a department selection.')
  })

  it('serializes server-side table controls', () => {
    const params = new URLSearchParams()
    appendServerTableContract(params, {
      page: 2,
      pageSize: 100,
      sort: 'totalRevenue',
      order: 'desc',
    })

    expect(params.get('page')).toBe('2')
    expect(params.get('pageSize')).toBe('100')
    expect(params.get('sort')).toBe('totalRevenue')
    expect(params.get('order')).toBe('desc')
  })
})
