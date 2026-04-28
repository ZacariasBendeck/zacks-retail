import { Prisma, PrismaClient } from '../../prismaClient';
import { computeIncremental } from '../customer-kpi/computeIncremental';

const MONEY_SCALE = 100;
const BASE_TAX_RATE = 0.15;
const SECONDARY_TAX_RATE = 0;

const DEFAULT_REGISTERS = [
  { code: 'MAIN', label: 'Main Register' },
] as const;

const DEFAULT_TENDER_TYPES = [
  { code: '1', label: 'Cash', kind: 'CASH', requiresAccount: false, openDrawer: true, sortOrder: 10 },
  { code: '2', label: 'Checks', kind: 'CHECK', requiresAccount: false, openDrawer: false, sortOrder: 20 },
  { code: '3', label: 'Credomatic', kind: 'CARD', requiresAccount: false, openDrawer: false, sortOrder: 30 },
  { code: '4', label: 'Card 2', kind: 'CARD', requiresAccount: false, openDrawer: false, sortOrder: 40 },
  { code: '7', label: 'Credit Slip', kind: 'CREDIT_SLIP', requiresAccount: false, openDrawer: false, sortOrder: 50 },
  { code: '9', label: 'House Charge', kind: 'HOUSE_CHARGE', requiresAccount: true, openDrawer: false, sortOrder: 60 },
  { code: '10', label: 'Gift Card', kind: 'GIFT_CARD', requiresAccount: false, openDrawer: false, sortOrder: 70 },
  { code: '11', label: 'Store Credit', kind: 'STORE_CREDIT', requiresAccount: true, openDrawer: false, sortOrder: 80 },
  { code: '99', label: 'Continued', kind: 'CONTINUATION', requiresAccount: false, openDrawer: false, sortOrder: 90 },
] as const;

const DEFAULT_PAYOUT_CATEGORIES = [
  { code: 'PETTY', label: 'Petty Cash', sortOrder: 10 },
  { code: 'POSTAGE', label: 'Postage', sortOrder: 20 },
  { code: 'BANK', label: 'Bank Deposit', sortOrder: 30 },
] as const;

const TRANSACTION_TYPE_NUMBER: Record<string, number> = {
  REGULAR: 1,
  USER_DEFINED: 2,
  SPECIAL_ORDER_PICKUP: 3,
  LAYAWAY_SALE: 4,
  GIFT_CARD_SALE: 5,
  HOUSE_CHARGE_PAYMENT: 6,
  SPECIAL_ORDER_DEPOSIT: 7,
  LAYAWAY_PAYMENT: 8,
};

const TRANSACTION_TYPE_OPTIONS = Object.keys(TRANSACTION_TYPE_NUMBER);
const PROTECTED_ACTION_FALLBACK_PERMISSION = 'sales_pos.refund';

export class PosServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type PosTx = Prisma.TransactionClient;

type StoreSummary = {
  id: number;
  code: string;
  name: string;
  active: boolean;
  otherChargeLabel: string;
  lastTicketNumber: number;
};

type PosTicketGraph = Prisma.PosTicketGetPayload<{
  include: {
    lines: true;
    tenders: {
      include: {
        tenderType: true;
      };
    };
  };
}>;

type PriceSlotCode = 'RETAIL' | 'MARKDOWN1' | 'MARKDOWN2' | 'LIST';

export interface PosUserSummary {
  id: string;
  displayName: string;
  salespersonCode: string | null;
  permissions: string[];
}

export interface PosBootstrapResult {
  currentUser: PosUserSummary;
  selectedStoreId: number;
  selectedRegisterCode: string;
  otherChargeLabel: string;
  stores: Array<{ id: number; code: string; name: string; active: boolean }>;
  registers: Array<{ id: string; code: string; label: string; active: boolean }>;
  employees: Array<{ id: string; displayName: string; salespersonCode: string | null }>;
  tenderTypes: Array<{
    id: string;
    code: string;
    label: string;
    kind: string;
    requiresAccount: boolean;
    openDrawer: boolean;
  }>;
  payoutCategories: Array<{ id: string; code: string; label: string }>;
  promotions: Array<{ code: string; description: string }>;
  returnCodes: Array<{ code: number; description: string; trackable: boolean }>;
  shift: PosShiftDto | null;
  activeTicket: PosTicketDto | null;
}

export interface PosShiftDto {
  id: string;
  storeId: number;
  registerId: string;
  registerCode: string;
  businessDate: string;
  status: string;
  openedByUserId: string;
  openedByName: string;
  openingCashFloat: number;
  expectedCashTotal: number | null;
  actualCashTotal: number | null;
  overShortAmount: number | null;
  openedAt: string;
  closedAt: string | null;
  lastTicketNumber: number;
}

export interface PosTicketDto {
  id: string;
  shiftId: string;
  storeId: number;
  registerId: string;
  ticketNumber: number;
  status: string;
  transactionType: string;
  cashierUserId: string;
  cashierName: string;
  customerId: string | null;
  customerAccountNumber: string | null;
  customerName: string | null;
  headerDiscountPct: number | null;
  promotionCode: string | null;
  shipToState: string | null;
  subtotal: number;
  taxTotal: number;
  secondaryTaxTotal: number;
  otherCharges: number;
  grandTotal: number;
  totalTendered: number;
  changeGiven: number;
  comment: string | null;
  completedAt: string | null;
  voidedAt: string | null;
  receiptPrintCount: number;
  lines: PosTicketLineDto[];
  tenders: PosTicketTenderDto[];
}

export interface PosTicketLineDto {
  id: string;
  lineNumber: number;
  skuId: string | null;
  skuCode: string | null;
  description: string;
  upc: string | null;
  sizeTypeCode: number | null;
  columnLabel: string;
  rowLabel: string;
  quantity: number;
  unitPrice: number;
  priceMode: string;
  discountPct: number | null;
  discountAmount: number;
  taxable: boolean;
  taxRate: number;
  secondaryTaxRate: number;
  salespersonUserId: string | null;
  salespersonCode: string | null;
  salespersonName: string | null;
  familyMemberId: string | null;
  returnCode: number | null;
  comment: string | null;
  lineSubtotal: number;
  lineTax: number;
  lineSecondaryTax: number;
  lineTotal: number;
}

export interface PosTicketTenderDto {
  id: string;
  sequence: number;
  tenderTypeId: string;
  tenderCode: string;
  tenderLabel: string;
  tenderKind: string;
  amount: number;
  accountNumber: string | null;
  reference: string | null;
}

export interface PosProductLookup {
  code: string;
  skuId: string | null;
  description: string;
  upc: string | null;
  sizeTypeCode: number | null;
  sizeTypeDescription: string | null;
  columns: string[];
  rows: string[];
  defaultColumnLabel: string;
  defaultRowLabel: string;
  coupon: boolean;
  defaultQuantity: number;
  priceSlots: Array<{ code: PriceSlotCode; label: string; amount: number }>;
  defaultPriceMode: PriceSlotCode;
  defaultUnitPrice: number;
  taxable: boolean;
  perks: number;
}

export interface PosTicketListItem {
  id: string;
  ticketNumber: number;
  status: string;
  cashierName: string;
  customerName: string | null;
  grandTotal: number;
  completedAt: string | null;
  voidedAt: string | null;
}

