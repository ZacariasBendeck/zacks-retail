import { CANONICAL_MDBS, toSnakeCase } from '../src/services/sync/canonicalRicsTables';

console.log('MDB count:', CANONICAL_MDBS.length);
const byTarget = new Map<string, string>();
let collisions = 0;
for (const entry of CANONICAL_MDBS) {
  for (const t of entry.tables) {
    const snake = toSnakeCase(t);
    if (byTarget.has(snake)) {
      console.log(`COLLISION on "${snake}": ${byTarget.get(snake)}  vs  ${entry.file}.${t}`);
      collisions++;
    }
    byTarget.set(snake, `${entry.file}.${t}`);
  }
}
console.log(`Unique target tables: ${byTarget.size}`);
console.log(`Collisions: ${collisions}`);
console.log();
for (const [k, v] of Array.from(byTarget.entries()).sort()) {
  console.log(`  ${k.padEnd(30)} <- ${v}`);
}
