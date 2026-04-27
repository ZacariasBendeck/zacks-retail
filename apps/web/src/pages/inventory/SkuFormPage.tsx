import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Card,
  Row,
  Col,
  Space,
  Spin,
  Typography,
  App,
  Divider,
  Upload,
  Alert,
  Tag,
  Tooltip,
  Switch,
  AutoComplete,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, CameraOutlined, LoadingOutlined, SearchOutlined, ThunderboltOutlined, CheckCircleOutlined, ExclamationCircleOutlined, ReloadOutlined, EyeInvisibleOutlined } from '@ant-design/icons'
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
  fetchSkuDraftByCode,
} from '../../hooks/useSkuDrafts'
import type { SkuLifecycleRow, CreateDraftInput } from '../../types/skuLifecycle'
import { productsAttributesApi } from '../../services/productsAttributesApi'
import { buildRicsImageUrl } from '../../services/ricsImageUrl'
import { useSkuAttributes } from '../../hooks/useProductsAttributes'
import { VendorLookup } from '../../components/vendor-lookup'
import { SkuLookup } from '../../components/sku-lookup'
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
import {
  ALLOWED_DEPARTMENTS,
  isValidDepartment,
} from '../../constants/domain'
import { SkuApiError } from '../../services/skuApi'

const DEPARTMENTS: Department[] = ALLOWED_DEPARTMENTS

type SkuFormValues = SkuCreatePayload & {
  styleColorId?: string | null
}

/** Mapping: AI response key -> form field name + reference table slug.
 *  `colorId` / `department` are derived downstream: colorId drives color_family via
 *  ref_colors.color_family_id, and department is auto-filled when category is picked. */
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
  // Form key is `genderId` — matches the "Género" UI label. The AI raw key
  // stays `target_audience` (that's what Claude returns) and the ref table is
  // still `target-audiences`; only the form/storage key was renamed 2026-04-23.
  { aiKey: 'target_audience', formField: 'genderId', type: 'reference', refTable: 'target-audiences' },
  { aiKey: 'accessory', formField: 'accessoryId', type: 'reference', refTable: 'accessories' },
  { aiKey: 'category', formField: 'categoryId', type: 'reference', refTable: 'categories' },
]

// Apariencia / Diseño field visibility per Product Family. Client-side stop-gap
// until the dimensional framework (app.attribute_family_rule) replaces this
// hardcoded block. Rule: the 11 legacy shoe attributes only render for
// `zapatos`; every other family sees Color / Pattern / Finish only.
const APARIENCIA_SHOE_ONLY_FIELDS = new Set([
  'widthTypeId',
  'accessoryId',
  'heelHeightId',
  'heelShapeId',
  'toeShapeId',
  'upperMaterialId',
  'outsoleMaterialId',
  'heelMaterialId',
])

function isApparienciaFieldVisible(field: string, family: string | null): boolean {
  if (!family) return true
  if (family === 'zapatos') return true
  return !APARIENCIA_SHOE_ONLY_FIELDS.has(field)
}

/** Normalize string for comparison: lowercase, trim, remove accents */
function normalize(s: string): string {
  return s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Find the best matching reference item by name (case-insensitive, accent-insensitive, substring) */
function matchReference(aiValue: string, items: ReferenceItem[]): number | null {
  if (!aiValue || !items?.length) return null
  const norm = normalize(aiValue)

  // Exact match first
  const exact = items.find((i) => normalize(i.name) === norm)
  if (exact) return exact.id

  // Substring match: AI value contained in ref name or vice versa
  const substr = items.find((i) => {
    const refNorm = normalize(i.name)
    return refNorm.includes(norm) || norm.includes(refNorm)
  })
  if (substr) return substr.id

  // Word overlap: split both into words, find best overlap
  const aiWords = norm.split(/[\s/,]+/).filter(Boolean)
  let bestScore = 0
  let bestItem: ReferenceItem | null = null
  for (const item of items) {
    const refWords = normalize(item.name).split(/[\s/,]+/).filter(Boolean)
    const overlap = aiWords.filter((w) => refWords.some((rw) => rw.includes(w) || w.includes(rw))).length
    const score = overlap / Math.max(aiWords.length, refWords.length)
    if (score > bestScore && score >= 0.5) {
      bestScore = score
      bestItem = item
    }
  }
  return bestItem?.id ?? null
}

function refOptions(items: ReferenceItem[] | undefined) {
  if (!items) return []
  return items.map((i) => ({ label: i.name, value: i.id }))
}

function inferImageMimeType(fileName: string): string {
  const lower = fileName.trim().toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

const AI_FILLED_STYLE: React.CSSProperties = {
  borderLeft: '3px solid #52c41a',
  paddingLeft: 8,
  borderRadius: 4,
  transition: 'border-color 0.3s',
}

/** Wrap a Form.Item label with an AI-filled indicator */
function aiLabel(label: string, fieldName: string, filledSet: Set<string>): React.ReactNode {
  if (!filledSet.has(fieldName)) return label
  return (
    <span>
      {label} <ThunderboltOutlined style={{ color: '#52c41a', fontSize: 11 }} />
    </span>
  )
}

/**
 * Adapt a lifecycle-shaped SKU row (Postgres `app.sku` + legacy_attrs JSONB) back
 * to the form's historical `Sku` shape. Phase 5f keeps the full form working
 * against the new lifecycle backend by round-tripping the SQLite-era ref IDs
 * through a JSONB bag. Phase 4 replaces legacyAttrs with proper dimensions.
 */
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
    // The form uses `skuCode` as the primary identifier. While DRAFT, the final
    // code isn't set — show the provisional so the user has context.
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
    // Phase 4 — categoryId on the form holds the RICS category_number. Prefer
    // the app.sku column over any legacyAttrs.categoryId left from pre-Phase-4
    // drafts (which held SQLite ref_categories.id and wouldn't match anything
    // in the new Postgres-backed picker).
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
    // Read from either key so old DRAFTs that still carry `targetAudienceId`
    // in legacy_attrs still populate correctly on edit.
    genderId: asNum('genderId') ?? asNum('targetAudienceId'),
    accessoryId: asNum('accessoryId'),
    seasonId: asNum('seasonId'),
    labelTypeId: asNum('labelTypeId'),
    // styleColor block is legacy; no equivalent in app.sku yet
    styleColor: null,
    // The form shape is a superset of the legacy Sku type (it carries the new
    // RICS-parity columns on top of the ref-ID bag). Cast via unknown so TS
    // doesn't balk at the extra fields.
  } as unknown as import('../../types/sku').Sku
}

/** Column fields known to app.sku. Everything else on the form goes into legacy_attrs.
 *  2026-04-23 expansion surfaces every RICS InventoryMaster column the lifecycle
 *  service now accepts (listPrice, markDownPrice1/2, sizeType, location, …). */
const APP_SKU_COLUMN_KEYS = new Set<string>([
  'vendorId', 'vendorSku', 'brandId', 'style', 'season', 'styleColorId',
  'listPrice', 'markDownPrice1', 'markDownPrice2', 'perks', 'discountCode',
  'sizeType', 'location', 'groupCode', 'pictureFileName', 'coupon',
  'currentPriceSlot', 'manufacturer', 'orderMultiple', 'orderUom',
  // skuCode is set via finalize, never via create/update on app.sku
])

/**
 * Apariencia / Diseño attributes that moved from the legacy_attrs JSONB bag
 * into proper dimensional assignments on 2026-04-23. Each entry maps the
 * form field name to the Postgres dimension `code`. The form-field value is
 * a numeric ref-id (from the old SQLite ref tables); the matching
 * `attribute_value.code` is that same id stringified (seeded by
 * `seed:legacy-ref-dimensions`).
 *
 * Keys here get EXCLUDED from legacy_attrs serialization so they don't get
 * double-stored. The form posts them to `/skus/:code/attributes` after the
 * SKU save succeeds; see `writeDimensionalAttributes()`.
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

function splitFormValuesForLifecycle(
  values: Record<string, unknown>,
  derivedFamilyCode: string | null = null,
): CreateDraftInput {
  const retailPrice =
    typeof values.price === 'number' ? values.price : values.price == null ? null : Number(values.price)
  const currentCost =
    typeof values.cost === 'number' ? values.cost : values.cost == null ? null : Number(values.cost)

  // Phase 4 — categoryId form-field value is now the RICS category_number
  // (not a SQLite ref_categories.id). It maps directly to app.sku.category_number.
  const categoryNumber =
    typeof values.categoryId === 'number' && Number.isInteger(values.categoryId)
      ? (values.categoryId as number)
      : null

  const legacyAttrs: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(values)) {
    if (APP_SKU_COLUMN_KEYS.has(k)) continue
    // 2026-04-23 — Apariencia/Diseño attributes write to
    // app.sku_attribute_assignment via the dimensional framework, not into
    // this JSONB bag. See writeDimensionalAttributes() for the follow-up call.
    if (DIMENSIONAL_FORM_FIELDS.has(k)) continue
    // Phase 4 — categoryId + department are now app.sku columns (categoryNumber
    // + derived-from-category). Don't duplicate them into legacyAttrs.
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
    // 2026-04-23 — surface the full RICS-parity columns now that lifecycle
    // service round-trips them. Pass only fields the user actually touched
    // (null on empty input instead of undefined so a cleared field wipes).
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

// ── Small inline helpers used inside the Detalles / Prices cards. Kept in this
//    file to avoid inventing a components directory for two 10-line readouts.

/**
 * Readonly input that shows the vendor *name* resolved from the selected
 * vendor *code*. Sits next to the Vendor Code Select so the operator can
 * verify the code without opening the dropdown.
 */