export interface PosReceiptDto {
  title: string;
  storeName: string;
  storeId: number;
  registerCode: string;
  ticketNumber: number;
  businessDate: string;
  cashierName: string;
  customerName: string | null;
  customerAccountNumber: string | null;
  transactionType: string;
  promotionCode: string | null;
  comment: string | null;
  lines: Array<{
    description: string;
    skuCode: string | null;
    size: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  tenders: Array<{ label: string; amount: number }>;
  totals: {
    subtotal: number;
    tax: number;
    secondaryTax: number;
    otherCharges: number;
    grandTotal: number;
    totalTendered: number;
    change: number;
  };
}

export interface PosClosePreview {
  shift: PosShiftDto;
  expectedCashTotal: number;
  openingCashFloat: number;
  payoutsTotal: number;
  tenderTotals: Array<{ tenderTypeId: string; code: string; label: string; kind: string; amount: number }>;
}

export interface PosCloseInput {
  actualCashTotal: number;
  notes?: string | null;
  countedTenders?: Array<{ tenderTypeId: string; amount: number }>;
}

export interface PosAddLineInput {
  code: string;
  quantity?: number;
  columnLabel?: string;
  rowLabel?: string;
  unitPrice?: number;
  priceMode?: PriceSlotCode | 'MANUAL';
  discountPct?: number | null;
  discountAmount?: number | null;
  taxable?: boolean;
  secondaryTaxRate?: number;
  salespersonUserId?: string | null;
  salespersonCode?: string | null;
  salespersonName?: string | null;
  familyMemberId?: string | null;
  returnCode?: number | null;
  comment?: string | null;
}

export interface PosUpdateLineInput {
  quantity?: number;
  columnLabel?: string;
  rowLabel?: string;
  unitPrice?: number;
  priceMode?: PriceSlotCode | 'MANUAL';
  discountPct?: number | null;
  discountAmount?: number | null;
  taxable?: boolean;
  secondaryTaxRate?: number;
  salespersonUserId?: string | null;
  salespersonCode?: string | null;
  salespersonName?: string | null;
  familyMemberId?: string | null;
  returnCode?: number | null;
  comment?: string | null;
}

export interface PosHeaderPatch {
  cashierUserId?: string;
  cashierName?: string;
  customerId?: string | null;
  customerAccountNumber?: string | null;
  customerName?: string | null;
  headerDiscountPct?: number | null;
  promotionCode?: string | null;
  shipToState?: string | null;
  transactionType?: string;
  comment?: string | null;
  otherCharges?: number;
}

export interface PosCompleteInput {
  tenders: Array<{
    tenderTypeId: string;
    amount: number;
    accountNumber?: string | null;
    reference?: string | null;
  }>;
  comment?: string | null;
  promotionCode?: string | null;
  otherCharges?: number;
}

export interface PosPayoutInput {
  shiftId: string;
  categoryId: string;
  amount: number;
  note?: string | null;
}

function roundMoney(value: number): number {
  return Math.round(value * MONEY_SCALE) / MONEY_SCALE;
}

function toMoney(value: Prisma.Decimal | number | string | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return value.toNumber();
}

function requiredMoney(value: Prisma.Decimal | number | string | null | undefined): number {
  return roundMoney(toMoney(value) ?? 0);
}

function moneyDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(roundMoney(value));
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function assertUuidish(value: string | null | undefined): string | null {
  if (!value) return null;
  return value;
}

function normalizeString(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseStoreId(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function mapShift(shift: Prisma.PosShiftGetPayload<{ include: { register: true } }>): PosShiftDto {
  return {
    id: shift.id,
    storeId: shift.storeId,
    registerId: shift.registerId,
    registerCode: shift.registerCode,
    businessDate: shift.businessDate.toISOString(),
    status: shift.status,
    openedByUserId: shift.openedByUserId,
    openedByName: shift.openedByName,
    openingCashFloat: requiredMoney(shift.openingCashFloat),
    expectedCashTotal: toMoney(shift.expectedCashTotal),
    actualCashTotal: toMoney(shift.actualCashTotal),
    overShortAmount: toMoney(shift.overShortAmount),
    openedAt: shift.openedAt.toISOString(),
    closedAt: iso(shift.closedAt),
    lastTicketNumber: shift.lastTicketNumber,
  };
}

function mapTicket(ticket: PosTicketGraph): PosTicketDto {
  return {
    id: ticket.id,
    shiftId: ticket.shiftId,
    storeId: ticket.storeId,
    registerId: ticket.registerId,
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    transactionType: ticket.transactionType,
    cashierUserId: ticket.cashierUserId,
    cashierName: ticket.cashierName,
    customerId: ticket.customerId ?? null,
    customerAccountNumber: ticket.customerAccountNumber ?? null,
    customerName: ticket.customerName ?? null,
    headerDiscountPct: toMoney(ticket.headerDiscountPct),
    promotionCode: ticket.promotionCode ?? null,
    shipToState: ticket.shipToState ?? null,
    subtotal: requiredMoney(ticket.subtotal),
    taxTotal: requiredMoney(ticket.taxTotal),
    secondaryTaxTotal: requiredMoney(ticket.secondaryTaxTotal),
    otherCharges: requiredMoney(ticket.otherCharges),
    grandTotal: requiredMoney(ticket.grandTotal),
    totalTendered: requiredMoney(ticket.totalTendered),
    changeGiven: requiredMoney(ticket.changeGiven),
    comment: ticket.comment ?? null,
    completedAt: iso(ticket.completedAt),
    voidedAt: iso(ticket.voidedAt),
    receiptPrintCount: ticket.receiptPrintCount,
    lines: ticket.lines
      .slice()
      .sort((a, b) => a.lineNumber - b.lineNumber)
      .map((line) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        skuId: line.skuId ?? null,
        skuCode: line.skuCode ?? null,
        description: line.description,
        upc: line.upc ?? null,
        sizeTypeCode: line.sizeTypeCode ?? null,
        columnLabel: line.columnLabel,
        rowLabel: line.rowLabel,
        quantity: line.quantity,
        unitPrice: requiredMoney(line.unitPrice),
        priceMode: line.priceMode,
        discountPct: toMoney(line.discountPct),
        discountAmount: requiredMoney(line.discountAmount),
        taxable: line.taxable,
        taxRate: Number(line.taxRate),
        secondaryTaxRate: Number(line.secondaryTaxRate),
        salespersonUserId: line.salespersonUserId ?? null,
        salespersonCode: line.salespersonCode ?? null,
        salespersonName: line.salespersonName ?? null,
        familyMemberId: line.familyMemberId ?? null,
        returnCode: line.returnCode ?? null,
        comment: line.comment ?? null,
        lineSubtotal: requiredMoney(line.lineSubtotal),
        lineTax: requiredMoney(line.lineTax),
        lineSecondaryTax: requiredMoney(line.lineSecondaryTax),
        lineTotal: requiredMoney(line.lineTotal),
      })),
    tenders: ticket.tenders
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((tender) => ({
        id: tender.id,
        sequence: tender.sequence,
        tenderTypeId: tender.tenderTypeId,
        tenderCode: tender.tenderCode,
        tenderLabel: tender.tenderLabel,
        tenderKind: tender.tenderKind,
        amount: requiredMoney(tender.amount),
        accountNumber: tender.accountNumber ?? null,
        reference: tender.reference ?? null,
      })),
  };
}

function toStoreSummary(row: {
  id: number;
  code: string;
  name: string | null;
  active: boolean;
  otherChargeLabel: string | null;
  lastTicketNumber: number | null;
}): StoreSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name?.trim() || `Store ${row.id}`,
    active: row.active,
    otherChargeLabel: row.otherChargeLabel?.trim() || 'Other Charges',
    lastTicketNumber: row.lastTicketNumber ?? 0,
  };
}

async function listStores(prisma: PrismaClient): Promise<StoreSummary[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: number;
    code: string;
    name: string | null;
    active: boolean;
    otherChargeLabel: string | null;
    lastTicketNumber: number | null;
  }>>(
    `SELECT number AS id,
            LPAD(number::text, 3, '0') AS code,
            "desc" AS name,
            true AS active,
            other_charge_desc AS "otherChargeLabel",
            last_ticket AS "lastTicketNumber"
       FROM app.store_master
      ORDER BY number ASC`,
  );

  return rows.map(toStoreSummary);
}

async function ensureStoreRuntime(prisma: PrismaClient, storeId: number): Promise<void> {
  const registerCount = await prisma.posRegister.count({ where: { storeId } });
  if (registerCount === 0) {
    await prisma.posRegister.createMany({
      data: DEFAULT_REGISTERS.map((register) => ({
        storeId,
        code: register.code,
        label: register.label,
      })),
      skipDuplicates: true,
    });
  }

  const tenderCount = await prisma.posTenderType.count({ where: { storeId } });
  if (tenderCount === 0) {
    await prisma.posTenderType.createMany({
      data: DEFAULT_TENDER_TYPES.map((tender) => ({
        storeId,
        code: tender.code,
        label: tender.label,
        kind: tender.kind,
        requiresAccount: tender.requiresAccount,
        openDrawer: tender.openDrawer,
        sortOrder: tender.sortOrder,
      })),
      skipDuplicates: true,
    });
  }

  const payoutCount = await prisma.posPayoutCategory.count({ where: { storeId } });
  if (payoutCount === 0) {
    await prisma.posPayoutCategory.createMany({
      data: DEFAULT_PAYOUT_CATEGORIES.map((category) => ({
        storeId,
        code: category.code,
        label: category.label,
        sortOrder: category.sortOrder,
      })),
      skipDuplicates: true,
    });
  }
}

async function selectStoreAndRegister(
  prisma: PrismaClient,
  args: {
    requestedStoreId?: number | null;
    requestedRegisterCode?: string | null;
    currentUser: { homeStoreId?: string | null };
  },
): Promise<{
    stores: StoreSummary[];
    selectedStore: StoreSummary;
    registers: Array<{ id: string; code: string; label: string; active: boolean }>;
    selectedRegister: { id: string; code: string; label: string; active: boolean };
  }> {
  const stores = await listStores(prisma);
  if (stores.length === 0) {
    throw new PosServiceError(404, 'STORE_NOT_FOUND', 'No stores are available for POS.');
  }

  const desiredStoreId =
    args.requestedStoreId ??
    parseStoreId(args.currentUser.homeStoreId) ??
    stores[0].id;

  const selectedStore = stores.find((store) => store.id === desiredStoreId) ?? stores[0];
  await ensureStoreRuntime(prisma, selectedStore.id);

  const registers = await prisma.posRegister.findMany({
    where: { storeId: selectedStore.id, active: true },
    orderBy: [{ code: 'asc' }],
    select: { id: true, code: true, label: true, active: true },
  });
  if (registers.length === 0) {
    throw new PosServiceError(500, 'POS_REGISTER_MISSING', 'No POS register exists for the selected store.');
  }

  const desiredRegisterCode = normalizeString(args.requestedRegisterCode)?.toUpperCase();
  const selectedRegister =
    registers.find((register) => register.code.toUpperCase() === desiredRegisterCode) ?? registers[0];

  return { stores, selectedStore, registers, selectedRegister };
}

async function listEmployees(prisma: PrismaClient) {
  return prisma.user.findMany({
    where: { active: true, isEmployee: true },
    orderBy: [{ displayName: 'asc' }],
    select: {
      id: true,
      displayName: true,
      salespersonCode: true,
    },
  });
}

async function listPromotions(prisma: PrismaClient) {
  const rows = await prisma.taxonomyPromotionCode.findMany({
    orderBy: [{ code: 'asc' }],
    select: {
      code: true,
      description: true,
    },
  });
  return rows.map((row) => ({ code: row.code, description: row.description }));
}

async function listReturnCodes(prisma: PrismaClient) {
  const rows = await prisma.taxonomyReturnCode.findMany({
    orderBy: [{ code: 'asc' }],
    select: {
      code: true,
      description: true,
      trackable: true,
    },
  });
  return rows.map((row) => ({
    code: row.code,
    description: row.description,
    trackable: row.trackable,
  }));
}

