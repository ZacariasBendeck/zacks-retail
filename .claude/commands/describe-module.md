---
description: Write a business/functional module spec for Zack's Retail at docs/modules/<slug>/business-functional.md using the 17-section template (Objective, Users/Roles, Main Features, Inputs, Outputs, Workflow, Business Rules, Permissions, Data Entities, Integrations, Exceptions, UI Components, Reporting, Non-Functional, Acceptance Criteria). Business-facing voice, no code. Pairs with /describe-tech-module, /write-api-spec, /write-schema-spec, /break-module-into-tasks.
---

# describe-module

Produce a business / functional specification for a Zack's Retail module. Written for product managers, operations, design, stakeholders, and AI planning tools. **Engineering and implementation details go in `/describe-tech-module`, `/write-api-spec`, `/write-schema-spec`, and `/break-module-into-tasks` — not here.**

Argument: `$ARGUMENTS` — module slug (required) from the registry in [`docs/MODULES.md`](../../docs/MODULES.md).
- Omitted → stop and ask; do not guess.
- Slug not in the registry → stop; tell the operator to add the registry row first.

## Sources to read before writing

1. [`docs/MODULES.md`](../../docs/MODULES.md) — the module's row, RICS chapter, dependencies.
2. [`docs/modules/<slug>/README.md`](../../docs/modules/) — folder landing page for context.
3. [`docs/modules/<slug>/rics-module-specs.md`](../../docs/modules/) — RICS port lineage (reference only, not as template).
4. [`docs/modules/<slug>/tech-description.md`](../../docs/modules/) if it exists — forward technical description.
5. [`docs/rics-reference/toc.md`](../../docs/rics-reference/toc.md) — map RICS chapter numbers to manual pages.
6. [`docs/rics-reference/77manual.txt`](../../docs/rics-reference/77manual.txt) — grep the module's domain terms (page numbers appear on their own line; anchor grep hits to nearest page).
7. [`docs/zacks-retail-manual/<slug>.md`](../../docs/zacks-retail-manual/) if it exists — forward UX spec.
8. Relevant dated entries in [`docs/dev/specs/`](../../docs/dev/specs/).
9. [`CLAUDE.md`](../../CLAUDE.md) — Rollout phases and hard rules.

Do NOT read code to infer business behavior — this document describes *what* the module does for the business, not *how* it's implemented.

## Writing rules

- **Business language.** Assume a reader who doesn't code.
- **Specific and concrete.** No "manage data" / "handle process" — say what the module actually does.
- Separate normal workflows from edge cases.
- Consistent headings — follow the template below exactly.
- Label assumptions explicitly when information is missing; they go in the `## Assumptions` section at the end.
- Operator-neutral voice: no "I" / "we decided" — factual, declarative.
- **HNL currency only** in examples. No `$` / `USD` / `en-US` formatters.
- **No branches / worktrees / PR language** in anything generated.
- **Never write code.** No SQL, no TypeScript, no Prisma. Data Entities are named and described, not schema'd.

## Template — follow exactly

Path: `docs/modules/<slug>/business-functional.md`. Preserve section order and headings. Every section must be present (write a one-line "_none in v1_" if truly empty).

```markdown
# Business / Functional Spec: <slug>

**Type:** Business / functional spec
**Folder landing:** [`README.md`](./README.md)
**RICS lineage:** [`rics-module-specs.md`](./rics-module-specs.md)
**Tech description:** [`tech-description.md`](./tech-description.md)
**API contract:** [`api.md`](./api.md)
**Schema:** [`schema.md`](./schema.md)
**Tasks:** [`tasks.md`](./tasks.md)
**Decisions:** [`decisions.md`](./decisions.md)
**Last refreshed:** <YYYY-MM-DD>
**Amounts:** Lempira (HNL)

## 1. Module Name
<Clear business name, not a slug.>

## 2. Objective
<Why this module exists and what business problem it solves. One to three sentences.>

## 3. Users / Roles
<Roles that use or are affected — cashier, buyer, manager, warehouse operator, etc.>

## 4. Overview
<Short summary of what the module does. 3–5 sentences.>

## 5. Main Features
- <Feature 1>
- <Feature 2>

## 6. Inputs
- <Input 1>
- <Input 2>

## 7. Outputs
- <Output 1>
- <Output 2>

## 8. Main Workflow
1. <Step 1>
2. <Step 2>

## 9. Business Rules
- <Rule 1>
- <Rule 2>

## 10. Permissions
- <Role>: <allowed actions>
- <Role>: <allowed actions>

## 11. Data Entities
- <Entity 1> — <one-line business description>
- <Entity 2> — <one-line business description>

## 12. Integrations / Dependencies
- <Other module or external system 1>
- <Other module or external system 2>

## 13. Exceptions / Error Handling
- <Business-level exception 1> — <what happens and who sees it>
- <Business-level exception 2>

## 14. UI Components
- <Main screen / page>
- <Forms>
- <Tables / lists>
- <Filters / search>
- <Buttons / actions>

## 15. Reporting / Audit Needs
- <Reports>
- <Exports>
- <Audit trail / history / logs>

## 16. Non-Functional Requirements
- <Performance, security, availability, mobile / offline, multi-store>

## 17. Acceptance Criteria
- <Measurable, testable requirement 1>
- <Measurable, testable requirement 2>

## Assumptions
- <Assumption made when information was missing>

## RICS lineage
- <If porting: RICS p. N — brief description of the legacy feature this maps to>
```

## Quality bar

A good functional spec:
- Can be understood by business and technical stakeholders.
- Describes what MUST happen — not just names a feature.
- Defines validations and restrictions explicitly.
- Clarifies role-based access.
- Explains how the module starts, what it processes, and what it produces.
- Includes edge cases and failure scenarios.
- Contains acceptance criteria that can be tested.

## Editing existing specs

- If the file already exists, use `Edit`, not `Write` — preserve history.
- Before editing, read the full existing file. Preserve every resolved business rule and recorded assumption unless the operator has asked for a rewrite.
- Update the `**Last refreshed:**` date on every edit.

## Commit

Single commit direct to `master`:

```
docs(business-functional): <slug> — business/functional spec

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Report

> Wrote `docs/modules/<slug>/business-functional.md` — covers <N> features, <M> business rules, <K> acceptance criteria. Assumptions recorded: <count>. Next: operator review, then `/describe-tech-module <slug>` if the tech description needs updating, or `/break-module-into-tasks <slug>` to start planning work. Append any business-policy decisions made during this pass to `decisions.md`.

## Example invocations

- `/describe-module inventory-transfer`
- `/describe-module sales-reporting`
- `/describe-module physical-inventory`
