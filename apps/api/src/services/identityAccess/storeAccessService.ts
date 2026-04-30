import { PrismaClient } from '../../prismaClient';
import { listActiveStoreScopes, type StoreScope } from './storeScopeService';

export interface StoreAccessSummary {
  allStores: boolean;
  storeIds: string[];
  scopes: StoreScope[];
}

export function storeScopeAllowsStore(scope: Pick<StoreScope, 'scopeType' | 'scopeId'>, storeId: number | string): boolean {
  const normalizedStoreId = String(storeId);
  const scopeType = scope.scopeType.toUpperCase();

  if (scopeType === 'ALL_STORES') return true;
  if (scopeType === 'STORE') return scope.scopeId === normalizedStoreId;
  return false;
}

export async function canAccessStore(
  prisma: PrismaClient,
  userId: string,
  storeId: number | string,
): Promise<boolean> {
  const access = await getStoreAccessSummary(prisma, userId);
  return storeAccessSummaryAllowsStore(access, storeId);
}

export function storeAccessSummaryAllowsStore(
  access: Pick<StoreAccessSummary, 'allStores' | 'storeIds'>,
  storeId: number | string,
): boolean {
  if (access.allStores) return true;
  return access.storeIds.includes(String(storeId));
}

export async function getStoreAccessSummary(
  prisma: PrismaClient,
  userId: string,
): Promise<StoreAccessSummary> {
  const scopes = await listActiveStoreScopes(prisma, userId);
  const allStores = scopes.some((scope) => scope.scopeType.toUpperCase() === 'ALL_STORES');
  const storeIds = scopes
    .filter((scope) => scope.scopeType.toUpperCase() === 'STORE' && scope.scopeId)
    .map((scope) => String(scope.scopeId));
  return {
    allStores,
    storeIds: Array.from(new Set(storeIds)),
    scopes,
  };
}
