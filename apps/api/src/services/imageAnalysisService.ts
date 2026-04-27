import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { getCategoriesForFamily, resolveCategory, type CategoryWithDept, type DepartmentResolution } from './products/productFamilyService';

/**
 * AI image-analysis result — the raw JSON Claude returns.
 *
 * `category_label` is whatever string Claude picks from the injected category
 * list. It's formatted as "{number} - {desc}" (e.g. "591 - Bota Alta") so the
 * backend can parse it deterministically. See `parseCategoryLabel`.
 */
export interface ImageAnalysisResult {
  shoe_type: string | null;
  heel_height: string | null;
  heel_shape: string | null;
  toe_shape: string | null;
  color: string | null;
  upper_material: string | null;
  outsole_material: string | null;
  heel_material: string | null;
  finish: string | null;
  pattern: string | null;
  occasion: string | null;
  target_audience: string | null;
  accessory: string | null;
  description: string | null;
  category: string | null;
}

/** Enriched result: AI output + resolved Postgres category/department values. */
export interface EnrichedAnalysisResult {
  raw: ImageAnalysisResult;
  resolution: DepartmentResolution | null;
  /**
   * Non-null when the AI returned a plausible `category` that we had to
   * reject — e.g. a number outside the selected product family's allow-list.
   * Surfaced to the frontend so the form can hint the operator to pick a
   * category manually instead of silently leaving the field blank.
   */
  warning: string | null;
}

const PROMPT_PATH = path.join(__dirname, 'prompts', 'shoe-image-analysis.md');
let cached: { prompt: string; mtimeMs: number } | null = null;

/**
 * Read the prompt file with mtime-based invalidation. Editing the .md and saving
 * takes effect on the very next analyze-image call — no API restart required.
 * A statSync round-trip is ~microseconds and the prompt is loaded at most once
 * per image analysis, so the cost is negligible. See
 * docs/operations/ai-prompt-hot-reload.md for the full rationale.
 */
function loadPromptTemplate(): string {
  const stat = fs.statSync(PROMPT_PATH);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.prompt;
  const prompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
  cached = { prompt, mtimeMs: stat.mtimeMs };
  return prompt;
}

/** Test-only: force the prompt to reload from disk on the next call. */
export function clearPromptCache(): void {
  cached = null;
}

/**
 * Build the category enumeration block that gets injected into the prompt.
 * Format: `{number} - {desc} (dept: {deptDesc})` so the model has the context
 * it needs to pick the right category. Duplicate descriptions (common in the
 * RICS catalog — e.g. "Zap Pend Clasificar" appears in multiple depts) are
 * disambiguated by the department suffix.
 */
function formatCategoryList(categories: CategoryWithDept[]): string {
  if (categories.length === 0) return '(no categories found for this family)';
  return categories
    .map((c) => {
      const deptPart = c.departmentDesc ? ` (dept: ${c.departmentDesc})` : '';
      return `  - ${c.categoryNumber} - ${c.categoryDesc.trim()}${deptPart}`;
    })
    .join('\n');
}

/**
 * Inject the real category list into the prompt template. Looks for the
 * literal placeholder `{{CATEGORIES}}` on its own block; replaces with the
 * formatted list. If the placeholder isn't in the template, appends the list
 * at the end (so older templates still work — the AI may just be less
 * accurate at picking the right category).
 */
function injectCategoriesIntoPrompt(template: string, categories: CategoryWithDept[]): string {
  const block = formatCategoryList(categories);
  if (template.includes('{{CATEGORIES}}')) {
    return template.replace('{{CATEGORIES}}', block);
  }
  return `${template}\n\n## Allowed category values\n\nPick ONE of the following category labels exactly as shown. Use the number + description format (e.g. "591 - Bota Alta") so the system can resolve it back to the real RICS category:\n\n${block}\n`;
}

/**
 * Validate a parsed category number against the family-scoped allow-list
 * that was injected into the prompt. Returns the number if it's in the set,
 * otherwise null — meaning the AI hallucinated a cross-family category and
 * we should refuse to resolve it.
 *
 * Pure function so it can be unit-tested without touching Anthropic or the DB.
 */
export function isCategoryInFamilyAllowList(
  categories: CategoryWithDept[],
  categoryNumber: number,
): boolean {
  for (const c of categories) {
    if (c.categoryNumber === categoryNumber) return true;
  }
  return false;
}

/** Parse "591 - Bota Alta" back into a category number. Returns null on failure. */
export function parseCategoryLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = label.match(/^\s*(\d{1,6})\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function analyzeShoeImage(
  imageBuffer: Buffer,
  mimeType: string,
  family: string,
): Promise<EnrichedAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  // Pull real categories for the selected family and inject into the prompt.
  const categories = await getCategoriesForFamily(family);
  const prompt = injectCategoriesIntoPrompt(loadPromptTemplate(), categories);

  const client = new Anthropic({ apiKey });
  const base64Image = imageBuffer.toString('base64');
  const mediaType = mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude Vision API');
  }

  const raw = JSON.parse(textBlock.text) as ImageAnalysisResult;

  // Resolve the AI's category pick back to a real Postgres category + dept.
  //
  // Defense-in-depth: even though the prompt injects only this family's
  // categories, Claude occasionally returns a number that isn't in the list
  // (hallucination, or ranking against a partial description match from its
  // training data). resolveCategory() would happily resolve those to a real
  // RICS row in a different family, causing the UI to silently land on a
  // cross-family category (e.g. a "trajes pendiente de clasificar" suit row
  // for a boot image). The allow-list check below is the hard guarantee.
  const categoryNumber = parseCategoryLabel(raw.category);
  let resolution: DepartmentResolution | null = null;
  let warning: string | null = null;
  if (categoryNumber != null) {
    if (isCategoryInFamilyAllowList(categories, categoryNumber)) {
      resolution = await resolveCategory(categoryNumber);
    } else {
      warning =
        `AI suggested category "${raw.category}" which is not in the selected product family. ` +
        `Please pick the category manually.`;
    }
  }

  return { raw, resolution, warning };
}
