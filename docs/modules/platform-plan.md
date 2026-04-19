# Module: platform — Development plan

Companion to [platform.md](platform.md). The spec is the "what"; this document is the "how and when". Sequencing is driven by **dependency depth** (things other modules will call into) and **blast radius** (the smaller the first ship, the cheaper the mistake).

**Target delivery cadence**: 8 phases, ~12 sprints total, ~1 quarter of wall-clock if staffed with one full-time engineer. Phases are not equal — see per-phase estimates.

---

## Ground rules for the whole rollout

- **One module, one Prisma schema.** Platform owns its tables in `apps/api/prisma/schema.prisma` (same DB as storefront, segregated by table prefix — no separate logical database in v1). Admin-side SQLite is *not* extended with any platform table; any cross-DB read is via the outbound contract adapter.
- **Every outbound contract ships behind an adapter file in `apps/api/src/contracts/`** (same discipline as `purchasingContract.ts`, ZAI-137 / ZAI-145). Modules import from `../contracts/<name>`, never from `../services/<name>` of another module.
- **Every cutover uses dual-write + read-flip, never big-bang replace.** The pattern is: (1) stand up the new surface, (2) write both old + new, (3) backfill, (4) flip reads one call site at a time, (5) stop writing the old, (6) drop the old. Each step ships as its own ticket so any step is cheaply rollbackable.
- **No phase ships without a live consumer.** Each phase must have at least one real call site migrated to it (not just a smoke test). The phase isn't "done" until that consumer is in prod and quiet for 7 days.
- **Every surface is permission-gated from day one.** Even internal-looking endpoints go through `employees.hasPermission()`. Skipping this in v1 means retrofitting it later under compliance pressure.
- **Dry-run is the default for anything that writes.** Retention, bulk integration replays, backfill scripts — default `dryRun=true`, require an explicit operator action to flip.

---

## Phase 0 — Foundations (1 sprint)

**Goal**: resolve the decisions that block every subsequent phase, and stand up the minimum infrastructure so Phase 1 doesn't stall.

**Work packages**

- **ZAI-P0-1 — Decide Open Questions that gate work.** The following must be answered before Phase 3 begins (Phases 1–2 are unblocked regardless):
  - **Q1 — BullMQ vs pg-boss.** Recommendation in spec: BullMQ. Decision gate: ops sign-off on adding Redis to the deployment topology. Document the decision in [platform.md](platform.md) §Open questions.
  - **Q2 — Email provider.** Recommendation: Resend or SES. Decision gate: commercial sign-off + a 15-min provider-account bootstrap.
  - Q3–Q10 can defer to their owning phase.
- **ZAI-P0-2 — Extend Prisma schema with `platform_*` table naming convention.** Not yet adding tables; just establishing the convention in a README block so every subsequent phase uses it. Decision: prefix every platform table with `platform_` (e.g. `platform_audit_log`, `platform_settings`) so ownership is unambiguous in mixed-schema database listings.
- **ZAI-P0-3 — Stand up `employees.hasPermission()` stub contract.** Platform depends on it from Phase 1. If the `employees` module spec is ahead, use its shape; otherwise ship a stub that returns `true` for an admin role and `false` otherwise, gated behind `featureFlags.isEnabled('platform.permission-bypass')` — once `employees` lands, the stub is replaced with the real import.
- **ZAI-P0-4 — Operator base route `/admin/platform`.** Empty shell, AppLayout-nested, nav entry gated on `platform.*` permissions. Gives every subsequent phase a landing page to hang its admin UI off of.

**Exit criteria**
- Q1, Q2 decided and recorded.
- Empty `/admin/platform` page renders in [apps/web](../../apps/web).
- `hasPermission()` returns deterministically from a single call site.

---

## Phase 1 — Audit backbone (2 sprints) — **CRITICAL PATH**

**Goal**: land the generic `audit_log` and migrate the two existing OTB audit tables onto it, so every subsequent phase (settings writes, job runs, retention runs, integration message handoffs) has one place to record.

**Why first**: every other phase writes audit events. Standing up the audit surface second and retrofitting it is the single most expensive mistake we can make.

**Work packages**

