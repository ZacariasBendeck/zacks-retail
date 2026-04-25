/**
 * Taxonomy service — thin orchestration layer around the per-entity RICS
 * repositories (Departments, Categories, Groups, Keywords, Seasons, Sectors,
 * Return Codes, Promotion Codes, Size Types, NRF Codes).
 *
 * Step 2 is mostly pass-through — each repo's methods already carry enough
 * business logic. This file exists so routes don't import repositories
 * directly; future orchestration (e.g., auto-attach the dominant department
 * when a category range changes) lands here without a route rewrite.
 */

import { CategoryRepository } from '../../repositories/rics/CategoryRepository';
import { DepartmentRepository, type Department } from '../../repositories/rics/DepartmentRepository';
import { GroupRepository } from '../../repositories/rics/GroupRepository';
import { KeywordRepository } from '../../repositories/rics/KeywordRepository';
import { NrfCodeRepository } from '../../repositories/rics/NrfCodeRepository';
import { PromotionCodeRepository } from '../../repositories/rics/PromotionCodeRepository';
import { ReturnCodeRepository } from '../../repositories/rics/ReturnCodeRepository';
import { SeasonRepository } from '../../repositories/rics/SeasonRepository';
import { SectorRepository, type Sector } from '../../repositories/rics/SectorRepository';
import { SizeTypeRepository } from '../../repositories/rics/SizeTypeRepository';
import { Err, Ok, type Result } from '../../repositories/rics/repoResult';
import { totalSkuCount } from '../../repositories/rics/taxonomySkuCounts';

/**
 * Resolved Category→Department→Sector chain for a given Category number.
 * Department / Sector may be null if no range covers the lookup (reporting gap).
 */
export interface TaxonomyResolution {
  category: number;
  department: Department | null;
  sector: Sector | null;
}

/**
 * Walk Category → Department (by BegCateg..EndCateg) → Sector (by BegDept..EndDept).
 * Returns a partial chain even if only the intermediate step resolves so the UI
 * can surface the gap rather than 404.
 */
async function resolveForCategory(category: number): Promise<Result<TaxonomyResolution>> {
  const dept = await DepartmentRepository.findByCategory(category);
  if (!dept.ok) {
    // AccessConnectionError surfaces as-is; NotFound means no covering department.
    if (dept.error.kind === 'AccessConnectionError') return Err(dept.error);
    return Ok({ category, department: null, sector: null });
  }
  const sector = await SectorRepository.findByDepartment(dept.value.number);
  if (!sector.ok) {
    if (sector.error.kind === 'AccessConnectionError') return Err(sector.error);
    return Ok({ category, department: dept.value, sector: null });
  }
  return Ok({ category, department: dept.value, sector: sector.value });
}

/**
 * System-wide SKU total (denominator for the per-taxonomy coverage footer).
 * Reads from `rics_mirror.inventory_master` via the shared helper so the
 * count matches the per-taxonomy GROUP BYs and the whole taxonomy UI is MDB-
 * free. Returns 0 when the mirror has no rows (e.g. Render).
 */
async function skuTotal(): Promise<{ total: number }> {
  return { total: await totalSkuCount() };
}

export const taxonomyService = {
  departments: DepartmentRepository,
  categories: CategoryRepository,
  groups: GroupRepository,
  keywords: KeywordRepository,
  seasons: SeasonRepository,
  sectors: SectorRepository,
  returnCodes: ReturnCodeRepository,
  promotionCodes: PromotionCodeRepository,
  sizeTypes: SizeTypeRepository,
  nrfCodes: NrfCodeRepository,
  resolveForCategory,
  skuTotal,
};

export type TaxonomyService = typeof taxonomyService;
