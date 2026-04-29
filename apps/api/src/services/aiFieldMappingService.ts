import fs from 'fs';
import path from 'path';
import { getReferenceData } from './skuService';
import { ReferenceItem } from '../models/sku';

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
    'flat': ['plano (0-1 in)', 'sin tacon / deportivo (0 in)'],
    'low': ['tacon bajo (1-2 in)'],
    'low (1-2in)': ['tacon bajo (1-2 in)'],
    'medium': ['tacon medio (2-3 in)'],
    'medium (2-3in)': ['tacon medio (2-3 in)'],
    'high': ['tacon alto (3-4 in)'],
    'high (3-4in)': ['tacon alto (3-4 in)'],
    'very high': ['muy alto (4+ in)'],
    'very high (4in+)': ['muy alto (4+ in)'],
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
  'colors': {
    'black': ['negro'],
    'white': ['blanco'],
    'brown': ['cafe'],
    'tan': ['tan'],
    'camel': ['camel'],
    'beige': ['beige'],
    'nude': ['nude'],
    'red': ['rojo'],
    'burgundy': ['bordo'],
    'blue': ['azul'],
    'navy': ['navy'],
    'green': ['verde'],
    'pink': ['rosa'],
    'fuchsia': ['fucsia'],
    'gold': ['dorado'],
    'silver': ['plateado'],
    'rose gold': ['rose gold'],
    'metallic': ['dorado'],
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
    'geometric': ['geometrico', 'geométrico'],
    'striped': ['rayas'],
    'stripes': ['rayas'],
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
  'categories': {
    'pump formal': ['pump formal'],
    'pump casual': ['pump casual'],
    'pump fiesta': ['pump fiesta'],
    'flat formal': ['flat formal'],
    'flat casual': ['flat casual'],
    'flat fiesta': ['flat fiesta'],
    'sandal flat': ['sandalia plana'],
    'sandal heel': ['sandalia tacon'],
    'sandal fiesta': ['sandalia fiesta'],
    'sandal comfort': ['sandalia comfort'],
    'platform formal': ['plataforma formal'],
    'platform casual': ['plataforma casual'],
    'platform fiesta': ['plataforma fiesta'],
    'wedge': ['wedge'],
    'mule formal': ['mule formal'],
    'mule casual': ['mule casual'],
    'espadrille': ['espadrille'],
    'sneaker': ['sneaker'],
    'loafer': ['loafer'],
    'oxford': ['oxford'],
    'derby': ['derby'],
    'moccasin': ['mocasin'],
    'mocasin': ['mocasin'],
    'flip flop': ['chancla'],
    'slide': ['chancla'],
    'boot tall': ['bota alta'],
    'boot mid': ['bota media'],
    'boot ankle': ['botin'],
    'ankle boot': ['botin'],
    'comfort casual': ['comfort casual'],
    'comfort formal': ['comfort formal'],
    'other': ['especial/otro'],
    'special': ['especial/otro'],
  },
  'outsole-materials': {
    'rubber': ['goma'],
    'tpr': ['tpr'],
    'pu': ['pu'],
    'leather': ['cuero'],
    'synthetic': ['sintetico'],
    'eva': ['eva'],
  },
  'heel-materials': {
    'plastic': ['plastico'],
    'wrapped': ['forrado'],
    'covered': ['forrado'],
    'rubber': ['hule'],
    'stacked leather': ['ballena'],
    'stacked': ['ballena'],
    'espadrille': ['espartillo'],
    'jute': ['espartillo'],
    'rope': ['espartillo'],
  },
  'target-audiences': {
    // Género — the table holds exactly 4 values (Mujer, Hombre, Niña, Niño).
    // Any AI output that doesn't resolve to one of those yields null at the
    // service layer; the prompt enforces the 4-value enumeration.
    'women': ['mujer'],
    'woman': ['mujer'],
    'female': ['mujer'],
    'womens': ['mujer'],
    "women's": ['mujer'],
    'mujer': ['mujer'],
    'men': ['hombre'],
    'man': ['hombre'],
    'male': ['hombre'],
    'mens': ['hombre'],
    "men's": ['hombre'],
    'hombre': ['hombre'],
    'boy': ['niño'],
    'boys': ['niño'],
    'niño': ['niño'],
    'girl': ['niña'],
    'girls': ['niña'],
    'niña': ['niña'],
  },
  'accessories': {
    'none': ['sin accesorio'],
    'no accessory': ['sin accesorio'],
    'plain': ['sin accesorio'],
    'buckle': ['hebilla'],
    'metal ornament': ['adorno metalico'],
    'metal detail': ['adorno metalico'],
    'metal accent': ['adorno metalico'],
    'heart ornament': ['adorno metalico'],
    'charm': ['dije / charm'],
    'charms': ['dije / charm'],
    'pendant': ['dije / charm'],
    'studs': ['tachuelas'],
    'rivets': ['tachuelas'],
    'bow': ['lazos', 'moño'],
    'bows': ['lazos', 'moño'],
    'ribbon': ['lazos'],
    'ribbons': ['lazos'],
    'fringe': ['flecos'],
    'tassel': ['flecos'],
    'tassels': ['flecos'],
    'embroidery': ['bordado'],
    'embroidered': ['bordado'],
    'rhinestones': ['pedreria'],
    'crystal': ['pedreria'],
    'crystals': ['pedreria'],
    'pearl': ['perlas'],
    'pearls': ['perlas'],
    'stones': ['piedras'],
    'stone': ['piedras'],
    'beads': ['piedras'],
    'chain': ['cadena'],
    'chains': ['cadena'],
    'laces': ['cordones'],
    'shoelaces': ['cordones'],
    'ties': ['cintas'],
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
/** Strip diacritics/accents for fuzzy matching (é→e, ñ→n, etc.) */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function matchReferenceValue(
  refTableName: string,
  aiValue: string | null,
): number | null {
  if (!aiValue) return null;

  const normalizedInput = stripAccents(aiValue.toLowerCase().trim());
  if (
    refTableName === 'heel-materials' &&
    ['none', 'flat', 'plano', 'no heel', 'sin tacon'].includes(normalizedInput)
  ) {
    return null;
  }

  const rawData = getReferenceData(refTableName);
  if (!rawData || rawData.length === 0) return null;

  // Filter to items that have a 'name' property (excludes SizeLabelItem)
  const refData = rawData.filter((r): r is ReferenceItem => 'name' in r);
  if (refData.length === 0) return null;

  const normalizedAi = normalizedInput;

  // Step 1: Try English-to-Spanish mapping
  const tableMap = ENGLISH_TO_SPANISH[refTableName];
  if (tableMap) {
    const spanishCandidates = tableMap[stripAccents(aiValue.toLowerCase().trim())];
    if (spanishCandidates) {
      for (const candidate of spanishCandidates) {
        const normCandidate = stripAccents(candidate);
        const match = refData.find(
          (r) => stripAccents(r.name.toLowerCase()) === normCandidate,
        );
        if (match) return match.id;
      }
    }
  }

  // Step 2: Direct case-insensitive exact match (handles loanwords like Stiletto)
  const exactMatch = refData.find(
    (r) => stripAccents(r.name.toLowerCase()) === normalizedAi,
  );
  if (exactMatch) return exactMatch.id;

  // Step 3: Substring match — AI value contained in ref name or vice versa
  const substringMatch = refData.find((r) => {
    const refLower = stripAccents(r.name.toLowerCase());
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
