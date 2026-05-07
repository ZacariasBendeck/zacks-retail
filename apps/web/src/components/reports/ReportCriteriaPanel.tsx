import { useCallback, useMemo, useState } from 'react'
import { Select, Typography } from 'antd'
import CriteriaInput from '../../pages/salesReporting/CriteriaInput'
import type { SalesDimensionsResponse, SharedReportCriteriaParams } from '../../services/reportApi'

const { Text } = Typography

export type ReportCriteriaState = Required<Pick<
  SharedReportCriteriaParams,
  | 'stores'
  | 'chains'
  | 'sectors'
  | 'departments'
  | 'categories'
  | 'vendors'
  | 'seasons'
  | 'skus'
  | 'groups'
  | 'keywords'
  | 'buyers'
>> & {
  styleColor: string
  storesRaw: string
  categoriesRaw: string
  vendorsRaw: string
  seasonsRaw: string
  skusRaw: string
  groupsRaw: string
  keywordsRaw: string
  styleColorRaw: string
}

export const emptyReportCriteria: ReportCriteriaState = {
  stores: [],
  chains: [],
  sectors: [],
  departments: [],
  categories: [],
  vendors: [],
  seasons: [],
  skus: [],
  groups: [],
  keywords: [],
  buyers: [],
  styleColor: '',
  storesRaw: '',
  categoriesRaw: '',
  vendorsRaw: '',
  seasonsRaw: '',
  skusRaw: '',
  groupsRaw: '',
  keywordsRaw: '',
  styleColorRaw: '',
}

export function compactReportCriteria(value: ReportCriteriaState): SharedReportCriteriaParams {
  return {
    stores: value.stores.length ? value.stores : undefined,
    chains: value.chains.length ? value.chains : undefined,
    sectors: value.sectors.length ? value.sectors : undefined,
    departments: value.departments.length ? value.departments : undefined,
    categories: value.categories.length ? value.categories : undefined,
    vendors: value.vendors.length ? value.vendors : undefined,
    seasons: value.seasons.length ? value.seasons : undefined,
    skus: value.skus.length ? value.skus : undefined,
    groups: value.groups.length ? value.groups : undefined,
    keywords: value.keywords.length ? value.keywords : undefined,
    buyers: value.buyers.length ? value.buyers : undefined,
    styleColor: value.styleColor.trim() || undefined,
    storesRaw: value.storesRaw.trim() || undefined,
    categoriesRaw: value.categoriesRaw.trim() || undefined,
    vendorsRaw: value.vendorsRaw.trim() || undefined,
    seasonsRaw: value.seasonsRaw.trim() || undefined,
    skusRaw: value.skusRaw.trim() || undefined,
    groupsRaw: value.groupsRaw.trim() || undefined,
    keywordsRaw: value.keywordsRaw.trim() || undefined,
    styleColorRaw: value.styleColorRaw.trim() || undefined,
  }
}

export function hydrateReportCriteria(
  value: Partial<SharedReportCriteriaParams> = {},
): ReportCriteriaState {
  return {
    ...emptyReportCriteria,
    stores: Array.isArray(value.stores) ? value.stores : [],
    chains: Array.isArray(value.chains) ? value.chains : [],
    sectors: Array.isArray(value.sectors) ? value.sectors : [],
    departments: Array.isArray(value.departments) ? value.departments : [],
    categories: Array.isArray(value.categories) ? value.categories : [],
    vendors: Array.isArray(value.vendors) ? value.vendors : [],
    seasons: Array.isArray(value.seasons) ? value.seasons : [],
    skus: Array.isArray(value.skus) ? value.skus : [],
    groups: Array.isArray(value.groups) ? value.groups : [],
    keywords: Array.isArray(value.keywords) ? value.keywords : [],
    buyers: Array.isArray(value.buyers) ? value.buyers : [],
    styleColor: value.styleColor ?? '',
    storesRaw: value.storesRaw ?? '',
    categoriesRaw: value.categoriesRaw ?? '',
    vendorsRaw: value.vendorsRaw ?? '',
    seasonsRaw: value.seasonsRaw ?? '',
    skusRaw: value.skusRaw ?? '',
    groupsRaw: value.groupsRaw ?? '',
    keywordsRaw: value.keywordsRaw ?? '',
    styleColorRaw: value.styleColorRaw ?? '',
  }
}

