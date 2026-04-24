import { PrismaClient, User } from '../../prismaClient';
import { CreateUserInput, UpdateUserInput, createUser, updateUser } from './userService';

export class EmployeeNotFoundError extends Error {
  code = 'EMPLOYEE_NOT_FOUND' as const;

  constructor(message = 'Employee not found') {
    super(message);
    this.name = 'EmployeeNotFoundError';
  }
}

async function requireEmployee(prisma: PrismaClient, id: string): Promise<User> {
  const employee = await prisma.user.findFirst({
    where: { id, isEmployee: true },
  });
  if (!employee) {
    throw new EmployeeNotFoundError();
  }
  return employee;
}

export async function listEmployees(prisma: PrismaClient): Promise<User[]> {
  return prisma.user.findMany({
    where: { isEmployee: true },
    include: { role: true },
    orderBy: [{ salespersonCode: 'asc' }, { displayName: 'asc' }],
  });
}

export async function getEmployee(prisma: PrismaClient, id: string): Promise<User> {
  await requireEmployee(prisma, id);
  return prisma.user.findFirstOrThrow({
    where: { id, isEmployee: true },
    include: { role: true },
  });
}

export async function createEmployee(prisma: PrismaClient, input: CreateUserInput): Promise<User> {
  const employee = await createUser(prisma, {
    ...input,
    isEmployee: true,
  });
  return getEmployee(prisma, employee.id);
}

export async function updateEmployee(
  prisma: PrismaClient,
  id: string,
  input: UpdateUserInput,
): Promise<User> {
  await requireEmployee(prisma, id);
  await updateUser(prisma, id, {
    ...input,
    isEmployee: true,
  });
  return getEmployee(prisma, id);
}

export async function deactivateEmployee(prisma: PrismaClient, id: string): Promise<User> {
  await requireEmployee(prisma, id);
  return updateEmployee(prisma, id, {
    active: false,
    terminatedAt: new Date(),
  });
}

export async function reactivateEmployee(prisma: PrismaClient, id: string): Promise<User> {
  await requireEmployee(prisma, id);
  return updateEmployee(prisma, id, {
    active: true,
    terminatedAt: null,
  });
}


