# ZAP CABALLEROS Balancing Transfer Mismatch Notes

Report compared:

- RICS PDF: `C:/RICSWIN/PDF/LLAMADAS-RICS 2026-04-29 141219 Balancing Transfers ZAP CABALLEROS.PDF`
- Extracted rows: `outputs/balancing_transfers_zap_caballeros_rics_2026-04-29_141219/transfer_units_by_size.csv`
- Replay rows: `outputs/balancing_transfers_zap_caballeros_rics_2026-04-29_141219/replay_comparison/generated_transfer_units.csv`

## Result

- RICS total units: 532
- Replay total units: 532
- Exact matched unit quantity: 500
- Missing route keys: 32
- Extra route keys: 32
- Quantity mismatch keys: 0
- Mismatched SKUs: 22
- Mismatched SKU-size rows: 23
- SKU-size total quantity differences: 0

The remaining difference is not product selection, season/category filtering, size parsing, or transfer quantity. Every mismatched SKU-size row has the same total unit quantity in RICS and in the replay. The difference is which donor store is paired with which receiver store.

## Mismatch Shape

- 22 of 23 mismatched rows have tied donor turns.
- 22 of 23 mismatched rows have tied receiver turns.
- 18 of 23 rows use the same receiver set but choose a different donor store or donor order.
- 5 of 23 rows use the same donor set and same receiver set, but pair the stores differently.

This means the known high-level rules are mostly correct:

- scope/filtering is correct,
- over/under quantity math is correct,
- negative total M-T-D sales skip is correct,
- receiver priority by M-T-D turns is mostly correct,
- the unresolved behavior is low-level allocation order when candidates are tied or nearly tied.

## Rules Tested

These were tested against the full ZAP report, not just the mismatch examples:

- Update SKU-level store totals dynamically after each transfer: worsened match from 500/532 to 498/532.
- Receiver-first matching loop using the same current sort keys: no improvement over 500/532.
- Simple donor priority variants such as over-total first, store-desc tie-breaks, and reverse inventory-row order: worsened the full report.

## Observed Patterns

Some individual mismatches suggest RICS sometimes prefers a modeled or over-total donor over a no-model/under-total donor:

- `MT9MRNWHBK` size `080`: RICS uses store 12 instead of store 2.
- `CLYDELACEWHNV` size `2`: RICS uses store 30 instead of store 14.
- `Z006BK` size `42`: RICS uses store 30 instead of store 5.
- `901025ZHBHBK` size `110`: RICS uses store 14 for both units instead of also using store 2.

But applying that preference globally breaks other rows that currently match, so it is not the whole rule.

Several all-tie rows look like RICS is using a different pairing order:

- `PD322491BN` size `080`: RICS pairs low donor with low receiver and high donor with high receiver.
- `995BN` size `090`: same low/low, high/high pattern.
- `7030KDNVRD` size `060`: same low/low, high/high pattern.
- `9515KBL` size `070`: same low/low, high/high pattern.

Other rows contradict a single global pairing rule:

- `EVER614BK` size `060`: all donor stats tie, but RICS skips store 2 and uses stores 13 and 29.
- `PIPERTRUMLINBK` size `42.5`: RICS chooses store 30 even though store 14 is also eligible.
- `JK620BN` size `42`: RICS chooses store 30, not the highest total-surplus donor store 5.
- `042KDSBL` size `1`: RICS chooses store 12, not the higher-surplus donor store 6.

## Current Conclusion

The remaining gap appears to be an internal RICS tie-break/matching behavior, not a missing business filter. RICS likely uses another ordering dimension for tied candidates, or a multi-pass matching routine, that is not visible from the report alone. The exported inventory row order explains some individual donor choices, especially where RICS picks a higher store number, but it fails as a global rule.

The current replay should not be changed to one of the tested tie-break variants because each tested variant made the total report match worse.
