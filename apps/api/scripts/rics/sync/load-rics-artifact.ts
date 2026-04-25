console.error(
  [
    '[load:rics-artifact] retired',
    'Loading CSV artifacts into a hosted `rics_mirror` schema is no longer allowed.',
    'Import CSV artifacts directly into app-owned tables with module-specific importers.',
  ].join('\n'),
);
process.exit(1);
