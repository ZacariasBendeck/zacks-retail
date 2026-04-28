import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomerTicketHistoryButton } from '../components/customers/CustomerTicketHistoryButton'
import { useCustomerTicketHistory } from '../hooks/useCustomers'

vi.mock('../hooks/useCustomers', () => ({
  useCustomerTicketHistory: vi.fn(),
}))

describe('CustomerTicketHistoryButton', () => {
  beforeEach(() => {
    vi.mocked(useCustomerTicketHistory).mockImplementation((_customerId, enabled) => ({
      data: enabled
        ? [
            {
              id: 'ticket-305',
              externalTransactionId: 'external-305',
              ticketNumber: 305,
              purchasedAt: '2026-04-21T14:30:00.000Z',
              storeId: 7,
              storeName: 'Downtown Store',
              channel: 'store',
              status: 'completed',
              transactionKind: 'purchase',
              lineCount: 2,
              quantity: 3,
              vendorSummary: 'Test Vendor',
              categorySummary: 'Test Dresses',
              totalAmountCents: 23000,
              netAmountCents: 20000,
              discountAmountCents: 0,
              grossProfitPct: 65,
            },
          ]
        : undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    }) as never)
  })

  it('opens the popup and renders vendor, department, and gp columns without ticket number', async () => {
    const user = userEvent.setup()

    render(
      <ConfigProvider>
        <CustomerTicketHistoryButton customerId="customer-1" customerName="Maria Test" />
      </ConfigProvider>,
    )

    expect(vi.mocked(useCustomerTicketHistory)).toHaveBeenLastCalledWith('customer-1', false)

    await user.click(screen.getByRole('button', { name: /Tickets/i }))

    expect(await screen.findByText(/Ticket History/)).toBeInTheDocument()
    expect(vi.mocked(useCustomerTicketHistory)).toHaveBeenLastCalledWith('customer-1', true)
    expect(screen.getByText('Test Vendor')).toBeInTheDocument()
    expect(screen.getByText('Test Dresses')).toBeInTheDocument()
    expect(screen.getByText('230.00')).toBeInTheDocument()
    expect(screen.getByText('65.0%')).toBeInTheDocument()
    expect(screen.queryByText('Ticket #')).not.toBeInTheDocument()
    expect(screen.queryByText('Register')).not.toBeInTheDocument()
  })
})
