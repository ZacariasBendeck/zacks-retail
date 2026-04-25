/**
 * Retired 2026-04-25.
 *
 * Mirror verification is no longer a valid check because the project should
 * not carry a `rics_mirror` schema at all.
 */
console.error(
  [
    '[verify:rics-mirror] retired',
    'The mirror-backed verification flow is no longer allowed.',
    'Verify direct CSV imports by auditing the target app-owned tables and importer output instead.',
  ].join('\n'),
);
process.exit(1);
