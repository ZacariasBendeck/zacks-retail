import { render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import CasePacksPage from '../pages/fileSetup/CasePacksPage'
import { useCasePack, useCasePacks } from '../hooks/useCasePacks'

vi.mock('../hooks/useCasePacks', () => ({
  useCasePacks: vi.fn(),
  useCasePack: vi.fn(),
}))

function renderPage() {
  return render(
    <ConfigProvider>
      <MemoryRouter>
        <CasePacksPage />
      </MemoryRouter>
    </ConfigProvider>,
  )
}

describe('CasePacksPage', () => {
  it('renders case pack list and selected cell detail', () => {
    vi.mocked(useCasePacks).mockReturnValue({
      data: [
        {
          code: 'A12',
          description: 'Assorted 12 pack',
          sizeTypeCode: 101,
          active: true,
          dateLastChanged: '2026-04-27T12:00:00.000Z',
          totalUnits: 12,
          cellCount: 2,
          skuCount: 7,
        },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useCasePack).mockReturnValue({
      data: {
        code: 'A12',
        description: 'Assorted 12 pack',
        sizeTypeCode: 101,
        active: true,
        dateLastChanged: '2026-04-27T12:00:00.000Z',
        totalUnits: 12,
        cellCount: 2,
        skuCount: 7,
        cells: [
          { rowLabel: '', columnLabel: 'Small', quantity: 6 },
          { rowLabel: '', columnLabel: 'Medium', quantity: 6 },
        ],
      },
      isLoading: false,
    } as never)

    renderPage()

    expect(screen.getByRole('heading', { name: 'Case Packs' })).toBeInTheDocument()
    expect(screen.getAllByText('A12').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Assorted 12 pack').length).toBeGreaterThan(0)
    expect(screen.getAllByText('7').length).toBeGreaterThan(0)
    expect(screen.getByText('Small')).toBeInTheDocument()
    expect(screen.getByText('Medium')).toBeInTheDocument()
  })
})
