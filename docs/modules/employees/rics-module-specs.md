# Module: employees

> **Status — Slice 1 shipped (2026-04-18), Slice 2 partial import shipped (2026-04-28).** The first slice of this module shipped **Users + Roles + Permissions + Sessions + argon2id password login + user CRUD + a seeded OWNER**. A partial Slice 2 import now loads `RISLSPSN.MDB / Salespeople` into `app.employee` via `import:employees-from-rics`, preserving salesperson code, name, other info, commission fields, time-clock flags, and hashed legacy PIN fields for reporting and later activation. Everything below about `RIPASS.Users`, user-to-employee linking, full commission-period ledgers, richer MFA/TOTP, and remaining legacy employee imports is still planned for later slices. See [`docs/dev/plans/2026-04-18-employees-auth-slice.md`](../dev/plans/2026-04-18-employees-auth-slice.md) for the original auth slice.
>
> **Shipped surface:**
> - `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`, `POST /api/v1/auth/change-password`
> - `GET/POST/PATCH/DELETE /api/v1/users`, `GET /api/v1/users/_meta/roles`
> - `GET/POST /api/v1/employees/salespeople`, `GET/PATCH/DELETE /api/v1/employees/salespeople/:code` for the app-owned salesperson roster in `app.employee`
> - Six seed roles: OWNER, ADMIN, FINANCE, BUYER, MANAGER, SALESPERSON with 19 permission strings across all modules
> - Permission middleware (`requireAuth`, `requirePermission`) at `apps/api/src/middleware/authMiddleware.ts`
> - Web: `/login`, `/me`, `/change-password`, `/employees/salespeople`, `/admin/users`, `/admin/users/new`, `/admin/users/:id/edit`
> - OWNER bootstrapped from `AUTH_OWNER_EMAIL` + `AUTH_OWNER_PASSWORD` env vars on first boot
>
> **Key decisions made during Slice 1 (confirmed with user):**
> 1. Employee + User are unified into one entity (commitment — Slice 2 `Employee` fields will hang off `User`, not a separate table with an FK).
> 2. Legacy `RIPASS.Password` and `RISLSPSN.CashierPassword` are **ignored** for web login. Imported salesperson records are not login accounts; legacy time-clock / cashier PIN values are preserved only as hashes in Postgres-owned employee fields.
> 3. MFA / TOTP deferred to Slice 2.
> 4. The `RISLSPSN.Salespeople` import is implemented as a partial Slice 2 bridge. `RIPASS.Users`, user activation policy, and any permission reconciliation remain deferred.
> 5. Register override modernization was deferred in Slice 1 and is now owned by the employee sales-password bridge rather than by a separate store-shared password layer.

**Goal**

`employees` is the **people + access control** layer of Zack's Retail. It owns three cleanly-separated concepts that RICS partially conflates:

1. **Employee / Salesperson** — a human who works at the business: rings sales, earns commission, clocks hours, is referenced on ticket lines, shows up on the Salesperson Analysis report. This is an *HR-lite* record with enough fields to drive commission math and time clock, and nothing more — real HR lives elsewhere.
2. **User / Account** — an authenticated *login principal* in the admin UI and the POS. Has an email, a hashed password, an optional MFA factor, a role, and a permission set. May or may not be an `Employee` (e.g., an IT admin who never rings a sale; an offshore data-entry user; a part-time stocker who clocks hours but never logs in).
3. **Sales Password** — a short override PIN an *employee* types mid-ticket at the POS to authorize a single privileged action (manager override, refund, price override, no-sale, void, reprint). **Not** a login credential — it does not create a session, it grants a single operation on a single ticket, it is rate-limited, and it is always audited.

Primary user value: every other module trusts a single, audited source of truth for "who is this person, what are they allowed to do, what commission do they get, and how many hours did they work this period", without each module re-deriving the answer from its own mini-user table.

