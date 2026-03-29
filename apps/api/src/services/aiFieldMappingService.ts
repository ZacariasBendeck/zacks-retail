import fs from 'fs';
import path from 'path';
import { getReferenceData } from './skuService';

export interface AiFillAttribute {
  enabled: boolean;
  type: 'text' | 'enum' | 'reference';
  aiKey: string;
  refTable?: string;
  field?: string;
}

export interface AiFillConfig {
  version: number;
  attributes: Record<string, AiFillAttribute>;
}

export interface MappedAttributes {
  [key: string]: number | string | null;
}

/**
 * English-to-Spanish mapping for reference table values.
 * Keys are lowercase English AI output values; values are lowercase Spanish ref table names.
 * Multiple English synonyms can map to the same Spanish entry.
 */
const ENGLISH_TO_SPANISH: Record<string, Record<string, string[]>> = {
  'shoe-types': {
    'pump': ['pump'],
    'sandal': ['sandalia'],
    'boot': ['bota'],
    'ankle boot': ['bota corta'],
    'sneaker': ['sneaker'],
    'flat': ['flat'],
    'mule': ['mule'],
    'oxford': ['oxford'],
    'loafer': ['loafer', 'mocasín'],
    'wedge': ['wedge'],
    'espadrille': ['espadrille'],
    'moccasin': ['mocasín'],
    'flip flop': ['chancla'],
    'platform': ['plataforma'],
    'derby': ['derby'],
  },
  'heel-shapes': {
    'stiletto': ['stiletto'],
    'block': ['chunky/block'],
    'chunky': ['chunky/block'],
    'wedge': ['wedge'],
    'kitten': ['kitten'],
    'cone': ['cone'],
    'spool': ['spool'],
    'stacked': ['stacked'],
    'platform': ['platform'],
    'flat': ['flat/none'],
    'none': ['flat/none'],
  },
  'heel-heights': {
    'flat': ['flat (0cm)'],
    'low': ['bajo (1-3cm)'],
    'low (1-2in)': ['bajo (1-3cm)'],
    'medium': ['medio (4-6cm)'],
    'medium (2-3in)': ['medio (4-6cm)'],
    'high': ['alto (7-9cm)'],
    'high (3-4in)': ['alto (7-9cm)'],
    'very high': ['muy alto (10+cm)'],
    'very high (4in+)': ['muy alto (10+cm)'],
  },
  'toe-shapes': {
    'pointed': ['puntiaguda'],
    'round': ['redonda'],
    'square': ['cuadrada'],
    'almond': ['almendra'],
    'peep toe': ['peep toe'],
    'open toe': ['abierta'],
    'open': ['abierta'],
  },
  'color-families': {
    'black': ['negro'],
    'white': ['blanco'],
    'brown': ['café/camel'],
    'tan': ['café/camel'],
    'camel': ['café/camel'],
    'beige': ['beige/nude'],
    'nude': ['beige/nude'],
    'red': ['rojo/bordo'],
    'burgundy': ['rojo/bordo'],
    'blue': ['azul'],
    'navy': ['azul'],
    'green': ['verde'],
    'pink': ['rosa'],
    'gold': ['metálico'],
    'silver': ['metálico'],
    'metallic': ['metálico'],
    'multi': ['multicolor'],
    'multicolor': ['multicolor'],
    'gray': ['gris'],
    'grey': ['gris'],
    'yellow': ['amarillo'],
    'orange': ['naranja'],
    'purple': ['morado'],
  },
  'upper-materials': {
    'leather': ['cuero'],
    'synthetic': ['sintético'],
    'fabric': ['tela'],
    'canvas': ['lona'],
    'patent leather': ['charol'],
    'patent': ['charol'],
    'suede': ['ante/suede'],
    'nubuck': ['nubuck'],
    'mesh': ['mesh'],
    'satin': ['satín'],
    'velvet': ['terciopelo'],
  },
  'finishes': {
    'matte': ['mate'],
    'glossy': ['brilloso'],
    'patent': ['brilloso'],
    'metallic': ['metálico'],
    'distressed': ['distressed'],
    'brushed': ['texturizado'],
    'natural': ['liso'],
    'solid': ['liso'],
    'textured': ['texturizado'],
    'embossed': ['texturizado'],
    'printed': ['estampado'],
  },
  'patterns': {
    'solid': ['liso'],
    'animal print': ['animal print'],
    'floral': ['floral'],
    'geometric': ['geométrico'],
    'striped': ['rayas'],
    'plaid': ['cuadros'],
    'embossed': ['bordado'],
    'studded': ['bordado'],
    'woven': ['woven'],
    'two-tone': ['liso'],
  },
  'occasions': {
    'casual': ['casual'],
    'business': ['trabajo/oficina'],
    'formal': ['formal'],
    'evening': ['fiesta/gala'],
    'party': ['fiesta/gala'],
    'bridal': ['fiesta/gala'],
    'athletic': ['deportivo'],
    'outdoor': ['diario'],
    'everyday': ['diario'],
    'beach': ['playa'],
  },
};

