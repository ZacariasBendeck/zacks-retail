import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { App, Form, Spin } from 'antd'
import {
  useAnalyzeImage,
  useReferenceData,
  useLookupSku,
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
import { useSizeTypes, useSeasons } from '../../hooks/useProductsTaxonomy'
import {
  useSkuDraft,
  useCreateSkuDraft,
  useUpdateSkuDraft,
  useFinalizeSkuDraft,
} from '../../hooks/useSkuDrafts'
import type { SkuLifecycleRow, CreateDraftInput } from '../../types/skuLifecycle'
import { productsAttributesApi } from '../../services/productsAttributesApi'
import { useSkuAttributes } from '../../hooks/useProductsAttributes'
import { VendorLookup } from '../../components/vendor-lookup'
import { useProductFamilies } from '../../hooks/useProductFamilies'
import { useAllPostgresCategories, type PostgresCategory } from '../../hooks/useProductCategories'
import type {
  Department,
  SkuCreatePayload,
  ReferenceItem,
  ImageAnalysisResult,
  EnhancedAnalysisResult,
  AiFillSummary,
  StyleColorLink,
} from '../../types/sku'
import { ALLOWED_DEPARTMENTS, isValidDepartment } from '../../constants/domain'
import { SkuApiError } from '../../services/skuApi'
import { matchReference } from './sku-form-modern/formHelpers'
import { pageContainer } from './sku-form-modern/styles'
import { PageHeader } from './sku-form-modern/PageHeader'
import { SkuCodeStrip } from './sku-form-modern/SkuCodeStrip'
import { ProductIdentitySection } from './sku-form-modern/ProductIdentitySection'
import { SupplierCostSection } from './sku-form-modern/SupplierCostSection'
import { PricingSection } from './sku-form-modern/PricingSection'
import { AppearanceSection } from './sku-form-modern/AppearanceSection'
import { AdvancedSection } from './sku-form-modern/AdvancedSection'
import { AiAnalysisPanel } from './sku-form-modern/AiAnalysisPanel'

const DEPARTMENTS: Department[] = ALLOWED_DEPARTMENTS

type SkuFormValues = SkuCreatePayload & {
  styleColorId?: string | null
}

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
  { formField: 'widthTypeId',       dimensionCode: 'width_type' },
  { formField: 'patternId',         dimensionCode: 'pattern' },
  { formField: 'finishId',          dimensionCode: 'finish' },
  { formField: 'accessoryId',       dimensionCode: 'accessory' },
  { formField: 'heelHeightId',      dimensionCode: 'heel_height' },
  { formField: 'heelShapeId',       dimensionCode: 'heel_shape' },
  { formField: 'toeShapeId',        dimensionCode: 'toe_shape' },
  { formField: 'upperMaterialId',   dimensionCode: 'upper_material' },
  { formField: 'outsoleMaterialId', dimensionCode: 'outsole_material' },
  { formField: 'heelMaterialId',    dimensionCode: 'heel_material' },
] as const
const DIMENSIONAL_FORM_FIELDS = new Set(DIMENSIONAL_ATTR_MAP.map((m) => m.formField))

