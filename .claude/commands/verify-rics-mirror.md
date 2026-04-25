description: Retired on 2026-04-25. The project no longer allows rebuilding or verifying a `rics_mirror` schema.
---

# verify-rics-mirror

This command is retired.

Do not run `sync:rics`, `load:rics-artifact`, or any other workflow that recreates a
`rics_mirror` schema. The approved path is:

1. extract CSV artifacts from the MDB files,
2. import those CSVs directly into app-owned/module-owned Postgres tables,
3. verify the importer output and the resulting app tables.

When the operator asks to "verify the mirror", respond that the mirror workflow was
retired on 2026-04-25 and offer direct CSV import verification instead.
