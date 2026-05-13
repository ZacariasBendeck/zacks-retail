import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LegacyInquiryRedirect, LegacySkuEditRedirect } from '../App'

function LocationEcho() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

describe('LegacyInquiryRedirect', () => {
  it('redirects /inventory/inquiry/:skuCode to /products/inquiry/:skuCode and preserves query params', async () => {
    render(
      <MemoryRouter initialEntries={['/inventory/inquiry/ZN02-NDPT?storeId=21&mode=ON_HAND&tab=DETAIL']}>
        <Routes>
          <Route path="/inventory/inquiry/:skuCode" element={<LegacyInquiryRedirect />} />
          <Route path="/products/inquiry/:skuCode" element={<LocationEcho />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/products/inquiry/ZN02-NDPT?storeId=21&mode=ON_HAND&tab=DETAIL',
    )
  })

  it('redirects /inventory/inquiry without a SKU to /products/inquiry', async () => {
    render(
      <MemoryRouter initialEntries={['/inventory/inquiry?mode=ALL_STORES_SUMMARY']}>
        <Routes>
          <Route path="/inventory/inquiry" element={<LegacyInquiryRedirect />} />
          <Route path="/products/inquiry" element={<LocationEcho />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/products/inquiry?mode=ALL_STORES_SUMMARY',
    )
  })
})

describe('LegacySkuEditRedirect', () => {
  it('redirects /products/skus/:code to the modern edit route', async () => {
    render(
      <MemoryRouter initialEntries={['/products/skus/PA3053839SBL2']}>
        <Routes>
          <Route path="/products/skus/:code" element={<LegacySkuEditRedirect />} />
          <Route path="/products/skus/:skuId/edit" element={<LocationEcho />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/products/skus/PA3053839SBL2/edit',
    )
  })
})
