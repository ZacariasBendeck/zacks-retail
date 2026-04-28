import { prisma } from '../../db/prisma';
import { Prisma as GeneratedPrisma } from '../../../generated/prisma-client-v7';
import type { PrismaClient as GeneratedPrismaClient } from '../../../generated/prisma-client-v7';

const CUSTOMER_TRANSACTION_WITH_ITEMS =
  GeneratedPrisma.validator<GeneratedPrisma.CustomerTransactionFactDefaultArgs>()({
    include: { items: true },
  });

const SALES_HISTORY_WITH_LINES =
  GeneratedPrisma.validator<GeneratedPrisma.SalesHistoryTicketDefaultArgs>()({
    include: { lines: true },
  });

type CustomerTransactionWithItems = GeneratedPrisma.CustomerTransactionFactGetPayload<
  typeof CUSTOMER_TRANSACTION_WITH_ITEMS
>;

type SalesHistoryTicketWithLines = GeneratedPrisma.SalesHistoryTicketGetPayload<
  typeof SALES_HISTORY_WITH_LINES
>;

const prismaClient = prisma as unknown as GeneratedPrismaClient;

export type CustomerMetricTransactionItem = {
  categoryId: string | null;
  categoryKey: string | null;
  brandId: string | null;
  brandKey: string | null;
  sizeType: string | null;
  sizeValue: string | null;
  quantity: number;
  netAmount: number | { toNumber(): number };
  costAmount: number | { toNumber(): number };
  discountAmount: number | { toNumber(): number };
  isMarkdown: boolean;
  isReturn: boolean;
};

export type CustomerMetricTransaction = {
  id: string;
  customerId: string;
  source: string;
  transactionKind: string;
  status: string;
  storeId: number | null;
  channel: string;
  promotionCode: string | null;
  couponCode: string | null;
  totalAmount: number | { toNumber(): number };
  netAmount: number | { toNumber(): number };
  costAmount: number | { toNumber(): number };
  discountAmount: number | { toNumber(): number };
  purchasedAt: Date;
  items: CustomerMetricTransactionItem[];
};

export const CUSTOMER_METRIC_FACT_SOURCE_CTE_SQL = `
metric_fact AS (
  SELECT
    id,
    customer_id,
    source,
    transaction_kind,
    status,
    store_id,
    channel,
    promotion_code,
    coupon_code,
    total_amount,
    net_amount,
    cost_amount,
    discount_amount,
    purchased_at
  FROM app.customer_transaction_fact
  UNION ALL
  SELECT
    id,
    matched_customer_id AS customer_id,
    source,
    transaction_kind,
    status,
    store_id,
    channel,
    promotion_code,
    coupon_code,
    total_amount,
    net_amount,
    cost_amount,
    discount_amount,
    purchased_at
  FROM app.sales_history_ticket
  WHERE matched_customer_id IS NOT NULL
)`;

export const CUSTOMER_METRIC_ITEM_SOURCE_CTE_SQL = `
metric_item AS (
  SELECT
    transaction_id,
    category_id,
    category_key,
    brand_id,
    brand_key,
    size_type,
    size_value,
    quantity,
    net_amount,
    cost_amount,
    discount_amount,
    is_markdown,
    is_return
  FROM app.customer_transaction_item
  UNION ALL
  SELECT
    ticket_id AS transaction_id,
    category_id,
    category_key,
    brand_id,
    brand_key,
    size_type,
    size_value,
    quantity,
    net_amount,
    cost_amount,
    discount_amount,
    is_markdown,
    is_return
  FROM app.sales_history_ticket_line
)`;

export const CUSTOMER_METRIC_SOURCE_CTE_SQL = `${CUSTOMER_METRIC_FACT_SOURCE_CTE_SQL},
${CUSTOMER_METRIC_ITEM_SOURCE_CTE_SQL}`;

export const CUSTOMER_METRIC_HAS_SALES_PREDICATE_SQL = `
EXISTS (
  SELECT 1
  FROM app.customer_transaction_fact ctf
  WHERE ctf.customer_id = c.id
)
OR EXISTS (
  SELECT 1
  FROM app.sales_history_ticket sht
  WHERE sht.matched_customer_id = c.id
)`;

