import type { Request, Response } from 'express';
import type { PrismaClient } from '../prismaClient';
import {
  getStoreAccessSummary,
  storeAccessSummaryAllowsStore,
} from '../services/identityAccess/storeAccessService';

export interface StoreScopeConstraint {
  allStores: boolean;
  storeIds: number[];
}

export function sendStoreScopeForbidden(res: Response, storeId?: number | null): void {
  res.status(403).json({
    error: {
      code: 'STORE_SCOPE_FORBIDDEN',
      message: storeId ? `User cannot access store ${storeId}.` : 'User does not have an allowed store scope.',
    },
  });
}

function unauthorized(res: Response): void {
  res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } });
}

function normalizeStoreIds(values: readonly string[]): number[] {
  return values
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);
}

export async function requireRequestStoreScope(
  prisma: PrismaClient,
  req: Request,
  res: Response,
  storeId: number,
): Promise<boolean> {
  if (!req.user) {
    unauthorized(res);
    return false;
  }

  const access = await getStoreAccessSummary(prisma, req.user.id);
  if (storeAccessSummaryAllowsStore(access, storeId)) return true;

  sendStoreScopeForbidden(res, storeId);
  return false;
}

export async function getRequestStoreScopeConstraint(
  prisma: PrismaClient,
  req: Request,
  res: Response,
  requestedStoreIds: number[] = [],
): Promise<StoreScopeConstraint | null> {
  if (!req.user) {
    unauthorized(res);
    return null;
  }

  const access = await getStoreAccessSummary(prisma, req.user.id);

  for (const storeId of requestedStoreIds) {
    if (!storeAccessSummaryAllowsStore(access, storeId)) {
      sendStoreScopeForbidden(res, storeId);
      return null;
    }
  }

  if (access.allStores) {
    return { allStores: true, storeIds: [] };
  }

  const storeIds = normalizeStoreIds(access.storeIds);
  if (storeIds.length === 0) {
    sendStoreScopeForbidden(res, null);
    return null;
  }

  return { allStores: false, storeIds };
}

export async function getRequestStoreScopeConstraintIfAuthenticated(
  prisma: PrismaClient,
  req: Request,
  res: Response,
  requestedStoreIds: number[] = [],
): Promise<StoreScopeConstraint | null | undefined> {
  if (!req.user) return undefined;
  return getRequestStoreScopeConstraint(prisma, req, res, requestedStoreIds);
}
