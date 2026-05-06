# 13. Platform

> **Status:** Draft
> **Module spec:** [../modules/platform.md](../modules/platform.md)
> **RICS ancestry:** Ch. 5 (GMAIC Vendor UPC inbound transport only — parse stays in [Products](products.md)), Ch. 8 (retention purges only — fiscal closes live in [Accounts Receivable](accounts-receivable.md)), Ch. 13 (Send Messages to Stores, reimagined as in-app broadcasts), Ch. 14 (Job List / Super Jobs / Unattended Backup, reimagined as scheduled tasks; Reminders; EDI including SPS Commerce), Ch. 15 (DB utilities + RICS.CFG reimagined as feature flags; Macro Management reimagined as saved views + shortcuts; Reset Pictures reimagined as orphaned-asset retention), Ch. 17 (System Status Report)
> **Last updated:** 2026-04-21

## What this module does

Platform is the administrative spine that makes everything else work. Background workers and scheduled tasks (replacing RICS's Job List / Super Jobs); a generalized audit log (super-set of the OTB-specific audits that predated it); notifications, reminders, and in-app store-broadcasts; typed settings and feature flags (replacing RICS.CFG); managed-Postgres backup observability; integrations transport and durable message log (EDI including SPS Commerce; GMAIC inbound transport); data retention purges (sales transactions, time clock, deleted keys, auto-delete SKUs, inventory changes, gift certificate data, orphaned SKU asset files); saved views + keyboard shortcuts (replacing Macro Management); and the admin telemetry dashboard that replaces the System Status Report.

## Audience

- **System administrators** — scheduled-task configuration, feature flags, retention policy, EDI.
- **Developers** — audit-log investigation, feature-flag toggles, telemetry review.
- **Operators** — ETL run history, store-broadcast drafting, manual ETL invocation.
- **Accountants** — audit log investigation for financial changes.

## Prerequisites

- None — this module underpins the others.

## Screens

_TODO. Intended screens:_
- _Scheduled tasks — list, run history, manual trigger_
- **Inventory Close** — dry run, validation, run history, month close, and week close under **Operations -> Inventory Close**
- _Audit log search + filter (entity / actor / date)_
- _Notifications drafting + delivery status_
- _In-app broadcasts (send to all stores / selected stores)_
- _Feature flags (per-flag state, rollout percentage, audit)_
- _Settings editor (typed per category)_
- _EDI inbox / outbox + durable message log_
- _Retention policy editor + dry-run preview_
- _Saved views (by module, by user)_
- _Keyboard shortcut editor_
- _Admin telemetry dashboard — health, queue depth, ETL status, storage usage_
- _ETL run history (`platform.etl_run`)_

## Common tasks

_TODO. Expected flows:_
- _Schedule a recurring background task_
- _Trigger the `rics:sync` ETL manually and watch progress_
- _Dry-run and execute Inventory Month Close after the last posted sales batch for the month_
- _Dry-run and execute Inventory Week Close after the last posted sales batch for the week_
- _Investigate who last changed a specific SKU (audit-log query)_
- _Flip a feature flag for a pilot store_
- _Broadcast a same-day notice to all cashiers_
- _Run a retention-policy preview (no-op) and then commit_
- _Save a frequently-used report view as a personal shortcut_

## Reports

_TODO._

| Report | Where | Filters | Exports |
|---|---|---|---|
| ETL Run History | — | Date range, status | CSV |
| Audit Log Export | — | Entity, actor, date range | CSV |
| Admin Telemetry snapshot | — | Point-in-time | JSON / PDF |

## Keyboard shortcuts

_TODO._

## Common errors

_TODO._

## Data sources

- **Primary read + write:** `platform.etl_run`, `platform.etl_run_table` — already live as of 2026-04-21.
- **Future tables:** `platform.audit_log`, `platform.notification`, `platform.feature_flag`, `platform.scheduled_task`. These land as their UI screens ship.
- **Cross-module observer:** the audit log is opt-in per module (only modules that had RICS auditing emit events initially).

## Related modules

- **All of them.** Every module reads feature flags, writes to audit log (eventually), and may emit notifications. The retention purges sweep across every module's data that accumulates stale records.

## What's different from RICS

_TODO. Expected: RICS.CFG's opaque flat text file becomes a typed settings editor with validation and history; the Job List / Super Jobs system becomes a modern scheduler with retries, durable logs, and observability; Reminders stored in a local config file become in-app notifications with email routing; Macro Management becomes saved views + URL state + keyboard shortcuts; the System Status Report becomes a live dashboard._
