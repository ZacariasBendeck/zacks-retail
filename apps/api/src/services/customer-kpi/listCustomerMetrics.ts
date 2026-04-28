import { Prisma } from '../../prismaClient';
import { prisma } from '../../db/prisma';
import {
  listCustomerStoreContexts,
  matchesStoreCityFilter,
  parseRetailChainKey,
  type CustomerStoreContext,
} from './storeMetadata';

export type CustomerKpiSegment =
  | 'vip'
  | 'loyal'
  | 'at_risk'
  | 'dormant'
  | 'promo_sensitive'
  | 'omnichannel'
  | 'new'
  | 'lost';

export type CustomerKpiListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  churnRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
  segment?: CustomerKpiSegment;
  channel?: 'store' | 'online' | 'omnichannel';
  minLtv?: number;
  maxLtv?: number;
  minRecency?: number;
  maxRecency?: number;
  minDiscountRatio?: number;
  primaryStoreId?: string;
  primaryStoreCity?: string;
  primaryStoreChain?: string;
  active?: boolean;
  dormant?: boolean;
  sort?:
    | 'lifetimeValue'
    | 'totalOrders'
    | 'avgOrderValue'
    | 'recencyDays'
    | 'discountRatio'
    | 'lastPurchaseDate'
    | 'displayName';
  order?: 'asc' | 'desc';
};

export type CustomerKpiListRow = {
  customerId: string;
  accountNumber: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  primaryStoreId: string | null;
  primaryStoreName: string | null;
  primaryStoreCity: string | null;
  primaryStoreChain: string | null;
  lifetimeValue: number;
  totalOrders: number;
  avgOrderValue: number;
  marginValue: number;
  orders30d: number;
  orders90d: number;
  orders365d: number;
  avgDaysBetweenOrders: number | null;
  lastPurchaseDate: string | null;
  recencyDays: number | null;
  isActive: boolean;
  isDormant: boolean;
  discountRatio: number | null;
  storeLoyaltyRatio: number | null;
  onlineRatio: number | null;
  churnRisk: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  rScore: number | null;
  fScore: number | null;
  mScore: number | null;
  segment: CustomerKpiSegment | 'other';
};

