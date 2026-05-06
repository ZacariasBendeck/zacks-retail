# RICS May 1 Close MDB Difference Report

Generated: 2026-05-04T19:32:06.416Z

Before folder: `E:/data/rics-mdbs/May_1_before_close/RICSDATA`
After folder: `E:/data/rics-mdbs/May_1_after_close/RICSDATA (1)`
Output folder: `E:\dev\zacks-retail\outputs\rics-mdb-diff\may-1-close`

## Summary

- MDB files inventoried: 54
- Canonical MDB files: 24
- Canonical tables: 44
- MDB files with raw file differences: 10
- Canonical MDB files with raw file differences: 7
- Canonical tables with table-level differences: 7
- Detail CSV files written: 5
- Large changed tables needing separate deep scan: 2
- Runtime: 155 seconds

## Files

- `canonical_mdbs.csv` - canonical extract/upload MDB and table list
- `all_mdb_inventory.csv` - all before/after MDB presence, size, timestamp, and SHA256 values
- `table_summary.csv` - canonical table counts, schema hashes, content hashes, and statuses
- `details/*.csv` - key-aware or row-hash diff details for changed tables

## Changed Canonical MDBs

| MDB | Status | Before bytes | After bytes |
| --- | --- | ---: | ---: |
| RIINVHIS.MDB | hash_differ | 2007945216 | 2007945216 |
| RIINVQUA.MDB | hash_differ | 302551040 | 302551040 |
| RIOTB.MDB | hash_differ | 12394496 | 12394496 |
| RIPOMAS.MDB | hash_differ | 3084288 | 3084288 |
| RISLSPSN.MDB | hash_differ | 1445888 | 1445888 |
| RISTORE.MDB | hash_differ | 294912 | 294912 |
| RITRANSF.MDB | size_and_hash_differ | 200704 | 81920 |

## Changed Canonical Tables

| Target table | Source | Status | Before rows | After rows | Detail |
| --- | --- | --- | ---: | ---: | --- |
| store_master | RISTORE.MDB/StoreMaster | content_changed | 37 | 37 | details/store_master_keys.csv |
| salespeople_sales | RISLSPSN.MDB/SalespeopleSales | content_changed | 258 | 256 | details/salespeople_sales_keys.csv |
| inv_his | RIINVHIS.MDB/InvHis | file_hash_differ_content_not_scanned | 1923982 | 1923982 |  |
| inventory_quantities | RIINVQUA.MDB/Inventory Quantities | file_hash_differ_content_not_scanned | 616249 | 616249 |  |
| purchase_master | RIPOMAS.MDB/Purchase Master | content_changed | 8240 | 8239 | details/purchase_master_keys.csv |
| open_to_buy | RIOTB.MDB/Open To Buy | content_changed | 20701 | 20702 | details/open_to_buy_keys.csv |
| inv_transfers | RITRANSF.MDB/InvTransfers | content_changed | 1118 | 0 | details/inv_transfers_keys.csv |

## Notes

- MDBs were opened read-only through ACE/OLEDB; the script writes only report artifacts.
- Tables inside byte-identical MDB files are marked `same_by_mdb_sha256` unless `--full-content` is used.
- For changed MDB files at or below the deep-scan size limit, content hashes are order-independent aggregate row hashes.
- Large same-size MDB hash changes are reported without full row hashing by default to avoid multi-hour scans.
