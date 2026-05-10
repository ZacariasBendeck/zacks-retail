import type { BatchOperation, SkuCriteria } from '../../services/utilitiesApi'
import type { SkuListFilters } from '../../types/productsSku'

type JsonRecord = Record<string, unknown>

export function humanizeBatchOperation(op: string): string {
  switch (op) {
    case 'CHANGE_KEYWORDS_ADD': return 'Add keyword'
    case 'CHANGE_KEYWORDS_REMOVE': return 'Remove keyword'
    case 'CHANGE_CATEGORY': return 'Category'
    case 'CHANGE_VENDOR': return 'Vendor'
    case 'CHANGE_SEASON': return 'Season'
    case 'CHANGE_GROUP_CODE': return 'Group code'
    case 'CHANGE_SKU_ATTRIBUTE': return 'SKU attribute'
    case 'CHANGE_SIZE_COLUMN': return 'Size column rename'
    case 'CHANGE_SIZE_TYPE_STRUCTURE': return 'Size type structure'
    default: return op
  }
}

export function describeBatchOperationChange(r: Pick<BatchOperation, 'operationType' | 'changeJson'>): string {
  const c = asRecord(r.changeJson)

  switch (r.operationType) {
    case 'CHANGE_KEYWORDS_ADD':
      return `Add keyword ${formatUnknown(c.keyword)}`
    case 'CHANGE_KEYWORDS_REMOVE':
      return `Remove keyword ${formatUnknown(c.keyword)}`
    case 'CHANGE_CATEGORY':
      return `Set category to ${formatUnknown(c.category)}`
    case 'CHANGE_VENDOR':
      return `Set vendor to ${formatUnknown(c.vendor)}`
    case 'CHANGE_SEASON':
      return `Set season to ${formatUnknown(c.season)}`
    case 'CHANGE_GROUP_CODE':
      return `Set group to ${formatUnknown(c.groupCode)}`
    case 'CHANGE_SKU_ATTRIBUTE':
      return describeSkuAttributeChange(c)
    case 'CHANGE_SIZE_COLUMN':
      return `Rename size column ${formatUnknown(c.oldLabel)} to ${formatUnknown(c.newLabel)}`
    case 'CHANGE_SIZE_TYPE_STRUCTURE':
      return `Set size type ${formatUnknown(c.code)} structure`
    default:
      return 'No change summary recorded'
  }
}

export function describeBatchSkuQuery(criteria: SkuCriteria | null | undefined): string {
  const sourceQuery = isSkuListFilters(criteria?.sourceQuery) ? criteria.sourceQuery : null
  const selectedSkus = arrayOfStrings(criteria?.skus)

  if (sourceQuery) {
    const queryParts = describeSkuListFilters(sourceQuery)
    const query = queryParts.length > 0 ? queryParts.join('; ') : 'No filters'
    const selection = selectedSkus.length > 0
      ? `Selection: ${selectedSkus.length.toLocaleString()} SKU${selectedSkus.length === 1 ? '' : 's'}`
      : null
    return [query, selection].filter(Boolean).join('; ')
  }

  const criteriaParts = describeSkuCriteria(criteria)
  if (criteriaParts.length > 0) return criteriaParts.join('; ')
  return 'All SKUs'
}

function describeSkuAttributeChange(c: JsonRecord): string {
  const dimension = formatUnknown(c.dimensionCode)
  const values = formatValueList(arrayOfStrings(c.valueCodes))
  const mode = String(c.mode ?? 'REPLACE').toUpperCase()

  if (mode === 'ADD') return `Add ${values} to ${dimension}`
  if (mode === 'REMOVE') return `Remove ${values} from ${dimension}`
  return `Set ${dimension} to ${values}`
}

function describeSkuListFilters(filters: SkuListFilters): string[] {
  const parts: string[] = []

  addTextPart(parts, 'Search', filters.q)
  addTextPart(parts, 'SKU', filters.sku)
  addNumberListPart(parts, 'Sector in', filters.sectors)
  addNumberListPart(parts, 'Department in', filters.departments)
  addNumberPart(parts, 'Category', filters.category)
  addNumberListPart(parts, 'Category in', filters.categories)
  addTextPart(parts, 'Vendor', filters.vendor)
  addListPart(parts, 'Vendor in', filters.vendors)
  addTextPart(parts, 'Season', filters.season)
  addListPart(parts, 'Season in', filters.seasons)
  addTextPart(parts, 'Group', filters.group)
  addListPart(parts, 'Group in', filters.groups)
  addTextPart(parts, 'Keyword', filters.keyword)
  addListPart(parts, 'Keyword in', filters.keywords)
  addTextPart(parts, 'Style/color contains', filters.styleColor)
  addTextPart(parts, 'Description', filters.description)
  addAttributeParts(parts, filters.attributes)

  return parts
}

function describeSkuCriteria(criteria: SkuCriteria | null | undefined): string[] {
  if (!criteria) return []

  const parts: string[] = []
  const skus = arrayOfStrings(criteria.skus)
  if (skus.length > 0) parts.push(`Selected SKUs: ${formatValueList(skus, 6)}`)

  addNumberListPart(parts, 'Category in', criteria.categories)
  addListPart(parts, 'Vendor in', criteria.vendors)
  addListPart(parts, 'Season in', criteria.seasons)
  addListPart(parts, 'Group in', criteria.groups)
  addListPart(parts, 'Keyword in', criteria.keywords)
  addListPart(parts, 'Style/color contains', criteria.stylesColors)
  addAttributeParts(parts, criteria.attributes)
  if (criteria.onlyFuturePriceChanges) parts.push('Future price changes only')
  if (criteria.onlyWtdSales) parts.push('WTD sales only')

  return parts
}

function addTextPart(parts: string[], label: string, value: unknown): void {
  if (typeof value === 'string' && value.trim()) parts.push(`${label}: ${value.trim()}`)
}

function addNumberPart(parts: string[], label: string, value: unknown): void {
  if (typeof value === 'number' && Number.isFinite(value)) parts.push(`${label}: ${value}`)
}

function addListPart(parts: string[], label: string, values: unknown): void {
  const list = arrayOfStrings(values)
  if (list.length > 0) parts.push(`${label} ${formatValueList(list)}`)
}

function addNumberListPart(parts: string[], label: string, values: unknown): void {
  const list = Array.isArray(values)
    ? values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    : []
  if (list.length > 0) parts.push(`${label} ${formatValueList(list.map(String))}`)
}

function addAttributeParts(parts: string[], attributes: unknown): void {
  if (!isRecord(attributes)) return
  for (const [dimensionCode, values] of Object.entries(attributes)) {
    const valueList = arrayOfStrings(values)
    if (valueList.length > 0) {
      parts.push(`${dimensionCode} in ${formatValueList(valueList)}`)
    }
  }
}

function formatUnknown(value: unknown): string {
  if (typeof value === 'string') return value.trim() || '(blank)'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return '(blank)'
}

function formatValueList(values: string[], max = 8): string {
  if (values.length === 0) return '(blank)'
  const visible = values.slice(0, max).join(', ')
  const remaining = values.length - max
  return remaining > 0 ? `${visible} +${remaining.toLocaleString()} more` : visible
}

function arrayOfStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return values
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0)
}

function isRecord(value: unknown): value is JsonRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {}
}

function isSkuListFilters(value: unknown): value is SkuListFilters {
  return isRecord(value)
}
