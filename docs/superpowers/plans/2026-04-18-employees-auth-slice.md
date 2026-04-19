# Employees Module — Auth Slice (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first slice of the `employees` module — web-based password authentication, roles, permissions, permission middleware, user CRUD, and a bootstrapped `OWNER` account — so every other module has an identity to attribute actions to.

**Architecture:** Net-new Postgres tables (`User`, `Role`, `Session`) added to the existing Prisma schema at [apps/api/prisma/schema.prisma](../../../apps/api/prisma/schema.prisma). Passwords hashed with argon2id via `@node-rs/argon2` (prebuilt binary, works on Windows). Sessions are server-side rows with UUID cookies — no JWTs. Permission enforcement happens in an Express middleware at `apps/api/src/middleware/authMiddleware.ts`. Frontend wraps the router in an `AuthContext` that calls `GET /auth/me` on mount; a `<RequireAuth>` element redirects to `/login` when unauthenticated.

**Tech Stack:** Express, Prisma, Postgres, `@node-rs/argon2`, `cookie-parser` (already present), Zod (already present), Jest + Supertest (already present). React, Ant Design, TanStack Query, React Router (all already present).

**Scope clarifications:**
- **NOT in this slice:** MFA/TOTP, password-reset email, employee domain object, time clock, commission overrides, sales-password (POS PIN override) modernization, RICS user import, row-level store scoping beyond coarse role checks.
- **Untouched:** existing RICS-style sales passwords at [apps/api/src/routes/salesPasswordRoutes.ts](../../../apps/api/src/routes/salesPasswordRoutes.ts) continue to work exactly as they do today. The new auth system is additive.
- **Legacy passwords** in `RIPASS.Password` and `RISLSPSN.CashierPassword` are **ignored** for web login. We do not write to the MDBs.

---

## File Structure

### New backend files

| File | Responsibility |
|---|---|
| `apps/api/prisma/migrations/YYYYMMDDHHMMSS_add_auth/migration.sql` | Prisma migration for `User`, `Role`, `Session`. |
| `apps/api/src/services/employees/permissions.ts` | Permission-string enum — the canonical catalog. |
| `apps/api/src/services/employees/roleCatalog.ts` | Role → Permissions mapping for the six seed roles. |
| `apps/api/src/services/employees/passwordHash.ts` | Thin wrapper around `@node-rs/argon2` — `hash()` + `verify()`. |
| `apps/api/src/services/employees/sessionService.ts` | `createSession`, `findActiveSession`, `revokeSession`, `cleanupExpired`. |
| `apps/api/src/services/employees/userService.ts` | CRUD over `User` + role assignment + password change. |
| `apps/api/src/services/employees/bootstrapOwner.ts` | On-startup seeder — creates `OWNER` from env if no users exist. |
| `apps/api/src/middleware/authMiddleware.ts` | `requireAuth` + `requirePermission` + `attachUser` (parses session cookie, loads user). |
| `apps/api/src/routes/authRoutes.ts` | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`. |
| `apps/api/src/routes/userRoutes.ts` | `GET /users`, `POST /users`, `GET /users/:id`, `PATCH /users/:id`, `DELETE /users/:id`. |
| `apps/api/tests/auth.test.ts` | Login, logout, me, change-password integration tests. |
| `apps/api/tests/users.test.ts` | User CRUD + permission enforcement integration tests. |
| `apps/api/tests/employees/permissions.test.ts` | Unit tests for `roleCatalog` mapping. |
| `apps/api/tests/employees/passwordHash.test.ts` | Unit tests for argon2 wrapper. |
| `apps/api/tests/employees/sessionService.test.ts` | Unit tests for session service. |

### Modified backend files

| File | Change |
|---|---|
| [apps/api/prisma/schema.prisma](../../../apps/api/prisma/schema.prisma) | Add `User`, `Role`, `Session` models. |
| [apps/api/src/app.ts](../../../apps/api/src/app.ts) | Add `cookie-parser` middleware, mount `authRoutes` + `userRoutes`, install `attachUser`. |
| [apps/api/src/index.ts](../../../apps/api/src/index.ts) | Call `bootstrapOwner()` before `app.listen`. |
| [apps/api/.env.example](../../../apps/api/.env.example) | Add `AUTH_SESSION_SECRET`, `AUTH_OWNER_EMAIL`, `AUTH_OWNER_PASSWORD`, `AUTH_SESSION_TTL_HOURS`. |
| [apps/api/package.json](../../../apps/api/package.json) | Add `@node-rs/argon2` dependency. |

### New frontend files

| File | Responsibility |
|---|---|
| `apps/web/src/services/authApi.ts` | `login`, `logout`, `me`, `changePassword` API clients. |
| `apps/web/src/services/userApi.ts` | User CRUD clients. |
| `apps/web/src/auth/AuthContext.tsx` | Provider + context shape (`{ user, login, logout, refresh }`). |
| `apps/web/src/auth/useAuth.ts` | `useAuth()` hook. |
| `apps/web/src/auth/RequireAuth.tsx` | Route guard — redirects to `/login` when unauthenticated. |
| `apps/web/src/auth/RequirePermission.tsx` | Route guard — shows 403 when lacking a permission. |
| `apps/web/src/pages/auth/LoginPage.tsx` | Email + password form. |
| `apps/web/src/pages/auth/MePage.tsx` | Shows current user + links to change-password. |
| `apps/web/src/pages/auth/ChangePasswordPage.tsx` | Old password + new password form. |
| `apps/web/src/pages/users/UsersListPage.tsx` | Table of users (OWNER/ADMIN only). |
| `apps/web/src/pages/users/UserFormPage.tsx` | Create + edit user form. |

### Modified frontend files

| File | Change |
|---|---|
| [apps/web/src/App.tsx](../../../apps/web/src/App.tsx) | Wrap `<Routes>` in `<AuthProvider>`; add `/login`, `/me`, `/change-password`, `/admin/users`, `/admin/users/new`, `/admin/users/:id/edit` routes. |
| [apps/web/src/components/AppLayout.tsx](../../../apps/web/src/components/AppLayout.tsx) | Header dropdown: display user name + "Sign out" action. |

---

## Data Model (Prisma)

```prisma
model User {
  id             String    @id @default(uuid())
  email          String    @unique
  passwordHash   String
  displayName    String
  active         Boolean   @default(true)
  // Optional links back to the legacy RICS tables. Both nullable — a net-new
  // user has neither; an imported user has one or both. Not enforced by FK
  // because RICS lives in MDB files, not Postgres.
  ricsUserId     String?   // maps to RIPASS.Users.UserID
  salespersonCode String?  // maps to RISLSPSN.Salespeople.Code
  roleId         String
  role           Role      @relation(fields: [roleId], references: [id])
  sessions       Session[]
  lastLoginAt    DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  @@index([roleId])
}