What this module explicitly **does not** own: the HTTP middleware that reads a session cookie and enforces `req.user.permissions.has('x')` (that's `platform`); shift opening/closing and cash-drawer ops (that's `sales-pos`, which *consumes* the logged-in user and its commissionable lines); per-store tax / tender / bill-to config (that's `store-ops`); payroll export (deferred — commission totals are the output of this module, payroll is downstream); scheduling / rostering (not in RICS, out of scope); manager-option *screens* at the POS (those live in `sales-pos`; this module only defines the *permissions* those screens check and the *sales passwords* they challenge).

## RICS features covered

**Enter Salespeople — the salesperson record** (Ch. 7 p. 106)
- **p. 106, Salesperson # — 1–4 chars alphanumeric** — the code the cashier types to make a sale. Short on purpose; must be fast to enter.
- **p. 106, Name** — employee's display name, prints on the Salesperson Summary, Sales Journal footer, and Salesperson Analysis.
- **p. 106, Other Information** — free-text field for title, social security number, phone — a bag-of-attributes HR slot.
- **p. 106, Commission %** — default commission rate on this salesperson; based on either sales $ or gross-profit $ (configured at the salesperson record level, not the ticket). Leave blank if no commissions paid.
- **p. 106, Time Clock Options appear only when time clock is enabled** — Password + two access-scope flags (admin? themselves-only?). See below.

**Time Clock overview + modes** (Ch. 7 pp. 106–109)
- **p. 106, Turn Time Clock On** — legacy `RICS.CFG [TimeClock] Enabled=Y` flag; secondary `ReqCashier=Y` forces cashier to clock in before entering sales. Applies per-machine.
- **p. 107, Password** — 1–12 chars; **if blank, that salesperson cannot clock themselves in/out** (they must be clocked by someone else — the "no self-service" mode).
- **p. 107, "This salesperson is allowed to be a time clock administrator"** — can adjust *any* employee's clock entries after the fact.
- **p. 107, "This salesperson may access time clock functions only for themselves"** — restricts the person to clocking in/out themselves only, with no ability to clock others in/out.
- **pp. 107–108, the four combinations of those two flags** — owner/supervisor, store manager, normal employee, and a "seldom used" self-admin configuration.
- **p. 108, Log In / Log Out screen fields** — Salesperson # + Password + Salesperson-to-clock + Time In / Time Out (defaults to now) + `Non-Sales Hours` checkbox + Store # (multi-store). Elapsed time shown on log-out.
- **p. 106, 24-hour cap** — salespeople cannot be clocked in for more than 24 continuous hours; if they forget to log out, the system warns at batch-close / sales-copy / sync time that there are still-clocked-in people. If not clocked out, hours are **not credited** on sync to main.

**Time Clock Administration + Printing** (Ch. 7 pp. 109–110)
- **p. 109, Time Clock Administrator** — adjust existing unposted time-clock records; once sales are posted the records cannot be changed but can be reversed / adjusted via offsetting entries.
- **p. 110, Print Time Clock Data** — flat report; `Print salesperson detail` checkbox toggles per-entry rows vs. summary. Total Hours rendered as decimal (e.g., `6.7` meaning 6h 42min — to convert, multiply the fractional part × 60).

**Commissions + Perks + Hours** (Ch. 7 pp. 111)
- **p. 111, Enter Commission Overrides** — per-`(Salesperson × Department)` rate override. If no override row exists, the default from Enter Salespeople applies. The rate's base (sales $ vs. gross-profit $) is inherited from the salesperson record, not the override.
- **p. 111, Enter Hours/Perks** — manual data entry of hours + perks (PMs / multies / spiffs) when time clock is *not* on; when time clock is on this screen is read-only. Shows rolled totals for PTD / MTD / STD / YTD.
- **p. 155, SKU perks (Coupon SKU / Perks slot)** — cross-referenced from `products`; at sale time a SKU's `perksAmount` auto-posts to the salesperson on the ticket line.

**Salesperson Analysis Report + Close Period** (Ch. 7 pp. 111–112)
- **p. 111, Salesperson Analysis Report** — per-employee: sales, profit, commission, perks, hours, sales-per-hour, profit-per-hour, ticket counts (total / multi-item), average sale amount, average items per ticket, % multi-item tickets. Columns: PTD (period-to-date = pay period, user-defined weekly / bi-weekly / semi-monthly), MTD, STD, YTD. Export-as-CSV option.
- **p. 112, Close Salesperson Period** — zeros out the PTD columns at the end of the pay period. Preconditions: run Salesperson Analysis first if paying commission. Per-salesperson or all.

**Print Salesperson File** (Ch. 7 p. 112)
- **p. 112** — flat listing for selected salesperson range; optional "Print Commission Overrides" appendix.

**Close / Clear interactions** (Ch. 8 p. 114)
- **p. 114, Clear Saved Time Clock Data** — purge of saved time-clock records older than a chosen date. (This is a retention concern that lives in `platform` per the registry; `employees` owns the data model, `platform` runs the purge.)

**Users — File Setup (the access-control file)** (Ch. 11 p. 163)
- **p. 163, User** — 1–12 chars alphanumeric, unique. Distinct from Salesperson #.
- **p. 163, Password** — 1–12 chars alphanumeric. Can be rotated per user ID.
- **p. 163, Name** — employee's name, typically mirrors the Salesperson record but not enforced.
- **p. 163, Functions allowed / Functions not allowed** — a two-column picker scoped to *RICS menu options*. Holding `Ctrl` and clicking moves items between columns. RICS's permission model is **deny-list over the menu tree** — by default everything is allowed, and specific menu actions are disabled per user.
- **p. 163, Copy parameters from USER** — clone an existing user's permission layout to a new user. Optionally also copy "reports, super jobs, and printer settings".
- **p. 170, Print — User File** — flat listing; optional "print functions not allowed" appendix.

**Change Sales Passwords — register-side overrides** (Ch. 2 p. 52)
- **p. 52, Manager Password** — prevents Close Batch, Manager Options, Pay Out unless the operator types it. Single shared per-store password; blank = no challenge. Rotated any time, takes effect immediately without closing the batch.
- **p. 52, Ticket Password** — prevents Void, Refund, Price Change, Perks Entry, Discount unless the operator types it. Single shared per-store password; blank = no challenge. RICS notes several sub-actions are individually configurable via `RICS.CFG` ("call Technical Support").
- **p. 35, Void challenge** — `[Alt]+[V]` on the ticket triggers the Ticket Password prompt.
- **p. 1579, Refund / Return challenge** — negative qty on a line triggers the Ticket Password prompt.
- **p. 1627, Pay Out challenge** — Pay Outs prompt Manager Password if set; Cashier is always required, Description validation by `ValidatePayouts` flag (owned by `store-ops`).

**Manager Options — the gated register config** (Ch. 2 pp. 22–23)
- **pp. 22–23** — Manager Options screen itself lives in `sales-pos`; the **permission to open it** and the **password challenge** live here. All of Manager Options (receipt messages, default tender, allow perks, allow discounts, auto-post, cash drawer, etc.) is behind the Manager Password.

**Login to RICS** (Ch. 1 p. 5)
- **p. 5, Logging into RICS** — `User ID` + `Password` → `[Login]`; `[Practice Sales]` spawns a sandbox directory (a RICS-era training mode). Default user `SUPERVISOR` when no User IDs are set up.

## Modernization decisions

- **Employee and User are separate entities, linked by a nullable FK.** RICS keeps Salespeople (Ch. 7) and Users (Ch. 11) entirely separate — by code, by file, by screen — with no database-level link. Zack's Retail keeps the separation but makes it *explicit*: `Employee` and `User` are two tables, and `User.employeeId` is a nullable FK. An employee without a user is someone who rings sales on a shared terminal but never logs in to admin. A user without an employee is an IT admin / contractor. Both are fine. The two tables cross-reference at the application layer, not by unification.
- **RICS deny-list permission model → RBAC role + explicit permission set.** RICS's "Functions allowed / Functions not allowed" (p. 163) is a deny-list keyed to the menu tree, stored per user. Zack's Retail replaces it with:
  - A **small fixed catalog of roles** (`OWNER`, `ADMIN`, `STORE_MANAGER`, `CASHIER`, `BUYER`, `FINANCE`, `VIEWER`).
  - An **explicit permission catalog** (strings like `products.write`, `inventory.adjust`, `sales.refund`) — each is a concept, not a menu path.
  - `RolePermission` (many-to-many) for role → default permission set.
  - `UserPermissionGrant` / `UserPermissionRevoke` (per-user exception rows) for targeted allow/deny over the role default.
  The resulting effective permission set per user = `(role's permissions ∪ explicit grants) \ explicit revokes`. This matches operators' mental model ("cashiers can do X, Y, Z; this particular cashier is also allowed Q") far better than RICS's menu-tree deny-list.
- **Salesperson # stays alive as a human-readable code.** RICS's 4-char `Salesperson #` (p. 106) is muscle-memory for every cashier. Zack's Retail uses `Employee.id: UUID` as the PK and preserves `Employee.salespersonCode: String (1..4 chars, unique)` as the register-facing identifier. Renaming the code is allowed pre-activity; once the employee has any ticket lines or time-clock entries, the code is frozen (emit a domain error; use "Reassign code" as a deliberate admin action that writes an audit row, similar to RICS's dropped Change Salespeople utility).
- **RICS.CFG `[TimeClock] Enabled` + `ReqCashier` → per-store settings on `TimeClockPolicy`.** The `.CFG` global toggles (p. 108) become typed rows on `TimeClockPolicy` (one per store, or a single company-default row). `Enabled` becomes `TimeClockPolicy.enabled`; `ReqCashier` becomes `TimeClockPolicy.requireClockInBeforeSale`. `sales-pos` reads both at ticket-header creation.
- **Passwords are hashed with argon2id. No 12-char RICS max.** RICS stores user and salesperson passwords with a 12-char cap (pp. 107, 163, 6021) — likely plaintext or weak-hash in the original DB. Zack's Retail hashes with argon2id (memory 64MB, iterations 3, parallelism 1 — OWASP 2025 defaults), min length 12, max length 128, no composition rules. Stored in `User.passwordHash` / `Employee.timeClockPinHash` / `SalesPassword.pinHash`.
- **Session = signed HTTP-only cookie, issued by this module, read by `platform`.** No JWT in the browser. Login → `POST /api/v1/auth/login` validates credentials, creates a `Session` row (id, userId, issuedAt, expiresAt, lastSeenAt, ip, userAgent, mfaVerified?, storeId? register context?, revokedAt?), and sets a `Set-Cookie: zr_session=<signed-id>; HttpOnly; Secure; SameSite=Lax; Path=/`. Server-side session store is the source of truth; the cookie is just a lookup key. `platform`'s auth middleware reads the cookie, loads the session, attaches `req.user` + `req.permissions` to the request.
- **MFA is optional TOTP, enforced per role.** Any user can add a TOTP authenticator; `OWNER`, `ADMIN`, and `FINANCE` roles **require** it. MFA-required roles cannot skip the second factor on login. Recovery via admin reset (not self-service SMS). Backup codes issued once, hashed + single-use.
- **Password reset = admin-reset + email-token, not self-service secret questions.** A user who forgets their password requests a reset; an `ADMIN` or `OWNER` triggers a reset, which emails a one-time token (15-min expiry) that lets the user set a new password. Legacy RICS had no self-service flow at all — this is new. Tokens are one-time and invalidated on use or admin revoke.
- **Session invalidation on role or permission change.** When a user's `roleId` changes or their explicit grants/revokes list changes, all active sessions for that user are marked `revokedAt = now()` and the user is forced to re-authenticate. Prevents privilege drift mid-session. Token-refresh doesn't exist — sessions have hard expiry and are re-issued on login.
- **Sales Password becomes per-employee, scope-tagged, with rate limit + lockout.** RICS's Change Sales Passwords (p. 52) stores **two shared passwords per store** — Manager + Ticket — rotated at the cashier's convenience. Zack's Retail replaces that shared-password model with a modern primary model:
  - **Per-employee `SalesPassword`** — a short PIN (4–8 digits, argon2id-hashed) attached to `Employee`. Distinct from the User login password.
  - **Scope enum** — `MANAGER_OVERRIDE | VOID | REFUND | PRICE_OVERRIDE | PERKS_EDIT | DISCOUNT | NO_SALE | REPRINT | CLOSE_BATCH | PAY_OUT`. An employee's PIN grants zero-or-more of these scopes; a manager's PIN typically grants all; a cashier's PIN typically grants `NO_SALE` only.
  - **Rate limit**: 5 attempts per (employeeId, scope) per 10 minutes; after 5 failures the PIN is locked for 30 minutes. After 10 failures in 24 hours the PIN is revoked and an admin must re-issue.
  - **Audit**: every verify (pass or fail) writes a `SalesPasswordAudit` row with `employeeId`, `scope`, `ticketId?`, `outcome`, `actorCashierId` (the *cashier* who invoked the challenge, not necessarily the employee whose PIN was typed), `ip`, `createdAt`.
  - **Not a session**: verify returns a short-lived (60 sec) opaque `overrideToken`; `sales-pos` attaches that token to the single ticket action; replaying the token elsewhere fails.
  There is no supported shared per-store password compatibility layer; Enter Sales challenges use the employee-scoped PIN path.
- **Commission base (sales vs. profit) lives on `Employee`, not on overrides.** Matches RICS p. 111: the rate base is inherited, only the rate number is overridden. Keeps override rows small.
- **Override precedence: SKU-level > Category-level > Department-level > Employee default.** RICS specifies Department-level overrides only (p. 111). Zack's Retail generalizes to also allow Category and SKU-level overrides — useful for a buyer who wants to push a specific item or category. Precedence resolves deterministically at ticket-line commit time: first hit wins.
- **Sales perks accrue on ticket-line commit via `employees` subscribing to `sales-pos` events.** RICS auto-posts SKU perks to the salesperson at sale time by direct table write (p. 155 + p. 4223). Zack's Retail has `employees` subscribe to `SaleLineCommittedEvent` (emitted by `sales-pos`), compute the perk amount (SKU's `perksAmount` × line qty for positive qty; negative qty reverses), and write a `CommissionLedgerEntry` + a `PerksLedgerEntry`. Clean contract, no cross-module table writes.
- **Close Salesperson Period becomes a signed period-close, not a destructive zero-out.** RICS's Close Salesperson Period (p. 112) *clears* the PTD columns. Zack's Retail implements it as:
  - An `EmployeePeriod` row with `closedAt`, `closedByUserId`, `commissionTotal`, `perksTotal`, `hoursTotal`, `ticketCount`, `netSalesTotal`, `profitTotal`, `paidAt?`, and `lockedThrough` (the inclusive end date).
  - On close, all `CommissionLedgerEntry` + `PerksLedgerEntry` + `TimeClockEntry` rows with `occurredAt <= lockedThrough` are **locked** — they can no longer be edited / adjusted.
  - The "PTD" display becomes a view over ledger entries `> lastClosedPeriod.lockedThrough`.
  - Destructive clear goes away; retention of old ledger rows is a retention-policy concern in `platform`.