async function mapLookupWithSizeType(
  prisma: PrismaClient,
  row: {
    upc?: string | null;
    skuCode: string | null;
    skuId: string | null;
    descriptionRics: string | null;
    descriptionWeb: string | null;
    currentPriceSlot: string | null;
    retailPrice: Prisma.Decimal | null;
    markDownPrice1: Prisma.Decimal | null;
    markDownPrice2: Prisma.Decimal | null;
    listPrice: Prisma.Decimal | null;
    sizeType: number | null;
    coupon: boolean;
    perks: Prisma.Decimal | null;
    defaultColumnLabel?: string | null;
    defaultRowLabel?: string | null;
  },
): Promise<PosProductLookup> {
  const sizeType = row.sizeType
    ? await prisma.taxonomySizeType.findUnique({
        where: { code: row.sizeType },
        select: { code: true, description: true, columns: true, rows: true },
      })
    : null;

  const slots: Array<{ code: PriceSlotCode; label: string; amount: number }> = [];
  if (toMoney(row.retailPrice) != null) slots.push({ code: 'RETAIL', label: 'Retail', amount: requiredMoney(row.retailPrice) });
  if (toMoney(row.markDownPrice1) != null) slots.push({ code: 'MARKDOWN1', label: 'Markdown 1', amount: requiredMoney(row.markDownPrice1) });
  if (toMoney(row.markDownPrice2) != null) slots.push({ code: 'MARKDOWN2', label: 'Markdown 2', amount: requiredMoney(row.markDownPrice2) });
  if (toMoney(row.listPrice) != null) slots.push({ code: 'LIST', label: 'List', amount: requiredMoney(row.listPrice) });
  if (slots.length === 0) {
    slots.push({ code: 'RETAIL', label: 'Retail', amount: 0 });
  }

  const defaultPriceMode = (slots.find((slot) => slot.code === row.currentPriceSlot)?.code ?? slots[0].code) as PriceSlotCode;
  const defaultSlot = slots.find((slot) => slot.code === defaultPriceMode) ?? slots[0];

  return {
    code: row.skuCode ?? '',
    skuId: row.skuId,
    description: normalizeString(row.descriptionWeb) ?? normalizeString(row.descriptionRics) ?? row.skuCode ?? 'SKU',
    upc: row.upc ?? null,
    sizeTypeCode: sizeType?.code ?? row.sizeType ?? null,
    sizeTypeDescription: sizeType?.description ?? null,
    columns: sizeType?.columns ?? [],
    rows: sizeType?.rows ?? [],
    defaultColumnLabel: normalizeString(row.defaultColumnLabel) ?? sizeType?.columns[0] ?? '',
    defaultRowLabel: normalizeString(row.defaultRowLabel) ?? '',
    coupon: row.coupon,
    defaultQuantity: row.coupon ? -1 : 1,
    priceSlots: slots,
    defaultPriceMode,
    defaultUnitPrice: defaultSlot.amount,
    taxable: !row.coupon,
    perks: requiredMoney(row.perks),
  };
}

function validateTransactionType(value: string | null | undefined): string {
  const normalized = (value ?? 'REGULAR').trim().toUpperCase();
  if (!TRANSACTION_TYPE_OPTIONS.includes(normalized)) {
    throw new PosServiceError(400, 'INVALID_TRANSACTION_TYPE', 'Unknown transaction type.');
  }
  return normalized;
}

function computeLineFinancials(input: {
  quantity: number;
  unitPrice: number;
  discountPct?: number | null;
  discountAmount?: number | null;
  taxable?: boolean;
  taxRate?: number;
  secondaryTaxRate?: number;
}) {
  if (!Number.isInteger(input.quantity) || input.quantity === 0) {
    throw new PosServiceError(400, 'INVALID_QUANTITY', 'Quantity must be a non-zero integer.');
  }
  const unitPrice = roundMoney(input.unitPrice);
  const baseAmount = roundMoney(input.quantity * unitPrice);
  const pctDiscount =
    baseAmount > 0 && input.discountPct != null ? roundMoney(baseAmount * (input.discountPct / 100)) : 0;
  const flatDiscount = baseAmount > 0 ? roundMoney(input.discountAmount ?? 0) : 0;
  const lineSubtotal = roundMoney(baseAmount - pctDiscount - flatDiscount);
  const taxBase = input.taxable === false ? 0 : lineSubtotal;
  const lineTax = roundMoney(taxBase * (input.taxRate ?? BASE_TAX_RATE));
  const lineSecondaryTax = roundMoney(taxBase * (input.secondaryTaxRate ?? SECONDARY_TAX_RATE));
  const lineTotal = roundMoney(lineSubtotal + lineTax + lineSecondaryTax);

  return {
    unitPrice,
    discountPct: input.discountPct == null ? null : roundMoney(input.discountPct),
    discountAmount: roundMoney(flatDiscount + pctDiscount),
    taxable: input.taxable !== false,
    taxRate: input.taxRate ?? BASE_TAX_RATE,
    secondaryTaxRate: input.secondaryTaxRate ?? SECONDARY_TAX_RATE,
    lineSubtotal,
    lineTax,
    lineSecondaryTax,
    lineTotal,
  };
}

async function recalculateTicketTotals(tx: PosTx, ticketId: string): Promise<PosTicketGraph> {
  const ticket = await tx.posTicket.findUnique({
    where: { id: ticketId },
    include: {
      lines: true,
      tenders: { include: { tenderType: true } },
    },
  });
  if (!ticket) {
    throw new PosServiceError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
  }

  const headerDiscountPct = toMoney(ticket.headerDiscountPct) ?? 0;
  const discountFactor = 1 - headerDiscountPct / 100;
  const baseSubtotal = roundMoney(ticket.lines.reduce((sum, line) => sum + requiredMoney(line.lineSubtotal), 0));
  const subtotal = roundMoney(baseSubtotal * discountFactor);
  const taxTotal = roundMoney(ticket.lines.reduce((sum, line) => sum + requiredMoney(line.lineTax), 0) * discountFactor);
  const secondaryTaxTotal = roundMoney(
    ticket.lines.reduce((sum, line) => sum + requiredMoney(line.lineSecondaryTax), 0) * discountFactor,
  );
  const otherCharges = requiredMoney(ticket.otherCharges);
  const grandTotal = roundMoney(subtotal + taxTotal + secondaryTaxTotal + otherCharges);
  const totalTendered = roundMoney(ticket.tenders.reduce((sum, tender) => sum + requiredMoney(tender.amount), 0));
  const changeGiven = grandTotal > 0 ? Math.max(roundMoney(totalTendered - grandTotal), 0) : 0;

  await tx.posTicket.update({
    where: { id: ticketId },
    data: {
      subtotal: moneyDecimal(subtotal),
      taxTotal: moneyDecimal(taxTotal),
      secondaryTaxTotal: moneyDecimal(secondaryTaxTotal),
      grandTotal: moneyDecimal(grandTotal),
      totalTendered: moneyDecimal(totalTendered),
      changeGiven: moneyDecimal(changeGiven),
    },
  });

  const refreshed = await tx.posTicket.findUnique({
    where: { id: ticketId },
    include: {
      lines: true,
      tenders: { include: { tenderType: true } },
    },
  });
  if (!refreshed) {
    throw new PosServiceError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
  }
  return refreshed;
}