/** Column fields known to app.sku. Everything else on the form goes into legacy_attrs. */
const APP_SKU_COLUMN_KEYS = new Set<string>([
  'vendorId', 'vendorSku', 'brandId', 'style', 'season', 'styleColorId',
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
    style: r.style ?? '',
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
    brandId: r.brandId,
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
    styleColor: null,
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
    brandId: (values.brandId as number | null | undefined) ?? null,
    style: strOrNull(values.style),
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

export default function SkuFormPageModern() {
  const { skuId } = useParams<{ skuId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { message } = App.useApp()
  const [form] = Form.useForm()

  const skuRootPath = location.pathname.startsWith('/products/') ? '/products/skus' : '/inventory/skus'

  const isRouteEdit = !!skuId
  const { data: lifecycleSku, isLoading: skuLoading } = useSkuDraft(skuId)
  const { data: vendors, isLoading: vendorsLoading } = useVendors()
  const { data: refData, isLoading: refLoading } = useReferenceData()
  const { data: sizeTypes, isLoading: sizeTypesLoading } = useSizeTypes()
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
  const lookupMutation = useLookupSku()
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
  const [matchedSku, setMatchedSku] = useState<import('../../types/sku').Sku | null>(null)
  const isEdit = isRouteEdit || !!matchedSku

  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
  }, [])
  const { data: autocompleteResults, isFetching: isSearching } = useAutocompleteSkus(debouncedSearch)

  const watchedDepartment = Form.useWatch('department', form) as Department | undefined
  const watchedBrandRaw = Form.useWatch('brandId', form) as unknown
  const watchedBrandId: number | undefined = (() => {
    if (typeof watchedBrandRaw === 'number') return watchedBrandRaw
    if (typeof watchedBrandRaw === 'string' && watchedBrandRaw.trim()) {
      const lower = watchedBrandRaw.trim().toLowerCase()
      const match = (refData?.['brands'] as ReferenceItem[] | undefined)?.find(
        (b) => b.name.toLowerCase() === lower,
      )
      return match?.id
    }
    return undefined
  })()
  const watchedColorId = Form.useWatch('colorId', form) as number | undefined

  const styleColorFilters = useMemo(
    () => ({
      active: true,
      department: isValidDepartment(watchedDepartment) ? watchedDepartment : undefined,
      brandId: watchedBrandId,
      colorId: watchedColorId,
    }),
    [watchedDepartment, watchedBrandId, watchedColorId],
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
    const brandName =
      (refData?.['brands'] as ReferenceItem[] | undefined)?.find(
        (b) => b.id === styleColor.brandId,
      )?.name ?? ''
    const nextValues: Partial<SkuFormValues> = {
      style: styleColor.style,
      brandId: brandName as unknown as number,
      colorId: styleColor.colorId,
      categoryId: styleColor.categoryId,
      department: styleColor.department,
      heelTypeCode: styleColor.heelTypeCode ?? null,
      heelMaterialTypeCode: styleColor.heelMaterialTypeCode ?? null,
      season: styleColor.season ?? undefined,
    }
    form.setFieldsValue(nextValues)
    message.success('Plantilla style-color aplicada al formulario')
  }, [form, message, styleColorMap, refData])

  const applyAiFill = useCallback((result: EnhancedAnalysisResult) => {
    if (!refData) return
    const fieldsToSet: Record<string, any> = {}
    const filled: string[] = []
    const skipped: string[] = []

    for (const mapping of AI_FIELD_MAP) {
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
        const rawMappedId = result.mapped?.[mapping.formField]
        const mappedId = typeof rawMappedId === 'number' ? rawMappedId : null
        const refItems = refData[mapping.refTable] ?? []
        const matchedId = mappedId ?? matchReference(aiValue, refItems)
        if (matchedId != null) {
          if (mapping.formField === 'categoryId') {
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
    setAiFillSummary({ filled, skipped, total: AI_FIELD_MAP.length })
  }, [refData, form, validCategoriesById, selectedFamily])

  const populateForm = useCallback((s: import('../../types/sku').Sku) => {
    const brandName =
      s.brandId != null
        ? (refData?.['brands'] as ReferenceItem[] | undefined)?.find(
            (b) => b.id === s.brandId,
          )?.name ?? ''
        : ''
    form.setFieldsValue({
      skuCode: s.skuCode,
      style: s.style,
      price: s.price,
      cost: s.cost,
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
      brandId: brandName as unknown as number,
      colorId: s.colorId,
      heelMaterialId: s.heelMaterialId,
      heelTypeCode: s.heelTypeCode ?? null,
      heelMaterialTypeCode: s.heelMaterialTypeCode ?? null,
      shoeTypeId: s.shoeTypeId,
      heelShapeId: s.heelShapeId,
      heelHeightId: s.heelHeightId,
      toeShapeId: s.toeShapeId,
      closureTypeId: s.closureTypeId,
      upperMaterialId: s.upperMaterialId,
      outsoleMaterialId: s.outsoleMaterialId,
      finishId: s.finishId,
      widthTypeId: s.widthTypeId,
      patternId: s.patternId,
      occasionId: s.occasionId,
      genderId: s.targetAudienceId,
      accessoryId: s.accessoryId,
      seasonId: s.seasonId,
      labelTypeId: s.labelTypeId,
      styleColorId: s.styleColor?.styleColorId ?? null,
    })
  }, [form, refData])

  useEffect(() => {
    if (sku) populateForm(sku)
  }, [sku, populateForm])

  useEffect(() => {
    if (!skuDimAttrs) return
    const patch: Record<string, number | null> = {}
    for (const m of DIMENSIONAL_ATTR_MAP) {
      const entry = skuDimAttrs.byDimension[m.dimensionCode]
      const first = entry?.values?.[0]
      if (first) {
        const n = Number.parseInt(first.code, 10)
        if (Number.isFinite(n)) patch[m.formField] = n
      } else {
        patch[m.formField] = null
      }
    }
    form.setFieldsValue(patch)
  }, [skuDimAttrs, form])

  const handleSkuCodeLookup = useCallback(async (code: string) => {
    if (!code.trim()) {
      setMatchedSku(null)
      return
    }
    try {
      const found = await lookupMutation.mutateAsync(code.trim())
      if (found) {
        setMatchedSku(found)
        populateForm(found)
        message.info(`SKU existente encontrado: ${found.skuCode} — modo edición`)
      } else {
        setMatchedSku(null)
      }
    } catch {
      setMatchedSku(null)
    }
  }, [lookupMutation, populateForm, message])

  const handleResetToCreate = useCallback(() => {
    const currentCode = form.getFieldValue('skuCode')
    setMatchedSku(null)
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
    setDerivedFamilyCode(null)
    setDerivedDepartmentLabel(null)
  }, [form])

  const finalizeAfterSaveRef = useRef(false)
  const createAnotherAfterSaveRef = useRef(false)

  const handleFinishFailed = useCallback(
    (e: { errorFields: { name: (string | number)[]; errors: string[] }[] }) => {
      const first = e.errorFields[0]
      if (!first) return
      const fieldName = first.name.join('.')
      const errMsg = first.errors[0] ?? 'Campo inválido'
      message.error(`${fieldName}: ${errMsg}`)
      finalizeAfterSaveRef.current = false
      createAnotherAfterSaveRef.current = false
    },
    [message],
  )

  const handleSaveClick = useCallback(() => {
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
    try {
      const rawBrand = values.brandId as unknown
      const brandText = typeof rawBrand === 'string' ? rawBrand.trim() : null
      let resolvedBrandId: number | null = typeof rawBrand === 'number' ? rawBrand : null
      let unresolvedBrandText: string | null = null
      if (brandText) {
        const lower = brandText.toLowerCase()
        const match = (refData?.['brands'] as ReferenceItem[] | undefined)?.find(
          (b) => b.name.toLowerCase() === lower,
        )
        if (match) {
          resolvedBrandId = match.id
        } else {
          resolvedBrandId = null
          unresolvedBrandText = brandText
        }
      } else if (brandText === '') {
        resolvedBrandId = null
      }
      const normalized: Record<string, unknown> = { ...values, brandId: resolvedBrandId }
      if (unresolvedBrandText) {
        normalized.brandText = unresolvedBrandText
      }
      const lifecyclePayload = splitFormValuesForLifecycle(normalized, derivedFamilyCode)
      const editId = skuId ?? matchedSku?.id

      const dimAssignments: { dimension_code: string; value_code: string }[] = []
      const scope: string[] = []
      for (const m of DIMENSIONAL_ATTR_MAP) {
        scope.push(m.dimensionCode)
        const v = (normalized as Record<string, unknown>)[m.formField]
        if (typeof v === 'number' && Number.isFinite(v)) {
          dimAssignments.push({ dimension_code: m.dimensionCode, value_code: String(v) })
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
          message.success('Borrador guardado')
        }
        if (createAnother) {
          resetPostSave()
          // If we came from the "existing SKU lookup" branch, navigate back to create.
          if (!isRouteEdit) navigate(`${skuRootPath}/new-modern`)
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
          navigate(`${skuRootPath}/${created.id}/edit`)
          return
        }
        message.success(`Borrador creado: ${created.provisionalCode}`)
        if (createAnother) {
          resetPostSave()
          return
        }
        navigate(`${skuRootPath}/${created.id}/edit`)
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

    if (!selectedFamily) {
      setAnalysisError('Selecciona una Familia de Producto antes de analizar la imagen.')
      return
    }

    try {
      const result = await analyzeMutation.mutateAsync({ file, family: selectedFamily })
      setAnalysisResult(result)
      if (result.warning) {
        setAnalysisWarning(result.warning)
        message.warning({ content: result.warning, duration: 8 })
      } else {
        message.success('Imagen analizada. Haz clic en "Llenar con IA" para auto-completar.')
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Fallo el análisis de imagen'
      setAnalysisError(errMsg)
    }
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

  const handleRetryAnalysis = () => {
    if (lastUploadedFile) handleImageUpload(lastUploadedFile)
  }

  const handleFillWithAi = () => {
    if (!analysisResult) return
    applyAiFill(analysisResult)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending || finalizeMutation.isPending

  if (isRouteEdit && skuLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (refLoading) {
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
        onCancel={() => navigate(skuRootPath)}
        onSave={handleSaveClick}
        onSaveAndNew={handleSaveAndNewClick}
        onResetToCreate={handleResetToCreate}
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
          initialQuery={(form.getFieldValue('vendorId') as string | undefined) ?? ''}
        />

        <SkuCodeStrip
          isRouteEdit={isRouteEdit}
          isDraft={isDraft}
          isActive={isActive}
          lifecycleSku={lifecycleSku}
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
          canFillWithAi={!!analysisResult && !analyzeMutation.isPending}
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
          refData={refData}
          sizeTypes={sizeTypes}
          sizeTypesLoading={sizeTypesLoading}
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

        <PricingSection />

        <AppearanceSection
          selectedFamily={selectedFamily}
          refData={refData}
          aiFilledFields={aiFilledFields}
        />

        <AdvancedSection refData={refData} seasonsCatalog={seasonsCatalog} />
      </Form>
    </div>
  )
}
