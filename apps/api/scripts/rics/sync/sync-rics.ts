/**
 * Retired 2026-04-25.
 *
 * The project no longer permits rebuilding a `rics_mirror` schema. Use the
 * direct CSV extract/import flow documented in docs/operations/
 * rics-csv-promotion-playbook.md.
 */
console.error(
  [
    '[sync:rics] retired',
    'The mirror-backed reload is no longer allowed.',
    'Extract MDB tables to CSV artifacts and import them directly into app-owned tables instead.',
  ].join('\n'),
);
process.exit(1);