export type CustomerKpiListEnvelope = {
  data: CustomerKpiListRow[];
  summary: {
    customerCount: number;
    totalLifetimeValue: number;
    totalOrders: number;
    avgLifetimeValue: number;
    avgOrderValue: number;
    avgRecencyDays: number | null;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export async function listCustomerMetrics(
  params: CustomerKpiListParams,
): Promise<CustomerKpiListEnvelope> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));
  const storeContexts = await listCustomerStoreContexts();
  const storeContextById = new Map<number, CustomerStoreContext>(
    storeContexts.map((context) => [context.storeId, context]),
  );

  const where: Prisma.CustomerMetricsWhereInput = {};
  if (params.churnRisk) where.churnRisk = params.churnRisk;
  if (params.minLtv != null) where.lifetimeValue = { ...(where.lifetimeValue as object | undefined), gte: params.minLtv };
  if (params.maxLtv != null) where.lifetimeValue = { ...(where.lifetimeValue as object | undefined), lte: params.maxLtv };
  if (params.minRecency != null) where.recencyDays = { ...(where.recencyDays as object | undefined), gte: params.minRecency };
  if (params.maxRecency != null) where.recencyDays = { ...(where.recencyDays as object | undefined), lte: params.maxRecency };
  if (params.minDiscountRatio != null) where.discountRatio = { gte: params.minDiscountRatio };
  const matchedStoreIds = resolveMatchedStoreIds(storeContexts, params);
  if (matchedStoreIds != null && matchedStoreIds.length === 0) {
    return {
      data: [],
      summary: emptySummary(),
      pagination: {
        page,
        pageSize,
        totalItems: 0,
        totalPages: 1,
      },
    };
  }
  if (matchedStoreIds != null) {
    where.primaryStoreId =
      matchedStoreIds.length === 1 ? matchedStoreIds[0] : { in: matchedStoreIds };
  }
  if (params.active != null) where.isActive = params.active;
  if (params.dormant != null) where.isDormant = params.dormant;
  if (params.channel === 'store') where.onlineRatio = { equals: 0 };
  else if (params.channel === 'online') where.onlineRatio = { gte: 1 };
  else if (params.channel === 'omnichannel') where.onlineRatio = { gt: 0, lt: 1 };

  // Segment filter — translates to RFM/score predicates where possible.
  if (params.segment) {
    Object.assign(where, segmentToWhere(params.segment));
  }

  // Customer-side filters (q search, etc.) — we filter on the related customer.
  const customerFilter: Prisma.CustomerIntelligenceCustomerWhereInput = {};
  if (params.q && params.q.trim().length > 0) {
    const q = params.q.trim();
    customerFilter.OR = [
      { fullName: { contains: q, mode: 'insensitive' } },
      { ricsAccount: { contains: q, mode: 'insensitive' } },
      { ricsCode: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (Object.keys(customerFilter).length > 0) {
    where.customer = customerFilter;
  }

  const orderBy = buildOrderBy(params.sort, params.order);

  const [aggregate, rows] = await Promise.all([
    prisma.customerMetrics.aggregate({
      where,
      _count: { _all: true },
      _sum: {
        lifetimeValue: true,
        totalOrders: true,
      },
      _avg: {
        lifetimeValue: true,
        avgOrderValue: true,
        recencyDays: true,
      },
    }),
    prisma.customerMetrics.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            ricsAccount: true,
            ricsCode: true,
            contacts: {
              select: { contactType: true, value: true, isPrimary: true },
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
    }),
  ]);

  const data: CustomerKpiListRow[] = rows.map((row) => {
    const email =
      row.customer.contacts.find((c) => c.contactType === 'email')?.value ?? null;
    const phone =
      row.customer.contacts.find((c) => c.contactType === 'phone')?.value ?? null;
    return {
      customerId: row.customerId,
      accountNumber: row.customer.ricsAccount ?? row.customer.ricsCode ?? null,
      displayName:
        row.customer.fullName ??
        row.customer.ricsAccount ??
        row.customer.ricsCode ??
        'Unknown Customer',
      email,
      phone,
      primaryStoreId: row.primaryStoreId == null ? null : String(row.primaryStoreId),
      primaryStoreName:
        row.primaryStoreId == null
          ? null
          : storeContextById.get(row.primaryStoreId)?.storeName ?? `Store ${row.primaryStoreId}`,
      primaryStoreCity:
        row.primaryStoreId == null
          ? null
          : storeContextById.get(row.primaryStoreId)?.cityLabel ?? null,
      primaryStoreChain:
        row.primaryStoreId == null
          ? null
          : storeContextById.get(row.primaryStoreId)?.chainLabel ?? null,
      lifetimeValue: toNumber(row.lifetimeValue),
      totalOrders: row.totalOrders,
      avgOrderValue: toNumber(row.avgOrderValue),
      marginValue: toNumber(row.marginValue),
      orders30d: row.orders30d,
      orders90d: row.orders90d,
      orders365d: row.orders365d,
      avgDaysBetweenOrders:
        row.avgDaysBetweenOrders == null ? null : toNumber(row.avgDaysBetweenOrders),
      lastPurchaseDate: row.lastPurchaseDate?.toISOString() ?? null,
      recencyDays: row.recencyDays,
      isActive: row.isActive,
      isDormant: row.isDormant,
      discountRatio: row.discountRatio == null ? null : toNumber(row.discountRatio),
      storeLoyaltyRatio:
        row.storeLoyaltyRatio == null ? null : toNumber(row.storeLoyaltyRatio),
      onlineRatio: row.onlineRatio == null ? null : toNumber(row.onlineRatio),
      churnRisk: row.churnRisk as 'LOW' | 'MEDIUM' | 'HIGH' | null,
      rScore: row.rScore,
      fScore: row.fScore,
      mScore: row.mScore,
      segment: classifySegment({
        churnRisk: row.churnRisk as 'LOW' | 'MEDIUM' | 'HIGH' | null,
        isDormant: row.isDormant,
        rScore: row.rScore,
        fScore: row.fScore,
        mScore: row.mScore,
        onlineRatio: row.onlineRatio == null ? null : toNumber(row.onlineRatio),
        discountRatio: row.discountRatio == null ? null : toNumber(row.discountRatio),
      }),
    };
  });

  const totalItems = aggregate._count._all ?? 0;
  const summary = {
    customerCount: totalItems,
    totalLifetimeValue: toNumber(aggregate._sum.lifetimeValue),
    totalOrders: aggregate._sum.totalOrders ?? 0,
    avgLifetimeValue: toNumber(aggregate._avg.lifetimeValue),
    avgOrderValue: toNumber(aggregate._avg.avgOrderValue),
    avgRecencyDays:
      aggregate._avg.recencyDays == null ? null : roundNumber(toNumber(aggregate._avg.recencyDays), 1),
  };

  return {
    data,
    summary,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  };
}

function buildOrderBy(
  sort: CustomerKpiListParams['sort'],
  order: CustomerKpiListParams['order'],
): Prisma.CustomerMetricsOrderByWithRelationInput {
  const dir = order === 'asc' ? 'asc' : 'desc';
  switch (sort) {
    case 'totalOrders':
      return { totalOrders: dir };
    case 'avgOrderValue':
      return { avgOrderValue: dir };
    case 'recencyDays':
      return { recencyDays: dir };
    case 'discountRatio':
      return { discountRatio: dir };
    case 'lastPurchaseDate':
      return { lastPurchaseDate: dir };
    case 'displayName':
      return { customer: { fullName: dir } };
    case 'lifetimeValue':
    default:
      return { lifetimeValue: dir };
  }
}

function segmentToWhere(segment: CustomerKpiSegment): Prisma.CustomerMetricsWhereInput {
  switch (segment) {
    case 'vip':
      return { rScore: { gte: 4 }, fScore: { gte: 4 }, mScore: { gte: 4 } };
    case 'loyal':
      return { fScore: { gte: 4 }, mScore: { gte: 3 } };
    case 'new':
      return { rScore: { gte: 4 }, fScore: { lte: 2 } };
    case 'at_risk':
      return { churnRisk: 'HIGH', mScore: { gte: 3 } };
    case 'lost':
      return { rScore: { lte: 2 }, fScore: { lte: 2 } };
    case 'dormant':
      return { isDormant: true };
    case 'promo_sensitive':
      return { discountRatio: { gte: 0.5 } };
    case 'omnichannel':
      return { onlineRatio: { gt: 0, lt: 1 } };
    default:
      return {};
  }
}

function classifySegment(input: {
  churnRisk: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  isDormant: boolean;
  rScore: number | null;
  fScore: number | null;
  mScore: number | null;
  onlineRatio: number | null;
  discountRatio: number | null;
}): CustomerKpiSegment | 'other' {
  if (input.isDormant) return 'dormant';
  if (
    (input.rScore ?? 0) >= 5 &&
    (input.fScore ?? 0) >= 5 &&
    (input.mScore ?? 0) >= 5
  ) {
    return 'vip';
  }
  if (input.churnRisk === 'HIGH' && (input.mScore ?? 0) >= 3) return 'at_risk';
  if ((input.discountRatio ?? 0) >= 0.5) return 'promo_sensitive';
  if (
    input.onlineRatio != null &&
    input.onlineRatio > 0 &&
    input.onlineRatio < 1
  ) {
    return 'omnichannel';
  }
  if ((input.fScore ?? 0) >= 4 && (input.mScore ?? 0) >= 3) return 'loyal';
  if ((input.rScore ?? 0) >= 4 && (input.fScore ?? 0) <= 2) return 'new';
  if ((input.rScore ?? 0) <= 2 && (input.fScore ?? 0) <= 2) return 'lost';
  return 'other';
}

function emptySummary(): CustomerKpiListEnvelope['summary'] {
  return {
    customerCount: 0,
    totalLifetimeValue: 0,
    totalOrders: 0,
    avgLifetimeValue: 0,
    avgOrderValue: 0,
    avgRecencyDays: null,
  };
}

function toNumber(value: number | { toNumber(): number } | null | undefined): number {
  if (value == null) return 0;
  return typeof value === 'number' ? value : value.toNumber();
}

function roundNumber(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseStoreId(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function resolveMatchedStoreIds(
  storeContexts: CustomerStoreContext[],
  params: CustomerKpiListParams,
): number[] | null {
  let matchedStoreIds: number[] | null = null;

  const primaryStoreId = parseStoreId(params.primaryStoreId);
  if (primaryStoreId != null) {
    matchedStoreIds = [primaryStoreId];
  }

  const primaryStoreChain = parseRetailChainKey(params.primaryStoreChain);
  if (primaryStoreChain) {
    const chainStoreIds = storeContexts
      .filter((context) => context.chainKey === primaryStoreChain)
      .map((context) => context.storeId);
    matchedStoreIds = intersectStoreIds(matchedStoreIds, chainStoreIds);
  }

  if (params.primaryStoreCity && params.primaryStoreCity.trim() !== '') {
    const cityStoreIds = storeContexts
      .filter((context) => matchesStoreCityFilter(context, params.primaryStoreCity!))
      .map((context) => context.storeId);
    matchedStoreIds = intersectStoreIds(matchedStoreIds, cityStoreIds);
  }

  return matchedStoreIds;
}

function intersectStoreIds(
  left: number[] | null,
  right: number[],
): number[] {
  if (left == null) return [...new Set(right)];
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}