- **"Non-Sales Hours" preserved as a per-entry flag, visible on reports.** RICS's `Non-Sales Hours` checkbox on log-in/log-out (p. 108) survives as `TimeClockEntry.nonSales: boolean`, subtracted from "sales hours" for the sales-per-hour calc on Salesperson Analysis.
- **Missed-logout auto-close at 24-hour mark.** RICS caps continuous clock-ins at 24 hours (p. 106); beyond that the hours don't credit. Zack's Retail runs a scheduled task in `platform` that auto-closes any `TimeClockEntry` open > 24 hours, flagging it `autoClosedMissedLogout = true`; the entry counts 0 hours (matches RICS "not credited") but persists for the admin reconciliation screen.
- **Multi-store clock-ins — one active entry per employee, across all stores.** An employee can only have one open `TimeClockEntry` at a time, globally. Attempting to clock in at Store B while still clocked in at Store A either (a) emits an error, or (b) auto-clocks-out at A and clocks in at B — configurable via `TimeClockPolicy.multiStorePolicy ∈ { REJECT | TRANSFER }` (default `REJECT`). See open questions.
- **Time Clock Administrator becomes a permission, not a boolean on the employee record.** RICS's two checkboxes on Enter Salespeople (p. 107) are replaced by two explicit permissions: `timeclock.admin` (clock anyone, adjust anyone's records) and `timeclock.self` (clock self only). The four RICS combos map to permission bundles in the role catalog.
- **Practice Sales mode is out of scope for v1.** RICS's `[Practice Sales]` button (p. 531) forked the DB to a sandbox directory. Zack's Retail will eventually support a training environment, but that's a `platform` concern (environment provisioning), not an `employees` concern. Not in v1.
- **`SUPERVISOR` default user is replaced by an installer-generated `OWNER` account.** RICS's default-to-`SUPERVISOR` (p. 6887) is a no-auth back-door. On first install, the operator is prompted to create the first `OWNER` user; no anonymous `SUPERVISOR` login ever exists.
- **Copy parameters from USER (p. 163) becomes "Clone Role" + "Copy User Grants".** Role cloning is a role-admin action; per-user grants/revokes can be bulk-copied from one user to another in the admin UI as a convenience, with audit.
- **No "printer setup per user" (p. 163 Copy parameters mention of "reports, super jobs, and printer settings").** Printer and saved-report preferences are user preferences in `platform`, not part of the user's permission record.

## Data model sketch