- **ZAI-P1-1 — Schema: `platform_audit_log` + `platform_audit_retention_by_resource_type`.** Append-only. Partition `platform_audit_log` by `created_at` month from day one. Enforce append-only via `REVOKE UPDATE, DELETE ON platform_audit_log FROM <app_role>` + a trigger that blocks `UPDATE`. Indexes per spec §Data model.
- **ZAI-P1-2 — `traceId` middleware.** Express middleware reads `traceparent` (W3C Trace Context) or generates one, puts it in `AsyncLocalStorage`. Ships with a logger-integration shim so structured logs carry `traceId`.
- **ZAI-P1-3 — `auditContract.ts` outbound adapter.** Implements `audit.record()` + `audit.query()`. Reads `traceId` from AsyncLocalStorage if not passed. Stamps `retentionExpiresAt` at write time using the `platform_audit_retention_by_resource_type` table (fall back to 400-day default). Ships with ≥90% branch coverage and a golden-test for the "one decision, many rows" `eventId` grouping semantic.
- **ZAI-P1-4 — Seed the retention table.** Ship the defaults from Open Question #7: `accounts-receivable.*` → 7 years; `crm.pii_change` → indefinite (NULL `retention_days`); everything else → 400 days. This is a code-declared seed migration, not an admin UI surface yet.
- **ZAI-P1-5 — Dual-write `otbPolicyAuditService`.** Wrap the existing `recordOtbPolicyAuditEvents()` so it writes to both `otb_policy_audit_log` (legacy) and `platform_audit_log` (new). `resourceType = 'otb.policy_decision'`, `eventId` preserved, every field mapped. Feature-flag-gated by `platform.audit.dualWrite.otbPolicy`.
- **ZAI-P1-6 — Dual-write `otbBudgetService.updateOtbBudget` per-field changes.** Same pattern. `resourceType = 'otb.budget_field_change'`. Flag `platform.audit.dualWrite.otbBudget`.
- **ZAI-P1-7 — Backfill script** (run once, idempotent): copy all historical rows from `otb_policy_audit_log` + `otb_budget_audit` into `platform_audit_log`. Logs a reconciliation report: source row count vs. destination row count per day. Ticket includes the ops runbook.
- **ZAI-P1-8 — Flip reads.** Every OTB-audit query in the API moves from the legacy tables to `audit.query()`. One PR per call site (grep for `otb_policy_audit_log` and `otb_budget_audit`). Each PR ships with its own rollback plan (flip the flag off).
- **ZAI-P1-9 — Admin UI: `/admin/platform/audit`.** A filterable list (resourceType, actorUserId, traceId, dateRange) with row detail drawer. Read-only. Gated on `platform.audit.read`. **Note**: dropping the legacy tables is deferred to Phase 7 — we keep them written-but-unread for a full quarter to make any reconciliation bug recoverable.

**Exit criteria**
- Every OTB audit query reads from `platform_audit_log` in prod.
- Dual-write window has run for ≥7 days with zero row-count drift in the daily reconciliation.
- Trace-linked queries (`audit.query({ traceId })`) work end-to-end from a PO submit request.

**Unblocks**: every other phase can now call `audit.record()`.

---

## Phase 2 — Settings + Feature flags (1 sprint)

**Goal**: give every module a typed way to read a config value without inventing env vars or hardcoding.

**Work packages**