model Role {
  id          String   @id @default(uuid())
  name        String   @unique
  // Postgres text[] — the permission strings from services/employees/permissions.ts.
  // Simple and diff-friendly; a join table is premature here.
  permissions String[]
  users       User[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Session {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
  @@index([userId])
  @@index([expiresAt])
}
```

The `Session.id` is the value stored in the cookie. Server-side rows mean logout = `DELETE WHERE id = :sessionId`; compromised cookie = revokable.

---

## Permission Catalog (services/employees/permissions.ts)

The seed catalog. Modules add to this as they grow; first slice keeps it minimal and covers existing surfaces.

```ts
// Alphabetized by module prefix. Use string constants — no enum, because
// Role.permissions is stored as String[] and string comparison is simplest.
export const PERMISSIONS = {
  // accounts-receivable (future module)
  AR_POST_PAYMENT:        'accounts_receivable.post_payment',
  AR_VIEW:                'accounts_receivable.view',

  // employees (this module)
  EMPLOYEES_MANAGE:       'employees.manage',
  EMPLOYEES_VIEW:         'employees.view',

  // inventory
  INVENTORY_ADJUST:       'inventory.adjust',
  INVENTORY_VIEW:         'inventory.view',

  // otb-planning
  OTB_EDIT:               'otb.edit',
  OTB_VIEW:               'otb.view',

  // products
  PRODUCTS_WRITE:         'products.write',
  PRODUCTS_VIEW:          'products.view',

  // purchasing
  PURCHASING_APPROVE:     'purchasing.approve',
  PURCHASING_EDIT:        'purchasing.edit',
  PURCHASING_VIEW:        'purchasing.view',

  // reports (cross-cutting)
  REPORTS_VIEW:           'reports.view',

  // sales-pos
  SALES_POS_OPERATE:      'sales_pos.operate',
  SALES_REFUND:           'sales_pos.refund',

  // store-ops
  STORE_OPS_CONFIGURE:    'store_ops.configure',
  STORE_OPS_VIEW:         'store_ops.view',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];
export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);
```

## Role Catalog (services/employees/roleCatalog.ts)

```ts
import { ALL_PERMISSIONS, PERMISSIONS as P } from './permissions';

export const ROLE_CATALOG = {
  OWNER: {
    name: 'OWNER',
    permissions: [...ALL_PERMISSIONS],
  },
  ADMIN: {
    name: 'ADMIN',
    permissions: [
      P.EMPLOYEES_MANAGE, P.EMPLOYEES_VIEW,
      P.STORE_OPS_CONFIGURE, P.STORE_OPS_VIEW,
      P.PRODUCTS_WRITE, P.PRODUCTS_VIEW,
      P.INVENTORY_ADJUST, P.INVENTORY_VIEW,
      P.PURCHASING_VIEW, P.OTB_VIEW, P.AR_VIEW,
      P.REPORTS_VIEW, P.SALES_POS_OPERATE,
    ],
  },
  FINANCE: {
    name: 'FINANCE',
    permissions: [
      P.AR_POST_PAYMENT, P.AR_VIEW,
      P.REPORTS_VIEW, P.STORE_OPS_VIEW,
      P.INVENTORY_VIEW, P.PRODUCTS_VIEW,
    ],
  },
  BUYER: {
    name: 'BUYER',
    permissions: [
      P.PURCHASING_APPROVE, P.PURCHASING_EDIT, P.PURCHASING_VIEW,
      P.OTB_EDIT, P.OTB_VIEW,
      P.PRODUCTS_WRITE, P.PRODUCTS_VIEW,
      P.INVENTORY_VIEW, P.REPORTS_VIEW,
    ],
  },
  MANAGER: {
    name: 'MANAGER',
    permissions: [
      P.SALES_REFUND, P.SALES_POS_OPERATE,
      P.INVENTORY_VIEW, P.INVENTORY_ADJUST,
      P.PRODUCTS_VIEW, P.REPORTS_VIEW,
      P.STORE_OPS_VIEW, P.EMPLOYEES_VIEW,
    ],
  },
  SALESPERSON: {
    name: 'SALESPERSON',
    permissions: [
      P.SALES_POS_OPERATE,
      P.PRODUCTS_VIEW, P.INVENTORY_VIEW,
    ],
  },
} as const;

export type RoleName = keyof typeof ROLE_CATALOG;
export const ROLE_NAMES = Object.keys(ROLE_CATALOG) as RoleName[];
```

---

## Tasks

### Task 1: Add argon2 dependency

**Files:** [apps/api/package.json](../../../apps/api/package.json)

- [ ] **Step 1: Install the package**

Run: `pnpm --filter @benlow-rics/api add @node-rs/argon2@^2.0.2`

Expected: `@node-rs/argon2` appears under `dependencies` in `apps/api/package.json` and a lockfile entry is created.

- [ ] **Step 2: Smoke-test the import**

Run: `cd apps/api && npx tsx -e "require('@node-rs/argon2').hash('hello').then(console.log)"`

Expected: a string starting with `$argon2id$v=19$` prints to stdout.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "feat(employees): add @node-rs/argon2 for password hashing"
```

---

### Task 2: Permission + role catalogs

**Files:**
- Create: `apps/api/src/services/employees/permissions.ts`
- Create: `apps/api/src/services/employees/roleCatalog.ts`
- Test: `apps/api/tests/employees/permissions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/employees/permissions.test.ts`:

```ts
import { ALL_PERMISSIONS, PERMISSIONS } from '../../src/services/employees/permissions';
import { ROLE_CATALOG, ROLE_NAMES } from '../../src/services/employees/roleCatalog';

describe('permission + role catalog', () => {
  it('PERMISSIONS values are unique strings', () => {
    const values = Object.values(PERMISSIONS);
    expect(new Set(values).size).toBe(values.length);
    values.forEach((v) => expect(typeof v).toBe('string'));
  });

  it('OWNER has every permission', () => {
    expect(ROLE_CATALOG.OWNER.permissions.length).toBe(ALL_PERMISSIONS.length);
  });

  it('every role permission exists in the catalog', () => {
    for (const role of ROLE_NAMES) {
      for (const p of ROLE_CATALOG[role].permissions) {
        expect(ALL_PERMISSIONS).toContain(p);
      }
    }
  });

  it('SALESPERSON cannot refund', () => {
    expect(ROLE_CATALOG.SALESPERSON.permissions).not.toContain(PERMISSIONS.SALES_REFUND);
  });

  it('MANAGER can refund', () => {
    expect(ROLE_CATALOG.MANAGER.permissions).toContain(PERMISSIONS.SALES_REFUND);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm jest tests/employees/permissions.test.ts`

Expected: FAIL — cannot find `../../src/services/employees/permissions` module.

- [ ] **Step 3: Write `permissions.ts`**

Copy the `PERMISSIONS` object from the "Permission Catalog" section above into `apps/api/src/services/employees/permissions.ts` verbatim.

- [ ] **Step 4: Write `roleCatalog.ts`**

Copy the `ROLE_CATALOG` object from the "Role Catalog" section above into `apps/api/src/services/employees/roleCatalog.ts` verbatim.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm jest tests/employees/permissions.test.ts`

Expected: all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/employees apps/api/tests/employees/permissions.test.ts
git commit -m "feat(employees): add permission + role catalogs"
```

---

### Task 3: Password hashing wrapper

**Files:**
- Create: `apps/api/src/services/employees/passwordHash.ts`
- Test: `apps/api/tests/employees/passwordHash.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/employees/passwordHash.test.ts`:

```ts
import { hashPassword, verifyPassword } from '../../src/services/employees/passwordHash';

describe('passwordHash', () => {
  it('hash is not the plaintext', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(h).not.toBe('correct horse battery staple');
    expect(h).toMatch(/^\$argon2id\$/);
  });

  it('verify returns true for the right password', async () => {
    const h = await hashPassword('s3cret');
    await expect(verifyPassword('s3cret', h)).resolves.toBe(true);
  });

  it('verify returns false for the wrong password', async () => {
    const h = await hashPassword('s3cret');
    await expect(verifyPassword('wrong', h)).resolves.toBe(false);
  });

  it('verify returns false on malformed hash', async () => {
    await expect(verifyPassword('anything', 'not-a-hash')).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm jest tests/employees/passwordHash.test.ts`

Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/services/employees/passwordHash.ts`:

```ts
import { hash, verify } from '@node-rs/argon2';

// argon2id with library defaults. For this app the defaults (memoryCost=19456,
// timeCost=2, parallelism=1) are appropriate — tuned for ~200ms on a laptop.
export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext);
}

