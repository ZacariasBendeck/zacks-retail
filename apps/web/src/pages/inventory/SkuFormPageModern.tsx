import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { App, Button, Form, Result, Spin } from 'antd'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  useAnalyzeImage,
  useReferenceData,
  useAutocompleteSkus,
  useStyleColors,
} from '../../hooks/useSkus'
// 2026-04-23 — switched from legacy SQLite /api/v1/vendors (UUID-keyed) to the
// Postgres-backed /api/v1/products/vendors (4-letter RICS code). The old hook
// returned synthetic UUIDs as `id`; the new one returns the real 4-letter code
// that matches rics_mirror.vendors and app.sku.vendor_id.
import { useVendors } from '../../hooks/useProductsVendors'
// Size-type Select options come from rics_mirror.size_types (the real RICS
// grids), not the legacy SQLite `size-types` ref table which only carries
// size-standard names (EU, CN, MX, …). app.sku.size_type is a SmallInt
// matching rics_mirror.inventory_master.size_type.
import { useSizeTypes, useSeasons, useGroups, usePromotionCodes } from '../../hooks/useProductsTaxonomy'
import {
  useSkuDraft,
  useCreateSkuDraft,
  useUpdateSkuDraft,
  useFinalizeSkuDraft,
  fetchSkuDraftByCode,
  fetchNextSkuDraftByCode,
} from '../../hooks/useSkuDrafts'
import type { SkuLifecycleRow, CreateDraftInput } from '../../types/skuLifecycle'
import { productsAttributesApi } from '../../services/productsAttributesApi'
import { buildRicsImageUrl } from '../../services/ricsImageUrl'
import { useAttributeDimensions, useSkuAttributes } from '../../hooks/useProductsAttributes'
import { VendorLookup } from '../../components/vendor-lookup'
import { SkuLookup } from '../../components/sku-lookup'
import { useProductFamilies } from '../../hooks/useProductFamilies'
import { useAllPostgresCategories, type PostgresCategory } from '../../hooks/useProductCategories'
import type {
  Department,
  SkuCreatePayload,
  ImageAnalysisResult,
  EnhancedAnalysisResult,
  AiFillSummary,
  StyleColorLink,
} from '../../types/sku'
import { ALLOWED_DEPARTMENTS, isValidDepartment } from '../../constants/domain'
import { SkuApiError } from '../../services/skuApi'
import { matchReference, normalize } from './sku-form-modern/formHelpers'
import { pageContainer } from './sku-form-modern/styles'
import { PageHeader } from './sku-form-modern/PageHeader'
import { SkuCodeStrip } from './sku-form-modern/SkuCodeStrip'
import { ProductIdentitySection } from './sku-form-modern/ProductIdentitySection'
import { SupplierCostSection } from './sku-form-modern/SupplierCostSection'
import { PricingSection } from './sku-form-modern/PricingSection'
import { AppearanceSection } from './sku-form-modern/AppearanceSection'
import { AdvancedSection } from './sku-form-modern/AdvancedSection'
import { AiAnalysisPanel } from './sku-form-modern/AiAnalysisPanel'
import MatchingSetsCard from '../../components/products/MatchingSetsCard'

const DEPARTMENTS: Department[] = ALLOWED_DEPARTMENTS
const SKU_ROOT_PATH = '/products/skus'
const NEW_SKU_PATH = `${SKU_ROOT_PATH}/new`
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type SkuFormValues = SkuCreatePayload & {
  styleColorId?: string | null
}

type AttributeSelectOptions = Record<string, { label: string; value: string }[]>

/** Mapping: AI response key -> form field name + reference table slug. */
const AI_FIELD_MAP: { aiKey: keyof ImageAnalysisResult; formField: string; type: 'text' | 'enum' | 'reference'; refTable?: string }[] = [
  { aiKey: 'description', formField: 'webDescription', type: 'text' },
  { aiKey: 'color', formField: 'colorId', type: 'reference', refTable: 'colors' },
  { aiKey: 'shoe_type', formField: 'shoeTypeId', type: 'reference', refTable: 'shoe-types' },
  { aiKey: 'heel_height', formField: 'heelHeightId', type: 'reference', refTable: 'heel-heights' },
  { aiKey: 'heel_shape', formField: 'heelShapeId', type: 'reference', refTable: 'heel-shapes' },
  { aiKey: 'toe_shape', formField: 'toeShapeId', type: 'reference', refTable: 'toe-shapes' },
  { aiKey: 'upper_material', formField: 'upperMaterialId', type: 'reference', refTable: 'upper-materials' },
  { aiKey: 'outsole_material', formField: 'outsoleMaterialId', type: 'reference', refTable: 'outsole-materials' },
  { aiKey: 'heel_material', formField: 'heelMaterialId', type: 'reference', refTable: 'heel-materials' },
  { aiKey: 'finish', formField: 'finishId', type: 'reference', refTable: 'finishes' },
  { aiKey: 'pattern', formField: 'patternId', type: 'reference', refTable: 'patterns' },
  { aiKey: 'occasion', formField: 'occasionId', type: 'reference', refTable: 'occasions' },
  { aiKey: 'target_audience', formField: 'genderId', type: 'reference', refTable: 'target-audiences' },
  { aiKey: 'accessory', formField: 'accessoryId', type: 'reference', refTable: 'accessories' },
  { aiKey: 'category', formField: 'categoryId', type: 'reference', refTable: 'categories' },
]

/**
 * Apariencia / Diseño attributes that moved from legacy_attrs JSONB into proper
 * dimensional assignments on 2026-04-23. Each entry maps the form field to the
 * Postgres dimension `code`.
 */
