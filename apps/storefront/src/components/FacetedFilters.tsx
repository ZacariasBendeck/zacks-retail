import { Checkbox, Collapse, InputNumber, Space, Typography, Button } from 'antd'
import { formatHnl } from '@benlow-rics/i18n'
import { useI18nLocale } from '@benlow-rics/i18n/react'
import { useTranslation } from '@benlow-rics/i18n/react'
import type { Facets } from '@/types/product'

export interface FilterState {
  brandId?: number
  colorId?: number
  sizeLabel?: string
  categoryId?: number
  department?: string
  materialId?: number
  minPrice?: number
  maxPrice?: number
}

interface FacetedFiltersProps {
  facets: Facets | undefined
  filters: FilterState
  onChange: (filters: FilterState) => void
  loading?: boolean
}

function IdFilterSection({
  options,
  selectedId,
  onSelect,
}: {
  options: { id: number; name: string; count: number }[]
  selectedId: number | undefined
  onSelect: (id: number | undefined) => void
}) {
  if (!options.length) return null
  return (
    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
      {options.map(opt => (
        <div key={opt.id} style={{ padding: '3px 0' }}>
          <Checkbox
            checked={selectedId === opt.id}
            onChange={() => onSelect(selectedId === opt.id ? undefined : opt.id)}
          >
            <span>{opt.name}</span>
            <Typography.Text type="secondary" style={{ marginLeft: 4 }}>
              ({opt.count})
            </Typography.Text>
          </Checkbox>
        </div>
      ))}
    </div>
  )
}

function NameFilterSection({
  options,
  selectedName,
  onSelect,
}: {
  options: { name: string; count: number }[]
  selectedName: string | undefined
  onSelect: (name: string | undefined) => void
}) {
  if (!options.length) return null
  return (
    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
      {options.map(opt => (
        <div key={opt.name} style={{ padding: '3px 0' }}>
          <Checkbox
            checked={selectedName === opt.name}
            onChange={() => onSelect(selectedName === opt.name ? undefined : opt.name)}
          >
            <span>{opt.name}</span>
            <Typography.Text type="secondary" style={{ marginLeft: 4 }}>
              ({opt.count})
            </Typography.Text>
          </Checkbox>
        </div>
      ))}
    </div>
  )
}

function SizeFilterSection({
  options,
  selectedLabel,
  onSelect,
}: {
  options: { label: string; count: number }[]
  selectedLabel: string | undefined
  onSelect: (label: string | undefined) => void
}) {
  if (!options.length) return null
  return (
    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
      {options.map(opt => (
        <div key={opt.label} style={{ padding: '3px 0' }}>
          <Checkbox
            checked={selectedLabel === opt.label}
            onChange={() => onSelect(selectedLabel === opt.label ? undefined : opt.label)}
          >
            <span>{opt.label}</span>
            <Typography.Text type="secondary" style={{ marginLeft: 4 }}>
              ({opt.count})
            </Typography.Text>
          </Checkbox>
        </div>
      ))}
    </div>
  )
}

export default function FacetedFilters({ facets, filters, onChange, loading }: FacetedFiltersProps) {
  const { t } = useTranslation('storefront')
  const { locale } = useI18nLocale()
  const hasActiveFilters = filters.brandId != null || filters.colorId != null ||
    filters.sizeLabel != null || filters.categoryId != null || filters.department != null ||
    filters.materialId != null || filters.minPrice != null || filters.maxPrice != null

  const clearAll = () => {
    onChange({})
  }

  // Filter out zero-count options so users only see relevant choices
  const departments = (facets?.departments ?? []).filter(o => o.count > 0)
  const categories = (facets?.categories ?? []).filter(o => o.count > 0)
  const brands = (facets?.brands ?? []).filter(o => o.count > 0)
  const sizes = (facets?.sizes ?? []).filter(o => o.count > 0)
  const colors = (facets?.colors ?? []).filter(o => o.count > 0)
  const materials = (facets?.materials ?? []).filter(o => o.count > 0)
  const withSelectedCount = (label: string, selected: boolean) => selected ? `${label} (1)` : label

  const sections = [
    {
      key: 'department',
      label: withSelectedCount(t('catalog.filterLabels.department'), Boolean(filters.department)),
      children: (
        <NameFilterSection
          options={departments}
          selectedName={filters.department}
          onSelect={(name) => onChange({ ...filters, department: name })}
        />
      ),
    },
    {
      key: 'category',
      label: withSelectedCount(t('catalog.filterLabels.category'), filters.categoryId != null),
      children: (
        <IdFilterSection
          options={categories}
          selectedId={filters.categoryId}
          onSelect={(id) => onChange({ ...filters, categoryId: id })}
        />
      ),
    },
    {
      key: 'brand',
      label: withSelectedCount(t('catalog.filterLabels.brand'), filters.brandId != null),
      children: (
        <IdFilterSection
          options={brands}
          selectedId={filters.brandId}
          onSelect={(id) => onChange({ ...filters, brandId: id })}
        />
      ),
    },
    {
      key: 'size',
      label: withSelectedCount(t('catalog.filterLabels.size'), Boolean(filters.sizeLabel)),
      children: (
        <SizeFilterSection
          options={sizes}
          selectedLabel={filters.sizeLabel}
          onSelect={(label) => onChange({ ...filters, sizeLabel: label })}
        />
      ),
    },
    {
      key: 'color',
      label: withSelectedCount(t('catalog.filterLabels.color'), filters.colorId != null),
      children: (
        <IdFilterSection
          options={colors}
          selectedId={filters.colorId}
          onSelect={(id) => onChange({ ...filters, colorId: id })}
        />
      ),
    },
    {
      key: 'price',
      label: t('catalog.filterLabels.price'),
      children: (
        <div>
          {facets?.priceRange && (
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
              {t('catalog.range', {
                min: formatHnl(facets.priceRange.min, locale),
                max: formatHnl(facets.priceRange.max, locale),
              })}
            </Typography.Text>
          )}
          <Space>
            <InputNumber
              placeholder={t('catalog.min')}
              prefix="L"
              value={filters.minPrice}
              onChange={(v) => onChange({ ...filters, minPrice: v ?? undefined })}
              style={{ width: 100 }}
              min={0}
            />
            <span>-</span>
            <InputNumber
              placeholder={t('catalog.max')}
              prefix="L"
              value={filters.maxPrice}
              onChange={(v) => onChange({ ...filters, maxPrice: v ?? undefined })}
              style={{ width: 100 }}
              min={0}
            />
          </Space>
        </div>
      ),
    },
    {
      key: 'material',
      label: withSelectedCount(t('catalog.filterLabels.material'), filters.materialId != null),
      children: (
        <NameFilterSection
          options={materials}
          selectedName={undefined}
          onSelect={() => {}}
        />
      ),
    },
  ]

  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      {hasActiveFilters && (
        <div style={{ marginBottom: 12 }}>
          <Button type="link" onClick={clearAll} style={{ padding: 0 }}>
            {t('catalog.clearFilters')}
          </Button>
        </div>
      )}
      <Collapse
        defaultActiveKey={['brand', 'size', 'color', 'price', 'department']}
        ghost
        items={sections}
        expandIconPosition="end"
      />
    </div>
  )
}
