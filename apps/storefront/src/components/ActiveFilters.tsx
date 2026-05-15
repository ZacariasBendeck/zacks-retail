import { Tag } from 'antd'
import { formatHnl } from '@benlow-rics/i18n'
import { useI18nLocale } from '@benlow-rics/i18n/react'
import { useTranslation } from '@benlow-rics/i18n/react'
import type { Facets } from '@/types/product'
import type { FilterState } from './FacetedFilters'

interface ActiveFiltersProps {
  filters: FilterState
  facets: Facets | undefined
  onChange: (filters: FilterState) => void
}

export default function ActiveFilters({ filters, facets, onChange }: ActiveFiltersProps) {
  const { t } = useTranslation('storefront')
  const { locale } = useI18nLocale()
  const chips: { label: string; key: keyof FilterState | 'priceRange' }[] = []

  if (filters.department) {
    chips.push({ label: filters.department, key: 'department' })
  }

  if (filters.categoryId != null) {
    const name = facets?.categories.find(c => c.id === filters.categoryId)?.name
    chips.push({ label: name ?? t('catalog.fallbackLabels.category', { id: filters.categoryId }), key: 'categoryId' })
  }

  if (filters.brandId != null) {
    const name = facets?.brands.find(b => b.id === filters.brandId)?.name
    chips.push({ label: name ?? t('catalog.fallbackLabels.brand', { id: filters.brandId }), key: 'brandId' })
  }

  if (filters.sizeLabel) {
    chips.push({ label: t('catalog.activeSize', { size: filters.sizeLabel }), key: 'sizeLabel' })
  }

  if (filters.colorId != null) {
    const name = facets?.colors.find(c => c.id === filters.colorId)?.name
    chips.push({ label: name ?? t('catalog.fallbackLabels.color', { id: filters.colorId }), key: 'colorId' })
  }

  if (filters.materialId != null) {
    const name = facets?.materials?.find(m => m.id === filters.materialId)?.name
    chips.push({ label: name ?? t('catalog.fallbackLabels.material', { id: filters.materialId }), key: 'materialId' })
  }

  if (filters.minPrice != null || filters.maxPrice != null) {
    const min = filters.minPrice != null ? formatHnl(filters.minPrice, locale) : ''
    const max = filters.maxPrice != null ? formatHnl(filters.maxPrice, locale) : ''
    const value = min && max
      ? t('catalog.priceRange', { min, max })
      : min
        ? t('catalog.priceFrom', { value: min })
        : t('catalog.priceTo', { value: max })
    chips.push({ label: t('catalog.priceLabel', { value }), key: 'priceRange' })
  }

  if (!chips.length) return null

  const removeFilter = (key: string) => {
    if (key === 'priceRange') {
      onChange({ ...filters, minPrice: undefined, maxPrice: undefined })
    } else {
      onChange({ ...filters, [key]: undefined })
    }
  }

  const clearAll = () => onChange({})

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
      {chips.map(chip => (
        <Tag
          key={chip.key}
          closable
          onClose={() => removeFilter(chip.key)}
          style={{
            padding: '4px 10px',
            borderRadius: 16,
            fontSize: 13,
            background: '#f5f5f5',
            border: '1px solid #e8e8e8',
            color: '#333',
          }}
        >
          {chip.label}
        </Tag>
      ))}
      {chips.length > 1 && (
        <a
          onClick={clearAll}
          style={{ fontSize: 13, cursor: 'pointer', marginLeft: 4 }}
        >
          {t('catalog.clearAll')}
        </a>
      )}
    </div>
  )
}