const DIMENSIONAL_ATTR_MAP: readonly { formField: string; dimensionCode: string }[] = [
  { formField: 'colorId',           dimensionCode: 'color' },
  { formField: 'shoeTypeId',        dimensionCode: 'shoe_type' },
  { formField: 'widthTypeId',       dimensionCode: 'width_type' },
  { formField: 'patternId',         dimensionCode: 'pattern' },
  { formField: 'finishId',          dimensionCode: 'finish' },
  { formField: 'closureTypeId',     dimensionCode: 'closure_type' },
  { formField: 'accessoryId',       dimensionCode: 'accessory' },
  { formField: 'heelHeightId',      dimensionCode: 'heel_height' },
  { formField: 'heelShapeId',       dimensionCode: 'heel_shape' },
  { formField: 'toeShapeId',        dimensionCode: 'toe_shape' },
  { formField: 'upperMaterialId',   dimensionCode: 'upper_material' },
  { formField: 'outsoleMaterialId', dimensionCode: 'outsole_material' },
  { formField: 'heelMaterialId',    dimensionCode: 'heel_material' },
  { formField: 'occasionId',        dimensionCode: 'occasion' },
  { formField: 'genderId',          dimensionCode: 'target_audience' },
  { formField: 'labelTypeId',       dimensionCode: 'label_type' },
] as const
const DIMENSIONAL_FORM_FIELDS = new Set(DIMENSIONAL_ATTR_MAP.map((m) => m.formField))
const DIMENSION_CODE_BY_FORM_FIELD = new Map(DIMENSIONAL_ATTR_MAP.map((m) => [m.formField, m.dimensionCode] as const))

/** Column fields known to app.sku. Everything else on the form goes into legacy_attrs. */
const APP_SKU_COLUMN_KEYS = new Set<string>([
  'vendorId', 'vendorSku', 'styleColor', 'season', 'styleColorId',
  'listPrice', 'markDownPrice1', 'markDownPrice2', 'perks', 'discountCode',
  'sizeType', 'location', 'groupCode', 'pictureFileName', 'coupon',
  'currentPriceSlot', 'manufacturer', 'orderMultiple', 'orderUom',
])

function lifecycleToLegacySku(r: SkuLifecycleRow): import('../../types/sku').Sku {
  const legacy = (r.legacyAttrs ?? {}) as Record<string, unknown>
  const asNum = (k: string): number | null => {
    const v = legacy[k]
    return typeof v === 'number' ? v : null
  }
  const asStr = (k: string): string | null => {
    const v = legacy[k]
    return typeof v === 'string' ? v : null
  }
  return {
    skuCode: r.code ?? r.provisionalCode,
    id: r.id,
    style: '',
    styleColor: r.styleColor ?? null,
    price: r.retailPrice ?? 0,
    cost: r.currentCost ?? null,
    listPrice: r.listPrice ?? null,
    markDownPrice1: r.markDownPrice1 ?? null,
    markDownPrice2: r.markDownPrice2 ?? null,
    perks: r.perks ?? null,
    discountCode: r.discountCode ?? null,
    sizeType: r.sizeType ?? null,
    location: r.location ?? null,
    groupCode: r.groupCode ?? null,
    pictureFileName: r.pictureFileName ?? null,
    coupon: !!r.coupon,
    categoryId: r.categoryNumber ?? null,
    department: (legacy.department as import('../../types/sku').Department) ?? null,
    vendorId: r.vendorId ?? '',
    vendorSku: r.vendorSku ?? null,
    barcode: asStr('barcode'),
    ricsDescription: r.descriptionRics ?? null,
    webDescription: r.descriptionWeb ?? null,
    comment: r.comment ?? null,
    keywords: r.keywords ?? null,
    season: r.season ?? null,
    manufacturer: null,
    brandId: null,
    colorId: asNum('colorId'),
    heelMaterialId: asNum('heelMaterialId'),
    heelTypeCode: asStr('heelTypeCode'),
    heelMaterialTypeCode: asStr('heelMaterialTypeCode'),
    shoeTypeId: asNum('shoeTypeId'),
    heelShapeId: asNum('heelShapeId'),
    heelHeightId: asNum('heelHeightId'),
    toeShapeId: asNum('toeShapeId'),
    closureTypeId: asNum('closureTypeId'),
    upperMaterialId: asNum('upperMaterialId'),
    outsoleMaterialId: asNum('outsoleMaterialId'),
    finishId: asNum('finishId'),
    widthTypeId: asNum('widthTypeId'),
    patternId: asNum('patternId'),
    occasionId: asNum('occasionId'),
    genderId: asNum('genderId') ?? asNum('targetAudienceId'),
    accessoryId: asNum('accessoryId'),
    seasonId: asNum('seasonId'),
    labelTypeId: asNum('labelTypeId'),
    styleColorLink: null,
  } as unknown as import('../../types/sku').Sku
}

function splitFormValuesForLifecycle(
  values: Record<string, unknown>,
  derivedFamilyCode: string | null = null,
): CreateDraftInput {
  const retailPrice =
    typeof values.price === 'number' ? values.price : values.price == null ? null : Number(values.price)
  const currentCost =
    typeof values.cost === 'number' ? values.cost : values.cost == null ? null : Number(values.cost)
  const categoryNumber =
    typeof values.categoryId === 'number' && Number.isInteger(values.categoryId)
      ? (values.categoryId as number)
      : null

  const legacyAttrs: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(values)) {
    if (APP_SKU_COLUMN_KEYS.has(k)) continue
    if (DIMENSIONAL_FORM_FIELDS.has(k)) continue
    if (k === 'skuCode' || k === 'price' || k === 'cost') continue
    if (k === 'categoryId' || k === 'department') continue
    if (k === 'ricsDescription' || k === 'webDescription' || k === 'comment' || k === 'keywords') continue
    if (v === undefined) continue
    legacyAttrs[k] = v
  }

  const numOrNull = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : v == null ? null : Number(v)
    return Number.isFinite(n) ? (n as number) : null
  }
  const strOrNull = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v.trim() : null
    return s ? s : null
  }

  return {
    vendorId: (values.vendorId as string | null | undefined) ?? null,
    vendorSku: strOrNull(values.vendorSku),
    styleColor: strOrNull(values.styleColor),
    season: strOrNull(values.season),
    descriptionRics: strOrNull(values.ricsDescription),
    descriptionWeb: strOrNull(values.webDescription),
    comment: strOrNull(values.comment),
    keywords: strOrNull(values.keywords),
    retailPrice: Number.isFinite(retailPrice as number) ? (retailPrice as number) : null,
    currentCost: Number.isFinite(currentCost as number) ? (currentCost as number) : null,
    listPrice: numOrNull(values.listPrice),
    markDownPrice1: numOrNull(values.markDownPrice1),
    markDownPrice2: numOrNull(values.markDownPrice2),
    perks: numOrNull(values.perks),
    discountCode: strOrNull(values.discountCode),
    sizeType: numOrNull(values.sizeType),
    location: strOrNull(values.location),
    groupCode: strOrNull(values.groupCode),
    pictureFileName: strOrNull(values.pictureFileName),
    coupon: typeof values.coupon === 'boolean' ? values.coupon : null,
    categoryNumber,
    familyCode: derivedFamilyCode,
    legacyAttrs,
  }
}

