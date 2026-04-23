/**
 * Reads rics_mirror.categories + departments + sectors, joins them, and emits a
 * draft Category -> Product Family mapping CSV. The heuristic matches on
 * department description first (e.g. "TRAJES MARCA HOMBRE" -> suits), with
 * category description as a tiebreaker. Unmatched rows land in `general` with a
 * `review` flag so the operator can fix them before running the seed.
 *
 * Writes to: apps/api/seeds/product_families/category_mapping.csv
 *
 * Run:
 *   pnpm --filter @benlow-rics/api exec node --env-file-if-exists=.env -r tsx/cjs scripts/suggest-category-families.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

type Family = 'zapatos' | 'tops' | 'vestidos' | 'pantalones' | 'ropa_otros'
  | 'jackets_outerwear' | 'suits' | 'carteras' | 'cinturones' | 'accesorios' | 'general';

interface Row {
  category_number: number;
  category_desc: string;
  department_number: number | null;
  department_desc: string | null;
  sector_number: number | null;
  sector_desc: string | null;
}

/** Normalize for keyword matching: lowercase, strip accents, collapse whitespace. */
function norm(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classify by keyword. Order matters — more specific rules first. The RICS dept
 * descriptions are Spanish, heavily abbreviated, and truncated to ~20 chars
 * (hence "CAMISETAS MARCA HOMB" rather than "HOMBRE"). Matching is substring.
 */
function classify(
  categoryNumber: number,
  dept: string,
  cat: string,
  sector: string,
): { family: Family; confidence: 'high' | 'medium' | 'low' } {
  const d = norm(dept);
  const c = norm(cat);
  const s = norm(sector);
  const hay = `${d} ${c}`;
  const isMen = /\bhombre|caballero|\bmarca h\b| h\b|caba/.test(hay);

  // Operator rule: categories ≥ 900 are discontinued items, store supplies, fixtures,
  // shopping bags, displays, mannequins, etc. All land in general.
  if (categoryNumber >= 900) return { family: 'general', confidence: 'high' };

  // Coupons / promos / operational SKUs → general (regardless of what they're "for")
  if (/\bcupon|cupones|promocion|\bpromo\b/.test(c)) return { family: 'general', confidence: 'high' };

  // Beauty / cosmetics / toiletries — no family for these yet → general
  if (/maquill|cosmetic|\bperfum|\blocion|\bcrema|esmalte|\bsombra|lipstick|\bbrillo|delineador|mascarilla|bioseguridad/.test(hay)) {
    return { family: 'general', confidence: 'high' };
  }

  // Suits first — TRAJES / SACOS
  if (/\btraje|\bsaco\b|smoking/.test(hay)) return { family: 'suits', confidence: 'high' };

  // Shoes — ZAPATO / SANDALIA / BOTA / TENIS / CALZADO / CHANCLA / HUARACHE / ZAP DEP / TACO / PANTUFLA
  if (/zapato|sandali|\bbota|\btenis|zapatilla|calzado|chancla|huarache|\bzap\b|\btaco\b|pantufla/.test(hay) || /zapato/.test(s)) {
    return { family: 'zapatos', confidence: 'high' };
  }

  // Handbags — CARTERAS / BOLSOS / MOCHILAS / MALETINES
  if (/cartera|\bbolso|\bbolsa\b|mochila|maletin/.test(hay)) return { family: 'carteras', confidence: 'high' };

  // Belts vs girdles — "faja" is context-dependent. Men's context = belt; women's = girdle.
  if (/cinturo|\bcorrea\b/.test(hay)) return { family: 'cinturones', confidence: 'high' };
  if (/\bfaja/.test(hay) && isMen) return { family: 'cinturones', confidence: 'high' };
  if (/\bfaja/.test(hay) && !isMen) return { family: 'ropa_otros', confidence: 'high' };

  // Dresses
  if (/\bvestido/.test(hay)) return { family: 'vestidos', confidence: 'high' };

  // Sweaters / sweatshirts in the category description → tops, even if dept is ABRIGOS.
  if (/sueter|sudadera|\bbuzo\b/.test(c)) return { family: 'tops', confidence: 'high' };

  // Outerwear — ABRIGO / CHAQUETA / GABARDINA / PARKA / CHUMPA (Honduran) / CAPOTE / CHAMARRA / PUFFER / CHALECO
  if (/abrigo|chaqueta|gabardina|\bparka\b|puffer|chamarra|chumpa|capote|chaleco/.test(hay)) {
    return { family: 'jackets_outerwear', confidence: 'high' };
  }

  // Pants / jeans / leggings
  if (/pantalon|\bjean(s)?\b|\blegins\b|legging|\bleggi/.test(hay)) return { family: 'pantalones', confidence: 'high' };

  // Tops — CAMISAS / CAMISETAS / BLUSAS / POLOS / SWEATERS / SUETER / CARDIGAN / TOP
  if (/camisa|camiseta|\bblusa|\bpolo\b|sweater|sueter|cardigan|\btop\b/.test(hay)) {
    return { family: 'tops', confidence: 'high' };
  }

  // Ropa otros — shorts / faldas / baño / interior / dormir / deportiva / maternidad / intima / bata / chaleco
  if (
    /shorts?\b|\bfalda|bano|banador|pijama|interior|\bintima|deportiva|\bpanty|\bpantie|sosten|brassiere|brasier|lencer/.test(hay) ||
    /blumer|\bboxer\b|brazier|brasiere|\bmedias\b|calcetin|calzoncill|bloomer|maternidad|\bbata\b|\bmayo\b/.test(hay)
  ) {
    return { family: 'ropa_otros', confidence: 'high' };
  }

  // Accessories — JOYERIA / RELOJ / BUFANDA / SOMBRERO / GORRA / BILLETERA / LENTE / GAFAS / ACCES
  // CORBATAS / TIRANTES / LLAVEROS / PANOLETAS / CADENA / ANILLO / etc.
  if (
    /joyeri|\breloj|bufanda|sombrero|gorra|billeter|\blente|\bgafa|accesori|\bacces\b/.test(hay) ||
    /corbat|tirant|llaver|panolet|\bpanuel|\bcadena|\banillo|pulser|\barete|\bcollar|mancuern|brazalet|prensa corba|sombrill|\bchal\b/.test(hay)
  ) {
    return { family: 'accesorios', confidence: 'medium' };
  }

  // Sector-only hints as a last resort
  if (/zapato/.test(s)) return { family: 'zapatos', confidence: 'low' };
  if (/ropa/.test(s)) return { family: 'ropa_otros', confidence: 'low' };
  if (/hogar|carpa|operaciones/.test(s)) return { family: 'general', confidence: 'high' };

  return { family: 'general', confidence: 'low' };
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const sql = `
    SELECT
      c.number AS category_number,
      c.desc   AS category_desc,
      d.number AS department_number,
      d.desc   AS department_desc,
      s.number AS sector_number,
      s.desc   AS sector_desc
    FROM rics_mirror.categories c
    LEFT JOIN rics_mirror.departments d
      ON c.number BETWEEN d.beg_categ AND d.end_categ
    LEFT JOIN rics_mirror.sectors s
      ON d.number BETWEEN s.beg_dept AND s.end_dept
    ORDER BY c.number
  `;
  const res = await client.query<Row>(sql);
  await client.end();

  process.stderr.write(`Classifying ${res.rows.length} categories…\n`);

  const byFamily = new Map<Family, number>();
  const lowConfidence: Row[] = [];

  const outPath = path.resolve(__dirname, '../../seeds/product_families/category_mapping.csv');
  const lines: string[] = [];
  lines.push('category_number,category_desc,department_number,department_desc,sector_number,sector_desc,suggested_family,confidence,review_notes');

  for (const r of res.rows) {
    const { family, confidence } = classify(r.category_number, r.department_desc ?? '', r.category_desc, r.sector_desc ?? '');
    byFamily.set(family, (byFamily.get(family) ?? 0) + 1);
    if (confidence !== 'high') lowConfidence.push(r);

    const csvVal = (v: unknown): string => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    };

    const notes = confidence === 'high' ? '' : 'REVIEW';
    lines.push([
      r.category_number,
      csvVal(r.category_desc),
      r.department_number ?? '',
      csvVal(r.department_desc),
      r.sector_number ?? '',
      csvVal(r.sector_desc),
      family,
      confidence,
      notes,
    ].join(','));
  }

  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  process.stderr.write(`Wrote ${outPath} (${res.rows.length} rows)\n\n`);
  process.stderr.write(`Family distribution:\n`);
  const sortedFamilies = [...byFamily.entries()].sort((a, b) => b[1] - a[1]);
  for (const [f, n] of sortedFamilies) {
    process.stderr.write(`  ${f.padEnd(22, ' ')} ${n}\n`);
  }
  process.stderr.write(`\nLow-confidence rows (${lowConfidence.length}) — review the REVIEW-tagged rows in the CSV.\n`);
}

main().catch((err) => {
  process.stderr.write(`FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
