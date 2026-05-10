/**
 * Change SKU Attributes — consolidated bulk-edit workbench.
 *
 * Replaces the four previous one-attribute pages (Change Categories, Vendors,
 * Seasons, Group Codes). Same SKU search/select workflow; an "Action" picker
 * at the top of the Apply bar decides which attribute to overwrite. Reduces
 * four near-identical pages to one and lets the operator pivot between
 * attributes mid-flow without losing the selection.
 *
 * Spec: docs/modules/utilities.md, docs/dev/specs/2026-04-21-utilities-batch-change-design.md
 * RICS p. 194.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  Image,
  Input,
  Popconfirm,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { PlayCircleOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { productsSkuApi } from '../../services/productsSkuApi'
import { SkuLink } from '../../components/sku-link'
import {
  useCategories,
  useDepartments,
  useGroups,
  useKeywords,
  useSeasons,
  useSectors,
} from '../../hooks/useProductsTaxonomy'
import { useVendors } from '../../hooks/useProductsVendors'
import {
  useAttributeDimensions,
  useAttributeDimensionsForSkus,
  useAttributeMacroRules,
  useCreateValue,
  useSkuAttributesForSkus,
} from '../../hooks/useProductsAttributes'
import { useApplyBatchChange } from '../../hooks/useUtilities'
import { buildRicsImageUrl } from '../../services/ricsImageUrl'
import type { SkuListFilters } from '../../types/productsSku'
import type { AttributeDimension, AttributeDimensionValue, SkuAttributesBulk } from '../../types/productsAttributes'
import type { Category, Department, Sector } from '../../types/productsTaxonomy'
import type {
  AttributeChange,
  BatchOperationType,
} from '../../services/utilitiesApi'

type CoreActionKind = 'CATEGORY' | 'VENDOR' | 'SEASON' | 'GROUP' | 'KEYWORD_ADD' | 'KEYWORD_REMOVE'
type AttributeMode = 'REPLACE' | 'ADD' | 'REMOVE'
type CoreResultColumnKey =
  | 'thumb'
  | 'sku'
  | 'description'
  | 'vendor'
  | 'vendorSku'
  | 'category'
  | 'department'
  | 'sector'
  | 'styleColor'
  | 'season'
  | 'groupCode'
  | 'sizeType'
  | 'keywords'
  | 'onHand'
  | 'location'
  | 'listPrice'
  | 'retailPrice'
  | 'mdPrice1'
  | 'mdPrice2'
  | 'currentPriceSlot'
  | 'currentCost'
  | 'status'
  | 'manufacturer'
  | 'labelCode'
  | 'colorCode'
  | 'colorLabel'
  | 'longColor'
  | 'dateLastChanged'
  | 'orderMultiple'
  | 'orderUom'

const CORE_RESULT_COLUMN_KEYS: CoreResultColumnKey[] = [
  'thumb',
  'sku',
  'description',
  'vendor',
  'vendorSku',
  'category',
  'department',
  'sector',
  'styleColor',
  'season',
  'groupCode',
  'sizeType',
  'keywords',
  'onHand',
  'location',
  'listPrice',
  'retailPrice',
  'mdPrice1',
  'mdPrice2',
  'currentPriceSlot',
  'currentCost',
  'status',
  'manufacturer',
  'labelCode',
  'colorCode',
  'colorLabel',
  'longColor',
  'dateLastChanged',
  'orderMultiple',
  'orderUom',
]

const DEFAULT_RESULT_COLUMN_KEYS: string[] = [
  'thumb',
  'sku',
  'description',
  'vendor',
  'category',
  'department',
  'styleColor',
  'season',
  'groupCode',
  'sizeType',
  'keywords',
  'onHand',
]

const CORE_RESULT_COLUMN_OPTION_GROUPS = [
  {
    label: 'Common SKU columns',
    options: [
      { value: 'thumb', label: 'Image' },
      { value: 'sku', label: 'SKU', disabled: true },
      { value: 'description', label: 'Description' },
      { value: 'vendor', label: 'Vendor' },
      { value: 'vendorSku', label: 'Vendor SKU' },
      { value: 'category', label: 'Category' },
      { value: 'department', label: 'Department' },
      { value: 'sector', label: 'Sector' },
      { value: 'styleColor', label: 'Style/Color' },
      { value: 'season', label: 'Season' },
      { value: 'groupCode', label: 'Group' },
      { value: 'sizeType', label: 'Size Type' },
      { value: 'keywords', label: 'Keywords' },
      { value: 'onHand', label: 'On Hand' },
    ],
  },
  {
    label: 'Pricing and status',
    options: [
      { value: 'listPrice', label: 'List Price' },
      { value: 'retailPrice', label: 'Retail Price' },
      { value: 'mdPrice1', label: 'Markdown 1' },
      { value: 'mdPrice2', label: 'Markdown 2' },
      { value: 'currentPriceSlot', label: 'Current Price Slot' },
      { value: 'currentCost', label: 'Current Cost' },
      { value: 'status', label: 'Status' },
      { value: 'dateLastChanged', label: 'Date Last Changed' },
    ],
  },
  {
    label: 'Additional SKU fields',
    options: [
      { value: 'location', label: 'Location' },
      { value: 'manufacturer', label: 'Manufacturer' },
      { value: 'labelCode', label: 'Label Code' },
      { value: 'colorCode', label: 'Color Code' },
      { value: 'colorLabel', label: 'Color Label' },
      { value: 'longColor', label: 'Long Color' },
      { value: 'orderMultiple', label: 'Order Multiple' },
      { value: 'orderUom', label: 'Order UOM' },
    ],
  },
]

const REQUIRED_RESULT_COLUMN_KEYS = ['sku']
const ATTRIBUTE_COLUMN_PREFIX = 'ATTR_COL:'
const COLOR_ATTRIBUTE_DIMENSION_CODE = 'color'

const CORE_ACTION_META: Record<CoreActionKind, { label: string; verb: string; opType: BatchOperationType }> = {
  CATEGORY:       { label: 'Category',       verb: 'Move to category',      opType: 'CHANGE_CATEGORY' },
  VENDOR:         { label: 'Vendor',         verb: 'Reassign to vendor',    opType: 'CHANGE_VENDOR' },
  SEASON:         { label: 'Season',         verb: 'Reassign to season',    opType: 'CHANGE_SEASON' },
  GROUP:          { label: 'Group',          verb: 'Reassign to group',     opType: 'CHANGE_GROUP_CODE' },
  KEYWORD_ADD:    { label: 'Keyword add',    verb: 'Add keyword',           opType: 'CHANGE_KEYWORDS_ADD' },
  KEYWORD_REMOVE: { label: 'Keyword remove', verb: 'Remove keyword',        opType: 'CHANGE_KEYWORDS_REMOVE' },
}

const ATTRIBUTE_ACTION_PREFIX = 'ATTR:'

const ATTRIBUTE_VALUE_CODE_PATTERN = /^[a-z0-9][a-z0-9_]*$/

const isUniversalAttributeDimension = (dimension: AttributeDimension) =>
  dimension.familyRules.length === 0

const attributeColumnKey = (dimensionCode: string) => `${ATTRIBUTE_COLUMN_PREFIX}${dimensionCode}`

const formatAmount = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const formatPlainValue = (value: number | string | null | undefined) =>
  value == null || value === '' ? <Typography.Text type="secondary">—</Typography.Text> : value

const uniqueNonBlank = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.map((value) => value?.trim() ?? '').filter(Boolean)))

export function getVisibleColorLabels(
  skuAttributesBulk: SkuAttributesBulk | undefined,
  skuCode: string,
  legacyLongColor: string | null | undefined,
): string[] {
  const colorValues =
    skuAttributesBulk?.bySku[skuCode]?.byDimension[COLOR_ATTRIBUTE_DIMENSION_CODE]?.values ?? []
  const attributeLabels = uniqueNonBlank(
    colorValues.map((value) => value.labelEs || value.code),
  )
  if (attributeLabels.length > 0) return attributeLabels
  return uniqueNonBlank([legacyLongColor])
}

export function getColorLabelSortText(
  skuAttributesBulk: SkuAttributesBulk | undefined,
  skuCode: string,
  legacyLongColor: string | null | undefined,
): string {
  return getVisibleColorLabels(skuAttributesBulk, skuCode, legacyLongColor).join(' ')
}

export interface ResultFamilyScope {
  familyCodes: string[]
  hasUnknownFamily: boolean
}

export function getResultFamilyScope(
  skuCategories: Array<number | null | undefined>,
  categories: Array<Pick<Category, 'number' | 'productFamilyCode'>> | undefined,
): ResultFamilyScope {
  const familyByCategory = new Map((categories ?? []).map((category) => [
    category.number,
    category.productFamilyCode ?? null,
  ]))
  const familyCodes = new Set<string>()
  let hasUnknownFamily = false

  for (const categoryNumber of skuCategories) {
    if (categoryNumber == null) {
      hasUnknownFamily = true
      continue
    }
    const familyCode = familyByCategory.get(categoryNumber) ?? null
    if (familyCode) familyCodes.add(familyCode)
    else hasUnknownFamily = true
  }

  return {
    familyCodes: Array.from(familyCodes).sort(),
    hasUnknownFamily,
  }
}

export function familyScopedDimensionAppliesToAllFamilies(
  dimension: Pick<AttributeDimension, 'familyRules'>,
  familyScope: ResultFamilyScope,
): boolean {
  if (familyScope.hasUnknownFamily || familyScope.familyCodes.length === 0) return false
  const enabledFamilies = new Set(
    dimension.familyRules
      .filter((rule) => rule.enabled)
      .map((rule) => rule.familyCode),
  )
  return familyScope.familyCodes.every((familyCode) => enabledFamilies.has(familyCode))
}

export function getVisibleActionDimensions(
  dimensions: AttributeDimension[],
  hasRun: boolean,
  familyScope: ResultFamilyScope,
): AttributeDimension[] {
  return dimensions.filter((dimension) => {
    if (isUniversalAttributeDimension(dimension)) return true
    if (!hasRun) return true
    return familyScopedDimensionAppliesToAllFamilies(dimension, familyScope)
  })
}

const orderColumnKeys = (keys: string[], orderedKeys: string[]) => {
  const requested = new Set(keys)
  const ordered = orderedKeys.filter((key) => requested.has(key))
  const unknown = keys.filter((key) => !orderedKeys.includes(key))
  return Array.from(new Set([...REQUIRED_RESULT_COLUMN_KEYS, ...ordered, ...unknown]))
}

export default function ChangeSkuAttributesPage() {
  const navigate = useNavigate()
  const { message, notification } = App.useApp()

  // Filter state
  const [q, setQ] = useState('')
  const [departmentNumber, setDepartmentNumber] = useState<number | null>(null)
  const [sectorNumber, setSectorNumber] = useState<number | null>(null)
  const [categoryNumbers, setCategoryNumbers] = useState<number[]>([])
  const [groupCodes, setGroupCodes] = useState<string[]>([])
  const [keywordCodes, setKeywordCodes] = useState<string[]>([])
  const [seasonCodes, setSeasonCodes] = useState<string[]>([])
  const [vendorCodes, setVendorCodes] = useState<string[]>([])
  const [styleColor, setStyleColor] = useState('')
  const [description, setDescription] = useState('')
  const [attributeFilters, setAttributeFilters] = useState<Record<string, string[]>>({})

  // Selection persists across filter/sort changes for bulk ops.
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])

  // Action + per-action target value. Reset all targets when action changes
  // so a stale category target doesn't apply when we switch to vendor.
  const [action, setAction] = useState<string>('CATEGORY')
  const [targetCategory, setTargetCategory] = useState<number | undefined>(undefined)
  const [targetVendor, setTargetVendor] = useState<string | undefined>(undefined)
  const [targetSeason, setTargetSeason] = useState<string | undefined>(undefined)
  const [targetGroup, setTargetGroup] = useState<string | undefined>(undefined)
  const [targetKeyword, setTargetKeyword] = useState<string | undefined>(undefined)
  const [targetAttributeValues, setTargetAttributeValues] = useState<string[]>([])
  const [attributeMode, setAttributeMode] = useState<AttributeMode>('REPLACE')
  const [newAttributeValueCode, setNewAttributeValueCode] = useState('')
  const [newAttributeValueLabel, setNewAttributeValueLabel] = useState('')
  const [localAttributeValues, setLocalAttributeValues] = useState<Record<string, AttributeDimensionValue[]>>({})
  const [visibleResultColumnKeys, setVisibleResultColumnKeys] = useState<string[]>(DEFAULT_RESULT_COLUMN_KEYS)

  const onActionChange = (next: string) => {
    setAction(next)
    setTargetCategory(undefined)
    setTargetVendor(undefined)
    setTargetSeason(undefined)
    setTargetGroup(undefined)
    setTargetKeyword(undefined)
    setTargetAttributeValues([])
    setAttributeMode('REPLACE')
    setNewAttributeValueCode('')
    setNewAttributeValueLabel('')
  }

  // Taxonomy data
  const { data: departments } = useDepartments()
  const { data: sectors } = useSectors()
  const { data: categories, isLoading: categoriesLoading } = useCategories()
  const { data: groups } = useGroups()
  const { data: keywords } = useKeywords()
  const { data: seasons } = useSeasons()
  const { data: vendors } = useVendors()
  const { data: attributeDimensions } = useAttributeDimensions(true)
  const { data: macroRules } = useAttributeMacroRules()
  const createAttributeValue = useCreateValue()

  const sortedAttributeDimensions = useMemo(
    () => [...(attributeDimensions ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.labelEs.localeCompare(b.labelEs)),
    [attributeDimensions],
  )
  const universalAttributeDimensions = useMemo(
    () => sortedAttributeDimensions.filter(isUniversalAttributeDimension),
    [sortedAttributeDimensions],
  )
  const familyAttributeDimensions = useMemo(
    () => sortedAttributeDimensions.filter((dimension) => !isUniversalAttributeDimension(dimension)),
    [sortedAttributeDimensions],
  )

  const derivedDimensionCodes = useMemo(
    () => new Set((macroRules ?? []).map((r) => r.targetDimensionCode)),
    [macroRules],
  )

  const selectedAttributeDimension = useMemo(() => {
    if (!action.startsWith(ATTRIBUTE_ACTION_PREFIX)) return null
    const code = action.slice(ATTRIBUTE_ACTION_PREFIX.length)
    return sortedAttributeDimensions.find((d) => d.code === code) ?? null
  }, [action, sortedAttributeDimensions])

  const selectedAttributeValues = useMemo(() => {
    if (!selectedAttributeDimension) return []
    const byCode = new Map<string, AttributeDimensionValue>()
    for (const value of selectedAttributeDimension.values) byCode.set(value.code, value)
    for (const value of localAttributeValues[selectedAttributeDimension.code] ?? []) {
      byCode.set(value.code, value)
    }
    return Array.from(byCode.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
  }, [localAttributeValues, selectedAttributeDimension])

  // Department → category range
  const deptCategoryRange = useMemo(() => {
    if (departmentNumber == null || !departments) return null
    const d = departments.find((x) => x.number === departmentNumber)
    if (!d) return null
    const out: number[] = []
    for (let c = d.begCateg; c <= d.endCateg; c++) out.push(c)
    return out
  }, [departmentNumber, departments])

  // Sector → departments → category ranges
  const sectorCategoryRange = useMemo(() => {
    if (sectorNumber == null || !sectors || !departments) return null
    const s = sectors.find((x) => x.number === sectorNumber)
    if (!s) return null
    const depts = departments.filter((d) => d.number >= s.begDept && d.number <= s.endDept)
    const out: number[] = []
    for (const d of depts) {
      for (let c = d.begCateg; c <= d.endCateg; c++) out.push(c)
    }
    return out
  }, [sectorNumber, sectors, departments])

  // Hierarchical narrowing: Sector → Departments → Categories
  const availableDepartments = useMemo(() => {
    if (!departments) return []
    if (sectorNumber == null) return departments
    const s = sectors?.find((x) => x.number === sectorNumber)
    if (!s) return departments
    return departments.filter((d) => d.number >= s.begDept && d.number <= s.endDept)
  }, [departments, sectors, sectorNumber])

  const availableCategories = useMemo(() => {
    if (!categories) return []
    const parentRange = new Set<number>()
    if (deptCategoryRange) for (const c of deptCategoryRange) parentRange.add(c)
    else if (sectorCategoryRange) for (const c of sectorCategoryRange) parentRange.add(c)
    if (parentRange.size === 0) return categories
    return categories.filter((c) => parentRange.has(c.number))
  }, [categories, deptCategoryRange, sectorCategoryRange])

  const onSectorChange = (v: number | null) => {
    setSectorNumber(v)
    if (v != null) {
      const s = sectors?.find((x) => x.number === v)
      if (s) {
        if (departmentNumber != null && (departmentNumber < s.begDept || departmentNumber > s.endDept)) {
          setDepartmentNumber(null)
        }
        const validCats = new Set<number>()
        for (const d of departments ?? []) {
          if (d.number >= s.begDept && d.number <= s.endDept) {
            for (let c = d.begCateg; c <= d.endCateg; c++) validCats.add(c)
          }
        }
        setCategoryNumbers((prev) => prev.filter((c) => validCats.has(c)))
      }
    }
  }
  const onDepartmentChange = (v: number | null) => {
    setDepartmentNumber(v)
    if (v != null) {
      const d = departments?.find((x) => x.number === v)
      if (d) {
        setCategoryNumbers((prev) => prev.filter((c) => c >= d.begCateg && c <= d.endCateg))
      }
    }
  }

  // Committed query
  const [activeFilters, setActiveFilters] = useState<SkuListFilters | null>(null)
  const { data: skus, isLoading, isFetching } = useQuery({
    queryKey: ['products-skus', 'list', activeFilters],
    queryFn: () => productsSkuApi.list(activeFilters ?? undefined),
    enabled: activeFilters != null,
    staleTime: 5 * 60_000,
  })

  const apply = useApplyBatchChange()

  // Parallel on-hand totals query
  const hasRun = activeFilters != null
  const skuCodes = useMemo(() => (skus ?? []).map((s) => s.code), [skus])
  const { data: onHandTotals } = useQuery({
    queryKey: ['products-skus', 'on-hand-totals', skuCodes],
    queryFn: () => productsSkuApi.onHandTotals(skuCodes),
    enabled: skuCodes.length > 0,
    staleTime: 5 * 60_000,
  })
  const {
    data: skuAttributesBulk,
    isFetching: isFetchingSkuAttributesBulk,
  } = useSkuAttributesForSkus(hasRun ? skuCodes : [])
  const {
    data: resultAttributeDimensions,
    isFetching: isFetchingResultAttributeDimensions,
  } = useAttributeDimensionsForSkus(hasRun ? skuCodes : [], true)
  const resultFamilyScope = useMemo(
    () => getResultFamilyScope((skus ?? []).map((sku) => sku.category), categories),
    [categories, skus],
  )
  const actionAttributeDimensions = useMemo(
    () => getVisibleActionDimensions(sortedAttributeDimensions, hasRun, resultFamilyScope),
    [hasRun, resultFamilyScope, sortedAttributeDimensions],
  )
  const universalActionAttributeDimensions = useMemo(
    () => actionAttributeDimensions.filter(isUniversalAttributeDimension),
    [actionAttributeDimensions],
  )
  const familyActionAttributeDimensions = useMemo(
    () => actionAttributeDimensions.filter((dimension) => !isUniversalAttributeDimension(dimension)),
    [actionAttributeDimensions],
  )
  const resultUniversalAttributeDimensions = useMemo(
    () => (resultAttributeDimensions ?? []).filter(isUniversalAttributeDimension),
    [resultAttributeDimensions],
  )
  const resultFamilyAttributeDimensions = useMemo(
    () => (resultAttributeDimensions ?? []).filter((dimension) => !isUniversalAttributeDimension(dimension)),
    [resultAttributeDimensions],
  )
  const resultColumnOrder = useMemo(
    () => [
      ...CORE_RESULT_COLUMN_KEYS,
      ...(resultAttributeDimensions ?? []).map((dimension) => attributeColumnKey(dimension.code)),
    ],
    [resultAttributeDimensions],
  )
  const availableResultColumnKeys = useMemo(
    () => new Set(resultColumnOrder),
    [resultColumnOrder],
  )
  const visibleColumnPickerKeys = useMemo(
    () => visibleResultColumnKeys.filter((key) => availableResultColumnKeys.has(key)),
    [availableResultColumnKeys, visibleResultColumnKeys],
  )

  useEffect(() => {
    if (!action.startsWith(ATTRIBUTE_ACTION_PREFIX)) return
    if (hasRun && (skus ?? []).length > 0 && categoriesLoading) return
    const dimensionCode = action.slice(ATTRIBUTE_ACTION_PREFIX.length)
    const dimension = actionAttributeDimensions.find((row) => row.code === dimensionCode)
    if (
      !dimension ||
      derivedDimensionCodes.has(dimensionCode) ||
      (!hasRun && !isUniversalAttributeDimension(dimension))
    ) {
      onActionChange('CATEGORY')
    }
  }, [action, actionAttributeDimensions, categoriesLoading, derivedDimensionCodes, hasRun, skus])

  useEffect(() => {
    if (!hasRun || isFetchingResultAttributeDimensions) return
    setVisibleResultColumnKeys((prev) =>
      orderColumnKeys(prev.filter((key) => availableResultColumnKeys.has(key)), resultColumnOrder),
    )
  }, [availableResultColumnKeys, hasRun, isFetchingResultAttributeDimensions, resultColumnOrder])

  // Dept/Sector rollup
  const deptFor = useMemo(() => {
    return (categoryNum: number | null): Department | null => {
      if (categoryNum == null || !departments) return null
      return (
        departments.find((d) => d.begCateg <= categoryNum && d.endCateg >= categoryNum) ?? null
      )
    }
  }, [departments])

  const sectorFor = useMemo(() => {
    return (deptNum: number | null): Sector | null => {
      if (deptNum == null || !sectors) return null
      return sectors.find((s) => s.begDept <= deptNum && s.endDept >= deptNum) ?? null
    }
  }, [sectors])

  const enriched = useMemo(() => {
    if (!skus) return []
    return skus.map((s) => {
      const d = deptFor(s.category)
      const sec = sectorFor(d?.number ?? null)
      return { ...s, _deptNumber: d?.number ?? null, _sectorNumber: sec?.number ?? null }
    })
  }, [skus, deptFor, sectorFor])

  type EnrichedSku = (typeof enriched)[number]

  const coreColumns = [
    {
      title: '',
      key: 'thumb',
      width: 56,
      onCell: () => ({ style: { padding: 0, verticalAlign: 'middle' as const } }),
      render: (_: unknown, r: EnrichedSku) => {
        if (!r.pictureFileName) {
          return (
            <span
              aria-hidden
              style={{
                display: 'block',
                width: 50,
                height: 50,
                margin: '0 auto',
                border: '1px dashed #e0e0e0',
                borderRadius: 2,
              }}
            />
          )
        }
        const url = buildRicsImageUrl(r.pictureFileName)
        if (!url) {
          return (
            <span
              aria-hidden
              style={{
                display: 'block',
                width: 50,
                height: 50,
                margin: '0 auto',
                border: '1px dashed #e0e0e0',
                borderRadius: 2,
              }}
            />
          )
        }
        return (
          <Image
            src={url}
            alt=""
            loading="lazy"
            style={{
              height: 50,
              width: 'auto',
              maxWidth: 120,
              objectFit: 'contain',
              display: 'block',
              cursor: 'zoom-in',
            }}
            preview={{ mask: false }}
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
            }}
          />
        )
      },
    },
    {
      title: 'SKU',
      dataIndex: 'code',
      key: 'sku',
      width: 140,
      sorter: (a: EnrichedSku, b: EnrichedSku) => a.code.localeCompare(b.code),
      defaultSortOrder: 'ascend' as const,
      render: (_: unknown, r: EnrichedSku) => <SkuLink skuCode={r.code} />,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      sorter: (a: EnrichedSku, b: EnrichedSku) => a.description.localeCompare(b.description),
    },
    {
      title: 'Vendor',
      dataIndex: 'vendor',
      key: 'vendor',
      width: 90,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.vendor ?? '').localeCompare(b.vendor ?? ''),
    },
    {
      title: 'Vendor SKU',
      dataIndex: 'vendorSku',
      key: 'vendorSku',
      width: 130,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.vendorSku ?? '').localeCompare(b.vendorSku ?? ''),
      render: (v: string | null) => formatPlainValue(v),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      align: 'right' as const,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.category ?? 0) - (b.category ?? 0),
    },
    {
      title: 'Department',
      key: 'department',
      width: 180,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a._deptNumber ?? 0) - (b._deptNumber ?? 0),
      render: (_: unknown, r: EnrichedSku) => {
        const d = deptFor(r.category)
        return d ? (
          <Space size={4}>
            <Tag>{d.number}</Tag>
            <span>{d.description}</span>
          </Space>
        ) : r.category != null ? (
          <Typography.Text type="danger">— no dept range</Typography.Text>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )
      },
    },
    {
      title: 'Sector',
      key: 'sector',
      width: 170,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a._sectorNumber ?? 0) - (b._sectorNumber ?? 0),
      render: (_: unknown, r: EnrichedSku) => {
        const sector = sectors?.find((s) => s.number === r._sectorNumber)
        return sector ? (
          <Space size={4}>
            <Tag>{sector.number}</Tag>
            <span>{sector.description}</span>
          </Space>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )
      },
    },
    {
      title: 'Style/Color',
      dataIndex: 'styleColor',
      key: 'styleColor',
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        (a.styleColor ?? '').localeCompare(b.styleColor ?? ''),
    },
    {
      title: 'Season',
      dataIndex: 'season',
      key: 'season',
      width: 90,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.season ?? '').localeCompare(b.season ?? ''),
    },
    {
      title: 'Group',
      dataIndex: 'groupCode',
      key: 'groupCode',
      width: 90,
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        (a.groupCode ?? '').localeCompare(b.groupCode ?? ''),
      render: (v: string | null) =>
        v ? v : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: 'Size Type',
      dataIndex: 'sizeType',
      key: 'sizeType',
      width: 90,
      align: 'right' as const,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.sizeType ?? 0) - (b.sizeType ?? 0),
      render: (v: number | null) =>
        v == null ? <Typography.Text type="secondary">—</Typography.Text> : v,
    },
    {
      title: 'Keywords',
      key: 'keywords',
      render: (_: unknown, r: EnrichedSku) => {
        const kws = r.keywords ?? []
        if (kws.length === 0) return <Typography.Text type="secondary">—</Typography.Text>
        return (
          <Space size={2} wrap>
            {kws.map((k) => (
              <Tag key={k} style={{ marginInlineEnd: 0 }}>
                {k}
              </Tag>
            ))}
          </Space>
        )
      },
    },
    {
      title: 'On Hand',
      key: 'onHand',
      width: 90,
      align: 'right' as const,
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        (onHandTotals?.[a.code] ?? 0) - (onHandTotals?.[b.code] ?? 0),
      render: (_: unknown, r: EnrichedSku) => {
        if (!onHandTotals) return <Typography.Text type="secondary">…</Typography.Text>
        const n = onHandTotals[r.code] ?? 0
        return n === 0 ? (
          <Typography.Text type="secondary">0</Typography.Text>
        ) : (
          n.toLocaleString()
        )
      },
    },
    {
      title: 'Location',
      dataIndex: 'location',
      key: 'location',
      width: 110,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.location ?? '').localeCompare(b.location ?? ''),
      render: (v: string | null) => formatPlainValue(v),
    },
    {
      title: 'List',
      dataIndex: 'listPrice',
      key: 'listPrice',
      width: 100,
      align: 'right' as const,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.listPrice ?? 0) - (b.listPrice ?? 0),
      render: (v: number | null) => formatAmount(v),
    },
    {
      title: 'Retail',
      dataIndex: 'retailPrice',
      key: 'retailPrice',
      width: 100,
      align: 'right' as const,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.retailPrice ?? 0) - (b.retailPrice ?? 0),
      render: (v: number | null) => formatAmount(v),
    },
    {
      title: 'MD1',
      dataIndex: 'mdPrice1',
      key: 'mdPrice1',
      width: 100,
      align: 'right' as const,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.mdPrice1 ?? 0) - (b.mdPrice1 ?? 0),
      render: (v: number | null) => formatAmount(v),
    },
    {
      title: 'MD2',
      dataIndex: 'mdPrice2',
      key: 'mdPrice2',
      width: 100,
      align: 'right' as const,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.mdPrice2 ?? 0) - (b.mdPrice2 ?? 0),
      render: (v: number | null) => formatAmount(v),
    },
    {
      title: 'Price Slot',
      dataIndex: 'currentPriceSlot',
      key: 'currentPriceSlot',
      width: 110,
      sorter: (a: EnrichedSku, b: EnrichedSku) => a.currentPriceSlot.localeCompare(b.currentPriceSlot),
    },
    {
      title: 'Cost',
      dataIndex: 'currentCost',
      key: 'currentCost',
      width: 100,
      align: 'right' as const,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.currentCost ?? 0) - (b.currentCost ?? 0),
      render: (v: number | null) => formatAmount(v),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.status ?? '').localeCompare(b.status ?? ''),
      render: (v: string | null) => formatPlainValue(v),
    },
    {
      title: 'Manufacturer',
      dataIndex: 'manufacturer',
      key: 'manufacturer',
      width: 140,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.manufacturer ?? '').localeCompare(b.manufacturer ?? ''),
      render: (v: string | null) => formatPlainValue(v),
    },
    {
      title: 'Label',
      dataIndex: 'labelCode',
      key: 'labelCode',
      width: 100,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.labelCode ?? '').localeCompare(b.labelCode ?? ''),
      render: (v: string | null) => formatPlainValue(v),
    },
    {
      title: 'Color Code',
      dataIndex: 'colorCode',
      key: 'colorCode',
      width: 110,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.colorCode ?? '').localeCompare(b.colorCode ?? ''),
      render: (v: string | null) => formatPlainValue(v),
    },
    {
      title: 'Color Label',
      key: 'colorLabel',
      width: 160,
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        getColorLabelSortText(skuAttributesBulk, a.code, a.longColor).localeCompare(
          getColorLabelSortText(skuAttributesBulk, b.code, b.longColor),
        ),
      render: (_: unknown, r: EnrichedSku) => {
        const colorValues =
          skuAttributesBulk?.bySku[r.code]?.byDimension[COLOR_ATTRIBUTE_DIMENSION_CODE]?.values ?? []
        if (colorValues.length > 0) {
          return (
            <Space size={2} wrap>
              {colorValues.map((value) => (
                <Tooltip key={value.code} title={`Code: ${value.code}`}>
                  <Tag style={{ marginInlineEnd: 0 }}>{value.labelEs || value.code}</Tag>
                </Tooltip>
              ))}
            </Space>
          )
        }
        const labels = getVisibleColorLabels(skuAttributesBulk, r.code, r.longColor)
        if (labels.length > 0) return labels.join(', ')
        return isFetchingSkuAttributesBulk ? (
          <Typography.Text type="secondary">…</Typography.Text>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )
      },
    },
    {
      title: 'Long Color',
      dataIndex: 'longColor',
      key: 'longColor',
      width: 150,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.longColor ?? '').localeCompare(b.longColor ?? ''),
      render: (v: string | null) => formatPlainValue(v),
    },
    {
      title: 'Changed',
      dataIndex: 'dateLastChanged',
      key: 'dateLastChanged',
      width: 130,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.dateLastChanged ?? '').localeCompare(b.dateLastChanged ?? ''),
      render: (v: string | null) => formatPlainValue(v ? v.slice(0, 10) : null),
    },
    {
      title: 'Order Mult.',
      dataIndex: 'orderMultiple',
      key: 'orderMultiple',
      width: 110,
      align: 'right' as const,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.orderMultiple ?? 0) - (b.orderMultiple ?? 0),
      render: (v: number | null) => formatPlainValue(v),
    },
    {
      title: 'Order UOM',
      dataIndex: 'orderUom',
      key: 'orderUom',
      width: 110,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.orderUom ?? '').localeCompare(b.orderUom ?? ''),
      render: (v: string | null) => formatPlainValue(v),
    },
  ]

  const attributeColumns = (resultAttributeDimensions ?? [])
    .filter((dimension) => visibleResultColumnKeys.includes(attributeColumnKey(dimension.code)))
    .map((dimension) => ({
      title: dimension.labelEs,
      key: attributeColumnKey(dimension.code),
      width: 180,
      sorter: (a: EnrichedSku, b: EnrichedSku) => {
        const aValues = skuAttributesBulk?.bySku[a.code]?.byDimension[dimension.code]?.values ?? []
        const bValues = skuAttributesBulk?.bySku[b.code]?.byDimension[dimension.code]?.values ?? []
        return aValues.map((v) => v.code).join(',').localeCompare(bValues.map((v) => v.code).join(','))
      },
      render: (_: unknown, r: EnrichedSku) => {
        const values = skuAttributesBulk?.bySku[r.code]?.byDimension[dimension.code]?.values ?? []
        if (values.length === 0) {
          return isFetchingSkuAttributesBulk ? (
            <Typography.Text type="secondary">…</Typography.Text>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          )
        }
        return (
          <Space size={2} wrap>
            {values.map((value) => (
              <Tooltip key={value.code} title={value.labelEs}>
                <Tag style={{ marginInlineEnd: 0 }}>{value.code}</Tag>
              </Tooltip>
            ))}
          </Space>
        )
      },
    }))

  const columns = [
    ...coreColumns.filter((column) => visibleResultColumnKeys.includes(String(column.key))),
    ...attributeColumns,
  ]
  const fitToWidthColumns = columns.map((column) => {
    const key = String(column.key ?? '')
    if (key === 'thumb') return { ...column, width: 52 }
    if (key === 'sku') return { ...column, width: 112, ellipsis: true }
    return { ...column, width: undefined, ellipsis: true }
  })

  const cleanAttributeFilters = (): Record<string, string[]> | undefined => {
    const entries = Object.entries(attributeFilters)
      .map(([code, values]) => [code, values.filter(Boolean)] as const)
      .filter(([, values]) => values.length > 0)
    return entries.length > 0 ? Object.fromEntries(entries) : undefined
  }

  const setAttributeFilterValues = (dimensionCode: string, values: string[]) => {
    setAttributeFilters((prev) => {
      const next = { ...prev }
      if (values.length === 0) delete next[dimensionCode]
      else next[dimensionCode] = values
      return next
    })
  }

  const buildFilters = (): SkuListFilters => ({
    sku: q.trim() || undefined,
    vendors: vendorCodes.length > 0 ? vendorCodes : undefined,
    sectors: sectorNumber != null ? [sectorNumber] : undefined,
    departments: departmentNumber != null ? [departmentNumber] : undefined,
    categories: categoryNumbers.length > 0 ? categoryNumbers : undefined,
    seasons: seasonCodes.length > 0 ? seasonCodes : undefined,
    groups: groupCodes.length > 0 ? groupCodes : undefined,
    keywords: keywordCodes.length > 0 ? keywordCodes : undefined,
    styleColor: styleColor.trim() || undefined,
    description: description.trim() || undefined,
    attributes: cleanAttributeFilters(),
  })

  const runQuery = () => setActiveFilters(buildFilters())

  const clearFilters = () => {
    setQ('')
    setDepartmentNumber(null)
    setSectorNumber(null)
    setCategoryNumbers([])
    setGroupCodes([])
    setKeywordCodes([])
    setSeasonCodes([])
    setVendorCodes([])
    setStyleColor('')
    setDescription('')
    setAttributeFilters({})
  }

  const anyFilterSet =
    q.trim().length > 0 ||
    departmentNumber != null ||
    sectorNumber != null ||
    categoryNumbers.length > 0 ||
    groupCodes.length > 0 ||
    keywordCodes.length > 0 ||
    seasonCodes.length > 0 ||
    vendorCodes.length > 0 ||
    styleColor.trim().length > 0 ||
    description.trim().length > 0 ||
    Object.values(attributeFilters).some((values) => values.length > 0)

  const selectAllVisible = () => {
    const visible = enriched.map((r) => r.code)
    const merged = Array.from(new Set([...selectedCodes, ...visible]))
    setSelectedCodes(merged)
  }

  // ─────────── action helpers ───────────

  /** Returns the currently-set target value for the active action (null/undefined if blank). */
  const currentTarget = (): number | string | string[] | undefined => {
    if (selectedAttributeDimension) return targetAttributeValues
    switch (action) {
      case 'CATEGORY': return targetCategory
      case 'VENDOR':   return targetVendor
      case 'SEASON':   return targetSeason
      case 'GROUP':    return targetGroup
      case 'KEYWORD_ADD':
      case 'KEYWORD_REMOVE':
        return targetKeyword
    }
  }

  /** Build the AttributeChange payload from action + target. Returns null if invalid. */
  const buildChange = (): AttributeChange | null => {
    if (selectedAttributeDimension) {
      const mode = selectedAttributeDimension.isMultiValue ? attributeMode : 'REPLACE'
      return targetAttributeValues.length > 0
        ? {
            type: 'CHANGE_SKU_ATTRIBUTE',
            dimensionCode: selectedAttributeDimension.code,
            valueCodes: targetAttributeValues,
            mode,
          }
        : null
    }
    switch (action) {
      case 'CATEGORY': return targetCategory != null ? { type: 'CHANGE_CATEGORY', category: targetCategory } : null
      case 'VENDOR':   return targetVendor ? { type: 'CHANGE_VENDOR', vendor: targetVendor } : null
      case 'SEASON':   return targetSeason ? { type: 'CHANGE_SEASON', season: targetSeason } : null
      case 'GROUP':    return targetGroup ? { type: 'CHANGE_GROUP_CODE', groupCode: targetGroup } : null
      case 'KEYWORD_ADD': return targetKeyword ? { type: 'CHANGE_KEYWORDS_ADD', keyword: targetKeyword } : null
      case 'KEYWORD_REMOVE': return targetKeyword ? { type: 'CHANGE_KEYWORDS_REMOVE', keyword: targetKeyword } : null
    }
    return null
  }

  const currentTargetValue = currentTarget()
  const targetReady = Array.isArray(currentTargetValue)
    ? currentTargetValue.length > 0
    : currentTargetValue != null && currentTargetValue !== ''
  const meta = selectedAttributeDimension
    ? {
        label: selectedAttributeDimension.labelEs,
        verb: selectedAttributeDimension.isMultiValue
          ? `${attributeMode.toLowerCase()} ${selectedAttributeDimension.labelEs}`
          : `Set ${selectedAttributeDimension.labelEs}`,
        opType: 'CHANGE_SKU_ATTRIBUTE' as BatchOperationType,
      }
    : CORE_ACTION_META[action as CoreActionKind]
      ?? CORE_ACTION_META.CATEGORY
  const attributeActionDisabledReason = (dimension: AttributeDimension) => {
    if (derivedDimensionCodes.has(dimension.code)) {
      return 'Derived from another attribute; query is allowed but manual bulk change is disabled.'
    }
    if (!hasRun && !isUniversalAttributeDimension(dimension)) {
      return 'Run a SKU query to determine which product families are in scope.'
    }
    return null
  }

  const buildAttributeActionOptions = (dimensions: AttributeDimension[]) =>
    dimensions.map((dimension) => {
        const disabledReason = attributeActionDisabledReason(dimension)
        return {
          value: `${ATTRIBUTE_ACTION_PREFIX}${dimension.code}`,
          disabled: Boolean(disabledReason),
          label: dimension.labelEs,
          title: disabledReason ?? undefined,
        }
      })
  const attributeActionOptionGroups = actionAttributeDimensions.length > 0
    ? [
        ...(universalActionAttributeDimensions.length > 0
          ? [{ label: 'Universal dimensions', options: buildAttributeActionOptions(universalActionAttributeDimensions) }]
          : []),
        ...(familyActionAttributeDimensions.length > 0
          ? [{ label: 'Family dimensions', options: buildAttributeActionOptions(familyActionAttributeDimensions) }]
          : []),
      ]
    : [
        {
          label: 'Extended attributes',
          options: [
            {
              value: '__NO_RESULT_ATTRIBUTES__',
              disabled: true,
              label: sortedAttributeDimensions.length === 0
                ? 'No extended attributes'
                : 'No assignable attributes for current result families',
            },
          ],
        },
      ]

  const resultAttributeColumnOptionGroups = hasRun
    ? [
        ...(resultUniversalAttributeDimensions.length > 0
          ? [
              {
                label: 'Universal attribute columns',
                options: resultUniversalAttributeDimensions.map((dimension) => ({
                  value: attributeColumnKey(dimension.code),
                  label: dimension.labelEs,
                })),
              },
            ]
          : []),
        ...(resultFamilyAttributeDimensions.length > 0
          ? [
              {
                label: 'Family attribute columns',
                options: resultFamilyAttributeDimensions.map((dimension) => ({
                  value: attributeColumnKey(dimension.code),
                  label: dimension.labelEs,
                })),
              },
            ]
          : []),
      ]
    : []
  const resultColumnOptionGroups = [
    ...CORE_RESULT_COLUMN_OPTION_GROUPS,
    ...resultAttributeColumnOptionGroups,
  ]

  const setVisibleResultColumns = (keys: string[]) => {
    setVisibleResultColumnKeys(orderColumnKeys(keys, resultColumnOrder))
  }

  const resetResultColumns = () => {
    setVisibleResultColumnKeys(orderColumnKeys(DEFAULT_RESULT_COLUMN_KEYS, resultColumnOrder))
  }

  const applyChange = async () => {
    if (selectedCodes.length === 0) {
      message.warning('Select at least one SKU.')
      return
    }
    const change = buildChange()
    if (!change) {
      message.warning(`Pick a target ${meta.label.toLowerCase()}.`)
      return
    }
    try {
      const result = await apply.mutateAsync({
        operationType: meta.opType,
        criteria: { skus: selectedCodes },
        change,
      })
      if (result.affectedCount === 0) {
        message.info('No SKUs matched — nothing changed.')
        return
      }
      const targetDisplay =
        selectedAttributeDimension
          ? `${selectedAttributeDimension.labelEs}: ${targetAttributeValues.join(', ')}`
          : action === 'CATEGORY' ? `category ${targetCategory}`
          : action === 'VENDOR' ? `vendor ${targetVendor}`
          : action === 'SEASON' ? `season ${targetSeason}`
          : action === 'GROUP' ? `group ${targetGroup}`
          : action === 'KEYWORD_ADD' ? `keyword ${targetKeyword}`
          : `without keyword ${targetKeyword}`
      notification.success({
        message: `Reassigned ${result.affectedCount} SKU${result.affectedCount === 1 ? '' : 's'} to ${targetDisplay}`,
        description: result.batchId && (
          <a href={`/utilities/batch-history/${result.batchId}`}>View batch / Undo</a>
        ),
        duration: 30,
      })
      setSelectedCodes([])
      setTargetCategory(undefined)
      setTargetVendor(undefined)
      setTargetSeason(undefined)
      setTargetGroup(undefined)
      setTargetKeyword(undefined)
      setTargetAttributeValues([])
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const isRunning = isLoading || isFetching
  const resultCount = enriched.length

  const createAndSelectAttributeValue = async () => {
    if (!selectedAttributeDimension) return
    const code = newAttributeValueCode.trim()
    const labelEs = newAttributeValueLabel.trim()
    if (!code || !labelEs) {
      message.warning('Enter a code and label for the new value.')
      return
    }
    if (!ATTRIBUTE_VALUE_CODE_PATTERN.test(code)) {
      message.warning('Use lowercase letters, digits, and underscores for the value code.')
      return
    }
    if (selectedAttributeValues.some((value) => value.code === code)) {
      message.warning(`Value '${code}' already exists in ${selectedAttributeDimension.labelEs}.`)
      return
    }

    const nextSortOrder = Math.max(0, ...selectedAttributeValues.map((value) => value.sortOrder)) + 10
    try {
      const created = await createAttributeValue.mutateAsync({
        dimensionCode: selectedAttributeDimension.code,
        input: {
          code,
          labelEs,
          descriptionEs: null,
          sortOrder: nextSortOrder,
        },
      })
      setLocalAttributeValues((prev) => ({
        ...prev,
        [selectedAttributeDimension.code]: [
          ...(prev[selectedAttributeDimension.code] ?? []),
          created,
        ],
      }))
      setTargetAttributeValues((prev) => {
        if (!selectedAttributeDimension.isMultiValue) return [created.code]
        return Array.from(new Set([...prev, created.code]))
      })
      setNewAttributeValueCode('')
      setNewAttributeValueLabel('')
      message.success(`Value '${created.code}' created and selected.`)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  // Target value field — single component depending on action.
  const renderTargetField = () => {
    if (selectedAttributeDimension) {
      const activeValues = selectedAttributeValues.filter((v) => v.isActive)
      return (
        <Space wrap>
          {selectedAttributeDimension.isMultiValue ? (
            <Radio.Group
              value={attributeMode}
              onChange={(e) => setAttributeMode(e.target.value as AttributeMode)}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="REPLACE">Replace</Radio.Button>
              <Radio.Button value="ADD">Add</Radio.Button>
              <Radio.Button value="REMOVE">Remove</Radio.Button>
            </Radio.Group>
          ) : null}
          <Select<string | string[]>
            mode={selectedAttributeDimension.isMultiValue ? 'multiple' : undefined}
            placeholder={`Target ${selectedAttributeDimension.labelEs}`}
            value={
              selectedAttributeDimension.isMultiValue
                ? targetAttributeValues
                : targetAttributeValues[0]
            }
            options={activeValues.map((v) => ({
              value: v.code,
              label: `${v.code} - ${v.labelEs}${v.skuCount != null ? ` (${v.skuCount.toLocaleString()})` : ''}`,
            }))}
            onChange={(value) => {
              if (Array.isArray(value)) setTargetAttributeValues(value)
              else setTargetAttributeValues(value ? [value] : [])
            }}
            allowClear
            showSearch
            style={{ minWidth: selectedAttributeDimension.isMultiValue ? 340 : 280 }}
            maxTagCount={2}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
          {attributeMode !== 'REMOVE' ? (
            <>
              <Input
                placeholder="New value code"
                value={newAttributeValueCode}
                onChange={(e) => setNewAttributeValueCode(e.target.value.trim().toLowerCase())}
                onPressEnter={createAndSelectAttributeValue}
                style={{ width: 160 }}
              />
              <Input
                placeholder="New value label"
                value={newAttributeValueLabel}
                onChange={(e) => setNewAttributeValueLabel(e.target.value)}
                onPressEnter={createAndSelectAttributeValue}
                style={{ width: 220 }}
              />
              <Tooltip title="Create this attribute value and select it for the pending change.">
                <Button
                  icon={<PlusOutlined />}
                  onClick={createAndSelectAttributeValue}
                  loading={createAttributeValue.isPending}
                  disabled={!newAttributeValueCode.trim() || !newAttributeValueLabel.trim()}
                >
                  Create value
                </Button>
              </Tooltip>
            </>
          ) : null}
        </Space>
      )
    }
    switch (action) {
      case 'CATEGORY':
        return (
          <Select<number>
            placeholder="Target category"
            value={targetCategory}
            options={(categories ?? []).map((c) => ({
              value: c.number,
              label: `${c.number} — ${c.description}`,
            }))}
            onChange={setTargetCategory}
            allowClear
            showSearch
            style={{ minWidth: 280 }}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
        )
      case 'VENDOR':
        return (
          <Select<string>
            placeholder="Target vendor"
            value={targetVendor}
            options={(vendors ?? []).map((v) => ({
              value: v.code,
              label: `${v.code} — ${v.name}`,
            }))}
            onChange={setTargetVendor}
            allowClear
            showSearch
            style={{ minWidth: 280 }}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
        )
      case 'SEASON':
        return (
          <Select<string>
            placeholder="Target season"
            value={targetSeason}
            options={(seasons ?? []).map((s) => ({
              value: s.code,
              label: `${s.code} — ${s.description}`,
            }))}
            onChange={setTargetSeason}
            allowClear
            showSearch
            style={{ minWidth: 240 }}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
        )
      case 'GROUP':
        return (
          <Select<string>
            placeholder="Target group"
            value={targetGroup}
            options={(groups ?? []).map((g) => ({
              value: g.code,
              label: `${g.code} — ${g.description}`,
            }))}
            onChange={setTargetGroup}
            allowClear
            showSearch
            style={{ minWidth: 240 }}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
        )
      case 'KEYWORD_ADD':
      case 'KEYWORD_REMOVE':
        return (
          <Select<string>
            placeholder="Target keyword"
            value={targetKeyword}
            options={(keywords ?? []).map((k) => ({
              value: k.keyword,
              label: k.description ? `${k.keyword} - ${k.description}` : k.keyword,
            }))}
            onChange={setTargetKeyword}
            allowClear
            showSearch
            style={{ minWidth: 260 }}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
        )
    }
  }

  const attributeValueOptions = (dimension: AttributeDimension) =>
    dimension.values
      .filter((v) => v.isActive)
      .map((v) => ({
        value: v.code,
        label: `${v.code} - ${v.labelEs}${v.skuCount != null ? ` (${v.skuCount.toLocaleString()})` : ''}`,
      }))

  const renderMerchandiseFilters = () => (
    <Space wrap size={8}>
      <Input
        placeholder="SKU (ABC*, *123, AB*12)"
        prefix={<SearchOutlined />}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onPressEnter={runQuery}
        allowClear
        style={{ width: 240 }}
      />
      <Select
        placeholder="Sector"
        value={sectorNumber ?? undefined}
        onChange={(v) => onSectorChange(typeof v === 'number' ? v : null)}
        allowClear
        showSearch
        style={{ minWidth: 200 }}
        options={(sectors ?? []).map((s) => ({
          value: s.number,
          label: `${s.number} - ${s.description}`,
        }))}
        filterOption={(input, option) =>
          (option?.label as string).toLowerCase().includes(input.toLowerCase())
        }
      />
      <Select
        placeholder={
          sectorNumber != null
            ? `Department (${availableDepartments.length} in sector)`
            : 'Department'
        }
        value={departmentNumber ?? undefined}
        onChange={(v) => onDepartmentChange(typeof v === 'number' ? v : null)}
        allowClear
        showSearch
        style={{ minWidth: 240 }}
        options={availableDepartments.map((d) => ({
          value: d.number,
          label: `${d.number} - ${d.description}`,
        }))}
        filterOption={(input, option) =>
          (option?.label as string).toLowerCase().includes(input.toLowerCase())
        }
      />
      <Select
        mode="multiple"
        placeholder={
          departmentNumber != null || sectorNumber != null
            ? `Category (${availableCategories.length} in scope)`
            : 'Category'
        }
        value={categoryNumbers}
        onChange={setCategoryNumbers}
        allowClear
        style={{ minWidth: 280 }}
        maxTagCount={2}
        options={availableCategories.map((c) => ({
          value: c.number,
          label: `${c.number} - ${c.description}`,
        }))}
        filterOption={(input, option) =>
          (option?.label as string).toLowerCase().includes(input.toLowerCase())
        }
      />
    </Space>
  )

  const renderCoreFilters = () => (
    <Space wrap size={8}>
      <Select
        mode="multiple"
        placeholder="Vendor"
        value={vendorCodes}
        onChange={setVendorCodes}
        allowClear
        style={{ minWidth: 260 }}
        maxTagCount={2}
        showSearch
        options={(vendors ?? []).map((v) => ({
          value: v.code,
          label: `${v.code} - ${v.name}`,
        }))}
        filterOption={(input, option) =>
          (option?.label as string).toLowerCase().includes(input.toLowerCase())
        }
      />
      <Select
        mode="multiple"
        placeholder="Season"
        value={seasonCodes}
        onChange={setSeasonCodes}
        allowClear
        style={{ minWidth: 200 }}
        maxTagCount={2}
        options={(seasons ?? []).map((s) => ({
          value: s.code,
          label: `${s.code} - ${s.description}`,
        }))}
      />
      <Select
        mode="multiple"
        placeholder="Group"
        value={groupCodes}
        onChange={setGroupCodes}
        allowClear
        style={{ minWidth: 220 }}
        maxTagCount={2}
        options={(groups ?? []).map((g) => ({
          value: g.code,
          label: `${g.code} - ${g.description}`,
        }))}
        filterOption={(input, option) =>
          (option?.label as string).toLowerCase().includes(input.toLowerCase())
        }
      />
      <Select
        mode="multiple"
        placeholder="Keyword"
        value={keywordCodes}
        onChange={setKeywordCodes}
        allowClear
        style={{ minWidth: 220 }}
        maxTagCount={2}
        options={(keywords ?? []).map((k) => ({
          value: k.keyword,
          label: k.description ? `${k.keyword} - ${k.description}` : k.keyword,
        }))}
        filterOption={(input, option) =>
          (option?.label as string).toLowerCase().includes(input.toLowerCase())
        }
      />
      <Input
        placeholder="Style/Color contains..."
        value={styleColor}
        onChange={(e) => setStyleColor(e.target.value)}
        onPressEnter={runQuery}
        allowClear
        style={{ width: 200 }}
      />
      <Tooltip title="Description match with optional asterisks. Examples: BOOT (contains), BOOT* (starts with), *BOOT (ends with), BOOT*CUERO (starts BOOT ends CUERO).">
        <Input
          placeholder="Description (BOOT*, *CUERO, BO*RO)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onPressEnter={runQuery}
          allowClear
          style={{ width: 260 }}
        />
      </Tooltip>
    </Space>
  )

  const renderAttributeFilterGroup = (label: string, dimensions: AttributeDimension[]) => {
    if (dimensions.length === 0) return null
    return (
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Typography.Text type="secondary" strong>{label}</Typography.Text>
        <Space wrap size={8}>
          {dimensions.map((dimension) => (
            <Select
              key={dimension.code}
              mode="multiple"
              placeholder={dimension.labelEs}
              value={attributeFilters[dimension.code] ?? []}
              onChange={(values) => setAttributeFilterValues(dimension.code, values)}
              allowClear
              showSearch
              style={{ minWidth: 250 }}
              maxTagCount={1}
              options={attributeValueOptions(dimension)}
              filterOption={(input, option) =>
                (option?.label as string).toLowerCase().includes(input.toLowerCase())
              }
            />
          ))}
        </Space>
      </Space>
    )
  }

  const renderExtendedFilters = () => (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {renderAttributeFilterGroup('Universal dimensions', universalAttributeDimensions)}
      {renderAttributeFilterGroup('Family dimensions', familyAttributeDimensions)}
      {sortedAttributeDimensions.length === 0 ? (
        <Typography.Text type="secondary">No extended attributes are available.</Typography.Text>
      ) : null}
    </Space>
  )

  const renderResultColumnControls = () => {
    if (!hasRun) return null
    return (
      <Space wrap size={8}>
        <Typography.Text type="secondary">Result columns</Typography.Text>
        <Select
          mode="multiple"
          value={visibleColumnPickerKeys}
          onChange={setVisibleResultColumns}
          options={resultColumnOptionGroups}
          optionFilterProp="label"
          maxTagCount="responsive"
          style={{ minWidth: 420, maxWidth: 760 }}
        />
        <Button size="small" onClick={resetResultColumns}>
          Reset columns
        </Button>
        {isFetchingSkuAttributesBulk ? (
          <Typography.Text type="secondary">Loading attribute columns…</Typography.Text>
        ) : null}
      </Space>
    )
  }

  const renderFilterSummary = () => {
    if (!anyFilterSet) return null
    return (
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Space wrap size={4}>
          <Typography.Text type="secondary">Merchandise</Typography.Text>
          {q.trim() ? <Tag closable onClose={() => setQ('')}>SKU: {q.trim()}</Tag> : null}
          {sectorNumber != null ? <Tag closable onClose={() => setSectorNumber(null)}>Sector: {sectorNumber}</Tag> : null}
          {departmentNumber != null ? <Tag closable onClose={() => setDepartmentNumber(null)}>Department: {departmentNumber}</Tag> : null}
          {categoryNumbers.map((n) => (
            <Tag key={`cat-${n}`} closable onClose={() => setCategoryNumbers((prev) => prev.filter((x) => x !== n))}>
              Category: {n}
            </Tag>
          ))}
        </Space>
        <Space wrap size={4}>
          <Typography.Text type="secondary">Core</Typography.Text>
          {vendorCodes.map((code) => <Tag key={`vendor-${code}`} closable onClose={() => setVendorCodes((prev) => prev.filter((x) => x !== code))}>Vendor: {code}</Tag>)}
          {seasonCodes.map((code) => <Tag key={`season-${code}`} closable onClose={() => setSeasonCodes((prev) => prev.filter((x) => x !== code))}>Season: {code}</Tag>)}
          {groupCodes.map((code) => <Tag key={`group-${code}`} closable onClose={() => setGroupCodes((prev) => prev.filter((x) => x !== code))}>Group: {code}</Tag>)}
          {keywordCodes.map((code) => <Tag key={`keyword-${code}`} closable onClose={() => setKeywordCodes((prev) => prev.filter((x) => x !== code))}>Keyword: {code}</Tag>)}
          {styleColor.trim() ? <Tag closable onClose={() => setStyleColor('')}>Style/Color: {styleColor.trim()}</Tag> : null}
          {description.trim() ? <Tag closable onClose={() => setDescription('')}>Description: {description.trim()}</Tag> : null}
        </Space>
        <Space wrap size={4}>
          <Typography.Text type="secondary">Extended</Typography.Text>
          {Object.entries(attributeFilters).flatMap(([dimensionCode, values]) => {
            const dimension = sortedAttributeDimensions.find((d) => d.code === dimensionCode)
            return values.map((value) => (
              <Tag
                key={`attr-${dimensionCode}-${value}`}
                closable
                onClose={() =>
                  setAttributeFilterValues(dimensionCode, values.filter((v) => v !== value))
                }
              >
                {(dimension?.labelEs ?? dimensionCode)}: {value}
              </Tag>
            ))
          })}
        </Space>
      </Space>
    )
  }

  return (
    <Card
      title={
        <Space>
          <Typography.Text strong>Change SKU Attributes</Typography.Text>
          {hasRun && !isRunning ? (
            <Typography.Text type="secondary">
              {resultCount.toLocaleString()} result{resultCount === 1 ? '' : 's'}
            </Typography.Text>
          ) : null}
        </Space>
      }
      extra={
        <Space>
          <Button onClick={() => navigate('/utilities')}>Back to Utilities</Button>
          <Button onClick={() => navigate('/utilities/batch-history')}>Batch History</Button>
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Search SKUs → select the ones you want to change → pick the action and target
          → Apply. Reversible via Batch History. <Typography.Text type="secondary">RICS p. 194.</Typography.Text>
        </Typography.Paragraph>

        <Collapse
          size="small"
          defaultActiveKey={['merchandise', 'core', 'extended']}
          items={[
            {
              key: 'merchandise',
              label: 'Merchandise hierarchy',
              children: renderMerchandiseFilters(),
            },
            {
              key: 'core',
              label: 'Core SKU fields',
              children: renderCoreFilters(),
            },
            {
              key: 'extended',
              label: 'Extended attributes',
              children: renderExtendedFilters(),
            },
          ]}
        />

        {renderFilterSummary()}

        {/* Legacy filter bar kept hidden while the grouped controls own the UI. */}
        <Space wrap size={8} style={{ display: 'none' }}>
          <Input
            placeholder="SKU (ABC*, *123, AB*12)"
            prefix={<SearchOutlined />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onPressEnter={runQuery}
            allowClear
            style={{ width: 240 }}
          />
          <Select
            placeholder="Sector"
            value={sectorNumber ?? undefined}
            onChange={(v) => onSectorChange(typeof v === 'number' ? v : null)}
            allowClear
            showSearch
            style={{ minWidth: 200 }}
            options={(sectors ?? []).map((s) => ({
              value: s.number,
              label: `${s.number} — ${s.description}`,
            }))}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
          <Select
            placeholder={
              sectorNumber != null
                ? `Department (${availableDepartments.length} in sector)`
                : 'Department'
            }
            value={departmentNumber ?? undefined}
            onChange={(v) => onDepartmentChange(typeof v === 'number' ? v : null)}
            allowClear
            showSearch
            style={{ minWidth: 240 }}
            options={availableDepartments.map((d) => ({
              value: d.number,
              label: `${d.number} — ${d.description}`,
            }))}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
          <Select
            mode="multiple"
            placeholder={
              departmentNumber != null || sectorNumber != null
                ? `Category (${availableCategories.length} in scope)`
                : 'Category'
            }
            value={categoryNumbers}
            onChange={setCategoryNumbers}
            allowClear
            style={{ minWidth: 280 }}
            maxTagCount={2}
            options={availableCategories.map((c) => ({
              value: c.number,
              label: `${c.number} — ${c.description}`,
            }))}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
          <Select
            mode="multiple"
            placeholder="Group"
            value={groupCodes}
            onChange={setGroupCodes}
            allowClear
            style={{ minWidth: 220 }}
            maxTagCount={2}
            options={(groups ?? []).map((g) => ({
              value: g.code,
              label: `${g.code} — ${g.description}`,
            }))}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
          <Select
            mode="multiple"
            placeholder="Keyword"
            value={keywordCodes}
            onChange={setKeywordCodes}
            allowClear
            style={{ minWidth: 220 }}
            maxTagCount={2}
            options={(keywords ?? []).map((k) => ({
              value: k.keyword,
              label: k.description ? `${k.keyword} — ${k.description}` : k.keyword,
            }))}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
          <Select
            mode="multiple"
            placeholder="Season"
            value={seasonCodes}
            onChange={setSeasonCodes}
            allowClear
            style={{ minWidth: 200 }}
            maxTagCount={2}
            options={(seasons ?? []).map((s) => ({
              value: s.code,
              label: `${s.code} — ${s.description}`,
            }))}
          />
          <Select
            mode="multiple"
            placeholder="Vendor"
            value={vendorCodes}
            onChange={setVendorCodes}
            allowClear
            style={{ minWidth: 260 }}
            maxTagCount={2}
            showSearch
            options={(vendors ?? []).map((v) => ({
              value: v.code,
              label: `${v.code} — ${v.name}`,
            }))}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
          <Input
            placeholder="Style/Color contains…"
            value={styleColor}
            onChange={(e) => setStyleColor(e.target.value)}
            onPressEnter={runQuery}
            allowClear
            style={{ width: 200 }}
          />
          <Tooltip title="Description match with optional asterisks. Examples: BOOT (contains), BOOT* (starts with), *BOOT (ends with), BOOT*CUERO (starts BOOT ends CUERO).">
            <Input
              placeholder="Description (BOOT*, *CUERO, BO*RO)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onPressEnter={runQuery}
              allowClear
              style={{ width: 260 }}
            />
          </Tooltip>
        </Space>

        {/* Run / clear controls */}
        <Space>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={runQuery}
            loading={isRunning && hasRun}
            disabled={!anyFilterSet && hasRun}
          >
            Run query
          </Button>
          {anyFilterSet ? <Button onClick={clearFilters}>Clear filters</Button> : null}
        </Space>

        {renderResultColumnControls()}

        {/* Apply bar — selection summary, action picker, target field, apply */}
        <Card size="small" style={{ background: '#fafafa' }}>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Space wrap>
              <Typography.Text strong>
                {selectedCodes.length.toLocaleString()} SKU{selectedCodes.length === 1 ? '' : 's'} selected
              </Typography.Text>
              {hasRun && resultCount > 0 && (
                <Tooltip title="Add every SKU in the current result set to the selection. Existing picks are kept.">
                  <Button size="small" onClick={selectAllVisible}>
                    Select all in results ({resultCount})
                  </Button>
                </Tooltip>
              )}
              {selectedCodes.length > 0 && (
                <Button size="small" onClick={() => setSelectedCodes([])}>
                  Clear selection
                </Button>
              )}
            </Space>
            <Space wrap>
              <span>Change:</span>
              <Select
                value={action}
                onChange={onActionChange}
                showSearch
                optionFilterProp="label"
                style={{ minWidth: 260 }}
                options={[
                  {
                    label: 'Core fields',
                    options: [
                      { value: 'CATEGORY', label: 'Category' },
                      { value: 'VENDOR', label: 'Vendor' },
                      { value: 'SEASON', label: 'Season' },
                      { value: 'GROUP', label: 'Group' },
                      { value: 'KEYWORD_ADD', label: 'Keyword add' },
                      { value: 'KEYWORD_REMOVE', label: 'Keyword remove' },
                    ],
                  },
                  ...attributeActionOptionGroups,
                ]}
              />
              <span style={{ marginLeft: 12 }}>{meta.verb}:</span>
              {renderTargetField()}
              <Popconfirm
                title={`${meta.verb} for ${selectedCodes.length} SKU${selectedCodes.length === 1 ? '' : 's'}?`}
                description="Reversible via Batch History."
                okText="Apply"
                cancelText="Cancel"
                onConfirm={applyChange}
                disabled={selectedCodes.length === 0 || !targetReady}
              >
                <Button
                  type="primary"
                  loading={apply.isPending}
                  disabled={selectedCodes.length === 0 || !targetReady}
                >
                  Apply
                </Button>
              </Popconfirm>
            </Space>
          </Space>
        </Card>

        {/* Empty state / result table */}
        {!hasRun ? (
          <Alert
            type="info"
            showIcon
            message="Pick filters and click Run query"
            description="Nothing loads until you ask for it. Use the filters above, hit Run query, then select the SKUs you want to change."
          />
        ) : (
          <Table<EnrichedSku>
            size="small"
            className="products-compact-table change-sku-attributes-result-table"
            rowKey="code"
            dataSource={enriched}
            columns={fitToWidthColumns}
            loading={isRunning}
            tableLayout="fixed"
            pagination={{
              defaultPageSize: 25,
              showSizeChanger: true,
              pageSizeOptions: [25, 50, 100, 200, 500],
            }}
            rowSelection={{
              selectedRowKeys: selectedCodes,
              onChange: (keys) => setSelectedCodes(keys.map(String)),
              preserveSelectedRowKeys: true,
            }}
          />
        )}
      </Space>
    </Card>
  )
}