async function appendTicketEvent(
  tx: PosTx,
  args: {
    ticketId: string;
    shiftId: string;
    eventType: string;
    actorUserId: string;
    actorName?: string | null;
    payload?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.posTicketEvent.create({
    data: {
      ticketId: args.ticketId,
      shiftId: args.shiftId,
      eventType: args.eventType,
      actorUserId: args.actorUserId,
      actorName: normalizeString(args.actorName) ?? null,
      payloadJson: args.payload ?? undefined,
    },
  });
}

async function allocateTicketNumber(tx: PosTx, storeId: number): Promise<number> {
  const rows = await tx.$queryRawUnsafe<Array<{ last_ticket: number }>>(
    `UPDATE app.store_master
        SET last_ticket = COALESCE(last_ticket, 0) + 1
      WHERE number = $1
      RETURNING last_ticket`,
    storeId,
  );
  const nextTicket = rows[0]?.last_ticket;
  if (!Number.isInteger(nextTicket)) {
    throw new PosServiceError(500, 'TICKET_NUMBER_ALLOCATION_FAILED', 'Could not allocate the next ticket number.');
  }
  return nextTicket;
}

async function ensureCurrentDraftTicket(
  tx: PosTx,
  args: {
    shiftId: string;
    storeId: number;
    registerId: string;
    userId: string;
    userName: string;
  },
): Promise<PosTicketGraph> {
  const existing = await tx.posTicket.findFirst({
    where: {
      shiftId: args.shiftId,
      status: 'DRAFT',
    },
    include: {
      lines: true,
      tenders: { include: { tenderType: true } },
    },
  });
  if (existing) return existing;

  const nextTicketNumber = await allocateTicketNumber(tx, args.storeId);
  await tx.posShift.update({
    where: { id: args.shiftId },
    data: { lastTicketNumber: nextTicketNumber },
  });

  const ticket = await tx.posTicket.create({
    data: {
      shiftId: args.shiftId,
      storeId: args.storeId,
      registerId: args.registerId,
      ticketNumber: nextTicketNumber,
      status: 'DRAFT',
      transactionType: 'REGULAR',
      cashierUserId: args.userId,
      cashierName: args.userName,
      subtotal: moneyDecimal(0),
      taxTotal: moneyDecimal(0),
      secondaryTaxTotal: moneyDecimal(0),
      otherCharges: moneyDecimal(0),
      grandTotal: moneyDecimal(0),
      totalTendered: moneyDecimal(0),
      changeGiven: moneyDecimal(0),
    },
    include: {
      lines: true,
      tenders: { include: { tenderType: true } },
    },
  });

  await appendTicketEvent(tx, {
    ticketId: ticket.id,
    shiftId: ticket.shiftId,
    eventType: 'TICKET_CREATED',
    actorUserId: args.userId,
    actorName: args.userName,
    payload: { ticketNumber: nextTicketNumber },
  });

  return ticket;
}

async function getCurrentOpenShift(
  prisma: PrismaClient,
  registerId: string,
): Promise<Prisma.PosShiftGetPayload<{ include: { register: true } }> | null> {
  return prisma.posShift.findFirst({
    where: {
      registerId,
      status: { in: ['OPEN', 'COUNTING'] },
    },
    include: {
      register: true,
    },
    orderBy: [{ openedAt: 'desc' }],
  });
}

async function getTicketOrThrow(prisma: PrismaClient | PosTx, ticketId: string): Promise<PosTicketGraph> {
  const ticket = await prisma.posTicket.findUnique({
    where: { id: ticketId },
    include: {
      lines: true,
      tenders: { include: { tenderType: true } },
    },
  });
  if (!ticket) {
    throw new PosServiceError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
  }
  return ticket;
}

async function resolveProductByCode(prisma: PrismaClient | PosTx, code: string): Promise<PosProductLookup> {
  const normalizedCode = normalizeString(code)?.toUpperCase();
  if (!normalizedCode) {
    throw new PosServiceError(400, 'INVALID_SKU_CODE', 'SKU or UPC is required.');
  }

  const upc = await prisma.skuUpc.findUnique({
    where: { upc: normalizedCode },
    include: {
      sku: {
        select: {
          id: true,
          code: true,
          descriptionRics: true,
          descriptionWeb: true,
          currentPriceSlot: true,
          retailPrice: true,
          markDownPrice1: true,
          markDownPrice2: true,
          listPrice: true,
          sizeType: true,
          coupon: true,
          perks: true,
        },
      },
    },
  });
  if (upc) {
    const sku =
      upc.sku ??
      (await prisma.sku.findFirst({
        where: { code: upc.skuCode },
        select: {
          id: true,
          code: true,
          descriptionRics: true,
          descriptionWeb: true,
          currentPriceSlot: true,
          retailPrice: true,
          markDownPrice1: true,
          markDownPrice2: true,
          listPrice: true,
          sizeType: true,
          coupon: true,
          perks: true,
        },
      }));
    if (!sku) {
      throw new PosServiceError(404, 'SKU_NOT_FOUND', 'No active SKU matched that UPC.');
    }
    return mapLookupWithSizeType(prisma as PrismaClient, {
      upc: upc.upc,
      skuCode: sku.code ?? upc.skuCode,
      skuId: sku.id,
      descriptionRics: sku.descriptionRics,
      descriptionWeb: sku.descriptionWeb,
      currentPriceSlot: sku.currentPriceSlot,
      retailPrice: sku.retailPrice,
      markDownPrice1: sku.markDownPrice1,
      markDownPrice2: sku.markDownPrice2,
      listPrice: sku.listPrice,
      sizeType: sku.sizeType,
      coupon: sku.coupon,
      perks: sku.perks,
      defaultColumnLabel: upc.columnLabel,
      defaultRowLabel: upc.rowLabel,
    });
  }

  const sku = await prisma.sku.findFirst({
    where: {
      skuState: 'ACTIVE',
      OR: [{ code: normalizedCode }, { provisionalCode: normalizedCode }],
    },
    select: {
      id: true,
      code: true,
      descriptionRics: true,
      descriptionWeb: true,
      currentPriceSlot: true,
      retailPrice: true,
      markDownPrice1: true,
      markDownPrice2: true,
      listPrice: true,
      sizeType: true,
      coupon: true,
      perks: true,
    },
  });
  if (!sku) {
    throw new PosServiceError(404, 'SKU_NOT_FOUND', 'SKU or UPC was not found.');
  }
  return mapLookupWithSizeType(prisma as PrismaClient, {
    upc: null,
    skuCode: sku.code ?? normalizedCode,
    skuId: sku.id,
    descriptionRics: sku.descriptionRics,
    descriptionWeb: sku.descriptionWeb,
    currentPriceSlot: sku.currentPriceSlot,
    retailPrice: sku.retailPrice,
    markDownPrice1: sku.markDownPrice1,
    markDownPrice2: sku.markDownPrice2,
    listPrice: sku.listPrice,
    sizeType: sku.sizeType,
    coupon: sku.coupon,
    perks: sku.perks,
  });
}

function selectPriceForMode(product: PosProductLookup, mode?: PriceSlotCode | 'MANUAL', manualPrice?: number): {
  priceMode: PriceSlotCode | 'MANUAL';
  unitPrice: number;
} {
  if (mode === 'MANUAL' && manualPrice != null) {
    return { priceMode: 'MANUAL', unitPrice: roundMoney(manualPrice) };
  }

  const desired = mode && mode !== 'MANUAL' ? product.priceSlots.find((slot) => slot.code === mode) : undefined;
  if (desired) return { priceMode: desired.code, unitPrice: desired.amount };

  return {
    priceMode: product.defaultPriceMode,
    unitPrice: product.defaultUnitPrice,
  };
}

async function updateStockForCompletedLine(
  tx: PosTx,
  args: {
    storeId: number;
    line: Prisma.PosTicketLineGetPayload<Record<string, never>>;
    ticketId: string;
    performedBy: string;
    movementAt: Date;
    unitCostSnapshot: number | null;
  },
): Promise<void> {
  if (!args.line.skuId) return;

  const quantityDelta = args.line.quantity * -1;
  const columnLabel = args.line.columnLabel ?? '';
  const rowLabel = args.line.rowLabel ?? '';
  const idempotencyKey = `POS:${args.ticketId}:${args.line.id}`;

  await tx.$executeRawUnsafe(
    `INSERT INTO app.stock_level (
        id, store_id, sku_id, column_label, row_label, on_hand, reserved, last_movement_at, version, created_at, updated_at
      )
      VALUES (gen_random_uuid(), $1::smallint, $2::uuid, $3, $4, $5::integer, 0, $6::timestamptz, 1, $6::timestamptz, $6::timestamptz)
      ON CONFLICT (store_id, sku_id, column_label, row_label)
      DO UPDATE SET
        on_hand = app.stock_level.on_hand + EXCLUDED.on_hand,
        last_movement_at = EXCLUDED.last_movement_at,
        version = app.stock_level.version + 1,
        updated_at = EXCLUDED.updated_at`,
    args.storeId,
    args.line.skuId,
    columnLabel,
    rowLabel,
    quantityDelta,
    args.movementAt,
  );

  await tx.$executeRawUnsafe(
    `INSERT INTO app.stock_movement (
        id,
        store_id,
        sku_id,
        column_label,
        row_label,
        movement_type,
        quantity_delta,
        unit_cost_snapshot,
        retail_price_snapshot,
        source_document_type,
        source_document_id,
        reason_code,
        comment,
        performed_by,
        movement_at,
        created_at,
        idempotency_key
      )
      VALUES (
        gen_random_uuid(),
        $1::smallint,
        $2::uuid,
        $3,
        $4,
        $5,
        $6::integer,
        $7::numeric,
        $8::numeric,
        'POS_TICKET',
        $9,
        $10,
        $11,
        $12,
        $13::timestamptz,
        $13::timestamptz,
        $14
      )
      ON CONFLICT (idempotency_key) DO NOTHING`,
    args.storeId,
    args.line.skuId,
    columnLabel,
    rowLabel,
    args.line.quantity < 0 ? 'POS_RETURN' : 'POS_SALE',
    quantityDelta,
    args.unitCostSnapshot,
    requiredMoney(args.line.unitPrice),
    args.ticketId,
    args.line.returnCode ? String(args.line.returnCode) : null,
    normalizeString(args.line.comment),
    args.performedBy,
    args.movementAt,
    idempotencyKey,
  );
}

async function upsertSalesHistoryFromTicket(
  tx: PosTx,
  args: {
    ticket: PosTicketGraph;
    storeId: number;
    cashierCode: string | null;
  },
): Promise<string | null> {
  const purchasedAt = args.ticket.completedAt ?? new Date();
  const totalAmount = requiredMoney(args.ticket.grandTotal);
  const matchedCustomerId = await resolveSalesHistoryCustomerId(tx, args.ticket);
  const register = await tx.posRegister.findUnique({
    where: { id: args.ticket.registerId },
    select: { code: true },
  });
  const terminalCode = register?.code ?? args.ticket.registerId;
  const discountAmount = roundMoney(
    args.ticket.lines.reduce((sum, line) => sum + requiredMoney(line.discountAmount), 0) +
      ((requiredMoney(args.ticket.lines.reduce((sum, line) => sum + requiredMoney(line.lineSubtotal), 0)) *
        (toMoney(args.ticket.headerDiscountPct) ?? 0)) /
        100),
  );

  const existing = await tx.salesHistoryTicket.findUnique({
    where: { externalTransactionId: args.ticket.id },
    select: { id: true },
  });

  const ticketRecord = existing
    ? await tx.salesHistoryTicket.update({
        where: { externalTransactionId: args.ticket.id },
        data: {
          source: 'pos_live',
          matchedCustomerId,
          accountKey: args.ticket.customerAccountNumber ?? null,
          transactionType: TRANSACTION_TYPE_NUMBER[args.ticket.transactionType] ?? 1,
          transactionKind: totalAmount < 0 ? 'return' : 'purchase',
          status: args.ticket.status.toLowerCase(),
          storeId: args.storeId,
          terminal: terminalCode,
          ticketNumber: args.ticket.ticketNumber,
          cashierCode: args.cashierCode,
          channel: 'store',
          promotionCode: args.ticket.promotionCode ?? null,
          totalAmount: moneyDecimal(totalAmount),
          netAmount: moneyDecimal(requiredMoney(args.ticket.subtotal)),
          costAmount: moneyDecimal(0),
          discountAmount: moneyDecimal(discountAmount),
          purchasedAt,
        },
      })
    : await tx.salesHistoryTicket.create({
        data: {
          externalTransactionId: args.ticket.id,
          source: 'pos_live',
          matchedCustomerId,
          accountKey: args.ticket.customerAccountNumber ?? null,
          transactionType: TRANSACTION_TYPE_NUMBER[args.ticket.transactionType] ?? 1,
          transactionKind: totalAmount < 0 ? 'return' : 'purchase',
          status: args.ticket.status.toLowerCase(),
          storeId: args.storeId,
          terminal: terminalCode,
          ticketNumber: args.ticket.ticketNumber,
          cashierCode: args.cashierCode,
          channel: 'store',
          promotionCode: args.ticket.promotionCode ?? null,
          totalAmount: moneyDecimal(totalAmount),
          netAmount: moneyDecimal(requiredMoney(args.ticket.subtotal)),
          costAmount: moneyDecimal(0),
          discountAmount: moneyDecimal(discountAmount),
          purchasedAt,
        },
      });

  await tx.salesHistoryTicketLine.deleteMany({ where: { ticketId: ticketRecord.id } });
  await tx.salesHistoryTicketLine.createMany({
    data: args.ticket.lines.map((line) => ({
      ticketId: ticketRecord.id,
      lineNumber: line.lineNumber,
      skuId: assertUuidish(line.skuId),
      skuCode: line.skuCode ?? null,
      categoryId: null,
      categoryKey: null,
      brandId: null,
      brandKey: null,
      columnLabel: line.columnLabel,
      rowLabel: line.rowLabel,
      sizeType: line.sizeTypeCode ? String(line.sizeTypeCode) : null,
      sizeValue: [line.columnLabel, line.rowLabel].filter(Boolean).join('/'),
      quantity: line.quantity,
      unitPrice: moneyDecimal(requiredMoney(line.unitPrice)),
      unitCost: moneyDecimal(0),
      netAmount: moneyDecimal(requiredMoney(line.lineSubtotal)),
      costAmount: moneyDecimal(0),
      discountAmount: moneyDecimal(requiredMoney(line.discountAmount)),
      isMarkdown: line.priceMode.startsWith('MARKDOWN'),
      isReturn: line.quantity < 0,
      returnCode: line.returnCode ? String(line.returnCode) : null,
      salespersonCode: line.salespersonCode ?? null,
      })),
  });

  return matchedCustomerId;
}

async function resolveSalesHistoryCustomerId(
  tx: PosTx,
  ticket: PosTicketGraph,
): Promise<string | null> {
  if (ticket.customerId) {
    const directMatch = await tx.customerIntelligenceCustomer.findUnique({
      where: { id: ticket.customerId },
      select: { id: true },
    });
    if (directMatch) {
      return directMatch.id;
    }
  }

  const accountNumber = normalizeString(ticket.customerAccountNumber);
  if (!accountNumber) {
    return null;
  }

  const matchedByAccount = await tx.customerIntelligenceCustomer.findFirst({
    where: {
      OR: [
        { ricsAccount: accountNumber },
        { ricsCode: accountNumber },
        { honduranIdNormalized: accountNumber },
      ],
    },
    select: { id: true },
  });

  return matchedByAccount?.id ?? null;
}

async function buildReceipt(prisma: PrismaClient | PosTx, ticket: PosTicketGraph): Promise<PosReceiptDto> {
  const [store, register] = await Promise.all([
    prisma.storeMaster.findUnique({
      where: { number: ticket.storeId },
      select: { description: true },
    }),
    prisma.posRegister.findUnique({
      where: { id: ticket.registerId },
      select: { code: true },
    }),
  ]);

  return {
    title: 'Enter Sales Receipt',
    storeName: store?.description ?? `Store ${ticket.storeId}`,
    storeId: ticket.storeId,
    registerCode: register?.code ?? ticket.registerId,
    ticketNumber: ticket.ticketNumber,
    businessDate: ticket.createdAt.toISOString(),
    cashierName: ticket.cashierName,
    customerName: ticket.customerName ?? null,
    customerAccountNumber: ticket.customerAccountNumber ?? null,
    transactionType: ticket.transactionType,
    promotionCode: ticket.promotionCode ?? null,
    comment: ticket.comment ?? null,
    lines: ticket.lines
      .slice()
      .sort((a, b) => a.lineNumber - b.lineNumber)
      .map((line) => ({
        description: line.description,
        skuCode: line.skuCode ?? null,
        size: [line.columnLabel, line.rowLabel].filter(Boolean).join('/') || '-',
        quantity: line.quantity,
        unitPrice: requiredMoney(line.unitPrice),
        total: requiredMoney(line.lineTotal),
      })),
    tenders: ticket.tenders
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((tender) => ({
        label: tender.tenderLabel,
        amount: requiredMoney(tender.amount),
      })),
    totals: {
      subtotal: requiredMoney(ticket.subtotal),
      tax: requiredMoney(ticket.taxTotal),
      secondaryTax: requiredMoney(ticket.secondaryTaxTotal),
      otherCharges: requiredMoney(ticket.otherCharges),
      grandTotal: requiredMoney(ticket.grandTotal),
      totalTendered: requiredMoney(ticket.totalTendered),
      change: requiredMoney(ticket.changeGiven),
    },
  };
}

export function requiresManagerOverride(args: {
  permissions: string[];
  action: 'VOID' | 'REFUND' | 'CLOSE_BATCH' | 'PAY_OUT';
  ticket?: PosTicketDto | null;
}): boolean {
  if (args.permissions.includes(PROTECTED_ACTION_FALLBACK_PERMISSION)) {
    return false;
  }
  if (args.action === 'REFUND') {
    return true;
  }
  return true;
}

export async function getPosBootstrap(
  prisma: PrismaClient,
  args: {
    requestedStoreId?: number | null;
    requestedRegisterCode?: string | null;
    currentUser: {
      id: string;
      displayName: string;
      salespersonCode?: string | null;
      permissions: string[];
      homeStoreId?: string | null;
    };
  },
): Promise<PosBootstrapResult> {
  const { stores, selectedStore, registers, selectedRegister } = await selectStoreAndRegister(prisma, {
    requestedStoreId: args.requestedStoreId,
    requestedRegisterCode: args.requestedRegisterCode,
    currentUser: args.currentUser,
  });

  let shift = await getCurrentOpenShift(prisma, selectedRegister.id);
  let activeTicket: PosTicketGraph | null = null;

  if (shift) {
    activeTicket = await prisma.$transaction(async (tx) => {
      return ensureCurrentDraftTicket(tx, {
        shiftId: shift!.id,
        storeId: shift!.storeId,
        registerId: shift!.registerId,
        userId: args.currentUser.id,
        userName: args.currentUser.displayName,
      });
    });
    shift = (await getCurrentOpenShift(prisma, selectedRegister.id))!;
  }

  const [employees, promotions, returnCodes, tenderTypes, payoutCategories] = await Promise.all([
    listEmployees(prisma),
    listPromotions(prisma),
    listReturnCodes(prisma),
    prisma.posTenderType.findMany({
      where: { storeId: selectedStore.id, active: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        label: true,
        kind: true,
        requiresAccount: true,
        openDrawer: true,
      },
    }),
    prisma.posPayoutCategory.findMany({
      where: { storeId: selectedStore.id, active: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, label: true },
    }),
  ]);

  return {
    currentUser: {
      id: args.currentUser.id,
      displayName: args.currentUser.displayName,
      salespersonCode: args.currentUser.salespersonCode ?? null,
      permissions: args.currentUser.permissions,
    },
    selectedStoreId: selectedStore.id,
    selectedRegisterCode: selectedRegister.code,
    otherChargeLabel: selectedStore.otherChargeLabel,
    stores: stores.map((store) => ({
      id: store.id,
      code: store.code,
      name: store.name,
      active: store.active,
    })),
    registers,
    employees,
    tenderTypes,
    payoutCategories,
    promotions,
    returnCodes,
    shift: shift ? mapShift(shift) : null,
    activeTicket: activeTicket ? mapTicket(activeTicket) : null,
  };
}

export async function getPosTicket(prisma: PrismaClient, ticketId: string): Promise<PosTicketDto> {
  const ticket = await getTicketOrThrow(prisma, ticketId);
  return mapTicket(ticket);
}

export async function lookupProductForPos(prisma: PrismaClient, code: string): Promise<PosProductLookup> {
  return resolveProductByCode(prisma, code);
}

export async function openShift(
  prisma: PrismaClient,
  args: {
    storeId: number;
    registerCode?: string | null;
    openingCashFloat?: number;
    currentUser: {
      id: string;
      displayName: string;
      salespersonCode?: string | null;
      permissions: string[];
      homeStoreId?: string | null;
    };
  },
): Promise<PosBootstrapResult> {
  const { selectedStore, selectedRegister } = await selectStoreAndRegister(prisma, {
    requestedStoreId: args.storeId,
    requestedRegisterCode: args.registerCode,
    currentUser: args.currentUser,
  });

  const existing = await getCurrentOpenShift(prisma, selectedRegister.id);
  if (!existing) {
    await prisma.posShift.create({
      data: {
        storeId: selectedStore.id,
        registerId: selectedRegister.id,
        registerCode: selectedRegister.code,
        businessDate: new Date(),
        openedByUserId: args.currentUser.id,
        openedByName: args.currentUser.displayName,
        openingCashFloat: moneyDecimal(args.openingCashFloat ?? 0),
        status: 'OPEN',
        lastTicketNumber: selectedStore.lastTicketNumber,
      },
    });
  }

  return getPosBootstrap(prisma, {
    requestedStoreId: selectedStore.id,
    requestedRegisterCode: selectedRegister.code,
    currentUser: args.currentUser,
  });
}

export async function getClosePreview(
  prisma: PrismaClient,
  shiftId: string,
): Promise<PosClosePreview> {
  const shift = await prisma.posShift.findUnique({
    where: { id: shiftId },
    include: { register: true },
  });
  if (!shift) {
    throw new PosServiceError(404, 'SHIFT_NOT_FOUND', 'Shift not found.');
  }

  const tenderTotalsRaw = await prisma.$queryRawUnsafe<
    Array<{ tenderTypeId: string; code: string; label: string; kind: string; amount: number | string }>
  >(
    `SELECT tt.id AS "tenderTypeId",
            tt.code AS "code",
            tt.label AS "label",
            tt.kind AS "kind",
            COALESCE(SUM(t.amount), 0) AS "amount"
       FROM app.pos_tender_type tt
       LEFT JOIN app.pos_ticket_tender t ON t.tender_type_id = tt.id
       LEFT JOIN app.pos_ticket k ON k.id = t.ticket_id AND k.shift_id = $1 AND k.status = 'COMPLETED'
      WHERE tt.store_id = $2 AND tt.active = true
      GROUP BY tt.id, tt.code, tt.label, tt.kind
      ORDER BY tt.sort_order ASC, tt.code ASC`,
    shiftId,
    shift.storeId,
  );

  const payoutsRaw = await prisma.$queryRawUnsafe<Array<{ total: number | string }>>(
    `SELECT COALESCE(SUM(amount), 0) AS total
       FROM app.pos_payout
      WHERE shift_id = $1`,
    shiftId,
  );

  const tenderTotals = tenderTotalsRaw.map((row) => ({
    tenderTypeId: row.tenderTypeId,
    code: row.code,
    label: row.label,
    kind: row.kind,
    amount: roundMoney(Number(row.amount ?? 0)),
  }));

  const cashTotal = tenderTotals
    .filter((row) => row.kind === 'CASH')
    .reduce((sum, row) => sum + row.amount, 0);
  const payoutsTotal = roundMoney(Number(payoutsRaw[0]?.total ?? 0));
  const expectedCashTotal = roundMoney(requiredMoney(shift.openingCashFloat) + cashTotal - payoutsTotal);

  return {
    shift: mapShift(shift),
    expectedCashTotal,
    openingCashFloat: requiredMoney(shift.openingCashFloat),
    payoutsTotal,
    tenderTotals,
  };
}

export async function closeShift(
  prisma: PrismaClient,
  args: {
    shiftId: string;
    input: PosCloseInput;
    actorUserId: string;
    actorName: string;
  },
): Promise<PosShiftDto> {
  const preview = await getClosePreview(prisma, args.shiftId);
  const activeDraft = await prisma.posTicket.findFirst({
    where: { shiftId: args.shiftId, status: 'DRAFT' },
    include: { lines: true },
  });
  if (activeDraft && activeDraft.lines.length > 0) {
    throw new PosServiceError(409, 'ACTIVE_TICKET_REMAINS', 'Finish or void the current ticket before closing the batch.');
  }

  const actualCashTotal = roundMoney(args.input.actualCashTotal);
  const overShortAmount = roundMoney(actualCashTotal - preview.expectedCashTotal);

  const shift = await prisma.posShift.update({
    where: { id: args.shiftId },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      closedByUserId: args.actorUserId,
      closedByName: args.actorName,
      expectedCashTotal: moneyDecimal(preview.expectedCashTotal),
      actualCashTotal: moneyDecimal(actualCashTotal),
      overShortAmount: moneyDecimal(overShortAmount),
      countSummaryJson: args.input.countedTenders as Prisma.InputJsonValue | undefined,
      notes: normalizeString(args.input.notes) ?? undefined,
      postedAt: new Date(),
    },
    include: { register: true },
  });

  return mapShift(shift);
}

