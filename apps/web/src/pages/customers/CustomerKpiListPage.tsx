import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Input, Select, Space, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useCustomerKpiFilterOptions, useCustomerKpiList } from '../../hooks/useCustomerKpi'
import { CustomerKpiTable } from '../../components/customerKpi/CustomerKpiTable'
import { SEGMENT_LABELS } from '../../components/customerKpi/CustomerSegmentBadge'
import type { CustomerKpiListParams, CustomerKpiSegment, CustomerStoreChainKey } from '../../types/customerKpi'

const { Search } = Input
const { Title, Text } = Typography

type LocationViewMode = 'chain' | 'city' | 'store'

type FilterPreset = {
  key: string
  label: string
  minLtv?: number
  maxLtv?: number
  maxRecency?: number
  minDiscountRatio?: number
}

const SAVED_VIEWS: Array<{ key: string; label: string; params: Partial<CustomerKpiListParams> }> = [
  { key: 'all', label: 'All', params: {} },
  { key: 'vip', label: 'VIP Customers', params: { segment: 'vip' } },
  { key: 'high-risk', label: 'High Risk Customers', params: { churnRisk: 'HIGH' } },
  { key: 'promo-sensitive', label: 'Promo Sensitive', params: { segment: 'promo_sensitive' } },
  { key: 'online', label: 'Online Buyers', params: { channel: 'online' } },
  { key: 'omnichannel', label: 'Omnichannel', params: { channel: 'omnichannel' } },
  { key: 'dormant', label: 'Dormant Customers', params: { dormant: true } },
  { key: 'top-ltv', label: 'Top by LTV', params: { sort: 'lifetimeValue', order: 'desc' } },
]

const SEGMENT_KEYS: Array<Exclude<CustomerKpiSegment, 'other'>> = [
  'vip',
  'loyal',
  'at_risk',
  'dormant',
  'promo_sensitive',
  'omnichannel',
  'new',
  'lost',
]

const SORT_KEYS: NonNullable<CustomerKpiListParams['sort']>[] = [
  'lifetimeValue',
  'totalOrders',
  'avgOrderValue',
  'recencyDays',
  'discountRatio',
  'lastPurchaseDate',
  'displayName',
]

const STORE_CHAIN_KEYS: CustomerStoreChainKey[] = [
  'unlimited',
  'magic_shoes',
  'la_femme',
  'online',
  'other',
]

const LOCATION_VIEW_OPTIONS: Array<{ value: LocationViewMode; label: string }> = [
  { value: 'chain', label: 'Retail Chain' },
  { value: 'city', label: 'City' },
  { value: 'store', label: 'Store' },
]

const LTV_PRESETS: FilterPreset[] = [
  { key: 'all', label: 'All LTV' },
  { key: 'under-50000', label: 'Under 50,000', maxLtv: 50_000 },
  { key: '50000-100000', label: '50,000 to 100,000', minLtv: 50_000, maxLtv: 100_000 },
  { key: '100000-250000', label: '100,000 to 250,000', minLtv: 100_000, maxLtv: 250_000 },
  { key: '250000-plus', label: '250,000+', minLtv: 250_000 },
]

const RECENCY_PRESETS: FilterPreset[] = [
  { key: 'all', label: 'Any Recency' },
  { key: '30', label: '30 days or less', maxRecency: 30 },
  { key: '60', label: '60 days or less', maxRecency: 60 },
  { key: '90', label: '90 days or less', maxRecency: 90 },
  { key: '180', label: '180 days or less', maxRecency: 180 },
  { key: '365', label: '365 days or less', maxRecency: 365 },
]

