# Module: platform

**Goal**

`platform` is the cross-cutting infrastructure surface of Zack's Retail — the one place where every other module goes for audit trails, notifications, feature flags, settings, scheduled work, retention policies, integrations, managed backups, and admin telemetry. Primary user value: an operator (or on-call engineer) gets a single, coherent administrative spine — "what did who change, when did the system last run its retention sweep, which feature is on for which store, did last night's EDI job succeed?" — instead of the RICS v7.7 sprawl of a job list, a reminders file, a `RICS.CFG` editor, a CD/diskette backup dialog, a screen-spool viewer, and a manual "Send Messages to Stores" screen spread across Ch. 13–15.

## RICS features covered

**Retention purges (Ch. 8 — only the retention items; fiscal closes live in `accounts-receivable`)**
- **p. 114, Clear Saved Sales Transactions** — deletes cumulative saved sales (the file that backs Sales by Time / Salesperson Summary / Sales by SKU from posted-sales mode) older than a chosen cutoff date. RICS's own guidance is "run monthly against prior-3-month data to keep the file small". Platform must support this for sales-reporting's retention policy.
- **p. 114, Clear Saved Time Clock Data** — same shape, applied to the Time Clock cumulative file. Owned by `employees` data, executed by `platform`.
- **p. 115, Clear Deleted Record Keys** — RICS-specific: kept deleted-record keys around so the modem could re-push them to POS registers. No modern analog because there's no dial-up sync, but the concept of "purge the tombstone table for soft-deleted rows older than N days" maps cleanly to a platform retention policy.
- **p. 115, Automatically Delete SKUs** — prints and/or deletes SKUs that have no on-hand, no on-order, no YTD sales, no prior-year sales, honouring a "don't touch SKUs modified on or after X" guard, with optional scope filters (SKU / Vendor / Category / Season / Size Type / Group / Store).
- **p. 116, Clear Saved Inventory Changes** — deletes cumulative inventory-change records (the ledger behind Inventory Change Detail in Inventory Inquiry) older than a chosen date. The modern equivalent is a ledger-retention policy: deduction ledger rows past retention are archived, not surfaced in Inventory Inquiry.
- **p. 116, Clear Gift Certificate Data** — deletes fully-redeemed gift-certificate records with no further activity past a chosen date.

**Background workers / scheduled tasks (Ch. 14 — reframes the job list)**
- **p. 186, Look at Job List** — lists every option queued with `[Add Job and Continue]` instead of `[Add Job and Run]`. Supports priority reorder, hold/release, delete, refresh, start.
- **p. 189, Run Job List** — executes queued jobs in priority order with pause/stop.
- **p. 189, Super Jobs** — named, saved sequences of jobs (e.g. "Call Stores", "Weekly Reports", "Close Month") rerun as a unit.
- **p. 190, Unattended Backup** — a backup job added to the job list (often nested inside a Super Job).
- **p. 180, Logout From System (from RICS job)** — a `job-finished` hook used to launch external programs after the job list finishes; the modern equivalent is a job-completion event.
- **p. 184, Backup Data / p. 185, Restore Data / p. 191, Backup to CD** — all flavours of the backup job. Platform owns the modern replacement.

**Reminders / notifications (Ch. 14 + Ch. 13)**
- **p. 189, Reminders** — per-user reminders fired on login or on the clock; supports reschedule-every-N-days / next-month / next-year. RICS stores these in a local config.
- **p. 173 (Ch. 13), Send Messages to Stores** — main-computer → POS broadcast messages, delivered on the next poll. Per `docs/MODULES.md`, modem delivery is dropped; the capability survives as in-app broadcast notifications.

**Settings / feature flags (Ch. 15 + Ch. 17 platform-level fields)**
- **p. 200, Change RICS.CFG** — free-form `Section / Item / Entry` config editor. Every single RICS subsystem had hooks here (`PKZIP DRIVE`, `PKZIP POSDRIVE`, `ScreenSpool PDFDir`, `Inventory Information for Store`, plus countless per-customer toggles). Platform replaces it with a typed, versioned settings store plus a small feature-flag library.
- **p. 207, Run Other Utilities → Configuration Helper** — the secondary RICS.CFG editor.
- **p. 205, Macro Management** — per-user keystroke macros (up to 9). Per `docs/MODULES.md`, dropped in favour of keyboard shortcuts + saved views / URL state; platform owns the shortcut registry and the saved-view persistence.

