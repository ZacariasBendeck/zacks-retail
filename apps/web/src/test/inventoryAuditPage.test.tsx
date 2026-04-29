import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { describe, expect, it, vi } from 'vitest'
import InventoryAuditPage from '../pages/inventory/InventoryAuditPage'
import { useChangeDetail, useInventoryInquiry } from '../hooks/useRicsInventory'
import { useStores } from '../hooks/useStores'

vi.mock('../hooks/useRicsInventory', () => ({
  useInventoryInquiry: vi.fn(),
  useChangeDetail: vi.fn(),
}))

vi.mock('../hooks/useStores', () => ({
  useStores: vi.fn(),
}))

vi.mock('../components/sku-lookup', () => ({
  SkuLookup: () => null,
}))

describe('InventoryAuditPage', () => {
  it('loads store choices from store master after SKU entry even when inquiry has no store rows', async () => {
    const user = userEvent.setup()

    vi.mocked(useInventoryInquiry).mockReturnValue({
      data: {
        sku: 'NOQTY',
        stores: [],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useInventoryInquiry>)
    vi.mocked(useStores).mockReturnValue({
      data: [
        {
          id: 1,
          code: '1',
          name: 'Main Store',
          active: true,
          chainId: null,
          chainLabel: null,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useStores>)
    vi.mocked(useChangeDetail).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useChangeDetail>)

    render(
      <ConfigProvider>
        <InventoryAuditPage />
      </ConfigProvider>,
    )

    await user.type(screen.getByPlaceholderText('e.g. B1592-BKNU'), 'NOQTY')
    await user.click(screen.getByRole('combobox'))

    expect(await screen.findByText('1 - Main Store (on-hand 0)')).toBeInTheDocument()
  })
})
