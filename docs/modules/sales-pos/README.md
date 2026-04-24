# Sales POS

Sales ticket entry, batch lifecycle, refunds, cash handling, reporting.

**Phase:** Development Against RICS Mirror / Cutover Migration target

## Architecture rule

RICS remains the live POS system until cutover. This module must not attempt to process real sales transactions in Postgres during development. Any POS logic implemented here is simulation or preparation for the cutover system. Real transactions continue in RICS until Cutover Migration.