export async function patchTicketHeader(
  prisma: PrismaClient,
  args: {
    ticketId: string;
    patch: PosHeaderPatch;
    actorUserId: string;
    actorName: string;
  },
): Promise<PosTicketDto> {
  const ticket = await prisma.posTicket.findUnique({ where: { id: args.ticketId } });
  if (!ticket) {
    throw new PosServiceError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
  }
  if (ticket.status !== 'DRAFT') {
    throw new PosServiceError(409, 'TICKET_NOT_EDITABLE', 'Only draft tickets can be edited.');
  }

  const data: Prisma.PosTicketUpdateInput = {};
  if (args.patch.cashierUserId !== undefined) data.cashierUserId = args.patch.cashierUserId;
  if (args.patch.cashierName !== undefined) data.cashierName = args.patch.cashierName ?? ticket.cashierName;
  if (args.patch.customerId !== undefined) data.customerId = assertUuidish(args.patch.customerId);
  if (args.patch.customerAccountNumber !== undefined) data.customerAccountNumber = normalizeString(args.patch.customerAccountNumber);
  if (args.patch.customerName !== undefined) data.customerName = normalizeString(args.patch.customerName);
  if (args.patch.headerDiscountPct !== undefined) {
    data.headerDiscountPct =
      args.patch.headerDiscountPct == null ? null : moneyDecimal(args.patch.headerDiscountPct);
  }
  if (args.patch.promotionCode !== undefined) data.promotionCode = normalizeString(args.patch.promotionCode);
  if (args.patch.shipToState !== undefined) data.shipToState = normalizeString(args.patch.shipToState);
  if (args.patch.transactionType !== undefined) data.transactionType = validateTransactionType(args.patch.transactionType);
  if (args.patch.comment !== undefined) data.comment = normalizeString(args.patch.comment);
  if (args.patch.otherCharges !== undefined) data.otherCharges = moneyDecimal(args.patch.otherCharges);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.posTicket.update({
      where: { id: args.ticketId },
      data,
    });
    await appendTicketEvent(tx, {
      ticketId: args.ticketId,
      shiftId: ticket.shiftId,
      eventType: 'HEADER_UPDATED',
      actorUserId: args.actorUserId,
      actorName: args.actorName,
      payload: data as unknown as Prisma.InputJsonValue,
    });
    return recalculateTicketTotals(tx, args.ticketId);
  });

  return mapTicket(updated);
}