**Database utilities (Ch. 15 — most dropped, one survives)**
- **p. 193, Compact / Repair Database, Create / Delete Database, Check Data Integrity** — all dropped per registry: managed Postgres, no operator DB maintenance.
- **p. 194, Reset Pictures** — the "orphan-asset sweeper" for SKU pictures. The *mechanism* survives as a platform retention job ("delete orphaned asset objects from storage"); the hand-wired `.jpg`-filename-matching does not.

**Integrations (Ch. 14)**
- **p. 190, EDI – Electronic Data Interchange** — optional module for bulk data exchange.
- **p. 190, Process SPS Commerce EDI** — the named SPS Commerce integration. Both get modernised as first-class integration endpoints with a message log.
- **p. 180, Import Internet Sales** — per `docs/MODULES.md`, dropped (our own storefront writes directly). Platform keeps the generic "inbound sales-feed connector" contract for future non-native integrations (marketplace sales, third-party POS imports).

**Admin telemetry (Ch. 17)**
- **p. 219, System Status Report — Print Job History** — every menu option picked in the last 2 months, with operator + timestamp. Basis for the modern audit log.
- **p. 219, System Status Report — Print File Statistics** — per-file record count + KB size. Basis for the modern "database metrics" dashboard.
- **p. 219, System Status Report — Print RICS System Information** — dumps Company Setup, Mail List Setup, Season Setup, and the two `.CFG` files. Modernised as a live system-info panel.

**Printer setup as legacy** (Ch. 17, pp. 216–217) — Wide / Narrow / Mail Label / Receipt printer selection, lines-per-page, font, margins, "print to screen spool file" toggles. Platform exposes nothing here by default (browser handles printing); we note it as replaced so operator training can point at the browser print dialog.

## Modernization decisions

1. **The job list + Super Jobs + Unattended Backup become a single queued background-worker subsystem backed by BullMQ on Redis.** RICS's Ch. 14 job list is a synchronous, per-client priority queue rerun from the same desktop that scheduled it. Zack's Retail runs workers as a server-side pool with typed job payloads, retry-with-backoff, dead-letter queue, and per-tenant (store) concurrency limits. We pick **BullMQ** over `node-cron` or `pg-boss` for three reasons: (a) every Zack's Retail deployment already runs a browser + storefront + API, so adding one Redis instance is a wash; (b) BullMQ's repeatable jobs cover cron-style scheduling without a separate library; (c) it has a battle-tested admin UI (`bull-board`) we can embed in the admin app, which maps directly onto the "Look at Job List" screen from p. 186. If the customer ever pushes back on Redis, `pg-boss` is the fallback since we're already Postgres-first — this is the top Open Question.
2. **A generic `audit_log` is the generalisation of `otb_policy_audit_log` and `otb_budget_audit`, not a parallel system.** Today the `otb_policy_audit_log` table (migration 0007, `apps/api/src/services/otbPolicyAuditService.ts`) and the `otb_budget_audit` table (initial schema, `apps/api/src/db/database.ts`) are OTB-specific. The platform `audit_log` generalises both: append-only rows keyed by `(resourceType, resourceId, eventId, actorUserId, traceId, payloadJson, retentionExpiresAt)`. Every module that today calls `recordOtbPolicyAuditEvents()` or writes to `otb_budget_audit` directly migrates to `audit.record({ resourceType: 'otb.policy_decision' | 'otb.budget_field_change' | ... , ... })`. The two legacy tables become materialised views over `audit_log` during the migration window and are dropped in a subsequent release. **Critically: `eventId` keeps its "one decision, many rows" semantics** (the p. 100 OTB policy decision fans out one row per affected department — see `otbPolicyAuditService.buildOtbPolicyAuditEvents`), expressed on the generic log as `eventId` grouping siblings, and `retentionExpiresAt` continues to be stamped at write time (the 400-day default in `otbPolicyAuditService.ts`) so archival scans stay cheap.
3. **`RICS.CFG` becomes a typed `settings` table plus a feature-flag library, addressed through a contract adapter.** RICS's free-form `Section / Item / Entry` is a footgun — any module could invent a key and nobody could find it later. Platform ships:
   - a `settings` table with `(scope, scopeId?, key, valueJson, updatedBy, updatedAt)` where `scope ∈ { 'company', 'store', 'user' }`;
   - a typed catalog (`settings-catalog.ts`) that declares every known key with its JSON schema, default, scope, and owning module — unknown keys are rejected at write time;
   - a `feature_flags` table with `(key, description, defaultEnabled, rollout: { kind: 'all' | 'store' | 'percentage' | 'user'; payload })` and a separate `feature_flag_overrides` table for per-scope-entity overrides;
   - an outbound contract `settings.get(key, { scope, scopeId? })` and `featureFlags.isEnabled(key, { scope, scopeId? })` that every module must use instead of reading env vars or rows directly.
   The existing `PRODUCT_SOURCE=rics|local` env flag (see `apps/api/src/services/publicProductFacade.ts`) is the migration-bridge example: in v1 it stays as an env var, in v2 it moves into `feature_flags` as `storefront.productSource` with a company-level default and per-store override hooks.
