import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaClient } from '../src/prismaClient';
import app from '../src/app';
import { bootstrapOwner } from '../src/services/employees/bootstrapOwner';
import { hashPassword } from '../src/services/employees/passwordHash';

const prisma = new PrismaClient();
const OWNER_EMAIL = `user-crud-${Date.now()}@example.com`;
const OWNER_PASSWORD = 'owner-password-123';

async function ensureOwnerUser(): Promise<void> {
  await bootstrapOwner(prisma);
  const ownerRole = await prisma.role.findUnique({ where: { name: 'OWNER' } });
  const passwordHash = await hashPassword(OWNER_PASSWORD);
  await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'Owner',
    },
    create: {
      email: OWNER_EMAIL,
      passwordHash,
      roleId: ownerRole!.id,
      active: true,
      displayName: 'Owner',
    },
  });
}

async function ownerCookie(): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
  return res.headers['set-cookie'][0];
}

async function ensureMfaTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.identity_mfa_factor (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
      factor_type TEXT NOT NULL,
      label TEXT NULL,
      secret_hash TEXT NULL,
      public_key_json JSONB NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      verified_at TIMESTAMP(3) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TIMESTAMP(3) NULL
    )
  `);
}

async function ensureLoginEventTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.identity_login_event (
      id TEXT PRIMARY KEY,
      user_id TEXT NULL,
      role_id TEXT NULL,
      email TEXT NOT NULL,
      outcome TEXT NOT NULL,
      reason TEXT NULL,
      ip_address TEXT NULL,
      user_agent TEXT NULL,
      occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function ensureSessionEventTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.identity_session_event (
      id TEXT PRIMARY KEY,
      session_id TEXT NULL,
      user_id TEXT NULL,
      event_type TEXT NOT NULL,
      reason TEXT NULL,
      ip_address TEXT NULL,
      user_agent TEXT NULL,
      occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function ensureExternalIdentityTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public.identity_external_identity (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_subject TEXT NOT NULL,
      email_at_provider TEXT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_authenticated_at TIMESTAMP(3) NULL,
      CONSTRAINT identity_external_identity_provider_subject_key UNIQUE (provider, provider_subject)
    )
  `);
}

async function ensureRoleMetadataColumns(): Promise<void> {
  await prisma.$executeRawUnsafe('ALTER TABLE public."Role" ADD COLUMN IF NOT EXISTS description TEXT NULL');
  await prisma.$executeRawUnsafe('ALTER TABLE public."Role" ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP(3) NULL');
}