export async function addTicketLine(
  prisma: PrismaClient,
  args: {
    ticketId: string;
    input: PosAddLineInput;
    actorUserId: string;
    actorName: string;
  },
): Promise<PosTicketDto> {
  const ticket = await prisma.posTicket.findUnique({
    where: { id: args.ticketId },
    include: { lines: true },
  });
  if (!ticket) {
    throw new PosServiceError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
  }
  if (ticket.status !== 'DRAFT') {
    throw new PosServiceError(409, 'TICKET_NOT_EDITABLE', 'Only draft tickets can be edited.');
  }

  const product = await resolveProductByCode(prisma, args.input.code);
  const quantity = args.input.quantity ?? product.defaultQuantity;
  const selectedPrice = selectPriceForMode(product, args.input.priceMode, args.input.unitPrice);
  const financials = computeLineFinancials({
    quantity,
    unitPrice: selectedPrice.unitPrice,
    discountPct: args.input.discountPct,
    discountAmount: args.input.discountAmount,
    taxable: args.input.taxable ?? product.taxable,
    secondaryTaxRate: args.input.secondaryTaxRate,
  });

  const lineNumber = (ticket.lines.at(-1)?.lineNumber ?? 0) + 1;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.posTicketLine.create({
      data: {
        ticketId: args.ticketId,
        lineNumber,
        skuId: product.skuId,
        skuCode: product.code,
        description: product.description,
        upc: product.upc,
        sizeTypeCode: product.sizeTypeCode,
        columnLabel: args.input.columnLabel ?? product.defaultColumnLabel,
        rowLabel: args.input.rowLabel ?? product.defaultRowLabel,
        quantity,
        unitPrice: moneyDecimal(financials.unitPrice),
        priceMode: selectedPrice.priceMode,
        discountPct: financials.discountPct == null ? null : moneyDecimal(financials.discountPct),
        discountAmount: moneyDecimal(financials.discountAmount),
        taxable: financials.taxable,
        taxRate: moneyDecimal(financials.taxRate),
        secondaryTaxRate: moneyDecimal(financials.secondaryTaxRate),
        salespersonUserId: assertUuidish(args.input.salespersonUserId) ?? args.actorUserId,
        salespersonCode: normalizeString(args.input.salespersonCode),
        salespersonName: normalizeString(args.input.salespersonName) ?? args.actorName,
        familyMemberId: assertUuidish(args.input.familyMemberId),
        returnCode: args.input.returnCode ?? null,
        comment: normalizeString(args.input.comment),
        lineSubtotal: moneyDecimal(financials.lineSubtotal),
        lineTax: moneyDecimal(financials.lineTax),
        lineSecondaryTax: moneyDecimal(financials.lineSecondaryTax),
        lineTotal: moneyDecimal(financials.lineTotal),
      },
    });

    await appendTicketEvent(tx, {
      ticketId: args.ticketId,
      shiftId: ticket.shiftId,
      eventType: 'LINE_ADDED',
      actorUserId: args.actorUserId,
      actorName: args.actorName,
      payload: { lineNumber, skuCode: product.code, quantity } as Prisma.InputJsonValue,
    });

    return recalculateTicketTotals(tx, args.ticketId);
  });

  return mapTicket(updated);
}

