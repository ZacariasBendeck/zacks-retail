import { prisma } from '../../db/prisma';
import { computeFullMetrics, CustomerMetricsDto } from './computeFullMetrics';

export type CustomerTransactionItemInput = {
  skuId?: string | null;
  categoryId?: string | null;
  categoryKey?: string | null;
  brandId?: string | null;
  brandKey?: string | null;
  sizeType?: string | null;
  sizeValue?: string | null;
  quantity: number;
  netAmount: number;
  costAmount?: number;
  discountAmount?: number;
  isMarkdown?: boolean;
  isReturn?: boolean;
};

export type CustomerTransactionInput = {
  customerId: string;
  externalTransactionId?: string | null;
  source?: string;
  transactionKind?: 'purchase' | 'return';
  status?: 'completed' | 'cancelled' | 'refunded';
  storeId?: number | null;
  channel: 'store' | 'online';
  promotionCode?: string | null;
  couponCode?: string | null;
  totalAmount: number;
  netAmount: number;
  costAmount?: number;
  discountAmount?: number;
  purchasedAt: Date | string;
  items?: CustomerTransactionItemInput[];
};

export async function computeIncremental(customerId: string): Promise<CustomerMetricsDto> {
  return computeFullMetrics(customerId);
}

export async function recordTransactionAndRefreshMetrics(
  input: CustomerTransactionInput,
): Promise<CustomerMetricsDto> {
  const purchasedAt = input.purchasedAt instanceof Date ? input.purchasedAt : new Date(input.purchasedAt);

  const customer = await prisma.customerIntelligenceCustomer.findUnique({
    where: { id: input.customerId },
    select: { id: true },
  });
  if (!customer) {
    throw new Error('CUSTOMER_NOT_FOUND');
  }

  await prisma.customerTransactionFact.create({
    data: {
      customerId: input.customerId,
      externalTransactionId: input.externalTransactionId ?? null,
      source: input.source ?? 'api',
      transactionKind: input.transactionKind ?? 'purchase',
      status: input.status ?? 'completed',
      storeId: input.storeId ?? null,
      channel: input.channel,
      promotionCode: input.promotionCode ?? null,
      couponCode: input.couponCode ?? null,
      totalAmount: input.totalAmount,
      netAmount: input.netAmount,
      costAmount: input.costAmount ?? 0,
      discountAmount: input.discountAmount ?? 0,
      purchasedAt,
      items:
        input.items && input.items.length > 0
          ? {
              create: input.items.map((item) => ({
                skuId: item.skuId ?? null,
                categoryId: item.categoryId ?? null,
                categoryKey: item.categoryKey ?? null,
                brandId: item.brandId ?? null,
                brandKey: item.brandKey ?? null,
                sizeType: item.sizeType ?? null,
                sizeValue: item.sizeValue ?? null,
                quantity: item.quantity,
                netAmount: item.netAmount,
                costAmount: item.costAmount ?? 0,
                discountAmount: item.discountAmount ?? 0,
                isMarkdown: item.isMarkdown ?? false,
                isReturn: item.isReturn ?? false,
              })),
            }
          : undefined,
    },
  });

  return computeIncremental(input.customerId);
}
