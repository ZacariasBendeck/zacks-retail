---
description: Browser-test every visible page, tab, table, drawer, modal, form, filter, search box, action button, menu item, export, and navigation path in a Zack's Retail module. Boots Postgres + API + web, logs in as the operator, click-walks the module's UI, and reports findings P0–P3 with reproduction steps. Read-only by default; any test data created is prefixed `AI-TEST-<YYYY-MM-DD>-`.
---

# test-module-ui

Browser-test the `$ARGUMENTS` module end-to-end in the running Zack's Retail web app. **Argument is required** — the module name as it appears in the left-nav or URL (e.g. `inventory`, `customers`, `purchasing`, `sales-pos`, `products`, `otb-planning`, `import-management`). If `$ARGUMENTS` is empty, stop and ask which module to test.

## Why this exists

Code inspection and unit tests miss the things that actually break the operator's day — a route that 404s, a table that never resolves its loading spinner, a save button that fires the request but doesn't close the drawer, a HNL amount formatted as `$1,234`. This command **clicks through every surface** the way a real operator would, against the **live local stack** (Postgres + API + web), with the operator's credentials.

This is a checking ritual, not a fixing one. **Do not edit module code while running this command.** Open issues in the report; let the operator decide what to fix and when.

## Project context to keep in mind

- Retail system: ~30 shoe/clothing stores + central warehouse + POS + inventory + PIM + purchasing + reports + future webstore. Not a B2B CRM — there are no leads, pipelines, opportunities, call logs, or account-manager workflows. If you see those concepts, that's a finding.
- Currency is **HNL (Honduran Lempira)**. Per `CLAUDE.md`, plain numbers with thousands separators in cells (`1,234.56`), no `$`, no `L` per-row. A USD-formatted HNL value is a P1 finding. A page-level "Amounts in Lempira (HNL)" note is correct.
- Authority of features comes from the module spec at `docs/modules/<slug>/`, the manual at `docs/zacks-retail-manual/<slug>.md` (forward spec), and dated specs at `docs/dev/specs/`. Read these before testing — they tell you what the module is *supposed* to do.

## Preconditions

1. `$ARGUMENTS` is provided.
2. Working directory is `e:\dev\zacks-retail`.
3. A browser-automation MCP is attached (chrome-devtools, playwright, or equivalent — tools surface as `mcp__chrome-devtools__*`, `mcp__playwright__*`, etc.). If none is attached, stop and tell the operator: "No browser MCP detected. Attach chrome-devtools-mcp or playwright-mcp and re-run." Do not attempt to drive the browser via Bash + curl — that does not exercise the UI.
4. Read the module spec at `docs/modules/$ARGUMENTS/` (especially `business-functional.md` and `tech-description.md`) and the manual chapter at `docs/zacks-retail-manual/$ARGUMENTS.md` if they exist. These define what to test against. If neither exists, note it in the report and test what's visible.

## Environment

- API: `http://localhost:4000`
- Web: `http://localhost:3000`
- Login:
  - email: `zbendeck@gmail.com`
  - password: `123`

## Startup sequence

Run these in order. Skip any step where the resource is already up — don't restart healthy services.

1. **Verify Postgres.** `pnpm db:up` from the repo root. If it fails, stop and surface the docker error.
2. **Start API** in the background: `pnpm --filter @benlow-rics/api dev`. Wait until you see the SKU Lookup index warmup completion line in the log (per the SKU Lookup HARD RULE in `CLAUDE.md` — the API is not ready before then). If the warmup never completes, that is itself a P0 finding.
3. **Start web** in the background: `pnpm --filter @benlow-rics/web dev`. Wait for Vite's "ready in" line and the `http://localhost:3000` URL.
4. **Open the browser** to `http://localhost:3000`, log in with the credentials above, and confirm the dashboard renders without console errors.

If any of these steps surface unexpected errors, capture them as findings but continue if you can — a broken login is reportable but ends the session.

## Testing methodology

### 1. Map the surface first

Before clicking anything, build a coverage map for the module:

- Enumerate every route under the module from `apps/web/src/pages/<module>/` (and any sub-routes).
- Read the relevant `Routes.tsx` / route registration to see which paths are wired.
- List every left-nav entry, top-tab, and breadcrumb that mentions the module.
- Sketch the test plan: pages × (default state, with-data state, empty state, error state).

Write this map to memory (or a scratch list in the response) and tick items as you cover them. The final report includes this map.

### 2. Walk the UI

For each page in the map, exercise:

