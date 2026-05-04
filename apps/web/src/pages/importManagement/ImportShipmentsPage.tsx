import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  App as AntdApp,
  Popover,
  Select,
  Segmented,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import ReportThumbnail from '../../components/reports/ReportThumbnail'
import { SkuLookup } from '../../components/sku-lookup/SkuLookup'
import {
  ArrowLeftOutlined,
  CalculatorOutlined,
  DownloadOutlined,
  FileAddOutlined,
  InboxOutlined,
  LinkOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShoppingCartOutlined,
  TruckOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  useAddGoodsInTransitRecord,
  useAddImportCharge,
  useAddImportContainer,
  useAddImportInvoiceLine,
  useAddImportShipmentLine,
  useAddImportSupplierInvoice,
  useApplyImportInvoiceMatchSuggestions,
  useApproveImportShipmentLineInvoiceMatch,
  useAllocateImportLandedCost,
  useCreateImportPurchaseOrderDraft,
  useCreateGoodsInTransitForShipment,
  useCreateImportShipment,
  useImportLiquidationReadiness,
  useImportInvoiceMatchSuggestions,
  useImportOtbCommitments,
  useImportPayables,
  useImportPurchaseOrderLinking,
  useImportReceivingHandoff,
  useImportShipment,
  useImportShipmentAuditEvents,
  useImportShipmentLineCandidates,
  useImportWorkbook,
  useImportShipments,
  useLinkImportInvoiceLineToSku,
  useLinkImportInvoiceLineToPurchaseOrderLine,
  useMarkImportPayablePaid,
  useMarkImportPayablesSent,
  useMatchImportShipmentLineInvoice,
  usePreviewImportWorkbook,
  useRecordImportVerificationCheck,
  useReceiveImportShipmentEstimated,
  useReceiveImportShipmentFinal,
  useRemoveImportShipmentLine,
  useStageImportPayables,
  useUpdateGoodsInTransitRecord,
  useUpdateImportCharge,
  useUpdateImportContainer,
  useUpdateImportInvoiceLine,
  useUpdateImportShipmentLine,
  useUpdateImportSuggestedPriceStatus,
  useUpdateImportShipmentStatus,
  useUpdateImportSupplierInvoice,
  useVoidImportPayable,
} from '../../hooks/useImportManagement'
import { usePurchaseOrderBuyerOptions } from '../../hooks/usePurchaseOrders'
import { useVendors } from '../../hooks/useProductsVendors'
import { searchSkusForLookup, type SkuLookupRow } from '../../services/skuApi'
import type {
  CreateImportInvoiceLinePayload,
  GoodsInTransitRecordDto,
  GoodsInTransitStatus,
  ImportChargeRecord,
  ImportContainerRecord,
  ImportContainerStatus,
  ImportContainerType,
  ImportCommitmentBasis,
  ImportCostBuildRecord,
  ImportCostBuildPreviewComponent,
  ImportCostBuildPreviewOutput,
  ImportCostBuildPreviewRecord,
  ImportCostComponentAllocationRecord,
  ImportInvoiceLineRecord,
  ImportInvoiceLineCostRole,
  ImportInvoiceLineReceiptPolicy,
  ImportInvoiceMatchSuggestion,
  ImportInvoiceMatchReviewStatus,
  ImportLiquidationReadinessCheck,
  ImportOtbCommitmentSummary,
  ImportPayableHandoffStatus,
  ImportPayableRecord,
  ImportPoUnitCostSource,
  ImportPurchaseOrderLinkLine,
  ImportReceivingCostBasis,
  ImportReceivingHandoffLine,
  ImportReceivingInventoryReceiptAuditRecord,
  ImportReceivingInventoryTrueUpAuditRecord,
  ImportReceivingPurchaseOrderReceiptAuditRecord,
  ImportShipmentStatus,
  ImportShipmentAuditEvent,
  ImportShipmentLineCandidate,
  ImportShipmentLineRecord,
  ImportShipmentSummary,
  ImportSuggestedPriceApprovalStatus,
  ImportSuggestedPriceRecord,
  ImportSupplierInvoiceRecord,
  ImportVerificationCheckRecord,
  ImportVerificationCheckStatus,
  ImportWorkbookChargePreview,
  ImportWorkbookOptionsPayload,
  ImportWorkbookSupplierInvoicePreview,
} from '../../types/importManagement'

const { Title, Text } = Typography

const STATUS_OPTIONS: ImportShipmentStatus[] = [
  'DRAFT',
  'REVIEWING_COSTS',
  'APPROVED_ESTIMATE',
  'IN_TRANSIT',
  'RECEIVING_ESTIMATED',
  'FINAL_LIQUIDATION',
  'RECEIVED_FINAL',
  'CLOSED',
  'CANCELLED',
]

const STATUS_COLOR: Record<ImportShipmentStatus, string> = {
  DRAFT: 'default',
  REVIEWING_COSTS: 'blue',
  APPROVED_ESTIMATE: 'cyan',
  IN_TRANSIT: 'geekblue',
  RECEIVING_ESTIMATED: 'gold',
  FINAL_LIQUIDATION: 'orange',
  RECEIVED_FINAL: 'green',
  CLOSED: 'success',
  CANCELLED: 'red',
}

