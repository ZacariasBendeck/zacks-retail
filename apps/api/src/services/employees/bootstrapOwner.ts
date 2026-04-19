import { PrismaClient } from '@prisma/client';
import { ROLE_CATALOG, ROLE_NAMES } from './roleCatalog';
import { hashPassword } from './passwordHash';

export async function bootstrapOwner(prisma: PrismaClient): Promise<void> {
  // 1. Upsert all seed roles.
  for (const name of ROLE_NAMES) {
    await prisma.role.upsert({
      where: { name },
      update: { permissions: [...ROLE_CATALOG[name].permissions] },
      create: { name, permissions: [...ROLE_CATALOG[name].permissions] },
    });
  }

  // 2. If any user exists, skip OWNER seeding — someone's already managing users.
  const count = await prisma.user.count();
  if (count > 0) return;

  const email = process.env.AUTH_OWNER_EMAIL;
  const password = process.env.AUTH_OWNER_PASSWORD;
  if (!email || !password) {
    console.warn(
      '[bootstrapOwner] No users exist and AUTH_OWNER_EMAIL / AUTH_OWNER_PASSWORD not set. Skipping OWNER seed.',
    );
    return;
  }

  const ownerRole = await prisma.role.findUnique({ where: { name: 'OWNER' } });
  if (!ownerRole) throw new Error('OWNER role missing after upsert');

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      email: email.toLowerCase().trim(),
      passwordHash,
      displayName: process.env.AUTH_OWNER_NAME || 'Owner',
      roleId: ownerRole.id,
    },
  });
  console.log(`[bootstrapOwner] Seeded OWNER user ${email}`);
}
