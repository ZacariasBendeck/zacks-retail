# Zack's Retail — Project Status

**Latest milestone:** [phase-a-request-cutover](dev/milestones/2026-04-21-phase-a-request-cutover.md) — 2026-04-21
**Tag to check out:** `milestone-2026-04-21-phase-a-request-cutover`
**Current phase:** A (Mirror-backed dev — every request-side read now served from `rics_mirror`; no OLEDB at request time)
**Next:** Sweep for any residual MDB-at-request-time reads missed by the cutover (`grep runPowerShellJson apps/api/src`), spot-test UI pages, then begin evolving write paths to `public` / `app` schemas (Phase A → B).

## Milestone history

- [phase-a-request-cutover](dev/milestones/2026-04-21-phase-a-request-cutover.md) — 2026-04-21 — All 7 request-side adapters (product, inventory, inquiry rollup, on-hand-at-cost, sales history by month, sales report, SKU lookup) flipped to Postgres.
- [rics-mirror-live](dev/milestones/2026-04-21-rics-mirror-live.md) — 2026-04-21 — Phase A live: ETL pipeline, schemas, user manual scaffolded, agents retired.
- `rics-baseline-pre-postgres` tag — 2026-04-20 — Frozen RICS baseline before Postgres migration.