- **ZAI-P2-1 — `settings-catalog.ts`.** TypeScript object that declares every known setting: key, JSON schema, default, scope, owning module. Unknown keys rejected at write time. Seed entries: `storefront.productSource`, `platform.jobs.concurrency`, `platform.notifications.defaultChannels`, `otb.warningThresholdPct`, `otb.hardStopThresholdPct`, `otb.ceoExceptionThresholdPct`.
- **ZAI-P2-2 — Schema: `platform_settings`.** `(scope, scopeId, key)` unique. Writes are audited via `audit.record({ resourceType: 'platform.setting_change', ... })`.
- **ZAI-P2-3 — Schema: `platform_feature_flags` + `platform_feature_flag_overrides`.** Rollout types = `all | store | percentage | user`. Overrides indexed by `(flag_key, scope, scopeId)`.
- **ZAI-P2-4 — `settingsContract.ts` + `featureFlagsContract.ts` outbound adapters.** `get`/`set`/`list` for settings, `isEnabled`/`setRollout` for flags. Both cached in-process with 30s TTL to keep the hot path cheap; cache invalidated via pub-sub (fallback to 30s eventual consistency if Redis isn't up yet).
- **ZAI-P2-5 — Migrate `PRODUCT_SOURCE` env var.** Introduce flag `storefront.productSource` with values `'rics' | 'local'`. Dual-read window: `publicProductFacade.ts` reads both the env var and the flag; flag wins when set. Cut over one env var → flag at a time; retire env var after 2-week bake.
- **ZAI-P2-6 — Admin UI: `/admin/platform/settings` and `/admin/platform/flags`.** Table + edit drawer. Every write produces an audit event (wired via Phase 1). Permission-gated on `platform.settings.write` / `platform.flags.write`.

**Exit criteria**
- `PRODUCT_SOURCE` can be flipped in the admin UI without a redeploy.
- Every OTB threshold in `otbPolicyAuditService` reads through `settings.get()`.
- Unknown setting keys are rejected.

**Unblocks**: Phase 3+ can treat cron expressions, retention cadences, email-provider DSNs, etc., as editable config rather than compile-time constants.

---

## Phase 3 — Jobs subsystem (2 sprints)

**Goal**: a single queued-worker runtime that the retention / notifications / integrations phases all build on.

**Prerequisites from Phase 0**: Q1 (BullMQ vs pg-boss) decided; Redis in deployment topology if BullMQ won.

**Work packages**

- **ZAI-P3-1 — Infra: Redis.** Add Redis service to `docker-compose.yml`. Add `REDIS_URL` env with sensible defaults. Document the prod deployment surface (managed Redis vs self-hosted) in the ops runbook. *(Skip if pg-boss won Q1; in that case ship the pg-boss wrapper instead.)*
- **ZAI-P3-2 — Schema: `platform_scheduled_jobs`, `platform_job_runs` (partitioned by `started_at` month), `platform_super_jobs`.**
- **ZAI-P3-3 — Worker process bootstrap.** Decision: new `apps/worker` package, separate process from the API. Justification: worker scaling is independent of API scaling, and a crashy job payload shouldn't take the API down. Worker process shares the same codebase (monorepo) but has its own `index.ts` entry point that only boots queue consumers.
- **ZAI-P3-4 — `jobsContract.ts` outbound adapter.** `enqueue` / `defineSuperJob` / `cancel` / `status`. `uniqueKey` for idempotency. Every enqueue writes an audit event.
- **ZAI-P3-5 — `bull-board` mounted at `/admin/platform/jobs`.** Auth-gated via a thin shim. Replaces RICS Ch. 14 "Look at Job List" (p. 186) and "Run Job List" (p. 189).
- **ZAI-P3-6 — First real consumer: scheduled OTB snapshot rebuild.** Prove the whole stack end-to-end. Today the OTB projection is recomputed on every read; this phase turns it into a nightly pre-computed snapshot, invalidated on PO state change. Ticket is optional but strongly recommended — it validates the subsystem before the retention phase depends on it.
- **ZAI-P3-7 — Super Jobs UI.** Define + list + re-run. Small surface; replaces RICS Ch. 14 p. 189 "Super Jobs" verbatim.

**Exit criteria**
- A job enqueued from the API runs on the worker, with a row in `platform_job_runs`, a bull-board entry, and an audit event.
- Cron-scheduled job fires at least 3 times successfully.
- Worker process crashes don't take the API down (chaos-test this explicitly).

**Unblocks**: retention policies (scheduled), notification dispatcher (queued send), integration inbound worker (queued parse).

---

## Phase 4 — Notifications (2 sprints)

**Goal**: one unified way to fire an in-app or email notification, on demand or scheduled.

**Prerequisites**: Q2 (email provider) decided.

**Work packages**

- **ZAI-P4-1 — Schema: `platform_notifications`, `platform_notification_preferences`, `platform_notification_templates`.**
- **ZAI-P4-2 — Email provider adapter.** One adapter per provider (Resend / SES / Postmark), picked via `settings.get('platform.notifications.emailProvider')`. Test-mode adapter for CI.
- **ZAI-P4-3 — Dispatcher worker.** Consumes from `platform_notifications` where `status='queued' AND scheduledFor <= now()`. Fans out to the channels in `channelsJson`. Writes per-channel delivery attempts as audit events.
- **ZAI-P4-4 — `notificationsContract.ts` outbound adapter.** `send({ template, recipient, channels?, data, scheduledFor?, rescheduleRule?, dedupeKey? })`. Idempotent on `dedupeKey`.
- **ZAI-P4-5 — Template authoring + seed templates.** Seed: `otb.ceoExceptionRequested`, `otb.ceoExceptionApproved`, `platform.job.failed`, `platform.retention.runCompleted`, `platform.integration.endpointDown`. Each template has `subject`, `inApp`, `emailHtml`, `emailText`, `sms` slots (sms stubbed).
- **ZAI-P4-6 — In-app inbox UI.** Header bell with unread count + `/admin/notifications` inbox page. Per-category mute + channel overrides in `/admin/profile/notifications`.
- **ZAI-P4-7 — Migrate one real call site.** Today's OTB CEO-exception flow (if it sends email at all) moves behind `notifications.send({ template: 'otb.ceoExceptionRequested', ... })`. Resolves Open Question #8 by picking an UX direction — ship both inbox + toast, flag-gated.

**Exit criteria**
- Scheduled reminder fires at the correct time.
- User preference mute actually suppresses email.
- `dedupeKey` prevents double-send on retry.
- Inbox unread count matches DB reality.

**Unblocks**: retention-run completion emails, integration-failure alerts, future workflow notifications.

---

## Phase 5 — Retention (2 sprints)

**Goal**: Ch. 8 purges as a governed, dry-run-by-default, audited policy engine — not six separate menu items.

**Work packages**

- **ZAI-P5-1 — Schema: `platform_retention_policies`, `platform_retention_runs`.**
- **ZAI-P5-2 — `retentionHandler` contract interface.** Every module that owns retention targets ships a handler implementing `apply({ policyKey, cutoffAt, scopeFilters, dryRun, batchSize }): Promise<RetentionResult>`. Platform never touches sibling tables directly.
- **ZAI-P5-3 — `retentionContract.ts` outbound adapter.** `definePolicy`, `runNow`, `lastRun`. All writes auditable via `resourceType = 'platform.retention_run'`.
- **ZAI-P5-4 — Seed the six policies from Ch. 8** (all initially `dryRun: true`, `enabled: false` until an operator turns them on):
  - `sales.saved_transactions` (p. 114) — owner: `sales-reporting`
  - `employees.time_clock` (p. 114) — owner: `employees`
  - `platform.deleted_record_keys` (p. 115) — owner: each module that keeps soft-delete tombstones
  - `products.auto_delete_skus` (p. 115) — owner: `products`. **Ships dry-run-only per Open Question #3**, requires manual apply.
  - `inventory.changes` (p. 116) — owner: `inventory`
  - `crm.gift_certificate_fully_redeemed` (p. 116) — owner: `customer-transactions`
  - Also: `products.orphaned_asset_files` (p. 194) — owner: `products`
- **ZAI-P5-5 — Per-owning-module handler implementation.** Seven tickets, one per owning module. Each handler honors `scopeFilters` and `cutoffAt` per RICS semantics (e.g. Auto-Delete SKUs' `modified on/after X` guard from p. 115).
- **ZAI-P5-6 — Admin UI: `/admin/platform/retention`.** List policies, show last run, toggle `dryRun`, `runNow` button. Every control-plane write is audited.
- **ZAI-P5-7 — Scheduled execution.** Use the Phase 3 cron subsystem. Each policy has a `cadenceCron`. Results emitted as `platform.retention.runCompleted` notifications for operators.

**Exit criteria**
- Every seeded policy runs on schedule in dry-run mode and writes a `platform_retention_runs` row.
- `affectedRowCount` matches what a manual SQL query reports.
- An operator can flip one policy to `dryRun=false` and the affected rows are actually deleted in prod.
- Auto-Delete SKUs runs dry-run nightly for ≥2 weeks before any consideration of enabling writes.

---

## Phase 6 — Integrations (2 sprints)

**Goal**: EDI / SPS Commerce / GMAIC inbound under one transport + message log, with per-module semantic handlers.

**Work packages**

- **ZAI-P6-1 — Schema: `platform_integration_endpoints`, `platform_integration_messages`.**
- **ZAI-P6-2 — Object-storage adapter.** Payloads can be large; store raw bytes in object storage (S3 / R2 / MinIO), keep `payload_hash` + `payload_object_key` in the DB. Dev default: MinIO in docker-compose.
- **ZAI-P6-3 — Inbound worker.** Pulls from each configured endpoint (SFTP poll, AS2 receiver, HTTP webhook). Writes raw payload to object storage; writes `platform_integration_messages` row with `status='received'`; hands off to the registered handler; updates `status` based on handler result. Retries with backoff on failure.
- **ZAI-P6-4 — `integrationsContract.ts` outbound adapter.**
- **ZAI-P6-5 — First endpoint: SPS Commerce (EDI).** Single endpoint per trading partner per Open Question #5; `documentType` per message (850, 855, 856, 810, 997). Handlers land in `purchasing`: `purchasing.receiveEdi850()`, `.receiveEdi855()`, `.receiveEdi856()`, `.receiveEdi810Invoice()`. Ships with ack (997) outbound.
- **ZAI-P6-6 — Second endpoint: GMAIC Vendor UPC import.** Handler lives in `products` (`products.importGmaicVendorUpc`). Small; validates the "mechanically it's the same shape as EDI" claim in the spec §Modernization decision #10.
- **ZAI-P6-7 — Admin UI: `/admin/platform/integrations`.** List endpoints + recent messages + replay button. Replay re-runs the handler against a stored payload (idempotency required in the handlers).
- **ZAI-P6-8 — Optional: inbound-sales-feed connector.** Shipped only if a real customer pulls for it; resolves Open Question #6. Handler would land in `sales-pos`.

**Exit criteria**
- An SPS Commerce 850 lands in the endpoint, becomes a PO in `purchasing`, and its message shows `status='succeeded'` linked to the PO ID via `correlationId`.
- Handler failure produces an alert notification and a `dead_letter` status; operator can replay after fix.
- Idempotent replay against the same `payload_hash` does not duplicate POs.

---

## Phase 7 — Telemetry, backups & cleanup (1 sprint)

**Goal**: System Status dashboard + backups read model + finally retire the legacy OTB audit tables.

**Work packages**

- **ZAI-P7-1 — `/admin/platform/status` dashboard with five tabs** per spec §Modernization decision #8: Job History, Database, System info, Workers, Integrations. Every tab is a materialized snapshot updated at most once per minute.
- **ZAI-P7-2 — Schema: `platform_backup_snapshots`.** Populated by a job that calls the managed-Postgres provider API. Per Open Question #10: store locally for logical exports we create; cache PITR list in-memory for 60s.
- **ZAI-P7-3 — Logical export job.** Scheduled via Phase 3. Writes `pg_dump`-style export to object storage; row in `platform_backup_snapshots` with `kind='logical_export'`. No self-service restore UI in v1 (spec §Out of scope).
- **ZAI-P7-4 — Drop legacy OTB audit tables.** After Phase 1 has run for a full quarter with zero reconciliation drift: drop `otb_policy_audit_log` and `otb_budget_audit`, stop dual-write. One migration, preceded by a 7-day announcement window.

**Exit criteria**
- Dashboard renders every tab in <500ms.
- A logical export completes + lands in object storage on schedule.
- Legacy OTB audit tables are gone from the DB.

---

## Phase 8 — Saved views + shortcuts (1 sprint)

**Goal**: close out the RICS macros story so the manual's last v1 commitment is met.

**Work packages**

- **ZAI-P8-1 — Schema: `platform_saved_views`.**
- **ZAI-P8-2 — Saved-view CRUD + per-page integration.** Each list page in `apps/web` registers its filter/sort/column state with the saved-views hook; URL-addressable.
- **ZAI-P8-3 — Client-side keyboard shortcut registry.** `useShortcut(key, handler, { scope })` hook; modules register their shortcuts. Built-in `?` overlay lists all shortcuts in-context.
- **ZAI-P8-4 — Release-note migration doc for RICS macro users.** No auto-migration tool per Open Question #9.

**Exit criteria**
- Users can save + share a view URL.
- `?` overlay renders a context-aware shortcut list.

---

## Dependency graph (one picture)

```
Phase 0 (foundations, decisions Q1 + Q2)
   │
   ▼
Phase 1 (audit_log) ───────────── every other phase depends on audit.record()
   │
   ▼
Phase 2 (settings + flags) ────── Phases 3–8 use settings.get() / isEnabled()
   │
   ▼
Phase 3 (jobs) ───────────────── Phases 4, 5, 6, 7 schedule work through jobs
   │
   ├──────► Phase 4 (notifications)
   │              │
   │              ▼
   │         used by Phases 5, 6 for alerts
   │
   ├──────► Phase 5 (retention)
   │
   └──────► Phase 6 (integrations)
                  │
                  ▼
            Phase 7 (telemetry, backups, cleanup) — depends on Phases 1, 3, 6 being in prod
                  │
                  ▼
            Phase 8 (saved views / shortcuts) — independent of everything else, can ship anytime after Phase 2
```

Phase 8 is marked last because it's the smallest user impact; it can slide up to anywhere after Phase 2 if the team has a natural break.

---

## Cross-cutting concerns

**Testing strategy per phase**
- **Unit**: every contract adapter ≥90% branch coverage, every handler + dispatcher ≥85%.
- **Integration**: one test per outbound contract method that exercises the real DB (Postgres testcontainer) + the real Redis (BullMQ testcontainer) + fakes for external providers (email, object storage, EDI transport).
- **E2E smoke**: after each phase, run a scripted operator flow in `apps/web` that proves the admin UI talks to the API talks to the DB. One Playwright test per phase minimum.
- **Chaos** (Phase 3+): worker crash, Redis down, provider 5xx — each produces a recoverable state, not a cascading failure.

**Observability**
- Every outbound contract method emits a structured log line with `traceId`, `actorUserId`, `method`, `duration_ms`, `outcome`. Route to whatever aggregator the rest of Zack's Retail ends up using (deferred to a separate ticket; for now, console).
- Metrics (gated on metrics stack landing): request count + p50/p95/p99 per contract method; queue depth per BullMQ queue; retention-run `affectedRowCount` histogram; integration `status='dead_letter'` counter.
- Health check endpoints: `/healthz` (liveness), `/readyz` (DB + Redis + worker heartbeat).

**Rollback plan (generic)**
- Every phase's admin UI writes are audited — rollbacks are recoverable by inspecting the audit log.
- Every dual-write window has a kill switch feature flag (`platform.audit.dualWrite.*`) that disables the new write path immediately if it misbehaves.
- Legacy tables survive through Phase 7 so any audit backfill bug is recoverable.
- Redis loss: BullMQ jobs are lost (accept it — retention runs re-fire on the next cadence, notifications retry from the DB). Critical jobs write a "started" audit event on enqueue so manual recovery is possible.

**Risk register**
| Risk | Phase | Impact | Mitigation |
|---|---|---|---|
| Ops rejects Redis | 0 → 3 | Jobs subsystem design changes | Fallback to pg-boss is scoped; decision at Phase 0, not mid-Phase 3 |
| Dual-write drift on audit | 1 | Backfill count mismatch; possible data loss | Daily reconciliation job; hold at Phase 1 exit criteria until 7 consecutive clean days |
| Auto-Delete SKUs deletes in-use SKUs | 5 | Data loss | Ships dry-run-only per Open Q #3; manual apply only; monthly operator review |
| EDI handler crashes on malformed payload | 6 | Message stuck in `received` | `dead_letter` after N retries; raw payload preserved in object storage; replay via admin UI |
| `bull-board` exposes internals if permissions misconfigured | 3 | Information leak | Mount behind explicit `platform.jobs.manage` check; pentest review before Phase 3 exit |
| Email-provider lock-in | 4 | Hard to swap later | Adapter pattern from day one; swap is a single `settings.set('platform.notifications.emailProvider')` + a new adapter class |

---

## What's explicitly *not* in this plan

- **Migrating admin-side SQLite to Postgres.** Separate workstream per root [CLAUDE.md](../../CLAUDE.md). Platform tables go straight to Postgres; the SQLite admin DB stays until that workstream runs.
- **Building the RICS macro-import tool.** Per Open Question #9 + spec §Out of scope.
- **Self-service restore UI** (spec §Out of scope).
- **User-defined retention policies** (spec §Out of scope — code-declared catalog in v1).
- **SMS channel** (schema slot reserved; no adapter in v1).
- **A general workflow engine.** Super Jobs cover linear sequences; branching/approval chains land in the owning module.

---

## Decisions that must be made before Phase 3 starts

1. **BullMQ vs pg-boss** (Open Q #1). Blocks Phase 3.
2. **Email provider** (Open Q #2). Blocks Phase 4 — can decide later, but not later than Phase 3 exit.
3. **Worker process shape**: one `apps/worker` package vs API hosts workers. Recommendation: separate process. Blocks Phase 3-3.
4. **Redis deployment topology** (if BullMQ wins): managed vs self-hosted. Blocks Phase 3-1.

All remaining Open Questions (#3–#10 in [platform.md](platform.md)) can be resolved in-phase.

---

## Tracking

Each `ZAI-Px-N` label above is a work-package identifier, not a Linear ticket ID. When these convert to Linear, prefer one epic per phase and one ticket per work package. Commit messages follow the existing `<type>(<scope>): <summary> (ZAI-XXX)` convention — see recent commits `45fe140`, `d7f10de`, `2113e6a` for the pattern.