```prisma
// --- Employee (salesperson core) ----------------------------------------

model Employee {
  id                 String   @id @default(uuid())
  salespersonCode    String   @unique                  // RICS "Salesperson #", 1..4 chars (p. 106)
  name               String                             // (p. 106)
  otherInformation   String?                            // free-text (title, SSN, phone) (p. 106)
  hireDate           DateTime?
  terminatedAt       DateTime?
  active             Boolean  @default(true)

  // Commission + perks defaults
  commissionRate     Decimal?                           // default % (p. 106); null = no commission
  commissionBase     CommissionBase @default(NET_SALES) // NET_SALES | GROSS_PROFIT (p. 106)
  hourlyRate         Decimal?                           // if applicable (used for payroll export later)

  // Time clock linkage
  timeClockPinHash   String?                            // argon2id; null = cannot self-clock (p. 107)
  timeClockEnabled   Boolean  @default(true)

  // Preferred store for reports / defaults (not a hard constraint)
  homeStoreId        String?

  // Optional linkage to a login account
  userId             String?  @unique                   // FK User — nullable (see Modernization)

  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  commissionOverrides CommissionOverride[]
  timeClockEntries    TimeClockEntry[]
  salesPasswords      SalesPassword[]
  employeePeriods     EmployeePeriod[]
  @@index([active])
}

enum CommissionBase { NET_SALES  GROSS_PROFIT }

// --- User (login principal) --------------------------------------------

model User {
  id              String   @id @default(uuid())
  email           String   @unique                     // login identifier (modern; RICS used a 12-char user code)
  userCode        String?  @unique                     // legacy RICS-style 1..12-char user ID (p. 163) — optional
  displayName     String                                // (p. 163 Name)
  passwordHash    String                                // argon2id
  mfaTotpSecret   String?                               // encrypted at rest
  mfaEnrolledAt   DateTime?
  active          Boolean  @default(true)
  mustResetPassword Boolean @default(false)
  lockedUntil     DateTime?                             // login brute-force lockout
  failedLoginCount Int     @default(0)
  lastLoginAt     DateTime?
  lastLoginIp     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  createdByUserId String?
  disabledAt      DateTime?
  disabledByUserId String?

  roleId          String                                // every user has exactly one role
  role            Role @relation(fields: [roleId], references: [id])

  employee        Employee?                             // reverse of Employee.userId

  grants          UserPermissionGrant[]
  revokes         UserPermissionRevoke[]
  sessions        Session[]
  passwordResets  PasswordResetToken[]
  @@index([active])
}

// --- Role + Permission catalog ------------------------------------------

model Role {
  id            String   @id @default(uuid())
  code          String   @unique                       // OWNER, ADMIN, STORE_MANAGER, CASHIER, BUYER, FINANCE, VIEWER
  name          String
  description   String?
  mfaRequired   Boolean  @default(false)
  builtIn       Boolean  @default(false)               // true for seeded roles; blocks deletion
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  rolePermissions RolePermission[]
  users           User[]
}

model Permission {
  id       String @id @default(uuid())
  code     String @unique                              // e.g. "products.write"
  group    String                                      // "products" | "inventory" | "sales" | "employees" | ...
  label    String                                      // human-readable label
  description String?
  builtIn  Boolean @default(true)
}

model RolePermission {
  roleId       String
  permissionId String
  @@id([roleId, permissionId])
  role       Role       @relation(fields: [roleId], references: [id])
  permission Permission @relation(fields: [permissionId], references: [id])
}

model UserPermissionGrant {                            // per-user addition to the role default
  userId       String
  permissionId String
  grantedAt    DateTime @default(now())
  grantedByUserId String
  note         String?
  @@id([userId, permissionId])
}

model UserPermissionRevoke {                           // per-user subtraction from the role default
  userId       String
  permissionId String
  revokedAt    DateTime @default(now())
  revokedByUserId String
  note         String?
  @@id([userId, permissionId])
}

// --- Sessions + Password Reset + MFA backup ------------------------------

model Session {
  id              String   @id @default(uuid())        // stored in signed cookie
  userId          String
  issuedAt        DateTime @default(now())
  expiresAt       DateTime
  lastSeenAt      DateTime @default(now())
  ip              String?
  userAgent       String?
  mfaVerified     Boolean  @default(false)
  storeId         String?                              // register context — set by POS login
  registerId      String?
  revokedAt       DateTime?
  revokeReason    SessionRevokeReason?
  @@index([userId, expiresAt])
  @@index([expiresAt])
}

enum SessionRevokeReason {
  LOGOUT  ROLE_CHANGED  PERMISSIONS_CHANGED  ADMIN_REVOKED  EXPIRED  PASSWORD_CHANGED
}

model PasswordResetToken {
  id             String   @id @default(uuid())
  userId         String
  tokenHash      String                                // argon2id hash of the emailed token
  issuedAt       DateTime @default(now())
  issuedByUserId String                                // admin who triggered the reset
  expiresAt      DateTime
  consumedAt     DateTime?
  revokedAt      DateTime?
  @@index([userId, expiresAt])
}

model MfaBackupCode {
  id         String  @id @default(uuid())
  userId     String
  codeHash   String                                    // argon2id; single-use
  consumedAt DateTime?
  createdAt  DateTime @default(now())
  @@index([userId])
}

// --- Sales Password (per-employee override PIN) --------------------------

model SalesPassword {                                  // per-employee, scope-tagged (modernizes p. 52)
  id             String   @id @default(uuid())
  employeeId     String
  pinHash        String                                // argon2id
  pinHint        String?                               // optional operator-visible hint (not the PIN itself)
  scopes         SalesPasswordScope[]                  // what this PIN authorizes
  storeId        String?                               // null = all stores; set = scoped to one store
  active         Boolean  @default(true)
  lockedUntil    DateTime?
  failedAttempts24h Int    @default(0)
  issuedAt       DateTime @default(now())
  issuedByUserId String
  rotatedAt      DateTime?
  rotatedByUserId String?

  employee Employee @relation(fields: [employeeId], references: [id])
  @@index([employeeId, active])
  @@index([storeId])
}

enum SalesPasswordScope {
  MANAGER_OVERRIDE
  VOID                 // mid-ticket void (p. 35) and post-end void (p. 51)
  REFUND               // negative-qty line (p. 1579)
  PRICE_OVERRIDE       // change unit price at line (p. 52 Ticket Password gates)
  PERKS_EDIT
  DISCOUNT
  NO_SALE              // open drawer without a sale
  REPRINT
  CLOSE_BATCH          // p. 52 Manager Password
  PAY_OUT              // p. 1627 Pay Outs
  MANAGER_OPTIONS      // open Manager Options (p. 22)
}

model SalesPasswordAudit {                             // every verify attempt — pass or fail
  id              String   @id @default(uuid())
  employeeId      String?                              // null if lookup failed (unknown employee)
  scope           SalesPasswordScope
  outcome         SalesPasswordOutcome                 // GRANTED | DENIED_WRONG_PIN | DENIED_LOCKED | DENIED_SCOPE | DENIED_UNKNOWN_EMPLOYEE
  invokingUserId  String                               // cashier who invoked the challenge
  ticketId        String?
  storeId         String?
  registerId      String?
  overrideTokenId String?                              // if GRANTED, FK OverrideToken
  ip              String?
  createdAt       DateTime @default(now())
  @@index([employeeId, createdAt])
  @@index([scope, createdAt])
}

enum SalesPasswordOutcome {
  GRANTED
  DENIED_WRONG_PIN
  DENIED_LOCKED
  DENIED_SCOPE
  DENIED_UNKNOWN_EMPLOYEE
}

model OverrideToken {                                  // short-lived, one-shot token attached to a ticket action
  id             String   @id @default(uuid())
  employeeId     String                                // whose PIN authorized
  scope          SalesPasswordScope
  ticketId       String?                               // target ticket (for single-ticket scope)
  expiresAt      DateTime                              // 60 s default
  consumedAt     DateTime?
  consumedAction String?                               // what the caller actually did (e.g., "LINE_PRICE_OVERRIDE")
  createdAt      DateTime @default(now())
  @@index([expiresAt])
}

// --- Time Clock --------------------------------------------------------

model TimeClockPolicy {                                // replaces RICS.CFG [TimeClock] (p. 108)
  id                        String   @id @default(uuid())
  storeId                   String?                   // null = company-default; per-store override otherwise
  enabled                   Boolean  @default(false)
  requireClockInBeforeSale  Boolean  @default(false)
  multiStorePolicy          MultiStorePolicy @default(REJECT)
  roundingMode              TimeRoundingMode @default(EXACT)
  roundingInterval          Int?                      // minutes; used if roundingMode = ROUND_NEAREST
  breakKind                 BreakKind @default(NON_SALES_FLAG)
  autoCloseAfterHours       Int      @default(24)     // matches RICS 24-h cap (p. 106)
  updatedAt                 DateTime @updatedAt
  updatedByUserId           String?
  @@unique([storeId])
}

enum MultiStorePolicy   { REJECT  TRANSFER }
enum TimeRoundingMode   { EXACT  ROUND_NEAREST }
enum BreakKind          { NON_SALES_FLAG  EXPLICIT_BREAK_ENTRY }

model TimeClockEntry {                                 // a single clock-in/clock-out pair (pp. 107–108)
  id                 String   @id @default(uuid())
  employeeId         String
  storeId            String                             // (p. 108 multi-store field)
  clockInAt          DateTime
  clockInByUserId    String                             // who submitted the clock-in (may = employee or admin)
  clockOutAt         DateTime?
  clockOutByUserId   String?
  nonSales           Boolean  @default(false)           // Non-Sales Hours flag (p. 108)
  computedHours      Decimal?                           // fractional hours, populated on clock-out
  autoClosedMissedLogout Boolean @default(false)        // true if auto-closed at 24-h cap (p. 106)
  adjustmentOfEntryId String?                           // FK self — admin adjustment entries reference the original
  adjustmentReason    String?
  lockedByPeriodId    String?                           // set when EmployeePeriod closes through this date
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  employee Employee @relation(fields: [employeeId], references: [id])
  @@index([employeeId, clockInAt])
  @@index([storeId, clockInAt])
  @@index([clockOutAt])
}

// --- Commission + Perks ledgers (replaces RICS PTD/MTD/STD/YTD rollups) ---

model CommissionOverride {                             // p. 111
  id           String   @id @default(uuid())
  employeeId   String
  scope        OverrideScope                          // SKU | CATEGORY | DEPARTMENT
  skuId        String?
  categoryId   String?
  departmentId String?
  rate         Decimal                                 // p. 111; base inherited from Employee.commissionBase
  effectiveFrom DateTime @default(now())
  effectiveTo   DateTime?
  createdByUserId String
  createdAt     DateTime @default(now())

  employee Employee @relation(fields: [employeeId], references: [id])
  @@index([employeeId, scope])
  @@index([effectiveFrom, effectiveTo])
}

enum OverrideScope { SKU  CATEGORY  DEPARTMENT }

model CommissionLedgerEntry {                          // one row per committed sale-line's commission contribution
  id                String   @id @default(uuid())
  employeeId        String
  ticketId          String
  ticketLineId      String
  storeId           String
  occurredAt        DateTime
  basisKind         CommissionBase                    // snapshot of employee.commissionBase at sale time
  basisAmount       Decimal                            // net-sales amount or gross-profit amount
  appliedRate       Decimal                            // actual rate applied after precedence resolution
  commissionAmount  Decimal                            // basisAmount * appliedRate
  overrideSourceId  String?                            // FK CommissionOverride when an override applied
  lockedByPeriodId  String?                            // set when EmployeePeriod closes
  createdAt         DateTime @default(now())
  @@index([employeeId, occurredAt])
  @@index([ticketId])
}

model PerksLedgerEntry {                               // per SKU perks (products.p. 155) per sale-line
  id             String   @id @default(uuid())
  employeeId     String
  ticketId       String
  ticketLineId   String
  storeId        String
  occurredAt     DateTime
  perksAmount    Decimal                               // snapshot of sku.perksAmount × line qty
  lockedByPeriodId String?
  createdAt      DateTime @default(now())
  @@index([employeeId, occurredAt])
}

model HoursPerksManualEntry {                          // p. 111 — used when time clock is off
  id            String   @id @default(uuid())
  employeeId    String
  entryDate     DateTime                               // date of the hours
  hours         Decimal
  perksAmount   Decimal   @default(0)
  kind          ManualEntryKind                        // HOURS | PERKS | BOTH
  note          String?
  enteredByUserId String
  lockedByPeriodId String?
  createdAt     DateTime @default(now())
  @@index([employeeId, entryDate])
}

enum ManualEntryKind { HOURS  PERKS  BOTH }

// --- Salesperson period close (replaces RICS p. 112) -----------------------

model EmployeePeriod {                                 // p. 112 — a closed pay period, snapshotted
  id                 String   @id @default(uuid())
  employeeId         String
  periodLabel        String                            // e.g., "2026-W15" or "2026-04-A"
  periodKind         PeriodKind                        // WEEKLY | BIWEEKLY | SEMIMONTHLY | MONTHLY | ARBITRARY
  lockedThrough      DateTime                          // inclusive end date; all ledger rows <= this are locked
  openedAt           DateTime @default(now())
  closedAt           DateTime?
  closedByUserId     String?

  // Snapshot totals at close (derived from ledger — stored for auditability)
  commissionTotal    Decimal?
  perksTotal         Decimal?
  hoursTotal         Decimal?
  netSalesTotal      Decimal?
  profitTotal        Decimal?
  ticketCount        Int?
  multiItemTicketCount Int?
  salesPerHour       Decimal?

  paidAt             DateTime?                         // optional — downstream payroll marks this
  paidReference      String?

  employee Employee @relation(fields: [employeeId], references: [id])
  @@index([employeeId, closedAt])
  @@unique([employeeId, periodLabel])
}

enum PeriodKind { WEEKLY  BIWEEKLY  SEMIMONTHLY  MONTHLY  ARBITRARY }

// --- Audit ---------------------------------------------------------------

model EmployeesAuditEvent {                            // module-wide audit; complements SalesPasswordAudit
  id          String   @id @default(uuid())
  entity      String                                    // "User" | "Employee" | "Role" | "SalesPassword" | ...
  entityId    String
  action      AuditAction
  actorUserId String
  beforeJson  Json?
  afterJson   Json?
  createdAt   DateTime @default(now())
  @@index([entity, entityId])
  @@index([createdAt])
}

enum AuditAction {
  CREATED  UPDATED  DELETED  ACTIVATED  DEACTIVATED
  PASSWORD_RESET  PASSWORD_CHANGED  ROLE_CHANGED  MFA_ENROLLED  MFA_RESET
  SESSION_REVOKED  PERIOD_CLOSED  PERIOD_REOPENED  PIN_ISSUED  PIN_REVOKED
}
```

**Invariants**
- `Employee.salespersonCode` is immutable once any `CommissionLedgerEntry`, `TimeClockEntry`, or `SalesTicketLine` references the employee. Service layer enforces; attempts return `EMPLOYEE_CODE_FROZEN`.
- `Employee.userId` is nullable and unique — an Employee links to at most one User, and a User links to at most one Employee.
- `User.email` is always lowercased on write. `User.userCode` is optional; if present, unique.
- `User.roleId` is required; deleting a Role requires that no Users reference it (or a bulk-reassign migration step).
- `Session.expiresAt > issuedAt`, and `revokedAt`, when set, must be ≥ `issuedAt`.
- `PasswordResetToken.tokenHash` is one-shot — consumed tokens cannot be reused; on consumption, all other active reset tokens for that user are also revoked.
- `SalesPassword.scopes` is non-empty. At most one `active = true` SalesPassword per `(employeeId, storeId)` — rotation writes a new row and deactivates the old one.
- `OverrideToken.expiresAt = issuedAt + 60 s` by default; `consumedAt` once set is permanent.
- `TimeClockEntry`: for any given `employeeId`, at most one entry with `clockOutAt IS NULL` across all stores.
- `TimeClockEntry.clockOutAt ≥ clockInAt`; when both set, `computedHours = (clockOutAt - clockInAt) / 3600` (after rounding per `TimeClockPolicy.roundingMode`).
- `CommissionLedgerEntry.lockedByPeriodId` is set iff the entry is `<= EmployeePeriod.lockedThrough` for a closed period; once set it cannot be edited.
- `EmployeePeriod`: at most one open period per `employeeId`. Closing a period sets `closedAt` and locks all ledger entries with `occurredAt <= lockedThrough`.
- Built-in roles (`builtIn = true`) cannot be deleted; their permission set can be edited but the code cannot be changed.