const DISCOUNT_PRESETS: FilterPreset[] = [
  { key: 'all', label: 'Any Discount' },
  { key: '10', label: '10%+', minDiscountRatio: 0.1 },
  { key: '20', label: '20%+', minDiscountRatio: 0.2 },
  { key: '30', label: '30%+', minDiscountRatio: 0.3 },
  { key: '50', label: '50%+', minDiscountRatio: 0.5 },
]

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function parseOptionalNumber(value: string | null): number | undefined {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseOptionalBoolean(value: string | null): boolean | undefined {
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function parseSegment(value: string | null): CustomerKpiListParams['segment'] {
  return SEGMENT_KEYS.includes(value as Exclude<CustomerKpiSegment, 'other'>)
    ? (value as Exclude<CustomerKpiSegment, 'other'>)
    : undefined
}

function parseChurnRisk(value: string | null): CustomerKpiListParams['churnRisk'] {
  return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' ? value : undefined
}

function parseChannel(value: string | null): CustomerKpiListParams['channel'] {
  return value === 'store' || value === 'online' || value === 'omnichannel' ? value : undefined
}

function parseSort(value: string | null): CustomerKpiListParams['sort'] {
  return SORT_KEYS.includes(value as NonNullable<CustomerKpiListParams['sort']>)
    ? (value as NonNullable<CustomerKpiListParams['sort']>)
    : undefined
}

function parseOrder(value: string | null): CustomerKpiListParams['order'] {
  return value === 'asc' || value === 'desc' ? value : undefined
}

function parseStoreChain(value: string | null): CustomerKpiListParams['primaryStoreChain'] {
  return STORE_CHAIN_KEYS.includes(value as CustomerStoreChainKey)
    ? (value as CustomerStoreChainKey)
    : undefined
}

function readFilters(searchParams: URLSearchParams): CustomerKpiListParams {
  const q = searchParams.get('q')?.trim()

  return {
    q: q || undefined,
    churnRisk: parseChurnRisk(searchParams.get('churnRisk')),
    segment: parseSegment(searchParams.get('segment')),
    channel: parseChannel(searchParams.get('channel')),
    minLtv: parseOptionalNumber(searchParams.get('minLtv')),
    maxLtv: parseOptionalNumber(searchParams.get('maxLtv')),
    minRecency: parseOptionalNumber(searchParams.get('minRecency')),
    maxRecency: parseOptionalNumber(searchParams.get('maxRecency')),
    minDiscountRatio: parseOptionalNumber(searchParams.get('minDiscountRatio')),
    primaryStoreId: searchParams.get('primaryStoreId') || undefined,
    primaryStoreCity: searchParams.get('primaryStoreCity') || undefined,
    primaryStoreChain: parseStoreChain(searchParams.get('primaryStoreChain')),
    active: parseOptionalBoolean(searchParams.get('active')),
    dormant: parseOptionalBoolean(searchParams.get('dormant')),
    sort: parseSort(searchParams.get('sort')),
    order: parseOrder(searchParams.get('order')),
  }
}

function buildSearchParams(filters: CustomerKpiListParams, page: number, pageSize: number): URLSearchParams {
  const next = new URLSearchParams()

  if (filters.q) next.set('q', filters.q)
  if (filters.churnRisk) next.set('churnRisk', filters.churnRisk)
  if (filters.segment) next.set('segment', filters.segment)
  if (filters.channel) next.set('channel', filters.channel)
  if (filters.minLtv != null) next.set('minLtv', String(filters.minLtv))
  if (filters.maxLtv != null) next.set('maxLtv', String(filters.maxLtv))
  if (filters.minRecency != null) next.set('minRecency', String(filters.minRecency))
  if (filters.maxRecency != null) next.set('maxRecency', String(filters.maxRecency))
  if (filters.minDiscountRatio != null) next.set('minDiscountRatio', String(filters.minDiscountRatio))
  if (filters.primaryStoreId) next.set('primaryStoreId', filters.primaryStoreId)
  if (filters.primaryStoreCity) next.set('primaryStoreCity', filters.primaryStoreCity)
  if (filters.primaryStoreChain) next.set('primaryStoreChain', filters.primaryStoreChain)
  if (filters.active != null) next.set('active', String(filters.active))
  if (filters.dormant != null) next.set('dormant', String(filters.dormant))
  if (filters.sort) next.set('sort', filters.sort)
  if (filters.order) next.set('order', filters.order)
  if (page !== 1) next.set('page', String(page))
  if (pageSize !== 50) next.set('pageSize', String(pageSize))

  return next
}

function getSavedViewKey(filters: CustomerKpiListParams): string {
  const activeEntries = Object.entries(filters)
    .filter(([, value]) => value != null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))

  const matchingView = SAVED_VIEWS.find((view) => {
    const viewEntries = Object.entries(view.params)
      .filter(([, value]) => value != null && value !== '')
      .sort(([left], [right]) => left.localeCompare(right))

    return (
      activeEntries.length === viewEntries.length &&
      activeEntries.every(([key, value], index) => {
        const [viewKey, viewValue] = viewEntries[index] ?? []
        return key === viewKey && value === viewValue
      })
    )
  })

  return matchingView?.key ?? 'all'
}

function matchPresetKey(filters: CustomerKpiListParams, presets: FilterPreset[]): string {
  return (
    presets.find(
      (preset) =>
        preset.minLtv === filters.minLtv &&
        preset.maxLtv === filters.maxLtv &&
        preset.maxRecency === filters.maxRecency &&
        preset.minDiscountRatio === filters.minDiscountRatio,
    )?.key ?? 'all'
  )
}

function locationModeFromFilters(filters: CustomerKpiListParams): LocationViewMode {
  if (filters.primaryStoreId) return 'store'
  if (filters.primaryStoreCity) return 'city'
  return 'chain'
}

export default function CustomerKpiListPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo(() => readFilters(searchParams), [searchParams])
  const page = useMemo(() => parsePositiveInt(searchParams.get('page'), 1), [searchParams])
  const pageSize = useMemo(() => parsePositiveInt(searchParams.get('pageSize'), 50), [searchParams])
  const savedView = useMemo(() => getSavedViewKey(filters), [filters])
  const [searchInput, setSearchInput] = useState(filters.q ?? '')
  const [locationViewMode, setLocationViewMode] = useState<LocationViewMode>(() => locationModeFromFilters(filters))

  useEffect(() => {
    setSearchInput(filters.q ?? '')
  }, [filters.q])

  useEffect(() => {
    if (filters.primaryStoreId || filters.primaryStoreCity || filters.primaryStoreChain) {
      setLocationViewMode(locationModeFromFilters(filters))
    }
  }, [filters.primaryStoreId, filters.primaryStoreCity, filters.primaryStoreChain])

  const params: CustomerKpiListParams = {
    ...filters,
    page,
    pageSize,
    sort: filters.sort ?? 'lifetimeValue',
    order: filters.order ?? 'desc',
  }

  const list = useCustomerKpiList(params)
  const filterOptions = useCustomerKpiFilterOptions()

  const chainRows = filterOptions.data?.chains ?? []
  const cityRows = filterOptions.data?.cities ?? []
  const storeRows = filterOptions.data?.stores ?? []

  const locationGroupOptions = useMemo(() => {
    if (locationViewMode === 'chain') {
      return chainRows.map((chain) => ({
        value: chain.key,
        label: `${chain.label} (${chain.customerCount.toLocaleString()})`,
      }))
    }

    if (locationViewMode === 'city') {
      return cityRows.map((city) => ({
        value: city.key,
        label: `${city.label} (${city.customerCount.toLocaleString()})`,
      }))
    }

    return storeRows.map((store) => ({
      value: store.storeId,
      label: `${store.storeName}${store.city ? ` | ${store.city}` : ''} (${store.customerCount.toLocaleString()})`,
    }))
  }, [chainRows, cityRows, locationViewMode, storeRows])

  const locationGroupValue =
    locationViewMode === 'chain'
      ? filters.primaryStoreChain
      : locationViewMode === 'city'
        ? filters.primaryStoreCity
        : filters.primaryStoreId

  const ltvPresetKey = matchPresetKey({ ...filters, maxRecency: undefined, minDiscountRatio: undefined }, LTV_PRESETS)
  const recencyPresetKey = matchPresetKey(
    { ...filters, minLtv: undefined, maxLtv: undefined, minDiscountRatio: undefined },
    RECENCY_PRESETS,
  )
  const discountPresetKey = matchPresetKey(
    { ...filters, minLtv: undefined, maxLtv: undefined, maxRecency: undefined },
    DISCOUNT_PRESETS,
  )

  const applyView = (key: string) => {
    const view = SAVED_VIEWS.find((entry) => entry.key === key)
    if (!view) return
    setSearchParams(buildSearchParams(view.params, 1, pageSize))
  }

  const applySearch = (value: string) => {
    const nextValue = value.trim() || undefined
    setSearchInput(value)
    setSearchParams(buildSearchParams({ ...filters, q: nextValue }, 1, pageSize))
  }

  const updateFilter = <K extends keyof CustomerKpiListParams>(key: K, value: CustomerKpiListParams[K]) => {
    setSearchParams(buildSearchParams({ ...filters, [key]: value }, 1, pageSize))
  }

  const applyLocationView = (next: Partial<CustomerKpiListParams>) => {
    setSearchParams(
      buildSearchParams(
        {
          ...filters,
          primaryStoreId: undefined,
          primaryStoreCity: undefined,
          primaryStoreChain: undefined,
          sort: 'lifetimeValue',
          order: 'desc',
          ...next,
        },
        1,
        pageSize,
      ),
    )
  }

  const updatePreset = (presetKey: string, presets: FilterPreset[]) => {
    const preset = presets.find((entry) => entry.key === presetKey)
    setSearchParams(
      buildSearchParams(
        {
          ...filters,
          minLtv: preset?.minLtv,
          maxLtv: preset?.maxLtv,
          minRecency: undefined,
          maxRecency: preset?.maxRecency,
          minDiscountRatio: preset?.minDiscountRatio,
        },
        1,
        pageSize,
      ),
    )
  }

  const handleLocationModeChange = (nextMode: LocationViewMode) => {
    setLocationViewMode(nextMode)
    if (filters.primaryStoreId || filters.primaryStoreCity || filters.primaryStoreChain) {
      applyLocationView({})
    }
  }

  const handleLocationGroupChange = (value: string | undefined) => {
    if (!value) {
      applyLocationView({})
      return
    }

    if (locationViewMode === 'chain') {
      applyLocationView({ primaryStoreChain: value as CustomerStoreChainKey })
      return
    }

    if (locationViewMode === 'city') {
      applyLocationView({ primaryStoreCity: value })
      return
    }

    applyLocationView({ primaryStoreId: value })
  }

  const clearFilters = () => {
    setSearchInput('')
    setSearchParams(buildSearchParams({}, 1, pageSize))
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          Customer Intelligence
        </Title>
        <Text type="secondary">
          Compare top customers by retail chain, city, and store. Amounts in Lempira (HNL).
        </Text>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap size={[8, 8]}>
          {SAVED_VIEWS.map((view) => (
            <Button
              key={view.key}
              type={savedView === view.key ? 'primary' : 'default'}
              size="small"
              onClick={() => applyView(view.key)}
            >
              {view.label}
            </Button>
          ))}
        </Space>
      </Card>

      <Card
        size="small"
        style={{ marginBottom: 16 }}
        title="Top Customer Views"
        extra={<Text type="secondary">Choose the grouping, then select the audience.</Text>}
      >
        {filterOptions.isError ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            message="Unable to load customer group selectors"
            description={filterOptions.error instanceof Error ? filterOptions.error.message : undefined}
          />
        ) : null}

        <Space wrap size={[12, 12]}>
          <Select<LocationViewMode>
            style={{ minWidth: 180 }}
            value={locationViewMode}
            onChange={handleLocationModeChange}
            options={LOCATION_VIEW_OPTIONS}
          />
          <Select<string>
            style={{ minWidth: 320 }}
            placeholder={
              locationViewMode === 'chain'
                ? 'Select retail chain'
                : locationViewMode === 'city'
                  ? 'Select city'
                  : 'Select store'
            }
            value={locationGroupValue}
            allowClear
            showSearch
            optionFilterProp="label"
            loading={filterOptions.isLoading}
            onChange={handleLocationGroupChange}
            options={locationGroupOptions}
          />
        </Space>
      </Card>

      <Card
        size="small"
        title={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>Top Customers</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Filters now live in the table header as dropdowns.
              </Text>
            </div>
            <Space wrap size={[8, 8]}>
              <Search
                size="small"
                placeholder="Search customer"
                value={searchInput}
                style={{ width: 220 }}
                onChange={(event) => {
                  const value = event.target.value
                  setSearchInput(value)
                  if (value === '') {
                    applySearch('')
                  }
                }}
                onSearch={applySearch}
                allowClear
              />
              <Select
                size="small"
                placeholder="Segment"
                style={{ minWidth: 140 }}
                allowClear
                value={filters.segment}
                onChange={(value) => updateFilter('segment', value)}
                options={Object.entries(SEGMENT_LABELS)
                  .filter(([key]) => key !== 'other')
                  .map(([key, label]) => ({ value: key, label }))}
              />
              <Select
                size="small"
                placeholder="Risk"
                style={{ minWidth: 120 }}
                allowClear
                value={filters.churnRisk}
                onChange={(value) => updateFilter('churnRisk', value)}
                options={[
                  { value: 'LOW', label: 'Low Risk' },
                  { value: 'MEDIUM', label: 'Medium Risk' },
                  { value: 'HIGH', label: 'High Risk' },
                ]}
              />
              <Select
                size="small"
                placeholder="Channel"
                style={{ minWidth: 140 }}
                allowClear
                value={filters.channel}
                onChange={(value) => updateFilter('channel', value)}
                options={[
                  { value: 'store', label: 'Store Only' },
                  { value: 'online', label: 'Online Only' },
                  { value: 'omnichannel', label: 'Omnichannel' },
                ]}
              />
              <Select<CustomerStoreChainKey | undefined>
                size="small"
                placeholder="Chain"
                style={{ minWidth: 160 }}
                allowClear
                showSearch
                optionFilterProp="label"
                loading={filterOptions.isLoading}
                value={filters.primaryStoreChain}
                onChange={(value) => updateFilter('primaryStoreChain', value)}
                options={chainRows.map((chain) => ({
                  value: chain.key,
                  label: `${chain.label} (${chain.customerCount.toLocaleString()})`,
                }))}
              />
              <Select<string | undefined>
                size="small"
                placeholder="City"
                style={{ minWidth: 160 }}
                allowClear
                showSearch
                optionFilterProp="label"
                loading={filterOptions.isLoading}
                value={filters.primaryStoreCity}
                onChange={(value) => updateFilter('primaryStoreCity', value)}
                options={cityRows.map((city) => ({
                  value: city.key,
                  label: `${city.label} (${city.customerCount.toLocaleString()})`,
                }))}
              />
              <Select<string | undefined>
                size="small"
                placeholder="Store"
                style={{ minWidth: 220 }}
                allowClear
                showSearch
                optionFilterProp="label"
                loading={filterOptions.isLoading}
                value={filters.primaryStoreId}
                onChange={(value) => updateFilter('primaryStoreId', value)}
                options={storeRows.map((store) => ({
                  value: store.storeId,
                  label: `${store.storeName}${store.city ? ` | ${store.city}` : ''} (${store.customerCount.toLocaleString()})`,
                }))}
              />
              <Select
                size="small"
                style={{ minWidth: 150 }}
                value={ltvPresetKey}
                onChange={(value) => updatePreset(value, LTV_PRESETS)}
                options={LTV_PRESETS.map((preset) => ({ value: preset.key, label: preset.label }))}
              />
              <Select
                size="small"
                style={{ minWidth: 160 }}
                value={recencyPresetKey}
                onChange={(value) => updatePreset(value, RECENCY_PRESETS)}
                options={RECENCY_PRESETS.map((preset) => ({ value: preset.key, label: preset.label }))}
              />
              <Select
                size="small"
                style={{ minWidth: 140 }}
                value={discountPresetKey}
                onChange={(value) => updatePreset(value, DISCOUNT_PRESETS)}
                options={DISCOUNT_PRESETS.map((preset) => ({ value: preset.key, label: preset.label }))}
              />
              <Button size="small" onClick={clearFilters}>
                Clear
              </Button>
              <Button size="small" icon={<ReloadOutlined />} onClick={() => list.refetch()} loading={list.isFetching} />
            </Space>
          </div>
        }
      >
        {list.isError ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="Unable to load customer intelligence list"
            description={list.error instanceof Error ? list.error.message : undefined}
            action={
              <Button size="small" onClick={() => list.refetch()}>
                Retry
              </Button>
            }
          />
        ) : null}

        <CustomerKpiTable
          rows={list.data?.data ?? []}
          loading={list.isLoading}
          error={list.isError ? (list.error instanceof Error ? list.error.message : 'Failed to load customer list') : null}
          pagination={{
            current: list.data?.pagination.page ?? page,
            pageSize: list.data?.pagination.pageSize ?? pageSize,
            total: list.data?.pagination.totalItems ?? 0,
            onChange: (nextPage, nextPageSize) => {
              setSearchParams(buildSearchParams(filters, nextPage, nextPageSize))
            },
          }}
          columnKeys={[
            'name',
            'primaryStore',
            'segment',
            'ltv',
            'orders',
            'aov',
            'lastPurchase',
            'recency',
            'risk',
            'rfm',
            'discountRatio',
            'channel',
          ]}
        />
      </Card>
    </div>
  )
}
