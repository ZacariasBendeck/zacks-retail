import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PoReceivePage from '../pages/inventory/PoReceivePage'
import {
  usePurchaseOrder,
  usePurchaseOrderReceipts,
  useReceivePurchaseOrder,
} from '../hooks/usePurchaseOrders'
import { useLocations } from '../hooks/useAdjustments'

const mockMutateAsync = vi.fn()

vi.mock('../hooks/usePurchaseOrders', () => ({
  usePurchaseOrders: vi.fn(),
  usePurchaseOrder: vi.fn(),
  useReceivePurchaseOrder: vi.fn(),
  usePurchaseOrderReceipts: vi.fn(),
}))

vi.mock('../hooks/useAdjustments', () => ({
  useLocations: vi.fn(),
}))

describe('PoReceivePage discrepancy flow', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset().mockResolvedValue({})

    vi.mocked(usePurchaseOrder).mockReturnValue({
      data: {
        id: 'po-1',
        poNumber: 'PO-000001',
        vendorId: 'vendor-1',
        vendorName: 'Test Vendor',
        status: 'CONFIRMED',
        notes: null,
        cancellationReason: null,
        createdBy: 'planner',
        subtotal: 100,
        createdAt: '2026-04-01T12:00:00.000Z',
        updatedAt: '2026-04-02T12:00:00.000Z',
        lineItems: [
          {
            id: 'line-1',
            poId: 'po-1',
            skuId: 'sku-1',
            skuCode: 'SKU-001',
            brand: 'Style A',
            quantityOrdered: 10,
            quantityReceived: 0,
            unitCost: 10,
            lineTotal: 100,
            createdAt: '2026-04-01T12:00:00.000Z',
            updatedAt: '2026-04-02T12:00:00.000Z',
          },
        ],
      },
      isLoading: false,
    } as never)

    vi.mocked(usePurchaseOrderReceipts).mockReturnValue({
      data: [],
      isLoading: false,
    } as never)

    vi.mocked(useReceivePurchaseOrder).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as never)

    vi.mocked(useLocations).mockReturnValue({
      data: [{ id: 'loc-01', name: 'Main Warehouse' }],
    } as never)
  })

  it('requires a variance reason for partial receipts and sends audit fields once provided', async () => {
    const user = userEvent.setup()

    render(
      <ConfigProvider>
        <MemoryRouter initialEntries={['/purchasing/receive/po-1']}>
          <Routes>
            <Route path="/purchasing/receive/:poId" element={<PoReceivePage />} />
          </Routes>
        </MemoryRouter>
      </ConfigProvider>,
    )

    const qtyInput = screen.getByRole('spinbutton')
    await user.click(qtyInput)
    await user.keyboard('{Control>}a{/Control}5')

    const confirmButton = screen.getByRole('button', { name: /Confirm Receipt/i })
    await user.click(confirmButton)
    expect(mockMutateAsync).not.toHaveBeenCalled()

    expect(screen.getAllByLabelText('Variance reason code').length).toBeGreaterThan(0)
    await user.type(screen.getByLabelText('Variance notes'), 'Vendor short packed carton 2')
    await user.type(screen.getByLabelText('Receipt reference number'), 'RCV-42')
    await user.type(screen.getByLabelText('Received by'), 'warehouse.user')

    await user.click(confirmButton)

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1)
    })

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        poId: 'po-1',
        payload: expect.objectContaining({
          lines: [{ lineId: 'line-1', quantityReceived: 5 }],
          locationId: 'loc-01',
          referenceNumber: 'RCV-42',
          receivedBy: 'warehouse.user',
          reason: expect.stringContaining('Vendor short packed carton 2'),
        }),
      }),
    )
  })
})