## Auth model (the identity side)

**In-scope here** — credential storage, session issue, permission catalog, MFA enrollment, password rotation, admin-reset flow, audit of auth events.

**Out-of-scope — `platform` owns** — the Express middleware that reads `Cookie: zr_session=…`, loads the `Session`, hydrates `req.user` + `req.permissions`, and short-circuits unauthorized requests. The middleware's shape:

```
// lives in apps/api/src/middleware/auth.ts (platform)
// pseudo-code signature, not implementation
function authMiddleware(req, res, next) {
  const session = employeesContract.resolveSession(req.cookies.zr_session);
  if (!session) return res.status(401).end();
  req.user = session.user;
  req.permissions = session.permissions; // Set<PermissionCode>
  next();
}
function require(perm: string) {
  return (req, res, next) => req.permissions.has(perm) ? next() : res.status(403).end();
}
```

`employees` exposes `resolveSession(signedId)` on its contract adapter. The middleware's job is to enforce; `employees`'s job is to answer "who holds this cookie, what can they do".

**Login flow** — `POST /api/v1/auth/login { email, password, mfaCode? }`:
1. Load user by email (case-insensitive). If no user, argon2id-verify against a dummy hash to keep response time constant-ish (timing-attack mitigation).
2. Check `user.lockedUntil`; 423 if locked.
3. argon2id-verify password.
4. If role requires MFA and `user.mfaTotpSecret` set: require `mfaCode`; verify TOTP window ±1.
5. Zero `failedLoginCount`; create `Session` row; set signed cookie; emit `UserLoggedInEvent`.
6. On failure: increment `failedLoginCount`; after 10 failures set `lockedUntil = now + 15 min`; audit `PASSWORD_CHANGED`-kin events.

**MFA enrollment** — TOTP (RFC 6238), SHA-1 (Google Authenticator default), 6-digit, 30-s window, ±1 window tolerance. Enrollment flow: issue secret → show QR → verify first code → persist `mfaTotpSecret` encrypted at rest with a KMS-sourced key (or env-provided master key in local dev). Issue 10 backup codes (`MfaBackupCode`), single-use.

**Password rotation** — `PUT /api/v1/users/me/password { currentPassword, newPassword }`. Revokes all sessions other than the current one on success. On admin-forced reset (`POST /api/v1/users/:id/password-reset`): email a signed token, which the user exchanges at `POST /api/v1/auth/password-reset { token, newPassword }`. All sessions for that user revoked on success.

**Session revocation** — automatic on role change, permissions change, password change, MFA reset. Admins can revoke individual sessions (`POST /api/v1/sessions/:id/revoke`) or all sessions for a user (`POST /api/v1/users/:id/sessions/revoke-all`).

## Sales password model (the override side)

A **sales password** is *not* a session. It is a challenge-response for a single POS action. Flow:

1. Cashier (already logged in as `User`) initiates a restricted action — e.g., voids a ticket line with a manager-priced override.
2. `sales-pos` renders a modal: "Enter manager PIN".
3. Employee (typically a manager, could be the cashier themselves if they have the scope) types their 4–8-digit PIN.
4. `sales-pos` calls `POST /api/v1/employees/sales-passwords/verify { pin, scope: 'PRICE_OVERRIDE', ticketId, storeId, invokingUserId }`.
5. `employees` service:
   - Looks up `SalesPassword` rows matching the PIN hash (there may be several employees with different scopes; the match is by PIN hash, scope-filtered). If the PIN matches more than one active record, the oldest wins and the match is logged.
   - Checks `scope ∈ SalesPassword.scopes`, `active = true`, `lockedUntil` not in future, `failedAttempts24h < 10`.
   - On match + scope ok: issues `OverrideToken` with `expiresAt = now + 60s`, writes `SalesPasswordAudit { outcome = GRANTED }`, returns `{ granted: true, overrideToken }`.
   - On mismatch: increments counters, writes `SalesPasswordAudit { outcome = DENIED_* }`, returns `{ granted: false, reason }`.
6. `sales-pos` includes the `overrideToken` on the next protected mutation (e.g., `POST /tickets/:id/lines/:lineId/price-override { overrideToken, newPrice }`).
7. The protected endpoint calls `employees.consumeOverrideToken({ overrideToken, scope, ticketId, action })` — which verifies `scope`, `ticketId` match, marks `consumedAt`, and returns the `employeeId` that authorized the override. That `employeeId` is attached to the audit row on the ticket action.
8. Token is single-use; replay returns `TOKEN_CONSUMED`.

**Rate limit** — per `(employeeId, scope)` sliding window: 5 failed attempts per 10 minutes → `lockedUntil = now + 30 min`. 10 failed attempts in 24 hours → `active = false`, requires admin re-issue. Applies to unknown-PIN attempts keyed by `(invokingUserId, scope)`.

**Compatibility stance** — supported POS flows use the per-employee PIN and override-token path only. There is no separate store-shared password layer in the supported runtime.

## Time clock (the hours side)

- **Clock in** — `POST /api/v1/employees/time-clock/clock-in { employeeId, storeId, nonSales?, pin? }`. If `TimeClockPolicy.enabled = false`, 404 the route. If employee has no `timeClockPinHash`, the PIN is not required but `clockInByUserId` must have `timeclock.admin` or `timeclock.clock-others` permission. If employee has a PIN and the caller is clocking themselves, the PIN is required. Rejects if the employee already has an open `TimeClockEntry` (honoring `TimeClockPolicy.multiStorePolicy`).
- **Clock out** — `POST /api/v1/employees/time-clock/clock-out { employeeId, pin? }`. Writes `clockOutAt`, computes hours, emits `TimeClockClockedOutEvent`.
- **Admin adjustment** — `POST /api/v1/employees/time-clock/entries/:id/adjust { clockInAt?, clockOutAt?, nonSales?, reason }`. Requires `timeclock.admin`; writes a new adjusting `TimeClockEntry` with `adjustmentOfEntryId` set to the original (RICS-style reversing entry pattern, p. 4192). Rejected if the entry is locked by a closed `EmployeePeriod`.
- **States** — an entry is `OPEN` (`clockOutAt = null`), `CLOSED` (`clockOutAt set`, `autoClosedMissedLogout = false`), `MISSED_LOGOUT` (`clockOutAt set`, `autoClosedMissedLogout = true`, `computedHours = 0`), `ADJUSTMENT` (`adjustmentOfEntryId` set), or `LOCKED` (`lockedByPeriodId` set).
- **Rounding** — if `TimeClockPolicy.roundingMode = ROUND_NEAREST`, compute hours rounded to the nearest `roundingInterval` minutes; otherwise exact to the second. RICS itself doesn't specify rounding (p. 110 just gives the 0.x → minutes formula); defaulting to exact matches the manual.
- **Break handling** — two modes via `TimeClockPolicy.breakKind`:
  - `NON_SALES_FLAG` (default) — employee stays clocked in; supervisor toggles `nonSales = true` on subsequent clock entries to flag break hours, subtracted from sales-hours on reports. Matches RICS p. 108's Non-Sales Hours pattern.
  - `EXPLICIT_BREAK_ENTRY` — employee clocks out for break and back in; the interim `TimeClockEntry` is tagged `nonSales = true`.
- **Missed logout** — scheduled task in `platform` runs every 5 minutes; any open entry with `clockInAt < now - 24h` is auto-closed with `autoClosedMissedLogout = true` and `computedHours = 0` (no credit, matching RICS p. 106).
- **Print Time Clock Data** (RICS p. 110) — `GET /api/v1/reports/time-clock?from=&to=&employeeIds=&storeIds=&detail=true|false&format=csv|pdf`. Detail mode prints per-entry rows; summary prints roll-up by employee.

## Commission + perks (the pay-math side)

- **Precedence** — at `SaleLineCommittedEvent` time, `employees` resolves the applicable rate:
  1. If an active `CommissionOverride` exists with `scope = SKU, skuId = line.skuId`, use it.
  2. Else if `scope = CATEGORY, categoryId = line.categoryId`, use it.
  3. Else if `scope = DEPARTMENT, departmentId = line.departmentId`, use it.
  4. Else use `Employee.commissionRate`.