export async function updateTicketLine(
  prisma: PrismaClient,
  args: {
    ticketId: string;
    lineId: string;
    input: PosUpdateLineInput;
    actorUserId: string;
    actorName: string;
  },
): Promise<PosTicketDto> {
  const line = await prisma.posTicketLine.findUnique({
    where: { id: args.lineId },
    include: { ticket: true },
  });
  if (!line || line.ticketId !== args.ticketId) {
    throw new PosServiceError(404, 'TICKET_LINE_NOT_FOUND', 'Ticket line not found.');
  }
  if (line.ticket.status !== 'DRAFT') {
    throw new PosServiceError(409, 'TICKET_NOT_EDITABLE', 'Only draft tickets can be edited.');
  }

  let unitPrice = args.input.unitPrice ?? requiredMoney(line.unitPrice);
  let priceMode = args.input.priceMode ?? line.priceMode;
  if (args.input.priceMode && args.input.priceMode !== 'MANUAL' && line.skuCode) {
    const product = await resolveProductByCode(prisma, line.skuCode);
    const selection = selectPriceForMode(product, args.input.priceMode, args.input.unitPrice);
    unitPrice = selection.unitPrice;
    priceMode = selection.priceMode;
  }

  const financials = computeLineFinancials({
    quantity: args.input.quantity ?? line.quantity,
    unitPrice,
    discountPct: args.input.discountPct ?? toMoney(line.discountPct),
    discountAmount: args.input.discountAmount ?? requiredMoney(line.discountAmount),
    taxable: args.input.taxable ?? line.taxable,
    secondaryTaxRate: args.input.secondaryTaxRate ?? Number(line.secondaryTaxRate),
    taxRate: Number(line.taxRate),
  });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.posTicketLine.update({
      where: { id: args.lineId },
      data: {
        quantity: args.input.quantity ?? line.quantity,
        columnLabel: args.input.columnLabel ?? line.columnLabel,
        rowLabel: args.input.rowLabel ?? line.rowLabel,
        unitPrice: moneyDecimal(financials.unitPrice),
        priceMode,
        discountPct: financials.discountPct == null ? null : moneyDecimal(financials.discountPct),
        discountAmount: moneyDecimal(financials.discountAmount),
        taxable: financials.taxable,
        secondaryTaxRate: moneyDecimal(financials.secondaryTaxRate),
        salespersonUserId: args.input.salespersonUserId === undefined ? line.salespersonUserId : assertUuidish(args.input.salespersonUserId),
        salespersonCode: args.input.salespersonCode === undefined ? line.salespersonCode : normalizeString(args.input.salespersonCode),
        salespersonName: args.input.salespersonName === undefined ? line.salespersonName : normalizeString(args.input.salespersonName),
        familyMemberId: args.input.familyMemberId === undefined ? line.familyMemberId : assertUuidish(args.input.familyMemberId),
        returnCode: args.input.returnCode === undefined ? line.returnCode : args.input.returnCode,
        comment: args.input.comment === undefined ? line.comment : normalizeString(args.input.comment),
        lineSubtotal: moneyDecimal(financials.lineSubtotal),
        lineTax: moneyDecimal(financials.lineTax),
        lineSecondaryTax: moneyDecimal(financials.lineSecondaryTax),
        lineTotal: moneyDecimal(financials.lineTotal),
      },
    });

    await appendTicketEvent(tx, {
      ticketId: args.ticketId,
      shiftId: line.ticket.shiftId,
      eventType: 'LINE_UPDATED',
      actorUserId: args.actorUserId,
      actorName: args.actorName,
      payload: { lineId: args.lineId } as Prisma.InputJsonValue,
    });

    return recalculateTicketTotals(tx, args.ticketId);
  });

  return mapTicket(updated);
}

export async function rotateTicketLinePrice(
  prisma: PrismaClient,
  args: {
    ticketId: string;
    lineId: string;
    actorUserId: string;
    actorName: string;
  },
): Promise<PosTicketDto> {
  const line = await prisma.posTicketLine.findUnique({
    where: { id: args.lineId },
    include: { ticket: true },
  });
  if (!line || line.ticketId !== args.ticketId) {
    throw new PosServiceError(404, 'TICKET_LINE_NOT_FOUND', 'Ticket line not found.');
  }
  if (!line.skuCode) {
    throw new PosServiceError(409, 'PRICE_ROTATION_UNAVAILABLE', 'This line cannot rotate to another price slot.');
  }

  const product = await resolveProductByCode(prisma, line.skuCode);
  const slotCodes = product.priceSlots.map((slot) => slot.code);
  const currentIndex = slotCodes.indexOf(line.priceMode as PriceSlotCode);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % slotCodes.length : 0;
  const nextMode = slotCodes[nextIndex];

  return updateTicketLine(prisma, {
    ticketId: args.ticketId,
    lineId: args.lineId,
    input: { priceMode: nextMode },
    actorUserId: args.actorUserId,
    actorName: args.actorName,
  });
}

export async function removeTicketLine(
  prisma: PrismaClient,
  args: {
    ticketId: string;
    lineId: string;
    actorUserId: string;
    actorName: string;
  },
): Promise<PosTicketDto> {
  const line = await prisma.posTicketLine.findUnique({
    where: { id: args.lineId },
    include: { ticket: true },
  });
  if (!line || line.ticketId !== args.ticketId) {
    throw new PosServiceError(404, 'TICKET_LINE_NOT_FOUND', 'Ticket line not found.');
  }
  if (line.ticket.status !== 'DRAFT') {
    throw new PosServiceError(409, 'TICKET_NOT_EDITABLE', 'Only draft tickets can be edited.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.posTicketLine.delete({ where: { id: args.lineId } });
    const remaining = await tx.posTicketLine.findMany({
      where: { ticketId: args.ticketId },
      orderBy: { lineNumber: 'asc' },
    });
    for (let index = 0; index < remaining.length; index += 1) {
      const lineRow = remaining[index];
      const desiredLineNumber = index + 1;
      if (lineRow.lineNumber !== desiredLineNumber) {
        await tx.posTicketLine.update({
          where: { id: lineRow.id },
          data: { lineNumber: desiredLineNumber },
        });
      }
    }

    await appendTicketEvent(tx, {
      ticketId: args.ticketId,
      shiftId: line.ticket.shiftId,
      eventType: 'LINE_REMOVED',
      actorUserId: args.actorUserId,
      actorName: args.actorName,
      payload: { lineId: args.lineId } as Prisma.InputJsonValue,
    });

    return recalculateTicketTotals(tx, args.ticketId);
  });

  return mapTicket(updated);
}

export async function listReclaimableTickets(prisma: PrismaClient, shiftId: string): Promise<PosTicketListItem[]> {
  const rows = await prisma.posTicket.findMany({
    where: { shiftId, status: 'VOIDED' },
    orderBy: [{ updatedAt: 'desc' }],
  });

  return rows.map((ticket) => ({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    cashierName: ticket.cashierName,
    customerName: ticket.customerName ?? null,
    grandTotal: requiredMoney(ticket.grandTotal),
    completedAt: iso(ticket.completedAt),
    voidedAt: iso(ticket.voidedAt),
  }));
}

export async function listCompletedTickets(prisma: PrismaClient, shiftId: string): Promise<PosTicketListItem[]> {
  const rows = await prisma.posTicket.findMany({
    where: { shiftId, status: 'COMPLETED' },
    orderBy: [{ completedAt: 'desc' }, { ticketNumber: 'desc' }],
  });

  return rows.map((ticket) => ({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    cashierName: ticket.cashierName,
    customerName: ticket.customerName ?? null,
    grandTotal: requiredMoney(ticket.grandTotal),
    completedAt: iso(ticket.completedAt),
    voidedAt: iso(ticket.voidedAt),
  }));
}

export async function reclaimTicket(
  prisma: PrismaClient,
  args: {
    ticketId: string;
    actorUserId: string;
    actorName: string;
  },
): Promise<PosTicketDto> {
  const ticket = await getTicketOrThrow(prisma, args.ticketId);
  if (ticket.status !== 'VOIDED') {
    throw new PosServiceError(409, 'TICKET_NOT_RECLAIMABLE', 'Only voided tickets in the current batch can be reclaimed.');
  }

  const reclaimed = await prisma.$transaction(async (tx) => {
    const currentDraft = await tx.posTicket.findFirst({
      where: { shiftId: ticket.shiftId, status: 'DRAFT' },
      include: { lines: true },
    });

    let targetDraftId = currentDraft?.id;
    if (!currentDraft || currentDraft.lines.length > 0) {
      const draft = await ensureCurrentDraftTicket(tx, {
        shiftId: ticket.shiftId,
        storeId: ticket.storeId,
        registerId: ticket.registerId,
        userId: args.actorUserId,
        userName: args.actorName,
      });
      targetDraftId = draft.id;
      if (draft.lines.length > 0) {
        throw new PosServiceError(409, 'ACTIVE_DRAFT_NOT_EMPTY', 'Clear the current draft before reclaiming a ticket.');
      }
    }

    await tx.posTicket.update({
      where: { id: targetDraftId! },
      data: {
        transactionType: ticket.transactionType,
        cashierUserId: ticket.cashierUserId,
        cashierName: ticket.cashierName,
        customerId: ticket.customerId,
        customerAccountNumber: ticket.customerAccountNumber,
        customerName: ticket.customerName,
        headerDiscountPct: ticket.headerDiscountPct,
        promotionCode: ticket.promotionCode,
        shipToState: ticket.shipToState,
        comment: ticket.comment,
        otherCharges: ticket.otherCharges,
      },
    });

    await tx.posTicketLine.deleteMany({ where: { ticketId: targetDraftId! } });
    for (const line of ticket.lines) {
      await tx.posTicketLine.create({
        data: {
          ticketId: targetDraftId!,
          lineNumber: line.lineNumber,
          skuId: line.skuId,
          skuCode: line.skuCode,
          description: line.description,
          upc: line.upc,
          sizeTypeCode: line.sizeTypeCode,
          columnLabel: line.columnLabel,
          rowLabel: line.rowLabel,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          priceMode: line.priceMode,
          discountPct: line.discountPct,
          discountAmount: line.discountAmount,
          taxable: line.taxable,
          taxRate: line.taxRate,
          secondaryTaxRate: line.secondaryTaxRate,
          salespersonUserId: line.salespersonUserId,
          salespersonCode: line.salespersonCode,
          salespersonName: line.salespersonName,
          familyMemberId: line.familyMemberId,
          returnCode: line.returnCode,
          comment: line.comment,
          lineSubtotal: line.lineSubtotal,
          lineTax: line.lineTax,
          lineSecondaryTax: line.lineSecondaryTax,
          lineTotal: line.lineTotal,
        },
      });
    }

    await appendTicketEvent(tx, {
      ticketId: targetDraftId!,
      shiftId: ticket.shiftId,
      eventType: 'TICKET_RECLAIMED',
      actorUserId: args.actorUserId,
      actorName: args.actorName,
      payload: { fromTicketId: ticket.id } as Prisma.InputJsonValue,
    });

    await tx.posTicket.update({
      where: { id: ticket.id },
      data: { receiptPayloadJson: ticket.receiptPayloadJson ?? undefined },
    });

    return recalculateTicketTotals(tx, targetDraftId!);
  });

  return mapTicket(reclaimed);
}

