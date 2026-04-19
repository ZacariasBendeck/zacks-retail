import { PrismaClient, Session } from '@prisma/client';

function ttlHours(): number {
  const raw = process.env.AUTH_SESSION_TTL_HOURS;
  const n = raw ? Number.parseInt(raw, 10) : 12;
  return Number.isFinite(n) && n > 0 ? n : 12;
}

export async function createSession(
  prisma: PrismaClient,
  userId: string,
): Promise<Session> {
  const expiresAt = new Date(Date.now() + ttlHours() * 60 * 60 * 1000);
  return prisma.session.create({ data: { userId, expiresAt } });
}

export async function findActiveSession(
  prisma: PrismaClient,
  sessionId: string,
): Promise<Session | null> {
  const s = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!s) return null;
  if (s.expiresAt.getTime() <= Date.now()) return null;
  return s;
}

export async function revokeSession(
  prisma: PrismaClient,
  sessionId: string,
): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}
