/**
 * Assign color and upper-material attributes from the last 4 SKU characters.
 *
 *   pnpm --filter @benlow-rics/api assign:sku-suffix-attributes
 *   pnpm --filter @benlow-rics/api assign:sku-suffix-attributes -- --apply
 *
 * Default mode is dry-run: it reads app.sku, builds audit files, and makes no
 * database changes. Pass --apply to upsert catalog values/rules and replace
 * resolved color / upper_material assignments in app.sku_attribute_assignment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const CATEGORY_MIN = 556;
const CATEGORY_MAX = 599;
const SEASONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C'];
const SUFFIX_PATTERN = /^[A-Z0-9]{4}$/;
const DEFAULT_ACTOR = 'script:sku-suffix-attributes';
const COLOR_DIMENSION = 'color';
const MATERIAL_DIMENSION = 'upper_material';
const COLOR_FAMILY_DIMENSION = 'color_family';
const COLOR_FAMILY_DERIVED_BY = 'seed:derived:color_family';

interface Args {
  apply: boolean;
  actor: string;
  outDir: string | null;
}

interface ColorValueSpec {
  sourceCode: string;
  valueCode: string | null;
  englishLabel: string;
  labelEs: string;
  familyCode: string;
  familyLabelEs: string;
  sortOrder: number;
}

interface MaterialValueSpec {
  sourceCode: string;
  valueCode: string;
  labelEs: string;
  materialClass: string;
  sortOrder: number;
}

export interface ParsedSkuSuffix {
  suffix: string;
  parseable: boolean;
  colorRawCode: string | null;
  materialRawCode: string | null;
}

export interface ResolvedSkuCode {
  rawCode: string;
  canonicalCode: string;
  valueCode: string;
  labelEs: string;
  isAlias: boolean;
}

interface ScopedSkuRow {
  code: string;
  category_number: number;
  season: string;
}

interface AssignmentAuditRow {
  skuCode: string;
  categoryNumber: number;
  season: string;
  suffix: string;
  dimensionCode: string;
  rawCode: string;
  canonicalCode: string;
  valueCode: string;
  labelEs: string;
  colorFamilyCode: string;
  applied: boolean;
}

interface RejectAuditRow {
  skuCode: string;
  categoryNumber: number;
  season: string;
  suffix: string;
  colorRawCode: string;
  materialRawCode: string;
  reason: string;
}

interface BeforeAssignmentRow {
  sku_code: string;
  dimension_code: string;
  value_code: string;
  value_label_es: string;
  assigned_by: string | null;
  assigned_at: string;
}

interface PlannedRun {
  scopedSkus: ScopedSkuRow[];
  assignments: AssignmentAuditRow[];
  rejects: RejectAuditRow[];
  counts: {
    scopedSkus: number;
    parseableSuffix: number;
    nonstandardSuffix: number;
    colorResolvable: number;
    materialResolvable: number;
    bothResolvable: number;
    unknownColor: number;
    unknownMaterial: number;
    colorAssignmentRows: number;
    materialAssignmentRows: number;
  };
}

const COLOR_VALUES: ColorValueSpec[] = [
  { sourceCode: 'BK', valueCode: '1', englishLabel: 'Black', labelEs: 'Negro', familyCode: 'neutral', familyLabelEs: 'Neutros', sortOrder: 10 },
  { sourceCode: 'BE', valueCode: '3', englishLabel: 'Beige', labelEs: 'Beige', familyCode: 'neutral', familyLabelEs: 'Neutros', sortOrder: 20 },
  { sourceCode: 'WH', valueCode: '2', englishLabel: 'White', labelEs: 'Blanco', familyCode: 'neutral', familyLabelEs: 'Neutros', sortOrder: 30 },
  { sourceCode: 'GD', valueCode: '15', englishLabel: 'Gold', labelEs: 'Dorado', familyCode: 'metallic', familyLabelEs: 'Metalicos', sortOrder: 40 },
  { sourceCode: 'BG', valueCode: '9', englishLabel: 'Burgundy', labelEs: 'Bordo', familyCode: 'red', familyLabelEs: 'Rojos', sortOrder: 50 },
  { sourceCode: 'CA', valueCode: '6', englishLabel: 'Camel', labelEs: 'Camel', familyCode: 'brown', familyLabelEs: 'Marrones', sortOrder: 60 },
  { sourceCode: 'ND', valueCode: '4', englishLabel: 'Nude', labelEs: 'Nude', familyCode: 'neutral', familyLabelEs: 'Neutros', sortOrder: 70 },
  { sourceCode: 'SL', valueCode: '16', englishLabel: 'Silver', labelEs: 'Plateado', familyCode: 'metallic', familyLabelEs: 'Metalicos', sortOrder: 80 },
  { sourceCode: 'KH', valueCode: null, englishLabel: 'Khaki', labelEs: 'Khaki/Kaki', familyCode: 'brown', familyLabelEs: 'Marrones', sortOrder: 90 },
  { sourceCode: 'RD', valueCode: '8', englishLabel: 'Red', labelEs: 'Rojo', familyCode: 'red', familyLabelEs: 'Rojos', sortOrder: 100 },
  { sourceCode: 'CP', valueCode: null, englishLabel: 'Champagne', labelEs: 'Champagne', familyCode: 'metallic', familyLabelEs: 'Metalicos', sortOrder: 110 },
  { sourceCode: 'MR', valueCode: null, englishLabel: 'Marron', labelEs: 'Marron', familyCode: 'brown', familyLabelEs: 'Marrones', sortOrder: 120 },
  { sourceCode: 'CR', valueCode: 'crema', englishLabel: 'Cream', labelEs: 'Crema', familyCode: 'neutral', familyLabelEs: 'Neutros', sortOrder: 130 },
  { sourceCode: 'PK', valueCode: '13', englishLabel: 'Pink', labelEs: 'Rosa', familyCode: 'pink', familyLabelEs: 'Rosas', sortOrder: 140 },
  { sourceCode: 'NV', valueCode: '10', englishLabel: 'Navy', labelEs: 'Navy', familyCode: 'blue', familyLabelEs: 'Azules', sortOrder: 150 },
  { sourceCode: 'OW', valueCode: null, englishLabel: 'Off White', labelEs: 'Blanco Hueso', familyCode: 'neutral', familyLabelEs: 'Neutros', sortOrder: 160 },
  { sourceCode: 'WN', valueCode: '9', englishLabel: 'Wine', labelEs: 'Bordo', familyCode: 'red', familyLabelEs: 'Rojos', sortOrder: 170 },
  { sourceCode: 'BN', valueCode: '5', englishLabel: 'Brown', labelEs: 'Cafe', familyCode: 'brown', familyLabelEs: 'Marrones', sortOrder: 180 },
  { sourceCode: 'RS', valueCode: null, englishLabel: 'Rose', labelEs: 'Rosa Viejo', familyCode: 'pink', familyLabelEs: 'Rosas', sortOrder: 190 },
  { sourceCode: 'TN', valueCode: '7', englishLabel: 'Tan', labelEs: 'Tan', familyCode: 'brown', familyLabelEs: 'Marrones', sortOrder: 200 },
  { sourceCode: 'CF', valueCode: null, englishLabel: 'Coffee', labelEs: 'Cafe Oscuro', familyCode: 'brown', familyLabelEs: 'Marrones', sortOrder: 210 },
  { sourceCode: 'BL', valueCode: '11', englishLabel: 'Blue', labelEs: 'Azul', familyCode: 'blue', familyLabelEs: 'Azules', sortOrder: 220 },
  { sourceCode: 'AP', valueCode: null, englishLabel: 'Apricot', labelEs: 'Apricot', familyCode: 'pink', familyLabelEs: 'Rosas', sortOrder: 230 },
  { sourceCode: 'PW', valueCode: null, englishLabel: 'Pewter', labelEs: 'Peltre', familyCode: 'metallic', familyLabelEs: 'Metalicos', sortOrder: 240 },
  { sourceCode: 'GY', valueCode: '18', englishLabel: 'Gris', labelEs: 'Gris', familyCode: 'neutral', familyLabelEs: 'Neutros', sortOrder: 250 },
  { sourceCode: 'GN', valueCode: '12', englishLabel: 'Green', labelEs: 'Verde', familyCode: 'green', familyLabelEs: 'Verdes', sortOrder: 260 },
  { sourceCode: 'LP', valueCode: null, englishLabel: 'Light Pink', labelEs: 'Rosa Claro', familyCode: 'pink', familyLabelEs: 'Rosas', sortOrder: 270 },
  { sourceCode: 'DG', valueCode: null, englishLabel: 'Dark Grey', labelEs: 'Gris Oscuro', familyCode: 'neutral', familyLabelEs: 'Neutros', sortOrder: 280 },
  { sourceCode: 'TP', valueCode: null, englishLabel: 'Taupe', labelEs: 'Taupe', familyCode: 'brown', familyLabelEs: 'Marrones', sortOrder: 290 },
  { sourceCode: '1C', valueCode: '22', englishLabel: 'Multi/Combinado', labelEs: 'Multicolor', familyCode: 'multicolor', familyLabelEs: 'Especiales', sortOrder: 300 },
  { sourceCode: 'FU', valueCode: '14', englishLabel: 'Fuchsia', labelEs: 'Fucsia', familyCode: 'pink', familyLabelEs: 'Rosas', sortOrder: 310 },
  { sourceCode: 'RG', valueCode: '17', englishLabel: 'Rose Gold', labelEs: 'Rose Gold', familyCode: 'metallic', familyLabelEs: 'Metalicos', sortOrder: 320 },
];

const MATERIAL_VALUES: MaterialValueSpec[] = [
  { sourceCode: 'PU', valueCode: 'pu', labelEs: 'PU (Polyuretano)', materialClass: 'Sintetico', sortOrder: 10 },
  { sourceCode: 'PT', valueCode: 'pt', labelEs: 'Patent (Charol)', materialClass: 'Sintetico', sortOrder: 20 },
  { sourceCode: 'NU', valueCode: 'nu', labelEs: 'Nubuck', materialClass: 'Cuero/Semi', sortOrder: 30 },
  { sourceCode: 'SP', valueCode: 'sp', labelEs: 'Special Material', materialClass: 'Especial', sortOrder: 40 },
  { sourceCode: 'ME', valueCode: 'me', labelEs: 'Metalico', materialClass: 'Sintetico', sortOrder: 50 },
  { sourceCode: 'SU', valueCode: 'su', labelEs: 'Suede', materialClass: 'Cuero/Semi', sortOrder: 60 },
  { sourceCode: 'TE', valueCode: 'te', labelEs: 'Tela', materialClass: 'Textil', sortOrder: 70 },
  { sourceCode: 'LT', valueCode: 'lt', labelEs: 'Leather (Cuero)', materialClass: 'Cuero', sortOrder: 80 },
  { sourceCode: 'SA', valueCode: 'sa', labelEs: 'Satin', materialClass: 'Textil', sortOrder: 90 },
  { sourceCode: 'CB', valueCode: 'cb', labelEs: 'Black/Combinado', materialClass: 'Combinacion', sortOrder: 100 },
  { sourceCode: 'CR', valueCode: 'cr', labelEs: 'Crochet/Tejido', materialClass: 'Textil', sortOrder: 110 },
  { sourceCode: 'GL', valueCode: 'gl', labelEs: 'Gliter', materialClass: 'Sintetico', sortOrder: 120 },
  { sourceCode: 'PV', valueCode: 'pv', labelEs: 'PVC/Vinilo', materialClass: 'Sintetico', sortOrder: 130 },
  { sourceCode: 'FB', valueCode: 'fb', labelEs: 'Fabric', materialClass: 'Textil', sortOrder: 140 },
  { sourceCode: 'TX', valueCode: 'tx', labelEs: 'Textil', materialClass: 'Textil', sortOrder: 150 },
  { sourceCode: 'MS', valueCode: 'ms', labelEs: 'Mesh', materialClass: 'Textil', sortOrder: 160 },
  { sourceCode: 'PL', valueCode: 'pl', labelEs: 'Plastico', materialClass: 'Sintetico', sortOrder: 170 },
  { sourceCode: 'DN', valueCode: 'dn', labelEs: 'Denim', materialClass: 'Textil', sortOrder: 180 },
];

const COLOR_ALIASES: Record<string, string> = {
  TA: 'TP',
};

const MATERIAL_ALIASES: Record<string, string> = {
  NB: 'nu',
  SD: 'su',
  MT: 'me',
  GT: 'gl',
};

const RESOLVABLE_COLOR_VALUES = COLOR_VALUES.filter(
  (value): value is ColorValueSpec & { valueCode: string } => value.valueCode != null,
);
const COLOR_BY_VALUE = new Map<string, ColorValueSpec & { valueCode: string }>();
for (const value of RESOLVABLE_COLOR_VALUES) {
  if (!COLOR_BY_VALUE.has(value.valueCode)) COLOR_BY_VALUE.set(value.valueCode, value);
}
const COLOR_VALUE_BY_RAW = new Map<string, string>([
  ...RESOLVABLE_COLOR_VALUES.map((value) => [value.sourceCode, value.valueCode] as const),
  ...Object.entries(COLOR_ALIASES).flatMap(([alias, target]) => {
    const targetSpec = RESOLVABLE_COLOR_VALUES.find((value) => value.sourceCode === target);
    return targetSpec ? [[alias, targetSpec.valueCode] as const] : [];
  }),
]);
const MATERIAL_BY_VALUE = new Map(MATERIAL_VALUES.map((value) => [value.valueCode, value]));
const MATERIAL_VALUE_BY_RAW = new Map<string, string>([
  ...MATERIAL_VALUES.map((value) => [value.sourceCode, value.valueCode] as const),
  ...Object.entries(MATERIAL_ALIASES),
]);

export function parseSkuSuffix(skuCode: string): ParsedSkuSuffix {
  const suffix = skuCode.trim().toUpperCase().slice(-4);
  if (!SUFFIX_PATTERN.test(suffix)) {
    return { suffix, parseable: false, colorRawCode: null, materialRawCode: null };
  }
  return {
    suffix,
    parseable: true,
    colorRawCode: suffix.slice(0, 2),
    materialRawCode: suffix.slice(2, 4),
  };
}

export function resolveColorCode(rawCode: string | null): ResolvedSkuCode | null {
  if (!rawCode) return null;
  const valueCode = COLOR_VALUE_BY_RAW.get(rawCode.toUpperCase());
  if (!valueCode) return null;
  const spec = COLOR_BY_VALUE.get(valueCode);
  if (!spec) return null;
  return {
    rawCode: rawCode.toUpperCase(),
    canonicalCode: spec.sourceCode,
    valueCode,
    labelEs: spec.labelEs,
    isAlias: spec.sourceCode !== rawCode.toUpperCase(),
  };
}

export function resolveMaterialCode(rawCode: string | null): ResolvedSkuCode | null {
  if (!rawCode) return null;
  const valueCode = MATERIAL_VALUE_BY_RAW.get(rawCode.toUpperCase());
  if (!valueCode) return null;
  const spec = MATERIAL_BY_VALUE.get(valueCode);
  if (!spec) return null;
  return {
    rawCode: rawCode.toUpperCase(),
    canonicalCode: spec.sourceCode,
    valueCode,
    labelEs: spec.labelEs,
    isAlias: spec.sourceCode !== rawCode.toUpperCase(),
  };
}

function parseArgs(): Args {
  const out: Args = { apply: false, actor: DEFAULT_ACTOR, outDir: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--apply':
        out.apply = true;
        break;
      case '--actor':
        out.actor = String(argv[++i] ?? '').trim() || DEFAULT_ACTOR;
        break;
      case '--out-dir':
        out.outDir = path.resolve(String(argv[++i] ?? ''));
        break;
      case '--help':
      case '-h':
        printHelpAndExit(0);
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return out;
}

function printHelpAndExit(code: number): never {
  console.log([
    'Usage: assign:sku-suffix-attributes [--apply] [--actor <actor>] [--out-dir <path>]',
    '',
    'Dry-run is the default. Pass --apply to write attribute catalog rows,',
    'color / upper_material assignments, and derived color_family assignments.',
  ].join('\n'));
  process.exit(code);
}

function defaultOutputDir(): string {
  const repoRoot = path.resolve(__dirname, '../../../../');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(repoRoot, 'outputs', `sku-suffix-attributes-${stamp}`);
}

function csvEscape(value: unknown): string {
  if (value == null) return '';
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(filePath: string, headers: string[], rows: Record<string, unknown>[]): void {
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function planAssignments(scopedSkus: ScopedSkuRow[], apply: boolean): PlannedRun {
  const assignments: AssignmentAuditRow[] = [];
  const rejects: RejectAuditRow[] = [];
  let parseableSuffix = 0;
  let colorResolvable = 0;
  let materialResolvable = 0;
  let bothResolvable = 0;
  let nonstandardSuffix = 0;
  let unknownColor = 0;
  let unknownMaterial = 0;

  for (const sku of scopedSkus) {
    const parsed = parseSkuSuffix(sku.code);
    if (parsed.parseable) parseableSuffix += 1;
    else nonstandardSuffix += 1;

    const color = parsed.parseable ? resolveColorCode(parsed.colorRawCode) : null;
    const material = parsed.parseable ? resolveMaterialCode(parsed.materialRawCode) : null;
    if (color) colorResolvable += 1;
    if (material) materialResolvable += 1;
    if (color && material) bothResolvable += 1;
    if (parsed.parseable && !color) unknownColor += 1;
    if (parsed.parseable && !material) unknownMaterial += 1;

    const colorSpec = color ? COLOR_BY_VALUE.get(color.valueCode) ?? null : null;
    if (color && colorSpec) {
      assignments.push({
        skuCode: sku.code,
        categoryNumber: sku.category_number,
        season: sku.season,
        suffix: parsed.suffix,
        dimensionCode: COLOR_DIMENSION,
        rawCode: color.rawCode,
        canonicalCode: color.canonicalCode,
        valueCode: color.valueCode,
        labelEs: color.labelEs,
        colorFamilyCode: colorSpec.familyCode,
        applied: apply,
      });
    }

    if (material) {
      assignments.push({
        skuCode: sku.code,
        categoryNumber: sku.category_number,
        season: sku.season,
        suffix: parsed.suffix,
        dimensionCode: MATERIAL_DIMENSION,
        rawCode: material.rawCode,
        canonicalCode: material.canonicalCode,
        valueCode: material.valueCode,
        labelEs: material.labelEs,
        colorFamilyCode: '',
        applied: apply,
      });
    }

    const reasons: string[] = [];
    if (!parsed.parseable) reasons.push('NONSTANDARD_SUFFIX');
    else {
      if (!color) reasons.push('UNKNOWN_COLOR');
      if (!material) reasons.push('UNKNOWN_MATERIAL');
    }
    if (reasons.length > 0) {
      rejects.push({
        skuCode: sku.code,
        categoryNumber: sku.category_number,
        season: sku.season,
        suffix: parsed.suffix,
        colorRawCode: parsed.colorRawCode ?? '',
        materialRawCode: parsed.materialRawCode ?? '',
        reason: reasons.join(';'),
      });
    }
  }

  return {
    scopedSkus,
    assignments,
    rejects,
    counts: {
      scopedSkus: scopedSkus.length,
      parseableSuffix,
      nonstandardSuffix,
      colorResolvable,
      materialResolvable,
      bothResolvable,
      unknownColor,
      unknownMaterial,
      colorAssignmentRows: assignments.filter((row) => row.dimensionCode === COLOR_DIMENSION).length,
      materialAssignmentRows: assignments.filter((row) => row.dimensionCode === MATERIAL_DIMENSION).length,
    },
  };
}

async function fetchScopedSkus(client: Client): Promise<ScopedSkuRow[]> {
  const result = await client.query<ScopedSkuRow>(
    `SELECT code,
            category_number,
            upper(season) AS season
     FROM app.sku
     WHERE category_number BETWEEN $1 AND $2
       AND upper(season) = ANY($3::text[])
     ORDER BY code`,
    [CATEGORY_MIN, CATEGORY_MAX, SEASONS],
  );
  return result.rows;
}

async function fetchBeforeAssignments(client: Client, skuCodes: string[]): Promise<BeforeAssignmentRow[]> {
  if (skuCodes.length === 0) return [];
  const result = await client.query<BeforeAssignmentRow>(
    `SELECT a.sku_code,
            d.code AS dimension_code,
            v.code AS value_code,
            v.label_es AS value_label_es,
            a.assigned_by,
            a.assigned_at::text AS assigned_at
     FROM app.sku_attribute_assignment a
     JOIN app.attribute_dimension d ON d.id = a.dimension_id
     JOIN app.attribute_value v ON v.id = a.value_id
     WHERE a.sku_code = ANY($1::varchar[])
       AND d.code IN ($2, $3, $4)
     ORDER BY a.sku_code, d.sort_order, v.sort_order, v.code`,
    [skuCodes, COLOR_DIMENSION, MATERIAL_DIMENSION, COLOR_FAMILY_DIMENSION],
  );
  return result.rows;
}

async function upsertDimension(
  client: Client,
  code: string,
  labelEs: string,
  descriptionEs: string,
  sortOrder: number,
): Promise<void> {
  await client.query(
    `INSERT INTO app.attribute_dimension (code, label_es, description_es, sort_order, is_multi_value)
     VALUES ($1, $2, $3, $4, false)
     ON CONFLICT (code) DO UPDATE SET
       label_es = EXCLUDED.label_es,
       description_es = EXCLUDED.description_es,
       sort_order = EXCLUDED.sort_order,
       is_multi_value = false`,
    [code, labelEs, descriptionEs, sortOrder],
  );
}

async function upsertValue(
  client: Client,
  dimensionCode: string,
  valueCode: string,
  labelEs: string,
  descriptionEs: string | null,
  sortOrder: number,
): Promise<void> {
  await client.query(
    `INSERT INTO app.attribute_value (dimension_id, code, label_es, description_es, sort_order, is_active)
     SELECT d.id, $2, $3, $4, $5, true
     FROM app.attribute_dimension d
     WHERE d.code = $1
     ON CONFLICT (dimension_id, code) DO UPDATE SET
       label_es = EXCLUDED.label_es,
       description_es = EXCLUDED.description_es,
       sort_order = EXCLUDED.sort_order,
       is_active = true`,
    [dimensionCode, valueCode, labelEs, descriptionEs, sortOrder],
  );
}

async function upsertCatalog(client: Client, actor: string): Promise<void> {
  await upsertDimension(client, COLOR_DIMENSION, 'Color', 'Color principal derivado del sufijo del SKU', 500);
  await upsertDimension(
    client,
    COLOR_FAMILY_DIMENSION,
    'Familia de Color',
    'Familia de color derivada del color principal',
    510,
  );
  await upsertDimension(client, MATERIAL_DIMENSION, 'Material Superior', 'Material superior derivado del sufijo del SKU', 580);

  const familyByCode = new Map<string, { labelEs: string; sortOrder: number }>();
  for (const color of RESOLVABLE_COLOR_VALUES) {
    if (!familyByCode.has(color.familyCode)) {
      familyByCode.set(color.familyCode, {
        labelEs: color.familyLabelEs,
        sortOrder: color.sortOrder,
      });
    }
  }

  for (const [familyCode, family] of familyByCode) {
    await upsertValue(
      client,
      COLOR_FAMILY_DIMENSION,
      familyCode,
      family.labelEs,
      'Familia derivada del sufijo de color del SKU',
      family.sortOrder,
    );
  }

  for (const material of MATERIAL_VALUES) {
    await upsertValue(
      client,
      MATERIAL_DIMENSION,
      material.valueCode,
      material.labelEs,
      `Codigo SKU ${material.sourceCode}; clase de referencia: ${material.materialClass}`,
      material.sortOrder,
    );
  }

  for (const color of COLOR_BY_VALUE.values()) {
    await client.query(
      `INSERT INTO app.attribute_derivation_rule (
         source_dimension_code,
         source_value_code,
         target_dimension_code,
         target_value_code,
         updated_by
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (source_dimension_code, source_value_code, target_dimension_code)
       DO UPDATE SET
         target_value_code = EXCLUDED.target_value_code,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [COLOR_DIMENSION, color.valueCode, COLOR_FAMILY_DIMENSION, color.familyCode, actor],
    );
  }
}

async function cleanupScriptColorCatalog(client: Client, actor: string): Promise<{ rulesDeleted: number; valuesDeleted: number }> {
  const rules = await client.query(
    `DELETE FROM app.attribute_derivation_rule
     WHERE source_dimension_code = $1
       AND target_dimension_code = $2
       AND updated_by = $3
       AND NOT (source_value_code = ANY($4::text[]))`,
    [COLOR_DIMENSION, COLOR_FAMILY_DIMENSION, actor, Array.from(COLOR_BY_VALUE.keys())],
  );

  const values = await client.query(
    `DELETE FROM app.attribute_value v
     USING app.attribute_dimension d
     WHERE v.dimension_id = d.id
       AND d.code = $1
       AND v.description_es LIKE 'Codigo SKU %'
       AND NOT EXISTS (
         SELECT 1
         FROM app.sku_attribute_assignment a
         WHERE a.value_id = v.id
       )`,
    [COLOR_DIMENSION],
  );

  return {
    rulesDeleted: rules.rowCount ?? 0,
    valuesDeleted: values.rowCount ?? 0,
  };
}

async function deleteAssignmentsForDimension(
  client: Client,
  dimensionCode: string,
  skuCodes: string[],
): Promise<number> {
  if (skuCodes.length === 0) return 0;
  const result = await client.query(
    `WITH dim AS (
       SELECT id FROM app.attribute_dimension WHERE code = $1
     )
     DELETE FROM app.sku_attribute_assignment a
     USING dim
     WHERE a.dimension_id = dim.id
       AND a.sku_code = ANY($2::varchar[])`,
    [dimensionCode, skuCodes],
  );
  return result.rowCount ?? 0;
}

async function deleteScriptAssignmentsForDimension(
  client: Client,
  dimensionCode: string,
  skuCodes: string[],
  actor: string,
): Promise<number> {
  if (skuCodes.length === 0) return 0;
  const result = await client.query(
    `WITH dim AS (
       SELECT id FROM app.attribute_dimension WHERE code = $1
     )
     DELETE FROM app.sku_attribute_assignment a
     USING dim
     WHERE a.dimension_id = dim.id
       AND a.sku_code = ANY($2::varchar[])
       AND a.assigned_by = $3`,
    [dimensionCode, skuCodes, actor],
  );
  return result.rowCount ?? 0;
}

async function insertAssignmentsForDimension(
  client: Client,
  dimensionCode: string,
  rows: AssignmentAuditRow[],
  actor: string,
): Promise<number> {
  if (rows.length === 0) return 0;
  const skuCodes = rows.map((row) => row.skuCode);
  const valueCodes = rows.map((row) => row.valueCode);
  const result = await client.query(
    `WITH input_rows AS (
       SELECT *
       FROM unnest($1::varchar[], $2::text[]) AS row(sku_code, value_code)
     ),
     dim AS (
       SELECT id FROM app.attribute_dimension WHERE code = $3
     )
     INSERT INTO app.sku_attribute_assignment (sku_code, dimension_id, value_id, assigned_by)
     SELECT input_rows.sku_code,
            dim.id,
            v.id,
            $4
     FROM input_rows
     JOIN dim ON true
     JOIN app.attribute_value v
       ON v.dimension_id = dim.id
      AND v.code = input_rows.value_code
     ON CONFLICT (sku_code, dimension_id, value_id) DO UPDATE SET
       assigned_by = EXCLUDED.assigned_by,
       assigned_at = now()`,
    [skuCodes, valueCodes, dimensionCode, actor],
  );
  return result.rowCount ?? 0;
}

async function rebuildDerivedColorFamilies(
  client: Client,
  skuCodes: string[],
): Promise<{ deleted: number; inserted: number }> {
  if (skuCodes.length === 0) return { deleted: 0, inserted: 0 };

  const deleted = await client.query(
    `WITH target_dim AS (
       SELECT id FROM app.attribute_dimension WHERE code = $1
     )
     DELETE FROM app.sku_attribute_assignment a
     USING target_dim td
     WHERE a.dimension_id = td.id
       AND a.assigned_by = $2
       AND a.sku_code = ANY($3::varchar[])`,
    [COLOR_FAMILY_DIMENSION, COLOR_FAMILY_DERIVED_BY, skuCodes],
  );

  const inserted = await client.query(
    `WITH source_dim AS (
       SELECT id FROM app.attribute_dimension WHERE code = $1
     ),
     target_dim AS (
       SELECT id FROM app.attribute_dimension WHERE code = $2
     ),
     current_color AS (
       SELECT DISTINCT ON (a.sku_code)
              a.sku_code,
              sv.code AS source_value_code
       FROM app.sku_attribute_assignment a
       JOIN app.attribute_value sv ON sv.id = a.value_id
       JOIN source_dim sd ON sd.id = a.dimension_id
       WHERE a.sku_code = ANY($4::varchar[])
       ORDER BY a.sku_code, a.assigned_at DESC
     )
     INSERT INTO app.sku_attribute_assignment (sku_code, dimension_id, value_id, assigned_by)
     SELECT current_color.sku_code,
            target_dim.id,
            target_value.id,
            $3
     FROM current_color
     JOIN app.attribute_derivation_rule rule
       ON rule.source_dimension_code = $1
      AND rule.source_value_code = current_color.source_value_code
      AND rule.target_dimension_code = $2
     JOIN target_dim ON true
     JOIN app.attribute_value target_value
       ON target_value.dimension_id = target_dim.id
      AND target_value.code = rule.target_value_code
     ON CONFLICT (sku_code, dimension_id, value_id) DO UPDATE SET
       assigned_by = EXCLUDED.assigned_by,
       assigned_at = now()`,
    [COLOR_DIMENSION, COLOR_FAMILY_DIMENSION, COLOR_FAMILY_DERIVED_BY, skuCodes],
  );

  return {
    deleted: deleted.rowCount ?? 0,
    inserted: inserted.rowCount ?? 0,
  };
}

async function applyPlan(client: Client, plan: PlannedRun, actor: string): Promise<Record<string, number>> {
  const colorRows = plan.assignments.filter((row) => row.dimensionCode === COLOR_DIMENSION);
  const materialRows = plan.assignments.filter((row) => row.dimensionCode === MATERIAL_DIMENSION);
  const scopedSkus = plan.scopedSkus.map((sku) => sku.code);
  const colorSkus = Array.from(new Set(colorRows.map((row) => row.skuCode)));
  const materialSkus = Array.from(new Set(materialRows.map((row) => row.skuCode)));

  await client.query('BEGIN');
  try {
    await upsertCatalog(client, actor);
    const priorScriptColorDeleted = await deleteScriptAssignmentsForDimension(
      client,
      COLOR_DIMENSION,
      scopedSkus,
      actor,
    );
    const colorDeleted = await deleteAssignmentsForDimension(client, COLOR_DIMENSION, colorSkus);
    const materialDeleted = await deleteAssignmentsForDimension(client, MATERIAL_DIMENSION, materialSkus);
    const colorInserted = await insertAssignmentsForDimension(client, COLOR_DIMENSION, colorRows, actor);
    const materialInserted = await insertAssignmentsForDimension(client, MATERIAL_DIMENSION, materialRows, actor);
    const derived = await rebuildDerivedColorFamilies(client, scopedSkus);
    const colorCatalogCleanup = await cleanupScriptColorCatalog(client, actor);
    await client.query('COMMIT');
    return {
      priorScriptColorDeleted,
      colorDeleted,
      materialDeleted,
      colorInserted,
      materialInserted,
      colorFamilyDeleted: derived.deleted,
      colorFamilyInserted: derived.inserted,
      colorRulesDeleted: colorCatalogCleanup.rulesDeleted,
      colorValuesDeleted: colorCatalogCleanup.valuesDeleted,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

function writeAuditFiles(
  outDir: string,
  args: Args,
  plan: PlannedRun,
  beforeAssignments: BeforeAssignmentRow[],
  applyCounts: Record<string, number>,
): void {
  fs.mkdirSync(outDir, { recursive: true });

  writeCsv(
    path.join(outDir, 'assignments.csv'),
    [
      'skuCode',
      'categoryNumber',
      'season',
      'suffix',
      'dimensionCode',
      'rawCode',
      'canonicalCode',
      'valueCode',
      'labelEs',
      'colorFamilyCode',
      'applied',
    ],
    plan.assignments as unknown as Record<string, unknown>[],
  );

  writeCsv(
    path.join(outDir, 'rejects.csv'),
    ['skuCode', 'categoryNumber', 'season', 'suffix', 'colorRawCode', 'materialRawCode', 'reason'],
    plan.rejects as unknown as Record<string, unknown>[],
  );

  writeCsv(
    path.join(outDir, 'before_assignments.csv'),
    ['sku_code', 'dimension_code', 'value_code', 'value_label_es', 'assigned_by', 'assigned_at'],
    beforeAssignments as unknown as Record<string, unknown>[],
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: args.apply ? 'apply' : 'dry-run',
    actor: args.actor,
    scope: {
      categoryMin: CATEGORY_MIN,
      categoryMax: CATEGORY_MAX,
      seasons: SEASONS,
    },
    aliases: {
      colors: COLOR_ALIASES,
      materials: MATERIAL_ALIASES,
    },
    counts: {
      ...plan.counts,
      assignmentRowsPlanned: plan.assignments.length,
      rejectRows: plan.rejects.length,
      beforeAssignmentRows: beforeAssignments.length,
      ...applyCounts,
    },
    outputFiles: {
      assignments: path.join(outDir, 'assignments.csv'),
      rejects: path.join(outDir, 'rejects.csv'),
      beforeAssignments: path.join(outDir, 'before_assignments.csv'),
      summary: path.join(outDir, 'summary.json'),
    },
  };

  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const args = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL env var is required');

  const outDir = args.outDir ?? defaultOutputDir();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const scopedSkus = await fetchScopedSkus(client);
    const beforeAssignments = await fetchBeforeAssignments(client, scopedSkus.map((sku) => sku.code));
    const plan = planAssignments(scopedSkus, args.apply);
    const applyCounts = args.apply ? await applyPlan(client, plan, args.actor) : {};
    writeAuditFiles(outDir, args, plan, beforeAssignments, applyCounts);

    console.log('=============================================');
    console.log(`  SKU suffix attribute ${args.apply ? 'apply' : 'dry-run'} complete`);
    console.log('=============================================');
    console.log(`  scoped SKUs          : ${plan.counts.scopedSkus.toLocaleString('en-US')}`);
    console.log(`  parseable suffixes   : ${plan.counts.parseableSuffix.toLocaleString('en-US')}`);
    console.log(`  color resolvable     : ${plan.counts.colorResolvable.toLocaleString('en-US')}`);
    console.log(`  material resolvable  : ${plan.counts.materialResolvable.toLocaleString('en-US')}`);
    console.log(`  both resolvable      : ${plan.counts.bothResolvable.toLocaleString('en-US')}`);
    console.log(`  rejects              : ${plan.rejects.length.toLocaleString('en-US')}`);
    console.log(`  output               : ${outDir}`);
    if (!args.apply) {
      console.log('');
      console.log('  Dry-run only. Re-run with --apply to write assignments.');
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[assign-sku-suffix-attributes] failed:', err?.message ?? err);
    if (err?.stack) console.error(err.stack);
    process.exit(1);
  });
}
