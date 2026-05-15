export type AssortmentPlanStatus = 'DRAFT' | 'ACTIVE' | 'COMMITTED' | 'ARCHIVED';
export type AssortmentInclusionReason = 'Never distributed' | 'PR' | 'Both';
export type AssortmentPlanningScopeType = 'CATEGORY' | 'DEPARTMENT';

export interface AssortmentPlanningScope {
  type: AssortmentPlanningScopeType;
  number: number;
}

export interface AssortmentWaveWeight {
  releaseDate: string;
  weight: number;
}

export interface AssortmentStoreModelOverride {
  storeId: number;
  modelQuantity: number;
}

export interface AssortmentColorOverride {
  canonicalColor: string;
  targetStyleCount?: number;
  weight?: number;
}

export interface AssortmentSkuWaveOverride {
  skuId: string;
  releaseDate: string | null;
}

export interface AssortmentPlanningFactors {
  historyMonths: number;
  modelCoverWeeks: number;
  modelDisplayFloor: number;
  maxModelQuantity: number;
  stockOnlyStoreWeightPct: number;
  unseenColorFallbackPct: number;
  waveWeights: AssortmentWaveWeight[];
  storeModelOverrides: AssortmentStoreModelOverride[];
  colorOverrides: AssortmentColorOverride[];
  skuWaveOverrides: AssortmentSkuWaveOverride[];
}

export interface AssortmentPlanRequest {
  planningScope?: AssortmentPlanningScope;
  categoryNumber?: number;
  warehouseStoreId?: number;
  targetStoreIds?: number[];
  startDate?: string;
  horizonMonths?: number;
  highSeasonMonths?: number[];
  planningFactors?: Partial<AssortmentPlanningFactors>;
  label?: string;
  createdBy?: string;
}

export interface AssortmentPlanHeader {
  id: string;
  label: string;
  status: AssortmentPlanStatus;
  planningScope: AssortmentPlanningScope;
  scopeLabel: string;
  categoryNumber: number;
  categoryLabel: string;
  categoryNumbers: number[];
  warehouseStoreId: number;
  warehouseStoreLabel: string;
  targetStoreIds: number[];
  startDate: string;
  horizonMonths: number;
  highSeasonMonths: number[];
  planningFactors: AssortmentPlanningFactors;
  historyFromYearMonth: string;
  historyToYearMonth: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface AssortmentTargetStore {
  storeId: number;
  storeLabel: string;
  salesUnits: number;
  currentSkuCount: number;
  currentUnits: number;
  weight: number;
  suggestedSkuBudget: number;
  averageMonthlySales: number;
  salesPerSkuMonth: number;
  suggestedModelQuantity: number;
}

export interface AssortmentPoolItem {
  id?: string;
  skuId: string;
  skuCode: string;
  skuDescription: string | null;
  categoryNumber: number;
  categoryLabel: string;
  styleColor: string | null;
  colorCode: string | null;
  rawColorKey: string;
  canonicalColor: string;
  colorFamily: string;
  inclusionReason: AssortmentInclusionReason;
  warehouseUnits: number;
  storeUnits: number;
  keywords: string | null;
  assignedWaveSequence?: number;
}

export interface AssortmentColorMix {
  canonicalColor: string;
  colorFamily: string;
  salesUnits: number;
  salesPct: number;
  plannedStyleCount: number;
  plannedStylePct: number;
}

export interface AssortmentStoreAllocation {
  storeId: number;
  storeLabel: string;
  quantity: number;
  modelQuantity?: number;
}

export interface AssortmentWaveLine {
  id?: string;
  skuId: string;
  skuCode: string;
  skuDescription: string | null;
  rawColorKey: string;
  canonicalColor: string;
  colorFamily: string;
  warehouseUnits: number;
  releaseUnits: number;
  reserveUnits: number;
  allocations: AssortmentStoreAllocation[];
}

export interface AssortmentWave {
  id?: string;
  sequence: number;
  releaseDate: string;
  status: string;
  generatedTransferIds: string[];
  committedAt: string | null;
  styleCount: number;
  totalUnits: number;
  lines: AssortmentWaveLine[];
}

export interface AssortmentPlanReport {
  plan?: AssortmentPlanHeader;
  planningScope: AssortmentPlanningScope;
  scopeLabel: string;
  categoryNumber: number;
  categoryLabel: string;
  categoryNumbers: number[];
  warehouseStoreId: number;
  warehouseStoreLabel: string;
  targetStores: AssortmentTargetStore[];
  startDate: string;
  horizonMonths: number;
  highSeasonMonths: number[];
  planningFactors: AssortmentPlanningFactors;
  historyFromYearMonth: string;
  historyToYearMonth: string;
  pool: AssortmentPoolItem[];
  colorMix: AssortmentColorMix[];
  waves: AssortmentWave[];
  totals: {
    poolSkuCount: number;
    poolUnits: number;
    plannedReleaseUnits: number;
    reserveUnits: number;
    waveCount: number;
    targetStoreCount: number;
    transferDraftCount: number;
    committedWaveCount: number;
  };
  warnings: string[];
  generatedAt: string;
}

export interface AssortmentPlanListItem extends AssortmentPlanHeader {
  poolSkuCount: number;
  poolUnits: number;
  waveCount: number;
  transferDraftCount: number;
  committedWaveCount: number;
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = (body as { error?: { message?: string } })?.error?.message
      ?? `Assortment planning request failed (${res.status})`;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function previewAssortmentPlan(request: AssortmentPlanRequest): Promise<AssortmentPlanReport> {
  const res = await fetch('/api/v1/assortment-planning/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return parseJsonOrThrow<AssortmentPlanReport>(res);
}

export async function createAssortmentPlan(request: AssortmentPlanRequest): Promise<AssortmentPlanReport> {
  const res = await fetch('/api/v1/assortment-planning/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return parseJsonOrThrow<AssortmentPlanReport>(res);
}

export async function fetchAssortmentPlans(params: {
  status?: AssortmentPlanStatus | 'all';
} = {}): Promise<AssortmentPlanListItem[]> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  const res = await fetch(`/api/v1/assortment-planning/plans${qs.toString() ? `?${qs}` : ''}`);
  const body = await parseJsonOrThrow<{ plans: AssortmentPlanListItem[] }>(res);
  return body.plans;
}

export async function fetchAssortmentPlan(id: string): Promise<AssortmentPlanReport> {
  const res = await fetch(`/api/v1/assortment-planning/plans/${encodeURIComponent(id)}`);
  return parseJsonOrThrow<AssortmentPlanReport>(res);
}

export async function createAssortmentTransferDrafts(
  planId: string,
  waveId: string,
): Promise<AssortmentPlanReport> {
  const res = await fetch(
    `/api/v1/assortment-planning/plans/${encodeURIComponent(planId)}/waves/${encodeURIComponent(waveId)}/create-transfer-drafts`,
    { method: 'POST' },
  );
  return parseJsonOrThrow<AssortmentPlanReport>(res);
}

export async function commitAssortmentWave(planId: string, waveId: string): Promise<AssortmentPlanReport> {
  const res = await fetch(
    `/api/v1/assortment-planning/plans/${encodeURIComponent(planId)}/waves/${encodeURIComponent(waveId)}/commit`,
    { method: 'POST' },
  );
  return parseJsonOrThrow<AssortmentPlanReport>(res);
}