const SOURCE_CURRENCY_OPTIONS = ['HNL', 'USD', 'CNY']
const INCOTERM_OPTIONS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']
const PO_CANDIDATE_STATUS_OPTIONS = ['DRAFT', 'SUBMITTED', 'CONFIRMED', 'PARTIALLY_RECEIVED']
const INVOICE_GROUP_OPTIONS = ['TAXABLE', 'NON_TAXABLE', 'MIXED']
const INVOICE_KIND_OPTIONS = ['MERCHANDISE', 'FABRIC', 'CMT', 'ACCESSORY', 'OTHER']
const INVOICE_LINE_COST_ROLE_OPTIONS: ImportInvoiceLineCostRole[] = [
  'FINISHED_GOOD',
  'MATERIAL',
  'CONVERSION',
  'ACCESSORY_COMPONENT',
  'RECEIPT_ACCESSORY',
  'EXPENSE',
]
const INVOICE_LINE_RECEIPT_POLICY_OPTIONS: ImportInvoiceLineReceiptPolicy[] = [
  'RECEIVE_TO_STOCK',
  'ROLL_TO_OUTPUT',
  'EXPENSE_ONLY',
  'IGNORE',
]
const CHARGE_TYPE_OPTIONS = ['FREIGHT', 'INSURANCE', 'DUTY', 'TAX', 'CUSTOMS_AGENCY', 'LOCAL_FREIGHT', 'OTHER']
const CHARGE_COST_TREATMENT_OPTIONS = ['ALLOCATE_TO_LANDED', 'INCLUDED_IN_COMMERCIAL_PRICE', 'EXCLUDE_FROM_LANDED']
const CONTAINER_TYPE_OPTIONS: ImportContainerType[] = ['CONTAINER', 'LOOSE_CARGO', 'CARTON_GROUP']
const CONTAINER_STATUS_OPTIONS: ImportContainerStatus[] = ['PLANNED', 'LOADED', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED', 'CANCELLED']
const GOODS_IN_TRANSIT_STATUS_OPTIONS: GoodsInTransitStatus[] = [
  'PENDING',
  'OWNED',
  'IN_TRANSIT',
  'RECEIVING_ESTIMATED',
  'RECEIVED_FINAL',
  'CLOSED',
  'CANCELLED',
]
const VERIFICATION_CHECK_STATUS_OPTIONS: ImportVerificationCheckStatus[] = ['PENDING', 'PASS', 'WARN', 'FAIL']
const IMPORT_REPORT_EXPORTS = [
  { key: 'shipment-liquidation', label: 'Shipment liquidation' },
  { key: 'goods-in-transit', label: 'Goods in transit' },
  { key: 'expected-po-shipment', label: 'Expected PO shipment' },
  { key: 'landed-cost-allocation', label: 'Landed cost allocation' },
  { key: 'suggested-pricing-review', label: 'Suggested pricing review' },
  { key: 'ap-handoff', label: 'AP handoff' },
] as const

type ImportTabGuideKey =
  | 'overview'
  | 'invoices'
  | 'cost-builds'
  | 'expected-pos'
  | 'po-links'
  | 'charges'
  | 'payables'
  | 'transit'
  | 'receiving'
  | 'verification'
  | 'pricing'
  | 'reports'
  | 'audit'

interface ImportTabGuideConfig {
  eyebrow: string
  title: string
  information: string
  purpose: string
  use: string
}

const IMPORT_TAB_GUIDES: Record<ImportTabGuideKey, ImportTabGuideConfig> = {
  overview: {
    eyebrow: 'Shipment snapshot',
    title: 'Header fields and shipment identity',
    information: 'Buyer, workbook source, origin and destination ports, forwarder, BL, customs policy, ETA, and notes.',
    purpose: 'Use this tab to confirm the shipment record is the right container or workbook before changing cost, transit, or status data.',
    use: 'Check the header first when troubleshooting because every other tab rolls up to this shipment.',
  },
  invoices: {
    eyebrow: 'Commercial documents',
    title: 'Supplier invoices and invoice lines',
    information: 'Supplier invoice headers, imported line items, currencies, SKU mappings, PO links, base HNL amounts, and landed-cost fields.',
    purpose: 'Use this tab to turn supplier paperwork into app-owned cost lines for liquidation, OTB, receiving, pricing, and AP.',
    use: 'If a PO exists, bring merchandise in from Expected PO lines. If no PO exists, add CI merchandise rows here as FINISHED_GOOD / RECEIVE_TO_STOCK lines. Add service, barcode, fabric, and tag costs here too as ROLL_TO_OUTPUT component lines.',
  },
  'cost-builds': {
    eyebrow: 'Component costing',
    title: 'Live and persisted cost builds',
    information: 'Allocation groups, output lines, component lines, component HNL totals, warnings, and persisted build audit detail.',
    purpose: 'Use this tab to verify that material, conversion, and accessory costs can roll into the finished goods correctly.',
    use: 'Resolve warnings here before running landed-cost allocation; failed groups block allocation.',
  },
  'expected-pos': {
    eyebrow: 'Pre-invoice planning',
    title: 'Expected purchase-order lines',
    information: 'Open PO lines expected in the shipment, suggested invoice matches, and filters for vendor, buyer, currency, incoterm, status, and container.',
    purpose: 'Use this tab to build the shipment contents before all supplier invoices or workbook rows are available.',
    use: 'Search open PO lines, add selected lines to the shipment, and match invoice lines when the paperwork arrives.',
  },
  'po-links': {
    eyebrow: 'Purchasing bridge',
    title: 'Import lines linked to native POs',
    information: 'Every import line, its source type, SKU mapping, purchase-order connection, and draft-PO readiness.',
    purpose: 'Use this tab to make import costs visible to purchasing and to prepare clean receiving handoff.',
    use: 'Link invoice lines to PO lines, clear bad links, or create a draft purchase order for unmapped import lines.',
  },
  charges: {
    eyebrow: 'Landed-cost inputs',
    title: 'Freight, duty, tax, and local charges',
    information: 'Non-merchandise costs such as freight, insurance, customs duty, taxes, agency fees, local freight, and other import charges.',
    purpose: 'Use this tab to capture the extra costs that determine true landed cost and AP obligations.',
    use: 'Add or edit charges before allocation, and mark estimates as final when the actual charge is known.',
  },
  payables: {
    eyebrow: 'Accounting handoff',
    title: 'AP staging and payable status',
    information: 'Supplier invoice payables and landed-cost charge payables with staged, sent, paid, voided, and blocked status totals.',
    purpose: 'Use this tab to decide what is ready for accounting and what must wait for final landed-cost amounts.',
    use: 'Stage payables, mark ready rows as sent to AP, and track paid or voided handoff records.',
  },
  transit: {
    eyebrow: 'Physical movement',
    title: 'Containers and goods in transit',
    information: 'Container records, loose cargo groups, carton groups, goods-in-transit records, linked lines, quantities, and transit statuses.',
    purpose: 'Use this tab to keep the physical movement of imported stock aligned with the cost and receiving records.',
    use: 'Assign lines to containers or transit records and keep statuses current from planning through final receipt.',
  },
  receiving: {
    eyebrow: 'Inventory posting',
    title: 'Estimated, final, and true-up receiving',
    information: 'Ready, blocked, PO-linked, direct, and true-up receiving lines plus posted PO receipt, direct receipt, and true-up audit rows.',
    purpose: 'Use this tab to post import inventory into the app ledger with either estimated or final landed costs.',
    use: 'Filter receiving lines, select specific records, post estimated or final receipts, then review the audit section.',
  },
  verification: {
    eyebrow: 'Finalization checks',
    title: 'Liquidation readiness and manual checks',
    information: 'System readiness checks and manually recorded verification checks with pass, warning, and fail states.',
    purpose: 'Use this tab to keep final liquidation from closing while cost, receiving, PO, or AP issues remain unresolved.',
    use: 'Review failed checks, fix the source tab, and add verification checks as operational steps are completed.',
  },
  pricing: {
    eyebrow: 'Retail review',
    title: 'Suggested prices from landed cost',
    information: 'Suggested retail prices, approval states, mapped app SKUs, and the pricing handoff status created after allocation.',
    purpose: 'Use this tab to review whether the landed cost supports the intended retail price and margin.',
    use: 'Approve, reject, or post suggested prices after the relevant SKU and landed-cost data are ready.',
  },
  reports: {
    eyebrow: 'Exports',
    title: 'Operational and accounting extracts',
    information: 'CSV and XLSX exports for shipment liquidation, goods in transit, expected POs, allocation, suggested pricing, and AP handoff.',
    purpose: 'Use this tab to produce stable files for review, reconciliation, accounting, or external analysis.',
    use: 'Download the report format needed by the receiving, buying, accounting, or operations team.',
  },
  audit: {
    eyebrow: 'Change history',
    title: 'Import audit events',
    information: 'Recent audit events with actor, event type, reason, timestamps, before payloads, after payloads, and metadata.',
    purpose: 'Use this tab to understand who changed import records, why the change happened, and what data moved.',
    use: 'Refresh events and expand rows when researching cost changes, receiving posts, payable handoffs, or status moves.',
  },
}

function importTabHelpLabel(label: string, guideKey: ImportTabGuideKey) {
  const guide = IMPORT_TAB_GUIDES[guideKey]
  return (
    <Space size={5} align="center" wrap={false}>
      <span>{label}</span>
      <Popover
        trigger="click"
        placement="bottom"
        title={guide.title}
        content={(
          <Space direction="vertical" size="small" style={{ width: 320 }}>
            <Text type="secondary">{guide.information}</Text>
            <div>
              <Text strong>Purpose</Text>
              <Text type="secondary" style={{ display: 'block' }}>{guide.purpose}</Text>
            </div>
            <div>
              <Text strong>How to use it</Text>
              <Text type="secondary" style={{ display: 'block' }}>{guide.use}</Text>
            </div>
          </Space>
        )}
      >
        <Button
          type="text"
          shape="circle"
          size="small"
          aria-label={`${label} help`}
          data-testid={`import-tab-help-${guideKey}`}
          icon={<QuestionCircleOutlined />}
          onClick={(event) => event.stopPropagation()}
          style={{
            width: 18,
            minWidth: 18,
            height: 18,
            color: '#64748b',
          }}
        />
      </Popover>
    </Space>
  )
}

function addImportTabHelp<T extends { key: string; label: string }>(item: T) {
  if (!(item.key in IMPORT_TAB_GUIDES)) return item
  return {
    ...item,
    label: importTabHelpLabel(item.label, item.key as ImportTabGuideKey),
  }
}

const CONTAINER_STATUS_COLOR: Record<ImportContainerStatus, string> = {
  PLANNED: 'default',
  LOADED: 'blue',
  IN_TRANSIT: 'geekblue',
  ARRIVED: 'gold',
  RECEIVED: 'green',
  CANCELLED: 'red',
}

const GOODS_IN_TRANSIT_STATUS_COLOR: Record<GoodsInTransitStatus, string> = {
  PENDING: 'default',
  OWNED: 'cyan',
  IN_TRANSIT: 'geekblue',
  RECEIVING_ESTIMATED: 'gold',
  RECEIVED_FINAL: 'green',
  CLOSED: 'success',
  CANCELLED: 'red',
}
const SUGGESTED_PRICE_STATUS_COLOR: Record<ImportSuggestedPriceApprovalStatus, string> = {
  SUGGESTED: 'default',
  APPROVED: 'green',
  REJECTED: 'red',
  POSTED: 'blue',
}
const PAYABLE_STATUS_COLOR: Record<ImportPayableHandoffStatus, string> = {
  NOT_STAGED: 'default',
  READY: 'gold',
  SENT_TO_AP: 'green',
  PAID: 'success',
  VOIDED: 'red',
}
const VERIFICATION_CHECK_STATUS_COLOR: Record<ImportVerificationCheckStatus, string> = {
  PENDING: 'default',
  PASS: 'green',
  WARN: 'gold',
  FAIL: 'red',
}
const COMMITMENT_BASIS_COLOR: Record<ImportCommitmentBasis, string> = {
  ESTIMATED: 'gold',
  FINAL: 'green',
}
const RECEIVING_BASIS_COLOR: Record<ImportReceivingCostBasis, string> = {
  ESTIMATED: 'gold',
  FINAL: 'green',
}
const INVOICE_MATCH_STATUS_COLOR: Record<ImportInvoiceMatchReviewStatus, string> = {
  UNMATCHED: 'default',
  MATCHED: 'green',
  MATCH_WARNING: 'gold',
  APPROVED_MISMATCH: 'blue',
}

type ReceivingLineFilter = 'ALL' | 'READY' | 'BLOCKED' | 'TRUE_UP' | 'PO_LINKED' | 'DIRECT'
type ReceivingAuditBasisFilter = 'ALL' | ImportReceivingCostBasis
type InvoiceLineEntryMode = 'PO_LINES' | 'MANUAL'
type VendorSelectOption = { value: string; label: string; vendorName: string }
const IMPORT_MANAGEMENT_RECEIVE_ESTIMATED_PERMISSION = 'import_management.receive_estimated'
const IMPORT_MANAGEMENT_FINAL_LIQUIDATION_PERMISSION = 'import_management.final_liquidation'
const IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION = 'import_management.cost_override'
const IMPORT_MANAGEMENT_APPROVE_MISMATCH_PERMISSION = 'import_management.approve_mismatch'
const PRODUCTS_WRITE_PERMISSION = 'products.write'

const numberFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const compactFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

function money(value: number | null | undefined): string {
  return numberFmt.format(value ?? 0)
}

function compact(value: number | null | undefined): string {
  return compactFmt.format(value ?? 0)
}

function statusTag(status: ImportShipmentStatus) {
  return <Tag color={STATUS_COLOR[status]}>{status.replace(/_/g, ' ')}</Tag>
}

function sourceText(record: { sourceAmount: number; sourceCurrency: string; fxRate: number }) {
  return `${compact(record.sourceAmount)} ${record.sourceCurrency} @ ${compact(record.fxRate)}`
}

function previewSourceText(record: { sourceAmount: number; sourceCurrency: string; fxRate: number | null }) {
  return record.fxRate == null
    ? `${compact(record.sourceAmount)} ${record.sourceCurrency}`
    : `${compact(record.sourceAmount)} ${record.sourceCurrency} @ ${compact(record.fxRate)}`
}

function statusText(value: string) {
  return value.replace(/_/g, ' ')
}

function titleText(value: string) {
  return value
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function auditActor(row: ImportShipmentAuditEvent) {
  const metadata = asRecord(row.metadataJson)
  if (row.actorUser) return row.actorUser.displayName || row.actorUser.email
  return typeof metadata?.actor === 'string' && metadata.actor ? metadata.actor : 'System'
}

function auditSummary(row: ImportShipmentAuditEvent) {
  const after = asRecord(row.afterJson)
  if (!after) return row.reason || '-'
  if (typeof after.status === 'string') return `Status ${statusText(after.status)}`
  if (typeof after.handoffStatus === 'string') {
    return [
      `Payable ${statusText(after.handoffStatus)}`,
      typeof after.paymentReference === 'string' && after.paymentReference ? after.paymentReference : null,
      typeof after.paidAt === 'string' && after.paidAt ? after.paidAt : null,
      typeof after.apReference === 'string' && after.apReference ? after.apReference : null,
    ].filter(Boolean).join(' / ')
  }
  if (after.postedInventoryTrueUpCount != null || after.postedPurchaseOrderReceiptCount != null) {
    return [
      after.updatedRecordCount != null ? `${after.updatedRecordCount} records` : null,
      after.postedPurchaseOrderReceiptCount != null ? `${after.postedPurchaseOrderReceiptCount} PO receipts` : null,
      after.postedInventoryReceiptCount != null ? `${after.postedInventoryReceiptCount} direct receipts` : null,
      after.postedInventoryTrueUpCount != null ? `${after.postedInventoryTrueUpCount} true-ups` : null,
      after.postedInventoryTrueUpHnl != null ? `${money(Number(after.postedInventoryTrueUpHnl))} HNL true-up` : null,
    ].filter(Boolean).join(' / ')
  }
  if (after.hnlAmount != null) return `${money(Number(after.hnlAmount))} HNL`
  if (after.estimatedLandedUnitCostHnl != null) return `${money(Number(after.estimatedLandedUnitCostHnl))} HNL estimated landed`
  return row.reason || '-'
}

function renderAuditJson(value: unknown) {
  if (value == null) return <Text type="secondary">-</Text>
  return (
    <Text code style={{ whiteSpace: 'pre-wrap' }}>
      {JSON.stringify(value, null, 2)}
    </Text>
  )
}

function containerStatusTag(status: ImportContainerStatus) {
  return <Tag color={CONTAINER_STATUS_COLOR[status]}>{statusText(status)}</Tag>
}

function goodsStatusTag(status: GoodsInTransitStatus) {
  return <Tag color={GOODS_IN_TRANSIT_STATUS_COLOR[status]}>{statusText(status)}</Tag>
}

function suggestedPriceStatusTag(status: ImportSuggestedPriceApprovalStatus) {
  return <Tag color={SUGGESTED_PRICE_STATUS_COLOR[status]}>{statusText(status)}</Tag>
}

function readinessStatusTag(status: ImportLiquidationReadinessCheck['status']) {
  const color = status === 'PASS' ? 'green' : status === 'FAIL' ? 'red' : 'gold'
  return <Tag color={color}>{status}</Tag>
}

function verificationStatusTag(status: ImportVerificationCheckStatus) {
  return <Tag color={VERIFICATION_CHECK_STATUS_COLOR[status]}>{statusText(status)}</Tag>
}

function payableStatusTag(status: ImportPayableHandoffStatus) {
  return <Tag color={PAYABLE_STATUS_COLOR[status]}>{statusText(status)}</Tag>
}

function commitmentBasisTag(basis: ImportCommitmentBasis) {
  return <Tag color={COMMITMENT_BASIS_COLOR[basis]}>{statusText(basis)}</Tag>
}

function receivingBasisTag(basis: ImportReceivingCostBasis | null) {
  return basis ? <Tag color={RECEIVING_BASIS_COLOR[basis]}>{statusText(basis)}</Tag> : <Tag>BLOCKED</Tag>
}

function invoiceMatchStatusTag(status: ImportInvoiceMatchReviewStatus) {
  return <Tag color={INVOICE_MATCH_STATUS_COLOR[status]}>{statusText(status)}</Tag>
}

function datePickerValue(value: string | null | undefined) {
  return value ? dayjs(value) : undefined
}

function containerLabel(record: ImportContainerRecord) {
  return record.containerNumber || record.cargoGroup || statusText(record.containerType)
}

export default function ImportShipmentsPage() {
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const { shipmentId } = useParams<{ shipmentId?: string }>()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<ImportShipmentStatus | undefined>()
  const [q, setQ] = useState('')
  const [activeDetailTab, setActiveDetailTab] = useState<ImportTabGuideKey>('overview')
  const [createOpen, setCreateOpen] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [chargeOpen, setChargeOpen] = useState(false)
  const [editingChargeId, setEditingChargeId] = useState<string | null>(null)
  const [lineInvoiceId, setLineInvoiceId] = useState<string | null>(null)
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [lineEntryMode, setLineEntryMode] = useState<InvoiceLineEntryMode>('PO_LINES')
  const [selectedExpectedLineIds, setSelectedExpectedLineIds] = useState<string[]>([])
  const [expectedLineInvoiceQuantities, setExpectedLineInvoiceQuantities] = useState<Record<string, number>>({})
  const [addingExpectedLineIds, setAddingExpectedLineIds] = useState<string[]>([])
  const [locallyAddedExpectedLineIds, setLocallyAddedExpectedLineIds] = useState<string[]>([])
  const [nextInvoiceLineNumber, setNextInvoiceLineNumber] = useState<number | null>(null)
  const [autoSelectExpectedLines, setAutoSelectExpectedLines] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [allocationOpen, setAllocationOpen] = useState(false)
  const [workbookOpen, setWorkbookOpen] = useState(false)
  const [workbookFile, setWorkbookFile] = useState<File | null>(null)
  const [containerOpen, setContainerOpen] = useState(false)
  const [editingContainerId, setEditingContainerId] = useState<string | null>(null)
  const [goodsOpen, setGoodsOpen] = useState(false)
  const [editingGoodsRecordId, setEditingGoodsRecordId] = useState<string | null>(null)
  const [bulkGoodsOpen, setBulkGoodsOpen] = useState(false)
  const [verificationOpen, setVerificationOpen] = useState(false)
  const [editingVerificationCode, setEditingVerificationCode] = useState<string | null>(null)
  const [receivingAction, setReceivingAction] = useState<ImportReceivingCostBasis | null>(null)
  const [poDraftOpen, setPoDraftOpen] = useState(false)
  const [linkingInvoiceLineId, setLinkingInvoiceLineId] = useState<string | null>(null)
  const [skuLookupLine, setSkuLookupLine] = useState<ImportPurchaseOrderLinkLine | null>(null)
  const [expectedLineOpen, setExpectedLineOpen] = useState(false)
  const [editingShipmentLineId, setEditingShipmentLineId] = useState<string | null>(null)
  const [approvalShipmentLineId, setApprovalShipmentLineId] = useState<string | null>(null)
  const [payableAction, setPayableAction] = useState<{
    action: 'PAID' | 'VOID'
    payable: ImportPayableRecord
  } | null>(null)
  const [receivingLineFilter, setReceivingLineFilter] = useState<ReceivingLineFilter>('ALL')
  const [receivingAuditBasisFilter, setReceivingAuditBasisFilter] = useState<ReceivingAuditBasisFilter>('ALL')
  const [poCandidateQ, setPoCandidateQ] = useState('')
  const [poCandidateVendorCode, setPoCandidateVendorCode] = useState<string | undefined>()
  const [poCandidateBuyer, setPoCandidateBuyer] = useState<string | undefined>()
  const [poCandidateSourceCurrency, setPoCandidateSourceCurrency] = useState<string | undefined>()
  const [poCandidateIncotermCode, setPoCandidateIncotermCode] = useState<string | undefined>()
  const [poCandidateStatus, setPoCandidateStatus] = useState<string | undefined>()
  const [poCandidateContainerId, setPoCandidateContainerId] = useState<string | null>(null)
  const [selectedPoCandidateLineIds, setSelectedPoCandidateLineIds] = useState<string[]>([])
  const [selectedReceivingRecordIds, setSelectedReceivingRecordIds] = useState<string[]>([])
  const [clickedShipmentId, setClickedShipmentId] = useState<string | null>(null)
  const pathShipmentId = useMemo(() => {
    const match = /^\/import-management\/([^/?#]+)/.exec(location.pathname)
    return match?.[1] ? decodeURIComponent(match[1]) : null
  }, [location.pathname])
  const selectedShipmentId = shipmentId ?? pathShipmentId ?? clickedShipmentId
  const openShipmentDetail = useCallback((id: string) => {
    setActiveDetailTab('overview')
    setClickedShipmentId(id)
    navigate(`/import-management/${id}`)
  }, [navigate])
  const closeShipmentDetail = useCallback(() => {
    setActiveDetailTab('overview')
    setClickedShipmentId(null)
    navigate('/import-management')
  }, [navigate])

  const [createForm] = Form.useForm()
  const [invoiceForm] = Form.useForm()
  const [chargeForm] = Form.useForm()
  const [lineForm] = Form.useForm()
  const [statusForm] = Form.useForm()
  const [allocationForm] = Form.useForm()
  const [workbookForm] = Form.useForm<ImportWorkbookOptionsPayload>()
  const [containerForm] = Form.useForm()
  const [goodsForm] = Form.useForm()
  const [bulkGoodsForm] = Form.useForm()
  const [verificationForm] = Form.useForm()
  const [receivingForm] = Form.useForm()
  const [poDraftForm] = Form.useForm()
  const [poLineLinkForm] = Form.useForm()
  const [expectedLineForm] = Form.useForm()
  const [matchApprovalForm] = Form.useForm()
  const [payableActionForm] = Form.useForm()

  const { permissions } = useAuth()
  const canReceiveEstimatedImport = permissions.has(IMPORT_MANAGEMENT_RECEIVE_ESTIMATED_PERMISSION)
  const canFinalizeImport = permissions.has(IMPORT_MANAGEMENT_FINAL_LIQUIDATION_PERMISSION)
  const canOverrideImportCost = permissions.has(IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION)
  const canApproveImportMismatch = permissions.has(IMPORT_MANAGEMENT_APPROVE_MISMATCH_PERMISSION)
  const canPostSuggestedPrice = permissions.has(PRODUCTS_WRITE_PERMISSION)

  const shipments = useImportShipments({ page, pageSize: 25, status, q }, { enabled: !selectedShipmentId })
  const otbCommitments = useImportOtbCommitments({}, { enabled: !selectedShipmentId })
  const detail = useImportShipment(selectedShipmentId)
  const readiness = useImportLiquidationReadiness(activeDetailTab === 'verification' ? selectedShipmentId : null)
  const payables = useImportPayables(activeDetailTab === 'payables' ? selectedShipmentId : null)
  const receivingHandoff = useImportReceivingHandoff(activeDetailTab === 'receiving' ? selectedShipmentId : null)
  const auditEvents = useImportShipmentAuditEvents(activeDetailTab === 'audit' ? selectedShipmentId : null)
  const poLinking = useImportPurchaseOrderLinking(activeDetailTab === 'po-links' ? selectedShipmentId : null)
  const invoiceMatchSuggestions = useImportInvoiceMatchSuggestions(activeDetailTab === 'expected-pos' ? selectedShipmentId : null)
  const poLineCandidates = useImportShipmentLineCandidates(activeDetailTab === 'expected-pos' ? selectedShipmentId : null, {
    q: poCandidateQ,
    vendorCode: poCandidateVendorCode,
    buyer: poCandidateBuyer,
    sourceCurrency: poCandidateSourceCurrency,
    incotermCode: poCandidateIncotermCode,
    poStatus: poCandidateStatus,
  })
  const createShipment = useCreateImportShipment()
  const addInvoice = useAddImportSupplierInvoice()
  const updateInvoice = useUpdateImportSupplierInvoice()
  const addLine = useAddImportInvoiceLine()
  const updateLine = useUpdateImportInvoiceLine()
  const addShipmentLine = useAddImportShipmentLine()
  const updateShipmentLine = useUpdateImportShipmentLine()
  const removeShipmentLine = useRemoveImportShipmentLine()
  const matchShipmentLineInvoice = useMatchImportShipmentLineInvoice()
  const applyInvoiceMatchSuggestions = useApplyImportInvoiceMatchSuggestions()
  const approveInvoiceMatch = useApproveImportShipmentLineInvoiceMatch()
  const addCharge = useAddImportCharge()
  const updateCharge = useUpdateImportCharge()
  const updateStatus = useUpdateImportShipmentStatus()
  const allocateCost = useAllocateImportLandedCost()
  const previewWorkbook = usePreviewImportWorkbook()
  const importWorkbookMutation = useImportWorkbook()
  const addContainer = useAddImportContainer()
  const updateContainer = useUpdateImportContainer()
  const addGoodsRecord = useAddGoodsInTransitRecord()
  const updateGoodsRecord = useUpdateGoodsInTransitRecord()
  const createGoodsForShipment = useCreateGoodsInTransitForShipment()
  const updateSuggestedPriceStatus = useUpdateImportSuggestedPriceStatus()
  const stagePayables = useStageImportPayables()
  const markPayablesSent = useMarkImportPayablesSent()
  const markPayablePaid = useMarkImportPayablePaid()
  const voidPayable = useVoidImportPayable()
  const recordVerificationCheck = useRecordImportVerificationCheck()
  const receiveEstimated = useReceiveImportShipmentEstimated()
  const receiveFinal = useReceiveImportShipmentFinal()
  const createDraftPo = useCreateImportPurchaseOrderDraft()
  const linkPoLine = useLinkImportInvoiceLineToPurchaseOrderLine()
  const linkSku = useLinkImportInvoiceLineToSku()
  const buyerOptionsQuery = usePurchaseOrderBuyerOptions({ enabled: createOpen || poDraftOpen || activeDetailTab === 'expected-pos' })
  const vendorsQuery = useVendors(undefined, { enabled: invoiceOpen })

  const selectedShipment = detail.data
  const costOverridePermissionTitle = canOverrideImportCost ? undefined : `Missing permission: ${IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION}`
  const finalLiquidationPermissionTitle = canFinalizeImport ? undefined : `Missing permission: ${IMPORT_MANAGEMENT_FINAL_LIQUIDATION_PERMISSION}`
  const mismatchPermissionTitle = canApproveImportMismatch ? undefined : `Missing permission: ${IMPORT_MANAGEMENT_APPROVE_MISMATCH_PERMISSION}`

  function reportExportUrl(reportKey: string, format: 'csv' | 'xlsx') {
    return selectedShipmentId
      ? `/api/v1/import-management/shipments/${selectedShipmentId}/reports/${reportKey}?format=${format}`
      : undefined
  }

  useEffect(() => {
    setSelectedReceivingRecordIds([])
  }, [selectedShipmentId])

  useEffect(() => {
    setActiveDetailTab('overview')
  }, [selectedShipmentId])

  useEffect(() => {
    if (!pathShipmentId && !shipmentId) setClickedShipmentId(null)
  }, [pathShipmentId, shipmentId])

  const selectedInvoice = selectedShipment?.supplierInvoices.find((invoice) => invoice.id === lineInvoiceId) ?? null
  const workbookPreview = previewWorkbook.data ?? null
  const buyerSelectOptions = useMemo(() => {
    const options = (buyerOptionsQuery.data ?? []).map((buyer) => ({
      value: buyer.id,
      label: buyer.label === buyer.id ? buyer.label : `${buyer.label} (${buyer.id})`,
    }))

    if (selectedShipment?.buyer && !options.some((option) => option.value === selectedShipment.buyer)) {
      options.unshift({ value: selectedShipment.buyer, label: selectedShipment.buyer })
    }

    return options
  }, [buyerOptionsQuery.data, selectedShipment?.buyer])
  const receivingLines = useMemo(() => receivingHandoff.data?.lines ?? [], [receivingHandoff.data?.lines])
  const receivingAudit = receivingHandoff.data?.audit
  const containerOptions = useMemo(() => (
    (selectedShipment?.containers ?? []).map((container) => ({
      value: container.id,
      label: containerLabel(container),
    }))
  ), [selectedShipment?.containers])

  const receivingLineCounts = useMemo(() => ({
    all: receivingLines.length,
    ready: receivingLines.filter((line) => line.canReceive).length,
    blocked: receivingLines.filter((line) => !line.canReceive).length,
    trueUp: receivingLines.filter((line) => line.needsFinalTrueUp).length,
    poLinked: receivingLines.filter((line) => line.purchaseOrderLineId).length,
    direct: receivingLines.filter((line) => !line.purchaseOrderLineId && line.skuId).length,
  }), [receivingLines])

  const filteredReceivingLines = useMemo(() => receivingLines.filter((line) => {
    switch (receivingLineFilter) {
      case 'READY':
        return line.canReceive
      case 'BLOCKED':
        return !line.canReceive
      case 'TRUE_UP':
        return line.needsFinalTrueUp
      case 'PO_LINKED':
        return Boolean(line.purchaseOrderLineId)
      case 'DIRECT':
        return !line.purchaseOrderLineId && Boolean(line.skuId)
      case 'ALL':
      default:
        return true
    }
  }), [receivingLineFilter, receivingLines])

  const filteredPoReceiptAuditRows = useMemo(() => {
    const rows = receivingAudit?.purchaseOrderReceipts ?? []
    return receivingAuditBasisFilter === 'ALL'
      ? rows
      : rows.filter((row) => row.receiptBasis === receivingAuditBasisFilter)
  }, [receivingAudit?.purchaseOrderReceipts, receivingAuditBasisFilter])

  const filteredInventoryReceiptAuditRows = useMemo(() => {
    const rows = receivingAudit?.inventoryReceipts ?? []
    return receivingAuditBasisFilter === 'ALL'
      ? rows
      : rows.filter((row) => row.receiptBasis === receivingAuditBasisFilter)
  }, [receivingAudit?.inventoryReceipts, receivingAuditBasisFilter])

  const filteredInventoryTrueUpAuditRows = useMemo(() => {
    const rows = receivingAudit?.inventoryTrueUps ?? []
    return receivingAuditBasisFilter === 'ESTIMATED' ? [] : rows
  }, [receivingAudit?.inventoryTrueUps, receivingAuditBasisFilter])

  const shipmentColumns = useMemo<ColumnsType<ImportShipmentSummary>>(() => [
    {
      title: 'Shipment',
      dataIndex: 'shipmentNumber',
      key: 'shipmentNumber',
      render: (_value, record) => (
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => openShipmentDetail(record.id)}>
          {record.shipmentNumber}
        </Button>
      ),
    },
    { title: 'Name', dataIndex: 'displayName', key: 'displayName' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (value: ImportShipmentStatus) => statusTag(value) },
    { title: 'Buyer', dataIndex: 'buyer', key: 'buyer', render: (value: string | null) => value || '-' },
    { title: 'ETA', dataIndex: 'expectedArrivalAt', key: 'expectedArrivalAt', render: (value: string | null) => value || '-' },
    { title: 'Lines', dataIndex: 'lineCount', key: 'lineCount', align: 'right' },
    { title: 'Charges', dataIndex: 'chargeCount', key: 'chargeCount', align: 'right' },
    {
      title: 'Landed HNL',
      dataIndex: 'landedHnlTotal',
      key: 'landedHnlTotal',
      align: 'right',
      render: (value: number) => money(value),
    },
  ], [openShipmentDetail])

  const commitmentSummaryColumns = useMemo<ColumnsType<ImportOtbCommitmentSummary>>(() => [
    { title: 'Month', dataIndex: 'month', key: 'month', render: (value: string | null) => value || '-' },
    {
      title: 'Basis',
      dataIndex: 'commitmentBasis',
      key: 'commitmentBasis',
      render: (value: ImportCommitmentBasis) => commitmentBasisTag(value),
    },
    { title: 'Buyer', dataIndex: 'buyer', key: 'buyer', render: (value: string | null) => value || '-' },
    {
      title: 'Department',
      key: 'department',
      render: (_value: unknown, row) =>
        row.departmentNumber == null
          ? 'Unmapped'
          : `${row.departmentNumber}${row.departmentName ? ` - ${row.departmentName}` : ''}`,
    },
    {
      title: 'Category',
      dataIndex: 'categoryNumber',
      key: 'categoryNumber',
      render: (value: number | null) => value ?? 'Unmapped',
    },
    { title: 'Shipments', dataIndex: 'shipmentCount', key: 'shipmentCount', align: 'right' },
    { title: 'Lines', dataIndex: 'lineCount', key: 'lineCount', align: 'right' },
    {
      title: 'Committed HNL',
      dataIndex: 'landedHnlTotal',
      key: 'landedHnlTotal',
      align: 'right',
      render: (value: number) => money(value),
    },
  ], [])

  const invoiceColumns = useMemo<ColumnsType<ImportSupplierInvoiceRecord>>(() => [
    { title: 'Invoice', dataIndex: 'invoiceNumber', key: 'invoiceNumber' },
    { title: 'Supplier', dataIndex: 'supplierName', key: 'supplierName' },
    { title: 'Group', dataIndex: 'invoiceGroup', key: 'invoiceGroup', render: (value: string) => <Tag>{value}</Tag> },
    { title: 'Kind', dataIndex: 'invoiceKind', key: 'invoiceKind' },
    { title: 'Source', key: 'source', render: (_: unknown, row) => sourceText(row) },
    { title: 'HNL', dataIndex: 'hnlAmount', key: 'hnlAmount', align: 'right', render: (value: number) => money(value) },
    { title: 'Lines', key: 'lines', align: 'right', render: (_: unknown, row) => row.lines.length },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_: unknown, row) => (
        <Space.Compact>
          <Button
            size="small"
            onClick={() => openInvoiceForm(row)}
            disabled={!canOverrideImportCost}
            title={costOverridePermissionTitle}
          >
            Edit
          </Button>
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => openLineForm(row.id)}
            disabled={!canOverrideImportCost}
            title={costOverridePermissionTitle}
          >
            Line
          </Button>
        </Space.Compact>
      ),
    },
  ], [canOverrideImportCost, costOverridePermissionTitle])

  const lineColumns = useMemo<ColumnsType<ImportInvoiceLineRecord>>(() => [
    { title: '#', dataIndex: 'lineNumber', key: 'lineNumber', width: 56 },
    { title: 'Item', dataIndex: 'itemCode', key: 'itemCode', render: (value: string | null) => value || '-' },
    { title: 'Style', dataIndex: 'styleCode', key: 'styleCode', render: (value: string | null) => value || '-' },
    {
      title: 'SKU',
      dataIndex: 'skuCode',
      key: 'skuCode',
      render: (value: string | null) => value ? <Tag color="blue">{value}</Tag> : <Tag>UNMAPPED</Tag>,
    },
    {
      title: 'Cost role',
      dataIndex: 'costRole',
      key: 'costRole',
      render: (value: ImportInvoiceLineCostRole, row) => (
        <Space size={0} direction="vertical">
          <Tag color={row.receiptPolicy === 'RECEIVE_TO_STOCK' ? 'green' : 'gold'}>{value}</Tag>
          {row.allocationGroupKey ? <Text type="secondary">{row.allocationGroupKey}</Text> : null}
        </Space>
      ),
    },
    { title: 'Description', dataIndex: 'description', key: 'description', render: (value: string | null) => value || '-' },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', align: 'right', render: (value: number) => compact(value) },
    { title: 'Source', key: 'source', render: (_: unknown, row) => sourceText(row) },
    { title: 'Base HNL', dataIndex: 'hnlAmount', key: 'hnlAmount', align: 'right', render: (value: number) => money(value) },
    {
      title: 'Component HNL',
      dataIndex: 'componentAllocatedCostHnl',
      key: 'componentAllocatedCostHnl',
      align: 'right',
      render: (value: number) => value ? money(value) : '-',
    },
    {
      title: 'Landed Unit',
      dataIndex: 'landedUnitCostHnl',
      key: 'landedUnitCostHnl',
      align: 'right',
      render: (value: number | null) => (value == null ? '-' : money(value)),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_: unknown, row) => (
        <Button
          size="small"
          onClick={() => openLineForm(row.invoiceId, row)}
          disabled={!canOverrideImportCost}
          title={costOverridePermissionTitle}
        >
          Edit
        </Button>
      ),
    },
  ], [canOverrideImportCost, costOverridePermissionTitle])

  const costBuildPreviewColumns = useMemo<ColumnsType<ImportCostBuildPreviewRecord>>(() => [
    {
      title: 'Group',
      dataIndex: 'allocationGroupKey',
      key: 'allocationGroupKey',
      render: (value: string | null, row) => (
        <Space size={0} direction="vertical">
          <Space size="small">
            <Tag color={row.status === 'PASS' ? 'green' : row.status === 'WARN' ? 'gold' : 'red'}>{row.status}</Tag>
            <Text strong>{value || 'UNASSIGNED'}</Text>
          </Space>
          {row.warnings[0] ? <Text type="secondary">{row.warnings[0]}</Text> : null}
        </Space>
      ),
    },
    { title: 'Outputs', dataIndex: 'outputLineCount', key: 'outputLineCount', align: 'right' },
    { title: 'Components', dataIndex: 'componentLineCount', key: 'componentLineCount', align: 'right' },
    {
      title: 'Output HNL',
      dataIndex: 'outputHnlAmount',
      key: 'outputHnlAmount',
      align: 'right',
      render: (value: number) => money(value),
    },
    {
      title: 'Component HNL',
      dataIndex: 'componentHnlAmount',
      key: 'componentHnlAmount',
      align: 'right',
      render: (value: number) => money(value),
    },
    {
      title: 'Commercial HNL',
      dataIndex: 'commercialHnlAmount',
      key: 'commercialHnlAmount',
      align: 'right',
      render: (value: number) => money(value),
    },
    { title: 'Warnings', dataIndex: 'warningCount', key: 'warningCount', align: 'right' },
  ], [])

  const costBuildPreviewOutputColumns = useMemo<ColumnsType<ImportCostBuildPreviewOutput>>(() => [
    { title: 'Invoice', dataIndex: 'invoiceNumber', key: 'invoiceNumber' },
    {
      title: 'SKU',
      dataIndex: 'skuCode',
      key: 'skuCode',
      render: (value: string | null) => value ? <Tag color="green">{value}</Tag> : <Tag>UNMAPPED</Tag>,
    },
    { title: 'Item', dataIndex: 'itemCode', key: 'itemCode', render: (value: string | null) => value || '-' },
    { title: 'Style', dataIndex: 'styleCode', key: 'styleCode', render: (value: string | null) => value || '-' },
    { title: 'Description', dataIndex: 'description', key: 'description', render: (value: string | null) => value || '-' },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', align: 'right', render: (value: number) => compact(value) },
    { title: 'Base HNL', dataIndex: 'hnlAmount', key: 'hnlAmount', align: 'right', render: (value: number) => money(value) },
    {
      title: 'Component HNL',
      dataIndex: 'componentAllocatedCostHnl',
      key: 'componentAllocatedCostHnl',
      align: 'right',
      render: (value: number) => value ? money(value) : '-',
    },
    {
      title: 'Commercial Unit',
      dataIndex: 'commercialUnitCostHnl',
      key: 'commercialUnitCostHnl',
      align: 'right',
      render: (value: number) => money(value),
    },
  ], [])

  const costBuildPreviewComponentColumns = useMemo<ColumnsType<ImportCostBuildPreviewComponent>>(() => [
    {
      title: 'Invoice',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
      render: (value: string, row) => (
        <Space size={0} direction="vertical">
          <Text>{value}</Text>
          <Text type="secondary">{row.supplierName}</Text>
        </Space>
      ),
    },
    { title: 'Role', dataIndex: 'costRole', key: 'costRole', render: (value: ImportInvoiceLineCostRole) => <Tag color="gold">{value}</Tag> },
    { title: 'Item', dataIndex: 'itemCode', key: 'itemCode', render: (value: string | null) => value || '-' },
    { title: 'Style', dataIndex: 'styleCode', key: 'styleCode', render: (value: string | null) => value || '-' },
    { title: 'Description', dataIndex: 'description', key: 'description', render: (value: string | null) => value || '-' },
    {
      title: 'Qty',
      key: 'quantity',
      align: 'right',
      render: (_: unknown, row) => `${compact(row.quantity)} ${row.unitOfMeasure}`,
    },
    { title: 'HNL', dataIndex: 'hnlAmount', key: 'hnlAmount', align: 'right', render: (value: number) => money(value) },
    { title: 'Warning', dataIndex: 'warning', key: 'warning', render: (value: string | null) => value || '-' },
  ], [])

  const costBuildColumns = useMemo<ColumnsType<ImportCostBuildRecord>>(() => [
    {
      title: 'Build',
      dataIndex: 'buildCode',
      key: 'buildCode',
      render: (value: string, row) => (
        <Space size={0} direction="vertical">
          <Text strong>{value}</Text>
          {row.description ? <Text type="secondary">{row.description}</Text> : null}
        </Space>
      ),
    },
    {
      title: 'Output',
      key: 'output',
      render: (_: unknown, row) => (
        <Space size={0} direction="vertical">
          <Space size="small" wrap>
            {row.outputSkuCode ? <Tag color="green">{row.outputSkuCode}</Tag> : <Tag>UNMAPPED</Tag>}
            {row.outputInvoiceLineId ? <Tag>Invoice line</Tag> : null}
            {row.outputShipmentLineId ? <Tag>PO line</Tag> : null}
          </Space>
          <Text>{row.outputDescription || row.outputItemCode || '-'}</Text>
          {row.outputStyleCode ? <Text type="secondary">{row.outputStyleCode}</Text> : null}
        </Space>
      ),
    },
    { title: 'Output Qty', dataIndex: 'outputQuantity', key: 'outputQuantity', align: 'right', render: (value: number) => compact(value) },
    { title: 'Basis', dataIndex: 'allocationBasis', key: 'allocationBasis', render: (value: string) => <Tag>{value}</Tag> },
    { title: 'Components', dataIndex: 'componentCount', key: 'componentCount', align: 'right' },
    {
      title: 'Component HNL',
      dataIndex: 'componentAllocatedHnlAmount',
      key: 'componentAllocatedHnlAmount',
      align: 'right',
      render: (value: number) => money(value),
    },
  ], [])

  const componentAllocationColumns = useMemo<ColumnsType<ImportCostComponentAllocationRecord>>(() => [
    {
      title: 'Component invoice',
      dataIndex: 'componentInvoiceNumber',
      key: 'componentInvoiceNumber',
      render: (value: string, row) => (
        <Space size={0} direction="vertical">
          <Text>{value}</Text>
          <Text type="secondary">{row.componentSupplierName}</Text>
        </Space>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'componentCostRole',
      key: 'componentCostRole',
      render: (value: ImportInvoiceLineCostRole, row) => (
        <Space size={0} direction="vertical">
          <Tag color={row.componentReceiptPolicy === 'ROLL_TO_OUTPUT' ? 'gold' : 'green'}>{value}</Tag>
          {row.componentAllocationGroupKey ? <Text type="secondary">{row.componentAllocationGroupKey}</Text> : null}
        </Space>
      ),
    },
    { title: 'Item', dataIndex: 'componentItemCode', key: 'componentItemCode', render: (value: string | null) => value || '-' },
    { title: 'Style', dataIndex: 'componentStyleCode', key: 'componentStyleCode', render: (value: string | null) => value || '-' },
    { title: 'Description', dataIndex: 'componentDescription', key: 'componentDescription', render: (value: string | null) => value || '-' },
    { title: 'Basis', dataIndex: 'allocationBasis', key: 'allocationBasis', render: (value: string) => <Tag>{value}</Tag> },
    {
      title: 'Allocated HNL',
      dataIndex: 'allocatedHnlAmount',
      key: 'allocatedHnlAmount',
      align: 'right',
      render: (value: number) => money(value),
    },
    {
      title: 'Allocated Qty',
      dataIndex: 'allocatedQuantity',
      key: 'allocatedQuantity',
      align: 'right',
      render: (value: number | null) => (value == null ? '-' : compact(value)),
    },
  ], [])

  const expectedShipmentLines = selectedShipment?.shipmentLines ?? []
  const expectedSkuCodes = useMemo(() => (
    Array.from(new Set(
      expectedShipmentLines
        .map((line) => line.skuCode)
        .filter((value): value is string => Boolean(value)),
    )).sort()
  ), [expectedShipmentLines])
  const expectedSkuLookupEnabled = activeDetailTab === 'expected-pos' || (
    Boolean(lineInvoiceId) &&
    lineEntryMode === 'PO_LINES' &&
    !editingLineId
  )
  const expectedSkuLookup = useQuery({
    queryKey: ['import-management', 'expected-po-sku-lookup', expectedSkuCodes],
    queryFn: async () => {
      const entries = await Promise.all(expectedSkuCodes.map(async (skuCode) => {
        const result = await searchSkusForLookup({
          q: skuCode,
          searchField: 'SKU',
          skuMatchMode: 'prefix',
          limit: 20,
        })
        const exact = result.rows.find((row) => row.skuCode === skuCode) ?? null
        return [skuCode, exact] as const
      }))
      return Object.fromEntries(entries) as Record<string, SkuLookupRow | null>
    },
    enabled: expectedSkuLookupEnabled && expectedSkuCodes.length > 0,
    staleTime: 10 * 60 * 1000,
  })
  const expectedSkuByCode = expectedSkuLookup.data ?? {}

  const expectedLineColumns = useMemo<ColumnsType<ImportShipmentLineRecord>>(() => [
    { title: 'PO', dataIndex: 'purchaseOrderNumber', key: 'purchaseOrderNumber' },
    { title: 'Vendor', dataIndex: 'vendorCode', key: 'vendorCode' },
    {
      title: 'SKU',
      dataIndex: 'skuCode',
      key: 'skuCode',
      render: (value: string | null) => value ? <Tag color="blue">{value}</Tag> : <Tag>UNMAPPED</Tag>,
    },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true, render: (value: string | null) => value || '-' },
    { title: 'Qty', dataIndex: 'expectedQuantity', key: 'expectedQuantity', align: 'right', render: (value: number) => compact(value) },
    { title: 'Terms', key: 'terms', render: (_: unknown, row) => `${row.incotermCode || '-'} / ${row.sourceCurrency}` },
    {
      title: 'Container',
      dataIndex: 'containerId',
      key: 'containerId',
      render: (value: string | null, row) => (
        <Select
          allowClear
          size="small"
          value={value ?? undefined}
          options={containerOptions}
          loading={updateShipmentLine.isPending}
          style={{ minWidth: 150 }}
          onChange={(nextValue) => void submitExpectedLineContainerChange(row, nextValue ?? null)}
        />
      ),
    },
    { title: 'Source', key: 'source', render: (_: unknown, row) => row.sourceUnitCost == null ? row.sourceCurrency : `${compact(row.sourceUnitCost)} ${row.sourceCurrency}` },
    { title: 'Commercial HNL', dataIndex: 'commercialUnitCostHnl', key: 'commercialUnitCostHnl', align: 'right', render: (value: number) => money(value) },
    { title: 'Landed Unit', dataIndex: 'landedUnitCostHnl', key: 'landedUnitCostHnl', align: 'right', render: (value: number | null) => (value == null ? '-' : money(value)) },
    {
      title: 'Invoice',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
      render: (value: string | null, row) => (
        <Space size={0} direction="vertical">
          {value ? <Tag color="green">{value}</Tag> : <Tag>EXPECTED</Tag>}
          {invoiceMatchStatusTag(row.invoiceMatchReviewStatus)}
        </Space>
      ),
    },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (value: string) => <Tag>{value}</Tag> },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_: unknown, row) => (
        <Space.Compact>
          <Button
            size="small"
            onClick={() => openExpectedLineForm(row)}
            disabled={!canOverrideImportCost}
            title={costOverridePermissionTitle}
          >
            Edit
          </Button>
          {row.invoiceMatchReviewStatus === 'MATCH_WARNING' && (
            <Button
              size="small"
              onClick={() => openMatchApprovalForm(row)}
              disabled={!canApproveImportMismatch}
              title={mismatchPermissionTitle}
            >
              Approve
            </Button>
          )}
          {row.invoiceMatchReviewStatus === 'APPROVED_MISMATCH' && (
            <Button
              size="small"
              onClick={() => void submitClearMatchApproval(row.id)}
              loading={approveInvoiceMatch.isPending}
              disabled={!canApproveImportMismatch}
              title={mismatchPermissionTitle}
            >
              Clear approval
            </Button>
          )}
          <Button
            danger
            size="small"
            onClick={() => void submitRemoveShipmentLine(row.id)}
            loading={removeShipmentLine.isPending}
          >
            Remove
          </Button>
        </Space.Compact>
      ),
    },
  ], [
    approveInvoiceMatch.isPending,
    canApproveImportMismatch,
    canOverrideImportCost,
    containerOptions,
    costOverridePermissionTitle,
    mismatchPermissionTitle,
    removeShipmentLine.isPending,
    updateShipmentLine.isPending,
  ])

  const poCandidateColumns = useMemo<ColumnsType<ImportShipmentLineCandidate>>(() => [
    { title: 'PO', dataIndex: 'purchaseOrderNumber', key: 'purchaseOrderNumber' },
    { title: 'Vendor', key: 'vendor', render: (_: unknown, row) => `${row.vendorCode}${row.vendorName ? ` - ${row.vendorName}` : ''}` },
    { title: 'Buyer', dataIndex: 'buyer', key: 'buyer', render: (value: string | null) => value || '-' },
    { title: 'Status', dataIndex: 'purchaseOrderStatus', key: 'purchaseOrderStatus', render: (value: string) => <Tag>{statusText(value)}</Tag> },
    {
      title: 'SKU',
      dataIndex: 'skuCode',
      key: 'skuCode',
      render: (value: string | null) => value ? <Tag color="blue">{value}</Tag> : <Tag>UNMAPPED</Tag>,
    },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true, render: (value: string | null) => value || '-' },
    { title: 'Open', dataIndex: 'quantityOpen', key: 'quantityOpen', align: 'right', render: (value: number) => compact(value) },
    {
      title: 'Planned',
      dataIndex: 'quantityAlreadyPlanned',
      key: 'quantityAlreadyPlanned',
      align: 'right',
      render: (value: number, row) => (
        <Space direction="vertical" size={0}>
          <Text>{compact(value)}</Text>
          {row.plannedShipments && <Text type="secondary" style={{ fontSize: 12 }}>{row.plannedShipments}</Text>}
        </Space>
      ),
    },
    { title: 'Available', dataIndex: 'quantityAvailable', key: 'quantityAvailable', align: 'right', render: (value: number) => compact(value) },
    { title: 'Terms', key: 'terms', render: (_: unknown, row) => `${row.incotermCode || '-'} / ${row.sourceCurrency}` },
    { title: 'Est Landed', dataIndex: 'estimatedLandedUnitCostHnl', key: 'estimatedLandedUnitCostHnl', align: 'right', render: (value: number) => money(value) },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_: unknown, row) => (
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => void submitAddShipmentLine(row)}
          loading={addShipmentLine.isPending}
          disabled={!canOverrideImportCost || row.quantityAvailable <= 0}
          title={costOverridePermissionTitle}
        >
          Add
        </Button>
      ),
    },
  ], [addShipmentLine.isPending, canOverrideImportCost, costOverridePermissionTitle, poCandidateContainerId, selectedShipmentId])

  const invoiceMatchSuggestionColumns = useMemo<ColumnsType<ImportInvoiceMatchSuggestion>>(() => [
    {
      title: 'Expected PO',
      key: 'expected',
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <Text>{row.purchaseOrderNumber}</Text>
          <Text type="secondary">{row.expectedSkuCode || row.expectedDescription || '-'}</Text>
        </Space>
      ),
    },
    {
      title: 'Invoice line',
      key: 'invoice',
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <Text>{row.invoiceNumber}</Text>
          <Text type="secondary">{row.invoiceSkuCode || row.invoiceItemCode || row.invoiceDescription || '-'}</Text>
        </Space>
      ),
    },
    {
      title: 'Qty',
      key: 'quantity',
      align: 'right',
      render: (_: unknown, row) => `${compact(row.expectedQuantity)} / ${compact(row.invoiceQuantity)}`,
    },
    {
      title: 'HNL',
      key: 'hnl',
      align: 'right',
      render: (_: unknown, row) => `${money(row.expectedHnlAmount)} / ${money(row.invoiceHnlAmount)}`,
    },
    {
      title: 'Score',
      dataIndex: 'score',
      key: 'score',
      align: 'right',
      render: (value: number) => compact(value),
    },
    {
      title: 'Signals',
      dataIndex: 'reasons',
      key: 'reasons',
      render: (values: string[]) => (
        <Space wrap size={4}>
          {values.map((value) => <Tag key={value} color="blue">{value}</Tag>)}
        </Space>
      ),
    },
    {
      title: 'Warnings',
      dataIndex: 'warnings',
      key: 'warnings',
      render: (values: string[]) => values.length ? (
        <Space wrap size={4}>
          {values.map((value) => <Tag key={value} color="gold">{value}</Tag>)}
        </Space>
      ) : '-',
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_: unknown, row) => (
        <Button
          size="small"
          icon={<LinkOutlined />}
          onClick={() => void submitApplyMatchSuggestion(row)}
          loading={matchShipmentLineInvoice.isPending}
        >
          Match
        </Button>
      ),
    },
  ], [matchShipmentLineInvoice.isPending])

  const chargeColumns = useMemo<ColumnsType<ImportChargeRecord>>(() => [
    { title: 'Type', dataIndex: 'chargeType', key: 'chargeType', render: (value: string) => <Tag>{value}</Tag> },
    { title: 'Counterparty', dataIndex: 'counterparty', key: 'counterparty', render: (value: string | null) => value || '-' },
    { title: 'Document', dataIndex: 'documentNumber', key: 'documentNumber', render: (value: string | null) => value || '-' },
    { title: 'Source', key: 'source', render: (_: unknown, row) => sourceText(row) },
    { title: 'HNL', dataIndex: 'hnlAmount', key: 'hnlAmount', align: 'right', render: (value: number) => money(value) },
    { title: 'Treatment', dataIndex: 'costTreatment', key: 'costTreatment', render: (value: string) => <Tag>{value.replace(/_/g, ' ')}</Tag> },
    { title: 'Final', dataIndex: 'final', key: 'final', render: (value: boolean) => (value ? <Tag color="green">FINAL</Tag> : <Tag>EST</Tag>) },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_: unknown, row) => (
        <Button
          size="small"
          onClick={() => openChargeForm(row)}
          disabled={!canOverrideImportCost}
          title={costOverridePermissionTitle}
        >
          Edit
        </Button>
      ),
    },
  ], [canOverrideImportCost, costOverridePermissionTitle])

  const previewInvoiceColumns = useMemo<ColumnsType<ImportWorkbookSupplierInvoicePreview>>(() => [
    { title: 'Invoice', dataIndex: 'invoiceNumber', key: 'invoiceNumber', ellipsis: true },
    { title: 'Supplier', dataIndex: 'supplierName', key: 'supplierName', ellipsis: true },
    { title: 'Kind', dataIndex: 'invoiceKind', key: 'invoiceKind', render: (value: string) => <Tag>{value}</Tag> },
    { title: 'Lines', key: 'lines', align: 'right', render: (_: unknown, row) => row.lines.length },
    { title: 'Source', key: 'source', align: 'right', render: (_: unknown, row) => previewSourceText(row) },
    { title: 'HNL', dataIndex: 'hnlAmount', key: 'hnlAmount', align: 'right', render: (value: number | null) => (value == null ? '-' : money(value)) },
  ], [])

  const previewChargeColumns = useMemo<ColumnsType<ImportWorkbookChargePreview>>(() => [
    { title: 'Type', dataIndex: 'chargeType', key: 'chargeType', render: (value: string) => <Tag>{value}</Tag> },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', render: (value: string | null) => value || '-' },
    { title: 'Source', key: 'source', align: 'right', render: (_: unknown, row) => previewSourceText(row) },
    { title: 'HNL', dataIndex: 'hnlAmount', key: 'hnlAmount', align: 'right', render: (value: number | null) => (value == null ? '-' : money(value)) },
  ], [])

  const allLines = selectedShipment?.supplierInvoices.flatMap((invoice) => invoice.lines) ?? []
  const costBuildFailurePreviews = selectedShipment?.costBuildPreviews?.filter((preview) => preview.status === 'FAIL') ?? []
  const allocationBlockedByCostBuilds = costBuildFailurePreviews.length > 0
  const allocationBlockMessage = costBuildFailurePreviews
    .flatMap((preview) => preview.warnings)
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
  const allocationButtonTitle = !canOverrideImportCost
    ? costOverridePermissionTitle
    : allocationBlockedByCostBuilds
      ? 'Resolve blocking Cost Builds warnings before allocation.'
      : undefined
  const expectedVendorOptions = useMemo<VendorSelectOption[]>(() => {
    const byCode = new Map<string, VendorSelectOption>()
    for (const line of expectedShipmentLines) {
      if (!line.vendorCode) continue
      byCode.set(line.vendorCode, {
        value: line.vendorCode,
        label: `${line.vendorCode} - ${line.vendorName ?? line.vendorCode} (expected PO)`,
        vendorName: line.vendorName ?? line.vendorCode,
      })
    }
    return Array.from(byCode.values())
  }, [expectedShipmentLines])
  const vendorOptions = useMemo<VendorSelectOption[]>(() => {
    const byCode = new Map<string, VendorSelectOption>()
    const addOption = (option: VendorSelectOption) => {
      if (!option.value || byCode.has(option.value)) return
      byCode.set(option.value, option)
    }

    expectedVendorOptions.forEach(addOption)
    selectedShipment?.supplierInvoices.forEach((invoice) => {
      if (!invoice.supplierCode) return
      addOption({
        value: invoice.supplierCode,
        label: `${invoice.supplierCode} - ${invoice.supplierName}`,
        vendorName: invoice.supplierName,
      })
    })
    vendorsQuery.data?.forEach((vendor) => {
      addOption({
        value: vendor.code,
        label: `${vendor.code} - ${vendor.name}`,
        vendorName: vendor.name,
      })
    })

    return Array.from(byCode.values())
  }, [expectedVendorOptions, selectedShipment?.supplierInvoices, vendorsQuery.data])
  const unmatchedExpectedInvoiceLines = useMemo(() => (
    expectedShipmentLines.filter((line) => !line.invoiceLineId)
  ), [expectedShipmentLines])
  const pickerExpectedInvoiceLines = useMemo(() => {
    const locallyAdded = new Set(locallyAddedExpectedLineIds)
    return unmatchedExpectedInvoiceLines.filter((line) => !locallyAdded.has(line.id))
  }, [locallyAddedExpectedLineIds, unmatchedExpectedInvoiceLines])
  const selectedExpectedLines = useMemo(() => {
    const selected = new Set(selectedExpectedLineIds)
    return pickerExpectedInvoiceLines.filter((line) => selected.has(line.id))
  }, [pickerExpectedInvoiceLines, selectedExpectedLineIds])
  useEffect(() => {
    setExpectedLineInvoiceQuantities((previous) => {
      const next: Record<string, number> = {}
      for (const line of pickerExpectedInvoiceLines) {
        const previousValue = previous[line.id]
        const defaultValue = previousValue == null ? line.expectedQuantity : previousValue
        next[line.id] = Math.min(Math.max(defaultValue, 0.001), line.expectedQuantity)
      }
      return next
    })
  }, [pickerExpectedInvoiceLines])
  const getExpectedLineInvoiceQuantity = useCallback((row: ImportShipmentLineRecord) => {
    const value = expectedLineInvoiceQuantities[row.id] ?? row.expectedQuantity
    if (!Number.isFinite(value)) return row.expectedQuantity
    return Math.min(Math.max(value, 0.001), row.expectedQuantity)
  }, [expectedLineInvoiceQuantities])
  useEffect(() => {
    if (!autoSelectExpectedLines) return
    setSelectedExpectedLineIds(pickerExpectedInvoiceLines.map((line) => line.id))
    setAutoSelectExpectedLines(false)
  }, [autoSelectExpectedLines, pickerExpectedInvoiceLines])
  const invoiceLinePickerColumns = useMemo<ColumnsType<ImportShipmentLineRecord>>(() => [
    { title: 'PO', dataIndex: 'purchaseOrderNumber', key: 'purchaseOrderNumber', width: 110 },
    {
      title: 'Product',
      key: 'product',
      width: 330,
      render: (_: unknown, row) => {
        const sku = row.skuCode ? expectedSkuByCode[row.skuCode] : null
        return (
          <Space align="start">
            <div
              style={{
                width: 58,
                minWidth: 58,
                height: 58,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #f0f0f0',
                borderRadius: 6,
                background: '#fafafa',
                overflow: 'hidden',
              }}
            >
              {sku?.pictureUrl
                ? <ReportThumbnail url={sku.pictureUrl} alt={row.skuCode ?? ''} height={52} maxWidth={56} />
                : <InboxOutlined style={{ color: 'rgba(0, 0, 0, 0.35)', fontSize: 22 }} />}
            </div>
            <Space direction="vertical" size={0}>
              {row.skuCode ? <Tag color="blue">{row.skuCode}</Tag> : <Tag>UNMAPPED</Tag>}
              <Text ellipsis style={{ maxWidth: 230 }}>{row.description || sku?.description || '-'}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {[sku?.category, sku?.styleColor, sku?.vendor].filter(Boolean).join(' / ') || row.vendorName || '-'}
              </Text>
            </Space>
          </Space>
        )
      },
    },
    {
      title: 'Vendor',
      key: 'vendor',
      width: 190,
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <Text>{row.vendorCode}</Text>
          <Text type="secondary" ellipsis style={{ maxWidth: 160 }}>{row.vendorName || '-'}</Text>
        </Space>
      ),
    },
    { title: 'PO qty', dataIndex: 'expectedQuantity', key: 'expectedQuantity', align: 'right', width: 90, render: (value: number) => compact(value) },
    {
      title: 'Invoice qty',
      key: 'invoiceQuantity',
      align: 'right',
      width: 130,
      render: (_: unknown, row) => (
        <InputNumber
          min={0.001}
          max={row.expectedQuantity}
          step={1}
          value={expectedLineInvoiceQuantities[row.id] ?? row.expectedQuantity}
          style={{ width: 112 }}
          onChange={(value) => {
            const numericValue = typeof value === 'number' ? value : Number(value)
            const nextValue = Number.isFinite(numericValue)
              ? Math.min(Math.max(numericValue, 0.001), row.expectedQuantity)
              : row.expectedQuantity
            setExpectedLineInvoiceQuantities((previous) => ({ ...previous, [row.id]: nextValue }))
          }}
        />
      ),
    },
    { title: 'Terms', key: 'terms', width: 95, render: (_: unknown, row) => `${row.incotermCode || '-'} / ${row.sourceCurrency}` },
    {
      title: 'Unit source',
      key: 'sourceUnitCost',
      align: 'right',
      width: 120,
      render: (_: unknown, row) => row.sourceUnitCost == null ? '-' : `${compact(row.sourceUnitCost)} ${row.sourceCurrency}`,
    },
    {
      title: 'Source total',
      key: 'sourceTotal',
      align: 'right',
      width: 120,
      render: (_: unknown, row) => {
        const unit = row.sourceUnitCost ?? (row.fxRate ? row.commercialUnitCostHnl / row.fxRate : row.commercialUnitCostHnl)
        return `${compact(unit * getExpectedLineInvoiceQuantity(row))} ${row.sourceCurrency}`
      },
    },
    { title: 'Commercial HNL', dataIndex: 'commercialUnitCostHnl', key: 'commercialUnitCostHnl', align: 'right', width: 130, render: (value: number) => money(value) },
    { title: 'Landed Unit', dataIndex: 'landedUnitCostHnl', key: 'landedUnitCostHnl', align: 'right', width: 120, render: (value: number | null) => (value == null ? '-' : money(value)) },
    {
      title: 'Retail',
      key: 'retail',
      align: 'right',
      width: 95,
      render: (_: unknown, row) => {
        const sku = row.skuCode ? expectedSkuByCode[row.skuCode] : null
        return sku?.currentPrice == null ? '-' : money(sku.currentPrice)
      },
    },
    {
      title: 'Invoice',
      key: 'invoice',
      width: 130,
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <Tag>EXPECTED</Tag>
          {invoiceMatchStatusTag(row.invoiceMatchReviewStatus)}
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      fixed: 'right',
      width: 100,
      render: (_: unknown, row) => (
        <Button
          size="small"
          type="link"
          loading={addingExpectedLineIds.includes(row.id)}
          disabled={!canOverrideImportCost || addLine.isPending || matchShipmentLineInvoice.isPending || updateShipmentLine.isPending}
          onClick={() => void submitExpectedInvoiceLines([row], false)}
        >
          Add
        </Button>
      ),
    },
  ], [
    addLine.isPending,
    addingExpectedLineIds,
    canOverrideImportCost,
    expectedLineInvoiceQuantities,
    expectedSkuByCode,
    getExpectedLineInvoiceQuantity,
    matchShipmentLineInvoice.isPending,
    updateShipmentLine.isPending,
  ])
  const editingExpectedLine = expectedShipmentLines.find((line) => line.id === editingShipmentLineId) ?? null
  const approvalShipmentLine = expectedShipmentLines.find((line) => line.id === approvalShipmentLineId) ?? null
  const highConfidenceInvoiceMatchCount = useMemo(() => {
    const usedShipmentLines = new Set<string>()
    const usedInvoiceLines = new Set<string>()
    let count = 0
    for (const suggestion of [...(invoiceMatchSuggestions.data ?? [])].sort((a, b) => b.score - a.score)) {
      if (suggestion.score < 85 || suggestion.warnings.length > 0) continue
      if (usedShipmentLines.has(suggestion.shipmentLineId) || usedInvoiceLines.has(suggestion.invoiceLineId)) continue
      usedShipmentLines.add(suggestion.shipmentLineId)
      usedInvoiceLines.add(suggestion.invoiceLineId)
      count += 1
    }
    return count
  }, [invoiceMatchSuggestions.data])
  const containerById = useMemo(() => new Map(
    (selectedShipment?.containers ?? []).map((container) => [container.id, container]),
  ), [selectedShipment?.containers])
  const lineOptions = useMemo(() => (
    selectedShipment?.supplierInvoices.flatMap((invoice) =>
      invoice.lines.map((line) => ({
        value: line.id,
        label: `${invoice.invoiceNumber} #${line.lineNumber} ${line.itemCode || line.description || ''}`.trim(),
      })),
    ) ?? []
  ), [selectedShipment?.supplierInvoices])
  const invoiceLineMatchOptions = useMemo(() => {
    const matchedByLine = new Map(
      expectedShipmentLines
        .filter((line) => line.invoiceLineId && line.id !== editingShipmentLineId)
        .map((line) => [line.invoiceLineId as string, line]),
    )
    return lineOptions.map((option) => {
      const matched = matchedByLine.get(option.value)
      return {
        ...option,
        disabled: Boolean(matched),
        label: matched ? `${option.label} - matched to ${matched.purchaseOrderNumber}` : option.label,
      }
    })
  }, [editingShipmentLineId, expectedShipmentLines, lineOptions])
  const supplierInvoiceOptions = useMemo(() => (
    selectedShipment?.supplierInvoices.map((invoice) => ({
      value: invoice.id,
      label: `${invoice.invoiceNumber} - ${invoice.supplierName}`,
      supplierCode: invoice.supplierCode,
    })) ?? []
  ), [selectedShipment?.supplierInvoices])
  const lineById = useMemo(() => new Map(lineOptions.map((line) => [line.value, line.label])), [lineOptions])
  const shipmentLineOptions = useMemo(() => (
    expectedShipmentLines.map((line) => ({
      value: line.id,
      label: `${line.purchaseOrderNumber} ${line.skuCode || line.description || ''}`.trim(),
    }))
  ), [expectedShipmentLines])
  const shipmentLineById = useMemo(
    () => new Map(shipmentLineOptions.map((line) => [line.value, line.label])),
    [shipmentLineOptions],
  )
  const goodsInTransitRows = selectedShipment?.goodsInTransit ?? []
  const workbookUploadList = workbookFile
    ? [{ uid: workbookFile.name, name: workbookFile.name, status: 'done' as const }]
    : []

  const containerColumns = useMemo<ColumnsType<ImportContainerRecord>>(() => [
    { title: 'Type', dataIndex: 'containerType', key: 'containerType', render: (value: string) => <Tag>{statusText(value)}</Tag> },
    { title: 'Container', dataIndex: 'containerNumber', key: 'containerNumber', render: (value: string | null) => value || '-' },
    { title: 'Cargo group', dataIndex: 'cargoGroup', key: 'cargoGroup', render: (value: string | null) => value || '-' },
    { title: 'Seal', dataIndex: 'sealNumber', key: 'sealNumber', render: (value: string | null) => value || '-' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (value: ImportContainerStatus) => containerStatusTag(value) },
    { title: 'ETA', dataIndex: 'expectedArrivalAt', key: 'expectedArrivalAt', render: (value: string | null) => value || '-' },
    { title: 'Arrived', dataIndex: 'actualArrivalAt', key: 'actualArrivalAt', render: (value: string | null) => value || '-' },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_: unknown, row) => (
        <Button size="small" onClick={() => openContainerForm(row)}>
          Edit
        </Button>
      ),
    },
  ], [])

  const goodsColumns = useMemo<ColumnsType<GoodsInTransitRecordDto>>(() => [
    { title: 'Status', dataIndex: 'status', key: 'status', render: (value: GoodsInTransitStatus) => goodsStatusTag(value) },
    {
      title: 'Container',
      dataIndex: 'containerId',
      key: 'containerId',
      render: (value: string | null) => {
        if (!value) return '-'
        const container = containerById.get(value)
        return container ? containerLabel(container) : value
      },
    },
    {
      title: 'Line',
      dataIndex: 'invoiceLineId',
      key: 'invoiceLineId',
      ellipsis: true,
      render: (value: string | null, row) => {
        if (row.shipmentLineId) return shipmentLineById.get(row.shipmentLineId) ?? row.shipmentLineId
        return value ? lineById.get(value) ?? value : '-'
      },
    },
    { title: 'Qty', dataIndex: 'quantityInTransit', key: 'quantityInTransit', align: 'right', render: (value: number | null) => compact(value) },
    { title: 'Owned', dataIndex: 'ownershipTransferAt', key: 'ownershipTransferAt', render: (value: string | null) => value || '-' },
    { title: 'Expected', dataIndex: 'expectedReceiptAt', key: 'expectedReceiptAt', render: (value: string | null) => value || '-' },
    { title: 'Received', dataIndex: 'receivedAt', key: 'receivedAt', render: (value: string | null) => value || '-' },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_: unknown, row) => (
        <Button size="small" onClick={() => openGoodsForm(row)}>
          Edit
        </Button>
      ),
    },
  ], [containerById, lineById, shipmentLineById])

  const readinessColumns = useMemo<ColumnsType<ImportLiquidationReadinessCheck>>(() => [
    { title: 'Check', dataIndex: 'checkCode', key: 'checkCode' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (value: ImportLiquidationReadinessCheck['status']) => readinessStatusTag(value),
    },
    {
      title: 'Blocking',
      dataIndex: 'blocking',
      key: 'blocking',
      render: (value: boolean) => (value ? <Tag color="red">YES</Tag> : <Tag>NO</Tag>),
    },
    { title: 'Message', dataIndex: 'message', key: 'message' },
  ], [])

  const verificationCheckColumns = useMemo<ColumnsType<ImportVerificationCheckRecord>>(() => [
    { title: 'Check', dataIndex: 'checkCode', key: 'checkCode' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (value: ImportVerificationCheckStatus) => verificationStatusTag(value),
    },
    { title: 'Expected', dataIndex: 'expectedHnlAmount', key: 'expectedHnlAmount', align: 'right', render: (value: number | null) => (value == null ? '-' : money(value)) },
    { title: 'Actual', dataIndex: 'actualHnlAmount', key: 'actualHnlAmount', align: 'right', render: (value: number | null) => (value == null ? '-' : money(value)) },
    { title: 'Variance', dataIndex: 'varianceHnlAmount', key: 'varianceHnlAmount', align: 'right', render: (value: number | null) => (value == null ? '-' : money(value)) },
    { title: 'Message', dataIndex: 'message', key: 'message', render: (value: string | null) => value || '-' },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_: unknown, row) => (
        <Button size="small" onClick={() => openVerificationForm(row)}>
          Edit
        </Button>
      ),
    },
  ], [])

  const payableColumns = useMemo<ColumnsType<ImportPayableRecord>>(() => [
    { title: 'Source', dataIndex: 'sourceType', key: 'sourceType', render: (value: string) => statusText(value) },
    { title: 'Counterparty', dataIndex: 'counterparty', key: 'counterparty', ellipsis: true },
    { title: 'Document', dataIndex: 'documentNumber', key: 'documentNumber', render: (value: string | null) => value || '-' },
    { title: 'Kind', dataIndex: 'payableKind', key: 'payableKind', render: (value: string) => <Tag>{statusText(value)}</Tag> },
    { title: 'Source Amt', key: 'source', align: 'right', render: (_: unknown, row) => sourceText(row) },
    { title: 'HNL', dataIndex: 'hnlAmount', key: 'hnlAmount', align: 'right', render: (value: number) => money(value) },
    {
      title: 'Ready',
      dataIndex: 'readyForAp',
      key: 'readyForAp',
      render: (value: boolean, row) => (
        value ? <Tag color="green">READY</Tag> : <Tag color="gold">{row.final ? 'REVIEW' : 'EST'}</Tag>
      ),
    },
    {
      title: 'Handoff',
      dataIndex: 'handoffStatus',
      key: 'handoffStatus',
      render: (value: ImportPayableHandoffStatus) => payableStatusTag(value),
    },
    {
      title: 'AP Ref',
      dataIndex: 'apReference',
      key: 'apReference',
      render: (value: string | null) => value || '-',
    },
    {
      title: 'Payment',
      key: 'payment',
      render: (_: unknown, row) => {
        if (row.handoffStatus === 'PAID') {
          return (
            <Space direction="vertical" size={0}>
              <Text>{row.paymentReference || '-'}</Text>
              <Text type="secondary">{row.paidAt ? dayjs(row.paidAt).format('YYYY-MM-DD') : '-'}</Text>
            </Space>
          )
        }
        if (row.handoffStatus === 'VOIDED') {
          return (
            <Space direction="vertical" size={0}>
              <Text type="danger">Voided</Text>
              <Text type="secondary">{row.voidedAt ? dayjs(row.voidedAt).format('YYYY-MM-DD') : '-'}</Text>
            </Space>
          )
        }
        return '-'
      },
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_: unknown, row) => (
        <Space.Compact>
          <Button
            size="small"
            disabled={!row.handoffId || row.handoffStatus !== 'SENT_TO_AP'}
            onClick={() => openPayableAction('PAID', row)}
          >
            Paid
          </Button>
          <Button
            danger
            size="small"
            disabled={!row.handoffId || !['READY', 'SENT_TO_AP'].includes(row.handoffStatus)}
            onClick={() => openPayableAction('VOID', row)}
          >
            Void
          </Button>
        </Space.Compact>
      ),
    },
  ], [])

  const receivingColumns = useMemo<ColumnsType<ImportReceivingHandoffLine>>(() => [
    {
      title: 'Line',
      key: 'line',
      render: (_: unknown, row) => row.itemCode || row.styleCode || row.description || row.invoiceLineId,
      ellipsis: true,
    },
    {
      title: 'PO',
      dataIndex: 'purchaseOrderNumber',
      key: 'purchaseOrderNumber',
      render: (value: string | null, row) => value ? `${value}${row.purchaseOrderStatus ? ` (${statusText(row.purchaseOrderStatus)})` : ''}` : '-',
    },
    {
      title: 'Transit',
      dataIndex: 'transitStatus',
      key: 'transitStatus',
      render: (value: GoodsInTransitStatus | null) => value ? goodsStatusTag(value) : <Tag>NONE</Tag>,
    },
    {
      title: 'Container',
      dataIndex: 'containerLabel',
      key: 'containerLabel',
      render: (value: string | null, row) => value || row.containerId || '-',
      ellipsis: true,
    },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', align: 'right', render: (value: number) => compact(value) },
    {
      title: 'Basis',
      dataIndex: 'receivingCostBasis',
      key: 'receivingCostBasis',
      render: (value: ImportReceivingCostBasis | null) => receivingBasisTag(value),
    },
    {
      title: 'Unit HNL',
      dataIndex: 'receivingUnitCostHnl',
      key: 'receivingUnitCostHnl',
      align: 'right',
      render: (value: number | null) => (value == null ? '-' : money(value)),
    },
    {
      title: 'Line HNL',
      dataIndex: 'receivingLineCostHnl',
      key: 'receivingLineCostHnl',
      align: 'right',
      render: (value: number | null) => (value == null ? '-' : money(value)),
    },
    {
      title: 'Readiness',
      key: 'readiness',
      render: (_: unknown, row) => {
        if (row.needsFinalTrueUp) return <Tag color="orange">TRUE-UP</Tag>
        if (row.canReceive) return <Tag color="green">READY</Tag>
        return <Text type="secondary">{row.blockingReason ?? 'Blocked'}</Text>
      },
    },
  ], [])

  const poReceiptAuditColumns = useMemo<ColumnsType<ImportReceivingPurchaseOrderReceiptAuditRecord>>(() => [
    {
      title: 'Receipt',
      key: 'receipt',
      render: (_: unknown, row) => row.referenceNumber || row.receiptId.slice(0, 8),
      ellipsis: true,
    },
    {
      title: 'Basis',
      dataIndex: 'receiptBasis',
      key: 'receiptBasis',
      render: (value: ImportReceivingCostBasis | null) => receivingBasisTag(value),
    },
    { title: 'PO', dataIndex: 'purchaseOrderNumber', key: 'purchaseOrderNumber' },
    { title: 'Store', dataIndex: 'storeId', key: 'storeId', width: 80, render: (value: number | null) => value ?? '-' },
    { title: 'Lines', dataIndex: 'postedLineCount', key: 'postedLineCount', align: 'right', width: 80 },
    { title: 'Qty', dataIndex: 'postedQuantity', key: 'postedQuantity', align: 'right', render: (value: number) => compact(value) },
    { title: 'HNL', dataIndex: 'postedHnlAmount', key: 'postedHnlAmount', align: 'right', render: (value: number) => money(value) },
    { title: 'By', dataIndex: 'postedBy', key: 'postedBy' },
    { title: 'Posted', dataIndex: 'postedAt', key: 'postedAt', render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm') },
  ], [])

  const inventoryReceiptAuditColumns = useMemo<ColumnsType<ImportReceivingInventoryReceiptAuditRecord>>(() => [
    {
      title: 'Line',
      key: 'line',
      render: (_: unknown, row) => row.itemCode || row.description || row.invoiceLineId,
      ellipsis: true,
    },
    {
      title: 'Basis',
      dataIndex: 'receiptBasis',
      key: 'receiptBasis',
      render: (value: ImportReceivingCostBasis | null) => receivingBasisTag(value),
    },
    { title: 'Store', dataIndex: 'storeId', key: 'storeId', width: 80 },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', align: 'right', render: (value: number) => compact(value) },
    { title: 'Unit HNL', dataIndex: 'unitCostHnl', key: 'unitCostHnl', align: 'right', render: (value: number) => money(value) },
    { title: 'HNL', dataIndex: 'hnlAmount', key: 'hnlAmount', align: 'right', render: (value: number) => money(value) },
    { title: 'By', dataIndex: 'postedBy', key: 'postedBy' },
    { title: 'Posted', dataIndex: 'postedAt', key: 'postedAt', render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm') },
  ], [])

  const inventoryTrueUpAuditColumns = useMemo<ColumnsType<ImportReceivingInventoryTrueUpAuditRecord>>(() => [
    {
      title: 'Line',
      key: 'line',
      render: (_: unknown, row) => row.itemCode || row.description || row.invoiceLineId,
      ellipsis: true,
    },
    {
      title: 'Source',
      key: 'source',
      render: (_: unknown, row) => row.purchaseOrderNumber || (row.importInventoryReceiptId ? 'Direct receipt' : '-'),
    },
    { title: 'Store', dataIndex: 'storeId', key: 'storeId', width: 80 },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', align: 'right', render: (value: number) => compact(value) },
    { title: 'Est Unit', dataIndex: 'estimatedUnitCostHnl', key: 'estimatedUnitCostHnl', align: 'right', render: (value: number) => money(value) },
    { title: 'Final Unit', dataIndex: 'finalUnitCostHnl', key: 'finalUnitCostHnl', align: 'right', render: (value: number) => money(value) },
    { title: 'Delta HNL', dataIndex: 'deltaHnlAmount', key: 'deltaHnlAmount', align: 'right', render: (value: number) => money(value) },
    { title: 'By', dataIndex: 'postedBy', key: 'postedBy' },
    { title: 'Posted', dataIndex: 'postedAt', key: 'postedAt', render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm') },
  ], [])

  const poLinkColumns = useMemo<ColumnsType<ImportPurchaseOrderLinkLine>>(() => [
    {
      title: 'Line',
      key: 'line',
      render: (_: unknown, row) => row.itemCode || row.styleCode || row.description || row.invoiceLineId || row.shipmentLineId,
      ellipsis: true,
    },
    {
      title: 'Source',
      key: 'supplier',
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <Text>{row.invoiceNumber ?? 'Expected PO line'}</Text>
          <Text type="secondary">{row.supplierCode ? `${row.supplierCode} - ` : ''}{row.supplierName}</Text>
        </Space>
      ),
    },
    { title: 'SKU', dataIndex: 'skuCode', key: 'skuCode', render: (value: string | null) => value || '-' },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', align: 'right', render: (value: number, row) => `${compact(value)} ${row.unitOfMeasure}` },
    { title: 'Base Unit', dataIndex: 'baseUnitCostHnl', key: 'baseUnitCostHnl', align: 'right', render: (value: number) => money(value) },
    {
      title: 'Landed Unit',
      dataIndex: 'landedUnitCostHnl',
      key: 'landedUnitCostHnl',
      align: 'right',
      render: (value: number | null) => (value == null ? '-' : money(value)),
    },
    {
      title: 'PO',
      key: 'po',
      render: (_: unknown, row) => (
        row.purchaseOrderNumber
          ? (
            <Space direction="vertical" size={0}>
              <Text>{row.purchaseOrderNumber}</Text>
              <Text type="secondary">{row.purchaseOrderStatus ? statusText(row.purchaseOrderStatus) : '-'}</Text>
            </Space>
          )
          : <Tag>UNLINKED</Tag>
      ),
    },
    {
      title: 'Readiness',
      key: 'readiness',
      render: (_: unknown, row) => {
        if (row.purchaseOrderLineId) return <Tag color="green">LINKED</Tag>
        if (row.canCreatePurchaseOrderLine) return <Tag color="blue">READY</Tag>
        return <Text type="secondary">{row.blockingReason ?? 'Blocked'}</Text>
      },
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_: unknown, row) => {
        const canEditInvoiceLine = row.sourceType === 'INVOICE_LINE' && Boolean(row.invoiceLineId)
        return (
          <Space.Compact>
          <Button size="small" onClick={() => setSkuLookupLine(row)} disabled={!canEditInvoiceLine}>
            SKU
          </Button>
          <Button size="small" icon={<LinkOutlined />} onClick={() => openPoLineLinkForm(row)} disabled={!canEditInvoiceLine}>
            Link
          </Button>
          <Button
            size="small"
            disabled={!canEditInvoiceLine || !row.purchaseOrderLineId}
            loading={linkPoLine.isPending}
            onClick={() => void unlinkPoLine(row)}
          >
            Unlink
          </Button>
          <Button
            size="small"
            disabled={!canEditInvoiceLine || !row.skuId || !!row.purchaseOrderLineId}
            loading={linkSku.isPending}
            onClick={() => void clearLineSku(row)}
          >
            Clear
          </Button>
        </Space.Compact>
        )
      },
    },
  ], [linkPoLine.isPending, linkSku.isPending])

  async function submitCreateShipment() {
    const values = await createForm.validateFields()
    const created = await createShipment.mutateAsync(values)
    message.success('Import shipment created')
    setCreateOpen(false)
    createForm.resetFields()
    openShipmentDetail(created.id)
  }

  function openInvoiceForm(record?: ImportSupplierInvoiceRecord) {
    if (!canOverrideImportCost) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION}`)
      return
    }
    const defaultVendor = expectedVendorOptions.length === 1 ? expectedVendorOptions[0] : null
    const defaultExpectedLine = expectedShipmentLines[0]
    setEditingInvoiceId(record?.id ?? null)
    setInvoiceOpen(true)
    setTimeout(() => {
      invoiceForm.setFieldsValue(record ? {
        ...record,
        invoiceDate: datePickerValue(record.invoiceDate),
        fxDate: datePickerValue(record.fxDate),
      } : {
        supplierCode: defaultVendor?.value,
        supplierName: defaultVendor?.vendorName,
        sourceCurrency: defaultExpectedLine?.sourceCurrency ?? 'USD',
        fxRate: defaultExpectedLine?.fxRate ?? 1,
        fxDate: datePickerValue(defaultExpectedLine?.fxDate),
        invoiceGroup: 'TAXABLE',
        invoiceKind: 'MERCHANDISE',
      })
    }, 0)
  }

  function closeInvoiceForm() {
    setInvoiceOpen(false)
    setEditingInvoiceId(null)
    invoiceForm.resetFields()
  }

  async function submitInvoice() {
    if (!selectedShipmentId) return
    if (!canOverrideImportCost) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION}`)
      return
    }
    const values = await invoiceForm.validateFields()
    if (editingInvoiceId) {
      await updateInvoice.mutateAsync({ invoiceId: editingInvoiceId, payload: values })
      message.success('Supplier invoice updated')
    } else {
      await addInvoice.mutateAsync({ shipmentId: selectedShipmentId, payload: values })
      message.success('Supplier invoice added')
    }
    closeInvoiceForm()
  }

  function openLineForm(invoiceId: string, record?: ImportInvoiceLineRecord) {
    if (!canOverrideImportCost) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION}`)
      return
    }
    const invoice = selectedShipment?.supplierInvoices.find((candidate) => candidate.id === invoiceId)
    const nextLineNumber = invoice?.lines.length
      ? Math.max(...invoice.lines.map((line) => line.lineNumber)) + 1
      : 1
    setLineInvoiceId(invoiceId)
    setEditingLineId(record?.id ?? null)
    setLineEntryMode(record ? 'MANUAL' : 'PO_LINES')
    setNextInvoiceLineNumber(nextLineNumber)
    setLocallyAddedExpectedLineIds([])
    setAddingExpectedLineIds([])
    setExpectedLineInvoiceQuantities({})
    setSelectedExpectedLineIds(record ? [] : unmatchedExpectedInvoiceLines.map((line) => line.id))
    setAutoSelectExpectedLines(!record)
    setTimeout(() => {
      if (!record) return
      lineForm.setFieldsValue({
        ...record,
        fxDate: datePickerValue(record.fxDate),
      })
    }, 0)
  }

  function openManualLineEntry() {
    if (!lineInvoiceId) return
    const invoice = selectedShipment?.supplierInvoices.find((candidate) => candidate.id === lineInvoiceId)
    const lineNumber = nextInvoiceLineNumber ?? (
      invoice?.lines.length ? Math.max(...invoice.lines.map((line) => line.lineNumber)) + 1 : 1
    )
    setLineEntryMode('MANUAL')
    setTimeout(() => {
      lineForm.setFieldsValue({
        lineNumber,
        quantity: 1,
        unitOfMeasure: 'UNIT',
        sourceCurrency: invoice?.sourceCurrency ?? 'USD',
        fxRate: invoice?.fxRate ?? 1,
        fxDate: datePickerValue(invoice?.fxDate),
        costRole: 'FINISHED_GOOD',
        receiptPolicy: 'RECEIVE_TO_STOCK',
        taxable: true,
      })
    }, 0)
  }

  function closeLineForm() {
    setLineInvoiceId(null)
    setEditingLineId(null)
    setLineEntryMode('PO_LINES')
    setSelectedExpectedLineIds([])
    setExpectedLineInvoiceQuantities({})
    setAddingExpectedLineIds([])
    setLocallyAddedExpectedLineIds([])
    setNextInvoiceLineNumber(null)
    setAutoSelectExpectedLines(false)
    lineForm.resetFields()
  }

  function invoiceLinePayloadFromExpectedLine(
    row: ImportShipmentLineRecord,
    lineNumber: number,
    quantity: number,
  ): CreateImportInvoiceLinePayload {
    const fallbackUnitCost = row.sourceUnitCost ?? (
      row.fxRate ? row.commercialUnitCostHnl / row.fxRate : row.commercialUnitCostHnl
    )
    const sourceUnitCost = Number(fallbackUnitCost.toFixed(4))
    return {
      skuId: row.skuId,
      purchaseOrderLineId: row.purchaseOrderLineId,
      lineNumber,
      itemCode: row.skuCode ?? undefined,
      description: row.description ?? undefined,
      quantity,
      unitOfMeasure: 'UNIT',
      sourceUnitCost,
      sourceAmount: Number((quantity * sourceUnitCost).toFixed(4)),
      sourceCurrency: row.sourceCurrency,
      fxRate: row.fxRate,
      fxDate: row.fxDate,
      costRole: 'FINISHED_GOOD',
      receiptPolicy: 'RECEIVE_TO_STOCK',
      taxable: true,
    }
  }

  async function createAndMatchExpectedInvoiceLine(row: ImportShipmentLineRecord, lineNumber: number, quantity: number) {
    if (!lineInvoiceId) return
    const payload = invoiceLinePayloadFromExpectedLine(row, lineNumber, quantity)
    const updatedShipment = await addLine.mutateAsync({ invoiceId: lineInvoiceId, payload })
    const invoice = updatedShipment.supplierInvoices.find((candidate) => candidate.id === lineInvoiceId)
    const addedLine = (invoice?.lines ?? []).find((line) => (
      line.lineNumber === lineNumber && line.purchaseOrderLineId === row.purchaseOrderLineId
    )) ?? (invoice?.lines ?? [])
      .filter((line) => line.purchaseOrderLineId === row.purchaseOrderLineId)
      .sort((a, b) => b.lineNumber - a.lineNumber)[0]
    if (!addedLine) {
      throw new Error('Invoice line was added, but it could not be matched to the expected PO line.')
    }
    if (Math.abs(quantity - row.expectedQuantity) > 0.0001) {
      await updateShipmentLine.mutateAsync({
        shipmentLineId: row.id,
        payload: { expectedQuantity: quantity },
      })
    }
    await matchShipmentLineInvoice.mutateAsync({
      shipmentLineId: row.id,
      payload: { invoiceLineId: addedLine.id },
    })
  }

  async function submitExpectedInvoiceLines(rows: ImportShipmentLineRecord[], closeAfterAdd: boolean) {
    if (!lineInvoiceId || rows.length === 0) {
      message.info('Select at least one expected PO line.')
      return
    }
    if (!canOverrideImportCost) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION}`)
      return
    }
    const quantities = new Map(rows.map((row) => [row.id, getExpectedLineInvoiceQuantity(row)]))
    const invalidQuantityRow = rows.find((row) => {
      const quantity = quantities.get(row.id)
      return quantity == null || !Number.isFinite(quantity) || quantity <= 0 || quantity > row.expectedQuantity
    })
    if (invalidQuantityRow) {
      message.error('Invoice quantity must be greater than zero and no more than the PO quantity.')
      return
    }
    const baseLineNumber = nextInvoiceLineNumber ?? 1
    setAddingExpectedLineIds(rows.map((row) => row.id))
    try {
      for (const [index, row] of rows.entries()) {
        await createAndMatchExpectedInvoiceLine(row, baseLineNumber + index, quantities.get(row.id) ?? row.expectedQuantity)
      }
      setNextInvoiceLineNumber(baseLineNumber + rows.length)
      setLocallyAddedExpectedLineIds((prev) => Array.from(new Set([...prev, ...rows.map((row) => row.id)])))
      setSelectedExpectedLineIds((prev) => prev.filter((id) => !rows.some((row) => row.id === id)))
      message.success(`${rows.length} expected PO ${rows.length === 1 ? 'line' : 'lines'} added to invoice`)
      if (closeAfterAdd) closeLineForm()
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to add expected PO lines to invoice.')
    } finally {
      setAddingExpectedLineIds([])
    }
  }

  async function submitSelectedExpectedInvoiceLines() {
    await submitExpectedInvoiceLines(selectedExpectedLines, true)
  }

  async function submitLine() {
    if (!lineInvoiceId) return
    if (!canOverrideImportCost) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION}`)
      return
    }
    try {
      const values = await lineForm.validateFields()
      const {
        shipmentLineId,
        ...linePayload
      } = values as CreateImportInvoiceLinePayload & { shipmentLineId?: string | null }
      if (linePayload.sourceAmount == null && linePayload.sourceUnitCost == null) {
        lineForm.setFields([
          { name: 'sourceAmount', errors: ['Enter source amount or unit source cost.'] },
          { name: 'sourceUnitCost', errors: ['Enter unit source cost or source amount.'] },
        ])
        message.error('Enter source amount or unit source cost before saving the line.')
        return
      }
      if (editingLineId) {
        await updateLine.mutateAsync({ invoiceLineId: editingLineId, payload: linePayload })
        message.success('Invoice line updated')
      } else {
        const updatedShipment = await addLine.mutateAsync({ invoiceId: lineInvoiceId, payload: linePayload })
        if (shipmentLineId) {
          const invoice = updatedShipment.supplierInvoices.find((candidate) => candidate.id === lineInvoiceId)
          const matchingLines = (invoice?.lines ?? [])
            .filter((line) => (
              !linePayload.purchaseOrderLineId ||
              line.purchaseOrderLineId === linePayload.purchaseOrderLineId
            ))
            .sort((a, b) => b.lineNumber - a.lineNumber)
          const invoiceLinesByNumber = invoice?.lines.slice().sort((a, b) => b.lineNumber - a.lineNumber) ?? []
          const addedLine = matchingLines[0] ?? invoiceLinesByNumber[0]
          if (addedLine) {
            await matchShipmentLineInvoice.mutateAsync({
              shipmentLineId,
              payload: { invoiceLineId: addedLine.id },
            })
            message.success('Invoice line added and matched to expected PO line')
          } else {
            message.warning('Invoice line added, but the expected PO line could not be matched automatically.')
          }
        } else {
          message.success('Invoice line added')
        }
      }
      closeLineForm()
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to save invoice line.')
    }
  }

  async function submitAddShipmentLine(row: ImportShipmentLineCandidate) {
    if (!selectedShipmentId) {
      message.error('Open a shipment before adding expected PO lines.')
      return
    }
    if (!canOverrideImportCost) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION}`)
      return
    }
    try {
      await addShipmentLine.mutateAsync({
        shipmentId: selectedShipmentId,
        payload: {
          purchaseOrderLineId: row.purchaseOrderLineId,
          containerId: poCandidateContainerId,
          expectedQuantity: row.quantityAvailable,
          estimatedLandedUnitCostHnl: row.estimatedLandedUnitCostHnl,
        },
      })
      message.success('Expected PO line added. It now appears in the Expected PO lines table.')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to add expected PO line')
    }
  }

  async function submitBulkAddShipmentLines() {
    if (!selectedShipmentId) {
      message.error('Open a shipment before adding expected PO lines.')
      return
    }
    if (selectedPoCandidateLineIds.length === 0) {
      message.warning('Select at least one PO line to add.')
      return
    }
    if (!canOverrideImportCost) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION}`)
      return
    }
    const rows = (poLineCandidates.data ?? []).filter((row) =>
      selectedPoCandidateLineIds.includes(row.purchaseOrderLineId),
    )
    if (rows.length === 0) {
      setSelectedPoCandidateLineIds([])
      message.warning('The selected PO lines are no longer available. Refresh the candidates and try again.')
      return
    }
    let addedCount = 0
    try {
      for (const row of rows) {
        await addShipmentLine.mutateAsync({
          shipmentId: selectedShipmentId,
          payload: {
            purchaseOrderLineId: row.purchaseOrderLineId,
            containerId: poCandidateContainerId,
            expectedQuantity: row.quantityAvailable,
            estimatedLandedUnitCostHnl: row.estimatedLandedUnitCostHnl,
          },
        })
        addedCount += 1
      }
      setSelectedPoCandidateLineIds([])
      message.success(`${rows.length} expected PO lines added. They now appear in the Expected PO lines table.`)
    } catch (err) {
      message.error(
        err instanceof Error
          ? `${addedCount}/${rows.length} expected PO lines added. ${err.message}`
          : 'Failed to add selected expected PO lines',
      )
    }
  }

  async function submitExpectedLineContainerChange(row: ImportShipmentLineRecord, containerId: string | null) {
    await updateShipmentLine.mutateAsync({
      shipmentLineId: row.id,
      payload: { containerId },
    })
    message.success('Expected PO line container updated')
  }

  function openExpectedLineForm(record: ImportShipmentLineRecord) {
    if (!canOverrideImportCost) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION}`)
      return
    }
    setEditingShipmentLineId(record.id)
    setExpectedLineOpen(true)
    setTimeout(() => {
      expectedLineForm.setFieldsValue({
        containerId: record.containerId,
        expectedQuantity: record.expectedQuantity,
        estimatedLandedUnitCostHnl: record.estimatedLandedUnitCostHnl,
        invoiceLineId: record.invoiceLineId,
        notes: record.notes,
      })
    }, 0)
  }

  function closeExpectedLineForm() {
    setExpectedLineOpen(false)
    setEditingShipmentLineId(null)
    expectedLineForm.resetFields()
  }

  async function submitExpectedLine() {
    if (!editingShipmentLineId) return
    if (!canOverrideImportCost) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION}`)
      return
    }
    const current = expectedShipmentLines.find((line) => line.id === editingShipmentLineId)
    const values = await expectedLineForm.validateFields()
    const nextInvoiceLineId = values.invoiceLineId ?? null

    await updateShipmentLine.mutateAsync({
      shipmentLineId: editingShipmentLineId,
      payload: {
        containerId: values.containerId ?? null,
        expectedQuantity: values.expectedQuantity,
        estimatedLandedUnitCostHnl: values.estimatedLandedUnitCostHnl,
        notes: values.notes ?? null,
      },
    })

    if ((current?.invoiceLineId ?? null) !== nextInvoiceLineId) {
      await matchShipmentLineInvoice.mutateAsync({
        shipmentLineId: editingShipmentLineId,
        payload: { invoiceLineId: nextInvoiceLineId },
      })
    }

    message.success('Expected PO line updated')
    closeExpectedLineForm()
  }

  function openMatchApprovalForm(record: ImportShipmentLineRecord) {
    if (!canApproveImportMismatch) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_APPROVE_MISMATCH_PERMISSION}`)
      return
    }
    setApprovalShipmentLineId(record.id)
    setTimeout(() => {
      matchApprovalForm.setFieldsValue({
        reason: record.invoiceMatchApprovalReason,
      })
    }, 0)
  }

  function closeMatchApprovalForm() {
    setApprovalShipmentLineId(null)
    matchApprovalForm.resetFields()
  }

  async function submitApproveMatch() {
    if (!approvalShipmentLineId) return
    if (!canApproveImportMismatch) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_APPROVE_MISMATCH_PERMISSION}`)
      return
    }
    const values = await matchApprovalForm.validateFields()
    await approveInvoiceMatch.mutateAsync({
      shipmentLineId: approvalShipmentLineId,
      payload: { approved: true, reason: values.reason },
    })
    message.success('Invoice match mismatch approved')
    closeMatchApprovalForm()
  }

  async function submitClearMatchApproval(shipmentLineId: string) {
    if (!canApproveImportMismatch) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_APPROVE_MISMATCH_PERMISSION}`)
      return
    }
    await approveInvoiceMatch.mutateAsync({
      shipmentLineId,
      payload: { approved: false },
    })
    message.success('Invoice match approval cleared')
  }

  async function submitApplyMatchSuggestion(row: ImportInvoiceMatchSuggestion) {
    await matchShipmentLineInvoice.mutateAsync({
      shipmentLineId: row.shipmentLineId,
      payload: { invoiceLineId: row.invoiceLineId },
    })
    message.success(`Matched ${row.invoiceNumber} to ${row.purchaseOrderNumber}`)
  }

  async function submitApplyHighConfidenceInvoiceMatches() {
    if (!selectedShipmentId) return
    const result = await applyInvoiceMatchSuggestions.mutateAsync({
      shipmentId: selectedShipmentId,
      payload: { minScore: 85, allowWarnings: false },
    })
    const skippedText = result.skippedCount > 0 ? `; ${result.skippedCount} left for review` : ''
    message.success(`Applied ${result.appliedCount} invoice matches${skippedText}`)
  }

  async function submitRemoveShipmentLine(shipmentLineId: string) {
    await removeShipmentLine.mutateAsync({ shipmentLineId })
    message.success('Expected PO line removed')
  }

  function defaultCostTreatmentForChargeType(chargeType: string) {
    const activeLines = expectedShipmentLines.filter((line) => line.status !== 'CANCELLED')
    const allCifOrCip = activeLines.length > 0 && activeLines.every((line) => ['CIF', 'CIP'].includes(line.incotermCode ?? ''))
    return ['FREIGHT', 'INSURANCE'].includes(chargeType) && allCifOrCip
      ? 'INCLUDED_IN_COMMERCIAL_PRICE'
      : 'ALLOCATE_TO_LANDED'
  }

  function openChargeForm(record?: ImportChargeRecord) {
    if (!canOverrideImportCost) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION}`)
      return
    }
    setEditingChargeId(record?.id ?? null)
    setChargeOpen(true)
    setTimeout(() => {
      chargeForm.setFieldsValue(record ? {
        ...record,
        fxDate: datePickerValue(record.fxDate),
      } : {
        sourceCurrency: 'HNL',
        fxRate: 1,
        chargeType: 'FREIGHT',
        costTreatment: defaultCostTreatmentForChargeType('FREIGHT'),
        estimated: true,
        final: false,
      })
    }, 0)
  }

  function closeChargeForm() {
    setChargeOpen(false)
    setEditingChargeId(null)
    chargeForm.resetFields()
  }

  async function submitCharge() {
    if (!selectedShipmentId) return
    if (!canOverrideImportCost) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION}`)
      return
    }
    const values = await chargeForm.validateFields()
    if (editingChargeId) {
      await updateCharge.mutateAsync({ chargeId: editingChargeId, payload: values })
      message.success('Import charge updated')
    } else {
      await addCharge.mutateAsync({ shipmentId: selectedShipmentId, payload: values })
      message.success('Import charge added')
    }
    closeChargeForm()
  }

  async function submitStatus() {
    if (!selectedShipmentId) return
    const values = await statusForm.validateFields()
    await updateStatus.mutateAsync({ shipmentId: selectedShipmentId, payload: values })
    message.success('Shipment status updated')
    setStatusOpen(false)
    statusForm.resetFields()
  }

  async function submitAllocation() {
    if (!selectedShipmentId) return
    if (!canOverrideImportCost) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION}`)
      return
    }
    if (allocationBlockedByCostBuilds) {
      message.error('Resolve blocking Cost Builds warnings before allocation')
      return
    }
    const values = await allocationForm.validateFields()
    await allocateCost.mutateAsync({ shipmentId: selectedShipmentId, payload: values })
    message.success('Landed cost allocated')
    setAllocationOpen(false)
  }

  function resetWorkbookImport() {
    setWorkbookOpen(false)
    setWorkbookFile(null)
    workbookForm.resetFields()
    previewWorkbook.reset()
    importWorkbookMutation.reset()
  }

  async function previewSelectedWorkbook(file = workbookFile) {
    if (!file) {
      message.warning('Choose an .xlsx workbook')
      return
    }
    const values = workbookForm.getFieldsValue()
    try {
      await previewWorkbook.mutateAsync({ file, payload: values })
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to preview import workbook')
    }
  }

  async function submitWorkbookImport() {
    if (!canOverrideImportCost) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION}`)
      return
    }
    if (!workbookFile) {
      message.warning('Choose an .xlsx workbook')
      return
    }
    const values = await workbookForm.validateFields()
    try {
      const result = await importWorkbookMutation.mutateAsync({ file: workbookFile, payload: values })
      message.success('Workbook imported')
      resetWorkbookImport()
      openShipmentDetail(result.shipment.id)
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to import workbook')
    }
  }

  function openContainerForm(record?: ImportContainerRecord) {
    setEditingContainerId(record?.id ?? null)
    setContainerOpen(true)
    setTimeout(() => {
      containerForm.setFieldsValue(record ? {
        ...record,
        expectedArrivalAt: datePickerValue(record.expectedArrivalAt),
        actualArrivalAt: datePickerValue(record.actualArrivalAt),
      } : { containerType: 'LOOSE_CARGO', status: 'PLANNED' })
    }, 0)
  }

  function closeContainerForm() {
    setContainerOpen(false)
    setEditingContainerId(null)
    containerForm.resetFields()
  }

  async function submitContainer() {
    if (!selectedShipmentId) return
    const values = await containerForm.validateFields()
    if (editingContainerId) {
      await updateContainer.mutateAsync({ containerId: editingContainerId, payload: values })
      message.success('Container updated')
    } else {
      await addContainer.mutateAsync({ shipmentId: selectedShipmentId, payload: values })
      message.success('Container added')
    }
    closeContainerForm()
  }

  function openGoodsForm(record?: GoodsInTransitRecordDto) {
    setEditingGoodsRecordId(record?.id ?? null)
    setGoodsOpen(true)
    setTimeout(() => {
      goodsForm.setFieldsValue(record ? {
        ...record,
        ownershipTransferAt: datePickerValue(record.ownershipTransferAt),
        expectedReceiptAt: datePickerValue(record.expectedReceiptAt),
        receivedAt: datePickerValue(record.receivedAt),
      } : { status: 'IN_TRANSIT' })
    }, 0)
  }

  function closeGoodsForm() {
    setGoodsOpen(false)
    setEditingGoodsRecordId(null)
    goodsForm.resetFields()
  }

  async function submitGoodsRecord() {
    if (!selectedShipmentId) return
    const values = await goodsForm.validateFields()
    if (editingGoodsRecordId) {
      const { invoiceLineId: _invoiceLineId, ...payload } = values
      await updateGoodsRecord.mutateAsync({ recordId: editingGoodsRecordId, payload })
      message.success('Goods-in-transit record updated')
    } else {
      await addGoodsRecord.mutateAsync({ shipmentId: selectedShipmentId, payload: values })
      message.success('Goods-in-transit record added')
    }
    closeGoodsForm()
  }

  function openBulkGoodsForm() {
    setBulkGoodsOpen(true)
    setTimeout(() => {
      bulkGoodsForm.setFieldsValue({ status: 'IN_TRANSIT' })
    }, 0)
  }

  async function submitBulkGoodsRecords() {
    if (!selectedShipmentId) return
    const values = await bulkGoodsForm.validateFields()
    const result = await createGoodsForShipment.mutateAsync({ shipmentId: selectedShipmentId, payload: values })
    message.success(`${result.createdCount} goods-in-transit records created`)
    setBulkGoodsOpen(false)
    bulkGoodsForm.resetFields()
  }

  async function setSuggestedPriceStatus(
    suggestedPriceId: string,
    approvalStatus: ImportSuggestedPriceApprovalStatus,
  ) {
    await updateSuggestedPriceStatus.mutateAsync({ suggestedPriceId, payload: { approvalStatus } })
    message.success(`Suggested price marked ${statusText(approvalStatus).toLowerCase()}`)
  }

  async function submitStagePayables() {
    if (!selectedShipmentId) return
    const result = await stagePayables.mutateAsync({ shipmentId: selectedShipmentId })
    message.success(`${result.stagedReadyCount} payable documents staged`)
  }

  async function submitMarkPayablesSent() {
    if (!selectedShipmentId) return
    const result = await markPayablesSent.mutateAsync({ shipmentId: selectedShipmentId, payload: {} })
    message.success(`${result.sentCount} payable documents marked sent to AP`)
  }

  function openPayableAction(action: 'PAID' | 'VOID', payable: ImportPayableRecord) {
    setPayableAction({ action, payable })
    setTimeout(() => {
      payableActionForm.setFieldsValue(
        action === 'PAID'
          ? {
              paymentReference: payable.paymentReference ?? payable.apReference ?? undefined,
              paidAt: payable.paidAt ? dayjs(payable.paidAt) : dayjs(),
            }
          : { reason: payable.voidReason ?? undefined },
      )
    }, 0)
  }

  function closePayableAction() {
    setPayableAction(null)
    payableActionForm.resetFields()
  }

  async function submitPayableAction() {
    if (!selectedShipmentId || !payableAction?.payable.handoffId) return
    const values = await payableActionForm.validateFields()
    if (payableAction.action === 'PAID') {
      const result = await markPayablePaid.mutateAsync({
        shipmentId: selectedShipmentId,
        handoffId: payableAction.payable.handoffId,
        payload: values,
      })
      message.success(`${result.paidCount} payable documents marked paid`)
    } else {
      const result = await voidPayable.mutateAsync({
        shipmentId: selectedShipmentId,
        handoffId: payableAction.payable.handoffId,
        payload: values,
      })
      message.success(`${result.voidedCount} payable documents voided`)
    }
    closePayableAction()
  }

  function openVerificationForm(record?: ImportVerificationCheckRecord) {
    setEditingVerificationCode(record?.checkCode ?? null)
    setVerificationOpen(true)
    setTimeout(() => {
      verificationForm.setFieldsValue(record ? {
        checkCode: record.checkCode,
        status: record.status,
        expectedHnlAmount: record.expectedHnlAmount,
        actualHnlAmount: record.actualHnlAmount,
        varianceHnlAmount: record.varianceHnlAmount,
        message: record.message,
      } : { status: 'PENDING' })
    }, 0)
  }

  function closeVerificationForm() {
    setVerificationOpen(false)
    setEditingVerificationCode(null)
    verificationForm.resetFields()
  }

  async function submitVerificationCheck() {
    if (!selectedShipmentId) return
    const values = await verificationForm.validateFields()
    await recordVerificationCheck.mutateAsync({ shipmentId: selectedShipmentId, payload: values })
    message.success('Verification check recorded')
    closeVerificationForm()
  }

  function openReceivingAction(action: ImportReceivingCostBasis) {
    if (action === 'FINAL' && !canFinalizeImport) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_FINAL_LIQUIDATION_PERMISSION}`)
      return
    }
    if (action === 'ESTIMATED' && !canReceiveEstimatedImport) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_RECEIVE_ESTIMATED_PERMISSION}`)
      return
    }
    setReceivingAction(action)
    setTimeout(() => {
      receivingForm.setFieldsValue({
        receivedAt: dayjs(),
        containerId: null,
        shipmentLineIds: [],
      })
    }, 0)
  }

  function closeReceivingAction() {
    setReceivingAction(null)
    receivingForm.resetFields()
  }

  async function submitReceivingAction() {
    if (!selectedShipmentId || !receivingAction) return
    if (receivingAction === 'FINAL' && !canFinalizeImport) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_FINAL_LIQUIDATION_PERMISSION}`)
      return
    }
    if (receivingAction === 'ESTIMATED' && !canReceiveEstimatedImport) {
      message.error(`Missing permission: ${IMPORT_MANAGEMENT_RECEIVE_ESTIMATED_PERMISSION}`)
      return
    }
    const values = await receivingForm.validateFields()
    const payload = {
      ...values,
      goodsInTransitRecordIds: selectedReceivingRecordIds.length > 0 ? selectedReceivingRecordIds : undefined,
    }
    if (receivingAction === 'ESTIMATED') {
      const result = await receiveEstimated.mutateAsync({ shipmentId: selectedShipmentId, payload })
      message.success(`${result.updatedRecordCount} import lines recorded as estimated received; ${result.postedPurchaseOrderReceiptCount} PO receipts and ${result.postedInventoryReceiptCount} direct inventory receipts posted`)
    } else {
      const result = await receiveFinal.mutateAsync({ shipmentId: selectedShipmentId, payload })
      message.success(`${result.updatedRecordCount} import lines recorded as final received; ${result.postedPurchaseOrderReceiptCount} PO receipts and ${result.postedInventoryReceiptCount} direct inventory receipts posted; ${result.postedInventoryTrueUpCount} inventory true-ups posted (${money(result.postedInventoryTrueUpHnl)} HNL net)`)
    }
    setSelectedReceivingRecordIds([])
    closeReceivingAction()
  }

  function openPoDraftForm() {
    const firstSupplier = supplierInvoiceOptions.find((option) => option.supplierCode)
    setPoDraftOpen(true)
    setTimeout(() => {
      poDraftForm.setFieldsValue({
        supplierInvoiceId: firstSupplier?.value,
        vendorCode: firstSupplier?.supplierCode ?? undefined,
        buyer: selectedShipment?.buyer ?? undefined,
        unitCostSource: 'BASE' satisfies ImportPoUnitCostSource,
      })
    }, 0)
  }

  function closePoDraftForm() {
    setPoDraftOpen(false)
    poDraftForm.resetFields()
  }

  async function submitPoDraft() {
    if (!selectedShipmentId) return
    const values = await poDraftForm.validateFields()
    const result = await createDraftPo.mutateAsync({ shipmentId: selectedShipmentId, payload: values })
    message.success(`Draft PO ${result.purchaseOrderNumber} created with ${result.createdLineCount} lines`)
    closePoDraftForm()
  }

  function openPoLineLinkForm(row: ImportPurchaseOrderLinkLine) {
    if (!row.invoiceLineId) {
      message.info('This row is already represented by an expected PO line. Match a supplier invoice line from Expected POs when the invoice arrives.')
      return
    }
    setLinkingInvoiceLineId(row.invoiceLineId)
    setTimeout(() => {
      poLineLinkForm.setFieldsValue({ purchaseOrderLineId: row.purchaseOrderLineId ?? undefined })
    }, 0)
  }

  function closePoLineLinkForm() {
    setLinkingInvoiceLineId(null)
    poLineLinkForm.resetFields()
  }

  async function submitPoLineLink() {
    if (!linkingInvoiceLineId) return
    const values = await poLineLinkForm.validateFields()
    await linkPoLine.mutateAsync({ invoiceLineId: linkingInvoiceLineId, payload: values })
    message.success('Import line linked to purchase-order line')
    closePoLineLinkForm()
  }

  async function unlinkPoLine(row: ImportPurchaseOrderLinkLine) {
    if (!row.invoiceLineId) return
    await linkPoLine.mutateAsync({ invoiceLineId: row.invoiceLineId, payload: { purchaseOrderLineId: null } })
    message.success('Import line unlinked from purchase-order line')
  }

  function skuLookupInitialQuery(row: ImportPurchaseOrderLinkLine | null): string {
    if (!row) return ''
    return row.skuCode || row.itemCode || row.styleCode || row.description || ''
  }

  async function mapLineSku(picked: { skuId: string; skuCode: string }) {
    if (!skuLookupLine?.invoiceLineId) return
    await linkSku.mutateAsync({
      invoiceLineId: skuLookupLine.invoiceLineId,
      payload: { skuId: picked.skuId, skuCode: picked.skuCode },
    })
    message.success(`Mapped import line to SKU ${picked.skuCode}`)
    setSkuLookupLine(null)
  }

  async function clearLineSku(row: ImportPurchaseOrderLinkLine) {
    if (!row.invoiceLineId) return
    await linkSku.mutateAsync({ invoiceLineId: row.invoiceLineId, payload: { skuId: null, skuCode: null } })
    message.success('Import line SKU cleared')
  }

  const suggestedPriceColumns = useMemo<ColumnsType<ImportSuggestedPriceRecord>>(() => [
    {
      title: 'Line',
      dataIndex: 'invoiceLineId',
      key: 'invoiceLineId',
      ellipsis: true,
      render: (value: string) => lineById.get(value) ?? value,
    },
    { title: 'SKU', dataIndex: 'skuId', key: 'skuId', render: (value: string | null) => value || '-' },
    {
      title: 'Landed Unit',
      dataIndex: 'landedUnitCostHnl',
      key: 'landedUnitCostHnl',
      align: 'right',
      render: (value: number) => money(value),
    },
    {
      title: 'Factor',
      dataIndex: 'markupFactor',
      key: 'markupFactor',
      align: 'right',
      render: (value: number) => compact(value),
    },
    {
      title: 'Suggested Retail',
      dataIndex: 'suggestedRetailHnl',
      key: 'suggestedRetailHnl',
      align: 'right',
      render: (value: number) => money(value),
    },
    {
      title: 'Status',
      dataIndex: 'approvalStatus',
      key: 'approvalStatus',
      render: (value: ImportSuggestedPriceApprovalStatus) => suggestedPriceStatusTag(value),
    },
    {
      title: 'Reviewed',
      key: 'reviewed',
      render: (_: unknown, row) => (
        row.approvedAt ? `${row.approvedBy ?? 'system'} ${dayjs(row.approvedAt).format('YYYY-MM-DD HH:mm')}` : '-'
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_: unknown, row) => (
        <Space.Compact>
          <Button
            size="small"
            disabled={row.approvalStatus === 'APPROVED'}
            loading={updateSuggestedPriceStatus.isPending}
            onClick={() => void setSuggestedPriceStatus(row.id, 'APPROVED')}
          >
            Approve
          </Button>
          <Button
            size="small"
            disabled={row.approvalStatus === 'REJECTED'}
            loading={updateSuggestedPriceStatus.isPending}
            onClick={() => void setSuggestedPriceStatus(row.id, 'REJECTED')}
          >
            Reject
          </Button>
          <Button
            size="small"
            disabled={row.approvalStatus !== 'APPROVED' || !row.skuId || !canPostSuggestedPrice}
            loading={updateSuggestedPriceStatus.isPending}
            title={
              !canPostSuggestedPrice
                ? `Missing permission: ${PRODUCTS_WRITE_PERMISSION}`
                : !row.skuId
                  ? 'Map the import line to an app SKU before posting.'
                  : row.approvalStatus !== 'APPROVED'
                    ? 'Approve the suggested price before posting.'
                    : undefined
            }
            onClick={() => void setSuggestedPriceStatus(row.id, 'POSTED')}
          >
            Post
          </Button>
        </Space.Compact>
      ),
    },
  ], [canPostSuggestedPrice, lineById, updateSuggestedPriceStatus.isPending])

  const auditColumns = useMemo<ColumnsType<ImportShipmentAuditEvent>>(() => [
    {
      title: 'Time',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 220,
      render: (value: string) => <Tag>{titleText(value)}</Tag>,
    },
    {
      title: 'Resource',
      dataIndex: 'resourceType',
      key: 'resourceType',
      width: 150,
      render: (value: string) => titleText(value.replace(/^import\./, '')),
    },
    {
      title: 'Actor',
      key: 'actor',
      width: 170,
      render: (_: unknown, row) => auditActor(row),
    },
    {
      title: 'Summary',
      key: 'summary',
      render: (_: unknown, row) => auditSummary(row),
    },
    {
      title: 'Outcome',
      dataIndex: 'outcome',
      key: 'outcome',
      width: 100,
      render: (value: string) => <Tag color={value === 'SUCCESS' ? 'green' : 'red'}>{statusText(value)}</Tag>,
    },
  ], [])

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {!selectedShipmentId && (
        <>
          <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space direction="vertical" size={0}>
              <Title level={2} style={{ margin: 0 }}>Import Management</Title>
              <Text type="secondary">Amounts in HNL unless a source currency is shown.</Text>
            </Space>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => { void shipments.refetch(); void otbCommitments.refetch() }}
                loading={shipments.isFetching || otbCommitments.isFetching}
              >
                Refresh
              </Button>
              <Button icon={<UploadOutlined />} onClick={() => setWorkbookOpen(true)}>
                Workbook
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                Shipment
              </Button>
            </Space>
          </Space>

          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search shipment"
              value={q}
              onChange={(event) => { setQ(event.target.value); setPage(1) }}
              style={{ width: 260 }}
            />
            <Select
              allowClear
              placeholder="Status"
              value={status}
              onChange={(value) => { setStatus(value); setPage(1) }}
              options={STATUS_OPTIONS.map((value) => ({ value, label: value.replace(/_/g, ' ') }))}
              style={{ width: 220 }}
            />
          </Space>

          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Space wrap>
              <Statistic title="OTB Estimated HNL" value={otbCommitments.data?.totalEstimatedHnl ?? 0} precision={2} />
              <Statistic title="OTB Final HNL" value={otbCommitments.data?.totalFinalHnl ?? 0} precision={2} />
              <Statistic title="OTB Total HNL" value={otbCommitments.data?.totalHnl ?? 0} precision={2} />
            </Space>
            <Table
              rowKey={(row) => [
                row.month ?? 'unmapped-month',
                row.buyer ?? 'unmapped-buyer',
                row.commitmentBasis,
                row.departmentNumber ?? 'unmapped-department',
                row.categoryNumber ?? 'unmapped-category',
              ].join(':')}
              size="small"
              loading={otbCommitments.isLoading || otbCommitments.isFetching}
              columns={commitmentSummaryColumns}
              dataSource={otbCommitments.data?.summary ?? []}
              pagination={{ pageSize: 5, showSizeChanger: false }}
            />
          </Space>

          <Table
            rowKey="id"
            loading={shipments.isLoading || shipments.isFetching}
            columns={shipmentColumns}
            dataSource={shipments.data?.data ?? []}
            pagination={{
              current: shipments.data?.pagination.page ?? page,
              pageSize: shipments.data?.pagination.pageSize ?? 25,
              total: shipments.data?.pagination.totalItems ?? 0,
              onChange: (nextPage) => setPage(nextPage),
              showSizeChanger: false,
            }}
            onRow={(record) => ({ onDoubleClick: () => openShipmentDetail(record.id) })}
          />
        </>
      )}

      {selectedShipmentId && (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <Space align="start">
              <Button icon={<ArrowLeftOutlined />} onClick={closeShipmentDetail}>
                Shipments
              </Button>
              <Space direction="vertical" size={0}>
                <Title level={2} style={{ margin: 0 }}>
                  {selectedShipment ? `${selectedShipment.shipmentNumber} - ${selectedShipment.displayName}` : 'Import shipment'}
                </Title>
                <Text type="secondary">Amounts in HNL unless a source currency is shown.</Text>
              </Space>
            </Space>
            {selectedShipment ? statusTag(selectedShipment.status) : null}
          </Space>

          {detail.isLoading && (
            <Alert showIcon type="info" message="Loading import shipment" />
          )}
          {!detail.isLoading && !selectedShipment && (
            <Alert showIcon type="error" message="Import shipment not found" />
          )}

          {selectedShipment && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Space wrap>
              <Statistic title="Invoice HNL" value={selectedShipment.invoiceHnlTotal} precision={2} />
              <Statistic title="Charges HNL" value={selectedShipment.chargeHnlTotal} precision={2} />
              <Statistic title="Landed HNL" value={selectedShipment.landedHnlTotal} precision={2} />
              <Statistic title="Lines" value={selectedShipment.lineCount} />
            </Space>

            <Space wrap>
              <Button
                icon={<FileAddOutlined />}
                onClick={() => openInvoiceForm()}
                disabled={!canOverrideImportCost}
                title={costOverridePermissionTitle}
              >
                Supplier Invoice
              </Button>
              <Button
                icon={<TruckOutlined />}
                onClick={() => openChargeForm()}
                disabled={!canOverrideImportCost}
                title={costOverridePermissionTitle}
              >
                Charge
              </Button>
              <Button icon={<TruckOutlined />} onClick={() => openContainerForm()}>
                Container
              </Button>
              <Button icon={<PlusOutlined />} onClick={() => openGoodsForm()}>
                Transit Record
              </Button>
              <Button onClick={openBulkGoodsForm} disabled={selectedShipment.lineCount === 0}>
                Build Transit
              </Button>
              <Button icon={<ShoppingCartOutlined />} onClick={openPoDraftForm} disabled={allLines.length === 0}>
                Draft PO
              </Button>
              <Button
                icon={<CalculatorOutlined />}
                onClick={() => { setAllocationOpen(true); allocationForm.setFieldsValue({ markupFactor: 2.5 }) }}
                disabled={!canOverrideImportCost || allocationBlockedByCostBuilds}
                title={allocationButtonTitle}
              >
                Allocate
              </Button>
              <Button onClick={() => { setStatusOpen(true); statusForm.setFieldsValue({ status: selectedShipment.status }) }}>
                Status
              </Button>
            </Space>

            {allocationBlockedByCostBuilds && (
              <Alert
                showIcon
                type="error"
                message="Landed-cost allocation is blocked by cost-build warnings"
                description={allocationBlockMessage || 'Open Cost Builds and resolve blocking allocation groups.'}
              />
            )}

            <Tabs
              activeKey={activeDetailTab}
              onChange={(key) => setActiveDetailTab(key as ImportTabGuideKey)}
              items={[
                {
                  key: 'overview',
                  label: 'Overview',
                  children: (
                    <Descriptions bordered size="small" column={2}>
                      <Descriptions.Item label="Buyer">{selectedShipment.buyer || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Workbook">{selectedShipment.sourceWorkbookName || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Origin">{selectedShipment.originPort || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Destination">{selectedShipment.destinationPort || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Forwarder">{selectedShipment.freightForwarder || '-'}</Descriptions.Item>
                      <Descriptions.Item label="BL">{selectedShipment.blNumber || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Policy">{selectedShipment.customsPolicyNumber || '-'}</Descriptions.Item>
                      <Descriptions.Item label="ETA">{selectedShipment.expectedArrivalAt || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Notes" span={2}>{selectedShipment.notes || '-'}</Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: 'invoices',
                  label: 'Supplier Invoices',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Table rowKey="id" size="small" columns={invoiceColumns} dataSource={selectedShipment.supplierInvoices} pagination={false} />
                      <Table rowKey="id" size="small" columns={lineColumns} dataSource={allLines} pagination={{ pageSize: 8 }} />
                    </Space>
                  ),
                },
                {
                  key: 'cost-builds',
                  label: 'Cost Builds',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Alert
                        showIcon
                        type={(selectedShipment.costBuildPreviews?.some((row) => row.status === 'FAIL') ?? false) ? 'error' : 'info'}
                        message={`${selectedShipment.costBuildPreviews?.length ?? 0} live allocation groups`}
                        description="Review component/output grouping before allocation. Edit invoice line roles or allocation groups to clear warnings."
                      />
                      <Table
                        rowKey="previewKey"
                        size="small"
                        columns={costBuildPreviewColumns}
                        dataSource={selectedShipment.costBuildPreviews ?? []}
                        pagination={{ pageSize: 8 }}
                        expandable={{
                          expandedRowRender: (preview) => (
                            <Space direction="vertical" size="small" style={{ width: '100%' }}>
                              {preview.warnings.length > 0 && (
                                <Alert
                                  showIcon
                                  type={preview.status === 'FAIL' ? 'error' : 'warning'}
                                  message={preview.warnings.join(' ')}
                                />
                              )}
                              <Table
                                rowKey="invoiceLineId"
                                size="small"
                                title={() => `Outputs (${preview.outputs.length})`}
                                columns={costBuildPreviewOutputColumns}
                                dataSource={preview.outputs}
                                pagination={false}
                              />
                              <Table
                                rowKey="invoiceLineId"
                                size="small"
                                title={() => `Components (${preview.components.length})`}
                                columns={costBuildPreviewComponentColumns}
                                dataSource={preview.components}
                                pagination={false}
                              />
                            </Space>
                          ),
                          rowExpandable: (preview) => preview.outputs.length > 0 || preview.components.length > 0 || preview.warnings.length > 0,
                        }}
                      />
                      <Divider style={{ marginBlock: 8 }} />
                      <Alert
                        showIcon
                        type={(selectedShipment.costBuilds?.length ?? 0) > 0 ? 'info' : 'warning'}
                        message={`${selectedShipment.costBuilds?.length ?? 0} persisted output cost builds`}
                        description="Persisted builds are written when landed cost allocation runs and are used for audit and export detail."
                      />
                      <Table
                        rowKey="id"
                        size="small"
                        columns={costBuildColumns}
                        dataSource={selectedShipment.costBuilds ?? []}
                        pagination={{ pageSize: 8 }}
                        expandable={{
                          expandedRowRender: (build) => (
                            <Table
                              rowKey="id"
                              size="small"
                              columns={componentAllocationColumns}
                              dataSource={build.componentAllocations}
                              pagination={false}
                            />
                          ),
                          rowExpandable: (build) => build.componentAllocations.length > 0,
                        }}
                      />
                    </Space>
                  ),
                },
                {
                  key: 'expected-pos',
                  label: 'Expected POs',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Alert
                        showIcon
                        type="info"
                        message={`${expectedShipmentLines.length} expected PO lines in this shipment`}
                        description="Use this before supplier invoices or workbooks exist. Invoice lines can be matched later for liquidation and AP."
                      />
                      <Table
                        rowKey="id"
                        size="small"
                        columns={expectedLineColumns}
                        dataSource={expectedShipmentLines}
                        pagination={{ pageSize: 8 }}
                      />
                      {(invoiceMatchSuggestions.isLoading || (invoiceMatchSuggestions.data?.length ?? 0) > 0) && (
                        <>
                          <Divider style={{ margin: '8px 0' }} />
                          <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                            <Text strong>Suggested invoice matches</Text>
                            <Button
                              icon={<LinkOutlined />}
                              onClick={() => void submitApplyHighConfidenceInvoiceMatches()}
                              loading={applyInvoiceMatchSuggestions.isPending}
                              disabled={highConfidenceInvoiceMatchCount === 0}
                            >
                              Match high-confidence ({highConfidenceInvoiceMatchCount})
                            </Button>
                          </Space>
                          <Table
                            rowKey={(row) => `${row.shipmentLineId}-${row.invoiceLineId}`}
                            size="small"
                            loading={invoiceMatchSuggestions.isLoading || invoiceMatchSuggestions.isFetching}
                            columns={invoiceMatchSuggestionColumns}
                            dataSource={invoiceMatchSuggestions.data ?? []}
                            pagination={{ pageSize: 5 }}
                          />
                        </>
                      )}
                      <Divider style={{ margin: '8px 0' }} />
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Input.Search
                          allowClear
                          placeholder="Search open PO, vendor, SKU, description"
                          style={{ width: 360 }}
                          onSearch={(value) => setPoCandidateQ(value)}
                          onChange={(event) => {
                            if (!event.target.value) setPoCandidateQ('')
                          }}
                        />
                        <Input
                          allowClear
                          placeholder="Vendor"
                          value={poCandidateVendorCode}
                          onChange={(event) => setPoCandidateVendorCode(event.target.value || undefined)}
                          style={{ width: 120 }}
                        />
                        <Select
                          allowClear
                          showSearch
                          placeholder="Buyer"
                          value={poCandidateBuyer}
                          onChange={(value) => setPoCandidateBuyer(value)}
                          options={buyerSelectOptions}
                          style={{ width: 180 }}
                        />
                        <Select
                          allowClear
                          placeholder="Currency"
                          value={poCandidateSourceCurrency}
                          onChange={(value) => setPoCandidateSourceCurrency(value)}
                          options={SOURCE_CURRENCY_OPTIONS.map((value) => ({ value, label: value }))}
                          style={{ width: 120 }}
                        />
                        <Select
                          allowClear
                          placeholder="Incoterm"
                          value={poCandidateIncotermCode}
                          onChange={(value) => setPoCandidateIncotermCode(value)}
                          options={INCOTERM_OPTIONS.map((value) => ({ value, label: value }))}
                          style={{ width: 130 }}
                        />
                        <Select
                          allowClear
                          placeholder="PO status"
                          value={poCandidateStatus}
                          onChange={(value) => setPoCandidateStatus(value)}
                          options={PO_CANDIDATE_STATUS_OPTIONS.map((value) => ({ value, label: statusText(value) }))}
                          style={{ width: 180 }}
                        />
                        <Select
                          allowClear
                          placeholder="Default container"
                          value={poCandidateContainerId ?? undefined}
                          onChange={(value) => setPoCandidateContainerId(value ?? null)}
                          options={containerOptions}
                          style={{ width: 220 }}
                        />
                        <Button
                          icon={<PlusOutlined />}
                          onClick={() => void submitBulkAddShipmentLines()}
                          loading={addShipmentLine.isPending}
                          disabled={!canOverrideImportCost || selectedPoCandidateLineIds.length === 0}
                          title={costOverridePermissionTitle}
                        >
                          Add selected ({selectedPoCandidateLineIds.length})
                        </Button>
                        <Button icon={<ReloadOutlined />} onClick={() => void poLineCandidates.refetch()} loading={poLineCandidates.isFetching}>
                          Refresh
                        </Button>
                      </Space>
                      <Table
                        rowKey="purchaseOrderLineId"
                        size="small"
                        loading={poLineCandidates.isLoading || poLineCandidates.isFetching}
                        columns={poCandidateColumns}
                        dataSource={poLineCandidates.data ?? []}
                        rowSelection={{
                          selectedRowKeys: selectedPoCandidateLineIds,
                          onChange: (keys) => setSelectedPoCandidateLineIds(keys.map(String)),
                          getCheckboxProps: (row) => ({ disabled: !canOverrideImportCost || row.quantityAvailable <= 0 }),
                        }}
                        pagination={{ pageSize: 8 }}
                      />
                    </Space>
                  ),
                },
                {
                  key: 'po-links',
                  label: 'PO Links',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Alert
                        showIcon
                        type={poLinking.data?.creatableLineCount ? 'info' : 'warning'}
                        message={`${poLinking.data?.linkedLineCount ?? 0}/${poLinking.data?.lineCount ?? 0} import lines linked to purchase orders`}
                        description={`${poLinking.data?.creatableLineCount ?? 0} unlinked lines are ready for native draft PO creation.`}
                      />
                      <Space wrap>
                        <Statistic title="Unlinked" value={poLinking.data?.unlinkedLineCount ?? 0} />
                        <Statistic title="Ready for Draft PO" value={poLinking.data?.creatableLineCount ?? 0} />
                        <Button
                          icon={<ShoppingCartOutlined />}
                          onClick={openPoDraftForm}
                          loading={createDraftPo.isPending}
                          disabled={(poLinking.data?.creatableLineCount ?? 0) === 0}
                        >
                          Create Draft PO
                        </Button>
                      </Space>
                      <Table
                        rowKey={(row) => `${row.sourceType}:${row.invoiceLineId ?? row.shipmentLineId}`}
                        size="small"
                        loading={poLinking.isLoading || poLinking.isFetching}
                        columns={poLinkColumns}
                        dataSource={poLinking.data?.lines ?? []}
                        pagination={{ pageSize: 8 }}
                      />
                    </Space>
                  ),
                },
                {
                  key: 'charges',
                  label: 'Charges',
                  children: <Table rowKey="id" size="small" columns={chargeColumns} dataSource={selectedShipment.charges} pagination={false} />,
                },
                {
                  key: 'payables',
                  label: 'Payables',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Alert
                        showIcon
                        type={payables.data?.blockedCount ? 'warning' : 'info'}
                        message={`${money(payables.data?.readyHnlAmount)} HNL ready for AP handoff`}
                        description={
                          payables.data?.blockedCount
                            ? `${payables.data.blockedCount} estimated landed-cost charges are blocked until marked final.`
                            : undefined
                        }
                      />
                      <Space wrap>
                        <Statistic title="Staged" value={payables.data?.stagedCount ?? 0} />
                        <Statistic title="Sent" value={payables.data?.sentCount ?? 0} />
                        <Statistic title="Paid" value={payables.data?.paidCount ?? 0} />
                        <Statistic title="Voided" value={payables.data?.voidedCount ?? 0} />
                      </Space>
                      <Space wrap>
                        <Button
                          onClick={() => void submitStagePayables()}
                          loading={stagePayables.isPending}
                          disabled={(payables.data?.payables.length ?? 0) === 0}
                        >
                          Stage Payables
                        </Button>
                        <Button
                          onClick={() => void submitMarkPayablesSent()}
                          loading={markPayablesSent.isPending}
                          disabled={!payables.data?.payables.some((row) => row.handoffStatus === 'READY')}
                        >
                          Mark Sent to AP
                        </Button>
                      </Space>
                      <Table
                        rowKey={(row) => `${row.sourceType}-${row.sourceId}`}
                        size="small"
                        loading={payables.isLoading || payables.isFetching}
                        columns={payableColumns}
                        dataSource={payables.data?.payables ?? []}
                        pagination={{ pageSize: 8 }}
                      />
                    </Space>
                  ),
                },
                {
                  key: 'transit',
                  label: 'Transit',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Table
                        rowKey="id"
                        size="small"
                        columns={containerColumns}
                        dataSource={selectedShipment.containers}
                        pagination={false}
                      />
                      <Table
                        rowKey="id"
                        size="small"
                        columns={goodsColumns}
                        dataSource={goodsInTransitRows}
                        pagination={{ pageSize: 8 }}
                      />
                    </Space>
                  ),
                },
                {
                  key: 'receiving',
                  label: 'Receiving',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Alert
                        showIcon
                        type={receivingHandoff.data?.canReceive ? 'success' : 'warning'}
                        message={`${receivingHandoff.data?.readyLineCount ?? 0}/${receivingHandoff.data?.lineCount ?? 0} lines ready for receiving`}
                        description={
                          receivingHandoff.data?.requiresAuditReason
                            ? canReceiveEstimatedImport
                              ? 'Estimated receiving requires permission and an audit reason. Final liquidation can true-up the inventory cost later.'
                              : `Estimated receiving requires ${IMPORT_MANAGEMENT_RECEIVE_ESTIMATED_PERMISSION} and an audit reason.`
                            : receivingHandoff.data?.trueUpLineCount
                              ? `${receivingHandoff.data.trueUpLineCount} lines are ready for final cost true-up.`
                              : undefined
                        }
                      />
                      <Space wrap>
                        <Statistic title="Basis" value={receivingHandoff.data?.receivingCostBasis ?? 'BLOCKED'} />
                        <Statistic title="Ready HNL" value={receivingHandoff.data?.readyLandedHnl ?? 0} precision={2} />
                        <Statistic title="Total HNL" value={receivingHandoff.data?.totalLandedHnl ?? 0} precision={2} />
                        <Statistic title="True-up Lines" value={receivingHandoff.data?.trueUpLineCount ?? 0} />
                      </Space>
                      <Space wrap>
                        <Button
                          onClick={() => openReceivingAction('ESTIMATED')}
                          loading={receiveEstimated.isPending}
                          disabled={
                            !canReceiveEstimatedImport ||
                            !receivingHandoff.data?.canReceive ||
                            receivingHandoff.data.receivingCostBasis !== 'ESTIMATED'
                          }
                          title={!canReceiveEstimatedImport ? `Missing permission: ${IMPORT_MANAGEMENT_RECEIVE_ESTIMATED_PERMISSION}` : undefined}
                        >
                          {selectedReceivingRecordIds.length > 0 ? `Record Selected Estimated (${selectedReceivingRecordIds.length})` : 'Record Estimated Receipt'}
                        </Button>
                        <Button
                          onClick={() => openReceivingAction('FINAL')}
                          loading={receiveFinal.isPending}
                          disabled={
                            !canFinalizeImport ||
                            !receivingHandoff.data?.canReceive ||
                            receivingHandoff.data.receivingCostBasis !== 'FINAL'
                          }
                          title={finalLiquidationPermissionTitle}
                        >
                          {selectedReceivingRecordIds.length > 0 ? `Record Selected Final (${selectedReceivingRecordIds.length})` : 'Record Final Receipt'}
                        </Button>
                      </Space>
                      <Space wrap align="center">
                        <Text strong>Receiving lines</Text>
                        <Segmented
                          value={receivingLineFilter}
                          onChange={(value) => setReceivingLineFilter(value as ReceivingLineFilter)}
                          options={[
                            { label: `All (${receivingLineCounts.all})`, value: 'ALL' },
                            { label: `Ready (${receivingLineCounts.ready})`, value: 'READY' },
                            { label: `Blocked (${receivingLineCounts.blocked})`, value: 'BLOCKED' },
                            { label: `True-up (${receivingLineCounts.trueUp})`, value: 'TRUE_UP' },
                            { label: `PO (${receivingLineCounts.poLinked})`, value: 'PO_LINKED' },
                            { label: `Direct (${receivingLineCounts.direct})`, value: 'DIRECT' },
                          ]}
                        />
                      </Space>
                      <Table
                        rowKey={(row) => row.goodsInTransitRecordId ?? row.invoiceLineId}
                        size="small"
                        loading={receivingHandoff.isLoading || receivingHandoff.isFetching}
                        columns={receivingColumns}
                        dataSource={filteredReceivingLines}
                        rowSelection={{
                          selectedRowKeys: selectedReceivingRecordIds,
                          onChange: (keys) => setSelectedReceivingRecordIds(keys.map(String)),
                          getCheckboxProps: (row) => ({
                            disabled: !row.goodsInTransitRecordId || !row.canReceive,
                          }),
                        }}
                        pagination={{ pageSize: 8 }}
                      />
                      <Divider style={{ marginBlock: 8 }} />
                      <Title level={5}>Posted Audit</Title>
                      <Space wrap>
                        <Statistic title="PO Receipt HNL" value={receivingHandoff.data?.audit?.purchaseOrderReceiptHnl ?? 0} precision={2} />
                        <Statistic title="Direct Receipt HNL" value={receivingHandoff.data?.audit?.inventoryReceiptHnl ?? 0} precision={2} />
                        <Statistic title="True-up HNL" value={receivingHandoff.data?.audit?.inventoryTrueUpHnl ?? 0} precision={2} />
                      </Space>
                      <Space wrap align="center">
                        <Text strong>Audit basis</Text>
                        <Segmented
                          value={receivingAuditBasisFilter}
                          onChange={(value) => setReceivingAuditBasisFilter(value as ReceivingAuditBasisFilter)}
                          options={[
                            { label: 'All', value: 'ALL' },
                            { label: 'Estimated', value: 'ESTIMATED' },
                            { label: 'Final', value: 'FINAL' },
                          ]}
                        />
                      </Space>
                      <Table
                        rowKey="receiptId"
                        size="small"
                        title={() => `PO receipts (${filteredPoReceiptAuditRows.length})`}
                        loading={receivingHandoff.isLoading || receivingHandoff.isFetching}
                        columns={poReceiptAuditColumns}
                        dataSource={filteredPoReceiptAuditRows}
                        pagination={{ pageSize: 5 }}
                      />
                      <Table
                        rowKey="receiptId"
                        size="small"
                        title={() => `Direct inventory receipts (${filteredInventoryReceiptAuditRows.length})`}
                        loading={receivingHandoff.isLoading || receivingHandoff.isFetching}
                        columns={inventoryReceiptAuditColumns}
                        dataSource={filteredInventoryReceiptAuditRows}
                        pagination={{ pageSize: 5 }}
                      />
                      <Table
                        rowKey="trueUpId"
                        size="small"
                        title={() => `Inventory true-ups (${filteredInventoryTrueUpAuditRows.length})`}
                        loading={receivingHandoff.isLoading || receivingHandoff.isFetching}
                        columns={inventoryTrueUpAuditColumns}
                        dataSource={filteredInventoryTrueUpAuditRows}
                        pagination={{ pageSize: 5 }}
                      />
                    </Space>
                  ),
                },
                {
                  key: 'verification',
                  label: 'Verification',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Alert
                        showIcon
                        type={readiness.data?.canFinalize ? 'success' : 'warning'}
                        message={readiness.data?.canFinalize ? 'Final liquidation checks are clear' : 'Final liquidation has open checks'}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button icon={<PlusOutlined />} onClick={() => openVerificationForm()}>
                          Verification Check
                        </Button>
                      </div>
                      <Table
                        rowKey="checkCode"
                        size="small"
                        loading={readiness.isLoading || readiness.isFetching}
                        dataSource={readiness.data?.checks ?? []}
                        pagination={false}
                        columns={readinessColumns}
                      />
                      <Divider style={{ marginBlock: 8 }} />
                      <Table
                        rowKey="id"
                        size="small"
                        dataSource={selectedShipment.verificationChecks}
                        pagination={false}
                        columns={verificationCheckColumns}
                      />
                    </Space>
                  ),
                },
                {
                  key: 'pricing',
                  label: 'Suggested Pricing',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Alert
                        showIcon
                        type={canPostSuggestedPrice ? 'info' : 'warning'}
                        message="Suggested prices must be approved before posting to Products/Pricing"
                        description={
                          canPostSuggestedPrice
                            ? 'Posting marks the pricing handoff complete for the mapped app SKU. It does not update product prices directly in this v1 screen.'
                            : `Posting requires ${PRODUCTS_WRITE_PERMISSION}. Buyers can still approve or reject suggested prices.`
                        }
                      />
                      <Table
                        rowKey="id"
                        size="small"
                        dataSource={selectedShipment.suggestedPrices}
                        pagination={{ pageSize: 8 }}
                        columns={suggestedPriceColumns}
                      />
                    </Space>
                  ),
                },
                {
                  key: 'reports',
                  label: 'Reports',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Alert
                        showIcon
                        type="info"
                        message="Exports use the shipment records shown in these tabs"
                      />
                      <Table
                        rowKey="key"
                        size="small"
                        pagination={false}
                        dataSource={IMPORT_REPORT_EXPORTS}
                        columns={[
                          { title: 'Report', dataIndex: 'label', key: 'label' },
                          {
                            title: 'Export',
                            key: 'export',
                            align: 'right',
                            render: (_: unknown, row: (typeof IMPORT_REPORT_EXPORTS)[number]) => (
                              <Space.Compact>
                                <Button
                                  size="small"
                                  icon={<DownloadOutlined />}
                                  href={reportExportUrl(row.key, 'csv')}
                                  target="_blank"
                                  disabled={!selectedShipmentId}
                                >
                                  CSV
                                </Button>
                                <Button
                                  size="small"
                                  icon={<DownloadOutlined />}
                                  href={reportExportUrl(row.key, 'xlsx')}
                                  target="_blank"
                                  disabled={!selectedShipmentId}
                                >
                                  XLSX
                                </Button>
                              </Space.Compact>
                            ),
                          },
                        ]}
                      />
                    </Space>
                  ),
                },
                {
                  key: 'audit',
                  label: 'Audit',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Alert
                          showIcon
                          type="info"
                          message={`${auditEvents.data?.length ?? 0} recent import audit events`}
                        />
                        <Button
                          icon={<ReloadOutlined />}
                          onClick={() => void auditEvents.refetch()}
                          loading={auditEvents.isFetching}
                        >
                          Refresh
                        </Button>
                      </Space>
                      <Table
                        rowKey="id"
                        size="small"
                        loading={auditEvents.isLoading || auditEvents.isFetching}
                        dataSource={auditEvents.data ?? []}
                        columns={auditColumns}
                        pagination={{ pageSize: 10 }}
                        expandable={{
                          expandedRowRender: (row) => (
                            <Space direction="vertical" size="small" style={{ width: '100%' }}>
                              {row.reason && <Text>{row.reason}</Text>}
                              <Text strong>Before</Text>
                              {renderAuditJson(row.beforeJson)}
                              <Text strong>After</Text>
                              {renderAuditJson(row.afterJson)}
                              <Text strong>Metadata</Text>
                              {renderAuditJson(row.metadataJson)}
                            </Space>
                          ),
                        }}
                      />
                    </Space>
                  ),
                },
              ].map(addImportTabHelp)}
            />
          </Space>
          )}
        </Space>
      )}

      <SkuLookup
        open={!!skuLookupLine}
        onClose={() => setSkuLookupLine(null)}
        onSelect={(picked) => { void mapLineSku(picked) }}
        initialQuery={skuLookupInitialQuery(skuLookupLine)}
        allowCreate
        helperTextOverride="Select the app SKU that represents this import invoice line. This unlocks draft PO creation, receiving readiness, OTB category mapping, and suggested pricing review."
        placeholderOverride="Search by SKU, description, vendor, or style"
      />

      <Modal
        title={payableAction?.action === 'PAID' ? 'Mark payable paid' : 'Void payable handoff'}
        open={payableAction != null}
        onCancel={closePayableAction}
        onOk={submitPayableAction}
        confirmLoading={markPayablePaid.isPending || voidPayable.isPending}
        okText={payableAction?.action === 'PAID' ? 'Mark Paid' : 'Void'}
        okButtonProps={{ danger: payableAction?.action === 'VOID' }}
        destroyOnHidden
        forceRender
      >
        <Form form={payableActionForm} layout="vertical">
          {payableAction && (
            <Alert
              showIcon
              type={payableAction.action === 'VOID' ? 'warning' : 'info'}
              message={`${payableAction.payable.counterparty} - ${payableAction.payable.documentNumber || payableAction.payable.payableKind}`}
              description={`${money(payableAction.payable.hnlAmount)} HNL`}
              style={{ marginBottom: 12 }}
            />
          )}
          {payableAction?.action === 'PAID' ? (
            <>
              <Form.Item name="paymentReference" label="Payment reference">
                <Input placeholder="Bank transfer, check, or AP payment id" />
              </Form.Item>
              <Form.Item name="paidAt" label="Paid date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              name="reason"
              label="Void reason"
              rules={[{ required: true, message: 'Void reason is required.' }]}
            >
              <Input.TextArea rows={3} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={receivingAction === 'FINAL' ? 'Record final import receipt' : 'Record estimated import receipt'}
        open={receivingAction != null}
        onCancel={closeReceivingAction}
        onOk={submitReceivingAction}
        confirmLoading={receiveEstimated.isPending || receiveFinal.isPending}
        okText={receivingAction === 'FINAL' ? 'Record Final' : 'Record Estimated'}
        okButtonProps={{
          disabled:
            (receivingAction === 'FINAL' && !canFinalizeImport) ||
            (receivingAction === 'ESTIMATED' && !canReceiveEstimatedImport),
        }}
        destroyOnHidden
        forceRender
      >
        <Form form={receivingForm} layout="vertical" initialValues={{ locationId: '1' }}>
          {selectedReceivingRecordIds.length > 0 && (
            <Alert
              showIcon
              type="info"
              message={`${selectedReceivingRecordIds.length} selected receiving lines will be posted`}
              style={{ marginBottom: 12 }}
            />
          )}
          <Form.Item name="locationId" label="Receiving location">
            <Input placeholder="1" />
          </Form.Item>
          <Form.Item name="containerId" label="Limit to container">
            <Select allowClear options={containerOptions} />
          </Form.Item>
          <Form.Item name="shipmentLineIds" label="Limit to expected PO lines">
            <Select allowClear mode="multiple" options={shipmentLineOptions} />
          </Form.Item>
          <Form.Item name="receivedAt" label="Received date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="auditReason"
            label={receivingAction === 'FINAL' ? 'Note' : 'Audit reason'}
            rules={receivingAction === 'ESTIMATED' ? [{ required: true, message: 'Audit reason is required.' }] : undefined}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Create draft purchase order"
        open={poDraftOpen}
        onCancel={closePoDraftForm}
        onOk={submitPoDraft}
        confirmLoading={createDraftPo.isPending}
        okText="Create Draft PO"
        destroyOnHidden
        forceRender
      >
        <Form form={poDraftForm} layout="vertical" initialValues={{ unitCostSource: 'BASE' }}>
          <Form.Item
            name="vendorCode"
            label="Vendor code"
            rules={[{ required: true, message: 'Vendor code is required.' }, { max: 4 }]}
          >
            <Input maxLength={4} />
          </Form.Item>
          <Form.Item name="supplierInvoiceId" label="Supplier invoice">
            <Select
              allowClear
              options={supplierInvoiceOptions}
              onChange={(invoiceId) => {
                const option = supplierInvoiceOptions.find((item) => item.value === invoiceId)
                if (option?.supplierCode) poDraftForm.setFieldsValue({ vendorCode: option.supplierCode })
              }}
            />
          </Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="poNumber" label="PO number" style={{ width: '50%' }}>
              <Input maxLength={32} placeholder="Auto" />
            </Form.Item>
            <Form.Item name="unitCostSource" label="Unit cost" style={{ width: '50%' }}>
              <Select
                options={[
                  { value: 'BASE', label: 'Base merchandise HNL' },
                  { value: 'LANDED', label: 'Landed HNL' },
                ]}
              />
            </Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="billToStoreId" label="Bill to store" style={{ width: '50%' }}>
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="shipToStoreId" label="Ship to store" style={{ width: '50%' }}>
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="buyer" label="Buyer">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Select buyer"
              loading={buyerOptionsQuery.isFetching}
              options={buyerSelectOptions}
            />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Link purchase-order line"
        open={linkingInvoiceLineId != null}
        onCancel={closePoLineLinkForm}
        onOk={submitPoLineLink}
        confirmLoading={linkPoLine.isPending}
        okText="Link"
        destroyOnHidden
        forceRender
      >
        <Form form={poLineLinkForm} layout="vertical">
          <Form.Item
            name="purchaseOrderLineId"
            label="Purchase-order line ID"
            rules={[{ required: true, message: 'Purchase-order line ID is required.' }]}
          >
            <Input placeholder="UUID from native purchase-order line" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Import workbook"
        open={workbookOpen}
        onCancel={resetWorkbookImport}
        onOk={submitWorkbookImport}
        okText="Import"
        confirmLoading={importWorkbookMutation.isPending}
        width={920}
        destroyOnHidden
        forceRender
        okButtonProps={{ disabled: !workbookFile || !canOverrideImportCost, title: costOverridePermissionTitle }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {!canOverrideImportCost && (
            <Alert
              showIcon
              type="warning"
              message={`Importing workbook cost documents requires ${IMPORT_MANAGEMENT_COST_OVERRIDE_PERMISSION}.`}
            />
          )}
          <Form form={workbookForm} layout="vertical" initialValues={{ markupFactor: 2.5 }}>
            <Upload.Dragger
              accept=".xlsx"
              maxCount={1}
              fileList={workbookUploadList}
              beforeUpload={(file) => {
                const selected = file as File
                setWorkbookFile(selected)
                previewWorkbook.reset()
                importWorkbookMutation.reset()
                void previewSelectedWorkbook(selected)
                return false
              }}
              onRemove={() => {
                setWorkbookFile(null)
                previewWorkbook.reset()
                importWorkbookMutation.reset()
                return true
              }}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Drop an import workbook here</p>
            </Upload.Dragger>

            <Divider style={{ marginBlock: 16 }} />

            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="defaultFxRate" label="FX rate" style={{ width: '34%' }}>
                <InputNumber min={0} step={0.0001} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="defaultFxDate" label="FX date" style={{ width: '33%' }}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="sourceCurrency" label="Currency override" style={{ width: '33%' }}>
                <Select allowClear options={SOURCE_CURRENCY_OPTIONS.map((value) => ({ value, label: value }))} />
              </Form.Item>
            </Space.Compact>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="shipmentNumber" label="Shipment number override" style={{ width: '50%' }}>
                <Input placeholder="Use when the workbook shipment already exists" />
              </Form.Item>
              <Form.Item name="displayName" label="Name override" style={{ width: '50%' }}>
                <Input />
              </Form.Item>
            </Space.Compact>
            <Form.Item name="markupFactor" label="Markup factor">
              <InputNumber min={0.01} step={0.1} style={{ width: '100%' }} />
            </Form.Item>
          </Form>

          <Space>
            <Button onClick={() => void previewSelectedWorkbook()} loading={previewWorkbook.isPending} disabled={!workbookFile}>
              Preview
            </Button>
          </Space>

          {previewWorkbook.isError && (
            <Alert type="error" showIcon message={(previewWorkbook.error as Error).message} />
          )}

          {importWorkbookMutation.isError && (
            <Alert type="error" showIcon message={(importWorkbookMutation.error as Error).message} />
          )}

          {workbookPreview && (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Alert
                type={workbookPreview.warnings.length > 0 ? 'warning' : 'success'}
                showIcon
                message={`${workbookPreview.kind.replace(/_/g, ' ')}: ${workbookPreview.totals.invoiceCount} invoices, ${workbookPreview.totals.lineCount} lines, ${workbookPreview.totals.chargeCount} charges`}
                description={workbookPreview.warnings.length > 0 ? workbookPreview.warnings.join(' ') : undefined}
              />
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="Shipment">{workbookPreview.shipment.shipmentNumber}</Descriptions.Item>
                <Descriptions.Item label="Name">{workbookPreview.shipment.displayName}</Descriptions.Item>
                <Descriptions.Item label="Invoice HNL">{workbookPreview.totals.invoiceHnlTotal == null ? '-' : money(workbookPreview.totals.invoiceHnlTotal)}</Descriptions.Item>
                <Descriptions.Item label="Charge HNL">{workbookPreview.totals.chargeHnlTotal == null ? '-' : money(workbookPreview.totals.chargeHnlTotal)}</Descriptions.Item>
              </Descriptions>
              <Table
                rowKey="invoiceNumber"
                size="small"
                columns={previewInvoiceColumns}
                dataSource={workbookPreview.supplierInvoices}
                pagination={{ pageSize: 5 }}
              />
              {workbookPreview.charges.length > 0 && (
                <Table
                  rowKey={(row, index) => `${row.chargeType}-${index}`}
                  size="small"
                  columns={previewChargeColumns}
                  dataSource={workbookPreview.charges}
                  pagination={false}
                />
              )}
            </Space>
          )}
        </Space>
      </Modal>

      <Modal
        title="New import shipment"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={submitCreateShipment}
        confirmLoading={createShipment.isPending}
        destroyOnHidden
        forceRender
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="shipmentNumber" label="Shipment number" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="displayName" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="buyer" label="Buyer">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Select buyer"
              loading={buyerOptionsQuery.isFetching}
              options={buyerSelectOptions}
            />
          </Form.Item>
          <Form.Item name="sourceWorkbookName" label="Workbook"><Input /></Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="originPort" label="Origin" style={{ width: '50%' }}><Input /></Form.Item>
            <Form.Item name="destinationPort" label="Destination" style={{ width: '50%' }}><Input /></Form.Item>
          </Space.Compact>
          <Form.Item name="expectedArrivalAt" label="ETA"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingInvoiceId ? 'Edit supplier invoice' : 'Supplier invoice'}
        open={invoiceOpen}
        onCancel={closeInvoiceForm}
        onOk={submitInvoice}
        confirmLoading={addInvoice.isPending || updateInvoice.isPending}
        okButtonProps={{ disabled: !canOverrideImportCost }}
        destroyOnHidden
        forceRender
      >
        <MoneyAwareInvoiceForm form={invoiceForm} vendorOptions={vendorOptions} vendorsLoading={vendorsQuery.isFetching} />
      </Modal>

      <Modal
        title={editingLineId ? 'Edit invoice line' : lineEntryMode === 'MANUAL' ? 'Manual invoice line' : 'Add expected PO lines'}
        open={!!lineInvoiceId}
        onCancel={closeLineForm}
        onOk={editingLineId || lineEntryMode === 'MANUAL' ? submitLine : submitSelectedExpectedInvoiceLines}
        okText={editingLineId || lineEntryMode === 'MANUAL' ? 'Save line' : `Add selected (${selectedExpectedLineIds.length})`}
        cancelText="Close"
        width={editingLineId || lineEntryMode === 'MANUAL' ? 560 : 1440}
        confirmLoading={addLine.isPending || updateLine.isPending || updateShipmentLine.isPending || matchShipmentLineInvoice.isPending}
        okButtonProps={{
          disabled: !canOverrideImportCost || (!editingLineId && lineEntryMode === 'PO_LINES' && selectedExpectedLineIds.length === 0),
        }}
        destroyOnHidden
        forceRender
      >
        {editingLineId || lineEntryMode === 'MANUAL' ? (
          <>
            <Space direction="vertical" size="small" style={{ width: '100%', marginBottom: 12 }}>
              <Text type="secondary">{selectedInvoice?.invoiceNumber}</Text>
              {!editingLineId && (
                <Button size="small" onClick={() => setLineEntryMode('PO_LINES')}>
                  Expected PO lines
                </Button>
              )}
            </Space>
            <Form form={lineForm} layout="vertical" initialValues={{ quantity: 1, unitOfMeasure: 'UNIT', taxable: true }}>
              <Form.Item name="skuId" hidden><Input /></Form.Item>
              <Form.Item name="purchaseOrderLineId" hidden><Input /></Form.Item>
              <Form.Item name="lineNumber" label="Line #">
                <InputNumber min={1} step={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="itemCode" label="Item code"><Input /></Form.Item>
              <Form.Item name="styleCode" label="Style"><Input /></Form.Item>
              <Form.Item name="description" label="Description"><Input /></Form.Item>
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="quantity" label="Qty" rules={[{ required: true }]} style={{ width: '50%' }}>
                  <InputNumber min={0.001} step={1} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="unitOfMeasure" label="UOM" style={{ width: '50%' }}>
                  <Input />
                </Form.Item>
              </Space.Compact>
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="sourceUnitCost" label="Unit source cost" style={{ width: '50%' }}>
                  <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="sourceAmount" label="Source amount" style={{ width: '50%' }}>
                  <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                </Form.Item>
              </Space.Compact>
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="sourceCurrency" label="Currency" style={{ width: '33%' }}>
                  <Select allowClear options={SOURCE_CURRENCY_OPTIONS.map((value) => ({ value, label: value }))} />
                </Form.Item>
                <Form.Item name="fxRate" label="FX rate" style={{ width: '33%' }}>
                  <InputNumber min={0} step={0.0001} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="fxDate" label="FX date" style={{ width: '34%' }}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Space.Compact>
              <Form.Item name="materialMeters" label="Material meters">
                <InputNumber min={0} step={0.001} style={{ width: '100%' }} />
              </Form.Item>
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="costRole" label="Cost role" style={{ width: '50%' }}>
                  <Select
                    allowClear
                    options={INVOICE_LINE_COST_ROLE_OPTIONS.map((value) => ({ value, label: value }))}
                  />
                </Form.Item>
                <Form.Item name="receiptPolicy" label="Receipt policy" style={{ width: '50%' }}>
                  <Select
                    allowClear
                    options={INVOICE_LINE_RECEIPT_POLICY_OPTIONS.map((value) => ({ value, label: value }))}
                  />
                </Form.Item>
              </Space.Compact>
              <Form.Item name="allocationGroupKey" label="Allocation group">
                <Input />
              </Form.Item>
              <Form.Item name="taxable" label="Taxable" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Form>
          </>
        ) : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Alert
              showIcon
              type="info"
              message={`${pickerExpectedInvoiceLines.length} unmatched expected PO lines for ${selectedInvoice?.invoiceNumber ?? 'this invoice'}`}
              description="Adjust Invoice qty for partial shipments, then add selected rows. Lines are created from those quantities and prices, then matched back to the expected PO rows."
            />
            <Space wrap>
              <Button
                onClick={() => setSelectedExpectedLineIds(pickerExpectedInvoiceLines.map((line) => line.id))}
                disabled={pickerExpectedInvoiceLines.length === 0}
              >
                Select all
              </Button>
              <Button onClick={() => setSelectedExpectedLineIds([])} disabled={selectedExpectedLineIds.length === 0}>
                Clear selection
              </Button>
              <Button onClick={openManualLineEntry}>
                Manual line
              </Button>
              <Text type="secondary">
                {selectedExpectedLineIds.length} selected
              </Text>
            </Space>
            <Table
              rowKey="id"
              size="small"
              columns={invoiceLinePickerColumns}
              dataSource={pickerExpectedInvoiceLines}
              loading={expectedSkuLookup.isFetching}
              pagination={false}
              scroll={{ x: 1480, y: 520 }}
              rowSelection={{
                selectedRowKeys: selectedExpectedLineIds,
                onChange: (keys) => setSelectedExpectedLineIds(keys.map(String)),
                getCheckboxProps: (row) => ({
                  disabled: addingExpectedLineIds.includes(row.id),
                }),
              }}
            />
          </Space>
        )}
      </Modal>

      <Modal
        title="Expected PO line"
        open={expectedLineOpen}
        onCancel={closeExpectedLineForm}
        onOk={submitExpectedLine}
        confirmLoading={updateShipmentLine.isPending || matchShipmentLineInvoice.isPending}
        okButtonProps={{ disabled: !canOverrideImportCost }}
        destroyOnHidden
        forceRender
      >
        {editingExpectedLine && (
          <Space direction="vertical" size="small" style={{ width: '100%', marginBottom: 16 }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="PO">{editingExpectedLine.purchaseOrderNumber}</Descriptions.Item>
              <Descriptions.Item label="SKU">{editingExpectedLine.skuCode || editingExpectedLine.description || '-'}</Descriptions.Item>
              <Descriptions.Item label="Vendor">{editingExpectedLine.vendorCode}</Descriptions.Item>
            </Descriptions>
            {editingExpectedLine.invoiceMatchWarnings.length > 0 && (
              <Alert
                showIcon
                type="warning"
                message="Invoice match needs review"
                description={editingExpectedLine.invoiceMatchWarnings.join(' ')}
              />
            )}
          </Space>
        )}
        <Form form={expectedLineForm} layout="vertical">
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="expectedQuantity" label="Expected qty" rules={[{ required: true }]} style={{ width: '50%' }}>
              <InputNumber min={0.001} step={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="estimatedLandedUnitCostHnl" label="Est landed unit HNL" rules={[{ required: true }]} style={{ width: '50%' }}>
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="containerId" label="Container">
            <Select allowClear options={containerOptions} />
          </Form.Item>
          <Form.Item name="invoiceLineId" label="Matched supplier invoice line">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={invoiceLineMatchOptions}
            />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Approve invoice match mismatch"
        open={!!approvalShipmentLineId}
        onCancel={closeMatchApprovalForm}
        onOk={submitApproveMatch}
        confirmLoading={approveInvoiceMatch.isPending}
        okButtonProps={{ disabled: !canApproveImportMismatch }}
        destroyOnHidden
        forceRender
      >
        {approvalShipmentLine && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="PO">{approvalShipmentLine.purchaseOrderNumber}</Descriptions.Item>
              <Descriptions.Item label="Invoice">{approvalShipmentLine.invoiceNumber || '-'}</Descriptions.Item>
            </Descriptions>
            {approvalShipmentLine.invoiceMatchWarnings.length > 0 && (
              <Alert
                showIcon
                type="warning"
                message="Mismatch warnings"
                description={approvalShipmentLine.invoiceMatchWarnings.join(' ')}
              />
            )}
          </Space>
        )}
        <Form form={matchApprovalForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="reason"
            label="Approval reason"
            rules={[{ required: true, message: 'Enter why this mismatch is acceptable.' }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingChargeId ? 'Edit import charge' : 'Import charge'}
        open={chargeOpen}
        onCancel={closeChargeForm}
        onOk={submitCharge}
        confirmLoading={addCharge.isPending || updateCharge.isPending}
        okButtonProps={{ disabled: !canOverrideImportCost }}
        destroyOnHidden
        forceRender
      >
        <Form form={chargeForm} layout="vertical" initialValues={{ sourceCurrency: 'HNL', fxRate: 1, chargeType: 'FREIGHT', costTreatment: 'ALLOCATE_TO_LANDED', estimated: true }}>
          <Form.Item name="chargeType" label="Type" rules={[{ required: true }]}>
            <Select
              options={CHARGE_TYPE_OPTIONS.map((value) => ({ value, label: value.replace(/_/g, ' ') }))}
              onChange={(value) => {
                if (!editingChargeId) chargeForm.setFieldValue('costTreatment', defaultCostTreatmentForChargeType(value))
              }}
            />
          </Form.Item>
          <Form.Item name="costTreatment" label="Cost treatment" rules={[{ required: true }]}>
            <Select options={CHARGE_COST_TREATMENT_OPTIONS.map((value) => ({ value, label: value.replace(/_/g, ' ') }))} />
          </Form.Item>
          <Form.Item name="counterparty" label="Counterparty"><Input /></Form.Item>
          <Form.Item name="documentNumber" label="Document"><Input /></Form.Item>
          <MoneyFields />
          <Space>
            <Form.Item name="taxable" label="Taxable" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="estimated" label="Estimated" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="final" label="Final" valuePropName="checked"><Switch /></Form.Item>
          </Space>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingContainerId ? 'Edit container' : 'Import container'}
        open={containerOpen}
        onCancel={closeContainerForm}
        onOk={submitContainer}
        confirmLoading={addContainer.isPending || updateContainer.isPending}
        destroyOnHidden
        forceRender
      >
        <Form form={containerForm} layout="vertical" initialValues={{ containerType: 'LOOSE_CARGO', status: 'PLANNED' }}>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="containerType" label="Type" rules={[{ required: true }]} style={{ width: '50%' }}>
              <Select options={CONTAINER_TYPE_OPTIONS.map((value) => ({ value, label: statusText(value) }))} />
            </Form.Item>
            <Form.Item name="status" label="Status" rules={[{ required: true }]} style={{ width: '50%' }}>
              <Select options={CONTAINER_STATUS_OPTIONS.map((value) => ({ value, label: statusText(value) }))} />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="containerNumber" label="Container number"><Input /></Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="cargoGroup" label="Cargo group" style={{ width: '50%' }}><Input /></Form.Item>
            <Form.Item name="sealNumber" label="Seal" style={{ width: '50%' }}><Input /></Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="expectedArrivalAt" label="ETA" style={{ width: '50%' }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="actualArrivalAt" label="Arrived" style={{ width: '50%' }}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </Space.Compact>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingGoodsRecordId ? 'Edit transit record' : 'Goods in transit'}
        open={goodsOpen}
        onCancel={closeGoodsForm}
        onOk={submitGoodsRecord}
        confirmLoading={addGoodsRecord.isPending || updateGoodsRecord.isPending}
        destroyOnHidden
        forceRender
      >
        <Form form={goodsForm} layout="vertical" initialValues={{ status: 'IN_TRANSIT' }}>
          <Form.Item name="invoiceLineId" label="Invoice line">
            <Select
              allowClear
              showSearch
              disabled={!!editingGoodsRecordId}
              optionFilterProp="label"
              options={lineOptions}
              onChange={(value) => {
                if (value) goodsForm.setFieldValue('shipmentLineId', null)
              }}
            />
          </Form.Item>
          <Form.Item name="shipmentLineId" label="Expected PO line">
            <Select
              allowClear
              showSearch
              disabled={!!editingGoodsRecordId}
              optionFilterProp="label"
              options={shipmentLineOptions}
              onChange={(value) => {
                if (value) goodsForm.setFieldValue('invoiceLineId', null)
              }}
            />
          </Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="containerId" label="Container" style={{ width: '50%' }}>
              <Select allowClear options={containerOptions} />
            </Form.Item>
            <Form.Item name="status" label="Status" rules={[{ required: true }]} style={{ width: '50%' }}>
              <Select options={GOODS_IN_TRANSIT_STATUS_OPTIONS.map((value) => ({ value, label: statusText(value) }))} />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="quantityInTransit" label="Qty">
            <InputNumber min={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="ownershipTransferAt" label="Owned" style={{ width: '33%' }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="expectedReceiptAt" label="Expected" style={{ width: '34%' }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="receivedAt" label="Received" style={{ width: '33%' }}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </Space.Compact>
          <Form.Item name="auditReason" label="Audit reason">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Build goods in transit"
        open={bulkGoodsOpen}
        onCancel={() => { setBulkGoodsOpen(false); bulkGoodsForm.resetFields() }}
        onOk={submitBulkGoodsRecords}
        confirmLoading={createGoodsForShipment.isPending}
        destroyOnHidden
        forceRender
      >
        <Form form={bulkGoodsForm} layout="vertical" initialValues={{ status: 'IN_TRANSIT' }}>
          <Form.Item name="containerId" label="Container">
            <Select allowClear options={containerOptions} />
          </Form.Item>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select options={GOODS_IN_TRANSIT_STATUS_OPTIONS.map((value) => ({ value, label: statusText(value) }))} />
          </Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="ownershipTransferAt" label="Owned" style={{ width: '50%' }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="expectedReceiptAt" label="Expected" style={{ width: '50%' }}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </Space.Compact>
          <Form.Item name="auditReason" label="Audit reason">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingVerificationCode ? 'Edit verification check' : 'Verification check'}
        open={verificationOpen}
        onCancel={closeVerificationForm}
        onOk={submitVerificationCheck}
        confirmLoading={recordVerificationCheck.isPending}
        destroyOnHidden
        forceRender
      >
        <Form form={verificationForm} layout="vertical" initialValues={{ status: 'PENDING' }}>
          <Form.Item name="checkCode" label="Check code" rules={[{ required: true }]}>
            <Input disabled={!!editingVerificationCode} />
          </Form.Item>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select options={VERIFICATION_CHECK_STATUS_OPTIONS.map((value) => ({ value, label: statusText(value) }))} />
          </Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="expectedHnlAmount" label="Expected HNL" style={{ width: '33%' }}>
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="actualHnlAmount" label="Actual HNL" style={{ width: '34%' }}>
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="varianceHnlAmount" label="Variance HNL" style={{ width: '33%' }}>
              <InputNumber step={0.01} style={{ width: '100%' }} />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="message" label="Message">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Shipment status"
        open={statusOpen}
        onCancel={() => setStatusOpen(false)}
        onOk={submitStatus}
        confirmLoading={updateStatus.isPending}
        destroyOnHidden
        forceRender
      >
        <Form form={statusForm} layout="vertical">
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select options={STATUS_OPTIONS.map((value) => ({ value, label: value.replace(/_/g, ' ') }))} />
          </Form.Item>
          <Form.Item name="auditReason" label="Audit reason">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Allocate landed cost"
        open={allocationOpen}
        onCancel={() => setAllocationOpen(false)}
        onOk={submitAllocation}
        confirmLoading={allocateCost.isPending}
        okButtonProps={{ disabled: !canOverrideImportCost }}
        destroyOnHidden
        forceRender
      >
        <Form form={allocationForm} layout="vertical" initialValues={{ markupFactor: 2.5 }}>
          <Form.Item name="markupFactor" label="Markup factor" rules={[{ required: true }]}>
            <InputNumber min={0.01} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}

function MoneyAwareInvoiceForm({
  form,
  vendorOptions,
  vendorsLoading,
}: {
  form: ReturnType<typeof Form.useForm>[0]
  vendorOptions: VendorSelectOption[]
  vendorsLoading: boolean
}) {
  return (
    <Form form={form} layout="vertical" initialValues={{ sourceCurrency: 'HNL', fxRate: 1, invoiceGroup: 'TAXABLE', invoiceKind: 'MERCHANDISE' }}>
      <Form.Item name="invoiceNumber" label="Invoice" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="supplierCode" label="Vendor" rules={[{ required: true }]}>
        <Select
          allowClear
          showSearch
          loading={vendorsLoading}
          optionFilterProp="label"
          options={vendorOptions}
          placeholder="Select vendor"
          onChange={(value) => {
            const vendor = vendorOptions.find((option) => option.value === value)
            form.setFieldsValue({ supplierName: vendor?.vendorName })
          }}
        />
      </Form.Item>
      <Form.Item name="supplierName" label="Vendor name" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Space.Compact style={{ width: '100%' }}>
        <Form.Item name="invoiceGroup" label="Group" style={{ width: '50%' }}>
          <Select options={INVOICE_GROUP_OPTIONS.map((value) => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item name="invoiceKind" label="Kind" style={{ width: '50%' }}>
          <Select options={INVOICE_KIND_OPTIONS.map((value) => ({ value, label: value }))} />
        </Form.Item>
      </Space.Compact>
      <Form.Item name="invoiceDate" label="Invoice date">
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>
      <MoneyFields />
      <Form.Item name="notes" label="Notes"><Input.TextArea rows={3} /></Form.Item>
    </Form>
  )
}

function MoneyFields() {
  return (
    <>
      <Space.Compact style={{ width: '100%' }}>
        <Form.Item name="sourceAmount" label="Source amount" rules={[{ required: true }]} style={{ width: '50%' }}>
          <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="sourceCurrency" label="Currency" rules={[{ required: true }]} style={{ width: '50%' }}>
          <Select options={SOURCE_CURRENCY_OPTIONS.map((value) => ({ value, label: value }))} />
        </Form.Item>
      </Space.Compact>
      <Space.Compact style={{ width: '100%' }}>
        <Form.Item name="fxRate" label="FX rate" rules={[{ required: true }]} style={{ width: '50%' }}>
          <InputNumber min={0} step={0.0001} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="fxDate" label="FX date" rules={[{ required: true }]} style={{ width: '50%' }}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
      </Space.Compact>
    </>
  )
}



