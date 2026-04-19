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
import { DepartmentRepository } from '../../repositories/rics/DepartmentRepository';
import { GroupRepository } from '../../repositories/rics/GroupRepository';
import { KeywordRepository } from '../../repositories/rics/KeywordRepository';
import { NrfCodeRepository } from '../../repositories/rics/NrfCodeRepository';
import { PromotionCodeRepository } from '../../repositories/rics/PromotionCodeRepository';
import { ReturnCodeRepository } from '../../repositories/rics/ReturnCodeRepository';
import { SeasonRepository } from '../../repositories/rics/SeasonRepository';
import { SectorRepository } from '../../repositories/rics/SectorRepository';
import { SizeTypeRepository } from '../../repositories/rics/SizeTypeRepository';

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
};

export type TaxonomyService = typeof taxonomyService;