function VendorNameAutofill({ vendors }: { vendors: { code: string; name: string }[] | undefined }) {
  // `vendorId` form field holds the 4-letter RICS vendor code — e.g. "NIKE",
  // "03EV". Matches the new Postgres-backed hook's primary key.
  const selectedCode = Form.useWatch('vendorId') as string | undefined
  const resolved = vendors?.find((v) => v.code === selectedCode)
  return (
    <Input
      value={resolved?.name ?? ''}
      readOnly
      placeholder="Auto"
      style={{ background: '#fafafa' }}
    />
  )
}

/**
 * Readonly description for the 2-character Season Code. Resolves via
 * `useSeasons()` (Postgres — `public.SeasonOverlay` joined with
 * `rics_mirror.seasons`), keyed by the `season` form field. Case-insensitive
 * match so typing `SS` lines up with a stored `Ss` etc.
 */
function SeasonAutofill({
  seasons,
}: {
  seasons: { code: string; description: string }[] | undefined
}) {
  const code = (Form.useWatch('season') as string | undefined) ?? ''
  const norm = code.trim().toUpperCase()
  const match = seasons?.find((s) => s.code.trim().toUpperCase() === norm)
  return (
    <Input
      value={match?.description ?? ''}
      readOnly
      placeholder={norm ? 'Código no encontrado' : 'Auto'}
      style={{ background: '#fafafa' }}
    />
  )
}

// ── Shared styles + <PriceField> wrapper for the horizontal "Default Prices"
//    card. Each row renders label-left / input-right with the label in a
//    fixed-width span and the InputNumber capped at 120 px — keeps the card
//    visually dense in the narrow lg=6 column.
const PRICE_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 6,
}
const PRICE_LABEL_STYLE: React.CSSProperties = {
  flex: '0 0 96px',
  fontSize: 12,
  color: 'rgba(0, 0, 0, 0.88)',
}
const PRICE_INPUT_WRAP_STYLE: React.CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
}
const PRICE_INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  maxWidth: 120,
}

interface PriceFieldProps {
  name: string
  label: string
  rules?: import('antd').FormRule[]
}

function PriceField({ name, label, rules }: PriceFieldProps) {
  return (
    <div style={PRICE_ROW_STYLE}>
      <span style={PRICE_LABEL_STYLE}>{label}</span>
      <div style={PRICE_INPUT_WRAP_STYLE}>
        <Form.Item name={name} rules={rules} noStyle>
          <InputNumber
            style={PRICE_INPUT_STYLE}
            min={0}
            step={0.01}
            precision={2}
            placeholder="0.00"
          />
        </Form.Item>
      </div>
    </div>
  )
}

/**
 * Displays gross-profit percentage computed live from the Retail Price +
 * Current Cost form fields. GP% = (retail - cost) / retail × 100, rounded to
 * one decimal. Shows a dash if either input is missing or retail is 0.
 */
function GpPercentDisplay() {
  const retail = Form.useWatch('price') as number | undefined
  const cost = Form.useWatch('cost') as number | undefined
  let label = '—'
  if (typeof retail === 'number' && retail > 0 && typeof cost === 'number') {
    const pct = ((retail - cost) / retail) * 100
    label = `${(Math.round(pct * 10) / 10).toFixed(1)} %`
  }
  return (
    <Input
      value={label}
      readOnly
      style={{ background: '#fafafa', fontFamily: 'monospace', textAlign: 'right' }}
    />
  )
}