- **Basis** — `Employee.commissionBase` determines what the rate applies to: `NET_SALES` = `line.extendedNet`; `GROSS_PROFIT` = `line.extendedNet - line.extendedCost` (cost snapshotted on the ticket line by `sales-pos` via `products.getAverageCost(skuId, storeId, now)`).
- **Ledger write** — one `CommissionLedgerEntry` per ticket-line, even for zero-rate employees (writes with `rate = 0`), for ledger completeness.
- **Reversal** — on `TicketLineVoidedEvent` or `TicketVoidedEvent`, write a reversing `CommissionLedgerEntry` with negated amounts. Do not delete; the ledger is append-only.
- **Perks** — at line commit, read SKU's `perksAmount` (via `products` contract), write `PerksLedgerEntry` with `perksAmount = sku.perksAmount × line.quantity` (reverses on negative qty / void).
- **Ambiguity flagged in manual** — RICS p. 111 doesn't say whether returns reduce PTD commission (reversing rows) or whether returns have zero commission. Zack's Retail: returns write a reversing `CommissionLedgerEntry` (so PTD reflects net commissionable activity); document this in onboarding. See open questions.
- **Close Salesperson Period** — `POST /api/v1/employees/:id/periods/close { periodKind, lockedThrough, note? }`. Computes totals from ledger WHERE `occurredAt <= lockedThrough AND lockedByPeriodId IS NULL`. Writes `EmployeePeriod` row; updates all matching ledger rows with `lockedByPeriodId`. Emits `EmployeePeriodClosedEvent`. Idempotent via `(employeeId, periodLabel)` unique constraint.
- **Reopen** — `POST /api/v1/employees/:id/periods/:periodId/reopen { reason }`. Unlocks ledger rows, clears `EmployeePeriod.closedAt`. Requires `employees.period.reopen` permission (narrow: finance lead only). Heavily audited.

## Permission catalog (the seed)

A minimum viable permission set that aligns with every other module in the registry. Permissions are strings keyed by `group.action`.

| Code                         | Group             | Typical roles |
|---|---|---|
| `products.read`              | products          | all non-VIEWER |
| `products.write`             | products          | ADMIN, BUYER |
| `products.price.schedule`    | products          | ADMIN, BUYER |
| `inventory.read`             | inventory         | all |
| `inventory.adjust`           | inventory         | ADMIN, STORE_MANAGER |
| `inventory.transfer.manual`  | inventory         | ADMIN, STORE_MANAGER |
| `purchasing.read`            | purchasing        | ADMIN, BUYER, STORE_MANAGER |
| `purchasing.write`           | purchasing        | ADMIN, BUYER |
| `purchasing.approve`         | purchasing        | ADMIN, BUYER |
| `purchasing.receive`         | purchasing        | ADMIN, STORE_MANAGER |
| `otb.read`                   | otb               | ADMIN, BUYER, FINANCE |
| `otb.edit`                   | otb               | ADMIN, BUYER |
| `sales.ring`                 | sales             | CASHIER, STORE_MANAGER |
| `sales.refund`               | sales             | STORE_MANAGER (or via sales-password scope) |
| `sales.void`                 | sales             | STORE_MANAGER (or via sales-password scope) |
| `sales.manager_options`      | sales             | STORE_MANAGER, OWNER |
| `sales.close_batch`          | sales             | STORE_MANAGER |
| `sales.post`                 | sales             | STORE_MANAGER, ADMIN |
| `customer_transactions.*`    | customer-transactions | same as sales |
| `crm.read`                   | crm               | all |
| `crm.write`                  | crm               | STORE_MANAGER, ADMIN |
| `accounts_receivable.read`   | accounts-receivable | FINANCE, ADMIN |
| `accounts_receivable.post_payment` | accounts-receivable | FINANCE |
| `accounts_receivable.close_period` | accounts-receivable | FINANCE |
| `employees.read`             | employees         | STORE_MANAGER, ADMIN |
| `employees.manage`           | employees         | ADMIN, OWNER |
| `employees.period.close`     | employees         | FINANCE, ADMIN |
| `employees.period.reopen`    | employees         | FINANCE |
| `employees.sales_password.issue` | employees     | STORE_MANAGER, ADMIN |
| `timeclock.admin`            | employees         | STORE_MANAGER, ADMIN |
| `timeclock.clock_others`     | employees         | STORE_MANAGER |
| `timeclock.self`             | employees         | all employees |
| `store_ops.read`             | store-ops         | all |
| `store_ops.configure`        | store-ops         | ADMIN, OWNER |
| `reports.view`               | reports           | all except CASHIER by default |
| `reports.view.financial`     | reports           | FINANCE, ADMIN, OWNER |
| `platform.audit.view`        | platform          | ADMIN, OWNER |
| `platform.settings.configure`| platform          | ADMIN, OWNER |

Seed roles:
- **OWNER** — all permissions, `mfaRequired = true`.
- **ADMIN** — all except destructive `platform.settings.configure` subset, `mfaRequired = true`.
- **FINANCE** — `accounts_receivable.*`, `reports.view.financial`, `otb.read`, `employees.period.*`, `mfaRequired = true`.
- **BUYER** — `products.write`, `purchasing.write`, `purchasing.approve`, `otb.edit`.
- **STORE_MANAGER** — sales + inventory + timeclock.admin + crm.write at their store.
- **CASHIER** — `sales.ring`, `crm.read`, `timeclock.self`, `products.read`, `inventory.read`.
- **VIEWER** — read-only: `*.read` across the board.

## Surfaces

### Admin screens (web UI in `apps/web`)

- **Employees — list** — columns: `Salesperson Code`, `Name`, `Home Store`, `Active`, `Has User`, `Has PIN`, `Default Commission %`, `Last Ticket`. Filter by active/store. Actions: New Employee, Bulk Deactivate, Export CSV.
- **Employee — detail** — tabbed editor:
  - **General** — code (read-only once activity exists), name, other-info, hire date, home store, active.
  - **Commission** — default rate, base (NET_SALES vs. GROSS_PROFIT), list of `CommissionOverride` rows with add/edit/end-date.
  - **Time Clock** — PIN set/rotate, time-clock-admin flag (via permission grants), clock-others flag (via permission grants), timeClockEnabled.
  - **Sales Passwords** — list of `SalesPassword` rows (scopes, store, active, locked state), actions to issue / rotate / revoke. PIN itself is not displayed after issue.
  - **Linked User** — picker to link / unlink a `User` (shows candidate list; creating a new user from here is a one-click action that pre-fills email with `<code>@...` placeholder).
  - **Periods** — list of `EmployeePeriod` rows (open + closed), "Close Current Period" button, per-period drilldown to ledger entries.
  - **Hours / Perks (manual)** — entry screen when time clock is off; read-only-but-filterable when on.
- **Salesperson Analysis Report** (RICS p. 111) — multi-employee report UI. Filters: date range / period kind (weekly/biweekly/semimonthly/monthly) / store / active-only. Columns: PTD / MTD / STD / YTD for sales, profit, commission, perks, hours, sales-per-hour, profit-per-hour, ticket counts. Export CSV.
- **Close Salesperson Period** (RICS p. 112) — bulk close: pick period kind + lockedThrough + employees; preview totals; confirm. Warns if time-clock entries are still open.
- **Print Salesperson File** (RICS p. 112) — now a list-view export. Optional "Include Commission Overrides".
- **Users — list** — columns: email, displayName, role, active, mfa, lastLogin. Actions: Invite User, Bulk Deactivate.
- **User — detail** —
  - **Identity** — email, display name, role, active, legacy user code (optional).
  - **Permissions** — effective permission set (read-only preview: role defaults + grants − revokes). Admin override surface: per-permission grant/revoke list with who-granted-when.
  - **Security** — MFA enrollment status (enroll / reset), backup codes count, trigger password reset, trigger "sign out everywhere".
  - **Sessions** — active sessions list with IP / UA / last-seen / revoke.
  - **Linked Employee** — link / unlink.
- **Roles — list + detail** — role editor with checkbox grid of permissions. `builtIn` roles can be edited but not deleted / renamed. "Clone Role" action.
- **Permission Catalog (read-only)** — reference view of all permissions grouped by module; helpful when wiring a new module.
- **Sales Passwords — store admin** — lists active per-store PIN policies (who has what scope at which store); admin can re-issue, revoke, unlock. Also shows the legacy Manager / Ticket shared passwords for each store (if feature flag is on) with rotate actions.
- **Sales Password Audit** — filterable log of verify attempts: employee, scope, outcome, cashier, ticket, store, timestamp.
- **Time Clock Admin** — per-store view of currently-clocked-in employees; adjust past entries; view missed-logout entries; bulk clock-out for end-of-day reconciliation.
- **Print Time Clock Data** (RICS p. 110) — date range + employee filter + detail toggle + CSV/PDF export.
- **Employees Audit Log** — filterable `EmployeesAuditEvent` viewer.

### Employee-facing screens

- **Login** — email + password; MFA step if role requires it.
- **Clock In / Clock Out** — small page at `/timeclock` accessible to any user with `timeclock.self`. Shows currently-clocked state; one-click clock-in / clock-out; PIN-required when clocking self. Mobile-friendly (a cashier on a phone).
- **My Hours / My Commission** — per-user dashboard showing PTD + MTD + YTD hours, commission, perks; list of recent time-clock entries; list of recent commission ledger rows.
- **Change Password** — self-service password rotation.
- **Enroll MFA** — QR + backup codes.

### REST endpoints

