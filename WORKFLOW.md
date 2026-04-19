# How to work in Zack's Retail with Claude Code

A reference for **you, the programmer**, on how to drive Claude Code on this project. Keep this open until the flow is muscle memory.

> The agent-facing version of this guidance lives in [`CLAUDE.md`](./CLAUDE.md) at the repo root. This file is for humans — written in the first person, practical, no meta-analysis.

---

## The framework

This project uses **Subagent-Driven Development (SDD)** via the [`obra/superpowers`](https://github.com/obra/superpowers) skill pack.

The loop:

```
brainstorm → plan → worktree → subagent execute (with TDD) → verify → review → finish
```

You never invoke skills by name. They auto-trigger from context once the plugin is installed. What **you** choose is:

1. **Starting surface** — plain Claude Code, or a specific subagent.
2. **Mode** — plan mode (Shift+Tab twice) vs. normal.

Once you make those two choices, the skills take it from there.

---

## Choosing a starting surface: which "agent" do I chat with?

| I want to… | Start with | Mode |
|---|---|---|
| Plan overall **project architecture** or cross-module scope | Plain Claude Code | Plan mode |
| Plan work inside **one module** | Domain subagent (see below) | Plan mode |
| **Brainstorm** general specs | Plain Claude Code | Normal |
| **Brainstorm a spec from the RICS manual** | `rics-module-analyst` | Normal |
| Have Claude **write code** while I test and iterate | Plain Claude Code (it delegates automatically) | Normal |
| Debug a **cross-layer bug** (layout, flow, state) | Plain Claude Code | Normal |
| Debug a bug I'm sure lives in **one module** | That module's subagent | Normal |

### The subagents (in `.claude/agents/`)

- **`products-dev`** — owns products: SKUs, taxonomy, pricing, content overlay, facets, ProductCard, ProductDetail, the RICS product adapter, and `docs/modules/products.md`. Does NOT own cart/checkout/orders/account.
- **`storefront-dev`** — owns cart, checkout, orders, account pages, header/footer/layout, and the public API routes/services behind them. Does NOT own products.
- **`rics-module-analyst`** — reads the RICS v7.7 manual PDF and writes `docs/modules/<module>.md` specs. Use when translating legacy RICS behavior into a module.

**Rule of thumb:** touches one module's surface → start with that subagent. Crosses modules, architectural, or scope unclear → plain Claude Code and let it delegate.

### How to invoke a subagent

- Type `/agents` to see/select them.
- Or `@products-dev <your request>` to address one directly.
- Or just describe the task to plain Claude Code and it will spawn the right one via the Agent tool.

### Running multiple efforts in parallel

Working on **several modules at once** is a chat-window concern, not a subagent one:

- **Subagents** parallelize work *inside one conversation* — the parent agent fans out, you supervise the parent. They don't let you, the human, drive multiple efforts at the same time.
- **Chat windows** let you drive in parallel. Open one Claude session per in-flight module (different VSCode window, different CLI tab, whichever fits).
- **Pair each session with its own [git worktree](https://git-scm.com/docs/git-worktree)** so file edits don't collide. The `using-git-worktrees` skill auto-triggers when needed.
- **Don't add `<module>-dev` subagents speculatively.** Add one only when you're actively working a module repeatedly — the scope and quirks need to be real before they belong in an agent definition. Premature agents become stale rules.

---

## How a typical task flows (your point of view)

**Small bug fix:**
1. Normal mode. Plain Claude Code. Describe the bug.
2. `systematic-debugging` triggers. Claude investigates root cause before suggesting a fix.
3. Claude proposes fix → you approve → Claude edits.
4. `verification-before-completion` triggers. Claude runs the test / dev server and shows evidence.
5. You commit (or ask Claude to).

**New feature inside one module (e.g., products):**
1. Plan mode. `@products-dev` (or `/agents` → products-dev). Describe the feature.
2. `brainstorming` triggers → design conversation → approval.
3. `writing-plans` triggers → plan file created under `docs/modules/` or the plans dir.
4. Exit plan mode. `subagent-driven-development` or `executing-plans` triggers → tasks executed, `test-driven-development` enforced, `verification-before-completion` runs after each.
5. You review each iteration. Iterate.
6. `finishing-a-development-branch` triggers for merge/cleanup when done.

**Cross-module feature or new module:**
1. Plan mode. Plain Claude Code.
2. `brainstorming` + `writing-plans` — you agree on scope, architecture, which modules are touched.
3. Exit plan mode. Claude dispatches to the relevant subagents.

**Reading/writing a RICS-derived spec:**
1. `@rics-module-analyst` from anywhere.
2. It reads the RICS v7.7 PDF and updates `docs/modules/<module>.md`.

---

## Install (one time, run in a normal Claude Code session)

```
/plugin marketplace add claude-plugins-official
/plugin install superpowers@claude-plugins-official
/plugin list
```

## Post-install smoke test

In a fresh session:

1. `/plugin list` — `superpowers` should appear.
2. Ask for a trivial planning task ("add a 'New Arrival' badge to ProductCard"). `brainstorming` or `writing-plans` should kick in.
3. Ask for a bug fix on a failing test. `systematic-debugging` should kick in.
4. When Claude says "done," check it ran the actual test and showed output (that's `verification-before-completion` doing its job).

## Rollback

```
/plugin uninstall superpowers
```

No app code will have changed.

---

## Daily reminders

- **Start in plan mode for anything non-trivial.** Shift+Tab twice. Let `brainstorming` / `writing-plans` do their job before any code gets written.
- **Trust the subagent scope.** Don't ask `products-dev` to fix checkout. Don't ask `storefront-dev` to change a SKU's facet logic. The scope is in each agent's description for a reason.
- **Watch for verification evidence.** If Claude claims "done" without showing you a test run or dev-server output, push back — `verification-before-completion` should prevent that, but call it out if it slips.
- **One module per PR where possible.** Module specs (`docs/modules/*.md`) are governed contracts; mixed PRs break that.
- **Skip WAT vocabulary.** The grandparent `CompartidoZBIA/CLAUDE.md` talks about WAT (Workflows/Agents/Tools). That's legacy and doesn't apply here. Say "SDD" or "Superpowers" instead.

---

## Where stuff lives

| What | Where |
|---|---|
| Agent instructions | [`CLAUDE.md`](./CLAUDE.md) at repo root |
| Subagent definitions | `.claude/agents/products-dev.md`, `storefront-dev.md`, `rics-module-analyst.md` |
| Module specs (source of truth) | `docs/modules/*.md` |
| RICS v7.7 manual | `docs/rics-reference/` |
| This workflow guide | `WORKFLOW.md` (you are here) |
| Plans Claude writes during plan mode | `C:\Users\zbend\.claude\plans\` |
| Installed plugins | `C:\Users\zbend\.claude\plugins\` |
