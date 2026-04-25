# Decisions: Sales POS

Running log of **module-scoped** design decisions — the *why* behind design choices that show up in the other artifacts in this folder. Append new entries at the **top** (most recent first).

Cross-module and project-wide decisions live in [`../../dev/specs/`](../../dev/specs/) instead — if a decision affects more than this module, write it there and (optionally) reference it here.

## Entry format

Each entry follows this shape:

> ## YYYY-MM-DD — Short decision title
>
> **Context:** What situation or question prompted this decision.
> **Decision:** What was decided.
> **Consequences:** What follows — tradeoffs, new constraints, knock-on effects.
> **Alternatives considered:** 1–3 options rejected, with one-line reason each.
> **Related:** Commits / specs / runbooks if applicable.

---

## 2026-04-25 - Postgres-owned register runtime is the only supported Enter Sales runtime

**Context:** Earlier Enter Sales work experimented with a register-local runtime. Project policy now requires all new operational development to land in Postgres-owned schemas, and supported environments must not add alternate request-path state stores.

**Decision:** The authoritative runtime for Enter Sales lives only in `app.pos_*` tables in Postgres.

**Consequences:** Ticket entry, shift close, payout, refund, reprint, and reporting all gain one source of truth that can participate in rehearsals, cross-module joins, audit trails, and cutover migration. Browser sessions no longer depend on register-local storage. Future Prisma migrations define the runtime contract.

**Alternatives considered:** Keep a register-local runtime - rejected because it conflicts with the Postgres-only rule and fractures rehearsal data. Hybrid local-to-Postgres posting - rejected because it duplicates state and makes parity defects harder to explain.

**Related:** [`schema.md`](./schema.md), [`tech-description.md`](./tech-description.md), [`../../dev/specs/2026-04-25-sales-pos-enter-sales-design.md`](../../dev/specs/2026-04-25-sales-pos-enter-sales-design.md)

## 2026-04-25 - Enter Sales becomes one browser workspace with drawers, not four disconnected windows

**Context:** The legacy workflow is split across separate screens for Start Batch, Ticket Detail, Ticket Payment, and Change Ticket Header. The supplied screenshots confirm that those are really one cashier task broken apart by the old Windows/Access UI.

**Decision:** Zack's Retail will implement Enter Sales as one route with a persistent ticket workspace. Payment, header changes, payouts, reclaim, and close-batch actions open as drawers or dialogs over the same page instead of as separate windows.

**Consequences:** Scanner focus, line totals, and active-ticket context remain stable while the cashier moves through the workflow. The UI still preserves the explicit RICS steps and numeric tender shortcuts, but in a shape closer to modern cart-first POS systems. State coordination is simpler because one page owns the whole interaction.

**Alternatives considered:** Recreate four separate routes one-for-one - rejected because it preserves the legacy window-management cost without functional upside. Collapse the whole register into a single minimal checkout card - rejected because it hides batch, reclaim, payout, and transaction-type controls that operators rely on.

**Related:** [`business-functional.md`](./business-functional.md), [`../../zacks-retail-manual/sales-pos.md`](../../zacks-retail-manual/sales-pos.md), [`../../dev/specs/2026-04-25-sales-pos-enter-sales-design.md`](../../dev/specs/2026-04-25-sales-pos-enter-sales-design.md)

## 2026-04-25 - Employee override tokens replace store-shared sales passwords as the authority path

**Context:** Early Enter Sales sketches preserved store-scoped `MANAGER` and `TICKET` shared passwords. The `employees` module already owns auditable sales-password verification and token consumption endpoints under [`apps/api/src/routes/employeeRoutes.ts`](../../../apps/api/src/routes/employeeRoutes.ts).

**Decision:** Sensitive Enter Sales actions such as discount approval, price override, refund authorization, close batch, and over/short approval must use the `employees` sales-password bridge as the authoritative verification path. Any store-level quick-change surface remains a configuration convenience only if operators still need it, not the security source of truth.

**Consequences:** Every override is attributable to a real employee and permission set, not just to knowledge of a shared register password. `sales-pos` depends on `employees` for override verification and token consumption instead of duplicating password state.

**Alternatives considered:** Keep shared store passwords as the main mechanism - rejected because auditability and permission scoping are weak. Duplicate the employee override logic inside `sales-pos` - rejected because it forks security behavior.

**Related:** [`tech-description.md`](./tech-description.md), [`api.md`](./api.md), [`../employees/README.md`](../employees/README.md)

## 2026-04-25 - Transaction types 3 through 8 stay in customer-transactions, even though the selector lives in Enter Sales

**Context:** The Change Ticket Header screenshot shows the RICS transaction-type selector directly inside Enter Sales. `MODULES.md` explicitly splits the register core from customer-account-backed flows such as special orders, layaways, gift card sales, and house charges.

**Decision:** `sales-pos` owns the ticket shell, the transaction-type picker, and the shared cashier workflow. The downstream lifecycle, balances, and print/report surfaces for transaction types 3 through 8 remain owned by `customer-transactions`.

**Consequences:** The register can still start those flows from one place, but the special business rules do not bloat the regular-sale core. The ticket schema carries nullable extension references and typed validation hooks instead of embedding special-order or layaway state directly in the base ticket tables.

**Alternatives considered:** Move all transaction-type logic into `sales-pos` - rejected because it erases the module boundary already called for in `MODULES.md`. Force cashiers to leave Enter Sales and start those flows elsewhere - rejected because it breaks the RICS operator model.

**Related:** [`business-functional.md`](./business-functional.md), [`schema.md`](./schema.md), [`../customer-transactions/README.md`](../customer-transactions/README.md)
