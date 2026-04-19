import { PrismaClient, User } from '@prisma/client';
import { hashPassword, verifyPassword } from './passwordHash';

export interface CreateUserInput {
  email: string;
  displayName: string;
  password: string;
  roleId: string;
  ricsUserId?: string | null;
  salespersonCode?: string | null;
  active?: boolean;
}

export interface UpdateUserInput {
  email?: string;
  displayName?: string;
  roleId?: string;
  active?: boolean;
  ricsUserId?: string | null;
  salespersonCode?: string | null;
}

export async function createUser(prisma: PrismaClient, input: CreateUserInput): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  return prisma.user.create({
    data: {
      email: input.email.toLowerCase().trim(),
      displayName: input.displayName.trim(),
      passwordHash,
      roleId: input.roleId,
      ricsUserId: input.ricsUserId ?? null,
      salespersonCode: input.salespersonCode ?? null,
      active: input.active ?? true,
    },
  });
}

export async function updateUser(
  prisma: PrismaClient,
  id: string,
  input: UpdateUserInput,
): Promise<User> {
  return prisma.user.update({
    where: { id },
    data: {
      ...(input.email !== undefined ? { email: input.email.toLowerCase().trim() } : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
      ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.ricsUserId !== undefined ? { ricsUserId: input.ricsUserId } : {}),
      ...(input.salespersonCode !== undefined ? { salespersonCode: input.salespersonCode } : {}),
    },
  });
}

export async function deleteUser(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.user.delete({ where: { id } });
}

export async function changePassword(
  prisma: PrismaClient,
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; reason: 'wrong-password' }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, reason: 'wrong-password' };
  const ok = await verifyPassword(oldPassword, user.passwordHash);
  if (!ok) return { ok: false, reason: 'wrong-password' };
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { ok: true };
}

export async function authenticate(
  prisma: PrismaClient,
  email: string,
  password: string,
): Promise<User | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  if (!user || !user.active) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  return user;
}