export async function loadCustomerMetricTransactions(
  customerId: string,
): Promise<CustomerMetricTransaction[]> {
  const customer = await prisma.customerIntelligenceCustomer.findUnique({
    where: { id: customerId },
    select: {
      ricsAccount: true,
      ricsCode: true,
      honduranIdNormalized: true,
    },
  });
  const accountKeys = [
    customer?.ricsAccount ?? null,
    customer?.ricsCode ?? null,
    customer?.honduranIdNormalized ?? null,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const [customerTransactions, salesHistoryTickets] = await Promise.all([
    prisma.customerTransactionFact.findMany({
      where: { customerId },
      ...CUSTOMER_TRANSACTION_WITH_ITEMS,
      orderBy: { purchasedAt: 'asc' },
    }),
    prismaClient.salesHistoryTicket.findMany({
      where: {
        OR: [
          { matchedCustomerId: customerId },
          ...(accountKeys.length > 0
            ? [
                {
                  matchedCustomerId: null,
                  accountKey: { in: accountKeys },
                },
              ]
            : []),
        ],
      },
      ...SALES_HISTORY_WITH_LINES,
      orderBy: { purchasedAt: 'asc' },
    }),
  ]);

  return [
    ...customerTransactions.map(normalizeCustomerTransaction),
    ...salesHistoryTickets.map((ticket) => normalizeSalesHistoryTicket(ticket, customerId)),
  ].sort((left, right) => {
    const purchasedAtDelta = left.purchasedAt.getTime() - right.purchasedAt.getTime();
    if (purchasedAtDelta !== 0) {
      return purchasedAtDelta;
    }
    return left.id.localeCompare(right.id);
  });
}

function normalizeCustomerTransaction(
  transaction: CustomerTransactionWithItems,
): CustomerMetricTransaction {
  return {
    id: transaction.id,
    customerId: transaction.customerId,
    source: transaction.source,
    transactionKind: transaction.transactionKind,
    status: transaction.status,
    storeId: transaction.storeId,
    channel: transaction.channel,
    promotionCode: transaction.promotionCode ?? null,
    couponCode: transaction.couponCode ?? null,
    totalAmount: transaction.totalAmount,
    netAmount: transaction.netAmount,
    costAmount: transaction.costAmount,
    discountAmount: transaction.discountAmount,
    purchasedAt: transaction.purchasedAt,
    items: transaction.items.map((item) => ({
      categoryId: item.categoryId ?? null,
      categoryKey: item.categoryKey ?? null,
      brandId: item.brandId ?? null,
      brandKey: item.brandKey ?? null,
      sizeType: item.sizeType ?? null,
      sizeValue: item.sizeValue ?? null,
      quantity: item.quantity,
      netAmount: item.netAmount,
      costAmount: item.costAmount,
      discountAmount: item.discountAmount,
      isMarkdown: item.isMarkdown,
      isReturn: item.isReturn,
    })),
  };
}

function normalizeSalesHistoryTicket(
  ticket: SalesHistoryTicketWithLines,
  customerId: string,
): CustomerMetricTransaction {
  return {
    id: ticket.id,
    customerId,
    source: ticket.source,
    transactionKind: ticket.transactionKind,
    status: ticket.status,
    storeId: ticket.storeId,
    channel: ticket.channel,
    promotionCode: ticket.promotionCode ?? null,
    couponCode: ticket.couponCode ?? null,
    totalAmount: ticket.totalAmount,
    netAmount: ticket.netAmount,
    costAmount: ticket.costAmount,
    discountAmount: ticket.discountAmount,
    purchasedAt: ticket.purchasedAt,
    items: ticket.lines.map((line) => ({
      categoryId: line.categoryId ?? null,
      categoryKey: line.categoryKey ?? null,
      brandId: line.brandId ?? null,
      brandKey: line.brandKey ?? null,
      sizeType: line.sizeType ?? null,
      sizeValue: line.sizeValue ?? null,
      quantity: line.quantity,
      netAmount: line.netAmount,
      costAmount: line.costAmount,
      discountAmount: line.discountAmount,
      isMarkdown: line.isMarkdown,
      isReturn: line.isReturn,
    })),
  };
}
