import { Checkbox, Collapse, InputNumber, Space, Typography, Button } from 'antd'
import type { Facets } from '@/types/product'

interface FilterState {
  brand: string[]
  size: string[]
  color: string[]
  material: string[]
  style: string[]
  price_min?: number
  price_max?: number
}

interface FacetedFiltersProps {
  facets: Facets | undefined
  filters: FilterState
  onChange: (filters: FilterState) => void
  loading?: boolean
}

function FilterSection({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string; count: number }[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  if (!options.length) return null
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {options.map(opt => (
          <div key={opt.value} style={{ padding: '3px 0' }}>
            <Checkbox
              checked={selected.includes(opt.value)}
              onChange={() => onToggle(opt.value)}
            >
              <span>{opt.label}</span>
              <Typography.Text type="secondary" style={{ marginLeft: 4 }}>
                ({opt.count})
              </Typography.Text>
            </Checkbox>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function FacetedFilters({ facets, filters, onChange, loading }: FacetedFiltersProps) {
  const toggle = (key: keyof Pick<FilterState, 'brand' | 'size' | 'color' | 'material' | 'style'>, value: string) => {
    const current = filters[key]
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value]
    onChange({ ...filters, [key]: next })
  }

  const hasActiveFilters = filters.brand.length > 0 || filters.size.length > 0 ||
    filters.color.length > 0 || filters.material.length > 0 || filters.style.length > 0 ||
    filters.price_min != null || filters.price_max != null

  const clearAll = () => {
    onChange({ brand: [], size: [], color: [], material: [], style: [], price_min: undefined, price_max: undefined })
  }

  const sections = [
    {
      key: 'category',
      label: 'Categoría',
      children: <FilterSection options={facets?.categories ?? []} selected={[]} onToggle={() => {}} />,
    },
    {
      key: 'brand',
      label: `Marca${filters.brand.length ? ` (${filters.brand.length})` : ''}`,
      children: <FilterSection options={facets?.brands ?? []} selected={filters.brand} onToggle={(v) => toggle('brand', v)} />,
    },
    {
      key: 'size',
      label: `Talla${filters.size.length ? ` (${filters.size.length})` : ''}`,
      children: <FilterSection options={facets?.sizes ?? []} selected={filters.size} onToggle={(v) => toggle('size', v)} />,
    },
    {
      key: 'color',
      label: `Color${filters.color.length ? ` (${filters.color.length})` : ''}`,
      children: <FilterSection options={facets?.colors ?? []} selected={filters.color} onToggle={(v) => toggle('color', v)} />,
    },
    {
      key: 'price',
      label: 'Precio',
      children: (
        <Space>
          <InputNumber
            placeholder="Min"
            prefix="$"
            value={filters.price_min}
            onChange={(v) => onChange({ ...filters, price_min: v ?? undefined })}
            style={{ width: 100 }}
            min={0}
          />
          <span>-</span>
          <InputNumber
            placeholder="Max"
            prefix="$"
            value={filters.price_max}
            onChange={(v) => onChange({ ...filters, price_max: v ?? undefined })}
            style={{ width: 100 }}
            min={0}
          />
        </Space>
      ),
    },
    {
      key: 'material',
      label: `Material${filters.material.length ? ` (${filters.material.length})` : ''}`,
      children: <FilterSection options={facets?.materials ?? []} selected={filters.material} onToggle={(v) => toggle('material', v)} />,
    },
    {
      key: 'style',
      label: `Estilo${filters.style.length ? ` (${filters.style.length})` : ''}`,
      children: <FilterSection options={facets?.styles ?? []} selected={filters.style} onToggle={(v) => toggle('style', v)} />,
    },
  ]

  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      {hasActiveFilters && (
        <div style={{ marginBottom: 12 }}>
          <Button type="link" onClick={clearAll} style={{ padding: 0 }}>
            Limpiar filtros
          </Button>
        </div>
      )}
      <Collapse
        defaultActiveKey={['brand', 'size', 'color', 'price']}
        ghost
        items={sections}
        expandIconPosition="end"
      />
    </div>
  )
}

export type { FilterState }
