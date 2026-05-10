import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ActivityReviewPage from '../pages/operations/ActivityReviewPage'

const apiMock = vi.hoisted(() => ({
  listEvents: vi.fn(),
  getSummary: vi.fn(),
  updateReview: vi.fn(),
  eventsCsvUrl: vi.fn(),
}))

vi.mock('../services/activityReviewApi', () => ({
  activityReviewApi: apiMock,
}))

const event = {
  id: 'audit-1',
  occurredAt: '2026-05-09T18:00:00.000Z',
  module: 'products',
  action: 'SKU_UPDATE',
  actionLabel: 'SKU Update',
  category: 'change',
  riskLevel: 'MEDIUM',
  outcome: 'SUCCESS',
  actorUserId: 'user-1',
  actorName: 'Manager User',
  actorEmail: 'manager@example.com',
  resourceType: 'products.sku',
  resourceId: 'SKU-1',
  resourceLabel: 'SKU-1',
  storeId: '101',
  registerId: 'POS-1',
  ipAddress: '127.0.0.1',
  userAgent: 'vitest',
  reason: 'Corrected category',
  beforeJson: { category: 'OLD' },
  afterJson: { category: 'NEW' },
  metadataJson: { module: 'products', storeId: '101' },
  reviewStatus: 'UNREVIEWED',
  reviewedByUserId: null,
  reviewedAt: null,
  reviewNote: null,
}

const summary = {
  actorUserId: 'user-1',
  actorName: 'Manager User',
  actorEmail: 'manager@example.com',
  lastActivityAt: '2026-05-09T18:00:00.000Z',
  totalEvents: 1,
  todayEvents: 1,
  thisWeekEvents: 1,
  highRiskEvents: 0,
  failedEvents: 0,
  flaggedEvents: 0,
  modules: ['products'],
  categories: { change: 1 },
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <ConfigProvider>
      <QueryClientProvider client={queryClient}>
        <ActivityReviewPage />
      </QueryClientProvider>
    </ConfigProvider>,
  )
}

describe('ActivityReviewPage', () => {
  beforeEach(() => {
    apiMock.listEvents.mockReset()
    apiMock.getSummary.mockReset()
    apiMock.updateReview.mockReset()
    apiMock.eventsCsvUrl.mockReset()
    apiMock.listEvents.mockResolvedValue({ events: [event] })
    apiMock.getSummary.mockResolvedValue({ summary: [summary] })
    apiMock.updateReview.mockResolvedValue({ event: { ...event, reviewStatus: 'FLAGGED' } })
    apiMock.eventsCsvUrl.mockReturnValue('/api/v1/activity-review/events.csv')
  })

  it('renders the activity table and user summary', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Activity Review' })).toBeInTheDocument()
    expect(await screen.findByText('SKU Update')).toBeInTheDocument()
    expect(screen.getByText('Manager User')).toBeInTheDocument()
    expect(screen.getByText('MEDIUM')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'User Summary' }))
    expect(await screen.findByText('This Week')).toBeInTheDocument()
    expect(screen.getAllByText('Products').length).toBeGreaterThan(0)
  })

  it('sends filters and review workflow updates', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()

    await screen.findByText('SKU Update')
    await user.type(screen.getByPlaceholderText('Search'), 'category')

    await waitFor(() => {
      expect(apiMock.listEvents).toHaveBeenCalledWith(expect.objectContaining({ search: 'category' }))
    })

    const expandButton = container.querySelector('.ant-table-row-expand-icon') as HTMLButtonElement | null
    expect(expandButton).toBeTruthy()
    await user.click(expandButton!)

    expect(await screen.findByText('Changed Fields')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('Manager note'), 'Needs follow-up')
    await user.click(screen.getByRole('button', { name: /Flag/i }))

    await waitFor(() => {
      expect(apiMock.updateReview).toHaveBeenCalledWith('audit-1', {
        status: 'FLAGGED',
        reviewNote: 'Needs follow-up',
      })
    })
  })

  it('opens the filtered CSV export', async () => {
    const user = userEvent.setup()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderPage()

    await screen.findByText('SKU Update')
    await user.click(screen.getByRole('button', { name: /Export/i }))

    expect(apiMock.eventsCsvUrl).toHaveBeenCalled()
    expect(open).toHaveBeenCalledWith('/api/v1/activity-review/events.csv', '_self')
  })
})