export default function SkuFormPage() {
  const { skuId } = useParams<{ skuId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { message } = App.useApp()
  const [form] = Form.useForm()

  // Primary creator lives at `/products/skus/new`; the legacy `/inventory/skus/*`
  // URLs still render this form (edit flow). Branch navigation by current path
  // so a /products creation lands back in the products tree, not inventory.
  const skuRootPath = location.pathname.startsWith('/products/') ? '/products/skus' : '/inventory/skus'

  const isRouteEdit = !!skuId
  const { data: lifecycleSku, isLoading: skuLoading } = useSkuDraft(skuId)
  const { data: vendors, isLoading: vendorsLoading } = useVendors()
  const { data: refData, isLoading: refLoading } = useReferenceData()
  // RICS size-type grids (rics_mirror.size_types). Each row's `code` maps
  // directly to app.sku.size_type; description is the operator-facing label.
  const { data: sizeTypes, isLoading: sizeTypesLoading } = useSizeTypes()
  const sizeTypeOptions = useMemo(
    () =>
      (sizeTypes ?? []).map((s) => ({
        value: s.code,
        label: `${s.code} — ${s.description}`,
      })),
    [sizeTypes],
  )
  // Seasons from Postgres (SeasonOverlay + rics_mirror.seasons join). Powers
  // the Season Code autofill readout; the 2-char `season` form field is the
  // primary input and this just shows the resolved description.
  const { data: seasonsCatalog } = useSeasons()
  const createMutation = useCreateSkuDraft()
  const updateMutation = useUpdateSkuDraft()
  const finalizeMutation = useFinalizeSkuDraft()
  // Dimensional attribute assignments for this SKU (Apariencia / Diseño moved
  // off legacy_attrs on 2026-04-23). Keyed by provisional_code during DRAFT,
  // by final code after finalize.
  const skuLookupKey = lifecycleSku?.code ?? lifecycleSku?.provisionalCode ?? undefined
  const { data: skuDimAttrs } = useSkuAttributes(skuLookupKey)
  // Adapt the lifecycle row to the legacy `Sku` shape the rest of this form
  // (populateForm, header tags, style-color picker) was written against.
  const sku = useMemo(
    () => (lifecycleSku ? lifecycleToLegacySku(lifecycleSku) : undefined),
    [lifecycleSku],
  )
  const skuState = lifecycleSku?.skuState ?? null
  const isDraft = skuState === 'DRAFT'
  const isActive = skuState === 'ACTIVE'
  const isDiscontinued = skuState === 'DISCONTINUED'
  const analyzeMutation = useAnalyzeImage()
  const lookupMutation = useLookupSku()
  const [aiPanelOpen, setAiPanelOpen] = useState(true)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<EnhancedAnalysisResult | null>(null)
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set())
  const [aiFillSummary, setAiFillSummary] = useState<AiFillSummary | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null)
  // Product Family is required before the AI can analyze — it scopes which
  // real Postgres categories get injected into the prompt.
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null)
  const { data: productFamilies, isLoading: familiesLoading } = useProductFamilies()
  // Phase 4 — Postgres categories replace the SQLite ref_categories seed
  const { data: postgresCategories } = useAllPostgresCategories()
  // Derived family code for the currently-selected category — drives the
  // read-only "Familia" badge next to Categoría + populates app.sku.familyCode
  // on submit. Stored in component state (not a Form field) so it round-trips
  // through handleCategoryChange without an extra Form.useWatch.
  const [derivedFamilyCode, setDerivedFamilyCode] = useState<string | null>(null)
  const [derivedDepartmentLabel, setDerivedDepartmentLabel] = useState<string | null>(null)
  // Vendor Lookup modal — RICS-style popup with Code / Name table. The
  // quick-select dropdown on the form still works for operators who already
  // know the code; the modal is for browsing by name or exploring the list.
  const [vendorLookupOpen, setVendorLookupOpen] = useState(false)
  const [skuLookupOpen, setSkuLookupOpen] = useState(false)

  // Inline lookup state: tracks when a user-entered SKU code matches an
  // existing SKU in Postgres `app.sku`. Both app-created and RICS-imported
  // SKUs land here (the sync:rics ETL mirrors every RICS SKU into app.sku).
  // The stored shape is the form-friendly legacy Sku (adapted from the
  // lifecycle row via `lifecycleToLegacySku`); its `id` is the app.sku UUID,
  // which handleSubmit uses as `editId` to drive the Postgres PATCH.
  const [matchedSku, setMatchedSku] = useState<import('../../types/sku').Sku | null>(null)
  const isEdit = isRouteEdit || !!matchedSku
  const preserveCategoryOnAiFill = !!matchedSku || (!!lifecycleSku && lifecycleSku.code != null)

  // SKU autocomplete state
  const [skuSearchText, setSkuSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
  }, [])
  const { data: autocompleteResults, isFetching: isSearching } = useAutocompleteSkus(debouncedSearch)
  const watchedDepartment = Form.useWatch('department', form) as Department | undefined
  // brandId is now a free-text string (Marca accepts any value). For the
  // style-color filter we only apply it when the typed name exactly matches
  // an existing brand; otherwise we leave the filter off.
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
  const { data: styleColors, isLoading: styleColorsLoading } = useStyleColors(
    styleColorFilters,
    true,
  )

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

  // Phase 4 — Postgres-backed Category map. `categoryId` on the form holds
  // the RICS category_number (int), which is what app.sku.category_number
  // expects. The legacy SQLite ref_categories.id is no longer used.
  const existingSkuPictureUrl = useMemo(() => {
    return buildRicsImageUrl(matchedSku?.pictureFileName ?? lifecycleSku?.pictureFileName ?? null)
  }, [matchedSku?.pictureFileName, lifecycleSku?.pictureFileName])

  const visibleImagePreview = imagePreview ?? existingSkuPictureUrl

  const validCategoriesById = useMemo(() => {
    const map = new Map<number, PostgresCategory>()
    for (const cat of postgresCategories ?? []) {
      map.set(cat.categoryNumber, cat)
    }
    return map
  }, [postgresCategories])

  // Derive family + dept when the form loads an existing SKU. Keeps the
  // family badge + department label in sync with the pre-existing categoryId,
  // AND auto-sets the Familia picker so the Category Select stays enabled on
  // the edit page (without this, the category-scope effect below would wipe
  // the just-loaded value).
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

  // When the operator changes Familia de Producto, clear any stale Category
  // pick that belongs to a different family. The Category dropdown is scoped
  // to the current family, so leaving the prior value would render as
  // "valor desconocido". Skip the clear if the current category already lives
  // in the new family (e.g. we just derived the family from it on load).
  useEffect(() => {
    const current = form.getFieldValue('categoryId') as number | null | undefined
    if (current == null) return
    const row = validCategoriesById.get(current)
    if (!selectedFamily) {
      // Family was unset — category can't be validated, wipe it.
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

  // Category change → look up family + dept locally (no roundtrip since
  // useAllPostgresCategories already cached the full catalog) and push the
  // derived values into component state + the Departamento display field.
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
    // Legacy `department` field still exists on the form for the style-color
    // picker's compat shape — set it to the dept description so existing
    // filters/render paths don't crash. The real department number is in
    // derivedDepartmentLabel and gets sent to the backend as app.sku.
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

  /** Apply AI results to form fields using client-side matching */
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
        // Use backend-mapped ID if available, else client-side match.
        // `mapped` was widened to `string | number | null` to carry new
        // Postgres-resolved string fields (categoryName, departmentName, etc.)
        // alongside the legacy numeric ref-IDs. For `reference` mappings we
        // only want the numeric branch; a string here means we'd mis-pass a
        // category-name to a dropdown expecting a numeric id.
        const rawMappedId =
          mapping.formField === 'genderId'
            ? result.mapped?.genderId ?? result.mapped?.targetAudienceId
            : result.mapped?.[mapping.formField]
        const mappedId = typeof rawMappedId === 'number' ? rawMappedId : null
        const refItems = refData[mapping.refTable] ?? []
        const matchedId = mappedId ?? matchReference(aiValue, refItems)
        if (matchedId != null) {
          if (mapping.formField === 'categoryId') {
            // Phase 4 — matchedId is now the Postgres category_number. If it
            // resolves to a known row, set the form field + let the normal
            // handleCategoryChange effect derive family/dept later (we don't
            // call it here directly since setFieldsValue doesn't fire onChange).
            //
            // Cross-family guard: if the resolved category belongs to a family
            // other than the one the operator picked at the top of the page,
            // refuse to apply it. The backend should already block this via
            // isCategoryInFamilyAllowList, but a belt-and-suspenders check here
            // catches any leftover legacy fuzzy-match leaks (e.g. the old
            // SQLite reference table mapping "Pend Clasificar" to a suits
            // category for a shoe image).
            const cat = validCategoriesById.get(matchedId)
            if (cat && (!selectedFamily || !cat.familyCode || cat.familyCode === selectedFamily)) {
              fieldsToSet[mapping.formField] = matchedId
              filled.push(mapping.formField)
              // Also push the derived state so the family badge / dept readout
              // refresh immediately, matching what handleCategoryChange would do.
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
    const summary = { filled, skipped, total: AI_FIELD_MAP.length }
    setAiFillSummary(summary)
    return summary
  }, [refData, form, validCategoriesById, selectedFamily])

  /** Populate form fields from a SKU object */
  const populateForm = useCallback((s: import('../../types/sku').Sku) => {
    const legacyGenderId = (s as import('../../types/sku').Sku & { genderId?: number | null }).genderId
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
      genderId: legacyGenderId ?? s.targetAudienceId,
      accessoryId: s.accessoryId,
      seasonId: s.seasonId,
      labelTypeId: s.labelTypeId,
      styleColorId: s.styleColor?.styleColorId ?? null,
    })
  }, [form, refData])

  useEffect(() => {
    if (sku) populateForm(sku)
  }, [sku, populateForm])

  // 2026-04-23 — hydrate the 11 Apariencia / Diseño form fields from the
  // dimensional attribute store (`app.sku_attribute_assignment`). Values
  // live as string codes there but the form fields expect numeric ref ids
  // (seed:legacy-ref-dimensions wrote `code = String(refId)`), so parseInt
  // round-trips cleanly. Runs on mount + whenever skuDimAttrs changes, so
  // the latest assignment wins if an edit happens outside the form.
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

  /**
   * Look up SKU code — if it exists, populate form & switch to update mode.
   *
   * Single source of truth: Postgres `app.sku` via `/api/v1/products/sku-drafts/
   * by-code/:code`. Every RICS SKU is mirrored into app.sku as ACTIVE on each
   * `sync:rics` run (see docs/operations/sku-lifecycle-backfill.md), so this
   * covers both app-created and RICS-imported SKUs.
   *
   * The row is adapted to the legacy form-shape via `lifecycleToLegacySku` so
   * the existing `populateForm` fills every field. The preserved `id` is the
   * app.sku UUID, which drives the `editId` branch in `handleSubmit` →
   * `useUpdateSkuDraft` (Postgres PATCH) for subsequent saves.
   */
  const analyzeExistingSkuPicture = useCallback(async (args: {
    skuCode: string
    pictureFileName: string
    familyCode: string
  }) => {
    const imageUrl = buildRicsImageUrl(args.pictureFileName)
    if (!imageUrl) return

    setAiFillSummary(null)
    setAiFilledFields(new Set())
    setAnalysisError(null)
    setAnalysisResult(null)

    try {
      const response = await fetch(imageUrl)
      if (!response.ok) {
        throw new Error(`No se pudo cargar la imagen existente (${response.status})`)
      }

      const blob = await response.blob()
      const file = new File([blob], args.pictureFileName, {
        type: blob.type || inferImageMimeType(args.pictureFileName),
      })

      setLastUploadedFile(file)
      const result = await analyzeMutation.mutateAsync({ file, family: args.familyCode })
      setAnalysisResult(result)
      const summary = applyAiFill(result, { preserveCategory: true })

      if (result.warning) {
        message.warning({ content: result.warning, duration: 8 })
      }
      message.success(
        `IA llenó ${summary.filled.length} campos para ${args.skuCode} sin cambiar la categoría.`,
      )
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Fallo el análisis de la imagen existente'
      setAnalysisError(errMsg)
    }
  }, [analyzeMutation, applyAiFill, message])

  const handleSkuCodeLookup = useCallback(async (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) {
      setMatchedSku(null)
      setAiFillSummary(null)
      setAnalysisResult(null)
      setAnalysisError(null)
      return
    }
    try {
      const row = await fetchSkuDraftByCode(trimmed)
      if (!row) {
        setMatchedSku(null)
        setAiFillSummary(null)
        setAnalysisResult(null)
        setAnalysisError(null)
        return
      }
      const legacy = lifecycleToLegacySku(row)
      setImagePreview(null)
      setAiFillSummary(null)
      setAiFilledFields(new Set())
      setAnalysisError(null)
      setAnalysisResult(null)
      setMatchedSku(legacy)
      populateForm(legacy)
      // Unlock the Category selector + family-scoped attribute block when the
      // matched SKU already has a family.
      if (row.familyCode && row.familyCode !== selectedFamily) {
        setSelectedFamily(row.familyCode)
      }
      const familyCodeForAnalysis =
        row.familyCode ??
        (row.categoryNumber != null ? validCategoriesById.get(row.categoryNumber)?.familyCode ?? null : null)
      if (row.pictureFileName && familyCodeForAnalysis) {
        void analyzeExistingSkuPicture({
          skuCode: legacy.skuCode,
          pictureFileName: row.pictureFileName,
          familyCode: familyCodeForAnalysis,
        })
      }
      message.info(`SKU existente encontrado: ${legacy.skuCode} — modo edición`)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[SkuFormPage] SKU lookup failed:', err)
      setMatchedSku(null)
      setAiFillSummary(null)
      setAnalysisResult(null)
      setAnalysisError(null)
    }
  }, [populateForm, selectedFamily, message, analyzeExistingSkuPicture, validCategoriesById])

  /** Reset form back to create mode */
  const handleResetToCreate = useCallback(() => {
    const currentCode = form.getFieldValue('skuCode')
    setMatchedSku(null)
    setImagePreview(null)
    setAiFillSummary(null)
    setAiFilledFields(new Set())
    setAnalysisError(null)
    setAnalysisResult(null)
    setLastUploadedFile(null)
    form.resetFields()
    form.setFieldsValue({ skuCode: currentCode })
    message.info('Modo crear activado')
  }, [form, message])

  // Ref — when true, handleSubmit runs create-then-finalize in one flow so the
  // operator can skip the DRAFT stage and land directly on an ACTIVE SKU.
  // Reset on every save attempt so the flag can't leak into a subsequent save.
  const finalizeAfterSaveRef = useRef(false)

  /**
   * Antd Form onFinishFailed — fires when validateFields rejects. The default
   * behavior is silent (no toast, no scroll), so when a required field is
   * off-screen the operator sees "nothing happens" after clicking Crear
   * borrador. Surface the first field name as a toast + let `scrollToFirstError`
   * bring it into view.
   */
  const handleFinishFailed = useCallback(
    (e: { errorFields: { name: (string | number)[]; errors: string[] }[] }) => {
      const first = e.errorFields[0]
      if (!first) return
      const fieldName = first.name.join('.')
      const errMsg = first.errors[0] ?? 'Campo inválido'
      message.error(`${fieldName}: ${errMsg}`)
      // Clear the finalize-intent flag so a failed first click doesn't leave
      // it armed for a later Crear borrador click.
      finalizeAfterSaveRef.current = false
    },
    [message],
  )

  /**
   * "Crear SKU final (sin borrador)" — skip the DRAFT stage. Requires the
   * final SKU code to be set on the form. Sets a ref flag the existing
   * handleSubmit reads to branch into create-then-finalize.
   */
  const handleCreateFinalClick = useCallback(() => {
    const codeValue = form.getFieldValue('skuCode')
    const code = typeof codeValue === 'string' ? codeValue.trim() : ''
    if (!code) {
      form.setFields([
        {
          name: 'skuCode',
          errors: ['Código SKU es requerido para guardar directo como SKU final (sin borrador).'],
        },
      ])
      message.error('Ingresa el Código SKU final antes de guardar sin borrador.')
      return
    }
    finalizeAfterSaveRef.current = true
    form.submit()
  }, [form, message])

  const handleSubmit = async (values: SkuFormValues) => {
    // Capture + reset the finalize-intent flag at the very top so a thrown
    // error inside the try block doesn't leave it armed for a later save.
    const finalizeAfter = finalizeAfterSaveRef.current
    finalizeAfterSaveRef.current = false
    try {
      // Marca is now free-text. Resolve the typed name against refData; if it
      // matches an existing brand (case-insensitive), link the numeric id;
      // otherwise preserve the free text in legacyAttrs.brandText so no data
      // is lost until a formal brand is created.
      const rawBrand = values.brandId as unknown
      const brandText =
        typeof rawBrand === 'string' ? rawBrand.trim() : null
      let resolvedBrandId: number | null =
        typeof rawBrand === 'number' ? rawBrand : null
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
      const normalized: Record<string, unknown> = {
        ...values,
        brandId: resolvedBrandId,
      }
      if (unresolvedBrandText) {
        normalized.brandText = unresolvedBrandText
      }
      const lifecyclePayload = splitFormValuesForLifecycle(normalized, derivedFamilyCode)
      const editId = skuId ?? matchedSku?.id

      // Extract the 11 Apariencia / Diseño dim values from the form so we can
      // write them to app.sku_attribute_assignment after the SKU row saves.
      // Null / undefined values are still sent (as empty assignments) so the
      // scoped replace clears any previous pick — that's how a user "unsets"
      // e.g. Color by reopening the select and pressing clear.
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
        // Non-blocking — if the dimensional write fails we still consider the
        // SKU save successful, so we log + surface a warning but don't throw.
        try {
          await productsAttributesApi.setForSku(skuKey, { assignments: dimAssignments, scope })
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[sku-form] dimensional attribute write failed', e)
          message.warning('SKU guardado, pero los atributos (color, patrón, etc.) no se pudieron guardar. Reintente.')
        }
      }

      // If the operator wants to skip the DRAFT stage, we need the final code
      // up-front (the finalize call is the only place a final code is ever
      // accepted). Pull it from the form value stashed on the skuCode field.
      const finalCodeRaw = (values as { skuCode?: unknown }).skuCode
      const finalCode = typeof finalCodeRaw === 'string' ? finalCodeRaw.trim() : ''

      if (editId) {
        const updated = await updateMutation.mutateAsync({ id: editId, patch: lifecyclePayload })
        const skuKey = updated.code ?? updated.provisionalCode
        if (skuKey) await writeDims(skuKey)
        if (finalizeAfter && finalCode) {
          // Edit-mode direct-finalize: after the patch lands, flip to ACTIVE.
          await finalizeMutation.mutateAsync({
            id: updated.id,
            input: { code: finalCode },
          })
          message.success(`SKU finalizado: ${finalCode}`)
        } else {
          message.success('Borrador guardado')
        }
      } else {
        const created = await createMutation.mutateAsync(lifecyclePayload)
        // DRAFT has no final code yet — write dim assignments keyed by
        // provisional_code; finalize() rekeys them to the real code atomically.
        await writeDims(created.code ?? created.provisionalCode)
        if (finalizeAfter && finalCode) {
          // Create-mode direct-finalize: create DRAFT, immediately flip it
          // ACTIVE with the operator-supplied code. One round-trip extra but
          // no new backend endpoint needed — reuses the existing finalize path
          // (which carries the provisional→final rekey for attribute rows).
          await finalizeMutation.mutateAsync({
            id: created.id,
            input: { code: finalCode },
          })
          message.success(`SKU creado y finalizado: ${finalCode}`)
          navigate(`${skuRootPath}/${created.id}/edit`)
          return
        }
        message.success(`Borrador creado: ${created.provisionalCode}`)
        // Redirect to the edit page for the new draft so the user can keep
        // editing the same record (per Phase 5f spec: after first save, user
        // edits the actual draft, not a stateless new form).
        navigate(`${skuRootPath}/${created.id}/edit`)
        return
      }
    } catch (err) {
      if (err instanceof SkuApiError && err.code === 'DUPLICATE_BARCODE') {
        form.setFields([{ name: 'barcode', errors: ['Este codigo de barras ya esta en uso'] }])
        return
      }

      // Phase 4 — range-check error path is dead (legacy SQLite backend is no
      // longer reached from this form). Left as a defensive forward — if any
      // backend resurrects that error code, surface its own message verbatim.
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

  /**
   * Finalize transitions the current DRAFT to ACTIVE. Before the state flip, we
   * first PATCH any pending form edits through as a draft-save so the server
   * has the latest version of every column + legacyAttrs. Then the finalize
   * call validates required fields server-side and sets the final `code`.
   *
   * Failures on the required-fields check come back as a 422 with a Spanish
   * message listing what's missing — we surface the whole message so the
   * operator can go fix it and retry.
   */
  const handleFinalize = useCallback(async () => {
    if (!lifecycleSku) return
    const codeValue = form.getFieldValue('skuCode')
    const finalCode = typeof codeValue === 'string' ? codeValue.trim() : ''
    if (!finalCode) {
      form.setFields([{ name: 'skuCode', errors: ['Código SKU es requerido para finalizar.'] }])
      message.error('Ingresa el código SKU final antes de finalizar.')
      return
    }
    try {
      // Single atomic call: the backend patches all fields + flips state in one
      // transaction, so there's no "half-edited DRAFT" failure mode from the
      // earlier two-call (PATCH-then-finalize) flow.
      const values = form.getFieldsValue()
      const lifecyclePayload = splitFormValuesForLifecycle(values as Record<string, unknown>, derivedFamilyCode)
      await finalizeMutation.mutateAsync({
        id: lifecycleSku.id,
        input: { code: finalCode, data: lifecyclePayload },
      })
      message.success(`SKU finalizado: ${finalCode}`)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Error al finalizar'
      message.error(errMsg)
    }
  }, [lifecycleSku, form, finalizeMutation, message])

  const handleImageUpload = async (file: File) => {
    const previewUrl = URL.createObjectURL(file)
    setImagePreview(previewUrl)
    setAiFillSummary(null)
    setAiFilledFields(new Set())
    setAnalysisError(null)
    setAnalysisResult(null)
    setLastUploadedFile(file)

    if (!selectedFamily) {
      setAnalysisError('Selecciona una Familia de Producto antes de analizar la imagen.')
      return
    }

    try {
      const result = await analyzeMutation.mutateAsync({ file, family: selectedFamily })
      setAnalysisResult(result)
      if (result.warning) {
        // Backend rejected the AI's category (usually: out-of-family hallucination).
        // Show a longer-duration warning so the operator notices the empty category
        // field isn't a bug — it's a deliberate refusal.
        message.warning({ content: result.warning, duration: 8 })
      } else {
        message.success('Imagen analizada. Haz clic en "Llenar con IA" para auto-completar campos.')
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Fallo el analisis de imagen'
      setAnalysisError(errMsg)
    }
  }

  // Clipboard-paste support — pastes an image from anywhere on the page (Ctrl+V)
  // go through the same `handleImageUpload` pipeline as the drag-drop dragger.
  // A ref keeps the listener body stable while always calling the current handler.
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
    if (lastUploadedFile) {
      handleImageUpload(lastUploadedFile)
    }
  }

  const handleFillWithAi = () => {
    if (!analysisResult) return
    const summary = applyAiFill(analysisResult, {
      preserveCategory: preserveCategoryOnAiFill,
    })
    message.success(`IA llenó ${summary.filled.length} de ${summary.total} campos.`)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  // Build category options with search by name or RICS code
  // NOTE: must be above early returns to satisfy Rules of Hooks
  //
  // Phase 4 — options grouped by Product Family label. Inside each group,
  // entries are sub-grouped by department for context, but AntD's grouped
  // Select doesn't support nested groups so we inline the dept in the label.
  const familyLabelByCode = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of productFamilies ?? []) m.set(f.code, f.labelEs)
    return m
  }, [productFamilies])
  const categoryOptions = useMemo(() => {
    // Scope the dropdown to the currently-selected Product Family. The Family
    // picker at the top of the page is the single source of truth for which
    // categories are legal — without that scope the operator sees 600+ mostly-
    // irrelevant rows and the grouped label ends up hiding most families
    // behind virtualization anyway. If no family is picked, the Select is
    // disabled by its own prop (see the Select render below), so what we
    // return here is a moot set — we return [] to make that explicit.
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

  const compactItem: React.CSSProperties = { marginBottom: 8 }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        {/* Header with Lookup inline */}
        <Card size="small" bodyStyle={{ padding: '8px 16px' }}>
          <Row align="middle" justify="space-between" gutter={16}>
            <Col>
              <Space>
                <Button
                  icon={<ArrowLeftOutlined />}
                  onClick={() => navigate(skuRootPath)}
                  size="small"
                >
                  Volver
                </Button>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {isEdit ? 'Editar SKU' : 'Nuevo SKU'}
                </Typography.Title>
                {isDraft && (
                  <Tag color="gold" style={{ fontWeight: 700, letterSpacing: 0.5 }}>
                    BORRADOR
                  </Tag>
                )}
                {isActive && (
                  <Tag color="green">ACTIVO</Tag>
                )}
                {isDiscontinued && (
                  <Tag color="red">DISCONTINUADO</Tag>
                )}
                {isRouteEdit && lifecycleSku && (
                  <Space size={4}>
                    <Tag color="blue" style={{ fontFamily: 'monospace' }}>
                      {lifecycleSku.code ?? lifecycleSku.provisionalCode}
                    </Tag>
                    {isDraft && lifecycleSku.code == null && (
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        (código provisional — se asigna el final al finalizar)
                      </Typography.Text>
                    )}
                  </Space>
                )}
                {!isRouteEdit && matchedSku && (
                  <Space size={4}>
                    <Tag color="orange">Existente: {matchedSku.skuCode}</Tag>
                    <Button size="small" type="link" onClick={handleResetToCreate}>
                      Crear nuevo
                    </Button>
                  </Space>
                )}
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Main Form — compact layout */}
        <Card size="small" bodyStyle={{ padding: '12px 16px' }}>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            // Surface validation failures as a toast + scroll the first
            // offending field into view. Without these, clicking "Crear
            // borrador" while a required field was off-screen produced no
            // visible response — the error landed under the hidden field and
            // the operator thought the button was broken.
            onFinishFailed={handleFinishFailed}
            scrollToFirstError
            // requiredMark defaults to true — shows a red asterisk on required
            // fields and NOTHING on optional ones. The previous value
            // `"optional"` inverted this and plastered "(optional)" on every
            // unrequired field including derived-display ones, which the
            // operator found noisy.
            size="small"
          >
            {/* Vendor lookup modal lives inside the Form so a selected code
                flows into the vendorId field via setFieldsValue. */}
            <VendorLookup
              open={vendorLookupOpen}
              onClose={() => setVendorLookupOpen(false)}
              onSelect={(picked) => {
                form.setFieldsValue({ vendorId: picked.code })
              }}
              initialQuery={(form.getFieldValue('vendorId') as string | undefined) ?? ''}
            />
            {/* SKU lookup modal — on select, seeds the skuCode field and
                triggers the existing handleSkuCodeLookup which in turn calls
                populateForm (autofills every field) and sets matchedSku so
                subsequent saves go through the update mutation. */}
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
              initialQuery={(form.getFieldValue('skuCode') as string | undefined) ?? ''}
            />
            {/* ─────────────────────────────────────────────────────────────
                Detalles del Producto (left) + Default Prices (right)

                Field order matches the operator's 2026-04-23 request. The
                right-side Card scopes the pricing block into its own visual
                group so it tab-navigates as a coherent unit.

                Field → backend column map:
                  vendorId        → vendor_id  (Code). Name auto-fills via
                                    lookup on the vendors list.
                  vendorSku       → vendor_sku
                  categoryId      → category_number (dept auto from ranges)
                  sizeType        → size_type (RICS SmallInt)
                  groupCode       → group_code
                  ricsDescription → description_rics
                  style/colorId   → style + legacy color ref id
                  location        → location
                  comment         → comment
                  cost            → current_cost
                  season          → season (2-char RICS code)
                  seasonId        → legacyAttrs (ref-table fk; auto-fills
                                    human name from ref data)
                  keywords        → keywords
                  pictureFileName → picture_file_name
                  coupon          → coupon
                  labelTypeId     → legacyAttrs (stays in bag until app.sku
                                    gets a label_type_id column)

                Right box pricing:
                  listPrice, price (retailPrice), markDownPrice1,
                  markDownPrice2, perks, discountCode. GP% computed via
                  Form.useWatch on price + cost.
                ───────────────────────────────────────────────────────────── */}
            <Row gutter={16} style={{ marginTop: 4 }}>
              <Col xs={24} lg={18}>
                <Card title="Detalles del Producto" size="small" styles={{ body: { padding: 12 } }}>
                  {/* IA toggle — small switch at the top-right of the Detalles
                      box. Moved here from the outer page header so the toggle,
                      the small IA dropzone, and the Codigo SKU all sit together
                      at the top of the product details. */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                    <Switch
                      size="small"
                      checked={aiPanelOpen}
                      onChange={setAiPanelOpen}
                      checkedChildren={<><CameraOutlined /> IA</>}
                      unCheckedChildren={<><EyeInvisibleOutlined /> IA</>}
                      style={{ minWidth: 60 }}
                    />
                  </div>

                  {/* Row 0 — Codigo SKU + small IA dropzone (when toggle on).
                      Two variants: create (AutoComplete lookup) vs. edit (plain
                      Input; disabled unless DRAFT; shows provisional code next
                      to it). The small dropzone replaces the big Upload.Dragger
                      that used to live in the AI card below. */}
                  {!isRouteEdit && (
                    <Row gutter={8} align="top">
                      <Col xs={24} sm={aiPanelOpen ? 10 : 16}>
                        <Form.Item
                          label={
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              Codigo SKU
                              <Button
                                type="link"
                                size="small"
                                icon={<SearchOutlined />}
                                onClick={() => setSkuLookupOpen(true)}
                                style={{ padding: 0, height: 'auto', lineHeight: 1 }}
                                title="Abrir lookup de SKUs existentes (Code / Description / Vendor / Style-Color)"
                              >
                                Buscar
                              </Button>
                            </span>
                          }
                          name="skuCode"
                          style={compactItem}
                          extra={matchedSku ? undefined : 'Escribe para autocompletar, o haz clic en Buscar para abrir el lookup. Si dejas vacío, se autogenera un código provisional.'}
                        >
                          <AutoComplete
                            options={skuSearchOptions}
                            onSearch={(text) => {
                              setSkuSearchText(text)
                              if (debounceTimer.current) clearTimeout(debounceTimer.current)
                              debounceTimer.current = setTimeout(() => setDebouncedSearch(text), 300)
                            }}
                            onSelect={(value: string) => {
                              form.setFieldsValue({ skuCode: value })
                              handleSkuCodeLookup(value)
                            }}
                            onBlur={() => {
                              const code = form.getFieldValue('skuCode')
                              if (code) handleSkuCodeLookup(code)
                            }}
                            placeholder="ej. FORMAL-NIKE-BLK-001 (opcional)"
                            disabled={!!matchedSku}
                            popupMatchSelectWidth={400}
                            notFoundContent={isSearching ? <Spin size="small" /> : (skuSearchText.length >= 1 ? 'No se encontraron SKUs' : null)}
                          >
                            <Input
                              suffix={lookupMutation.isPending || isSearching ? <LoadingOutlined /> : <SearchOutlined style={{ color: '#999' }} />}
                              onPressEnter={(e) => {
                                e.preventDefault()
                                handleSkuCodeLookup((e.target as HTMLInputElement).value)
                              }}
                            />
                          </AutoComplete>
                        </Form.Item>
                      </Col>
                      {aiPanelOpen && (
                        <Col xs={24} sm={8}>
                          <Form.Item label="Foto IA" style={compactItem}>
                            <Upload.Dragger
                              accept="image/jpeg,image/png,image/gif,image/webp"
                              showUploadList={false}
                              beforeUpload={(file) => {
                                handleImageUpload(file)
                                return false
                              }}
                              disabled={analyzeMutation.isPending}
                              style={{ padding: 0, minHeight: 44 }}
                            >
                              {analyzeMutation.isPending ? (
                                <div style={{ padding: '4px 8px' }}>
                                  <LoadingOutlined style={{ fontSize: 14, color: '#1677ff' }} />
                                  <span style={{ marginLeft: 6, fontSize: 11 }}>Analizando…</span>
                                </div>
                              ) : visibleImagePreview ? (
                                <img
                                  src={visibleImagePreview}
                                  alt="Zapato"
                                  style={{ maxHeight: 40, maxWidth: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                                />
                              ) : (
                                <div style={{ padding: '4px 8px' }}>
                                  <CameraOutlined style={{ fontSize: 14, color: '#999' }} />
                                  <span style={{ marginLeft: 6, fontSize: 11 }}>Clic, drop, o Ctrl+V</span>
                                </div>
                              )}
                            </Upload.Dragger>
                          </Form.Item>
                        </Col>
                      )}
                    </Row>
                  )}

                  {isRouteEdit && lifecycleSku && (
                    <Row gutter={8} align="top">
                      <Col xs={12} sm={6}>
                        <Form.Item
                          label="Código SKU final"
                          name="skuCode"
                          style={compactItem}
                          extra={
                            isDraft
                              ? 'Define el código SKU final antes de finalizar.'
                              : isActive
                              ? 'El código ya no puede renombrarse (SKU ACTIVO).'
                              : 'SKU descontinuado — solo lectura.'
                          }
                          rules={[{ max: 15, message: 'Máximo 15 caracteres' }]}
                        >
                          <Input
                            placeholder={isDraft ? 'ej. NAVY-ZARA-42R' : ''}
                            disabled={!isDraft}
                            maxLength={15}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={6}>
                        <Form.Item label="Código provisional" style={compactItem}>
                          <Input
                            value={lifecycleSku.provisionalCode}
                            readOnly
                            style={{ fontFamily: 'monospace', background: '#fafafa' }}
                          />
                        </Form.Item>
                      </Col>
                      {aiPanelOpen && (
                        <Col xs={24} sm={8}>
                          <Form.Item label="Foto IA" style={compactItem}>
                            <Upload.Dragger
                              accept="image/jpeg,image/png,image/gif,image/webp"
                              showUploadList={false}
                              beforeUpload={(file) => {
                                handleImageUpload(file)
                                return false
                              }}
                              disabled={analyzeMutation.isPending}
                              style={{ padding: 0, minHeight: 44 }}
                            >
                              {analyzeMutation.isPending ? (
                                <div style={{ padding: '4px 8px' }}>
                                  <LoadingOutlined style={{ fontSize: 14, color: '#1677ff' }} />
                                  <span style={{ marginLeft: 6, fontSize: 11 }}>Analizando…</span>
                                </div>
                              ) : visibleImagePreview ? (
                                <img
                                  src={visibleImagePreview}
                                  alt="Zapato"
                                  style={{ maxHeight: 40, maxWidth: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                                />
                              ) : (
                                <div style={{ padding: '4px 8px' }}>
                                  <CameraOutlined style={{ fontSize: 14, color: '#999' }} />
                                  <span style={{ marginLeft: 6, fontSize: 11 }}>Clic, drop, o Ctrl+V</span>
                                </div>
                              )}
                            </Upload.Dragger>
                          </Form.Item>
                        </Col>
                      )}
                    </Row>
                  )}

                  {/* Row 1 — Vendor identity alone, so Vendor SKU can breathe.
                      Everything after Vendor SKU wraps to the next row.
                      Vendor Code is a 4-letter RICS code — sized narrow. */}
                  <Row gutter={8}>
                    <Col xs={12} sm={3}>
                      <Form.Item
                        label={
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            Vendor Code
                            <Button
                              type="link"
                              size="small"
                              icon={<SearchOutlined />}
                              onClick={() => setVendorLookupOpen(true)}
                              style={{ padding: 0, height: 'auto', lineHeight: 1 }}
                              title="Abrir lookup de vendors (Code / Name)"
                            >
                              Buscar
                            </Button>
                          </span>
                        }
                        name="vendorId"
                        rules={[{ required: true, message: 'Vendor requerido' }]}
                        style={compactItem}
                      >
                        <Select
                          placeholder="Código"
                          showSearch
                          optionFilterProp="label"
                          loading={vendorsLoading}
                          // Render each option as "CODE — Name" so the operator
                          // sees both while scrolling the native dropdown. The
                          // stored value stays the 4-letter code.
                          options={vendors?.map((v) => ({
                            label: `${v.code} — ${v.name}`,
                            value: v.code,
                            name: v.name,
                          }))}
                          // Matches on either the code or the name substring.
                          filterOption={(input, option) => {
                            const s = input.toLowerCase()
                            const code = String(option?.value ?? '').toLowerCase()
                            const name = String((option as { name?: string } | undefined)?.name ?? '').toLowerCase()
                            return code.includes(s) || name.includes(s)
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={6}>
                      <Form.Item label="Vendor Name" style={compactItem}>
                        <VendorNameAutofill vendors={vendors} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={15}>
                      <Form.Item label="Vendor SKU" name="vendorSku" style={compactItem}>
                        <Input placeholder="SKU del proveedor (referencia original)" />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* Row 2 — Category / Department (auto) / Size Type / Group. */}
                  <Row gutter={8}>
                    <Col xs={24} sm={8}>
                      <Form.Item
                        label={
                          <span>
                            {aiLabel('Category', 'categoryId', aiFilledFields)}
                            {derivedFamilyCode && (
                              <Tag color="blue" style={{ marginLeft: 8, fontSize: 11 }}>
                                Familia: {familyLabelByCode.get(derivedFamilyCode) ?? derivedFamilyCode}
                              </Tag>
                            )}
                          </span>
                        }
                        name="categoryId"
                        rules={[
                          { required: true, message: 'Categoría requerida' },
                          {
                            validator: (_, value: number | null | undefined) => {
                              if (value == null) return Promise.resolve()
                              if (!validCategoriesById.has(value)) {
                                return Promise.reject(new Error('Categoría no encontrada en Postgres.'))
                              }
                              return Promise.resolve()
                            },
                          },
                        ]}
                        style={{ ...compactItem, ...(aiFilledFields.has('categoryId') ? AI_FILLED_STYLE : {}) }}
                      >
                        <Select
                          placeholder={
                            selectedFamily
                              ? 'Buscar'
                              : 'Selecciona una Familia primero'
                          }
                          disabled={!selectedFamily}
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          options={categoryOptions}
                          onChange={handleCategoryChange}
                          filterOption={(input, option) => {
                            const label = String(option?.label ?? '').toLowerCase()
                            return label.includes(input.toLowerCase())
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={6}>
                      <Form.Item label="Department (auto)" style={compactItem}>
                        <Input
                          value={derivedDepartmentLabel ?? ''}
                          readOnly
                          placeholder="Deriva de categoría"
                          style={{ background: '#fafafa', fontFamily: 'monospace' }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={6}>
                      <Form.Item label="Size Type" name="sizeType" style={compactItem}>
                        <Select
                          placeholder="Seleccionar grid"
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          loading={sizeTypesLoading}
                          options={sizeTypeOptions}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={4}>
                      <Form.Item label="Group" name="groupCode" style={compactItem}>
                        <Input placeholder="Grupo" maxLength={3} />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* Row 3 — Description / Style-Color / Current Cost / Season code / Season auto. */}
                  <Row gutter={8}>
                    <Col xs={24} sm={8}>
                      <Form.Item
                        label="Description"
                        name="ricsDescription"
                        rules={[
                          { required: true, message: 'Descripción requerida' },
                          { max: 30, message: 'Máximo 30 caracteres (RICS Desc WCHAR 30)' },
                        ]}
                        style={compactItem}
                      >
                        <Input placeholder="Descripción" maxLength={30} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={5}>
                      <Form.Item label="Style / Color" style={compactItem}>
                        <Space.Compact style={{ width: '100%' }}>
                          <Form.Item
                            name="style"
                            noStyle
                            rules={[{ required: true, message: 'Estilo requerido' }, { max: 17, message: 'Máximo 17 chars (RICS StyleColor WCHAR 20 menos 3 de color)' }]}
                          >
                            <Input style={{ width: '55%' }} placeholder="Estilo" maxLength={17} />
                          </Form.Item>
                          <Form.Item name="colorId" noStyle>
                            <Select
                              style={{ width: '45%' }}
                              placeholder="Color"
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              options={refOptions(refData?.['colors'])}
                            />
                          </Form.Item>
                        </Space.Compact>
                      </Form.Item>
                    </Col>
                    <Col xs={8} sm={3}>
                      <Form.Item label="Current Cost" name="cost" style={compactItem}>
                        <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={2} placeholder="0.00" />
                      </Form.Item>
                    </Col>
                    <Col xs={8} sm={3}>
                      <Form.Item label="Season Code" name="season" style={compactItem}>
                        <Input placeholder="ej. SS" maxLength={2} />
                      </Form.Item>
                    </Col>
                    <Col xs={8} sm={5}>
                      {/*
                        Season description autofills from Postgres (SeasonOverlay
                        joined with rics_mirror.seasons) keyed by the 2-char code
                        in the adjacent "Season Code" field. The legacy seasonId
                        ref-table Select was unrelated to the 2-char RICS code —
                        it keyed on a numeric SQLite id and couldn't line up with
                        app.sku.season, so typing a code and picking a name
                        produced two disconnected values.
                      */}
                      <Form.Item label="Season (auto)" style={compactItem}>
                        <SeasonAutofill seasons={seasonsCatalog} />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* Row 4 — Keywords / Picture File 1 / Coupon. */}
                  <Row gutter={8}>
                    <Col xs={24} sm={10}>
                      <Form.Item label="Keywords" name="keywords" rules={[{ max: 60, message: 'Máximo 60 caracteres (RICS KeyWords WCHAR 60, joined)' }]} style={compactItem}>
                        <Input placeholder="separadas por coma" maxLength={60} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={10}>
                      <Form.Item label="Picture File 1" name="pictureFileName" rules={[{ max: 50, message: 'Máximo 50 caracteres (RICS PictureFileName WCHAR 50)' }]} style={compactItem}>
                        <Input placeholder="ej. SKU123.jpg" maxLength={50} />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={4}>
                      <Form.Item label="Coupon" name="coupon" valuePropName="checked" style={compactItem}>
                        <Switch />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* Row 5 — AI keeper row: Brand / Shoe Type / Style-Color Canónico / Web Desc. */}
                  <Row gutter={8}>
                    <Col xs={12} sm={4}>
                      <Form.Item
                        label="Marca"
                        name="brandId"
                        rules={[{ required: true, message: 'Marca requerida' }]}
                        style={compactItem}
                      >
                        <Input placeholder="Escriba la marca" allowClear />
                      </Form.Item>
                    </Col>
                    {/* Tipo de Zapato removed from Detalles 2026-04-23 per
                        operator request. The AI still writes `shoeTypeId` into
                        legacy_attrs when an image is analyzed (see AI_FIELD_MAP);
                        it just isn't rendered on the form. When shoe-types
                        migrates to a dimension, the field returns with its new
                        home — until then, the AI value round-trips invisibly. */}
                    <Col xs={24} sm={14}>
                      <Form.Item
                        label="Style-Color Canonico"
                        name="styleColorId"
                        tooltip="Selector basado en /api/v1/skus/style-colors para copiar combinaciones existentes."
                        style={compactItem}
                      >
                        <Select
                          placeholder="Combinación existente (opcional)"
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          loading={styleColorsLoading}
                          options={styleColorOptions}
                          onChange={handleStyleColorChange}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={6}>
                      <Form.Item label={aiLabel('Descripción Web', 'webDescription', aiFilledFields)} name="webDescription" rules={[{ max: 1000 }]} style={{ ...compactItem, ...(aiFilledFields.has('webDescription') ? AI_FILLED_STYLE : {}) }}>
                        <Input placeholder="Descripción larga" />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* Row 6 — END ROW: Location (wide), Comment (widest), Label Type.
                      Duplicate copies of Label Type / Departamento / Tipo de Etiqueta
                      removed from the legacy "Clasificacion" block below on 2026-04-23. */}
                  <Row gutter={8}>
                    <Col xs={12} sm={5}>
                      <Form.Item label="Location" name="location" rules={[{ max: 10, message: 'Máximo 10 caracteres (RICS Location WCHAR 10)' }]} style={compactItem}>
                        <Input placeholder="Ubicación" maxLength={10} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={14}>
                      <Form.Item label="Comment" name="comment" rules={[{ max: 30, message: 'Máximo 30 caracteres (RICS Comment WCHAR 30)' }]} style={compactItem}>
                        <Input placeholder="Notas internas" maxLength={30} />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={5}>
                      <Form.Item label="Tipo de Etiqueta" name="labelTypeId" style={compactItem}>
                        <Select
                          placeholder="Tipo"
                          allowClear
                          options={refOptions(refData?.['label-types'])}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              </Col>

              <Col xs={24} lg={6}>
                <Card
                  title="Default Prices"
                  size="small"
                  styles={{ body: { padding: 12 } }}
                >
                  {/*
                    Horizontal layout — label on the left, compact input on the
                    right. Each row uses a flex container with a fixed-width
                    label span; the Form.Item itself renders `noStyle` so the
                    label column isn't the Ant-generated one. Inputs are capped
                    at 120px so the card stays visually dense.
                  */}
                  <PriceField name="listPrice" label="List Price" />
                  <PriceField
                    name="price"
                    label="Retail Price"
                    rules={[{ required: true, message: 'Retail requerido' }, { type: 'number', min: 0.01 }]}
                  />
                  <PriceField name="markDownPrice1" label="Markdown 1" />
                  <PriceField name="markDownPrice2" label="Markdown 2" />
                  <PriceField name="perks" label="Perks" />
                  <div style={PRICE_ROW_STYLE}>
                    <span style={PRICE_LABEL_STYLE}>GP %</span>
                    <div style={PRICE_INPUT_WRAP_STYLE}>
                      <GpPercentDisplay />
                    </div>
                  </div>
                  <div style={PRICE_ROW_STYLE}>
                    <span style={PRICE_LABEL_STYLE}>Discount Code</span>
                    <Form.Item name="discountCode" noStyle>
                      <Input style={PRICE_INPUT_STYLE} placeholder="Promoción" maxLength={20} />
                    </Form.Item>
                  </div>
                </Card>
              </Col>
            </Row>

            {/* Familia de Producto (always visible — drives attribute visibility
                + is required before saving) | AI Image Analysis (collapsible).
                Moved below Detalles del Producto on operator request. When IA
                is off, Familia spans the full width; when on, Familia takes
                the left column and the IA card takes the right. */}
            <Row gutter={16} style={{ marginTop: 8 }}>
              <Col xs={24} lg={aiPanelOpen ? 10 : 24}>
                <Card size="small" styles={{ body: { padding: '8px 16px' } }}>
                  <Row align="middle" gutter={16}>
                    <Col xs={24} sm={aiPanelOpen ? 24 : 12}>
                      <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>
                        Familia de Producto <span style={{ color: '#ff4d4f' }}>*</span>
                      </label>
                      <Select
                        placeholder="Selecciona una familia…"
                        value={selectedFamily}
                        onChange={(v) => setSelectedFamily(v)}
                        loading={familiesLoading}
                        disabled={analyzeMutation.isPending}
                        style={{ width: '100%' }}
                        options={(productFamilies ?? []).map((f) => ({ label: f.labelEs, value: f.code }))}
                      />
                    </Col>
                    {!aiPanelOpen && (
                      <Col xs={24} sm={12}>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          La familia filtra las categorías disponibles y qué atributos se muestran abajo.
                        </Typography.Text>
                      </Col>
                    )}
                  </Row>
                </Card>
              </Col>

              {aiPanelOpen && (
                <Col xs={24} lg={14}>
                  <Card size="small" styles={{ body: { padding: '8px 16px' } }}>
                    <Row align="middle" justify="space-between">
                      <Col>
                        <Typography.Text strong style={{ fontSize: 13 }}><CameraOutlined /> Analisis de Imagen con IA</Typography.Text>
                        <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                          Sube una foto del zapato, luego llena atributos con IA
                        </Typography.Text>
                      </Col>
                      <Col>
                        <Tooltip title={!analysisResult && !analyzeMutation.isPending ? (analysisError ? 'Analisis fallido — ver error abajo' : 'Sube una imagen primero') : undefined}>
                          <Button
                            type="primary"
                            icon={<ThunderboltOutlined />}
                            onClick={handleFillWithAi}
                            disabled={!analysisResult || analyzeMutation.isPending}
                            style={{ fontWeight: 600 }}
                          >
                            Llenar con IA
                          </Button>
                        </Tooltip>
                      </Col>
                    </Row>

                    {selectedFamily && selectedFamily !== 'zapatos' && (
                      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
                        Solo zapatos hoy está cableado al AI — otras familias vienen en la siguiente iteración.
                      </Typography.Text>
                    )}

                    {/* Dropzone + imagePreview moved up into Detalles del
                        Producto (right of Codigo SKU). This card now only
                        carries the "Llenar con IA" button + analysis alerts. */}

                    {analysisError && (
                      <Alert
                        type="error"
                        showIcon
                        icon={<ExclamationCircleOutlined />}
                        style={{ marginTop: 8 }}
                        message="Fallo el analisis de imagen"
                        description={
                          <div>
                            <Typography.Text>{analysisError}</Typography.Text>
                            <div style={{ marginTop: 8 }}>
                              <Button
                                size="small"
                                icon={<ReloadOutlined />}
                                onClick={handleRetryAnalysis}
                                loading={analyzeMutation.isPending}
                              >
                                Reintentar
                              </Button>
                            </div>
                          </div>
                        }
                      />
                    )}

                    {analysisResult && !aiFillSummary && (
                      <Alert
                        type="info"
                        showIcon
                        style={{ marginTop: 8 }}
                        message="Imagen analizada — lista para llenar"
                        description={
                          <div style={{ fontSize: 12 }}>
                            {analysisResult.resolution && (
                              <div style={{ marginBottom: 4, padding: '4px 8px', background: '#f0f9ff', borderRadius: 4 }}>
                                <strong>Categoría sugerida (Postgres):</strong>{' '}
                                <Tag color="blue">{analysisResult.resolution.categoryNumber} — {analysisResult.resolution.categoryDesc}</Tag>
                                <strong style={{ marginLeft: 8 }}>Dept:</strong>{' '}
                                <Tag color="geekblue">{analysisResult.resolution.departmentNumber} — {analysisResult.resolution.departmentDesc}</Tag>
                              </div>
                            )}
                            {analysisResult.raw.shoe_type && <span><strong>Tipo:</strong> {analysisResult.raw.shoe_type} | </span>}
                            {analysisResult.raw.heel_height && <span><strong>Tacon:</strong> {analysisResult.raw.heel_height} | </span>}
                            {analysisResult.raw.upper_material && <span><strong>Material:</strong> {analysisResult.raw.upper_material} | </span>}
                            {analysisResult.raw.color && <span><strong>Color:</strong> {analysisResult.raw.color} | </span>}
                            {analysisResult.raw.occasion && <span><strong>Ocasion:</strong> {analysisResult.raw.occasion}</span>}
                            <br />
                            <Typography.Text type="secondary">Haz clic en "Llenar con IA" para completar los campos. La categoría real de Postgres se mostrará aquí pero NO se auto-llena al dropdown viejo todavía (Phase 5).</Typography.Text>
                          </div>
                        }
                      />
                    )}

                    {aiFillSummary && (
                      <Alert
                        type="success"
                        showIcon
                        icon={<CheckCircleOutlined />}
                        style={{ marginTop: 8 }}
                        message={`IA lleno ${aiFillSummary.filled.length} de ${aiFillSummary.total} campos`}
                        description={
                          <div style={{ fontSize: 12 }}>
                            {aiFillSummary.filled.length > 0 && (
                              <div>
                                <strong>Llenados:</strong>{' '}
                                {aiFillSummary.filled.map((f) => (
                                  <Tag key={f} color="green" style={{ marginBottom: 2 }}>{f}</Tag>
                                ))}
                              </div>
                            )}
                            {aiFillSummary.skipped.length > 0 && (
                              <div style={{ marginTop: 4 }}>
                                <strong>No determinados:</strong>{' '}
                                {aiFillSummary.skipped.map((f) => (
                                  <Tag key={f} style={{ marginBottom: 2 }}>{f}</Tag>
                                ))}
                              </div>
                            )}
                            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                              Todos los valores llenados por IA son editables — ajusta segun sea necesario.
                            </Typography.Text>
                          </div>
                        }
                      />
                    )}
                  </Card>
                </Col>
              )}
            </Row>

            <Divider style={{ margin: '8px 0' }} />

            {/* -- Clasificacion — trimmed 2026-04-23. Departamento and Tipo de
                   Etiqueta moved up into Detalles del Producto (the canonical
                   home); this section now only carries merchandising facets
                   not yet migrated to the dimensional framework. -- */}
            <Typography.Text strong style={{ fontSize: 13 }}>Clasificacion</Typography.Text>

            <Row gutter={12} style={{ marginTop: 8 }}>
              <Col xs={12} sm={3}>
                <Form.Item label="Temporada" name="seasonId" style={compactItem}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['seasons'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label={aiLabel('Ocasion', 'occasionId', aiFilledFields)} name="occasionId" style={{ ...compactItem, ...(aiFilledFields.has('occasionId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['occasions'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4}>
                <Form.Item label={aiLabel('Género', 'genderId', aiFilledFields)} name="genderId" style={{ ...compactItem, ...(aiFilledFields.has('genderId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['target-audiences'])} />
                </Form.Item>
              </Col>
            </Row>

            <Divider style={{ margin: '8px 0' }} />

            {/* -- Apariencia, Diseno y Materiales — filtered by Product Family.
                   Shoe-specific dims (width, accessory, heel/toe, materials)
                   only render for family=zapatos. See isApparienciaFieldVisible. -- */}
            <Typography.Text strong style={{ fontSize: 13 }}>Apariencia, Diseno y Materiales</Typography.Text>

            <Row gutter={12} style={{ marginTop: 8 }}>
              <Col xs={12} sm={3}>
                <Form.Item label={aiLabel('Color', 'colorId', aiFilledFields)} name="colorId" style={{ ...compactItem, ...(aiFilledFields.has('colorId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Seleccionar" allowClear showSearch optionFilterProp="label" options={refOptions(refData?.['colors'])} />
                </Form.Item>
              </Col>
              {isApparienciaFieldVisible('widthTypeId', selectedFamily) && (
                <Col xs={12} sm={3}>
                  <Form.Item label="Ancho" name="widthTypeId" style={compactItem}>
                    <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['width-types'])} />
                  </Form.Item>
                </Col>
              )}
              <Col xs={12} sm={3}>
                <Form.Item label={aiLabel('Patron', 'patternId', aiFilledFields)} name="patternId" style={{ ...compactItem, ...(aiFilledFields.has('patternId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['patterns'])} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={3}>
                <Form.Item label={aiLabel('Acabado', 'finishId', aiFilledFields)} name="finishId" style={{ ...compactItem, ...(aiFilledFields.has('finishId') ? AI_FILLED_STYLE : {}) }}>
                  <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['finishes'])} />
                </Form.Item>
              </Col>
              {isApparienciaFieldVisible('accessoryId', selectedFamily) && (
                <Col xs={12} sm={3}>
                  <Form.Item label={aiLabel('Accesorio', 'accessoryId', aiFilledFields)} name="accessoryId" style={{ ...compactItem, ...(aiFilledFields.has('accessoryId') ? AI_FILLED_STYLE : {}) }}>
                    <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['accessories'])} />
                  </Form.Item>
                </Col>
              )}
              {isApparienciaFieldVisible('heelHeightId', selectedFamily) && (
                <Col xs={12} sm={3}>
                  <Form.Item label={aiLabel('Altura del Tacon', 'heelHeightId', aiFilledFields)} name="heelHeightId" style={{ ...compactItem, ...(aiFilledFields.has('heelHeightId') ? AI_FILLED_STYLE : {}) }}>
                    <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['heel-heights'])} />
                  </Form.Item>
                </Col>
              )}
              {isApparienciaFieldVisible('heelShapeId', selectedFamily) && (
                <Col xs={12} sm={3}>
                  <Form.Item label={aiLabel('Forma del Tacon', 'heelShapeId', aiFilledFields)} name="heelShapeId" style={{ ...compactItem, ...(aiFilledFields.has('heelShapeId') ? AI_FILLED_STYLE : {}) }}>
                    <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['heel-shapes'])} />
                  </Form.Item>
                </Col>
              )}
              {isApparienciaFieldVisible('toeShapeId', selectedFamily) && (
                <Col xs={12} sm={3}>
                  <Form.Item label={aiLabel('Forma de la Punta', 'toeShapeId', aiFilledFields)} name="toeShapeId" style={{ ...compactItem, ...(aiFilledFields.has('toeShapeId') ? AI_FILLED_STYLE : {}) }}>
                    <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['toe-shapes'])} />
                  </Form.Item>
                </Col>
              )}
            </Row>

            {(isApparienciaFieldVisible('upperMaterialId', selectedFamily)
              || isApparienciaFieldVisible('outsoleMaterialId', selectedFamily)
              || isApparienciaFieldVisible('heelMaterialId', selectedFamily)) && (
              <Row gutter={12}>
                {isApparienciaFieldVisible('upperMaterialId', selectedFamily) && (
                  <Col xs={12} sm={4}>
                    <Form.Item label={aiLabel('Material Superior', 'upperMaterialId', aiFilledFields)} name="upperMaterialId" style={{ ...compactItem, ...(aiFilledFields.has('upperMaterialId') ? AI_FILLED_STYLE : {}) }}>
                      <Select placeholder="Seleccionar" allowClear showSearch optionFilterProp="label" options={refOptions(refData?.['upper-materials'])} />
                    </Form.Item>
                  </Col>
                )}
                {isApparienciaFieldVisible('outsoleMaterialId', selectedFamily) && (
                  <Col xs={12} sm={4}>
                    <Form.Item label={aiLabel('Material de Suela', 'outsoleMaterialId', aiFilledFields)} name="outsoleMaterialId" style={{ ...compactItem, ...(aiFilledFields.has('outsoleMaterialId') ? AI_FILLED_STYLE : {}) }}>
                      <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['outsole-materials'])} />
                    </Form.Item>
                  </Col>
                )}
                {isApparienciaFieldVisible('heelMaterialId', selectedFamily) && (
                  <Col xs={12} sm={4}>
                    <Form.Item label={aiLabel('Material del Tacon', 'heelMaterialId', aiFilledFields)} name="heelMaterialId" style={{ ...compactItem, ...(aiFilledFields.has('heelMaterialId') ? AI_FILLED_STYLE : {}) }}>
                      <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['heel-materials'])} />
                    </Form.Item>
                  </Col>
                )}
              </Row>
            )}

            <Divider style={{ margin: '8px 0' }} />

            {/* -- Codigos — just barcode now (Precio, Costo, Temporada, Palabras Clave moved up) -- */}
            <Typography.Text strong style={{ fontSize: 13 }}>Codigo de Barras</Typography.Text>

            <Row gutter={12} style={{ marginTop: 8 }}>
              <Col xs={24} sm={6}>
                <Form.Item label="Codigo de Barras / UPC" name="barcode" rules={[{ max: 20, message: 'Máximo 20 caracteres (UPC-A/EAN-13 estándar ≤ 13)' }]} style={compactItem}>
                  <Input placeholder="Auto si vacio" maxLength={20} />
                </Form.Item>
              </Col>
            </Row>

            <Divider style={{ margin: '8px 0' }} />

            <Form.Item style={{ marginBottom: 0 }}>
              <Space wrap>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={isSaving && !finalizeMutation.isPending}
                  disabled={isDiscontinued}
                >
                  {isDraft ? 'Guardar borrador' : isEdit ? 'Guardar cambios' : 'Crear borrador'}
                </Button>
                {/*
                  Skip-the-draft path — create (or update) + finalize in one
                  click. Requires the operator to have typed the final SKU
                  code. `handleCreateFinalClick` sets a ref flag that
                  handleSubmit reads to chain into finalize after create/update.
                */}
                {!isDiscontinued && !isActive && (
                  <Button
                    type="primary"
                    style={{ background: '#389e0d', borderColor: '#389e0d' }}
                    icon={<ThunderboltOutlined />}
                    loading={isSaving && finalizeMutation.isPending}
                    onClick={handleCreateFinalClick}
                  >
                    {isDraft ? 'Guardar y finalizar' : 'Crear SKU final (sin borrador)'}
                  </Button>
                )}
                {isDraft && lifecycleSku && (
                  <Button
                    type="primary"
                    style={{ background: '#1677ff', borderColor: '#1677ff' }}
                    icon={<ThunderboltOutlined />}
                    loading={finalizeMutation.isPending}
                    onClick={() => handleFinalize()}
                  >
                    Finalizar SKU
                  </Button>
                )}
                <Button onClick={() => navigate(skuRootPath)}>
                  Cancelar
                </Button>
                {isDiscontinued && (
                  <Tag color="red" style={{ alignSelf: 'center' }}>DISCONTINUADO · solo lectura</Tag>
                )}
              </Space>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </>
  )
}
