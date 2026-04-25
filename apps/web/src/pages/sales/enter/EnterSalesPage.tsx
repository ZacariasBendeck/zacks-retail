import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  App as AntApp,
  AutoComplete,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Result,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { InputRef } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { salesPosApi, type PosHeaderPatchInput, type PosLineInput } from '../../../services/salesPosApi'
import type {
  CustomerSearchResult,
  PosBootstrap,
  PosClosePreview,
  PosProductLookup,
  PosReceipt,
  PosTicket,
  PosTicketLine,
  PosTicketListItem,
} from '../../../types/salesPos'

const numberFormatter = new Intl.NumberFormat('es-HN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const transactionOptions = [
  { value: 'REGULAR', label: '1 - Regular Sale' },
  { value: 'USER_DEFINED', label: '2 - User Defined' },
  { value: 'SPECIAL_ORDER_PICKUP', label: '3 - Special Order Pickup' },
  { value: 'LAYAWAY_SALE', label: '4 - Layaway Sale' },
  { value: 'GIFT_CARD_SALE', label: '5 - Gift Card Sale' },
  { value: 'HOUSE_CHARGE_PAYMENT', label: '6 - Charge Payment' },
  { value: 'SPECIAL_ORDER_DEPOSIT', label: '7 - Special Order Deposit' },
  { value: 'LAYAWAY_PAYMENT', label: '8 - Layaway Payment' },
] as const

type OverrideScope = 'VOID' | 'REFUND' | 'REPRINT' | 'CLOSE_BATCH' | 'PAY_OUT'

interface PendingLineForm {
  code: string
  quantity: number
  columnLabel: string
  rowLabel: string
  unitPrice: number
  priceMode: 'RETAIL' | 'MARKDOWN1' | 'MARKDOWN2' | 'LIST' | 'MANUAL'
  discountPct: number | null
  discountAmount: number | null
  taxable: boolean
  secondaryTaxRate: number
  salespersonUserId?: string | null
  salespersonCode?: string | null
  salespersonName?: string | null
  returnCode?: number | null
  comment?: string | null
}

interface HeaderDraft {
  cashierUserId?: string
  cashierName?: string | null
  customerId?: string | null
  customerAccountNumber?: string | null
  customerName?: string | null
  headerDiscountPct?: number | null
  promotionCode?: string | null
  shipToState?: string | null
  transactionType?: string
  comment?: string | null
  otherCharges?: number
}

interface PaymentDraft {
  tenders: Array<{
    tenderTypeId: string
    amount: number
    accountNumber?: string | null
    reference?: string | null
  }>
  comment: string
  promotionCode: string
  otherCharges: number
}

interface OverrideRequest {
  title: string
  scope: OverrideScope
  action: string
  ticketId?: string
  onApprove: (overrideToken: string) => Promise<void>
}

function formatMoney(value: number | null | undefined) {
  return numberFormatter.format(value ?? 0)
}

function formatTicketStatus(status: string) {
  switch (status) {
    case 'COMPLETED':
      return 'green'
    case 'VOIDED':
      return 'red'
    default:
      return 'blue'
  }
}

function makeDefaultPendingLine(data: PosBootstrap | undefined): PendingLineForm {
  return {
    code: '',
    quantity: 1,
    columnLabel: '',
    rowLabel: '',
    unitPrice: 0,
    priceMode: 'RETAIL',
    discountPct: null,
    discountAmount: null,
    taxable: true,
    secondaryTaxRate: 0,
    salespersonUserId: data?.currentUser.id,
    salespersonCode: data?.currentUser.salespersonCode ?? null,
    salespersonName: data?.currentUser.displayName ?? null,
    returnCode: null,
    comment: '',
  }
}

function makeHeaderDraft(ticket: PosTicket | null): HeaderDraft {
  return {
    cashierUserId: ticket?.cashierUserId,
    cashierName: ticket?.cashierName ?? null,
    customerId: ticket?.customerId ?? null,
    customerAccountNumber: ticket?.customerAccountNumber ?? null,
    customerName: ticket?.customerName ?? null,
    headerDiscountPct: ticket?.headerDiscountPct ?? null,
    promotionCode: ticket?.promotionCode ?? null,
    shipToState: ticket?.shipToState ?? null,
    transactionType: ticket?.transactionType ?? 'REGULAR',
    comment: ticket?.comment ?? null,
    otherCharges: ticket?.otherCharges ?? 0,
  }
}

function makePaymentDraft(ticket: PosTicket | null, bootstrap: PosBootstrap | undefined): PaymentDraft {
  const defaultTender = bootstrap?.tenderTypes[0]
  return {
    tenders: ticket && defaultTender
      ? [{ tenderTypeId: defaultTender.id, amount: ticket.grandTotal, accountNumber: '', reference: '' }]
      : [],
    comment: ticket?.comment ?? '',
    promotionCode: ticket?.promotionCode ?? '',
    otherCharges: ticket?.otherCharges ?? 0,
  }
}

function nextPriceSlot(lookup: PosProductLookup, currentPriceMode: PendingLineForm['priceMode']) {
  if (lookup.priceSlots.length === 0) return { priceMode: currentPriceMode, unitPrice: 0 }
  const index = lookup.priceSlots.findIndex((slot) => slot.code === currentPriceMode)
  const next = lookup.priceSlots[(index + 1 + lookup.priceSlots.length) % lookup.priceSlots.length]
  if (!next) {
    return { priceMode: currentPriceMode, unitPrice: 0 }
  }
  return {
    priceMode: next.code,
    unitPrice: next.amount,
  }
}