**Auth**
- `POST   /api/v1/auth/login` — email + password (+ mfaCode if required)
- `POST   /api/v1/auth/logout` — revokes current session
- `POST   /api/v1/auth/password-reset/request` — admin-triggered
- `POST   /api/v1/auth/password-reset/consume` — user consumes emailed token
- `PUT    /api/v1/users/me/password` — self-change
- `POST   /api/v1/users/me/mfa/enroll` — issue TOTP secret + QR
- `POST   /api/v1/users/me/mfa/verify` — verify first TOTP code, persist
- `DELETE /api/v1/users/me/mfa` — disable (if role allows)
- `GET    /api/v1/users/me` — current user + effective permissions

**Users + Roles + Permissions**
- `GET|POST         /api/v1/users`
- `GET|PATCH|DELETE /api/v1/users/:id`
- `POST             /api/v1/users/:id/password-reset`
- `POST             /api/v1/users/:id/sessions/revoke-all`
- `POST             /api/v1/users/:id/permissions/grant`
- `POST             /api/v1/users/:id/permissions/revoke`
- `DELETE           /api/v1/users/:id/permissions/grant/:permissionId`
- `DELETE           /api/v1/users/:id/permissions/revoke/:permissionId`
- `GET|POST         /api/v1/roles`
- `GET|PATCH        /api/v1/roles/:id`
- `POST             /api/v1/roles/:id/permissions/add`
- `POST             /api/v1/roles/:id/permissions/remove`
- `GET              /api/v1/permissions` — catalog read
- `GET              /api/v1/sessions?userId=&active=true`
- `POST             /api/v1/sessions/:id/revoke`

**Employees + Commission**
- `GET|POST         /api/v1/employees`
- `GET|PATCH        /api/v1/employees/:id`
- `POST             /api/v1/employees/:id/deactivate`
- `POST             /api/v1/employees/:id/reactivate`
- `GET|POST         /api/v1/employees/:id/commission-overrides`
- `PATCH|DELETE     /api/v1/commission-overrides/:id`
- `GET              /api/v1/employees/:id/commission-ledger?from=&to=`
- `GET              /api/v1/employees/:id/perks-ledger?from=&to=`
- `POST             /api/v1/employees/:id/hours-perks-manual` — when time clock is off
- `GET|POST         /api/v1/employees/:id/periods`
- `POST             /api/v1/employees/:id/periods/:periodId/close`
- `POST             /api/v1/employees/:id/periods/:periodId/reopen`

**Time Clock**
- `GET|PATCH  /api/v1/time-clock-policy?storeId=` — company default or per-store
- `POST       /api/v1/employees/time-clock/clock-in`
- `POST       /api/v1/employees/time-clock/clock-out`
- `GET        /api/v1/employees/time-clock/entries?employeeId=&storeId=&from=&to=`
- `GET        /api/v1/employees/time-clock/open` — currently clocked in
- `POST       /api/v1/employees/time-clock/entries/:id/adjust`
- `GET        /api/v1/reports/time-clock` (RICS p. 110)
- `GET        /api/v1/reports/salesperson-analysis` (RICS p. 111)

**Sales Passwords**
- `POST  /api/v1/employees/:id/sales-passwords` — issue PIN + scopes (returns PIN once, never again)
- `PATCH /api/v1/employees/:id/sales-passwords/:pwId` — rotate (old deactivated, new issued)
- `POST  /api/v1/employees/:id/sales-passwords/:pwId/revoke`
- `POST  /api/v1/employees/:id/sales-passwords/:pwId/unlock` — clear lockedUntil
- `POST  /api/v1/employees/sales-passwords/verify { pin, scope, storeId, ticketId?, invokingUserId }` — returns `overrideToken`
- `POST  /api/v1/employees/sales-passwords/consume-token { overrideToken, scope, ticketId, action }` — internal; called by `sales-pos` when it applies the override
- `GET   /api/v1/employees/sales-password-audit?employeeId=&scope=&from=&to=`

No separate per-store shared-password API is part of the supported runtime.

### Outbound events

- `UserCreatedEvent`, `UserUpdatedEvent`, `UserDeactivatedEvent`, `UserRoleChangedEvent`, `UserPermissionsChangedEvent`
- `UserLoggedInEvent { userId, sessionId, storeId?, registerId? }`
- `UserLoggedOutEvent`, `SessionRevokedEvent`
- `PasswordResetRequestedEvent`, `PasswordChangedEvent`, `MfaEnrolledEvent`, `MfaResetEvent`
- `EmployeeCreatedEvent`, `EmployeeUpdatedEvent`, `EmployeeLinkedToUserEvent`
- `TimeClockClockedInEvent { employeeId, storeId, entryId, at }`
- `TimeClockClockedOutEvent { employeeId, storeId, entryId, at, computedHours }`
- `TimeClockAutoClosedEvent { entryId }`
- `CommissionLedgerWrittenEvent`, `CommissionLedgerReversedEvent`, `PerksLedgerWrittenEvent`
- `EmployeePeriodClosedEvent { employeeId, periodId, lockedThrough, totals }`, `EmployeePeriodReopenedEvent`
- `SalesPasswordIssuedEvent`, `SalesPasswordRotatedEvent`, `SalesPasswordRevokedEvent`, `SalesPasswordLockedEvent`
- `OverrideTokenGrantedEvent`, `OverrideTokenConsumedEvent`

## Cross-module dependencies (who reads from `employees`)

- **`sales-pos`** —
  - `resolveSession(cookie)` → authenticated cashier; `User` + effective permissions.
  - `getEmployee(salespersonCode | userId)` for line-level salesperson attribution on Ticket Detail (RICS p. 32).
  - `SalesPassword.verify({ pin, scope, ticketId, storeId, invokingUserId })` before void / refund / price-override / perks / discount / no-sale / reprint / close-batch / pay-out / manager-options.
  - `consumeOverrideToken(...)` when the ticket action is committed.
  - `requireClockInBeforeSale` from `TimeClockPolicy` to gate ticket entry (RICS p. 108 ReqCashier behavior).
  - Emits `SaleLineCommittedEvent`, `TicketLineVoidedEvent`, `TicketVoidedEvent`, `ShiftOpenedEvent`, `ShiftClosedEvent` → `employees` subscribes for commission + perks + time-clock correlation.
- **`customer-transactions`** — same as `sales-pos` (it extends the ticket framework); additionally uses `SalesPasswordScope.REFUND` for special-order / layaway refunds.
- **`purchasing`** — `permissions.has('purchasing.approve')` to gate PO approval; optional `buyerEmployeeId` attribution on PO header so the Sales Analysis report can credit the buyer.
- **`inventory`** — `permissions.has('inventory.adjust')` and `inventory.transfer.manual`; every movement-ledger row carries `actorUserId` sourced from `req.user.id` (the identity this module issued).
- **`otb-planning`** — `otb.edit` to write a plan; `otb.read` to view. `EmployeePeriod.closedAt` is not directly consumed, but OTB reports can scope by buyer if the buyer attribution is on.
- **`sales-reporting`** — reads `CommissionLedgerEntry` + `PerksLedgerEntry` + `TimeClockEntry` for Salesperson Analysis and cross-store salesperson performance. Uses `Employee.name` + `salespersonCode` for every per-salesperson grouping on sales reports (Salesperson Summary, Sales by SKU, Sales by Time).
- **`accounts-receivable`** — `accounts_receivable.post_payment` and `close_period` permissions. `EmployeePeriod` does not couple to A/R Period; they're orthogonal fiscal concepts.
- **`crm`** — the "Salesperson" attached to a customer mail-detail row (RICS p. 806 PTs / Personal Trade) is this module's `Employee`. `crm.write` gates customer edits.
- **`store-ops`** — `store_ops.configure` gates Company Setup + Store edits. No direct data read from `store-ops` into `employees` aside from `Store` references on `TimeClockEntry.storeId` and `CommissionLedgerEntry.storeId`.
- **`platform`** —
  - **Consumes**: `resolveSession(cookie)` via contract, used by the auth middleware. Effective permission set for request-time enforcement.
  - **Writes**: audit log viewer reads `EmployeesAuditEvent` + `SalesPasswordAudit`.
  - **Runs**: scheduled task for `TimeClockEntry` auto-close at 24h; scheduled task for session expiry GC; retention purge for `TimeClockEntry` (matches RICS p. 114 "Clear Saved Time Clock Data").

## Contracts exposed (outbound, in-process adapter)

`apps/api/src/contracts/employeesContract.ts`:

- `resolveSession(signedCookieId) → { user, permissions, employee?, storeId?, registerId? } | null` — primary auth middleware entry point.
- `getUser(userId)` / `getUserByEmail(email)`.
- `getEffectivePermissions(userId) → Set<PermissionCode>`.
- `getEmployee(employeeId | salespersonCode | userId) → Employee`.
- `listEmployees({ activeOnly?, storeId? })`.
- `verifySalesPassword({ pin, scope, storeId, ticketId?, invokingUserId }) → { granted, overrideToken? | reason }`.
- `consumeOverrideToken({ overrideToken, scope, ticketId, action }) → { authorizingEmployeeId }` (or throws `TOKEN_CONSUMED | TOKEN_EXPIRED | SCOPE_MISMATCH`).
- `recordCommissionForLine({ ticketId, lineId, employeeId, storeId, occurredAt, extendedNet, extendedCost, categoryId, departmentId, skuId })` — internal, called by the event handler on `SaleLineCommittedEvent`.
- `recordPerksForLine({ ticketId, lineId, employeeId, storeId, occurredAt, perksAmount })`.
- `reverseCommissionForLine({ ticketLineId })` / `reversePerksForLine({ ticketLineId })`.
- `openTimeClockEntry({ employeeId, storeId, clockInByUserId, nonSales?, at? })`.
- `closeTimeClockEntry({ employeeId, clockOutByUserId, at? })`.
- `currentEmployeePeriod(employeeId) → EmployeePeriod | null`.
- `closeEmployeePeriod({ employeeId, periodKind, lockedThrough, closedByUserId, note? })`.

