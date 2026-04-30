import { PrismaClient } from '../../prismaClient';

export interface MfaFactorSummary {
  id: string;
  userId: string;
  factorType: string;
  label: string | null;
  active: boolean;
  verifiedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

interface MfaFactorRow {
  id: string;
  user_id: string;
  factor_type: string;
  label: string | null;
  active: boolean;
  verified_at: Date | null;
  created_at: Date;
  revoked_at: Date | null;
}

function rowToFactor(row: MfaFactorRow): MfaFactorSummary {
  return {
    id: row.id,
    userId: row.user_id,
    factorType: row.factor_type,
    label: row.label,
    active: row.active,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() ?? null,
  };
}

export async function listMfaFactors(
  prisma: PrismaClient,
  userId: string,
): Promise<MfaFactorSummary[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<MfaFactorRow[]>(
      `
        SELECT id, user_id, factor_type, label, active, verified_at, created_at, revoked_at
        FROM public.identity_mfa_factor
        WHERE user_id = $1
        ORDER BY active DESC, created_at DESC
      `,
      userId,
    );
    return rows.map(rowToFactor);
  } catch {
    return [];
  }
}

export async function revokeMfaFactor(
  prisma: PrismaClient,
  input: { userId: string; factorId: string },
): Promise<MfaFactorSummary | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<MfaFactorRow[]>(
      `
        UPDATE public.identity_mfa_factor
        SET active = false,
            revoked_at = COALESCE(revoked_at, now())
        WHERE id = $1
          AND user_id = $2
          AND revoked_at IS NULL
        RETURNING id, user_id, factor_type, label, active, verified_at, created_at, revoked_at
      `,
      input.factorId,
      input.userId,
    );
    return rows[0] ? rowToFactor(rows[0]) : null;
  } catch {
    return null;
  }
}