export function useReportCriteria(initial?: Partial<SharedReportCriteriaParams>) {
  const [criteria, setCriteria] = useState<ReportCriteriaState>(() => hydrateReportCriteria(initial))
  const updateCriteria = useCallback(<K extends keyof ReportCriteriaState>(
    key: K,
    value: ReportCriteriaState[K],
  ) => {
    setCriteria((current) => ({ ...current, [key]: value }))
  }, [])
  const compactCriteria = useMemo(() => compactReportCriteria(criteria), [criteria])
  return { criteria, setCriteria, updateCriteria, compactCriteria }
}

interface ReportCriteriaPanelProps {
  value: ReportCriteriaState
  onChange: <K extends keyof ReportCriteriaState>(key: K, value: ReportCriteriaState[K]) => void
  dimensions?: SalesDimensionsResponse
  loading?: boolean
  title?: string
}

export function ReportCriteriaPanel({
  value,
  onChange,
  dimensions,
  loading = false,
  title = 'Criteria',
}: ReportCriteriaPanelProps) {
  const stores = dimensions?.stores ?? []
  return (
    <div className="sales-analysis-criteria-panel" data-testid="shared-report-criteria-panel">
      <div className="sales-analysis-criteria-title">
        <Text strong>{title}</Text>
        <Text type="secondary">Shared store and product filters</Text>
      </div>
      <div className="sales-analysis-criteria-grid">
        <CriteriaInput<number>
          label="Stores"
          mode="numeric"
          options={stores.map((s) => ({ value: s.number, label: `${s.number} — ${s.name ?? 'Store'}` }))}
          selected={value.stores}
          onSelectedChange={(next) => onChange('stores', next)}
          rawText={value.storesRaw}
          onRawTextChange={(next) => onChange('storesRaw', next)}
          loading={loading}
          selectTestId="stores-select"
          rawTestId="criteria-stores"
          rawAriaLabel="Store range"
          helpText="Select stores or use ranges like 1-2,5-17,99. Blank means all scoped stores."
        />
        <div className="criteria-input-compact criteria-input-compact--picker-only">
          <Text strong style={{ fontSize: 12 }}>Store Chains</Text>
          <Select<string[]>
            mode="multiple"
            allowClear
            loading={loading}
            value={value.chains}
            onChange={(next) => onChange('chains', next)}
            placeholder="All chains"
            optionFilterProp="label"
            size="small"
            maxTagCount="responsive"
            style={{ width: '100%' }}
            options={(dimensions?.chains ?? []).map((c) => ({
              value: c.code,
              label: `${c.label} (${c.storeNumbers.length} stores)`,
            }))}
            data-testid="chains-select"
          />
        </div>
        <CriteriaInput<number>
          label="Categories"
          mode="numeric"
          options={(dimensions?.categories ?? []).map((c) => ({ value: c.number, label: `${c.number} - ${c.desc ?? ''}` }))}
          selected={value.categories}
          onSelectedChange={(next) => onChange('categories', next)}
          rawText={value.categoriesRaw}
          onRawTextChange={(next) => onChange('categoriesRaw', next)}
          loading={loading}
          rawTestId="criteria-categories"
        />
        <div className="criteria-input-compact criteria-input-compact--picker-only">
          <Text strong style={{ fontSize: 12 }}>Sectors</Text>
          <Select<number[]>
            mode="multiple"
            allowClear
            loading={loading}
            value={value.sectors}
            onChange={(next) => onChange('sectors', next)}
            placeholder="All sectors"
            optionFilterProp="label"
            size="small"
            maxTagCount="responsive"
            style={{ width: '100%' }}
            options={(dimensions?.sectors ?? []).map((s) => ({ value: s.number, label: `${s.number} - ${s.name ?? ''}` }))}
            data-testid="sectors-select"
          />
        </div>
        <div className="criteria-input-compact criteria-input-compact--picker-only">
          <Text strong style={{ fontSize: 12 }}>Departments</Text>
          <Select<number[]>
            mode="multiple"
            allowClear
            loading={loading}
            value={value.departments}
            onChange={(next) => onChange('departments', next)}
            placeholder="All departments"
            optionFilterProp="label"
            size="small"
            maxTagCount="responsive"
            style={{ width: '100%' }}
            options={(dimensions?.departments ?? []).map((d) => ({ value: d.number, label: `${d.number} - ${d.name ?? ''}` }))}
            data-testid="departments-select"
          />
        </div>
        <CriteriaInput<string>
          label="Vendors"
          mode="string"
          options={[]}
          selected={value.vendors}
          onSelectedChange={(next) => onChange('vendors', next)}
          rawText={value.vendorsRaw}
          onRawTextChange={(next) => onChange('vendorsRaw', next)}
          hideDropdown
          rawTestId="criteria-vendors"
        />
        <CriteriaInput<string>
          label="Seasons"
          mode="string"
          options={(dimensions?.seasons ?? []).map((s) => ({ value: s.code, label: `${s.code}${s.description ? ` - ${s.description}` : ''}` }))}
          selected={value.seasons}
          onSelectedChange={(next) => onChange('seasons', next)}
          rawText={value.seasonsRaw}
          onRawTextChange={(next) => onChange('seasonsRaw', next)}
          loading={loading}
          rawTestId="criteria-seasons"
        />
        <CriteriaInput<string>
          label="Groups"
          mode="string"
          options={(dimensions?.groups ?? []).map((g) => ({ value: g.code, label: `${g.code}${g.desc ? ` - ${g.desc}` : ''}` }))}
          selected={value.groups}
          onSelectedChange={(next) => onChange('groups', next)}
          rawText={value.groupsRaw}
          onRawTextChange={(next) => onChange('groupsRaw', next)}
          loading={loading}
          rawTestId="criteria-groups"
        />
        <CriteriaInput<string>
          label="SKUs"
          mode="string"
          options={[]}
          selected={value.skus}
          onSelectedChange={(next) => onChange('skus', next)}
          rawText={value.skusRaw}
          onRawTextChange={(next) => onChange('skusRaw', next)}
          hideDropdown
          rawTestId="criteria-skus"
        />
        <CriteriaInput<string>
          label="Style/Color"
          mode="string"
          options={[]}
          selected={[]}
          onSelectedChange={() => undefined}
          rawText={value.styleColorRaw || value.styleColor}
          onRawTextChange={(next) => onChange('styleColorRaw', next)}
          hideDropdown
          rawTestId="criteria-styleColors"
        />
        <CriteriaInput<string>
          label="Keywords"
          mode="string"
          options={[]}
          selected={value.keywords}
          onSelectedChange={(next) => onChange('keywords', next)}
          rawText={value.keywordsRaw}
          onRawTextChange={(next) => onChange('keywordsRaw', next)}
          hideDropdown
          rawTestId="criteria-keywords"
        />
        <div className="criteria-input-compact criteria-input-compact--picker-only">
          <Text strong style={{ fontSize: 12 }}>Buyers</Text>
          <Select<string[]>
            mode="multiple"
            allowClear
            loading={loading}
            value={value.buyers}
            onChange={(next) => onChange('buyers', next)}
            placeholder="All buyers"
            optionFilterProp="label"
            size="small"
            maxTagCount="responsive"
            style={{ width: '100%' }}
            options={(dimensions?.buyers ?? []).map((b) => ({ value: b.code, label: `${b.code}${b.label ? ` - ${b.label}` : ''}` }))}
            data-testid="buyers-select"
          />
        </div>
      </div>
    </div>
  )
}
