import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import StoresPage from '../pages/utilities/StoresPage'
import { useAssignStoreChain, useStore, useStoreChains, useStores } from '../hooks/useStores'

vi.mock('../hooks/useStores', () => ({
  useStores: vi.fn(),
  useStore: vi.fn(),
  useStoreChains: vi.fn(),
  useAssignStoreChain: vi.fn(),
}))

function renderPage() {
  return render(
    <ConfigProvider>
      <AntApp>
        <MemoryRouter>
          <StoresPage />
        </MemoryRouter>
      </AntApp>
    </ConfigProvider>,
  )
}

describe('StoresPage', () => {
  it('renders the list and selected store detail', async () => {
    vi.mocked(useStores).mockReturnValue({
      data: [
        { id: 1, code: '001', name: 'Main Store', active: true, chainId: 'unlimited', chainLabel: 'Unlimited' },
        { id: 2, code: '002', name: 'Outlet', active: true, chainId: null, chainLabel: null },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useStoreChains).mockReturnValue({
      data: [
        {
          id: 'unlimited',
          label: 'Unlimited',
          active: true,
          sortOrder: 10,
          storeNumbers: [1],
          storeCount: 1,
        },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useAssignStoreChain).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(useStore).mockImplementation((id: number | null) => ({
      data: id === 2
        ? {
            id: 2,
            code: '002',
            name: 'Outlet',
            active: true,
            chainId: null,
            chainLabel: null,
            mailName: 'Outlet Corp',
            address1: '123 Central Ave',
            address2: null,
            city: 'San Pedro Sula',
            state: 'Cortes',
            zip: '21101',
            email: 'outlet@example.com',
            phone: '555-0202',
            fax: null,
            lastTicketUsed: 987,
            billToName: 'Outlet Billing',
            billToAddress1: 'PO Box 22',
            billToAddress2: null,
            billToCity: 'San Pedro Sula',
            billToState: 'Cortes',
            billToZip: '21101',
            otherChargeDescription: 'Shipping',
            region: 4,
            dateLastChanged: '2026-04-27T12:34:56.000Z',
          }
        : {
            id: 1,
            code: '001',
            name: 'Main Store',
            active: true,
            chainId: 'unlimited',
            chainLabel: 'Unlimited',
            mailName: 'Main Corp',
            address1: '456 Market St',
            address2: null,
            city: 'Tegucigalpa',
            state: 'Francisco Morazan',
            zip: '11101',
            email: 'main@example.com',
            phone: '555-0101',
            fax: null,
            lastTicketUsed: 123,
            billToName: 'Main Billing',
            billToAddress1: 'PO Box 11',
            billToAddress2: null,
            billToCity: 'Tegucigalpa',
            billToState: 'Francisco Morazan',
            billToZip: '11101',
            otherChargeDescription: 'Other Charges',
            region: 1,
            dateLastChanged: '2026-04-26T10:00:00.000Z',
          },
      isLoading: false,
    } as never))

    renderPage()

    expect(screen.getByRole('heading', { name: 'Main Store' })).toBeInTheDocument()
    expect(screen.getByText('Main Billing')).toBeInTheDocument()
    expect(screen.getAllByText('Unlimited').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'Outlet' }))

    expect(screen.getByRole('heading', { name: 'Outlet' })).toBeInTheDocument()
    expect(screen.getByText('Outlet Billing')).toBeInTheDocument()
    expect(screen.getByText('Shipping')).toBeInTheDocument()
    expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0)
  })
})