export async function verifyPassword(plaintext: string, stored: string): Promise<boolean> {
  try {
    return await verify(stored, plaintext);
  } catch {
    // Malformed hashes throw; treat as "does not verify" rather than crashing.
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm jest tests/employees/passwordHash.test.ts`

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/employees/passwordHash.ts apps/api/tests/employees/passwordHash.test.ts
git commit -m "feat(employees): add argon2id password hashing wrapper"
```

---

### Task 4: Prisma schema migration for User / Role / Session

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_auth/migration.sql` (generated)

- [ ] **Step 1: Append the three models to `schema.prisma`**

Append to [apps/api/prisma/schema.prisma](../../../apps/api/prisma/schema.prisma):

```prisma
model User {
  id              String    @id @default(uuid())
  email           String    @unique
  passwordHash    String
  displayName     String
  active          Boolean   @default(true)
  ricsUserId      String?
  salespersonCode String?
  roleId          String
  role            Role      @relation(fields: [roleId], references: [id])
  sessions        Session[]
  lastLoginAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([roleId])
}

model Role {
  id          String   @id @default(uuid())
  name        String   @unique
  permissions String[]
  users       User[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Session {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([expiresAt])
}
```

- [ ] **Step 2: Generate the migration**

Run: `cd apps/api && npx prisma migrate dev --name add_auth`

Expected: a new folder `apps/api/prisma/migrations/<timestamp>_add_auth/` with `migration.sql`. Prisma client regenerates. Compose Postgres at port 5433 must be running (see `docker-compose.yml`).

- [ ] **Step 3: Verify the schema in Postgres**

Run: `cd apps/api && npx prisma studio` — open in browser, confirm `User`, `Role`, `Session` tables exist and are empty.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(employees): Prisma migration for User/Role/Session"
```

---

### Task 5: Session service

**Files:**
- Create: `apps/api/src/services/employees/sessionService.ts`
- Test: `apps/api/tests/employees/sessionService.test.ts`

Session TTL defaults to 12 hours (configurable via `AUTH_SESSION_TTL_HOURS`). `createSession` issues a new UUID row; `findActiveSession` returns `null` if expired; `revokeSession` deletes by id; `cleanupExpired` is a maintenance job we can call on bootstrap but not required.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/employees/sessionService.test.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import {
  createSession,
  findActiveSession,
  revokeSession,
} from '../../src/services/employees/sessionService';
import { hashPassword } from '../../src/services/employees/passwordHash';

const prisma = new PrismaClient();

async function seedUser() {
  const role = await prisma.role.create({
    data: { name: `TEST_ROLE_${Date.now()}`, permissions: [] },
  });
  return prisma.user.create({
    data: {
      email: `test-${Date.now()}@example.com`,
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
        expiresAt: new Date(Date.now() - 60_000), // 1 min ago
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm jest tests/employees/sessionService.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/services/employees/sessionService.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm jest tests/employees/sessionService.test.ts`

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/employees/sessionService.ts apps/api/tests/employees/sessionService.test.ts
git commit -m "feat(employees): session service with TTL + revocation"
```

---

### Task 6: User service

**Files:**
- Create: `apps/api/src/services/employees/userService.ts`

This one is small enough to skip a dedicated unit test file — it's exercised through the integration tests in Task 9/10. Just needs to compile correctly.

- [ ] **Step 1: Write the implementation**

Create `apps/api/src/services/employees/userService.ts`:

```ts
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/api && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/employees/userService.ts
git commit -m "feat(employees): user service (create/update/delete/auth/changePassword)"
```

---

### Task 7: Auth middleware

**Files:**
- Create: `apps/api/src/middleware/authMiddleware.ts`

The middleware exports three Express middlewares:
- `attachUser` — reads the `sid` cookie, loads the user + role, attaches `req.user` + `req.permissions`. Runs on every request, never blocks.
- `requireAuth` — rejects with 401 if `req.user` is absent.
- `requirePermission(p)` — rejects with 403 if `req.permissions` doesn't include `p`.

We augment the Express `Request` type via a declaration.

- [ ] **Step 1: Write the implementation**

Create `apps/api/src/middleware/authMiddleware.ts`:

```ts
import { PrismaClient, User } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { findActiveSession } from '../services/employees/sessionService';
import type { Permission } from '../services/employees/permissions';

// Extend Express Request with auth state.
declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
    sessionId?: string;
    permissions?: Set<string>;
  }
}

export const SESSION_COOKIE = 'sid';

export function attachUser(prisma: PrismaClient) {
  return async function (req: Request, _res: Response, next: NextFunction) {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (!sid) return next();
    const session = await findActiveSession(prisma, sid);
    if (!session) return next();
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { role: true },
    });
    if (!user || !user.active) return next();
    req.user = user;
    req.sessionId = session.id;
    req.permissions = new Set(user.role.permissions);
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } });
  }
  next();
}

export function requirePermission(permission: Permission) {
  return function (req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } });
    }
    if (!req.permissions?.has(permission)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: `Missing permission: ${permission}` },
      });
    }
    next();
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/api && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/middleware/authMiddleware.ts
git commit -m "feat(employees): attachUser + requireAuth + requirePermission middleware"
```

---

### Task 8: OWNER bootstrap

**Files:**
- Create: `apps/api/src/services/employees/bootstrapOwner.ts`

On startup, ensure the six seed roles exist and that at least one OWNER user exists. Configured via env:
- `AUTH_OWNER_EMAIL` (required in non-test env)
- `AUTH_OWNER_PASSWORD` (required in non-test env)
- `AUTH_OWNER_NAME` (optional, default `'Owner'`)

Idempotent: safe to call on every boot. If the user table is non-empty, skips user creation. Roles are upserted by name.

- [ ] **Step 1: Write the implementation**

Create `apps/api/src/services/employees/bootstrapOwner.ts`:

```ts
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/api && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/employees/bootstrapOwner.ts
git commit -m "feat(employees): idempotent OWNER bootstrap + role seeding"
```

---

### Task 9: Auth routes (login, logout, me, change-password)

**Files:**
- Create: `apps/api/src/routes/authRoutes.ts`
- Test: `apps/api/tests/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/auth.test.ts`:

```ts
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app';
import { bootstrapOwner } from '../src/services/employees/bootstrapOwner';

const prisma = new PrismaClient();

describe('auth routes', () => {
  const email = `auth-test-${Date.now()}@example.com`;
  const password = 'test-password-123';

  beforeAll(async () => {
    // Seed the roles + a test OWNER.
    process.env.AUTH_OWNER_EMAIL = email;
    process.env.AUTH_OWNER_PASSWORD = password;
    // Make sure no user exists so bootstrap runs.
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email } });
    await bootstrapOwner(prisma);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('POST /auth/login with wrong password returns 401', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('POST /auth/login with right password returns 200 + sets cookie', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.role.name).toBe('OWNER');
    const cookie = res.headers['set-cookie']?.[0];
    expect(cookie).toMatch(/^sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('GET /auth/me without cookie returns 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /auth/me with cookie returns the user', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const cookie = login.headers['set-cookie'][0];
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.permissions).toEqual(expect.arrayContaining(['employees.manage']));
  });

  it('POST /auth/logout clears the session', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const cookie = login.headers['set-cookie'][0];
    const logout = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(logout.status).toBe(204);
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(401);
  });

  it('POST /auth/change-password with wrong old password returns 400', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const cookie = login.headers['set-cookie'][0];
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Cookie', cookie)
      .send({ oldPassword: 'wrong', newPassword: 'new-password-456' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm jest tests/auth.test.ts`

Expected: FAIL — routes not mounted yet.

- [ ] **Step 3: Write the route implementation**

Create `apps/api/src/routes/authRoutes.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, changePassword } from '../services/employees/userService';
import { createSession, revokeSession } from '../services/employees/sessionService';
import { requireAuth, SESSION_COOKIE } from '../middleware/authMiddleware';

export function createAuthRoutes(prisma: PrismaClient): Router {
  const router = Router();

  const loginBody = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  router.post('/login', async (req, res, next) => {
    try {
      const parsed = loginBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }
      const user = await authenticate(prisma, parsed.data.email, parsed.data.password);
      if (!user) {
        return res.status(401).json({
          error: { code: 'INVALID_CREDENTIALS', message: 'Email or password incorrect' },
        });
      }
      const session = await createSession(prisma, user.id);
      res.cookie(SESSION_COOKIE, session.id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        expires: session.expiresAt,
        path: '/',
      });
      const role = await prisma.role.findUnique({ where: { id: user.roleId } });
      res.json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: { id: role!.id, name: role!.name },
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      if (req.sessionId) {
        await revokeSession(prisma, req.sessionId);
      }
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', requireAuth, async (req, res) => {
    const user = req.user!;
    const role = await prisma.role.findUnique({ where: { id: user.roleId } });
    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: { id: role!.id, name: role!.name },
      },
      permissions: Array.from(req.permissions ?? []),
    });
  });

  const changePasswordBody = z.object({
    oldPassword: z.string().min(1),
    newPassword: z.string().min(8),
  });

  router.post('/change-password', requireAuth, async (req, res, next) => {
    try {
      const parsed = changePasswordBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: 'INVALID_BODY', message: parsed.error.message },
        });
      }
      const result = await changePassword(
        prisma,
        req.user!.id,
        parsed.data.oldPassword,
        parsed.data.newPassword,
      );
      if (!result.ok) {
        return res.status(400).json({
          error: { code: 'WRONG_PASSWORD', message: 'Old password does not match' },
        });
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 4: Wire up `app.ts`**

Edit [apps/api/src/app.ts](../../../apps/api/src/app.ts):

1. Add imports at the top:

```ts
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { createAuthRoutes } from './routes/authRoutes';
import { attachUser } from './middleware/authMiddleware';
```

2. After `app.use(express.json());` add:

```ts
app.use(cookieParser());
const prisma = new PrismaClient();
app.use(attachUser(prisma));
```

3. In the routes block, add:

```ts
// auth module
app.use('/api/v1/auth', createAuthRoutes(prisma));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm jest tests/auth.test.ts`

Expected: all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/authRoutes.ts apps/api/src/app.ts apps/api/tests/auth.test.ts
git commit -m "feat(employees): login/logout/me/change-password endpoints"
```

---

### Task 10: User CRUD routes

**Files:**
- Create: `apps/api/src/routes/userRoutes.ts`
- Test: `apps/api/tests/users.test.ts`

All endpoints require `employees.manage` permission except `GET /users/:id` which allows `employees.view`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/users.test.ts`:

```ts
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app';
import { bootstrapOwner } from '../src/services/employees/bootstrapOwner';

const prisma = new PrismaClient();
const OWNER_EMAIL = `user-crud-${Date.now()}@example.com`;
const OWNER_PASSWORD = 'owner-password-123';

async function ownerCookie(): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
  return res.headers['set-cookie'][0];
}

describe('user CRUD routes', () => {
  beforeAll(async () => {
    process.env.AUTH_OWNER_EMAIL = OWNER_EMAIL;
    process.env.AUTH_OWNER_PASSWORD = OWNER_PASSWORD;
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: { contains: 'user-crud-' } } });
    await bootstrapOwner(prisma);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: { contains: 'user-crud-' } } });
    await prisma.$disconnect();
  });

  it('GET /users without auth returns 401', async () => {
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  it('POST /users creates a user', async () => {
    const cookie = await ownerCookie();
    const salesperson = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });
    const res = await request(app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({
        email: `user-crud-new-${Date.now()}@example.com`,
        displayName: 'New User',
        password: 'new-user-pw-12345',
        roleId: salesperson!.id,
      });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toMatch(/user-crud-new-/);
  });

  it('GET /users returns a list', async () => {
    const cookie = await ownerCookie();
    const res = await request(app).get('/api/v1/users').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThan(0);
    // Never leak passwordHash.
    for (const u of res.body.users) expect(u.passwordHash).toBeUndefined();
  });

  it('PATCH /users/:id updates displayName', async () => {
    const cookie = await ownerCookie();
    const existing = (await request(app).get('/api/v1/users').set('Cookie', cookie)).body
      .users[0];
    const res = await request(app)
      .patch(`/api/v1/users/${existing.id}`)
      .set('Cookie', cookie)
      .send({ displayName: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('Renamed');
  });

  it('DELETE /users/:id removes the user', async () => {
    const cookie = await ownerCookie();
    const salesperson = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });
    const create = await request(app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({
        email: `user-crud-delete-${Date.now()}@example.com`,
        displayName: 'Delete Me',
        password: 'delete-me-pw-12345',
        roleId: salesperson!.id,
      });
    const id = create.body.user.id;
    const del = await request(app).delete(`/api/v1/users/${id}`).set('Cookie', cookie);
    expect(del.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm jest tests/users.test.ts`

Expected: FAIL — routes not mounted.

- [ ] **Step 3: Write the route implementation**

Create `apps/api/src/routes/userRoutes.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { createUser, updateUser, deleteUser } from '../services/employees/userService';
import { requirePermission } from '../middleware/authMiddleware';
import { PERMISSIONS } from '../services/employees/permissions';

function sanitize(u: any) {
  const { passwordHash, ...rest } = u;
  return rest;
}

export function createUserRoutes(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/', requirePermission(PERMISSIONS.EMPLOYEES_VIEW), async (_req, res, next) => {
    try {
      const users = await prisma.user.findMany({
        include: { role: true },
        orderBy: { createdAt: 'asc' },
      });
      res.json({ users: users.map(sanitize) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', requirePermission(PERMISSIONS.EMPLOYEES_VIEW), async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: { role: true },
      });
      if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
      res.json({ user: sanitize(user) });
    } catch (err) {
      next(err);
    }
  });

  const createBody = z.object({
    email: z.string().email(),
    displayName: z.string().min(1),
    password: z.string().min(8),
    roleId: z.string().uuid(),
    ricsUserId: z.string().optional().nullable(),
    salespersonCode: z.string().optional().nullable(),
    active: z.boolean().optional(),
  });

  router.post('/', requirePermission(PERMISSIONS.EMPLOYEES_MANAGE), async (req, res, next) => {
    try {
      const parsed = createBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
      }
      const user = await createUser(prisma, parsed.data);
      const withRole = await prisma.user.findUnique({
        where: { id: user.id },
        include: { role: true },
      });
      res.status(201).json({ user: sanitize(withRole) });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'Email already in use' } });
      }
      next(err);
    }
  });

  const patchBody = z.object({
    email: z.string().email().optional(),
    displayName: z.string().min(1).optional(),
    roleId: z.string().uuid().optional(),
    active: z.boolean().optional(),
    ricsUserId: z.string().nullable().optional(),
    salespersonCode: z.string().nullable().optional(),
  });

  router.patch('/:id', requirePermission(PERMISSIONS.EMPLOYEES_MANAGE), async (req, res, next) => {
    try {
      const parsed = patchBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { code: 'INVALID_BODY', message: parsed.error.message } });
      }
      await updateUser(prisma, req.params.id, parsed.data);
      const withRole = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: { role: true },
      });
      res.json({ user: sanitize(withRole) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', requirePermission(PERMISSIONS.EMPLOYEES_MANAGE), async (req, res, next) => {
    try {
      // Prevent deleting yourself.
      if (req.user?.id === req.params.id) {
        return res.status(400).json({ error: { code: 'CANNOT_DELETE_SELF' } });
      }
      await deleteUser(prisma, req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // Roles list — needed by the frontend create/edit forms.
  router.get('/_meta/roles', requirePermission(PERMISSIONS.EMPLOYEES_VIEW), async (_req, res, next) => {
    try {
      const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
      res.json({ roles });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 4: Mount in `app.ts`**

In [apps/api/src/app.ts](../../../apps/api/src/app.ts), add the import:

```ts
import { createUserRoutes } from './routes/userRoutes';
```

And in the routes block (after the auth route you added in Task 9):

```ts
app.use('/api/v1/users', createUserRoutes(prisma));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm jest tests/users.test.ts`

Expected: all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/userRoutes.ts apps/api/src/app.ts apps/api/tests/users.test.ts
git commit -m "feat(employees): user CRUD routes with permission enforcement"
```

---

### Task 11: Wire bootstrap into server startup

**Files:**
- Modify: [apps/api/src/index.ts](../../../apps/api/src/index.ts)
- Modify: [apps/api/.env.example](../../../apps/api/.env.example)

- [ ] **Step 1: Edit `.env.example`**

Append to [apps/api/.env.example](../../../apps/api/.env.example):

```
# ── Auth (employees module) ───────────────────────────────────────────────
# Cookie secret — used by cookie-parser for signed cookies if we opt into them.
AUTH_SESSION_SECRET=change-me-in-production
# Session lifetime in hours. Defaults to 12.
AUTH_SESSION_TTL_HOURS=12
# Bootstrap OWNER — only used on first boot when no users exist. Change the
# password after first login.
AUTH_OWNER_EMAIL=owner@example.com
AUTH_OWNER_PASSWORD=change-me-on-first-login
AUTH_OWNER_NAME=Owner
```

- [ ] **Step 2: Call bootstrap from index.ts**

Edit [apps/api/src/index.ts](../../../apps/api/src/index.ts). Before `app.listen`, add:

```ts
import { PrismaClient } from '@prisma/client';
import { bootstrapOwner } from './services/employees/bootstrapOwner';

const bootstrapPrisma = new PrismaClient();
bootstrapOwner(bootstrapPrisma)
  .catch((err) => console.warn('[index] bootstrapOwner error:', err))
  .finally(() => bootstrapPrisma.$disconnect());
```

- [ ] **Step 3: Start the dev server and verify**

Run: `cd apps/api && pnpm dev`

Expected log line: `[bootstrapOwner] Seeded OWNER user owner@example.com` (only on first boot).

- [ ] **Step 4: Manually hit the login endpoint**

With the server running, in another terminal:

```bash
curl -i -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@example.com","password":"change-me-on-first-login"}'
```

Expected: HTTP 200, `Set-Cookie: sid=...; HttpOnly; Path=/`, JSON body with `user.role.name = 'OWNER'`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts apps/api/.env.example
git commit -m "feat(employees): bootstrap OWNER on startup + env examples"
```

---

### Task 12: Frontend API clients

**Files:**
- Create: `apps/web/src/services/authApi.ts`
- Create: `apps/web/src/services/userApi.ts`

The existing services use `fetch` with `credentials: 'include'` — inspect any existing `*Api.ts` for the pattern before writing these. (Verify by reading `apps/web/src/services/productApi.ts`.)

- [ ] **Step 1: Write `authApi.ts`**

Create `apps/web/src/services/authApi.ts`:

```ts
const API_BASE = '/api/v1/auth';

export interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    role: { id: string; name: string };
  };
  permissions: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export const authApi = {
  login: (email: string, password: string) =>
    request<{ user: MeResponse['user'] }>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>('/logout', { method: 'POST' }),
  me: () => request<MeResponse>('/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<void>('/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    }),
};
```

- [ ] **Step 2: Write `userApi.ts`**

Create `apps/web/src/services/userApi.ts`:

```ts
const API_BASE = '/api/v1/users';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
  roleId: string;
  role: { id: string; name: string; permissions: string[] };
  ricsUserId: string | null;
  salespersonCode: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
}

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export const userApi = {
  list: () => request<{ users: AdminUser[] }>(''),
  get: (id: string) => request<{ user: AdminUser }>(`/${id}`),
  create: (input: CreateUserInput) =>
    request<{ user: AdminUser }>('', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: UpdateUserInput) =>
    request<{ user: AdminUser }>(`/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<void>(`/${id}`, { method: 'DELETE' }),
  listRoles: () => request<{ roles: Role[] }>('/_meta/roles'),
};
```

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/services/authApi.ts apps/web/src/services/userApi.ts
git commit -m "feat(employees): web auth + user API clients"
```

---

### Task 13: AuthContext + useAuth + RequireAuth + RequirePermission

**Files:**
- Create: `apps/web/src/auth/AuthContext.tsx`
- Create: `apps/web/src/auth/useAuth.ts`
- Create: `apps/web/src/auth/RequireAuth.tsx`
- Create: `apps/web/src/auth/RequirePermission.tsx`

- [ ] **Step 1: Write `AuthContext.tsx`**

```tsx
import { createContext, ReactNode, useCallback, useEffect, useState } from 'react';
import { authApi, MeResponse } from '../services/authApi';

export interface AuthState {
  user: MeResponse['user'] | null;
  permissions: Set<string>;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse['user'] | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me.user);
      setPermissions(new Set(me.permissions));
    } catch {
      setUser(null);
      setPermissions(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    await authApi.login(email, password);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setPermissions(new Set());
  }, []);

  return (
    <AuthContext.Provider value={{ user, permissions, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 2: Write `useAuth.ts`**

```ts
import { useContext } from 'react';
import { AuthContext, AuthState } from './AuthContext';

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
```

- [ ] **Step 3: Write `RequireAuth.tsx`**

```tsx
import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Flex, Spin } from 'antd';
import { useAuth } from './useAuth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <Flex align="center" justify="center" style={{ minHeight: 240 }}>
        <Spin size="large" />
      </Flex>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 4: Write `RequirePermission.tsx`**

```tsx
import { ReactNode } from 'react';
import { Result } from 'antd';
import { useAuth } from './useAuth';

export function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { permissions } = useAuth();
  if (!permissions.has(permission)) {
    return <Result status="403" title="403" subTitle="You don't have permission to view this page." />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 5: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/auth
git commit -m "feat(employees): AuthContext + useAuth + RequireAuth + RequirePermission"
```

---

### Task 14: Login page

**Files:**
- Create: `apps/web/src/pages/auth/LoginPage.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { Button, Card, Form, Input, Layout, Typography, message } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  const onSubmit = async (values: { email: string; password: string }) => {
    try {
      await login(values.email, values.password);
      navigate(from, { replace: true });
    } catch (err: any) {
      message.error(err.message || 'Login failed');
    }
  };

  return (
    <Layout style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card style={{ width: 380 }}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>Sign in</Typography.Title>
        <Form layout="vertical" onFinish={onSubmit}>
          <Form.Item
            label="Email"
            name="email"
            rules={[{ required: true, type: 'email' }]}
          >
            <Input autoComplete="username" autoFocus />
          </Form.Item>
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>Sign in</Button>
        </Form>
      </Card>
    </Layout>
  );
}
```

- [ ] **Step 2: Commit (route wiring happens in Task 17)**

```bash
git add apps/web/src/pages/auth/LoginPage.tsx
git commit -m "feat(employees): login page"
```

---

### Task 15: Me page + change-password page

**Files:**
- Create: `apps/web/src/pages/auth/MePage.tsx`
- Create: `apps/web/src/pages/auth/ChangePasswordPage.tsx`

- [ ] **Step 1: Write `MePage.tsx`**

```tsx
import { Card, Descriptions, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';

export default function MePage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Card>
      <Typography.Title level={3}>My account</Typography.Title>
      <Descriptions column={1} bordered>
        <Descriptions.Item label="Email">{user.email}</Descriptions.Item>
        <Descriptions.Item label="Name">{user.displayName}</Descriptions.Item>
        <Descriptions.Item label="Role">{user.role.name}</Descriptions.Item>
      </Descriptions>
      <p style={{ marginTop: 16 }}>
        <Link to="/change-password">Change password</Link>
      </p>
    </Card>
  );
}
```

- [ ] **Step 2: Write `ChangePasswordPage.tsx`**

```tsx
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../services/authApi';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const onSubmit = async (values: { oldPassword: string; newPassword: string; confirm: string }) => {
    if (values.newPassword !== values.confirm) {
      message.error('New passwords do not match');
      return;
    }
    try {
      await authApi.changePassword(values.oldPassword, values.newPassword);
      message.success('Password changed');
      navigate('/me');
    } catch (err: any) {
      message.error(err.message || 'Change failed');
    }
  };
  return (
    <Card style={{ maxWidth: 480 }}>
      <Typography.Title level={3}>Change password</Typography.Title>
      <Form layout="vertical" onFinish={onSubmit}>
        <Form.Item label="Current password" name="oldPassword" rules={[{ required: true }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item label="New password" name="newPassword" rules={[{ required: true, min: 8 }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item label="Confirm new password" name="confirm" rules={[{ required: true }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit">Change password</Button>
      </Form>
    </Card>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/auth
git commit -m "feat(employees): me + change-password pages"
```

---

### Task 16: Users admin pages (list + form)

**Files:**
- Create: `apps/web/src/pages/users/UsersListPage.tsx`
- Create: `apps/web/src/pages/users/UserFormPage.tsx`

- [ ] **Step 1: Write `UsersListPage.tsx`**

```tsx
import { Button, Card, Popconfirm, Space, Table, Tag, Typography, message } from 'antd';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AdminUser, userApi } from '../../services/userApi';

export default function UsersListPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => userApi.list(),
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => userApi.remove(id),
    onSuccess: () => {
      message.success('User deleted');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => message.error(err.message || 'Delete failed'),
  });

  return (
    <Card>
      <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>Users</Typography.Title>
        <Link to="/admin/users/new"><Button type="primary">New user</Button></Link>
      </Space>
      <Table<AdminUser>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.users ?? []}
        columns={[
          { title: 'Email', dataIndex: 'email' },
          { title: 'Name', dataIndex: 'displayName' },
          { title: 'Role', dataIndex: ['role', 'name'], render: (v) => <Tag>{v}</Tag> },
          {
            title: 'Active',
            dataIndex: 'active',
            render: (v: boolean) => (v ? <Tag color="green">active</Tag> : <Tag>inactive</Tag>),
          },
          {
            title: 'Actions',
            render: (_, row) => (
              <Space>
                <Link to={`/admin/users/${row.id}/edit`}>Edit</Link>
                <Popconfirm
                  title="Delete this user?"
                  onConfirm={() => removeMutation.mutate(row.id)}
                >
                  <a>Delete</a>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );
}
```

- [ ] **Step 2: Write `UserFormPage.tsx`**

```tsx
import { Button, Card, Form, Input, Select, Switch, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { userApi } from '../../services/userApi';

export default function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: () => userApi.listRoles() });

  const userQuery = useQuery({
    queryKey: ['user', id],
    queryFn: () => userApi.get(id!),
    enabled: isEdit,
  });

  const initial = userQuery.data?.user;

  const mutation = useMutation({
    mutationFn: async (values: any) => {
      if (isEdit) {
        const { password, ...rest } = values;
        return userApi.update(id!, rest);
      }
      return userApi.create(values);
    },
    onSuccess: () => {
      message.success(isEdit ? 'User updated' : 'User created');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      navigate('/admin/users');
    },
    onError: (err: any) => message.error(err.message || 'Save failed'),
  });

  return (
    <Card>
      <Typography.Title level={3}>{isEdit ? 'Edit user' : 'New user'}</Typography.Title>
      <Form
        form={form}
        layout="vertical"
        initialValues={
          initial
            ? { email: initial.email, displayName: initial.displayName, roleId: initial.roleId, active: initial.active }
            : { active: true }
        }
        onFinish={(values) => mutation.mutate(values)}
      >
        <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email' }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Name" name="displayName" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        {!isEdit && (
          <Form.Item label="Password" name="password" rules={[{ required: true, min: 8 }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        )}
        <Form.Item label="Role" name="roleId" rules={[{ required: true }]}>
          <Select
            loading={rolesQuery.isLoading}
            options={(rolesQuery.data?.roles ?? []).map((r) => ({ value: r.id, label: r.name }))}
          />
        </Form.Item>
        <Form.Item label="Active" name="active" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
          {isEdit ? 'Save' : 'Create'}
        </Button>
      </Form>
    </Card>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/users
git commit -m "feat(employees): users admin pages"
```

---

### Task 17: Wire routes + AuthProvider into App.tsx

**Files:**
- Modify: [apps/web/src/App.tsx](../../../apps/web/src/App.tsx)
- Modify: [apps/web/src/components/AppLayout.tsx](../../../apps/web/src/components/AppLayout.tsx)

- [ ] **Step 1: Add lazy imports + routes to `App.tsx`**

At the top of `App.tsx`, add these lazy imports next to the existing ones:

```tsx
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const MePage = lazy(() => import('./pages/auth/MePage'))
const ChangePasswordPage = lazy(() => import('./pages/auth/ChangePasswordPage'))
const UsersListPage = lazy(() => import('./pages/users/UsersListPage'))
const UserFormPage = lazy(() => import('./pages/users/UserFormPage'))
```

Add this import with the other top-of-file imports:

```tsx
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { RequirePermission } from './auth/RequirePermission'
```

Wrap the whole `<Routes>` in `<AuthProvider>`. Add `/login` as a top-level (NOT-wrapped) route, and wrap the existing `<AppLayout />` route in `<RequireAuth>`. The resulting top of the return statement should look like this (merge with your existing routes):

```tsx
return (
  <AuthProvider>
    <Routes>
      <Route path="/login" element={
        <Suspense fallback={<RouteLoadingFallback />}>
          <LoginPage />
        </Suspense>
      } />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        {/* ... all existing routes unchanged ... */}
        <Route element={<LazyRouteOutlet />}>
          {/* ... existing lazy routes ... */}
          <Route path="/me" element={<MePage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/admin/users" element={
            <RequirePermission permission="employees.view"><UsersListPage /></RequirePermission>
          } />
          <Route path="/admin/users/new" element={
            <RequirePermission permission="employees.manage"><UserFormPage /></RequirePermission>
          } />
          <Route path="/admin/users/:id/edit" element={
            <RequirePermission permission="employees.manage"><UserFormPage /></RequirePermission>
          } />
        </Route>
      </Route>
    </Routes>
  </AuthProvider>
)
```

- [ ] **Step 2: Add a header dropdown to `AppLayout.tsx`**

Open [apps/web/src/components/AppLayout.tsx](../../../apps/web/src/components/AppLayout.tsx), find the header row, and add a right-aligned Ant Design `Dropdown` showing the current user with `Sign out` and `My account` actions. Wire `Sign out` to call `useAuth().logout()` and then `navigate('/login')`. Code pattern:

```tsx
import { Dropdown, Button, Avatar } from 'antd'
import { useAuth } from '../auth/useAuth'
import { useNavigate } from 'react-router-dom'

// Inside the AppLayout component, in the header:
const { user, logout } = useAuth()
const navigate = useNavigate()
const menu = [
  { key: 'me', label: <span onClick={() => navigate('/me')}>My account</span> },
  { key: 'admin', label: <span onClick={() => navigate('/admin/users')}>Users</span> },
  { type: 'divider' as const },
  { key: 'logout', label: <span onClick={async () => { await logout(); navigate('/login'); }}>Sign out</span> },
]
// Render near the existing header right-side content:
// <Dropdown menu={{ items: menu }}>
//   <Button type="text">
//     <Avatar size="small">{user?.displayName?.[0] ?? '?'}</Avatar>
//     &nbsp;{user?.displayName}
//   </Button>
// </Dropdown>
```

Adapt to the existing AppLayout header structure — keep the visual style of the current layout.

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/components/AppLayout.tsx
git commit -m "feat(employees): wire AuthProvider + routes + header dropdown"
```

---

### Task 18: End-to-end manual verification

**Files:** none

- [ ] **Step 1: Start the backend**

Run in one terminal: `cd apps/api && pnpm dev`

Expected log: `[bootstrapOwner] Seeded OWNER user ...` on first run (already done in Task 11 — may now say "skipped").

- [ ] **Step 2: Start the frontend**

Run in another terminal: `cd apps/web && pnpm dev`

- [ ] **Step 3: Visit the app in the browser**

Navigate to `http://localhost:5173/inventory/dashboard`.

Expected: Redirect to `/login`.

- [ ] **Step 4: Sign in**

Enter the OWNER email + password from `.env`. Click Sign in.

Expected: Land on `/inventory/dashboard`. Header shows the owner's name + avatar.

- [ ] **Step 5: Visit the users admin**

Header dropdown → Users. Expected: Users table shows the OWNER row.

- [ ] **Step 6: Create a SALESPERSON user**

Click "New user". Fill form: email, name, password, role = SALESPERSON. Submit.

Expected: Back on `/admin/users`, new row visible.

- [ ] **Step 7: Sign out + sign in as the new user**

Header dropdown → Sign out. Land on `/login`. Sign in as the new user.

Expected: Land on the default page. Header dropdown → Users. Expected: `403 — You don't have permission to view this page.`

- [ ] **Step 8: Change-password flow**

Header dropdown → My account → Change password. Enter wrong old password. Expected: error toast. Enter correct old + new password. Expected: success toast, land on /me.

- [ ] **Step 9: Sign out + sign back in with new password**

Expected: success.

- [ ] **Step 10: Run the full backend test suite**

Run: `cd apps/api && pnpm test`

Expected: all tests pass — including pre-existing tests (no regressions).

---

### Task 19: Self-review + module spec update

**Files:**
- Modify: [docs/modules/employees.md](../../../docs/modules/employees.md)

- [ ] **Step 1: Walk the spec, mark what this slice closed**

Open `docs/modules/employees.md`. Under the relevant section, mark which entities, endpoints, and decisions are now shipped vs. still open. Add a short "Slice 1 shipped" paragraph near the top noting the date and what's now live.

- [ ] **Step 2: Fold Task 8 (MFA + OWNER/ADMIN/FINANCE decisions) into the spec**

Record the deferred decisions in the "Open questions" section so they aren't lost.

- [ ] **Step 3: Commit**

```bash
git add docs/modules/employees.md
git commit -m "docs(employees): mark slice 1 shipped; update open questions"
```

---

## Self-Review Checklist

After writing the complete plan, skim the spec at `docs/modules/employees.md` with fresh eyes and check the plan against it:

**1. Spec coverage:**
- User / Role / Session entities: ✅ Tasks 4 + the seed data in Task 8.
- Auth endpoints (login / logout / me / change-password): ✅ Task 9.
- User CRUD: ✅ Task 10.
- Permission middleware: ✅ Task 7.
- OWNER bootstrap: ✅ Task 8 + 11.
- Employee / TimeClock / CommissionOverride / SalesPassword entities: ❌ **deferred to slice 2+ per scope agreement**.
- MFA/TOTP: ❌ **deferred per scope agreement**.
- Legacy RICS password import: ❌ **deferred per scope agreement**.

**2. Placeholder scan:** none found. Every task has complete code blocks. `<timestamp>` in Task 4's migration path is generated by Prisma, not a placeholder.

**3. Type consistency:** `PERMISSIONS` shape matches between Tasks 2 and 7. `createUser` signature in Task 6 matches the body in Task 10's `POST /users`. `MeResponse` shape in Task 12 matches the `GET /auth/me` response in Task 9.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-18-employees-auth-slice.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