4. **Reminders + Send Messages to Stores converge into a unified `Notification` resource with channel = { in-app, email, optional SMS later }.** RICS has two separate mechanisms with different persistence. In Zack's Retail there's one `notifications` table keyed by `(recipientUserId | recipientRole | recipientStoreId | recipientBroadcast)`, one `notification_preferences` table per user (channel-by-channel + per-category mute), one templating layer, and one dispatch worker that fans out to channels. Schedulable reminders from p. 189 are just notifications with `scheduledFor > now`; store broadcast messages from p. 173 are notifications with `recipientStoreId` set and `channel=in-app`. Email uses a pluggable provider adapter (Resend or SES — defer the choice to an Open Question).
5. **Retention is a first-class scheduled-policy subsystem, not six separate Ch. 8 menu items.** Each retention target from Ch. 8 becomes a `retention_policies` row: `{ key: 'sales.saved_transactions' | 'employees.time_clock' | 'inventory.changes' | 'crm.gift_certificate_fully_redeemed' | 'platform.deleted_record_keys' | 'products.auto_delete_skus', strategy, cadence (cron), lookbackDays, scopeFilters (JSON), dryRun, enabledAt, lastRunAt, owningModule }`. Each execution writes a `retention_runs` row with `(policyId, startedAt, finishedAt, status, affectedRowCount, samplePayload, auditEventId, dryRun)`. **Every run is dry-run-by-default until an operator toggles `dryRun=false` in the admin UI** — this is stricter than RICS, which just does the delete. The "Auto-Delete SKUs" policy (p. 115) inherits RICS's complex guard: `don't touch SKUs modified after X` + the scope filters translate to a `scopeFilters` object honored by `products`'s retention handler.
6. **Every module exposes a `retention-handler` contract that `platform` calls.** Owning-module code is the source of truth for *what* "stale" means for that module's entities (because it knows the business rules); `platform` is the source of truth for *when* and *how often* and *how many rows at a time* and *whether it's a dry run*. The contract is `retentionHandler.apply({ policyKey, cutoffAt, scopeFilters, dryRun, batchSize }): Promise<RetentionResult>`. This is the same contract-adapter discipline as the existing `PurchasingContractAdapter` (`apps/api/src/contracts/purchasingContract.ts`) — `platform` never reaches into a sibling module's tables to delete rows.
7. **Backups are managed-Postgres snapshots plus logical exports; operators never see "compact / repair / create / delete database".** Platform tracks snapshots as a `backup_snapshots` read model sourced from whichever managed-Postgres provider we land on (RDS / Crunchy / Neon point-in-time recovery). The Ch. 14 "Backup Data / Backup to CD / Unattended Backup" trio collapses to: (a) provider-managed continuous PITR with a daily ops dashboard; (b) an optional `pg_dump`-style logical export job, scheduled via the job subsystem, writing to object storage; (c) no "Restore Data" UI — restoring is a provider-side operation we document, not a self-service operator action. "Backup Files for POS" (p. 176) and "Backup to CD" (p. 191) have no analog — they existed to move data between a main and a POS computer that don't exist in our architecture.
8. **System Status Report (p. 219) becomes a live admin telemetry dashboard**, not a printable report. What it shows:
   - **Job History tab** — filterable view of `audit_log` rows where `resourceType = 'platform.job_run'`, defaulting to last 60 days with an actor + timestamp + status column. Replaces Print Job History verbatim.
   - **Database tab** — per-table row counts, index sizes, most-recent-vacuum timestamps, slowest queries from `pg_stat_statements`. Replaces Print File Statistics.
   - **System info tab** — live render of Company Setup / Mail List Setup / Season Setup / feature-flag state / active integrations. Replaces Print RICS System Information.
   - **Workers tab** — BullMQ queue depth + failed-job count + oldest scheduled job per queue.
   - **Integrations tab** — per-endpoint last-success timestamp, last-failure timestamp, unacknowledged error count.
9. **EDI + SPS Commerce are first-class integration endpoints with a durable message log.** `integration_endpoints { id, kind: 'EDI_SPS' | 'EDI_GENERIC' | 'MARKETPLACE_INBOUND_SALES' | 'VENDOR_UPC_GMAIC' | ..., direction: 'INBOUND' | 'OUTBOUND' | 'BIDIRECTIONAL', config (JSON, referenced by settings-catalog key), enabled, lastRunAt }`. Every inbound or outbound document lands in `integration_messages { id, endpointId, direction, payloadHash, payloadRef (object-storage URL), status, parsedSummary, errorMessage, correlationId, createdAt }`. The worker that processes a message calls a module-owned inbound handler (for EDI 850 → `purchasing.receiveEdi850()`, for SPS Commerce 856 ASN → `purchasing.receiveEdiAsn()`, etc.) and records the result. **`purchasing` vs. `platform` boundary**: the *wire protocol*, auth, retry, rate-limiting, and durable message log belong to `platform`; the *document semantics* (what an 850 means for a PO) belong to `purchasing`. See Open Questions for whether the inbound-sales-feed connector (RICS p. 180) lives in `platform` or `sales-pos`.
10. **GMAIC Vendor UPC Import (Ch. 5) lands here too.** RICS treats it as a products-module screen, but mechanically it's the same shape as EDI: inbound file, parse, hand off to a module handler. The *handler* lives in `products`, the *endpoint + message log* live in `platform`. Cross-referenced in `docs/modules/products.md`.
11. **Macros and shortcut keys fold into a `saved-views` + `keyboard-shortcuts` registry in `platform`, not per-module.** RICS macros were global keystroke replays (p. 205); Zack's Retail replaces them with: (a) a `saved_views` table backing bookmarkable URL states (filter+sort+column config) per user per module; (b) a client-side keyboard-shortcut registry where each module registers its shortcut keys through a common hook. Neither ships with the full expressiveness of the RICS macro language (`{Down}`, `{Enter}`, alt-modifier, etc.) — that level of automation belongs in the API, not simulated keystrokes.
12. **Every audit event carries a `traceId`.** The existing `otbPolicyAuditService` already threads a `traceId` through each event. Platform formalises it: a request-scoped middleware generates a `traceId` for every HTTP request (or consumes an incoming `traceparent` header), stores it in AsyncLocalStorage, and every `audit.record()` / `notifications.send()` / `jobs.enqueue()` call reads it. This makes "show me every audit event from this PO submit across every module" a one-query operation.
13. **Retention of the audit log itself is policy-driven, not hardcoded.** `otbPolicyAuditService` today bakes in a 400-day retention at the row level. Platform generalises this to `audit_retention_by_resource_type { resourceType, retentionDays }` with a 400-day default. Sensitive resource types (`crm.pii_change`, `accounts-receivable.statement_sent`) can be overridden to longer retention without changing the write path.
14. **A single CLI and a single admin page for every policy write.** No `RICS.CFG` editor, no text-file hand-edits, no SSH into the server. Settings, flags, retention policies, integration endpoints, and notification templates all go through the `/admin/platform/*` routes with audit trails attached. When an engineer needs to bulk-edit for incident response, the CLI (`pnpm admin settings:set`) is a thin wrapper over the same HTTP API, not a bypass.

## Implemented — RICS → Postgres mirror sync

The pipeline that hydrates every module's future reads from RICS lives in `platform`, because it's cross-cutting infrastructure with a single audit surface (`platform.etl_run` + `platform.etl_run_table`) and no business-domain owner.

- **What it does.** Full one-way reload from the 13 canonical RICS MDB files into the `rics_mirror` Postgres schema, in ~5 minutes, atomically (staging schema + rename swap inside a transaction). Writes one row to `platform.etl_run` per invocation and one row per table to `platform.etl_run_table`.
- **Direction.** RICS → Postgres only. Never the other way. Preserves the read-only-MDB hard rule from [CLAUDE.md](../../CLAUDE.md).
- **App data survival.** The reload only rebuilds `rics_mirror`; `public.*` (existing Prisma models) and `app.*` (future overlays) are untouched, so operator work persists across reloads by design.
- **Triggering.** Operator-invoked — `pnpm --filter @benlow-rics/api sync:rics` or the `/verify-rics-mirror` slash command. No cron by default; each module can schedule its own refresh cadence via the job subsystem (decision #1) once the module cuts over.
- **Extractor.** C# class hosted in PowerShell via `Add-Type`; streams rows from ACE.OLEDB.12.0 into a CSV intermediate, which Node pipes into `COPY FROM STDIN WITH (FORMAT csv)`. Rewrite of the original PowerShell + JSON path (which was O(table size) RAM on every hop); new path is bounded by ACE read speed.
- **Audit surface.** `platform.etl_run` and `platform.etl_run_table` are the first two `platform`-owned tables in production. Their data model is specified below; their Prisma models live in [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma).

Full architecture, type mapping, canonical table list, troubleshooting, and hard rules: **[docs/operations/rics-mirror-sync.md](../operations/rics-mirror-sync.md)**.

This capability does not replace the broader `platform` scope described above — it's one concrete piece of it, landed early because every module's Postgres cutover depends on it.

## Contracts with other modules

**Outbound (this module exposes — everyone consumes these)**

```ts
// Audit — replaces direct writes to otb_policy_audit_log / otb_budget_audit
audit.record({
  resourceType: string,                 // e.g. 'otb.policy_decision', 'products.sku.price_change'
  resourceId: string,
  eventId?: string,                     // groups sibling rows from the same logical decision
  action: string,                       // 'create' | 'update' | 'delete' | 'submit' | ...
  actorUserId: string,
  traceId?: string,                     // read from AsyncLocalStorage if absent
  payloadBefore?: unknown,
  payloadAfter?: unknown,
  payloadExtra?: unknown,               // e.g. threshold metadata, projected utilization pct
  retentionOverrideDays?: number,
}): Promise<{ auditEventId: string }>

audit.query({
  resourceType?: string,
  resourceId?: string,
  traceId?: string,
  actorUserId?: string,
  fromAt?: Date,
  toAt?: Date,
  limit: number,
  cursor?: string,
}): Promise<{ rows: AuditEvent[]; nextCursor?: string }>

// Notifications — replaces Reminders + Send Messages to Stores
notifications.send({
  template: string,                     // e.g. 'otb.ceoExceptionRequested'
  recipient: { kind: 'user'; userId: string }
            | { kind: 'role'; role: string }
            | { kind: 'store'; storeId: string; broadcast?: boolean }
            | { kind: 'broadcast'; audience: 'all' | 'managers' | ... },
  channels?: ('inApp' | 'email' | 'sms')[],  // defaults from user preferences
  data: Record<string, unknown>,
  scheduledFor?: Date,                  // RICS Reminders shape
  rescheduleRule?: { kind: 'everyNDays' | 'nextMonth' | 'nextYear'; n?: number },
  dedupeKey?: string,                   // e.g. 'otb.ceoException.<poId>'
}): Promise<{ notificationId: string }>

// Settings + feature flags — replaces RICS.CFG
settings.get<T>(key: string, opts?: { scope: 'company' | 'store' | 'user'; scopeId?: string }): Promise<T>
settings.set<T>(key: string, value: T, opts: { scope; scopeId?; actorUserId }): Promise<void>
settings.list(opts: { scope; scopeId?; keyPrefix? }): Promise<Record<string, unknown>>

featureFlags.isEnabled(key: string, opts?: { scope; scopeId?; actorUserId? }): boolean
featureFlags.setRollout(key: string, rollout: Rollout, opts: { actorUserId }): Promise<void>

// Jobs — replaces Job List / Super Jobs / Unattended Backup
jobs.enqueue<TPayload>({
  queue: string,                        // e.g. 'retention', 'exports', 'edi'
  jobName: string,
  payload: TPayload,
  runAt?: Date,
  repeat?: { cron?: string; everyMs?: number; limit?: number },
  priority?: number,
  uniqueKey?: string,                   // idempotency
  superJobId?: string,                  // sequence membership
}): Promise<{ jobId: string }>

jobs.defineSuperJob({
  id: string,
  name: string,
  steps: Array<{ queue; jobName; payload; continueOnFailure?: boolean }>,
  schedule?: { cron: string },
}): Promise<void>

jobs.cancel(jobId: string, opts: { actorUserId }): Promise<void>
jobs.status(jobId: string): Promise<JobStatus>

// Retention — replaces Ch. 8 purge menu items
retention.definePolicy(policy: RetentionPolicy, opts: { actorUserId }): Promise<void>
retention.runNow(policyKey: string, opts: { dryRun: boolean; actorUserId; traceId? }): Promise<RetentionRun>
retention.lastRun(policyKey: string): Promise<RetentionRun | null>

// Integrations — replaces EDI + SPS Commerce + Internet Sales Import
integrations.registerEndpoint(endpoint: IntegrationEndpoint, opts: { actorUserId }): Promise<void>
integrations.recordInboundMessage({ endpointId, payloadRef, payloadHash, correlationId? }): Promise<{ messageId: string }>
integrations.handInboundToModule({ messageId, moduleHandler }): Promise<HandlerResult>
integrations.recordOutboundMessage({ endpointId, payloadRef, payloadHash, correlationId? }): Promise<{ messageId: string }>

// Telemetry — replaces System Status Report
telemetry.getSystemStatus(): Promise<SystemStatusSnapshot>
telemetry.getQueueStats(queue?: string): Promise<QueueStats[]>
telemetry.getDbStats(): Promise<DbStatsSnapshot>

// Backups — operators see this as read-only observability
backups.listSnapshots(opts?: { from?: Date; to?: Date }): Promise<BackupSnapshot[]>
backups.triggerLogicalExport(opts: { actorUserId; includeTables?: string[] }): Promise<{ jobId: string }>
```

**Inbound (this module consumes)**

Platform *calls into* every module through two kinds of contract:

- **Retention handlers** — each module exports a `retentionHandler` for the policy keys it owns.
  - `products` — `products.auto_delete_skus` (p. 115); must honour the "SKUs modified on/after date" guard and all scope filters.
  - `sales-reporting` — `sales.saved_transactions` (p. 114).
  - `employees` — `employees.time_clock` (p. 114).
  - `inventory` — `inventory.changes` (p. 116).
  - `customer-transactions` — `crm.gift_certificate_fully_redeemed` (p. 116).
  - `sales-pos` / `crm` — `platform.deleted_record_keys` (p. 115) if we keep a tombstone table.
  - `products` — `products.orphaned_asset_files` (the modern descendant of "Reset Pictures", p. 194).
- **Integration handlers** — each module exports inbound handlers for the integration kinds it owns.
  - `purchasing.receiveEdi850(message)`, `purchasing.receiveEdiAsn(message)`, `purchasing.receiveEdi810Invoice(message)` (EDI, p. 190).
  - `products.importGmaicVendorUpc(message)` (GMAIC, Ch. 5).
  - If the optional inbound-sales-feed connector ships: `sales-pos.importExternalSalesFile(message)` (the RICS p. 180 shape).

Platform also consumes from **`employees`**:
- `hasPermission(userId, 'platform.settings.write' | 'platform.flags.write' | 'platform.retention.run' | 'platform.jobs.manage' | 'platform.audit.read' | 'platform.integrations.manage' | 'platform.backups.trigger' | 'platform.notifications.broadcast')` — every outbound contract above is permission-gated.

## Data model sketch

Postgres-first; owned exclusively by `platform`.

- **`settings`** — `(scope, scopeId, key)` unique; `valueJson`, `updatedBy`, `updatedAt`, `previousValueJson`. Unknown keys rejected against `settings-catalog.ts` at the service layer.
- **`feature_flags`** — `(key)` unique; `description`, `defaultEnabled`, `rolloutJson`, `ownerModule`, `createdAt`, `updatedAt`.
- **`feature_flag_overrides`** — `(flagKey, scope, scopeId)` unique; `enabled`, `reason`, `expiresAt?`.
- **`audit_log`** — `id`, `eventId`, `resourceType`, `resourceId`, `action`, `actorUserId`, `traceId`, `payloadBeforeJson`, `payloadAfterJson`, `payloadExtraJson`, `retentionExpiresAt`, `createdAt`. Indexes: `(resourceType, resourceId, createdAt DESC)`, `(traceId)`, `(eventId)`, `(createdAt)` for archival, `(actorUserId, createdAt DESC)`. **Append-only** (enforced by GRANTs + no UPDATE trigger).
- **`audit_retention_by_resource_type`** — `(resourceType)` unique; `retentionDays`, default 400.
- **`notifications`** — `id`, `template`, `recipientKind`, `recipientRef`, `dataJson`, `channelsJson`, `status`, `scheduledFor`, `sentAt`, `dedupeKey`, `traceId`, `createdAt`. Indexes: `(status, scheduledFor)` for the dispatcher, `(recipientRef)` for inbox queries, `(dedupeKey)` unique where not null.
- **`notification_preferences`** — `(userId, category)` unique; `channelsEnabledJson`, `mutedUntil?`, `digestFrequency ∈ { 'immediate', 'hourly', 'daily' }`.
- **`notification_templates`** — `(key)` unique; `subjectTemplate`, `inAppTemplate`, `emailHtmlTemplate`, `emailTextTemplate`, `smsTemplate`, `version`, `updatedAt`.
- **`scheduled_jobs`** — `id`, `queue`, `jobName`, `payloadJson`, `cronExpression?`, `everyMs?`, `priority`, `uniqueKey?`, `superJobId?`, `createdBy`, `createdAt`, `enabled`. Indexes: `(queue, enabled)`, `(uniqueKey)` unique where not null.
- **`job_runs`** — `id`, `scheduledJobId?`, `queue`, `jobName`, `payloadJson`, `startedAt`, `finishedAt?`, `status ∈ { queued, running, succeeded, failed, retrying, cancelled, dead_letter }`, `attempt`, `errorMessage?`, `outputJson?`, `traceId`, `actorUserId?`. Partitioned by `startedAt` month (Postgres native partitioning) to keep long-running telemetry cheap.
- **`super_jobs`** — `id`, `name` unique, `stepsJson`, `schedule?`, `createdBy`, `createdAt`.
- **`retention_policies`** — `(key)` unique; `ownerModule`, `cadenceCron`, `lookbackDays`, `scopeFiltersJson`, `dryRun`, `enabled`, `lastRunAt?`, `nextRunAt?`, `description`.
- **`retention_runs`** — `id`, `policyKey`, `startedAt`, `finishedAt?`, `status`, `dryRun`, `affectedRowCount`, `samplePayloadJson`, `auditEventId`, `traceId`, `actorUserId?`.
- **`integration_endpoints`** — `id`, `kind`, `direction`, `name`, `configRef` (points at a `settings` key), `enabled`, `ownerModule`, `lastInboundAt?`, `lastOutboundAt?`, `createdAt`.
- **`integration_messages`** — `id`, `endpointId`, `direction`, `payloadHash`, `payloadObjectKey` (object-storage URL), `status ∈ { received, parsed, handed_off, succeeded, failed, dead_letter }`, `parsedSummaryJson?`, `errorMessage?`, `correlationId?`, `handlerModule?`, `handlerOutputJson?`, `receivedAt`, `processedAt?`, `traceId`. Indexes: `(endpointId, receivedAt DESC)`, `(correlationId)`, `(status, receivedAt)` for retry scans.
- **`backup_snapshots`** — read model synced from the managed-Postgres provider's API. `id`, `provider`, `providerSnapshotId`, `kind ∈ { pitr, logical_export }`, `startedAt`, `finishedAt`, `sizeBytes?`, `retentionExpiresAt?`, `objectStorageRef?` (for logical exports only).
- **`saved_views`** — `(userId, moduleKey, viewName)` unique; `filtersJson`, `sortJson`, `columnsJson`, `sharedWithRoles?`, `createdAt`.
- **`etl_run`** (implemented) — `id`, `startedAt`, `finishedAt?`, `status ∈ { running, ok, failed }`, `totalRows`, `tableCount`, `errorText?`. One row per invocation of `pnpm sync:rics`. Index on `startedAt`. See [rics-mirror-sync.md](../operations/rics-mirror-sync.md).
- **`etl_run_table`** (implemented) — `id`, `runId` (FK to `etl_run`), `mdbFile`, `sourceTable`, `targetTable`, `rowCount`, `durationMs`, `status`, `errorText?`, `startedAt`. One row per (run, source MDB table).

**Migration path for the two existing OTB audit tables.** Step 1 (ZAI-???): create `audit_log`, dual-write from `otbPolicyAuditService` and `otbBudgetService`. Step 2: backfill historical rows from `otb_policy_audit_log` + `otb_budget_audit` into `audit_log` with `resourceType = 'otb.policy_decision'` and `'otb.budget_field_change'`. Step 3: flip reads. Step 4: drop the two legacy tables. During steps 1–3 the existing migrations 0007+ stay intact; the `otb_policy_audit_log` table remains the source of truth until step 3.

## RICS features handled elsewhere (cross-reference)

These features were on the original `platform` shortlist but are owned by adjacent modules; this spec references them only to pin down the boundary.

- **Close Week / Month / Season / Year** (Ch. 8, p. 113) — fiscal close lives in `accounts-receivable`. Platform is the executor when close is scheduled, but the policy belongs to A/R.
- **Frequent Buyer Plan** (Ch. 15, pp. 201–205) — loyalty engine is `crm`.
- **Company Setup / Mail List Setup / Season Setup** (Ch. 17) — settings surface is rendered by `platform`'s settings UI, but the *schemas* (which keys exist, what they mean, what they default to) are owned by their respective modules: `store-ops` for Company Setup, `crm` for Mail List Setup, `accounts-receivable` for Season Setup.
- **RICS Ch. 15 batch utilities** (Change Salespeople / Size Columns / Size Types / Categories / Vendors / Seasons / Groups / Keywords, pp. 195–199) — dropped per registry; no platform equivalent, each owning module handles renames/renumbers through ordinary edit flows.
- **Test Modem / Find Port, Printer Setup** — dropped; browser handles it.

## Out of scope for v1

- **No self-service Postgres restore UI.** v1 surfaces a snapshot list; restoring a snapshot is a provider-console operation, documented for operators.
- **No SMS channel in the notification service.** The `sms` slot is in the data model so we don't migrate later, but v1 ships in-app + email only.
- **No user-defined retention policies.** The policy catalog is code-declared in v1 (six policies from Ch. 8 + one for orphaned assets); operators toggle cadence and dry-run, not add new policies. Custom policies land in v2.
- **No general workflow engine.** Super Jobs cover linear sequences; anything needing branches, approvals, or compensations is too ambitious for v1. If a module needs that shape (e.g., CEO exception approval chains from `otb-planning`), it implements the state machine locally and emits audit events.
- **No EDI translation engine built in-house.** Platform owns the transport + message log; parsing 850/855/856/810 payloads is a handler in `purchasing` that can use an off-the-shelf library (`node-edi` or similar).
- **No import of the RICS macro language.** The macros from p. 205 are abandoned; users who relied on them get per-module saved views instead. Document the migration explicitly in the v1 release notes.
- **No "Check Data Integrity" tool** (RICS p. 193). Managed Postgres + foreign-key constraints + write-path validation replace it; no operator-triggered integrity scan in v1.
- **No per-user printer setup** (Ch. 17, p. 216). Browser handles printing.

## Open questions

1. **BullMQ vs. pg-boss.** BullMQ needs Redis; pg-boss is pure Postgres. Recommendation: BullMQ for the admin UI quality + repeatable jobs. Confirm with ops before introducing Redis as a deployment dependency.
2. **Email provider.** Resend (cheap, modern, transactional-only) vs. SES (cheaper at scale, worse DX) vs. Postmark. No strong opinion yet; tied to the Zack's Retail hosting story.
3. **Do we keep "Auto-Delete SKUs"'s RICS-style age-based semantics (p. 115), or require explicit SKU discontinue from `products`?** Retail operators are used to the RICS auto-delete behaviour, but it's destructive. Recommendation: v1 ships it as a **dry-run-only** policy with a manual "apply" button after review; graduate to automated in v2 once operators trust the surface.
4. **Tombstones for "Clear Deleted Record Keys" (p. 115).** Do we keep a soft-delete tombstone table at all? In a single-Postgres world the dial-up-sync reason is gone, but tombstones are still useful for audit and undelete. Recommendation: yes, keep a lightweight `soft_deletes` table per module, give it the `platform.deleted_record_keys` retention policy. Confirm.
5. **`integration_endpoint` kind taxonomy.** EDI has at least five document types (850, 855, 856, 810, 997); do we model each as a separate endpoint-kind, or as a single `EDI_GENERIC` with a `documentType` field per message? Recommendation: single endpoint per trading partner, `documentType` per message — matches how SPS Commerce organises traffic.
6. **Where does the inbound-sales-feed connector (RICS p. 180, Import Internet Sales) live?** The registry drops it because our own storefront writes directly — but if a customer ever needs to ingest marketplace sales or a third-party POS, the connector has to land somewhere. Recommendation: the *handler* lives in `sales-pos` (it writes tickets), the *endpoint + message log* live in `platform`. Confirm this split, or move to `sales-pos` entirely.
7. **Audit log retention default.** `otbPolicyAuditService` uses 400 days. SOX-adjacent use cases typically want 7 years; CRM PII changes usually want indefinite. Recommendation: 400-day default, per-`resourceType` override table (already in the data model). Set explicit defaults now for `accounts-receivable.*` (7 years), `crm.pii_change` (indefinite), everything else (400 days). Confirm before shipping.
8. **Notification inbox vs. toast.** Do we render in-app notifications as a persistent inbox (badge + list), as ephemeral toasts, or both? Recommendation: both — every `notifications.send()` writes to the inbox; a delivery rule per template decides whether it also toasts. Confirm UX direction with the design stakeholder.
9. **Shortcut/macro migration path.** RICS macros are per-user custom keystroke replays (p. 205). Our replacement is saved views + fixed shortcuts. Do we need a one-time migration tool that reads a user's old macros and generates saved-view suggestions, or is a release-note migration sufficient? Recommendation: release note only; the macros are too free-form to auto-convert.
10. **Does `backup_snapshots` belong in the Zack's Retail DB at all, or should we just query the provider API on demand?** If snapshots are short-lived (rolling 35-day PITR window on most managed providers), caching them locally is pointless; if we also track logical exports separately, a local table helps. Recommendation: store logical exports we create locally; query provider API for PITR on demand and cache in-memory for 60s.
