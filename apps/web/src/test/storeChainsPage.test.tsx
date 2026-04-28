import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntApp, ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import StoreChainsPage from '../pages/utilities/StoreChainsPage'
import { useCreateStoreChain, useStoreChains, useUpdateStoreChain } from '../hooks/useStores'

vi.mock('../hooks/useStores', () => ({
  useStoreChains: vi.fn(),
  useCreateStoreChain: vi.fn(),
  useUpdateStoreChain: vi.fn(),
}))

function renderPage() {
  return render(
    <ConfigProvider>
      <AntApp>
        <MemoryRouter>
          <StoreChainsPage />
        </MemoryRouter>
      </AntApp>
    </ConfigProvider>,
  )
}

describe('StoreChainsPage', () => {
  it('renders store chains and allows editing the selected chain', async () => {
    const updateMutateAsync = vi.fn().mockResolvedValue(undefined)

    vi.mocked(useStoreChains).mockReturnValue({
      data: [
        {
          id: 'unlimited',
          label: 'Unlimited',
          active: true,
          sortOrder: 10,
          storeNumbers: [1, 2, 3],
          storeCount: 3,
        },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useCreateStoreChain).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(useUpdateStoreChain).mockReturnValue({
      mutateAsync: updateMutateAsync,
      isPending: false,
    } as never)

    renderPage()

    expect(screen.getByText('Unlimited')).toBeInTheDocument()
    expect(screen.getByText('001')).toBeInTheDocument()
    expect(screen.getByText('002')).toBeInTheDocument()

    const labelInput = screen.getByDisplayValue('Unlimited')
    await userEvent.clear(labelInput)
    await userEvent.type(labelInput, 'Unlimited Premium')
    await userEvent.click(screen.getByRole('button', { name: 'Save chain' }))

    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: 'unlimited',
      input: {
        label: 'Unlimited Premium',
        sortOrder: 10,
        active: true,
      },
    })
  })
})
