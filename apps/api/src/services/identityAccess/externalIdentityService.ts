import { PrismaClient } from '../../prismaClient';

export interface ExternalIdentitySummary {
  id: string;
  userId: string;
  provider: string;
  providerSubject: string;
  emailAtProvider: string | null;
  createdAt: string;
  lastAuthenticatedAt: string | null;
}

interface ExternalIdentityRow {
  id: string;
  user_id: string;
  provider: string;
  provider_subject: string;
  email_at_provider: string | null;
  created_at: Date;
  last_authenticated_at: Date | null;
}

function rowToExternalIdentity(row: ExternalIdentityRow): ExternalIdentitySummary {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    providerSubject: row.provider_subject,
    emailAtProvider: row.email_at_provider,
    createdAt: row.created_at.toISOString(),
    lastAuthenticatedAt: row.last_authenticated_at?.toISOString() ?? null,
  };
}

export async function listExternalIdentities(
  prisma: PrismaClient,
  userId: string,
): Promise<ExternalIdentitySummary[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<ExternalIdentityRow[]>(
      `
        SELECT id, user_id, provider, provider_subject, email_at_provider, created_at, last_authenticated_at
        FROM public.identity_external_identity
        WHERE user_id = $1
        ORDER BY provider ASC, created_at DESC
      `,
      userId,
    );
    return rows.map(rowToExternalIdentity);
  } catch {
    return [];
  }
}

export async function unlinkExternalIdentity(
  prisma: PrismaClient,
  input: { userId: string; externalIdentityId: string },
): Promise<ExternalIdentitySummary | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<ExternalIdentityRow[]>(
      `
        DELETE FROM public.identity_external_identity
        WHERE id = $1
          AND user_id = $2
        RETURNING id, user_id, provider, provider_subject, email_at_provider, created_at, last_authenticated_at
      `,
      input.externalIdentityId,
      input.userId,
    );
    return rows[0] ? rowToExternalIdentity(rows[0]) : null;
  } catch {
    return null;
  }
}
