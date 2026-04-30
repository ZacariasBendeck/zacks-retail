# Inferred RICS Balancing Transfer Logic

Source report: `C:\RICSWIN\PDF\LLAMADAS-RICS 2026-04-28 132646 Balancing Transfers ROPACABALLEROS.PDF`

## Report Scope

- Mode: Balancing Transfers preview; no transfers are posted.
- Balancing method: transfer SKUs over/under model quantities.
- Performance metric: month-to-date turns.
- Sort order: category.
- Stores: `2,5-25,28-30,35-43,99`.
- Categories: `301-499`.
- Seasons: `A-Z,1-9,0`.
- Keyword filter observed from the report: excludes `DST` and `VER26*`.
- `RP20ABR` is included in the report, so the `<> <>RP20ABR` criteria expression is not treated as a plain exclusion.

## Metric

RICS month-to-date turns matched this formula:

```text
mtd_turns = mtd_sales / (current_on_hand + mtd_sales / 2) * 12
```

The report rounds the displayed value to one decimal place.

## Size Mapping

The source inventory rows use 18 quantity columns per segment. The global size column is:

```text
global_column = (segment - 1) * 18 + ordinal
```

The printed size label comes from `size_types.columns_XX` for the SKU size type.

## Transfer Rules Replayed

For each eligible SKU and size cell:

1. A donor is any selected store where `on_hand >= 0` and `on_hand > model`.
2. A receiver is any selected store where `on_hand >= 0` and `model > on_hand`.
3. Negative on-hand cells are emitted as exceptions and are not receivers.
4. Transfer quantity is `min(donor_surplus, receiver_need)`.
5. Working size-cell on-hand is updated after each suggested transfer.
6. Store-level SKU totals are used for priority buckets but are not recomputed after each size move.
7. A SKU is skipped when any selected store has negative total M-T-D sales for that SKU. The script writes these cases separately to `negative_mtd_sales_skips.csv`, including any transfer candidates that were blocked by the rule.

## Inferred Priority

Receiver order:

1. Higher month-to-date turns first.
2. Lower store number for ties.

Donor order:

1. No-model stock first, with warehouse `99` first inside that bucket.
2. Stores at or below total SKU model next, ordered by lower month-to-date turns and then lower store number.
3. Stores over total SKU model last, ordered by larger total SKU surplus, then lower month-to-date turns, then lower store number.

## Current Replay Match

Latest replay output:

- Generated units: `2,841`
- RICS report units: `2,841`
- Matched unit quantity: `2,693`
- Unit precision: `94.79%`
- Unit recall: `94.79%`
- Exact match keys: `2,563`
- Missing keys: `141`
- Extra keys: `139`
- Quantity mismatch keys: `11`
- Negative M-T-D sales skip rows: `4`
- Negative M-T-D sales blocked units: `1`

The remaining differences are mostly store-pair tie-break differences where the SKU, size, and total move quantity are correct but RICS chose a different receiver or donor store.
