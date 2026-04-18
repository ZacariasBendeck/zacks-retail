# RICS Reference

The legacy **RICS (Retail Inventory Control System) v7.7 User Manual** is the authoritative specification for Zack's Retail. Everything we build matches RICS feature-for-feature first, then improves on it for a web-first workflow.

## Files here

| Path | What it is |
|---|---|
| `77manual.pdf` | The original CSI Services RICS v7.7 User Manual PDF (219 pages, 2007). Ground truth — use for page-accurate reads and for resolving layout ambiguity. |
| `77manual.txt` | Plain-text extraction via `pdftotext -layout` (8 006 lines, ~486 KB). Searchable with Grep. Mostly clean — the `�` glyph is a copyright symbol encoding quirk, cosmetic only. |
| [toc.md](toc.md) | Chapter → page-number index. Start here to locate a section. |

## Using this reference

- **Cite the manual page number** in every spec: e.g., "RICS manual p. 88, *Sales Analysis Report*".
- **For fuzzy search / concept lookup**: Grep `77manual.txt`. Page numbers appear on their own line periodically (format: `                                                                                           88`) so a grep hit can usually be anchored to the nearest page.
- **For precise / authoritative reading**: Read `77manual.pdf` with the `pages` parameter. PDF page ≈ manual page + 7 (there are ~7 prefix pages for cover + TOC).
- The `rics-module-analyst` sub-agent (at `.claude/agents/rics-module-analyst.md`) knows to use both files — grep the txt first to locate content, then read the pdf for the authoritative text.

## Regenerating the text file

If the PDF is ever updated:

```bash
pdftotext -layout docs/rics-reference/77manual.pdf docs/rics-reference/77manual.txt
```

## Important note on translation

RICS was written in 2007 for desktop + modem-connected POS. A lot of its infrastructure (modem communications, job lists, screen spool files, "copy to POS diskette", RICS.CFG entries, DOS prompts) is **irrelevant to a web-first system** and should be dropped, not ported.

Features that should survive conceptually: SKUs & size types, vendors & categories, purchase orders, inventory & transfers, POS tickets, special orders / layaways / gift certificates, house charges, OTB planning, frequent buyer plan, physical inventory, accounts receivable, the mail-list-as-CRM model, and the reporting suite.

Infrastructure that should be **dropped and replaced**: batch-of-sales + copy-to-diskette (→ real-time sync), modem / dial-up / ISP config (→ cloud APIs), job list + super jobs (→ background workers), screen spool files (→ browser PDF/CSV downloads), RICS.CFG (→ feature flags + settings UI), macros (→ keyboard shortcuts + saved views), main-computer-vs-POS-computer (→ single source of truth).

The `rics-module-analyst` agent is explicitly instructed to make these cuts.