function ReceiptPreview({ receipt }: { receipt: PosReceipt | null }) {
  if (!receipt) {
    return <Typography.Text type="secondary">No receipt generated yet.</Typography.Text>
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div>
        <Typography.Title level={5} style={{ marginBottom: 0 }}>
          {receipt.storeName}
        </Typography.Title>
        <Typography.Text type="secondary">
          Ticket {receipt.ticketNumber} • Register {receipt.registerCode}
        </Typography.Text>
      </div>

      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="Business Date">{dayjs(receipt.businessDate).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
        <Descriptions.Item label="Cashier">{receipt.cashierName}</Descriptions.Item>
        <Descriptions.Item label="Customer">{receipt.customerName || '-'}</Descriptions.Item>
        <Descriptions.Item label="Transaction">{receipt.transactionType}</Descriptions.Item>
        <Descriptions.Item label="Promo">{receipt.promotionCode || '-'}</Descriptions.Item>
      </Descriptions>

      <Table
        size="small"
        pagination={false}
        rowKey={(line) => `${line.skuCode}-${line.description}-${line.size}`}
        columns={[
          { title: 'Description', dataIndex: 'description', key: 'description' },
          { title: 'SKU', dataIndex: 'skuCode', key: 'skuCode', width: 120 },
          { title: 'Size', dataIndex: 'size', key: 'size', width: 90 },
          { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 70, align: 'right' },
          { title: 'Price', dataIndex: 'unitPrice', key: 'unitPrice', width: 110, align: 'right', render: (value: number) => formatMoney(value) },
          { title: 'Total', dataIndex: 'total', key: 'total', width: 110, align: 'right', render: (value: number) => formatMoney(value) },
        ]}
        dataSource={receipt.lines}
      />

      <Table
        size="small"
        pagination={false}
        rowKey={(row) => row.label}
        columns={[
          { title: 'Tender', dataIndex: 'label', key: 'label' },
          { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right', render: (value: number) => formatMoney(value) },
        ]}
        dataSource={receipt.tenders}
      />

      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="Subtotal">{formatMoney(receipt.totals.subtotal)}</Descriptions.Item>
        <Descriptions.Item label="15% ISV">{formatMoney(receipt.totals.tax)}</Descriptions.Item>
        <Descriptions.Item label="ISV.Ad">{formatMoney(receipt.totals.secondaryTax)}</Descriptions.Item>
        <Descriptions.Item label="Other Charges">{formatMoney(receipt.totals.otherCharges)}</Descriptions.Item>
        <Descriptions.Item label="Grand Total">{formatMoney(receipt.totals.grandTotal)}</Descriptions.Item>
        <Descriptions.Item label="Tendered">{formatMoney(receipt.totals.totalTendered)}</Descriptions.Item>
        <Descriptions.Item label="Change">{formatMoney(receipt.totals.change)}</Descriptions.Item>
      </Descriptions>

      <Typography.Paragraph style={{ marginBottom: 0 }}>
        {receipt.comment || 'No ticket comment.'}
      </Typography.Paragraph>
    </Space>
  )
}

export default function EnterSalesPage() {
  const { message, modal } = AntApp.useApp()
  const queryClient = useQueryClient()
  const codeInputRef = useRef<InputRef | null>(null)

  const [selectedStoreId, setSelectedStoreId] = useState<number | undefined>()
  const [selectedRegisterCode, setSelectedRegisterCode] = useState<string | undefined>()

  const [pendingLine, setPendingLine] = useState<PendingLineForm>(makeDefaultPendingLine(undefined))
  const [headerDraft, setHeaderDraft] = useState<HeaderDraft>(makeHeaderDraft(null))
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>(makePaymentDraft(null, undefined))

  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [lookupResult, setLookupResult] = useState<PosProductLookup | null>(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerOptions, setCustomerOptions] = useState<CustomerSearchResult[]>([])

  const [openingCashFloat, setOpeningCashFloat] = useState(0)
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false)
  const [headerDrawerOpen, setHeaderDrawerOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [payoutOpen, setPayoutOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [reclaimOpen, setReclaimOpen] = useState(false)
  const [reprintOpen, setReprintOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receiptPreview, setReceiptPreview] = useState<PosReceipt | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const [payoutAmount, setPayoutAmount] = useState(0)
  const [payoutCategoryId, setPayoutCategoryId] = useState<string | undefined>()
  const [payoutNote, setPayoutNote] = useState('')

  const [countedTenders, setCountedTenders] = useState<Record<string, number>>({})
  const [actualCashTotal, setActualCashTotal] = useState(0)
  const [closeNotes, setCloseNotes] = useState('')

  const [overrideRequest, setOverrideRequest] = useState<OverrideRequest | null>(null)
  const [overridePin, setOverridePin] = useState('')

  const deferredCustomerQuery = useDeferredValue(customerQuery)

  const bootstrapQuery = useQuery({
    queryKey: ['sales-pos', 'bootstrap', selectedStoreId ?? 'auto', selectedRegisterCode ?? 'auto'],
    queryFn: () => salesPosApi.getBootstrap({ storeId: selectedStoreId, registerCode: selectedRegisterCode }),
    retry: false,
  })

  const bootstrap = bootstrapQuery.data
  const shift = bootstrap?.shift ?? null
  const activeTicket = bootstrap?.activeTicket ?? null

  const closePreviewQuery = useQuery({
    queryKey: ['sales-pos', 'close-preview', shift?.id ?? 'none'],
    queryFn: () => salesPosApi.getClosePreview(shift!.id),
    enabled: closeOpen && !!shift?.id,
    retry: false,
  })

  const reclaimableTicketsQuery = useQuery({
    queryKey: ['sales-pos', 'reclaimable', shift?.id ?? 'none'],
    queryFn: () => salesPosApi.getReclaimableTickets(shift!.id),
    enabled: reclaimOpen && !!shift?.id,
    retry: false,
  })

  const completedTicketsQuery = useQuery({
    queryKey: ['sales-pos', 'completed', shift?.id ?? 'none'],
    queryFn: () => salesPosApi.getCompletedTickets(shift!.id),
    enabled: reprintOpen && !!shift?.id,
    retry: false,
  })

  useEffect(() => {
    if (!bootstrap) return
    if (selectedStoreId == null) {
      setSelectedStoreId(bootstrap.selectedStoreId)
    }
    if (!selectedRegisterCode) {
      setSelectedRegisterCode(bootstrap.selectedRegisterCode)
    }
  }, [bootstrap, selectedRegisterCode, selectedStoreId])

  useEffect(() => {
    if (!bootstrap) return
    setPendingLine((current) => {
      if (current.code || editingLineId) return current
      return makeDefaultPendingLine(bootstrap)
    })
  }, [bootstrap, editingLineId])

  useEffect(() => {
    setHeaderDraft(makeHeaderDraft(activeTicket))
    setPaymentDraft(makePaymentDraft(activeTicket, bootstrap))
    setEditingLineId(null)
    setLookupResult(null)
    setPendingLine(makeDefaultPendingLine(bootstrap))
  }, [activeTicket?.id])

  useEffect(() => {
    if (!closePreviewQuery.data) return
    const nextCounts = Object.fromEntries(
      closePreviewQuery.data.tenderTotals.map((row) => [row.tenderTypeId, row.amount]),
    )
    setCountedTenders(nextCounts)
    setActualCashTotal(closePreviewQuery.data.expectedCashTotal)
  }, [closePreviewQuery.data])

  useEffect(() => {
    let cancelled = false

    async function loadCustomers() {
      if (!deferredCustomerQuery.trim()) {
        setCustomerOptions([])
        return
      }
      try {
        const results = await salesPosApi.searchCustomers(deferredCustomerQuery)
        if (!cancelled) setCustomerOptions(results)
      } catch {
        if (!cancelled) setCustomerOptions([])
      }
    }

    loadCustomers()
    return () => {
      cancelled = true
    }
  }, [deferredCustomerQuery])

  useEffect(() => {
    if (!activeTicket) return
    const timer = window.setTimeout(() => {
      codeInputRef.current?.focus()
    }, 80)
    return () => window.clearTimeout(timer)
  }, [activeTicket?.id])

  const linesColumns: ColumnsType<PosTicketLine> = useMemo(
    () => [
      { title: 'SKU', dataIndex: 'skuCode', key: 'skuCode', width: 120 },
      {
        title: 'Description',
        dataIndex: 'description',
        key: 'description',
        render: (value: string, row) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{value}</Typography.Text>
            {row.comment ? <Typography.Text type="secondary">{row.comment}</Typography.Text> : null}
          </Space>
        ),
      },
      { title: 'Col', dataIndex: 'columnLabel', key: 'columnLabel', width: 70 },
      { title: 'Row', dataIndex: 'rowLabel', key: 'rowLabel', width: 70 },
      { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 70, align: 'right' },
      { title: 'Price', dataIndex: 'unitPrice', key: 'unitPrice', width: 110, align: 'right', render: (value) => formatMoney(value) },
      { title: 'Ext', dataIndex: 'lineTotal', key: 'lineTotal', width: 120, align: 'right', render: (value) => formatMoney(value) },
      { title: 'Slsp', dataIndex: 'salespersonCode', key: 'salespersonCode', width: 90 },
      {
        title: 'Actions',
        key: 'actions',
        width: 160,
        render: (_, row) => (
          <Space>
            <Button size="small" onClick={() => selectLineForEdit(row)}>Modify</Button>
            <Button size="small" danger onClick={() => handleRemoveLine(row.id)}>Remove</Button>
          </Space>
        ),
      },
    ],
    [activeTicket?.id],
  )

  const totalQuantity = activeTicket?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0
  const canOperate = !!activeTicket && !!shift
  const hasRefundLine = activeTicket?.lines.some((line) => line.quantity < 0) ?? false
  const hasManagerRefundPermission = bootstrap?.currentUser.permissions.includes('sales_pos.refund') ?? false
  const closePreview = closePreviewQuery.data ?? null
  const computedOverShort = closePreview ? actualCashTotal - closePreview.expectedCashTotal : 0

  async function refreshBootstrap() {
    await bootstrapQuery.refetch()
    await queryClient.invalidateQueries({ queryKey: ['sales-pos'] })
  }

  async function runBusyAction<T>(actionName: string, action: () => Promise<T>) {
    setBusyAction(actionName)
    try {
      return await action()
    } finally {
      setBusyAction(null)
    }
  }

  async function handleLookupProduct() {
    if (!pendingLine.code.trim()) {
      message.warning('Enter a SKU or UPC first.')
      return
    }

    try {
      const lookup = await runBusyAction('lookup', () => salesPosApi.lookupProduct(pendingLine.code.trim()))
      setLookupResult(lookup)
      setPendingLine((current) => ({
        ...current,
        code: lookup.code || current.code.trim().toUpperCase(),
        quantity: current.quantity || lookup.defaultQuantity,
        columnLabel: current.columnLabel || lookup.defaultColumnLabel || '',
        rowLabel: current.rowLabel || lookup.defaultRowLabel || '',
        unitPrice: current.unitPrice > 0 ? current.unitPrice : lookup.defaultUnitPrice,
        priceMode: lookup.defaultPriceMode,
        taxable: lookup.taxable,
      }))
      message.success(`Loaded ${lookup.description}`)
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  async function saveLine(openTenderAfter: boolean) {
    if (!activeTicket) return

    const input: PosLineInput = {
      code: pendingLine.code,
      quantity: pendingLine.quantity,
      columnLabel: pendingLine.columnLabel,
      rowLabel: pendingLine.rowLabel,
      unitPrice: pendingLine.unitPrice,
      priceMode: pendingLine.priceMode,
      discountPct: pendingLine.discountPct,
      discountAmount: pendingLine.discountAmount,
      taxable: pendingLine.taxable,
      secondaryTaxRate: pendingLine.secondaryTaxRate,
      salespersonUserId: pendingLine.salespersonUserId,
      salespersonCode: pendingLine.salespersonCode,
      salespersonName: pendingLine.salespersonName,
      returnCode: pendingLine.returnCode ?? null,
      comment: pendingLine.comment ?? '',
    }

    try {
      await runBusyAction(editingLineId ? 'update-line' : 'add-line', async () => {
        if (editingLineId) {
          await salesPosApi.updateLine(activeTicket.id, editingLineId, input)
          message.success('Ticket line updated.')
        } else {
          await salesPosApi.addLine(activeTicket.id, input)
          message.success('Line added to the ticket.')
        }
        await refreshBootstrap()
      })

      setEditingLineId(null)
      setLookupResult(null)
      setPendingLine(makeDefaultPendingLine(bootstrap))
      if (openTenderAfter) {
        setPaymentDrawerOpen(true)
      }
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  function selectLineForEdit(line: PosTicketLine) {
    setEditingLineId(line.id)
    setLookupResult(null)
    setPendingLine({
      code: line.skuCode ?? line.upc ?? '',
      quantity: line.quantity,
      columnLabel: line.columnLabel,
      rowLabel: line.rowLabel,
      unitPrice: line.unitPrice,
      priceMode: (line.priceMode as PendingLineForm['priceMode']) ?? 'MANUAL',
      discountPct: line.discountPct,
      discountAmount: line.discountAmount,
      taxable: line.taxable,
      secondaryTaxRate: line.secondaryTaxRate,
      salespersonUserId: line.salespersonUserId,
      salespersonCode: line.salespersonCode,
      salespersonName: line.salespersonName,
      returnCode: line.returnCode ?? null,
      comment: line.comment ?? '',
    })
    setReviewOpen(false)
    setPaymentDrawerOpen(false)
    setHeaderDrawerOpen(false)
  }

  async function handleRemoveLine(lineId: string) {
    if (!activeTicket) return
    try {
      await runBusyAction('remove-line', async () => {
        await salesPosApi.removeLine(activeTicket.id, lineId)
        await refreshBootstrap()
      })
      message.success('Line removed.')
      if (editingLineId === lineId) {
        setEditingLineId(null)
        setPendingLine(makeDefaultPendingLine(bootstrap))
      }
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  function handleNextPrice() {
    if (lookupResult) {
      const next = nextPriceSlot(lookupResult, pendingLine.priceMode)
      setPendingLine((current) => ({
        ...current,
        priceMode: next.priceMode,
        unitPrice: next.unitPrice,
      }))
      return
    }

    if (editingLineId && activeTicket) {
      runBusyAction('rotate-line-price', async () => {
        await salesPosApi.rotateLinePrice(activeTicket.id, editingLineId)
        await refreshBootstrap()
      }).catch((error) => {
        message.error((error as Error).message)
      })
      return
    }

    message.info('Load a SKU first or select a line to rotate the price slot.')
  }

  function clearPendingLine() {
    setEditingLineId(null)
    setLookupResult(null)
    setPendingLine(makeDefaultPendingLine(bootstrap))
  }

  function reversePendingQuantity() {
    setPendingLine((current) => ({
      ...current,
      quantity: current.quantity === 0 ? -1 : current.quantity * -1,
    }))
  }

  async function saveHeader() {
    if (!activeTicket) return
    try {
      await runBusyAction('save-header', async () => {
        const patch: PosHeaderPatchInput = {
          cashierUserId: headerDraft.cashierUserId,
          cashierName: headerDraft.cashierName ?? null,
          customerId: headerDraft.customerId ?? null,
          customerAccountNumber: headerDraft.customerAccountNumber ?? null,
          customerName: headerDraft.customerName ?? null,
          headerDiscountPct: headerDraft.headerDiscountPct ?? null,
          promotionCode: headerDraft.promotionCode ?? null,
          shipToState: headerDraft.shipToState ?? null,
          transactionType: headerDraft.transactionType,
          comment: headerDraft.comment ?? null,
          otherCharges: headerDraft.otherCharges ?? 0,
        }
        await salesPosApi.patchHeader(activeTicket.id, patch)
        await refreshBootstrap()
      })
      setHeaderDrawerOpen(false)
      message.success('Ticket header saved.')
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  async function performOverride(request: OverrideRequest, pin: string) {
    const verified = await salesPosApi.verifySalesPin({
      pin,
      scope: request.scope,
      ticketId: request.ticketId,
      action: request.action,
    })
    await request.onApprove(verified.overrideToken)
  }

  function requestOverrideApproval(request: OverrideRequest) {
    setOverridePin('')
    setOverrideRequest(request)
  }

  async function handleVoidTicket() {
    if (!activeTicket) return
    requestOverrideApproval({
      title: `Void Ticket ${activeTicket.ticketNumber}`,
      scope: 'VOID',
      ticketId: activeTicket.id,
      action: 'void-ticket',
      onApprove: async (overrideToken) => {
        await runBusyAction('void-ticket', async () => {
          await salesPosApi.voidTicket(activeTicket.id, overrideToken)
          await refreshBootstrap()
        })
        clearPendingLine()
        setPaymentDrawerOpen(false)
        setReviewOpen(false)
        message.success('Ticket voided. A new draft ticket is ready.')
      },
    })
  }

  async function finishSale(overrideToken?: string) {
    if (!activeTicket) return
    const tenders = paymentDraft.tenders.filter((row) => Math.abs(row.amount) > 0.0001)
    if (tenders.length === 0) {
      message.warning('Enter at least one tender before ending the sale.')
      return
    }

    try {
      const result = await runBusyAction('complete-ticket', () =>
        salesPosApi.completeTicket(activeTicket.id, {
          tenders,
          comment: paymentDraft.comment,
          promotionCode: paymentDraft.promotionCode,
          otherCharges: paymentDraft.otherCharges,
          overrideToken,
        }),
      )

      setReceiptPreview(result.receipt)
      setReceiptOpen(true)
      setPaymentDrawerOpen(false)
      clearPendingLine()
      await refreshBootstrap()
      message.success(`Ticket ${result.ticket.ticketNumber} completed.`)
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  function handleEndSale() {
    if (hasRefundLine && !hasManagerRefundPermission && activeTicket) {
      requestOverrideApproval({
        title: `Refund Approval For Ticket ${activeTicket.ticketNumber}`,
        scope: 'REFUND',
        ticketId: activeTicket.id,
        action: 'complete-ticket',
        onApprove: async (overrideToken) => {
          await finishSale(overrideToken)
        },
      })
      return
    }

    finishSale().catch((error) => {
      message.error((error as Error).message)
    })
  }

  function handleCustomerSelect(customerId: string) {
    const customer = customerOptions.find((row) => row.id === customerId)
    if (!customer) return
    setHeaderDraft((current) => ({
      ...current,
      customerId: customer.id,
      customerAccountNumber: customer.accountNumber,
      customerName: customer.displayName,
    }))
    setCustomerQuery(customer.displayName)
  }

  async function openShiftForStore() {
    if (!selectedStoreId) {
      message.warning('Choose a store before opening the shift.')
      return
    }
    try {
      await runBusyAction('open-shift', async () => {
        const data = await salesPosApi.openShift({
          storeId: selectedStoreId,
          registerCode: selectedRegisterCode,
          openingCashFloat,
        })
        setSelectedStoreId(data.selectedStoreId)
        setSelectedRegisterCode(data.selectedRegisterCode)
        await refreshBootstrap()
      })
      message.success('Shift opened and draft ticket ready.')
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  function showManagerOptionsSummary() {
    modal.info({
      title: 'Manager Options Summary',
      width: 640,
      content: (
        <Descriptions size="small" column={1} bordered style={{ marginTop: 12 }}>
          <Descriptions.Item label="Store">{bootstrap?.stores.find((store) => store.id === bootstrap.selectedStoreId)?.name ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Register">{bootstrap?.selectedRegisterCode ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Default Other Charge Label">{bootstrap?.otherChargeLabel ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Tender Types">
            {(bootstrap?.tenderTypes ?? []).map((row) => row.label).join(', ') || '-'}
          </Descriptions.Item>
        </Descriptions>
      ),
    })
  }

  async function savePayout(overrideToken: string) {
    if (!shift || !payoutCategoryId) return
    try {
      await runBusyAction('create-payout', async () => {
        await salesPosApi.createPayout({
          shiftId: shift.id,
          categoryId: payoutCategoryId,
          amount: payoutAmount,
          note: payoutNote,
          overrideToken,
        })
        await refreshBootstrap()
      })
      setPayoutOpen(false)
      setPayoutAmount(0)
      setPayoutCategoryId(undefined)
      setPayoutNote('')
      message.success('Payout recorded.')
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  function handleCreatePayout() {
    if (!shift) return
    requestOverrideApproval({
      title: 'Approve Payout',
      scope: 'PAY_OUT',
      action: 'create-payout',
      onApprove: savePayout,
    })
  }

  async function saveCloseBatch(overrideToken: string) {
    if (!shift) return
    try {
      await runBusyAction('close-shift', async () => {
        await salesPosApi.closeShift(shift.id, {
          actualCashTotal,
          notes: closeNotes,
          countedTenders: closePreview
            ? closePreview.tenderTotals.map((row) => ({
                tenderTypeId: row.tenderTypeId,
                amount: countedTenders[row.tenderTypeId] ?? row.amount,
              }))
            : [],
          overrideToken,
        })
        await refreshBootstrap()
      })
      setCloseOpen(false)
      message.success('Batch closed.')
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  function handleCloseBatch() {
    if (!shift) return
    requestOverrideApproval({
      title: 'Close Batch',
      scope: 'CLOSE_BATCH',
      action: 'close-shift',
      onApprove: saveCloseBatch,
    })
  }

  async function handleReclaimTicket(ticketId: string) {
    try {
      await runBusyAction('reclaim-ticket', async () => {
        await salesPosApi.reclaimTicket(ticketId)
        await refreshBootstrap()
      })
      setReclaimOpen(false)
      message.success('Voided ticket reclaimed into the draft workspace.')
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  function handleReprintTicket(ticketId: string) {
    requestOverrideApproval({
      title: 'Reprint Ticket',
      scope: 'REPRINT',
      ticketId,
      action: 'reprint-ticket',
      onApprove: async (overrideToken) => {
        const result = await runBusyAction('reprint-ticket', () => salesPosApi.reprintTicket(ticketId, overrideToken))
        setReceiptPreview(result.receipt)
        setReceiptOpen(true)
        setReprintOpen(false)
        message.success('Receipt reprinted.')
      },
    })
  }

  const receiptModal = (
    <Modal
      open={receiptOpen}
      title="Receipt Preview"
      width={920}
      onCancel={() => setReceiptOpen(false)}
      footer={[
        <Button key="close" onClick={() => setReceiptOpen(false)}>
          Close
        </Button>,
      ]}
    >
      <ReceiptPreview receipt={receiptPreview} />
    </Modal>
  )

  if (bootstrapQuery.isLoading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: 400 }}>
        <Spin size="large" />
      </Flex>
    )
  }

  if (bootstrapQuery.isError || !bootstrap) {
    return (
      <Result
        status="error"
        title="POS failed to load"
        subTitle={bootstrapQuery.error instanceof Error ? bootstrapQuery.error.message : 'Unknown error'}
        extra={
          <Button onClick={() => bootstrapQuery.refetch()}>
            Retry
          </Button>
        }
      />
    )
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="Amounts in Lempira (HNL)"
        description="This browser workspace preserves the RICS Enter Sales flow: shift open, ticket detail, payment, reclaim, payout, reprint, and close batch."
      />

      {!shift ? (
        <Card
          title="Start New Batch Of Sales"
          extra={<Tag color="gold">No open shift</Tag>}
          styles={{ body: { paddingTop: 20 } }}
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Typography.Text strong>Store</Typography.Text>
              <Select
                style={{ width: '100%', marginTop: 8 }}
                value={selectedStoreId}
                options={bootstrap.stores.map((store) => ({
                  value: store.id,
                  label: `${store.code} - ${store.name}`,
                }))}
                onChange={(value) => setSelectedStoreId(value)}
              />
            </Col>
            <Col xs={24} md={8}>
              <Typography.Text strong>Register</Typography.Text>
              <Select
                style={{ width: '100%', marginTop: 8 }}
                value={selectedRegisterCode}
                options={bootstrap.registers.map((register) => ({
                  value: register.code,
                  label: `${register.code} - ${register.label}`,
                }))}
                onChange={(value) => setSelectedRegisterCode(value)}
              />
            </Col>
            <Col xs={24} md={8}>
              <Typography.Text strong>Opening Cash Float</Typography.Text>
              <InputNumber
                style={{ width: '100%', marginTop: 8 }}
                min={0}
                value={openingCashFloat}
                onChange={(value) => setOpeningCashFloat(value ?? 0)}
              />
            </Col>
          </Row>

          <Divider />

          <Space>
            <Button type="primary" loading={busyAction === 'open-shift'} onClick={openShiftForStore}>
              Save / Enter Sales
            </Button>
            <Button onClick={showManagerOptionsSummary}>Manager Options</Button>
          </Space>
        </Card>
      ) : (
        <>
          <Card>
            <Row gutter={[16, 16]} align="middle">
              <Col xs={24} md={14}>
                <Space size="middle" wrap>
                  <Tag color="blue">Batch Open</Tag>
                  <Typography.Text strong>
                    Store {bootstrap.selectedStoreId} • Register {shift.registerCode}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    Opened by {shift.openedByName} on {dayjs(shift.openedAt).format('YYYY-MM-DD HH:mm')}
                  </Typography.Text>
                </Space>
              </Col>
              <Col xs={12} md={5}>
                <Statistic title="Ticket" value={activeTicket?.ticketNumber ?? '-'} />
              </Col>
              <Col xs={12} md={5}>
                <Statistic title="Last Ticket" value={shift.lastTicketNumber} />
              </Col>
            </Row>
          </Card>

          <Card>
            <Space wrap size="middle">
              <Tag color={formatTicketStatus(activeTicket?.status ?? 'DRAFT')}>{activeTicket?.status ?? 'DRAFT'}</Tag>
              <Typography.Text strong>Cashier {activeTicket?.cashierName}</Typography.Text>
              <Typography.Text>Transaction {activeTicket?.transactionType}</Typography.Text>
              <Typography.Text>Customer {activeTicket?.customerName || '-'}</Typography.Text>
              <Typography.Text>Promo {activeTicket?.promotionCode || '-'}</Typography.Text>
              <Typography.Text type="secondary">Business date {dayjs(shift.businessDate).format('YYYY-MM-DD')}</Typography.Text>
            </Space>
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={16}>
              <Card title={editingLineId ? 'Modify Ticket Line' : 'Ticket Detail'} styles={{ body: { paddingTop: 16 } }}>
                <Row gutter={[12, 12]}>
                  <Col xs={24} md={10}>
                    <Typography.Text strong>UPC / SKU</Typography.Text>
                    <Input
                      ref={codeInputRef}
                      value={pendingLine.code}
                      onChange={(event) => setPendingLine((current) => ({ ...current, code: event.target.value }))}
                      onPressEnter={() => {
                        void handleLookupProduct()
                      }}
                      placeholder="Scan barcode or type SKU"
                    />
                  </Col>
                  <Col xs={24} md={6}>
                    <Typography.Text strong>Column</Typography.Text>
                    <Select
                      allowClear
                      value={pendingLine.columnLabel || undefined}
                      style={{ width: '100%' }}
                      options={(lookupResult?.columns ?? []).map((column) => ({ value: column, label: column }))}
                      onChange={(value) => setPendingLine((current) => ({ ...current, columnLabel: value ?? '' }))}
                    />
                  </Col>
                  <Col xs={24} md={6}>
                    <Typography.Text strong>Row</Typography.Text>
                    <Select
                      allowClear
                      value={pendingLine.rowLabel || undefined}
                      style={{ width: '100%' }}
                      options={(lookupResult?.rows ?? []).map((row) => ({ value: row, label: row }))}
                      onChange={(value) => setPendingLine((current) => ({ ...current, rowLabel: value ?? '' }))}
                    />
                  </Col>
                  <Col xs={24} md={2}>
                    <Button style={{ marginTop: 24, width: '100%' }} onClick={() => void handleLookupProduct()}>
                      Load
                    </Button>
                  </Col>

                  <Col xs={24} md={6}>
                    <Typography.Text strong>Qty</Typography.Text>
                    <InputNumber
                      style={{ width: '100%' }}
                      value={pendingLine.quantity}
                      onChange={(value) => setPendingLine((current) => ({ ...current, quantity: Number(value ?? 1) }))}
                    />
                  </Col>
                  <Col xs={24} md={6}>
                    <Typography.Text strong>Price</Typography.Text>
                    <InputNumber
                      style={{ width: '100%' }}
                      value={pendingLine.unitPrice}
                      onChange={(value) => setPendingLine((current) => ({ ...current, unitPrice: Number(value ?? 0), priceMode: 'MANUAL' }))}
                    />
                  </Col>
                  <Col xs={24} md={6}>
                    <Typography.Text strong>Discount %</Typography.Text>
                    <InputNumber
                      style={{ width: '100%' }}
                      value={pendingLine.discountPct ?? undefined}
                      onChange={(value) => setPendingLine((current) => ({ ...current, discountPct: value == null ? null : Number(value) }))}
                    />
                  </Col>
                  <Col xs={24} md={6}>
                    <Typography.Text strong>Discount Amt</Typography.Text>
                    <InputNumber
                      style={{ width: '100%' }}
                      value={pendingLine.discountAmount ?? undefined}
                      onChange={(value) => setPendingLine((current) => ({ ...current, discountAmount: value == null ? null : Number(value) }))}
                    />
                  </Col>

                  <Col xs={24} md={8}>
                    <Typography.Text strong>Salesperson</Typography.Text>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      style={{ width: '100%' }}
                      value={pendingLine.salespersonUserId ?? undefined}
                      options={bootstrap.employees.map((employee) => ({
                        value: employee.id,
                        label: `${employee.displayName}${employee.salespersonCode ? ` (${employee.salespersonCode})` : ''}`,
                        employee,
                      }))}
                      onChange={(value, option) =>
                        setPendingLine((current) => ({
                          ...current,
                          salespersonUserId: value,
                          salespersonCode: (option as { employee?: { salespersonCode?: string | null } }).employee?.salespersonCode ?? null,
                          salespersonName: String((option as { label?: string }).label ?? current.salespersonName ?? ''),
                        }))
                      }
                    />
                  </Col>
                  <Col xs={24} md={8}>
                    <Typography.Text strong>Return Code</Typography.Text>
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      style={{ width: '100%' }}
                      value={pendingLine.returnCode ?? undefined}
                      options={bootstrap.returnCodes.map((code) => ({
                        value: code.code,
                        label: `${code.code} - ${code.description}`,
                      }))}
                      onChange={(value) => setPendingLine((current) => ({ ...current, returnCode: value ?? null }))}
                    />
                  </Col>
                  <Col xs={24} md={8}>
                    <Typography.Text strong>Price Mode</Typography.Text>
                    <Select
                      style={{ width: '100%' }}
                      value={pendingLine.priceMode}
                      options={[
                        ...(lookupResult?.priceSlots ?? []).map((slot) => ({
                          value: slot.code,
                          label: `${slot.label} (${formatMoney(slot.amount)})`,
                        })),
                        { value: 'MANUAL', label: 'Manual' },
                      ]}
                      onChange={(value) => {
                        if (lookupResult && value !== 'MANUAL') {
                          const slot = lookupResult.priceSlots.find((candidate) => candidate.code === value)
                          setPendingLine((current) => ({
                            ...current,
                            priceMode: value,
                            unitPrice: slot?.amount ?? current.unitPrice,
                          }))
                          return
                        }
                        setPendingLine((current) => ({ ...current, priceMode: value }))
                      }}
                    />
                  </Col>

                  <Col span={24}>
                    <Typography.Text strong>SKU Comment</Typography.Text>
                    <Input.TextArea
                      rows={3}
                      value={pendingLine.comment ?? ''}
                      onChange={(event) => setPendingLine((current) => ({ ...current, comment: event.target.value }))}
                    />
                  </Col>
                </Row>

                <Divider />

                <Space wrap>
                  <Button type="primary" onClick={() => void saveLine(false)} loading={busyAction === 'add-line' || busyAction === 'update-line'} disabled={!canOperate}>
                    {editingLineId ? 'Save Changes' : 'Save / Next SKU'}
                  </Button>
                  <Button onClick={() => void saveLine(true)} disabled={!canOperate}>
                    Save / Tender
                  </Button>
                  <Button danger onClick={() => void handleVoidTicket()} disabled={!canOperate}>
                    Void
                  </Button>
                  <Button onClick={clearPendingLine}>Clear</Button>
                  <Button onClick={handleNextPrice}>Next Price</Button>
                  <Button onClick={() => setHeaderDrawerOpen(true)}>Change Header</Button>
                  <Button onClick={() => setReviewOpen(true)}>Review</Button>
                  <Button onClick={reversePendingQuantity}>Reverse Qty</Button>
                </Space>
              </Card>
            </Col>

            <Col xs={24} xl={8}>
              <Card title="Totals Rail" styles={{ body: { paddingTop: 12 } }}>
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <Statistic title="Qty" value={totalQuantity} />
                  <Statistic title="Subtotal" value={formatMoney(activeTicket?.subtotal)} />
                  <Statistic title="15% ISV" value={formatMoney(activeTicket?.taxTotal)} />
                  <Statistic title="ISV.Ad" value={formatMoney(activeTicket?.secondaryTaxTotal)} />
                  <Statistic title={bootstrap.otherChargeLabel} value={formatMoney(activeTicket?.otherCharges)} />
                  <Statistic title="Total" value={formatMoney(activeTicket?.grandTotal)} valueStyle={{ color: '#0b5c44', fontWeight: 700 }} />
                  {lookupResult ? (
                    <Descriptions size="small" column={1} bordered>
                      <Descriptions.Item label="Loaded SKU">{lookupResult.code}</Descriptions.Item>
                      <Descriptions.Item label="Description">{lookupResult.description}</Descriptions.Item>
                      <Descriptions.Item label="Size Grid">{lookupResult.sizeTypeDescription || '-'}</Descriptions.Item>
                    </Descriptions>
                  ) : null}
                </Space>
              </Card>
            </Col>
          </Row>

          <Card title="SKUs already entered on ticket">
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              columns={linesColumns}
              dataSource={activeTicket?.lines ?? []}
              locale={{ emptyText: 'No items on the current ticket.' }}
              scroll={{ x: 980 }}
            />
          </Card>
        </>
      )}

      <Drawer
        title="Ticket Payment"
        width={720}
        open={paymentDrawerOpen}
        onClose={() => setPaymentDrawerOpen(false)}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Subtotal">{formatMoney(activeTicket?.subtotal)}</Descriptions.Item>
            <Descriptions.Item label="15% ISV">{formatMoney(activeTicket?.taxTotal)}</Descriptions.Item>
            <Descriptions.Item label="ISV.Ad">{formatMoney(activeTicket?.secondaryTaxTotal)}</Descriptions.Item>
            <Descriptions.Item label={bootstrap.otherChargeLabel}>{formatMoney(paymentDraft.otherCharges)}</Descriptions.Item>
            <Descriptions.Item label="Total Due">{formatMoney(activeTicket?.grandTotal)}</Descriptions.Item>
          </Descriptions>

          <Typography.Title level={5} style={{ margin: 0 }}>
            Tender
          </Typography.Title>

          {paymentDraft.tenders.map((row, index) => {
            const tender = bootstrap.tenderTypes.find((candidate) => candidate.id === row.tenderTypeId)
            return (
              <Card key={`${row.tenderTypeId}-${index}`} size="small">
                <Row gutter={[12, 12]}>
                  <Col xs={24} md={8}>
                    <Typography.Text strong>Tender Type</Typography.Text>
                    <Select
                      style={{ width: '100%' }}
                      value={row.tenderTypeId}
                      options={bootstrap.tenderTypes.map((type) => ({
                        value: type.id,
                        label: `${type.code} - ${type.label}`,
                      }))}
                      onChange={(value) =>
                        setPaymentDraft((current) => ({
                          ...current,
                          tenders: current.tenders.map((candidate, tenderIndex) =>
                            tenderIndex === index ? { ...candidate, tenderTypeId: value } : candidate,
                          ),
                        }))
                      }
                    />
                  </Col>
                  <Col xs={24} md={6}>
                    <Typography.Text strong>Amount</Typography.Text>
                    <InputNumber
                      style={{ width: '100%' }}
                      value={row.amount}
                      onChange={(value) =>
                        setPaymentDraft((current) => ({
                          ...current,
                          tenders: current.tenders.map((candidate, tenderIndex) =>
                            tenderIndex === index ? { ...candidate, amount: Number(value ?? 0) } : candidate,
                          ),
                        }))
                      }
                    />
                  </Col>
                  {tender?.requiresAccount ? (
                    <Col xs={24} md={10}>
                      <Typography.Text strong>Account / Reference</Typography.Text>
                      <Input
                        value={row.accountNumber ?? ''}
                        onChange={(event) =>
                          setPaymentDraft((current) => ({
                            ...current,
                            tenders: current.tenders.map((candidate, tenderIndex) =>
                              tenderIndex === index
                                ? { ...candidate, accountNumber: event.target.value }
                                : candidate,
                            ),
                          }))
                        }
                      />
                    </Col>
                  ) : (
                    <Col xs={24} md={10}>
                      <Typography.Text strong>Reference</Typography.Text>
                      <Input
                        value={row.reference ?? ''}
                        onChange={(event) =>
                          setPaymentDraft((current) => ({
                            ...current,
                            tenders: current.tenders.map((candidate, tenderIndex) =>
                              tenderIndex === index
                                ? { ...candidate, reference: event.target.value }
                                : candidate,
                            ),
                          }))
                        }
                      />
                    </Col>
                  )}
                </Row>
              </Card>
            )
          })}

          <Space>
            <Button
              onClick={() =>
                setPaymentDraft((current) => ({
                  ...current,
                  tenders: [...current.tenders, { tenderTypeId: bootstrap.tenderTypes[0]?.id ?? '', amount: 0, accountNumber: '', reference: '' }].slice(0, 4),
                }))
              }
              disabled={paymentDraft.tenders.length >= 4}
            >
              Add Tender
            </Button>
            <Button
              onClick={() =>
                setPaymentDraft((current) => ({
                  ...current,
                  tenders: current.tenders.length > 1 ? current.tenders.slice(0, -1) : current.tenders,
                }))
              }
              disabled={paymentDraft.tenders.length <= 1}
            >
              Remove Tender
            </Button>
          </Space>

          <Row gutter={[12, 12]}>
            <Col xs={24} md={12}>
              <Typography.Text strong>Promo Code</Typography.Text>
              <Select
                showSearch
                allowClear
                optionFilterProp="label"
                style={{ width: '100%' }}
                value={paymentDraft.promotionCode || undefined}
                options={bootstrap.promotions.map((promotion) => ({
                  value: promotion.code,
                  label: `${promotion.code} - ${promotion.description}`,
                }))}
                onChange={(value) => setPaymentDraft((current) => ({ ...current, promotionCode: value ?? '' }))}
              />
            </Col>
            <Col xs={24} md={12}>
              <Typography.Text strong>{bootstrap.otherChargeLabel}</Typography.Text>
              <InputNumber
                style={{ width: '100%' }}
                value={paymentDraft.otherCharges}
                onChange={(value) => setPaymentDraft((current) => ({ ...current, otherCharges: Number(value ?? 0) }))}
              />
            </Col>
            <Col span={24}>
              <Typography.Text strong>Ticket Comment</Typography.Text>
              <Input.TextArea
                rows={4}
                value={paymentDraft.comment}
                onChange={(event) => setPaymentDraft((current) => ({ ...current, comment: event.target.value }))}
              />
            </Col>
          </Row>

          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Total Tender">
              {formatMoney(paymentDraft.tenders.reduce((sum, row) => sum + row.amount, 0))}
            </Descriptions.Item>
            <Descriptions.Item label="Change">
              {formatMoney(Math.max(paymentDraft.tenders.reduce((sum, row) => sum + row.amount, 0) - (activeTicket?.grandTotal ?? 0), 0))}
            </Descriptions.Item>
          </Descriptions>

          <Space wrap>
            <Button type="primary" onClick={handleEndSale} disabled={!activeTicket}>
              End Sale
            </Button>
            <Button onClick={() => setPaymentDrawerOpen(false)}>Add More SKUs</Button>
            <Button danger onClick={() => void handleVoidTicket()} disabled={!activeTicket}>
              Void
            </Button>
            <Button onClick={() => setPaymentDraft(makePaymentDraft(activeTicket, bootstrap))}>Clear</Button>
          </Space>
        </Space>
      </Drawer>

      <Drawer
        title="Change Ticket Header"
        width={680}
        open={headerDrawerOpen}
        onClose={() => setHeaderDrawerOpen(false)}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Form layout="vertical">
            <Row gutter={[12, 12]}>
              <Col xs={24} md={12}>
                <Form.Item label="Cashier">
                  <Select
                    showSearch
                    optionFilterProp="label"
                    value={headerDraft.cashierUserId}
                    options={bootstrap.employees.map((employee) => ({
                      value: employee.id,
                      label: `${employee.displayName}${employee.salespersonCode ? ` (${employee.salespersonCode})` : ''}`,
                    }))}
                    onChange={(value, option) => setHeaderDraft((current) => ({
                      ...current,
                      cashierUserId: value,
                      cashierName: String((option as { label?: string }).label ?? current.cashierName ?? ''),
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Transaction">
                  <Select
                    value={headerDraft.transactionType}
                    options={transactionOptions.map((option) => ({ value: option.value, label: option.label }))}
                    onChange={(value) => setHeaderDraft((current) => ({ ...current, transactionType: value }))}
                  />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="Customer">
                  <AutoComplete
                    value={customerQuery}
                    options={customerOptions.map((customer) => ({
                      value: customer.id,
                      label: `${customer.accountNumber} - ${customer.displayName}`,
                    }))}
                    onSearch={(value) => setCustomerQuery(value)}
                    onSelect={handleCustomerSelect}
                    onChange={(value) => setCustomerQuery(value)}
                    placeholder="Search by account, name, phone, or email"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Discount %">
                  <InputNumber
                    style={{ width: '100%' }}
                    value={headerDraft.headerDiscountPct ?? undefined}
                    onChange={(value) => setHeaderDraft((current) => ({ ...current, headerDiscountPct: value == null ? null : Number(value) }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Ship-To State">
                  <Input
                    value={headerDraft.shipToState ?? ''}
                    onChange={(event) => setHeaderDraft((current) => ({ ...current, shipToState: event.target.value }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Promo Code">
                  <Select
                    showSearch
                    allowClear
                    optionFilterProp="label"
                    value={headerDraft.promotionCode || undefined}
                    options={bootstrap.promotions.map((promotion) => ({
                      value: promotion.code,
                      label: `${promotion.code} - ${promotion.description}`,
                    }))}
                    onChange={(value) => setHeaderDraft((current) => ({ ...current, promotionCode: value ?? null }))}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>

          <Space wrap>
            <Button type="primary" onClick={() => void saveHeader()}>
              Save / SKU Detail
            </Button>
            <Button onClick={() => message.info('Mail Detail will use the selected customer for receipt delivery.')}>
              Mail Detail
            </Button>
            <Button onClick={showManagerOptionsSummary}>Manager Options</Button>
            <Button
              onClick={() => {
                setHeaderDrawerOpen(false)
                setTimeout(() => codeInputRef.current?.focus(), 40)
              }}
            >
              UPC Price Scan
            </Button>
            <Button onClick={() => setPayoutOpen(true)} disabled={!shift}>
              Payouts
            </Button>
            <Button onClick={() => setCloseOpen(true)} disabled={!shift}>
              Close Batch
            </Button>
            <Button onClick={() => setReclaimOpen(true)} disabled={!shift}>
              Reclaim Ticket
            </Button>
            <Button onClick={() => setReprintOpen(true)} disabled={!shift}>
              Reprint Ticket
            </Button>
            <Button onClick={() => message.info('Mail List integration will follow the CRM mail-detail expansion.')}>
              Mail List
            </Button>
            <Button onClick={() => setHeaderDrawerOpen(false)}>Exit</Button>
          </Space>
        </Space>
      </Drawer>

      <Modal
        open={reviewOpen}
        title="Ticket Review"
        width={980}
        onCancel={() => setReviewOpen(false)}
        footer={[
          <Button key="close" onClick={() => setReviewOpen(false)}>
            Close
          </Button>,
        ]}
      >
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          columns={linesColumns}
          dataSource={activeTicket?.lines ?? []}
        />
      </Modal>

      <Modal
        open={payoutOpen}
        title="Payouts"
        onCancel={() => setPayoutOpen(false)}
        onOk={handleCreatePayout}
        okButtonProps={{ disabled: !payoutCategoryId || payoutAmount <= 0 }}
      >
        <Form layout="vertical">
          <Form.Item label="Category">
            <Select
              value={payoutCategoryId}
              options={bootstrap.payoutCategories.map((category) => ({
                value: category.id,
                label: `${category.code} - ${category.label}`,
              }))}
              onChange={(value) => setPayoutCategoryId(value)}
            />
          </Form.Item>
          <Form.Item label="Amount">
            <InputNumber style={{ width: '100%' }} value={payoutAmount} onChange={(value) => setPayoutAmount(Number(value ?? 0))} />
          </Form.Item>
          <Form.Item label="Note">
            <Input.TextArea rows={3} value={payoutNote} onChange={(event) => setPayoutNote(event.target.value)} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={closeOpen}
        title="Close Batch"
        width={960}
        onCancel={() => setCloseOpen(false)}
        onOk={handleCloseBatch}
        okText="Close Batch"
        confirmLoading={busyAction === 'close-shift'}
      >
        {closePreviewQuery.isLoading ? (
          <Flex justify="center" style={{ padding: '48px 0' }}>
            <Spin />
          </Flex>
        ) : closePreview ? (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="Opening Cash Float">{formatMoney(closePreview.openingCashFloat)}</Descriptions.Item>
              <Descriptions.Item label="Expected Cash">{formatMoney(closePreview.expectedCashTotal)}</Descriptions.Item>
              <Descriptions.Item label="Payouts">{formatMoney(closePreview.payoutsTotal)}</Descriptions.Item>
              <Descriptions.Item label="Actual Cash">{formatMoney(actualCashTotal)}</Descriptions.Item>
              <Descriptions.Item label="Over / Short">{formatMoney(computedOverShort)}</Descriptions.Item>
            </Descriptions>

            <Table
              size="small"
              rowKey="tenderTypeId"
              pagination={false}
              dataSource={closePreview.tenderTotals}
              columns={[
                { title: 'Tender', dataIndex: 'label', key: 'label' },
                { title: 'Expected', dataIndex: 'amount', key: 'amount', align: 'right', render: (value: number) => formatMoney(value) },
                {
                  title: 'Counted',
                  key: 'counted',
                  render: (_, row: PosClosePreview['tenderTotals'][number]) => (
                    <InputNumber
                      style={{ width: '100%' }}
                      value={countedTenders[row.tenderTypeId] ?? row.amount}
                      onChange={(value) =>
                        setCountedTenders((current) => ({
                          ...current,
                          [row.tenderTypeId]: Number(value ?? 0),
                        }))
                      }
                    />
                  ),
                },
              ]}
            />

            <Row gutter={[12, 12]}>
              <Col xs={24} md={12}>
                <Typography.Text strong>Actual Cash</Typography.Text>
                <InputNumber
                  style={{ width: '100%' }}
                  value={actualCashTotal}
                  onChange={(value) => setActualCashTotal(Number(value ?? 0))}
                />
              </Col>
              <Col xs={24} md={12}>
                <Typography.Text strong>Notes</Typography.Text>
                <Input.TextArea rows={3} value={closeNotes} onChange={(event) => setCloseNotes(event.target.value)} />
              </Col>
            </Row>
          </Space>
        ) : (
          <Alert type="warning" showIcon message="Close-batch preview unavailable." />
        )}
      </Modal>

      <Modal
        open={reclaimOpen}
        title="Reclaim Ticket"
        width={820}
        onCancel={() => setReclaimOpen(false)}
        footer={[
          <Button key="close" onClick={() => setReclaimOpen(false)}>
            Close
          </Button>,
        ]}
      >
        <Table
          size="small"
          rowKey="id"
          loading={reclaimableTicketsQuery.isLoading}
          dataSource={reclaimableTicketsQuery.data?.tickets ?? []}
          pagination={false}
          columns={[
            { title: 'Ticket', dataIndex: 'ticketNumber', key: 'ticketNumber', width: 90 },
            { title: 'Cashier', dataIndex: 'cashierName', key: 'cashierName' },
            { title: 'Customer', dataIndex: 'customerName', key: 'customerName', render: (value: string | null) => value || '-' },
            { title: 'Total', dataIndex: 'grandTotal', key: 'grandTotal', align: 'right', render: (value: number) => formatMoney(value) },
            {
              title: 'Action',
              key: 'action',
              width: 120,
              render: (_, row: PosTicketListItem) => (
                <Button size="small" onClick={() => void handleReclaimTicket(row.id)}>
                  Select
                </Button>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        open={reprintOpen}
        title="Reprint Ticket"
        width={820}
        onCancel={() => setReprintOpen(false)}
        footer={[
          <Button key="close" onClick={() => setReprintOpen(false)}>
            Close
          </Button>,
        ]}
      >
        <Table
          size="small"
          rowKey="id"
          loading={completedTicketsQuery.isLoading}
          dataSource={completedTicketsQuery.data?.tickets ?? []}
          pagination={false}
          columns={[
            { title: 'Ticket', dataIndex: 'ticketNumber', key: 'ticketNumber', width: 90 },
            { title: 'Cashier', dataIndex: 'cashierName', key: 'cashierName' },
            { title: 'Customer', dataIndex: 'customerName', key: 'customerName', render: (value: string | null) => value || '-' },
            { title: 'Completed', dataIndex: 'completedAt', key: 'completedAt', render: (value: string | null) => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-' },
            { title: 'Total', dataIndex: 'grandTotal', key: 'grandTotal', align: 'right', render: (value: number) => formatMoney(value) },
            {
              title: 'Action',
              key: 'action',
              width: 120,
              render: (_, row: PosTicketListItem) => (
                <Button size="small" onClick={() => handleReprintTicket(row.id)}>
                  Print
                </Button>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        open={!!overrideRequest}
        title={overrideRequest?.title ?? 'Manager Approval'}
        onCancel={() => setOverrideRequest(null)}
        onOk={() => {
          if (!overrideRequest) return
          void performOverride(overrideRequest, overridePin)
            .then(() => {
              setOverrideRequest(null)
              setOverridePin('')
            })
            .catch((error) => {
              message.error((error as Error).message)
            })
        }}
        okText="Approve"
      >
        <Typography.Paragraph>
          Enter an employee sales PIN for {overrideRequest?.scope ?? 'this protected action'}.
        </Typography.Paragraph>
        <Input.Password
          value={overridePin}
          onChange={(event) => setOverridePin(event.target.value)}
          placeholder="4-8 digit sales PIN"
        />
      </Modal>

      {receiptModal}
    </Space>
  )
}