- **Navigation** — left-nav click, breadcrumb click, deep-link via URL paste, browser back/forward, refresh. Check that route guards behave (logged-out redirects, permission-gated screens).
- **Tables** — sort each sortable column (asc + desc), apply each filter, paginate, change page size, search with a hit, search with no hit, click each row action, click row to open detail. Confirm the empty state is sensible (not a blank white box).
- **Forms / drawers / modals** — open, edit a field, leave a required field blank to confirm validation, cancel (verify state didn't change), save with valid input. For destructive actions, confirm the confirmation dialog exists and that Cancel actually cancels.
- **Search boxes** — exact match, partial match, no-match, empty string, special characters, very long input.
- **Filters** — each filter individually, combinations, clear-all.
- **Buttons / menu items** — every visible action triggers something coherent (network call, navigation, modal). A button that does nothing is a P1.
- **Exports** — CSV / XLSX / PDF / print preview. Confirm the file downloads, has the right columns, and the HNL columns are plain numbers (not `$`).
- **Layout** — at default viewport, confirm no clipping, overlap, unreadable text, or controls pushed off-screen. Spot-check tablet width (~1024px) for the high-traffic screens.

### 3. Watch the side channels

Throughout the walk, monitor:

- **Browser console** — any error, warning about React keys, hydration mismatch, deprecated API, network/CORS failure.
- **Network panel** — any 4xx/5xx response, any request that hangs > 10s, any payload that is obviously wrong (missing fields, undefined in a field, currency-as-string mismatch).
- **Loading states** — a spinner that never resolves is a P0 for that screen.

### 4. Retail-domain sanity checks

These are the things a code reviewer would miss but a store operator would catch immediately:

- Store numbers, SKU codes, barcodes, and quantities look like real retail values, not `Lorem ipsum` or test fixtures leaking into production-style screens.
- Currency: HNL plain numbers with thousands separators — no `$`, no per-cell `L`, no `en-US` formatting. Page-level "Amounts in Lempira (HNL)" footnote is fine.
- Customer screens treat customers as **retail customers** — purchase history, segments, promotion eligibility, loyalty. **Not** as B2B accounts (no leads, no opportunities, no pipelines, no call logs, no account managers). Any of those is a P1.
- Dates use a consistent format (Honduras locale or ISO — not mixed).
- Status labels match what the module spec defines (e.g. PO statuses, transfer statuses, ticket statuses).
- Totals and counts at the top of a page reconcile with the rows visible (off-by-one, page-only-vs-full-result-set confusion).

### 5. Edge cases

- Refresh the page mid-load and after load.
- Browser back from a detail to a filtered list — does the filter survive?
- Deep-link to a detail page directly (e.g. `/inventory/sku/AI-TEST-...`) — does it resolve or 404?
- Slow network simulation if the MCP supports it — does the loading UX hold up?
- Searching for nothing, searching for a string that can't match, searching for a SQL-injection-shaped string (it should just return no results, not 500).

## Test data rules

- **Default to read-only.** Most modules have enough real or rehearsal data to test against. Don't create records unless a write flow needs to be exercised.
- **If you must create test data**, prefix every name, code, customer name, PO number, etc. with `AI-TEST-<YYYY-MM-DD>-`. Today is in the system context as `currentDate`. This makes every artifact greppable for cleanup later.
- **Never delete real-looking data.** A row without the `AI-TEST-` prefix is presumed real. If a test flow requires deleting, stop and ask the operator first.
- **Never run destructive actions** against real data: no bulk delete, no transfer of real inventory, no posting of a real PO, no settlement of a real ticket. Run those flows only against `AI-TEST-` records you created in the same session.
- **Postgres-only writes.** Per the HARD RULE in `CLAUDE.md`, no test creates rows in SQLite. Web-app writes already route to Postgres; this is just a sanity reminder.

## Severity ladder

| Severity | Meaning |
|---|---|
| **P0** | Blocker. Page won't load, login broken, save throws 500, infinite loading state, data-loss risk. The module is unusable for this flow. |
| **P1** | Serious. Wrong data shown, broken validation, missing permission gate, USD symbol on HNL value, B2B-CRM concept on a customer screen, button that does nothing, console error on a primary flow. |
| **P2** | Normal. Awkward UX, sort doesn't persist, empty state is a blank box, layout cramped at common widths, filter clear-all leaves residue. |
| **P3** | Polish. Tooltip wording, capitalization, icon choice, minor spacing. |

## Final output format

Reply in the conversation with this exact structure (no separate file unless the operator asks):

```markdown
# Browser test — <module> — <YYYY-MM-DD>

## 1. Verdict
**<PASS / FAIL / RISKY>** — one-sentence reason.

## 2. Coverage map
- Routes tested: <list>
- Tables exercised: <list with quick notes>
- Forms / modals exercised: <list>
- Exports verified: <list>
- Flows tested end-to-end: <list>

## 3. Findings (ordered by severity)

### P0 — <count>
1. **<Page / route>** — <one-line summary>
   - Steps: <numbered repro>
   - Expected: <what should happen>
   - Actual: <what happened>
   - Evidence: <console / network / screenshot path>
   - Suspected cause: <if obvious>
   - Suggested fix: <if obvious>

### P1 — <count>
... (same shape)

### P2 — <count>
... (same shape)

### P3 — <count>
... (same shape)

## 4. Areas not tested
- <area> — <reason: out of scope / no permission / no test data / requires destructive action>

## 5. Test artifacts created
- <list of `AI-TEST-<DATE>-...` records created, with cleanup hint>
- (or: "None — read-only run.")

## 6. Stack state at end of run
- API: <up / down / restarted>
- Web: <up / down / restarted>
- Postgres: <up / down>
```

If the verdict is FAIL, the report ends there — do not propose patches in the same response. The operator opens fixes as their own tasks.

## Rules

- **Don't edit module source** while running this command. Reporting only. The exception is fixing your own test data (`AI-TEST-...` records you created).
- **Don't restart healthy services.** If the API is already running and the warmup line is in its log, leave it.
- **Don't bypass the SKU Lookup warmup.** If the API isn't ready, wait — that warmup is a HARD RULE in `CLAUDE.md`.
- **Don't drive the browser via Bash.** This command requires a real browser MCP. If none is attached, stop.
- **Don't fall back to unit tests or curl.** This command is specifically about the UI surface; passing a unit test does not cover what this command checks.
- **Don't write any new SQLite rows.** Postgres-only HARD RULE applies.
- **Don't create branches or worktrees.** Per the HARD RULE in `CLAUDE.md`, work happens on `master`.
- **HNL plain numbers** — never use `$`, never `USD`, never `en-US` currency formatters in any test data you create or any examples in the report.
- **No B2B-CRM language** in customer-screen findings or recommendations. Customers are retail customers.

## Example invocations

- `/test-module-ui inventory`
- `/test-module-ui customers`
- `/test-module-ui purchasing`
- `/test-module-ui sales-pos`
- `/test-module-ui import-management`