function inferImageMimeType(fileName: string): string {
  const lower = fileName.trim().toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function toAttributeCode(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  return null
}

function matchAttributeOptionCode(
  aiValue: string,
  options: { label: string; value: string }[] | undefined,
): string | null {
  if (!aiValue || !options?.length) return null
  const norm = normalize(aiValue)

  const exact = options.find((o) => normalize(o.label) === norm || normalize(o.value) === norm)
  if (exact) return exact.value

  const substr = options.find((o) => {
    const labelNorm = normalize(o.label)
    return labelNorm.includes(norm) || norm.includes(labelNorm)
  })
  if (substr) return substr.value

  const aiWords = norm.split(/[\s/,]+/).filter(Boolean)
  let bestScore = 0
  let bestValue: string | null = null
  for (const option of options) {
    const refWords = normalize(option.label).split(/[\s/,]+/).filter(Boolean)
    const overlap = aiWords.filter((w) => refWords.some((rw) => rw.includes(w) || w.includes(rw))).length
    const score = overlap / Math.max(aiWords.length, refWords.length)
    if (score > bestScore && score >= 0.5) {
      bestScore = score
      bestValue = option.value
    }
  }
  return bestValue
}

export default function SkuFormPageModern() {
  const { skuId: skuRouteParam } = useParams<{ skuId: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm()

  const routeParam = skuRouteParam?.trim()
  const routeDraftId = routeParam && UUID_RE.test(routeParam) ? routeParam : undefined
  const routeSkuCode = routeParam && !routeDraftId ? routeParam : undefined
  const isRouteEdit = !!routeParam
  const { data: lifecycleSkuById, isLoading: skuByIdLoading } = useSkuDraft(routeDraftId)
  const { data: lifecycleSkuByCode, isLoading: skuByCodeLoading } = useQuery({
    queryKey: ['sku-drafts', 'by-code', routeSkuCode],
    queryFn: () => fetchSkuDraftByCode(routeSkuCode!),
    enabled: !!routeSkuCode,
  })
  const lifecycleSku = lifecycleSkuById ?? lifecycleSkuByCode ?? undefined
  const skuLoading = skuByIdLoading || skuByCodeLoading
  const { data: vendors, isLoading: vendorsLoading } = useVendors()
  const { data: refData, isLoading: refLoading } = useReferenceData()
  const { data: attributeDimensions, isLoading: attributeDimensionsLoading } = useAttributeDimensions(false)
  const { data: sizeTypes, isLoading: sizeTypesLoading } = useSizeTypes()
  const { data: groups, isLoading: groupsLoading } = useGroups()
  const { data: promotionCodes, isLoading: promotionCodesLoading } = usePromotionCodes()
  const { data: seasonsCatalog } = useSeasons()
  const createMutation = useCreateSkuDraft()
  const updateMutation = useUpdateSkuDraft()
  const finalizeMutation = useFinalizeSkuDraft()
  const skuLookupKey = lifecycleSku?.code ?? lifecycleSku?.provisionalCode ?? undefined
  const { data: skuDimAttrs } = useSkuAttributes(skuLookupKey)

  const sku = useMemo(
    () => (lifecycleSku ? lifecycleToLegacySku(lifecycleSku) : undefined),
    [lifecycleSku],
  )
  const skuState = lifecycleSku?.skuState ?? null
  const isDraft = skuState === 'DRAFT'
  const isActive = skuState === 'ACTIVE'

  const analyzeMutation = useAnalyzeImage()
  // Lookup by final code via the lifecycle API (/sku-drafts/by-code/:code).
  // Covers both app-created SKUs and every RICS-mirrored SKU — the SQLite
  // `/api/v1/skus/lookup` endpoint used by the legacy form only sees SQLite
  // rows, which is why SKUs picked from the Postgres-backed lookup modal
  // wouldn't autofill.
  const lookupMutation = useMutation({
    mutationFn: async (code: string): Promise<import('../../types/sku').Sku | null> => {
      const lifecycle = await fetchSkuDraftByCode(code)
      return lifecycle ? lifecycleToLegacySku(lifecycle) : null
    },
  })
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<EnhancedAnalysisResult | null>(null)
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set())
  const [aiFillSummary, setAiFillSummary] = useState<AiFillSummary | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null)
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null)
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null)

  const { data: productFamilies, isLoading: familiesLoading } = useProductFamilies()
  const { data: postgresCategories } = useAllPostgresCategories()
  const [derivedFamilyCode, setDerivedFamilyCode] = useState<string | null>(null)
  const [derivedDepartmentLabel, setDerivedDepartmentLabel] = useState<string | null>(null)
  const [vendorLookupOpen, setVendorLookupOpen] = useState(false)
  const [skuLookupOpen, setSkuLookupOpen] = useState(false)
  const watchedVendorId = Form.useWatch('vendorId', form)
  const watchedSkuCode = Form.useWatch('skuCode', form) as string | undefined
  const [matchedSku, setMatchedSku] = useState<import('../../types/sku').Sku | null>(null)
  const isEdit = isRouteEdit || !!matchedSku
  const preserveCategoryOnAiFill = !!matchedSku || (!!lifecycleSku && lifecycleSku.code != null)

  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
  }, [])
  const { data: autocompleteResults, isFetching: isSearching } = useAutocompleteSkus(debouncedSearch)

  const watchedDepartment = Form.useWatch('department', form) as Department | undefined
  const watchedColorCode = Form.useWatch('colorId', form) as string | number | undefined
  const watchedColorId =
    typeof watchedColorCode === 'number'
      ? watchedColorCode
      : typeof watchedColorCode === 'string'
        ? Number.parseInt(watchedColorCode, 10)
        : undefined

  const styleColorFilters = useMemo(
    () => ({
      active: true,
      department: isValidDepartment(watchedDepartment) ? watchedDepartment : undefined,
      colorId: Number.isFinite(watchedColorId) ? watchedColorId : undefined,
    }),
    [watchedDepartment, watchedColorId],
  )
  const { data: styleColors, isLoading: styleColorsLoading } = useStyleColors(styleColorFilters, true)

  const skuSearchOptions = useMemo(() => {
    if (!autocompleteResults?.length) return []
    return autocompleteResults.map((s) => ({
      value: s.skuCode,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontWeight: 500 }}>{s.skuCode}</span>
          <span style={{ color: '#888', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.style}{s.brandName ? ` · ${s.brandName}` : ''}
          </span>
        </div>
      ),
    }))
  }, [autocompleteResults])

  const styleColorMap = useMemo(() => {
    const map = new Map<string, StyleColorLink>()
    for (const styleColor of styleColors ?? []) {
      map.set(styleColor.styleColorId, styleColor)
    }
    return map
  }, [styleColors])

  const styleColorOptions = useMemo(() => {
    return (styleColors ?? []).map((styleColor) => ({
      value: styleColor.styleColorId,
      label: `${styleColor.style} · ${styleColor.department} · cat ${styleColor.categoryId}`,
    }))
  }, [styleColors])

  const attributeOptionsByDimension = useMemo<AttributeSelectOptions>(() => {
    const result: AttributeSelectOptions = {}
    for (const dim of attributeDimensions ?? []) {
      result[dim.code] = dim.values
        .filter((value) => value.isActive)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.labelEs.localeCompare(b.labelEs))
        .map((value) => ({ label: value.labelEs, value: value.code }))
    }
    return result
  }, [attributeDimensions])

  const existingSkuPictureUrl = useMemo(() => {
    return buildRicsImageUrl(matchedSku?.pictureFileName ?? lifecycleSku?.pictureFileName ?? null)
  }, [matchedSku?.pictureFileName, lifecycleSku?.pictureFileName])

  const validCategoriesById = useMemo(() => {
    const map = new Map<number, PostgresCategory>()
    for (const cat of postgresCategories ?? []) {
      map.set(cat.categoryNumber, cat)
    }
    return map
  }, [postgresCategories])

  const familyLabelByCode = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of productFamilies ?? []) m.set(f.code, f.labelEs)
    return m
  }, [productFamilies])

  const categoryOptions = useMemo(() => {
    if (!selectedFamily) return []
    const cats = Array.from(validCategoriesById.values()).filter(
      (c) => c.familyCode === selectedFamily,
    )
    return cats
      .sort((a, b) => a.categoryNumber - b.categoryNumber)
      .map((c) => ({
        label: `${c.categoryNumber} · ${c.categoryDesc.trim()}${
          c.departmentDesc ? `  (${c.departmentDesc})` : ''
        }`,
        value: c.categoryNumber,
      }))
  }, [validCategoriesById, selectedFamily])

  // Derive family + dept when the form loads an existing SKU.
  useEffect(() => {
    if (!lifecycleSku) return
    const cat = lifecycleSku.categoryNumber
    if (cat == null) return
    const row = validCategoriesById.get(cat)
    if (row) {
      const nextFamily = row.familyCode || lifecycleSku.familyCode || null
      if (nextFamily) setSelectedFamily(nextFamily)
      setDerivedFamilyCode(nextFamily)
      setDerivedDepartmentLabel(
        row.departmentNumber != null && row.departmentDesc
          ? `${row.departmentNumber} — ${row.departmentDesc}`
          : null,
      )
    }
  }, [lifecycleSku, validCategoriesById])

  useEffect(() => {
    if (!matchedSku?.categoryId) return
    const row = validCategoriesById.get(matchedSku.categoryId)
    if (!row) return

    const nextFamily = row.familyCode || null
    if (nextFamily && nextFamily !== selectedFamily) {
      setSelectedFamily(nextFamily)
    }
    setDerivedFamilyCode(nextFamily)
    setDerivedDepartmentLabel(
      row.departmentNumber != null && row.departmentDesc
        ? `${row.departmentNumber} - ${row.departmentDesc}`
        : null,
    )
    form.setFieldsValue({ department: row.departmentDesc ?? undefined })
  }, [matchedSku, validCategoriesById, selectedFamily, form])

  useEffect(() => {
    const current = form.getFieldValue('categoryId') as number | null | undefined
    if (current == null) return
    const row = validCategoriesById.get(current)
    if (!selectedFamily) {
      form.setFieldsValue({ categoryId: null })
      setDerivedFamilyCode(null)
      setDerivedDepartmentLabel(null)
      return
    }
    if (row && row.familyCode !== selectedFamily) {
      form.setFieldsValue({ categoryId: null })
      setDerivedFamilyCode(null)
      setDerivedDepartmentLabel(null)
    }
  }, [selectedFamily, validCategoriesById, form])

  const handleCategoryChange = useCallback((categoryNumber: number | null) => {
    if (!categoryNumber) {
      setDerivedFamilyCode(null)
      setDerivedDepartmentLabel(null)
      form.setFieldsValue({ department: undefined })
      return
    }
    const row = validCategoriesById.get(categoryNumber)
    if (!row) {
      setDerivedFamilyCode(null)
      setDerivedDepartmentLabel(null)
      form.setFieldsValue({ department: undefined })
      return
    }
    setDerivedFamilyCode(row.familyCode || null)
    const deptLabel = row.departmentNumber != null && row.departmentDesc
      ? `${row.departmentNumber} — ${row.departmentDesc}`
      : null
    setDerivedDepartmentLabel(deptLabel)
    form.setFields([{ name: 'categoryId', errors: [] }, { name: 'department', errors: [] }])
    form.setFieldsValue({ department: row.departmentDesc ?? undefined })
  }, [form, validCategoriesById])

  const handleStyleColorChange = useCallback((styleColorId: string | null) => {
    if (!styleColorId) return
    const styleColor = styleColorMap.get(styleColorId)
    if (!styleColor) return
    const nextValues: Record<string, unknown> = {
      colorId: String(styleColor.colorId),
      categoryId: styleColor.categoryId,
      department: styleColor.department,
      heelTypeCode: styleColor.heelTypeCode ?? null,
      heelMaterialTypeCode: styleColor.heelMaterialTypeCode ?? null,
      season: styleColor.season ?? undefined,
    }
    form.setFieldsValue(nextValues)
    message.success('Plantilla style-color aplicada al formulario')
  }, [form, message, styleColorMap])

  const applyAiFill = useCallback((
    result: EnhancedAnalysisResult,
    options: { preserveCategory?: boolean } = {},
  ): AiFillSummary => {
    if (!refData) {
      return { filled: [], skipped: AI_FIELD_MAP.map((mapping) => mapping.formField), total: AI_FIELD_MAP.length }
    }
    const fieldsToSet: Record<string, any> = {}
    const filled: string[] = []
    const skipped: string[] = []

    for (const mapping of AI_FIELD_MAP) {
      if (options.preserveCategory && mapping.formField === 'categoryId') {
        skipped.push(mapping.formField)
        continue
      }

      const aiValue = result.raw[mapping.aiKey]
      if (!aiValue) {
        skipped.push(mapping.formField)
        continue
      }
      if (mapping.type === 'text') {
        fieldsToSet[mapping.formField] = aiValue
        filled.push(mapping.formField)
      } else if (mapping.type === 'enum' && mapping.formField === 'department') {
        const dept = DEPARTMENTS.find((d) => d.toLowerCase() === aiValue.toLowerCase() && isValidDepartment(d))
        if (dept) {
          fieldsToSet[mapping.formField] = dept
          filled.push(mapping.formField)
        } else {
          skipped.push(mapping.formField)
        }
      } else if (mapping.type === 'reference' && mapping.refTable) {
        const rawMappedId =
          mapping.formField === 'genderId'
            ? result.mapped?.genderId ?? result.mapped?.targetAudienceId
            : result.mapped?.[mapping.formField]
        const mappedId = typeof rawMappedId === 'number' ? rawMappedId : null
        const refItems = refData[mapping.refTable] ?? []
        const matchedId = mappedId ?? matchReference(aiValue, refItems)
        const dimensionCode = DIMENSION_CODE_BY_FORM_FIELD.get(mapping.formField)
        const dimensionOptions = dimensionCode ? attributeOptionsByDimension[dimensionCode] : undefined
        const matchedAttributeCode =
          dimensionCode
            ? matchAttributeOptionCode(aiValue, dimensionOptions)
              ?? (matchedId != null && dimensionOptions?.some((o) => o.value === String(matchedId))
                ? String(matchedId)
                : null)
            : null
        if (matchedId != null || matchedAttributeCode != null) {
          if (mapping.formField === 'categoryId') {
            if (matchedId == null) {
              skipped.push('categoryId')
              continue
            }
            const cat = validCategoriesById.get(matchedId)
            if (cat && (!selectedFamily || !cat.familyCode || cat.familyCode === selectedFamily)) {
              fieldsToSet[mapping.formField] = matchedId
              filled.push(mapping.formField)
              setDerivedFamilyCode(cat.familyCode || null)
              setDerivedDepartmentLabel(
                cat.departmentNumber != null && cat.departmentDesc
                  ? `${cat.departmentNumber} — ${cat.departmentDesc}`
                  : null,
              )
              fieldsToSet['department'] = cat.departmentDesc ?? undefined
            } else {
              skipped.push('categoryId')
            }
          } else if (dimensionCode) {
            if (matchedAttributeCode != null) {
              fieldsToSet[mapping.formField] = matchedAttributeCode
              filled.push(mapping.formField)
            } else {
              skipped.push(mapping.formField)
            }
          } else {
            fieldsToSet[mapping.formField] = matchedId
            filled.push(mapping.formField)
          }
        } else {
          skipped.push(mapping.formField)
        }
      }
    }

    form.setFieldsValue(fieldsToSet)
    setAiFilledFields(new Set(filled))
    const summary = { filled, skipped, total: AI_FIELD_MAP.length }
    setAiFillSummary(summary)
    return summary
  }, [refData, form, validCategoriesById, selectedFamily, attributeOptionsByDimension])

  const populateForm = useCallback((s: import('../../types/sku').Sku) => {
    const legacyGenderId = (s as import('../../types/sku').Sku & { genderId?: number | null }).genderId
    form.setFieldsValue({
      skuCode: s.skuCode,
      styleColor: s.styleColor ?? null,
      price: s.price,
      cost: s.cost,
      listPrice: s.listPrice,
      markDownPrice1: s.markDownPrice1,
      markDownPrice2: s.markDownPrice2,
      perks: s.perks,
      discountCode: s.discountCode,
      sizeType: s.sizeType,
      groupCode: s.groupCode,
      location: s.location,
      pictureFileName: s.pictureFileName,
      coupon: s.coupon,
      categoryId: s.categoryId,
      department: s.department,
      vendorId: s.vendorId,
      vendorSku: s.vendorSku,
      barcode: s.barcode,
      ricsDescription: s.ricsDescription,
      webDescription: s.webDescription,
      comment: s.comment,
      keywords: s.keywords,
      season: s.season,
      manufacturer: s.manufacturer,
      colorId: toAttributeCode(s.colorId),
      heelMaterialId: toAttributeCode(s.heelMaterialId),
      heelTypeCode: s.heelTypeCode ?? null,
      heelMaterialTypeCode: s.heelMaterialTypeCode ?? null,
      shoeTypeId: toAttributeCode(s.shoeTypeId),
      heelShapeId: toAttributeCode(s.heelShapeId),
      heelHeightId: toAttributeCode(s.heelHeightId),
      toeShapeId: toAttributeCode(s.toeShapeId),
      closureTypeId: toAttributeCode(s.closureTypeId),
      upperMaterialId: toAttributeCode(s.upperMaterialId),
      outsoleMaterialId: toAttributeCode(s.outsoleMaterialId),
      finishId: toAttributeCode(s.finishId),
      widthTypeId: toAttributeCode(s.widthTypeId),
      patternId: toAttributeCode(s.patternId),
      occasionId: toAttributeCode(s.occasionId),
      genderId: toAttributeCode(legacyGenderId ?? s.targetAudienceId),
      accessoryId: toAttributeCode(s.accessoryId),
      seasonId: s.seasonId,
      labelTypeId: toAttributeCode(s.labelTypeId),
      styleColorId: s.styleColorLink?.styleColorId ?? null,
    })
  }, [form])

  useEffect(() => {
    if (sku) populateForm(sku)
  }, [sku, populateForm])

  useEffect(() => {
    if (!skuDimAttrs) return
    const patch: Record<string, string | null> = {}
    for (const m of DIMENSIONAL_ATTR_MAP) {
      const entry = skuDimAttrs.byDimension[m.dimensionCode]
      const first = entry?.values?.[0]
      if (first) {
        patch[m.formField] = first.code
      } else {
        patch[m.formField] = null
      }
    }
    form.setFieldsValue(patch)
  }, [skuDimAttrs, form])

  const fetchExistingSkuPictureFile = useCallback(async (pictureFileName: string) => {
    const imageUrl = buildRicsImageUrl(pictureFileName)
    if (!imageUrl) return null

    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(`No se pudo cargar la imagen existente (${response.status})`)
    }

    const blob = await response.blob()
    return new File([blob], pictureFileName, {
      type: blob.type || inferImageMimeType(pictureFileName),
    })
  }, [])

  const runAiFill = useCallback(async (args: {
    file: File
    familyCode: string
    preserveCategory: boolean
    successMessage?: string
  }) => {
    setAiFillSummary(null)
    setAiFilledFields(new Set())
    setAnalysisError(null)
    setAnalysisResult(null)
    setAnalysisWarning(null)

    setLastUploadedFile(args.file)

    const result = await analyzeMutation.mutateAsync({ file: args.file, family: args.familyCode })
    setAnalysisResult(result)
    if (result.warning) {
      setAnalysisWarning(result.warning)
      message.warning({ content: result.warning, duration: 8 })
    }
    const summary = applyAiFill(result, { preserveCategory: args.preserveCategory })
    message.success(args.successMessage ?? `AI lleno ${summary.filled.length} de ${summary.total} campos.`)
  }, [analyzeMutation, applyAiFill, message])

  const analyzeExistingSkuPicture = useCallback(async (args: {
    skuCode: string
    pictureFileName: string
    familyCode: string
  }) => {
    const imageUrl = buildRicsImageUrl(args.pictureFileName)
    if (!imageUrl) return

    try {
      const file = await fetchExistingSkuPictureFile(args.pictureFileName)
      if (!file) return
      await runAiFill({
        file,
        familyCode: args.familyCode,
        preserveCategory: true,
        successMessage: `AI lleno campos para ${args.skuCode} sin cambiar la categoria.`,
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Fallo el analisis de la imagen existente'
      setAnalysisError(errMsg)
    }
  }, [fetchExistingSkuPictureFile, runAiFill])

  const handleSkuCodeLookup = useCallback(async (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) {
      setMatchedSku(null)
      setAiFillSummary(null)
      setAiFilledFields(new Set())
      setAnalysisError(null)
      setAnalysisResult(null)
      setAnalysisWarning(null)
      setLastUploadedFile(null)
      return
    }
    try {
      const found = await lookupMutation.mutateAsync(trimmed)
      if (found) {
        setImagePreview(null)
        setAiFillSummary(null)
        setAiFilledFields(new Set())
        setAnalysisError(null)
        setAnalysisResult(null)
        setAnalysisWarning(null)
        setLastUploadedFile(null)
        setMatchedSku(found)
        populateForm(found)
        const familyCodeForAnalysis =
          found.categoryId != null
            ? validCategoriesById.get(found.categoryId)?.familyCode ?? null
            : null
        if (familyCodeForAnalysis && familyCodeForAnalysis !== selectedFamily) {
          setSelectedFamily(familyCodeForAnalysis)
        }
        message.info(`SKU existente encontrado: ${found.skuCode} — modo edición`)
      } else {
        setMatchedSku(null)
        setAiFillSummary(null)
        setAiFilledFields(new Set())
        setAnalysisError(null)
        setAnalysisResult(null)
        setAnalysisWarning(null)
        setLastUploadedFile(null)
      }
    } catch {
      setMatchedSku(null)
      setAiFillSummary(null)
      setAiFilledFields(new Set())
      setAnalysisError(null)
      setAnalysisResult(null)
      setAnalysisWarning(null)
      setLastUploadedFile(null)
    }
  }, [lookupMutation, populateForm, message, validCategoriesById, selectedFamily])

  const handleResetToCreate = useCallback(() => {
    const currentCode = form.getFieldValue('skuCode')
    setMatchedSku(null)
    setImagePreview(null)
    setAiFilledFields(new Set())
    setAiFillSummary(null)
    setAnalysisResult(null)
    setAnalysisError(null)
    setAnalysisWarning(null)
    setLastUploadedFile(null)
    setSelectedFamily(null)
    setDerivedFamilyCode(null)
    setDerivedDepartmentLabel(null)
    form.resetFields()
    form.setFieldsValue({ skuCode: currentCode })
    message.info('Modo crear activado')
  }, [form, message])

  const resetPostSave = useCallback(() => {
    form.resetFields()
    setMatchedSku(null)
    setImagePreview(null)
    setAiFilledFields(new Set())
    setAiFillSummary(null)
    setAnalysisResult(null)
    setAnalysisError(null)
    setAnalysisWarning(null)
    setLastUploadedFile(null)
    setSelectedFamily(null)
    setDerivedFamilyCode(null)
    setDerivedDepartmentLabel(null)
  }, [form])

  const finalizeAfterSaveRef = useRef(false)
  const createAnotherAfterSaveRef = useRef(false)
  const nextAfterSaveRef = useRef(false)

  const handleFinishFailed = useCallback(
    (e: { errorFields: { name: (string | number)[]; errors: string[] }[] }) => {
      const first = e.errorFields[0]
      if (!first) return
      const fieldName = first.name.join('.')
      const errMsg = first.errors[0] ?? 'Campo inválido'
      message.error(`${fieldName}: ${errMsg}`)
      finalizeAfterSaveRef.current = false
      createAnotherAfterSaveRef.current = false
      nextAfterSaveRef.current = false
    },
    [message],
  )

  const handleSaveClick = useCallback(() => {
    createAnotherAfterSaveRef.current = false
    nextAfterSaveRef.current = false
    // If operator typed a final SKU code, treat Save as save+finalize in one shot.
    const codeValue = form.getFieldValue('skuCode')
    const code = typeof codeValue === 'string' ? codeValue.trim() : ''
    if (code && !matchedSku) {
      finalizeAfterSaveRef.current = true
    }
    form.submit()
  }, [form, matchedSku])

  const handleSaveAndNewClick = useCallback(() => {
    createAnotherAfterSaveRef.current = true
    nextAfterSaveRef.current = false
    const codeValue = form.getFieldValue('skuCode')
    const code = typeof codeValue === 'string' ? codeValue.trim() : ''
    if (code && !matchedSku) {
      finalizeAfterSaveRef.current = true
    }
    form.submit()
  }, [form, matchedSku])

  const handleSaveAndNextClick = useCallback(() => {
    createAnotherAfterSaveRef.current = false
    nextAfterSaveRef.current = true
    const codeValue = form.getFieldValue('skuCode')
    const code = typeof codeValue === 'string' ? codeValue.trim() : ''
    if (code && !matchedSku) {
      finalizeAfterSaveRef.current = true
    }
    form.submit()
  }, [form, matchedSku])

  const handleSubmit = async (values: SkuFormValues) => {
    const finalizeAfter = finalizeAfterSaveRef.current
    finalizeAfterSaveRef.current = false
    const createAnother = createAnotherAfterSaveRef.current
    createAnotherAfterSaveRef.current = false
    const goToNext = nextAfterSaveRef.current
    nextAfterSaveRef.current = false
    try {
      const normalized: Record<string, unknown> = { ...values }
      const lifecyclePayload = splitFormValuesForLifecycle(normalized, derivedFamilyCode)
      const editId = lifecycleSku?.id ?? matchedSku?.id

      const dimAssignments: { dimension_code: string; value_code: string }[] = []
      const scope: string[] = []
      for (const m of DIMENSIONAL_ATTR_MAP) {
        scope.push(m.dimensionCode)
        const v = (normalized as Record<string, unknown>)[m.formField]
        const valueCode = toAttributeCode(v)
        if (valueCode) {
          dimAssignments.push({ dimension_code: m.dimensionCode, value_code: valueCode })
        }
      }
      const writeDims = async (skuKey: string) => {
        try {
          await productsAttributesApi.setForSku(skuKey, { assignments: dimAssignments, scope })
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[sku-form] dimensional attribute write failed', e)
          message.warning('SKU guardado, pero los atributos (color, patrón, etc.) no se pudieron guardar. Reintente.')
        }
      }

      const finalCodeRaw = (values as { skuCode?: unknown }).skuCode
      const finalCode = typeof finalCodeRaw === 'string' ? finalCodeRaw.trim() : ''
      const openNextSku = async (currentCode: string, fallbackId?: string) => {
        const nextSku = await fetchNextSkuDraftByCode(currentCode)
        if (nextSku) {
          navigate(`${SKU_ROOT_PATH}/${nextSku.id}/edit`)
          return true
        }
        message.info(`No hay un SKU posterior a ${currentCode}.`)
        if (fallbackId) {
          navigate(`${SKU_ROOT_PATH}/${fallbackId}/edit`)
        }
        return false
      }

      if (editId) {
        const updated = await updateMutation.mutateAsync({ id: editId, patch: lifecyclePayload })
        const skuKey = updated.code ?? updated.provisionalCode
        if (skuKey) await writeDims(skuKey)
        if (finalizeAfter && finalCode) {
          await finalizeMutation.mutateAsync({
            id: updated.id,
            input: { code: finalCode },
          })
          message.success(`SKU finalizado: ${finalCode}`)
        } else {
          message.success(`SKU actualizado: ${skuKey ?? editId}`)
        }
        if (createAnother) {
          resetPostSave()
          // If we came from the "existing SKU lookup" branch, navigate back to create.
          if (!isRouteEdit) navigate(NEW_SKU_PATH)
          return
        }
        if (goToNext) {
          const currentCode = (finalizeAfter && finalCode) || updated.code || matchedSku?.skuCode || lifecycleSku?.code
          if (!currentCode) {
            message.info('Este SKU todavia no tiene codigo final para buscar el siguiente.')
            return
          }
          await openNextSku(currentCode, updated.id)
          return
        }
      } else {
        const created = await createMutation.mutateAsync(lifecyclePayload)
        await writeDims(created.code ?? created.provisionalCode)
        if (finalizeAfter && finalCode) {
          await finalizeMutation.mutateAsync({
            id: created.id,
            input: { code: finalCode },
          })
          message.success(`SKU creado y finalizado: ${finalCode}`)
          if (createAnother) {
            resetPostSave()
            return
          }
          if (goToNext) {
            await openNextSku(finalCode, created.id)
            return
          }
          navigate(`${SKU_ROOT_PATH}/${created.id}/edit`)
          return
        }
        message.success(`Borrador creado: ${created.provisionalCode}`)
        if (createAnother) {
          resetPostSave()
          return
        }
        if (goToNext) {
          message.info('Save & Next requiere un codigo SKU final para ubicar el siguiente.')
        }
        navigate(`${SKU_ROOT_PATH}/${created.id}/edit`)
        return
      }
    } catch (err) {
      if (err instanceof SkuApiError && err.code === 'DUPLICATE_BARCODE') {
        form.setFields([{ name: 'barcode', errors: ['Este codigo de barras ya esta en uso'] }])
        return
      }
      if (err instanceof SkuApiError && err.code === 'VALIDATION_CATEGORY_RANGE') {
        const rangeMessage = err.message || 'Categoría fuera de rango permitido.'
        form.setFields([{ name: 'categoryId', errors: [rangeMessage] }])
        message.error(rangeMessage)
        return
      }
      const errMsg = err instanceof Error ? err.message : 'Ocurrio un error'
      message.error(errMsg)
    }
  }

  const handleImageUpload = async (file: File) => {
    const previewUrl = URL.createObjectURL(file)
    setImagePreview(previewUrl)
    setAiFillSummary(null)
    setAiFilledFields(new Set())
    setAnalysisError(null)
    setAnalysisResult(null)
    setAnalysisWarning(null)
    setLastUploadedFile(file)
  }

  // Clipboard-paste support — Ctrl+V routes through handleImageUpload.
  const handleImageUploadRef = useRef(handleImageUpload)
  useEffect(() => {
    handleImageUploadRef.current = handleImageUpload
  })
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (it && it.kind === 'file' && it.type.startsWith('image/')) {
          const file = it.getAsFile()
          if (file) {
            e.preventDefault()
            void handleImageUploadRef.current(file)
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const handleFillWithAi = useCallback(async () => {
    const familyCode = selectedFamily ?? derivedFamilyCode
    if (!familyCode) {
      setAnalysisError('Selecciona una Familia de Producto antes de analizar la imagen.')
      return
    }
    try {
      if (lastUploadedFile) {
        await runAiFill({
          file: lastUploadedFile,
          familyCode,
          preserveCategory: preserveCategoryOnAiFill,
        })
        return
      }

      const existingPicture = matchedSku?.pictureFileName ?? lifecycleSku?.pictureFileName ?? null
      const existingSkuCode = matchedSku?.skuCode ?? lifecycleSku?.code ?? null
      if (existingPicture && existingSkuCode) {
        await analyzeExistingSkuPicture({
          skuCode: existingSkuCode,
          pictureFileName: existingPicture,
          familyCode,
        })
        return
      }

      setAnalysisError('Carga una imagen o selecciona un SKU existente con foto primero.')
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Fallo el análisis de imagen'
      setAnalysisError(errMsg)
    }
  }, [
    selectedFamily,
    derivedFamilyCode,
    lastUploadedFile,
    runAiFill,
    preserveCategoryOnAiFill,
    matchedSku?.pictureFileName,
    matchedSku?.skuCode,
    lifecycleSku?.pictureFileName,
    lifecycleSku?.code,
    analyzeExistingSkuPicture,
  ])

  const handleRetryAnalysis = useCallback(() => {
    void handleFillWithAi()
  }, [handleFillWithAi])

  const isSaving = createMutation.isPending || updateMutation.isPending || finalizeMutation.isPending
  const canSaveAndNext = !!(
    matchedSku?.skuCode ||
    lifecycleSku?.code ||
    (typeof watchedSkuCode === 'string' ? watchedSkuCode.trim() : '')
  )
  const canRunAiFill = !!selectedFamily && !analyzeMutation.isPending && !!(
    lastUploadedFile ||
    matchedSku?.pictureFileName ||
    lifecycleSku?.pictureFileName
  )

  if (isRouteEdit && skuLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (isRouteEdit && !lifecycleSku) {
    return (
      <div style={pageContainer}>
        <Result
          status="404"
          title="SKU no encontrado"
          subTitle={`No se encontro ${routeParam ?? 'este SKU'} en los SKU importados o creados.`}
          extra={
            <Button type="primary" onClick={() => navigate(SKU_ROOT_PATH)}>
              Volver a SKU List
            </Button>
          }
        />
      </div>
    )
  }

  if (refLoading || attributeDimensionsLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" tip="Cargando datos de referencia..." />
      </div>
    )
  }

  return (
    <div style={pageContainer}>
      <PageHeader
        isEdit={isEdit}
        skuState={skuState}
        lifecycleSku={lifecycleSku}
        matchedSku={matchedSku}
        isSaving={isSaving}
        isFinalizing={finalizeMutation.isPending}
        onCancel={() => navigate(NEW_SKU_PATH)}
        onSave={handleSaveClick}
        onSaveAndNext={handleSaveAndNextClick}
        onSaveAndNew={handleSaveAndNewClick}
        onResetToCreate={handleResetToCreate}
        canSaveAndNext={canSaveAndNext}
      />

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        onFinishFailed={handleFinishFailed}
        scrollToFirstError
        requiredMark
      >
        <VendorLookup
          open={vendorLookupOpen}
          onClose={() => setVendorLookupOpen(false)}
          onSelect={(picked) => {
            form.setFieldsValue({ vendorId: picked.code })
          }}
          initialQuery={watchedVendorId ?? ''}
        />

        <SkuLookup
          open={skuLookupOpen}
          onClose={() => setSkuLookupOpen(false)}
          onSelect={(picked) => {
            form.setFieldsValue({ skuCode: picked.skuCode })
            setSkuLookupOpen(false)
            void handleSkuCodeLookup(picked.skuCode)
          }}
          onSubmitQuery={(typedSkuCode) => {
            form.setFieldsValue({ skuCode: typedSkuCode })
            setSkuLookupOpen(false)
            void handleSkuCodeLookup(typedSkuCode)
          }}
          initialQuery={watchedSkuCode ?? ''}
        />

        <SkuCodeStrip
          isRouteEdit={isRouteEdit}
          isDraft={isDraft}
          isActive={isActive}
          lifecycleSku={lifecycleSku}
          existingSkuImageUrl={matchedSku ? existingSkuPictureUrl : null}
          skuSearchOptions={skuSearchOptions}
          matched={!!matchedSku}
          searchPending={isSearching}
          lookupPending={lookupMutation.isPending}
          onSearch={(text) => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current)
            debounceTimer.current = setTimeout(() => setDebouncedSearch(text), 300)
          }}
          onSelect={(value) => {
            form.setFieldsValue({ skuCode: value })
            handleSkuCodeLookup(value)
          }}
          onBlur={() => {
            const code = form.getFieldValue('skuCode')
            if (code) handleSkuCodeLookup(code)
          }}
          onOpenSkuLookup={() => setSkuLookupOpen(true)}
        />

        {/* AI analysis alerts live just above the Identity section so they sit
            adjacent to the image dropzone without crowding its 240px column. */}
        <AiAnalysisPanel
          analysisError={analysisError}
          analysisResult={analysisResult}
          aiFillSummary={aiFillSummary}
          analyzing={analyzeMutation.isPending}
          onRetry={handleRetryAnalysis}
        />

        <ProductIdentitySection
          imagePreview={imagePreview}
          analyzing={analyzeMutation.isPending}
          analysisWarning={analysisWarning}
          onImageFile={handleImageUpload}
          onFillWithAi={handleFillWithAi}
          canFillWithAi={canRunAiFill}
          selectedFamily={selectedFamily}
          onFamilyChange={setSelectedFamily}
          productFamilies={productFamilies}
          familiesLoading={familiesLoading}
          categoryOptions={categoryOptions}
          onCategoryChange={handleCategoryChange}
          validCategoriesById={validCategoriesById}
          familyLabelByCode={familyLabelByCode}
          derivedFamilyCode={derivedFamilyCode}
          derivedDepartmentLabel={derivedDepartmentLabel}
          attributeOptionsByDimension={attributeOptionsByDimension}
          sizeTypes={sizeTypes}
          sizeTypesLoading={sizeTypesLoading}
          groups={groups}
          groupsLoading={groupsLoading}
          styleColorOptions={styleColorOptions}
          styleColorsLoading={styleColorsLoading}
          onStyleColorChange={handleStyleColorChange}
          aiFilledFields={aiFilledFields}
        />

        <SupplierCostSection
          vendors={vendors}
          vendorsLoading={vendorsLoading}
          onOpenVendorLookup={() => setVendorLookupOpen(true)}
        />

        <PricingSection
          promotionCodes={promotionCodes}
          promotionCodesLoading={promotionCodesLoading}
        />

        <AppearanceSection
          selectedFamily={selectedFamily}
          attributeOptionsByDimension={attributeOptionsByDimension}
          aiFilledFields={aiFilledFields}
        />

        <AdvancedSection
          refData={refData}
          attributeOptionsByDimension={attributeOptionsByDimension}
          seasonsCatalog={seasonsCatalog}
        />

        <MatchingSetsCard skuRef={skuLookupKey} />
      </Form>
    </div>
  )
}
