# RICS May 1 Close MDB Difference Report

Generated: 2026-05-04T19:33:51.211Z

Before folder: `E:/data/rics-mdbs/May_1_before_close/RICSDATA`
After folder: `E:\data\rics-mdbs\May_1_before_close\RICSDATA`
Output folder: `E:\dev\zacks-retail\outputs\rics-mdb-diff\may-1-close-control-before-vs-before`

## Summary

- MDB files inventoried: 54
- Canonical MDB files: 24
- Canonical tables: 44
- MDB files with raw file differences: 0
- Canonical MDB files with raw file differences: 0
- Canonical tables with table-level differences: 0
- Detail CSV files written: 0
- Large changed tables needing separate deep scan: 0
- Runtime: 91 seconds

## Files

- `canonical_mdbs.csv` - canonical extract/upload MDB and table list
- `all_mdb_inventory.csv` - all before/after MDB presence, size, timestamp, and SHA256 values
- `table_summary.csv` - canonical table counts, schema hashes, content hashes, and statuses
- `details/*.csv` - key-aware or row-hash diff details for changed tables

## Changed Canonical MDBs

_None._

## Changed Canonical Tables

_No canonical table content differences found._

## Notes

- MDBs were opened read-only through ACE/OLEDB; the script writes only report artifacts.
- Tables inside byte-identical MDB files are marked `same_by_mdb_sha256` unless `--full-content` is used.
- For changed MDB files at or below the deep-scan size limit, content hashes are order-independent aggregate row hashes.
- Large same-size MDB hash changes are reported without full row hashing by default to avoid multi-hour scans.
