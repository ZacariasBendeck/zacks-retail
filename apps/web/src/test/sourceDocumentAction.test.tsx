import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import { describe, expect, it, vi } from 'vitest'
import SourceDocumentAction, { buildSourceDocumentPath } from '../components/SourceDocumentAction'

describe('SourceDocumentAction', () => {
  it('renders placeholder when no source reference exists', () => {
    render(
      <ConfigProvider>
        <SourceDocumentAction />
      </ConfigProvider>,
    )

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('routes source document drill-down interactions to the mapped module path', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    render(
      <ConfigProvider>
        <SourceDocumentAction
          sourceDocumentType="po_receipt"
          sourceDocumentId="rcpt-19"
          sourceDocumentNumber="PO-19 / Line 4"
          onNavigate={onNavigate}
        />
      </ConfigProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'PO-19 / Line 4' }))

    expect(onNavigate).toHaveBeenCalledWith('/purchasing/receive?receiptLineId=rcpt-19')
  })

  it('builds deterministic module paths for all source document types', () => {
    expect(buildSourceDocumentPath('sale', 's-1')).toBe('/inventory/sales-ledger?sourceSaleId=s-1')
    expect(buildSourceDocumentPath('po_receipt', 'p-1')).toBe('/purchasing/receive?receiptLineId=p-1')
    expect(buildSourceDocumentPath('transfer', 't-1')).toBe('/inventory/balances?transferLineId=t-1')
    expect(buildSourceDocumentPath('adjustment', 'a-1')).toBe(
      '/inventory/adjustments?adjustmentLineId=a-1',
    )
  })
})
