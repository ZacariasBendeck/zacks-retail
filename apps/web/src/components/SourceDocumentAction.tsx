import { Button, Typography } from 'antd'
import type { SourceDocumentType } from '../types/inventoryMovement'

export interface SourceDocumentActionProps {
  sourceDocumentType?: SourceDocumentType
  sourceDocumentId?: string
  sourceDocumentNumber?: string | null
  onNavigate?: (path: string) => void
}

function buildQueryPath(basePath: string, key: string, value: string): string {
  const searchParams = new URLSearchParams({ [key]: value })
  return `${basePath}?${searchParams.toString()}`
}

export function buildSourceDocumentPath(
  sourceDocumentType: SourceDocumentType,
  sourceDocumentId: string,
): string {
  switch (sourceDocumentType) {
    case 'sale':
      return buildQueryPath('/inventory/sales-ledger', 'sourceSaleId', sourceDocumentId)
    case 'po_receipt':
      return buildQueryPath('/purchasing/receive', 'receiptLineId', sourceDocumentId)
    case 'transfer':
      return buildQueryPath('/inventory/balances', 'transferLineId', sourceDocumentId)
    case 'adjustment':
      return buildQueryPath('/inventory/adjustments', 'adjustmentLineId', sourceDocumentId)
    default:
      return '/inventory'
  }
}

export default function SourceDocumentAction({
  sourceDocumentType,
  sourceDocumentId,
  sourceDocumentNumber,
  onNavigate,
}: SourceDocumentActionProps) {
  if (!sourceDocumentType || !sourceDocumentId) {
    return <Typography.Text type="secondary">—</Typography.Text>
  }

  const destination = buildSourceDocumentPath(sourceDocumentType, sourceDocumentId)
  const label = sourceDocumentNumber?.trim() || sourceDocumentId

  if (onNavigate) {
    return (
      <Button type="link" size="small" onClick={() => onNavigate(destination)}>
        {label}
      </Button>
    )
  }

  return (
    <Button type="link" size="small" href={destination}>
      {label}
    </Button>
  )
}
