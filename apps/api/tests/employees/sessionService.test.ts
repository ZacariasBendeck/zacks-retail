import { PrismaClient } from '../../src/prismaClient';
import {
  createSession,
  findActiveSession,
  revokeSession,
} from '../../src/services/employees/sessionService';
import { hashPassword } from '../../src/services/employees/passwordHash';

const prisma = new PrismaClient();

async function seedUser() {
  const role = await prisma.role.create({
    data: { name: `TEST_ROLE_${Date.now()}_${Math.random()}`, permissions: [] },
  });
  return prisma.user.create({
    data: {
      email: `test-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: await hashPassword('x'),
      displayName: 'Test User',
      roleId: role.id,
    },
  });
}

describe('sessionService', () => {
  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email: { startsWith: 'test-' } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'test-' } } });
    await prisma.role.deleteMany({ where: { name: { startsWith: 'TEST_ROLE_' } } });
    await prisma.$disconnect();
  });

  it('creates a session and finds it by id', async () => {
    const user = await seedUser();
    const { id, expiresAt } = await createSession(prisma, user.id);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const found = await findActiveSession(prisma, id);
    expect(found?.userId).toBe(user.id);
  });

  it('returns null for an unknown session id', async () => {
    const found = await findActiveSession(prisma, '00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('returns null for an expired session', async () => {
    const user = await seedUser();
    const { id } = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const found = await findActiveSession(prisma, id);
    expect(found).toBeNull();
  });

  it('revokes a session', async () => {
    const user = await seedUser();
    const { id } = await createSession(prisma, user.id);
    await revokeSession(prisma, id);
    const found = await findActiveSession(prisma, id);
    expect(found).toBeNull();
  });
});