export async function voidDraftTicket(
  prisma: PrismaClient,
  args: {
    ticketId: string;
    actorUserId: string;
    actorName: string;
  },
): Promise<PosTicketDto> {
  const ticket = await getTicketOrThrow(prisma, args.ticketId);
  if (ticket.status !== 'DRAFT') {
    throw new PosServiceError(409, 'TICKET_NOT_VOIDABLE', 'Only the active draft ticket can be voided from Enter Sales.');
  }

  const nextTicket = await prisma.$transaction(async (tx) => {
    await tx.posTicket.update({
      where: { id: args.ticketId },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
      },
    });

    await appendTicketEvent(tx, {
      ticketId: args.ticketId,
      shiftId: ticket.shiftId,
      eventType: 'TICKET_VOIDED',
      actorUserId: args.actorUserId,
      actorName: args.actorName,
      payload: { ticketNumber: ticket.ticketNumber } as Prisma.InputJsonValue,
    });

    return ensureCurrentDraftTicket(tx, {
      shiftId: ticket.shiftId,
      storeId: ticket.storeId,
      registerId: ticket.registerId,
      userId: args.actorUserId,
      userName: args.actorName,
    });
  });

  return mapTicket(nextTicket);
}

export async function createPayout(
  prisma: PrismaClient,
  args: {
    input: PosPayoutInput;
    actorUserId: string;
    actorName: string;
  },
): Promise<{ payout: { id: string; amount: number; categoryLabel: string; createdAt: string }; closePreview: PosClosePreview }> {
  if (roundMoney(args.input.amount) <= 0) {
    throw new PosServiceError(400, 'INVALID_PAYOUT_AMOUNT', 'Payout amount must be greater than zero.');
  }

  const shift = await prisma.posShift.findUnique({
    where: { id: args.input.shiftId },
  });
  if (!shift || shift.status !== 'OPEN') {
    throw new PosServiceError(409, 'SHIFT_NOT_OPEN', 'Payouts require an open shift.');
  }

  const category = await prisma.posPayoutCategory.findUnique({
    where: { id: args.input.categoryId },
  });
  if (!category) {
    throw new PosServiceError(404, 'PAYOUT_CATEGORY_NOT_FOUND', 'Payout category not found.');
  }

  const payout = await prisma.posPayout.create({
    data: {
      shiftId: shift.id,
      storeId: shift.storeId,
      registerId: shift.registerId,
      categoryId: category.id,
      categoryCode: category.code,
      categoryLabel: category.label,
      cashierUserId: args.actorUserId,
      cashierName: args.actorName,
      amount: moneyDecimal(args.input.amount),
      note: normalizeString(args.input.note),
    },
  });

  const closePreview = await getClosePreview(prisma, shift.id);
  return {
    payout: {
      id: payout.id,
      amount: requiredMoney(payout.amount),
      categoryLabel: payout.categoryLabel,
      createdAt: payout.createdAt.toISOString(),
    },
    closePreview,
  };
}

export async function completeTicket(
  prisma: PrismaClient,
  args: {
    ticketId: string;
    input: PosCompleteInput;
    actorUserId: string;
    actorName: string;
    actorSalespersonCode?: string | null;
  },
): Promise<{ ticket: PosTicketDto; receipt: PosReceiptDto; nextTicket: PosTicketDto }> {
  const ticket = await getTicketOrThrow(prisma, args.ticketId);
  if (ticket.status !== 'DRAFT') {
    throw new PosServiceError(409, 'TICKET_NOT_COMPLETABLE', 'Only draft tickets can be completed.');
  }
  if (ticket.lines.length === 0) {
    throw new PosServiceError(400, 'EMPTY_TICKET', 'Add at least one line before tendering the sale.');
  }
  if (args.input.tenders.length === 0 || args.input.tenders.length > 4) {
    throw new PosServiceError(400, 'INVALID_TENDER_COUNT', 'Enter between one and four tenders.');
  }

  const tenderIds = args.input.tenders.map((tender) => tender.tenderTypeId);
  const tenderTypes = await prisma.posTenderType.findMany({
    where: {
      id: { in: tenderIds },
      storeId: ticket.storeId,
      active: true,
    },
  });
  if (tenderTypes.length !== tenderIds.length) {
    throw new PosServiceError(400, 'INVALID_TENDER_TYPE', 'One or more tender types are invalid for this store.');
  }

  const requestedOtherCharges = args.input.otherCharges ?? requiredMoney(ticket.otherCharges);
  const tenderTotal = roundMoney(args.input.tenders.reduce((sum, tender) => sum + roundMoney(tender.amount), 0));

  const completed = await prisma.$transaction(async (tx) => {
    await tx.posTicketTender.deleteMany({ where: { ticketId: args.ticketId } });
    await tx.posTicket.update({
      where: { id: args.ticketId },
      data: {
        comment: args.input.comment === undefined ? ticket.comment : normalizeString(args.input.comment),
        promotionCode:
          args.input.promotionCode === undefined ? ticket.promotionCode : normalizeString(args.input.promotionCode),
        otherCharges: moneyDecimal(requestedOtherCharges),
      },
    });

    await recalculateTicketTotals(tx, args.ticketId);

    const recalculated = await getTicketOrThrow(tx, args.ticketId);
    const totalDue = requiredMoney(recalculated.grandTotal);
    if (totalDue >= 0 && tenderTotal + 0.009 < totalDue) {
      throw new PosServiceError(400, 'INSUFFICIENT_TENDER', 'The tender total is less than the total due.');
    }

    for (let index = 0; index < args.input.tenders.length; index += 1) {
      const tenderInput = args.input.tenders[index];
      const tenderType = tenderTypes.find((row) => row.id === tenderInput.tenderTypeId)!;
      if (tenderType.requiresAccount && !normalizeString(tenderInput.accountNumber)) {
        throw new PosServiceError(400, 'ACCOUNT_NUMBER_REQUIRED', `${tenderType.label} requires an account number.`);
      }
      await tx.posTicketTender.create({
        data: {
          ticketId: args.ticketId,
          sequence: index + 1,
          tenderTypeId: tenderType.id,
          tenderCode: tenderType.code,
          tenderLabel: tenderType.label,
          tenderKind: tenderType.kind,
          amount: moneyDecimal(tenderInput.amount),
          accountNumber: normalizeString(tenderInput.accountNumber),
          reference: normalizeString(tenderInput.reference),
        },
      });
    }

    const finalized = await recalculateTicketTotals(tx, args.ticketId);
    const completedAt = new Date();
    const finalTicket = await tx.posTicket.update({
      where: { id: args.ticketId },
      data: {
        status: 'COMPLETED',
        completedAt,
      },
      include: {
        lines: true,
        tenders: { include: { tenderType: true } },
      },
    });

    for (const line of finalTicket.lines) {
      let unitCostSnapshot: number | null = null;
      if (line.skuId) {
        const sku = await tx.sku.findUnique({
          where: { id: line.skuId },
          select: { currentCost: true },
        });
        unitCostSnapshot = toMoney(sku?.currentCost);
      }
      await updateStockForCompletedLine(tx, {
        storeId: finalTicket.storeId,
        line,
        ticketId: finalTicket.id,
        performedBy: args.actorUserId,
        movementAt: completedAt,
        unitCostSnapshot,
      });
    }

    const matchedCustomerId = await upsertSalesHistoryFromTicket(tx, {
      ticket: finalTicket,
      storeId: finalTicket.storeId,
      cashierCode: args.actorSalespersonCode ?? null,
    });

    const receipt = await buildReceipt(tx, finalTicket);
    await tx.posTicket.update({
      where: { id: finalTicket.id },
      data: { receiptPayloadJson: receipt as unknown as Prisma.InputJsonValue },
    });

    await appendTicketEvent(tx, {
      ticketId: finalTicket.id,
      shiftId: finalTicket.shiftId,
      eventType: 'TICKET_COMPLETED',
      actorUserId: args.actorUserId,
      actorName: args.actorName,
      payload: {
        grandTotal: requiredMoney(finalTicket.grandTotal),
        totalTendered: requiredMoney(finalTicket.totalTendered),
      } as Prisma.InputJsonValue,
    });

    const nextTicket = await ensureCurrentDraftTicket(tx, {
      shiftId: finalTicket.shiftId,
      storeId: finalTicket.storeId,
      registerId: finalTicket.registerId,
      userId: args.actorUserId,
      userName: args.actorName,
    });

    return {
      ticket: finalTicket,
      receipt,
      nextTicket,
      matchedCustomerId,
    };
  });

  const metricsCustomerId = completed.matchedCustomerId ?? null;
  if (metricsCustomerId) {
    void computeIncremental(metricsCustomerId).catch((error) => {
      console.error('[sales-pos] Failed to refresh customer metrics after POS completion', {
        ticketId: completed.ticket.id,
        customerId: metricsCustomerId,
        error,
      });
    });
  }

  return {
    ticket: mapTicket(completed.ticket),
    receipt: completed.receipt,
    nextTicket: mapTicket(completed.nextTicket),
  };
}

export async function reprintTicket(
  prisma: PrismaClient,
  args: {
    ticketId: string;
    actorUserId: string;
    actorName: string;
  },
): Promise<{ ticket: PosTicketDto; receipt: PosReceiptDto }> {
  const ticket = await getTicketOrThrow(prisma, args.ticketId);
  if (ticket.status !== 'COMPLETED') {
    throw new PosServiceError(409, 'TICKET_NOT_PRINTABLE', 'Only completed tickets can be reprinted.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.posTicket.update({
      where: { id: args.ticketId },
      data: {
        receiptPrintCount: { increment: 1 },
      },
      include: {
        lines: true,
        tenders: { include: { tenderType: true } },
      },
    });

    const receiptPayload =
      updated.receiptPayloadJson && typeof updated.receiptPayloadJson === 'object'
        ? (updated.receiptPayloadJson as unknown as PosReceiptDto)
        : await buildReceipt(tx, updated);

    await appendTicketEvent(tx, {
      ticketId: updated.id,
      shiftId: updated.shiftId,
      eventType: 'TICKET_REPRINTED',
      actorUserId: args.actorUserId,
      actorName: args.actorName,
      payload: { receiptPrintCount: updated.receiptPrintCount } as Prisma.InputJsonValue,
    });

    return { ticket: updated, receipt: receiptPayload };
  });

  return { ticket: mapTicket(result.ticket), receipt: result.receipt };
}
