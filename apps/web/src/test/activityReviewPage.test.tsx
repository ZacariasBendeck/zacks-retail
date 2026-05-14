import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import ActivityReviewPage from '../pages/operations/ActivityReviewPage'

const apiMock = vi.hoisted(() => ({
  listEvents: vi.fn(),
  getSummary: vi.fn(),
  updateReview: vi.fn(),
  bulkReview: vi.fn(),
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

const highRiskEvent = {
  ...event,
  id: 'audit-high',
  action: 'ROLE_PERMISSION_UPDATE',
  actionLabel: 'Role Permission Update',
  module: 'identity_access',
  category: 'access_control',
  riskLevel: 'HIGH',
  resourceType: 'identity.role',
  resourceId: 'role-1',
  resourceLabel: 'OWNER',
  metadataJson: { module: 'identity_access' },
}

const orphanActorEvent = {
  ...event,
  id: 'audit-orphan',
  actionLabel: 'Orphan Actor Activity',
  actorUserId: 'user-orphan-abcdef',
  actorName: null,
  actorEmail: null,
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

const orphanActorSummary = {
  ...summary,
  actorUserId: 'user-orphan-abcdef',
  actorName: 'System',
  actorEmail: null,
  totalEvents: 2,
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <ConfigProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ActivityReviewPage />
        </MemoryRouter>
      </QueryClientProvider>
    </ConfigProvider>,
  )
}

describe('ActivityReviewPage', () => {
  beforeEach(() => {
    apiMock.listEvents.mockReset()
    apiMock.getSummary.mockReset()
    apiMock.updateReview.mockReset()
    apiMock.bulkReview.mockReset()
    apiMock.eventsCsvUrl.mockReset()
    apiMock.listEvents.mockResolvedValue({ events: [event] })
    apiMock.getSummary.mockResolvedValue({ summary: [summary] })
    apiMock.updateReview.mockResolvedValue({ event: { ...event, reviewStatus: 'FLAGGED' } })
    apiMock.bulkReview.mockResolvedValue({
      status: 'NO_ISSUE',
      updatedCount: 1,
      skippedCount: 0,
      skippedEvents: [],
      hasMore: false,
    })
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
    expect(screen.queryByRole('combobox', { name: 'Activity result limit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Select all visible/i })).not.toBeInTheDocument()
  })

  it('labels missing actor records as unknown users instead of duplicate system users', async () => {
    const user = userEvent.setup()
    apiMock.listEvents.mockResolvedValue({ events: [event, orphanActorEvent] })
    apiMock.getSummary.mockResolvedValue({ summary: [summary, orphanActorSummary] })
    renderPage()

    expect(await screen.findByText('Unknown user (user-orp)')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Activity user filter' }))
    expect(await screen.findByTitle('Unknown user (user-orp)')).toBeInTheDocument()
  })

  it('defaults to unreviewed activity without capping the user summary', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('SKU Update')

    await waitFor(() => {
      expect(apiMock.listEvents).toHaveBeenCalledWith(expect.objectContaining({
        reviewStatus: 'UNREVIEWED',
        limit: 100,
      }))
    })
    await waitFor(() => {
      expect(apiMock.getSummary).toHaveBeenCalledWith(expect.objectContaining({
        reviewStatus: 'UNREVIEWED',
      }))
    })
    const lastSummaryCall = apiMock.getSummary.mock.calls[apiMock.getSummary.mock.calls.length - 1]?.[0]
    expect(lastSummaryCall).not.toHaveProperty('limit')

    await user.click(screen.getByRole('button', { name: /Ayuda/i }))
    expect(await screen.findByText('Activity review cadence')).toBeInTheDocument()
    expect(screen.getByText(/Daily: inspect high-risk/i)).toBeInTheDocument()
    expect(screen.getByText(/Weekly: filter repetitive LOW or MEDIUM/i)).toBeInTheDocument()
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
    const detailFlagButton = screen
      .getAllByRole('button', { name: /Flag/i })
      .find((button) => !button.hasAttribute('disabled'))
    expect(detailFlagButton).toBeTruthy()
    await user.click(detailFlagButton!)

    await waitFor(() => {
      expect(apiMock.updateReview).toHaveBeenCalledWith('audit-1', {
        status: 'FLAGGED',
        reviewNote: 'Needs follow-up',
      })
    })
  })

  it('bulk reviews selected rows and surfaces skipped rows', async () => {
    const user = userEvent.setup()
    apiMock.listEvents.mockResolvedValue({ events: [event, highRiskEvent] })
    apiMock.bulkReview.mockResolvedValue({
      status: 'NO_ISSUE',
      updatedCount: 1,
      skippedCount: 1,
      skippedEvents: [{
        id: 'audit-high',
        occurredAt: highRiskEvent.occurredAt,
        actionLabel: highRiskEvent.actionLabel,
        module: highRiskEvent.module,
        outcome: highRiskEvent.outcome,
        riskLevel: highRiskEvent.riskLevel,
        reviewStatus: highRiskEvent.reviewStatus,
      }],
      hasMore: false,
    })
    renderPage()

    await screen.findByText('SKU Update')
    await user.click(screen.getByRole('button', { name: /Select all visible/i }))

    expect(screen.getByText('2 selected')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Mark No Issue/i }))
    expect(await screen.findByText(/This will apply to 2 selected rows/i)).toBeInTheDocument()
    await user.type(
      screen.getByPlaceholderText(/Routine successful POS/i),
      'Routine successful activity. Spot-checked sample.',
    )
    await user.click(screen.getByRole('button', { name: /Save bulk review/i }))

    await waitFor(() => {
      expect(apiMock.bulkReview).toHaveBeenCalledWith({
        mode: 'IDS',
        eventIds: ['audit-1', 'audit-high'],
        status: 'NO_ISSUE',
        reviewNote: 'Routine successful activity. Spot-checked sample.',
      })
    })
    expect((await screen.findAllByText(/1 updated, 1 skipped/i)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Role Permission Update/i).length).toBeGreaterThan(0)
  })

  it('bulk reviews all rows matching the current filters', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('SKU Update')
    await user.click(screen.getByRole('button', { name: /Apply to all matching filters/i }))
    expect(await screen.findByText(/all rows matching the current filters/i)).toBeInTheDocument()
    await user.type(
      screen.getByPlaceholderText(/Routine successful POS/i),
      'Routine successful low-risk backlog. Spot-checked visible rows.',
    )
    await user.click(screen.getByRole('button', { name: /Save bulk review/i }))

    await waitFor(() => {
      expect(apiMock.bulkReview).toHaveBeenCalledWith({
        mode: 'FILTER',
        filters: expect.objectContaining({
          reviewStatus: 'UNREVIEWED',
          limit: 100,
        }),
        status: 'NO_ISSUE',
        reviewNote: 'Routine successful low-risk backlog. Spot-checked visible rows.',
      })
    })
  })

  it('offers activity result limits above 200', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('SKU Update')
    await user.click(screen.getByRole('combobox', { name: 'Activity result limit' }))
    await user.click(await screen.findByTitle('5000'))

    await waitFor(() => {
      expect(apiMock.listEvents).toHaveBeenCalledWith(expect.objectContaining({ limit: 5000 }))
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