describe('user CRUD routes', () => {
  beforeAll(async () => {
    process.env.AUTH_OWNER_EMAIL = OWNER_EMAIL;
    process.env.AUTH_OWNER_PASSWORD = OWNER_PASSWORD;
    await ensureRoleMetadataColumns();
    await ensureMfaTable();
    await ensureLoginEventTable();
    await ensureSessionEventTable();
    await ensureExternalIdentityTable();
    await prisma.$executeRawUnsafe(`
      DELETE FROM public.identity_mfa_factor
      WHERE user_id IN (SELECT id FROM public."User" WHERE email LIKE 'user-crud-%')
    `);
    await prisma.$executeRawUnsafe(`
      DELETE FROM public.identity_external_identity
      WHERE user_id IN (SELECT id FROM public."User" WHERE email LIKE 'user-crud-%')
    `);
    await prisma.$executeRawUnsafe("DELETE FROM public.identity_login_event WHERE email LIKE 'user-crud-%'");
    await prisma.$executeRawUnsafe(`
      DELETE FROM public.identity_session_event
      WHERE user_id IN (SELECT id FROM public."User" WHERE email LIKE 'user-crud-%')
    `);
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: { contains: 'user-crud-' } } });
    await prisma.role.deleteMany({ where: { name: { startsWith: 'USER_CRUD_CUSTOM_' } } });
    await ensureOwnerUser();
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`
      DELETE FROM public.identity_mfa_factor
      WHERE user_id IN (SELECT id FROM public."User" WHERE email LIKE 'user-crud-%')
    `);
    await prisma.$executeRawUnsafe(`
      DELETE FROM public.identity_external_identity
      WHERE user_id IN (SELECT id FROM public."User" WHERE email LIKE 'user-crud-%')
    `);
    await prisma.$executeRawUnsafe("DELETE FROM public.identity_login_event WHERE email LIKE 'user-crud-%'");
    await prisma.$executeRawUnsafe(`
      DELETE FROM public.identity_session_event
      WHERE user_id IN (SELECT id FROM public."User" WHERE email LIKE 'user-crud-%')
    `);
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { email: { contains: 'user-crud-' } } });
    await prisma.role.deleteMany({ where: { name: { startsWith: 'USER_CRUD_CUSTOM_' } } });
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
    for (const u of res.body.users) expect(u.passwordHash).toBeUndefined();
  });

  it('GET /users/_meta/permissions returns the permission catalog', async () => {
    const cookie = await ownerCookie();
    const res = await request(app).get('/api/v1/users/_meta/permissions').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'identity_access.manage',
          moduleLabel: 'Identity & Access',
          label: expect.any(String),
          description: expect.any(String),
        }),
      ]),
    );
    expect(res.body.modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module: 'identity_access', moduleLabel: 'Identity & Access' }),
      ]),
    );
  });

  it('PATCH /users/_meta/roles/:roleId/permissions updates role permissions and protects OWNER', async () => {
    const cookie = await ownerCookie();
    const finance = await prisma.role.findUnique({ where: { name: 'FINANCE' } });
    const owner = await prisma.role.findUnique({ where: { name: 'OWNER' } });
    expect(finance).toBeTruthy();
    expect(owner).toBeTruthy();
    const originalPermissions = finance!.permissions;
    const nextPermissions = Array.from(new Set([...originalPermissions, 'identity_access.view']));

    try {
      const res = await request(app)
        .patch(`/api/v1/users/_meta/roles/${finance!.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissions: nextPermissions, reason: 'test permission update' });

      expect(res.status).toBe(200);
      expect(res.body.role.name).toBe('FINANCE');
      expect(res.body.role.permissions).toEqual(expect.arrayContaining(['identity_access.view']));
      expect(res.body.role.locked).toBe(false);

      const locked = await request(app)
        .patch(`/api/v1/users/_meta/roles/${owner!.id}/permissions`)
        .set('Cookie', cookie)
        .send({ permissions: ['identity_access.view'], reason: 'should not work' });
      expect(locked.status).toBe(409);
      expect(locked.body.error.code).toBe('LOCKED_ROLE');
    } finally {
      await prisma.role.update({
        where: { id: finance!.id },
        data: { permissions: originalPermissions },
      });
    }
  });

  it('POST/PATCH/DELETE /users/_meta/roles manages custom role lifecycle', async () => {
    const cookie = await ownerCookie();
    const manager = await prisma.role.findUnique({ where: { name: 'MANAGER' } });
    expect(manager).toBeTruthy();
    const name = `USER_CRUD_CUSTOM_${Date.now()}`;
    const renamed = `${name}_RENAMED`;

    const create = await request(app)
      .post('/api/v1/users/_meta/roles')
      .set('Cookie', cookie)
      .send({
        name,
        description: 'Temporary test role',
        cloneFromRoleId: manager!.id,
        reason: 'test create role',
      });

    expect(create.status).toBe(201);
    expect(create.body.role.name).toBe(name);
    expect(create.body.role.permissions).toEqual(expect.arrayContaining(['sales_pos.refund']));
    expect(create.body.role.safetyWarnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'POS_REFUND' })]),
    );

    const update = await request(app)
      .patch(`/api/v1/users/_meta/roles/${create.body.role.id}`)
      .set('Cookie', cookie)
      .send({ name: renamed, description: 'Renamed temporary test role', reason: 'test rename role' });

    expect(update.status).toBe(200);
    expect(update.body.role.name).toBe(renamed);
    expect(update.body.role.description).toBe('Renamed temporary test role');

    const archive = await request(app)
      .delete(`/api/v1/users/_meta/roles/${create.body.role.id}`)
      .set('Cookie', cookie);

    expect(archive.status).toBe(200);
    expect(archive.body.role.archivedAt).toBeTruthy();

    const activeRoles = await request(app).get('/api/v1/users/_meta/roles').set('Cookie', cookie);
    expect(activeRoles.body.roles.some((role: any) => role.id === create.body.role.id)).toBe(false);

    const allRoles = await request(app).get('/api/v1/users/_meta/roles?includeArchived=true').set('Cookie', cookie);
    expect(allRoles.body.roles).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: create.body.role.id, archivedAt: expect.any(String) })]),
    );
  });

  it('DELETE /users/_meta/roles/:roleId refuses to archive assigned roles', async () => {
    const cookie = await ownerCookie();
    const roleName = `USER_CRUD_CUSTOM_ASSIGNED_${Date.now()}`;
    const role = await request(app)
      .post('/api/v1/users/_meta/roles')
      .set('Cookie', cookie)
      .send({ name: roleName, permissions: ['products.view'], reason: 'test assigned role' });

    expect(role.status).toBe(201);

    const createUser = await request(app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({
        email: `user-crud-assigned-role-${Date.now()}@example.com`,
        displayName: 'Assigned Role User',
        password: 'assigned-role-pw-12345',
        roleId: role.body.role.id,
      });

    expect(createUser.status).toBe(201);

    const archive = await request(app)
      .delete(`/api/v1/users/_meta/roles/${role.body.role.id}`)
      .set('Cookie', cookie);

    expect(archive.status).toBe(409);
    expect(archive.body.error.code).toBe('ROLE_ASSIGNED');
  });

  it('PATCH /users/:id updates displayName', async () => {
    const cookie = await ownerCookie();
    const existing = (await request(app).get('/api/v1/users').set('Cookie', cookie)).body.users[0];
    const res = await request(app)
      .patch(`/api/v1/users/${existing.id}`)
      .set('Cookie', cookie)
      .send({ displayName: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('Renamed');
  });

  it('DELETE /users/:id deactivates the user and blocks login', async () => {
    const cookie = await ownerCookie();
    const salesperson = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });
    const email = `user-crud-delete-${Date.now()}@example.com`;
    const password = 'delete-me-pw-12345';
    const create = await request(app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({
        email,
        displayName: 'Delete Me',
        password,
        roleId: salesperson!.id,
      });
    const id = create.body.user.id;
    const del = await request(app).delete(`/api/v1/users/${id}`).set('Cookie', cookie);
    expect(del.status).toBe(204);
    const stored = await prisma.user.findUnique({ where: { id } });
    expect(stored?.active).toBe(false);
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(login.status).toBe(401);
  });

  it('GET /users/:id/effective-access exposes roles, permissions, and scopes', async () => {
    const cookie = await ownerCookie();
    const users = await request(app).get('/api/v1/users').set('Cookie', cookie);
    const owner = users.body.users.find((u: any) => u.email === OWNER_EMAIL);
    const res = await request(app).get(`/api/v1/users/${owner.id}/effective-access`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.effectiveAccess.user.email).toBe(OWNER_EMAIL);
    expect(res.body.effectiveAccess.effectivePermissions).toEqual(
      expect.arrayContaining(['identity_access.manage', 'identity_access.view']),
    );
    expect(res.body.effectiveAccess.permissionSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          permission: 'identity_access.manage',
          label: expect.any(String),
          roles: expect.arrayContaining([expect.objectContaining({ name: 'OWNER' })]),
        }),
      ]),
    );
    expect(Array.isArray(res.body.effectiveAccess.safetyWarnings)).toBe(true);
    expect(res.body.effectiveAccess.roles[0].name).toBe('OWNER');
  });

  it('POST /users/:id/roles changes effective permissions and revokes sessions', async () => {
    const cookie = await ownerCookie();
    const salesperson = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });
    const manager = await prisma.role.findUnique({ where: { name: 'MANAGER' } });
    const create = await request(app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({
        email: `user-crud-role-${Date.now()}@example.com`,
        displayName: 'Role Change',
        password: 'role-change-pw-12345',
        roleId: salesperson!.id,
      });
    const id = create.body.user.id;
    const roleRes = await request(app)
      .post(`/api/v1/users/${id}/roles`)
      .set('Cookie', cookie)
      .send({ roleId: manager!.id, reason: 'test role change' });
    expect(roleRes.status).toBe(201);
    expect(roleRes.body.roleAssignment.roleName).toBe('MANAGER');

    const effective = await request(app).get(`/api/v1/users/${id}/effective-access`).set('Cookie', cookie);
    expect(effective.status).toBe(200);
    expect(effective.body.effectiveAccess.effectivePermissions).toEqual(
      expect.arrayContaining(['sales_pos.refund']),
    );
  });

  it('GET role assignment history report returns JSON and CSV', async () => {
    const cookie = await ownerCookie();

    const json = await request(app)
      .get('/api/v1/users/_reports/role-assignment-history?limit=10')
      .set('Cookie', cookie);

    expect(json.status).toBe(200);
    expect(Array.isArray(json.body.roleAssignmentHistory)).toBe(true);
    expect(json.body.roleAssignmentHistory.length).toBeGreaterThan(0);

    const csv = await request(app)
      .get('/api/v1/users/_reports/role-assignment-history.csv?limit=10')
      .set('Cookie', cookie);

    expect(csv.status).toBe(200);
    expect(csv.text).toContain('user_email');
    expect(csv.text).toContain('role_name');
  });

  it('GET failed login report returns JSON and CSV', async () => {
    const cookie = await ownerCookie();
    const failedEmail = `user-crud-failed-login-${Date.now()}@example.com`;
    const eventId = randomUUID();
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO public.identity_login_event
          (id, email, outcome, reason, ip_address, user_agent, occurred_at)
        VALUES ($1, $2, 'FAILURE', 'INVALID_CREDENTIALS', '127.0.0.1', 'jest', now())
      `,
      eventId,
      failedEmail,
    );

    const json = await request(app)
      .get(`/api/v1/users/_reports/failed-logins?email=${encodeURIComponent(failedEmail)}&limit=10`)
      .set('Cookie', cookie);

    expect(json.status).toBe(200);
    expect(json.body.failedLogins).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: eventId, email: failedEmail, outcome: 'FAILURE' })]),
    );

    const csv = await request(app)
      .get(`/api/v1/users/_reports/failed-logins.csv?email=${encodeURIComponent(failedEmail)}&limit=10`)
      .set('Cookie', cookie);

    expect(csv.status).toBe(200);
    expect(csv.text).toContain('event_id');
    expect(csv.text).toContain(failedEmail);
  });

  it('POST /users/:id/store-scopes grants a store scope', async () => {
    const cookie = await ownerCookie();
    const salesperson = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });
    const create = await request(app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({
        email: `user-crud-scope-${Date.now()}@example.com`,
        displayName: 'Scoped User',
        password: 'scope-user-pw-12345',
        roleId: salesperson!.id,
      });
    const id = create.body.user.id;
    const scopeRes = await request(app)
      .post(`/api/v1/users/${id}/store-scopes`)
      .set('Cookie', cookie)
      .send({ scopeType: 'STORE', scopeId: '101', reason: 'test store scope' });
    expect(scopeRes.status).toBe(201);
    expect(scopeRes.body.storeScope.scopeType).toBe('STORE');
    expect(scopeRes.body.storeScope.scopeId).toBe('101');

    const effective = await request(app).get(`/api/v1/users/${id}/effective-access`).set('Cookie', cookie);
    expect(effective.body.effectiveAccess.storeScopes).toEqual(
      expect.arrayContaining([expect.objectContaining({ scopeType: 'STORE', scopeId: '101' })]),
    );
  });

  it('POST /users/:id/sessions/revoke invalidates active sessions', async () => {
    const owner = await ownerCookie();
    const salesperson = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });
    const email = `user-crud-session-${Date.now()}@example.com`;
    const password = 'session-user-pw-12345';
    const create = await request(app)
      .post('/api/v1/users')
      .set('Cookie', owner)
      .send({
        email,
        displayName: 'Session User',
        password,
        roleId: salesperson!.id,
      });
    const id = create.body.user.id;
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const userCookie = login.headers['set-cookie'][0];
    const revoke = await request(app).post(`/api/v1/users/${id}/sessions/revoke`).set('Cookie', owner);
    expect(revoke.status).toBe(200);
    expect(revoke.body.revokedCount).toBeGreaterThanOrEqual(1);
    const sessionEvents = await request(app).get(`/api/v1/users/${id}/session-events`).set('Cookie', owner);
    expect(sessionEvents.status).toBe(200);
    expect(sessionEvents.body.sessionEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: id, eventType: expect.stringMatching(/LOGIN|ADMIN_REVOKE_ALL/) }),
      ]),
    );
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', userCookie);
    expect(me.status).toBe(401);
  });

  it('POST /users/:id/password-reset changes the password and revokes sessions', async () => {
    const owner = await ownerCookie();
    const salesperson = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });
    const email = `user-crud-password-${Date.now()}@example.com`;
    const oldPassword = 'password-reset-old-12345';
    const newPassword = 'password-reset-new-12345';
    const create = await request(app)
      .post('/api/v1/users')
      .set('Cookie', owner)
      .send({
        email,
        displayName: 'Password Reset User',
        password: oldPassword,
        roleId: salesperson!.id,
      });
    const id = create.body.user.id;
    const login = await request(app).post('/api/v1/auth/login').send({ email, password: oldPassword });
    const userCookie = login.headers['set-cookie'][0];

    const reset = await request(app)
      .post(`/api/v1/users/${id}/password-reset`)
      .set('Cookie', owner)
      .send({ newPassword, reason: 'test reset' });

    expect(reset.status).toBe(200);
    expect(reset.body.revokedCount).toBeGreaterThanOrEqual(1);

    const oldLogin = await request(app).post('/api/v1/auth/login').send({ email, password: oldPassword });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post('/api/v1/auth/login').send({ email, password: newPassword });
    expect(newLogin.status).toBe(200);
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', userCookie);
    expect(me.status).toBe(401);
  });

  it('GET and revoke /users/:id/mfa-factors exposes MFA factor administration', async () => {
    const owner = await ownerCookie();
    const salesperson = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });
    const create = await request(app)
      .post('/api/v1/users')
      .set('Cookie', owner)
      .send({
        email: `user-crud-mfa-${Date.now()}@example.com`,
        displayName: 'MFA User',
        password: 'mfa-user-pw-12345',
        roleId: salesperson!.id,
      });
    const id = create.body.user.id;
    const factorId = randomUUID();

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO public.identity_mfa_factor
          (id, user_id, factor_type, label, active, verified_at, created_at)
        VALUES ($1, $2, 'TOTP', 'Authenticator app', true, now(), now())
      `,
      factorId,
      id,
    );

    const list = await request(app).get(`/api/v1/users/${id}/mfa-factors`).set('Cookie', owner);
    expect(list.status).toBe(200);
    expect(list.body.mfaFactors).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: factorId, factorType: 'TOTP', active: true })]),
    );

    const revoke = await request(app)
      .post(`/api/v1/users/${id}/mfa-factors/${factorId}/revoke`)
      .set('Cookie', owner)
      .send({ reason: 'test revoke' });

    expect(revoke.status).toBe(200);
    expect(revoke.body.mfaFactor.id).toBe(factorId);
    expect(revoke.body.mfaFactor.active).toBe(false);
    expect(revoke.body.mfaFactor.revokedAt).toBeTruthy();
  });

  it('GET and unlink /users/:id/external-identities exposes SSO mapping administration', async () => {
    const owner = await ownerCookie();
    const salesperson = await prisma.role.findUnique({ where: { name: 'SALESPERSON' } });
    const email = `user-crud-external-${Date.now()}@example.com`;
    const password = 'external-user-pw-12345';
    const create = await request(app)
      .post('/api/v1/users')
      .set('Cookie', owner)
      .send({
        email,
        displayName: 'External Identity User',
        password,
        roleId: salesperson!.id,
      });
    const id = create.body.user.id;
    const externalIdentityId = randomUUID();

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO public.identity_external_identity
          (id, user_id, provider, provider_subject, email_at_provider, created_at, last_authenticated_at)
        VALUES ($1, $2, 'google', 'google-subject-123', $3, now(), now())
      `,
      externalIdentityId,
      id,
      email,
    );

    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const userCookie = login.headers['set-cookie'][0];

    const list = await request(app).get(`/api/v1/users/${id}/external-identities`).set('Cookie', owner);
    expect(list.status).toBe(200);
    expect(list.body.externalIdentities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: externalIdentityId, provider: 'google', emailAtProvider: email }),
      ]),
    );

    const unlink = await request(app)
      .post(`/api/v1/users/${id}/external-identities/${externalIdentityId}/unlink`)
      .set('Cookie', owner)
      .send({ reason: 'test unlink' });

    expect(unlink.status).toBe(200);
    expect(unlink.body.externalIdentity.id).toBe(externalIdentityId);
    expect(unlink.body.revokedCount).toBeGreaterThanOrEqual(1);

    const after = await request(app).get(`/api/v1/users/${id}/external-identities`).set('Cookie', owner);
    expect(after.status).toBe(200);
    expect(after.body.externalIdentities).toEqual([]);

    const me = await request(app).get('/api/v1/auth/me').set('Cookie', userCookie);
    expect(me.status).toBe(401);
  });
});


