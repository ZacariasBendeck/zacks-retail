# Knowledge-Indexing Design — `/index-knowledge`

**Date:** 2026-04-21
**Source:** `/index-knowledge` pass — meta-conversation about persisting session knowledge before context runs out
**Type:** Design decision

## Context

The operator wanted a way to persist knowledge learned in a long Claude Code conversation before the session context fills up or gets cleared. Initial phrasing was "create a skill." The distilled need: review-and-route what's been said, into the right existing doc, without losing anything or cluttering irrelevant places.

Scope ruled out early:
- A new knowledge *store* (handbook-style skill). Wrong shape — insights already have homes.
- A passive skill the AI "consults." Wrong invocation pattern — this is a user-triggered ritual.
- Auto-editing `CLAUDE.md`. Too sensitive; project-instructions changes stay operator-authored.

## Decision 1 — Slash command, not skill

Skills are background content libraries the AI loads when relevant context arises. The use case here is an **invoked ritual**: the operator types `/index-knowledge` (or says "capture what we learned today" — see Decision 6) and the command runs end-to-end once. That's slash-command shape, not skill shape.

## Decision 2 — Six fixed destinations + orphan

| Destination | Scope |
|---|---|
| `docs/modules/<slug>.md` | Module-scoped **dev** knowledge |
| `docs/zacks-retail-manual/<slug>.md` | **End-user-only** flows (non-negotiable) |
| `docs/dev/specs/<date>-<topic>.md` | Dated *decisions* — "why we chose X" |
| `docs/dev/plans/<date>-<topic>.md` | Dated *plans* — "steps to build X" |
| `docs/ARCHITECTURE.md` | Technical-general living overview |
| `docs/COMPANY.md` | Business-general living reference |
| **Orphan** (not written) | Flagged; operator decides |

**The manual rule is non-negotiable.** Code, SQL, schema, adapter patterns, commit discipline — none of it belongs in the user-facing manual. This is encoded as a hard rule in the command spec.

**Decision ≠ Plan.** `dev/specs/` holds *why*; `dev/plans/` holds *steps to build*. A single conversation can produce both; they're separate files.

**Bias toward orphans when uncertain.** Better to flag an insight for later review than to jam it into the nearest-looking doc.

## Decision 3 — Auto-write with sandwich commits

Auto-write (no approval gate in the common case), wrapped in:

- **Before-commit (if dirty):** `chore: snapshot before /index-knowledge` — captures pre-existing WIP so it's separated from the indexing writes.
- **Write** — apply edits to routed destinations.
- **After-commit:** `docs(index): <summary>` — one distinct commit. `git revert <sha>` cleanly undoes the whole pass.

Rationale: manual approval gates add friction to the common case (small, clear insights with obvious destinations). The sandwich commits provide the safety net — rollback is trivial and scoped.

## Decision 4 — Annotate, don't overwrite, for staleness

When the conversation supersedes existing content, do NOT rewrite. Add an inline annotation:

```
> ⚠️ May be stale per YYYY-MM-DD /index-knowledge pass: <one-line reason>. Review and remove if confirmed.
```

Rationale: information loss is worse than the clutter of an annotation. The operator does the final delete manually when they've confirmed the new state. This makes the command safe to run on a live set of docs without worry that a misclassification will silently rewrite history.

## Decision 5 — 10-file cap with approval-gate fallback

Default cap: 10 destination files modified per run. If the routing plan exceeds the cap:

- Stop before writing.
- Print the full plan (as if the report had been generated post-write).
- Operator re-invokes with `--files <N>` to raise the cap, `--scope <type>` to narrow, or breaks the conversation into sub-sessions.

Rationale: small updates (1–8 files) are the common case and flow through automatically. Huge runs (>10 files) almost always mean the router is over-classifying and a human should look. The cap protects against runaway without gating normal use.

## Decision 6 — Natural-language invocation via CLAUDE.md "Conversational triggers"

Rather than requiring the operator to remember the exact slash-command name, `CLAUDE.md` maintains a "Conversational triggers" section mapping natural phrasings ("gather / index / capture / save / distill / extract / route knowledge from this conversation") to the command. Claude reads `CLAUDE.md` at session start, so vague phrasing routes correctly without mechanical memorization.

This pattern generalizes — other rituals (`/milestone`, `/sync-module-docs`, etc.) can add rows to the same table.

## Decision 7 — Explicit rules the command enforces on its own writes

- Branch must be `master`. No force operations.
- Never auto-edit `CLAUDE.md` (route to `dev/specs/` for operator promotion).
- Never write to `legacy/` (retired folder).
- No `$` / `USD` / `en-US` currency formatter in generated content (HNL-only).
- No branch / PR / worktree language in generated content.
- Scan for secrets before the after-commit; abort if any match.
- Operator-neutral voice in generated text (no "I" / "we decided" — factual, declarative).

These rules make the command's output consistent with the project's hard rules without re-teaching them every invocation.

## Rejected alternatives

- **Write a general-purpose "handbook" skill.** Initial idea. Rejected because it created a new knowledge store parallel to the existing five (modules / manual / operations / dev/specs / dev/plans). Routing to existing structure is cleaner.
- **Require approval before every write.** Adds friction to the common case. Sandwich commits + annotate-don't-overwrite + 10-file cap provide equivalent safety with less friction.
- **Let the command auto-edit `CLAUDE.md`.** Too sensitive. Project-instructions changes stay operator-authored; the command can *propose* a CLAUDE.md change as a `dev/specs/` entry, but the operator promotes manually.

## Related

- Command spec: [`../../../.claude/commands/index-knowledge.md`](../../../.claude/commands/index-knowledge.md)
- Architecture overview the command writes to: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)
- Company reference the command writes to: [`../../COMPANY.md`](../../COMPANY.md)
- CLAUDE.md "Conversational triggers" section: [`../../../CLAUDE.md`](../../../CLAUDE.md)