let cachedConfig: AiFillConfig | null = null;

/**
 * Load the AI fill config from disk
 */
export function getAiFillConfig(): AiFillConfig {
  if (cachedConfig) return cachedConfig;
  const configPath = path.join(__dirname, '../../data/ai-fill-config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  cachedConfig = JSON.parse(raw) as AiFillConfig;
  return cachedConfig;
}

/**
 * Clear cached config (useful for tests)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Match an AI-generated English text value to a reference table entry ID.
 * Uses the English-to-Spanish mapping first, then falls back to case-insensitive
 * substring matching against the reference table names.
 */
export function matchReferenceValue(
  refTableName: string,
  aiValue: string | null,
): number | null {
  if (!aiValue) return null;

  const refData = getReferenceData(refTableName);
  if (!refData || refData.length === 0) return null;

  const normalizedAi = aiValue.toLowerCase().trim();

  // Step 1: Try English-to-Spanish mapping
  const tableMap = ENGLISH_TO_SPANISH[refTableName];
  if (tableMap) {
    const spanishCandidates = tableMap[normalizedAi];
    if (spanishCandidates) {
      for (const candidate of spanishCandidates) {
        const match = refData.find(
          (r) => r.name.toLowerCase() === candidate,
        );
        if (match) return match.id;
      }
    }
  }

  // Step 2: Direct case-insensitive exact match (handles loanwords like Stiletto)
  const exactMatch = refData.find(
    (r) => r.name.toLowerCase() === normalizedAi,
  );
  if (exactMatch) return exactMatch.id;

  // Step 3: Substring match — AI value contained in ref name or vice versa
  const substringMatch = refData.find((r) => {
    const refLower = r.name.toLowerCase();
    return refLower.includes(normalizedAi) || normalizedAi.includes(refLower);
  });
  if (substringMatch) return substringMatch.id;

  return null;
}

/**
 * Given raw AI analysis results, produce mapped reference table IDs
 * for all enabled reference-type attributes.
 */
export function mapAiResultsToReferenceIds(
  rawResults: Record<string, string | null>,
): MappedAttributes {
  const config = getAiFillConfig();
  const mapped: MappedAttributes = {};

  for (const [attrKey, attrConfig] of Object.entries(config.attributes)) {
    if (!attrConfig.enabled) continue;

    const aiValue = rawResults[attrConfig.aiKey] ?? null;

    if (attrConfig.type === 'reference' && attrConfig.refTable) {
      mapped[attrKey] = matchReferenceValue(attrConfig.refTable, aiValue);
    } else if (attrConfig.type === 'text' || attrConfig.type === 'enum') {
      mapped[attrKey] = aiValue;
    }
  }

  return mapped;
}