All reads are idempotent; mutations go through HTTP or the contract adapter's audit wrapper.

## What is explicitly NOT in scope

- **Auth middleware itself (request guard / cookie parser / permission enforcer).** Lives in `platform` at `apps/api/src/middleware/auth.ts`. `employees` just answers `resolveSession`.
- **Scheduling / rostering / shift-planning.** Not in RICS; not in v1. Future module if users ask.
- **Payroll export.** `EmployeePeriod.commissionTotal` + `hoursTotal` are the hand-off point; the payroll connector is a separate integration under `platform` (or a future `payroll` module). RICS didn't have payroll either (p. 4255 "Print Salesperson File" is the closest — dropped as a standalone screen, replaced by list export).
- **HR records beyond what's needed for commission + time clock.** `Employee.otherInformation` is a free-text bag; no structured SSN, W-2, I-9. A real HRIS is out of scope.
- **Manager Options screen definitions at the POS.** Live in `sales-pos`. This module defines the *permissions* (`sales.manager_options`) and the *sales password scope* (`MANAGER_OPTIONS`) those screens check.
- **RICS.CFG `[TimeClock]` toggles as config files.** Replaced by `TimeClockPolicy` rows; RICS.CFG overall is dropped per the registry.
- **`[Practice Sales]` sandbox fork.** Dropped in v1; a training environment is a `platform` concern.
- **`SUPERVISOR` default user.** Replaced by first-run owner account setup.
- **Change Salespeople bulk-renumber utility** (RICS Ch. 15 p. 195). Per the registry's "not being ported" list, this is collapsed into ordinary admin edits (with the code-freeze-after-activity rule).
- **Per-user printer + saved-report preferences** (RICS p. 163 Copy parameters). Those are UX preferences, owned by `platform`'s user-preference store.
- **Reminders / appointments on login** (RICS p. 189). Owned by `platform`'s notifications / reminders surface; `employees` just provides the `userId` the reminders attach to.
- **Clear Saved Time Clock Data purge** (RICS Ch. 8 p. 114). Owned by `platform`'s retention worker; `employees` owns the data, `platform` owns the retention policy.
- **User-level audit of *every* menu action** (RICS's implicit "Track which options have been used" on p. 163 Users). `employees` only audits employee/user/password/MFA/session/permission events via `EmployeesAuditEvent` + `SalesPasswordAudit`. Cross-module "who viewed what" lives in `platform`'s generalized audit log.

## Open questions

1. **Unify `Employee` + `User` into one entity?** Current proposal: separate tables with a nullable FK link. Alternative: a single `Person` with two optional capability slots (`salesperson { code, commissionRate, ... }` + `login { email, passwordHash, role, ... }`). Trade-off: unified is cleaner for "most humans are both" cases; split is cleaner for IT admins who never ring sales and for seasonal stockers who clock hours but never log in. **Proposed: keep separate, matches RICS's mental model and reality of non-overlapping populations.** Confirm with user.
2. **Per-store sales password scope — does an employee have different override rights at different stores?** The data model allows `SalesPassword.storeId` to be set or null; a null means "works at any store". Do we need a more granular `SalesPasswordScopeGrant` that lets, e.g., employee X have VOID at store 1 but not store 2? RICS doesn't model this — it's all store-shared. Proposed: the `storeId` slot is enough; if you want store-specific scopes, issue multiple PIN rows for the same employee.
3. **Multi-store clock-ins — `REJECT` vs. `TRANSFER`?** RICS implies a single active clock-in globally (p. 106 warns about still-clocked-in salespeople). `TRANSFER` is a concession to multi-store staff who move between locations. Proposed default: `REJECT`. Revisit if a chain actually has floater employees.
4. **Change-Salespeople batch tool — dropped entirely?** Per the registry's "not being ported" list, yes — collapsed into admin edit with code-freeze-after-activity. Confirm this is acceptable vs. offering a "reassign code" admin utility for the legacy use case.
5. **Commission base per override, not per employee?** RICS p. 111 says the base is inherited from Enter Salespeople. Some shops might want "dept 10 is commissioned on profit, dept 20 on sales" for the same employee. Currently not supported; flag for future if users ask.
6. **Return commissions — reverse (negative ledger) or zero out?** Spec says reverse (the PTD reflects net commissionable activity). RICS is silent (p. 111). Confirm with a finance stakeholder.
7. **Perks on returns — reverse?** Same question. Spec says reverse; RICS behavior (p. 155) is to auto-post on sale but doesn't spell out returns.
8. **PIN length + shape — 4–8 digits, numeric only, or alphanumeric?** RICS salesperson password is 1–12 chars alphanumeric (p. 107). For register-speed typing, proposed: 4–8 digits numeric. Alphanumeric is available on request. Confirm.
9. **Shared PIN collisions.** If two employees pick the same 4-digit PIN, the verify lookup returns ambiguous results. Proposed: verify is `(pin, scope)` lookup; if >1 active record matches, the oldest-by-`issuedAt` wins and the collision is logged. Alternative: require PINs to be unique per store (validate on issue). Proposed: require unique per active storeId to avoid the collision entirely.
10. **MFA factor choice — TOTP only, or also WebAuthn / email OTP?** Proposed: TOTP only in v1. WebAuthn is a natural follow-up. Email OTP explicitly avoided (email deliverability is a platform headache).
11. **Session cookie TTL vs. inactivity timeout.** Proposed: hard expiry 12 hours; inactivity revoke after 2 hours of no `lastSeenAt` bump. Revisit for POS registers where a shift may be > 12 hours (a long Saturday). Possibly register-context sessions get 16h.
12. **Role-required MFA — can an admin turn off MFA-required on a role?** Proposed: no. `OWNER` / `ADMIN` / `FINANCE` are hard-wired `mfaRequired = true`; editing that field on a built-in role is blocked.
13. **Password complexity rules.** Proposed: argon2id cost params + minimum length 12, no other composition rules. NIST SP 800-63B compliant. Confirm; some operators may expect "must contain number + symbol".
14. **Per-user permission grants — allowed on built-in roles?** Proposed: yes, they're additive to whatever the role defines. An admin can revoke a specific permission even from an OWNER (useful for temporarily restricting a single OWNER seat for a risky ops window).
15. **Legacy per-store sales passwords — sunset date?** The feature flag keeps them alive indefinitely. Proposed: document deprecation; cut in a v2 release once all deployments have migrated to per-employee PINs. Confirm timeline.
16. **Employee homeStore — used for defaulting, or as a filter?** Proposed: purely a UX default (pre-selects the store on reports); not an authorization boundary. An employee can clock in at any store they have permission to clock in at.
17. **Time-clock rounding — rule to seed?** Proposed: `EXACT` (matches RICS's implicit behavior on p. 110). A shop that wants 15-min rounding flips to `ROUND_NEAREST` + `roundingInterval = 15`.
18. **Audit retention for `SalesPasswordAudit`.** Proposed: 400 days, aligned with `StoreOpsAuditEvent` (`store-ops` spec's convention). `platform` retention worker enforces.
19. **`EmployeesAuditEvent` scope — include every commission/perks ledger write, or just human-driven events?** Proposed: only human-driven events (create/update/role-change/etc.). Ledger writes are already append-only and auditable via the ledger itself; duplicating into `EmployeesAuditEvent` would be noisy.
20. **`OverrideToken.ticketId` — required for every scope, or some scopes are ticket-less?** CLOSE_BATCH and PAY_OUT are shift-scoped, not ticket-scoped; MANAGER_OPTIONS is screen-scoped. Proposed: `ticketId` is nullable; scope-specific validation rules at `consumeOverrideToken`. Document per-scope.
21. **First-run bootstrap user.** First installation needs an OWNER to exist before any route is protected. Proposed: a one-shot `/api/v1/setup/initial-owner` endpoint that is disabled once the first OWNER exists; signed by an out-of-band install token set in env. Confirm approach.
22. **Cross-module "actorUserId" snapshot vs. FK.** When `inventory` logs `actorUserId` on a movement-ledger row, is it a live FK to `User`, or a snapshot (name, code) on the row itself? Proposed: live FK; if the user is later deleted, keep the row with `actorUserId` as an orphan reference rendered as "deleted user" in the UI.
23. **Registry row 11 — "RICS features not being ported" check.** None of the bullets in the registry's non-ported list apply to `employees` (no modem / diskette / RICS.CFG / Change Salespeople flows land here). Confirmed.

---

**Spec author notes:** this spec is ~540 lines and sits at the upper end of the target band — driven by (a) the three-way split of Employee / User / SalesPassword requiring fuller model coverage than most modules, (b) the seed permission catalog which many downstream modules need visibility into, and (c) the auth + sales-password flows which are net-new to Zack's Retail with no RICS analog. Implementation order: `User` + `Role` + `Permission` catalog first (unblocks `platform` auth middleware, which unblocks every other module), then `Employee` + `SalesPassword`, then `TimeClock`, then commission ledger + `EmployeePeriod`.
