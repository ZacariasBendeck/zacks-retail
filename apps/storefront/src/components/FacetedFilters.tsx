import { Checkbox, Collapse, InputNumber, Space, Typography, Button } from 'antd'
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

  const sections = [
    {
      key: 'department',
      label: `Departamento${filters.department ? ' (1)' : ''}`,
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
      label: `Categoria${filters.categoryId != null ? ' (1)' : ''}`,
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
      label: `Marca${filters.brandId != null ? ' (1)' : ''}`,
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
      label: `Talla${filters.sizeLabel ? ' (1)' : ''}`,
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
      label: `Color${filters.colorId != null ? ' (1)' : ''}`,
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
      label: 'Precio',
      children: (
        <div>
          {facets?.priceRange && (
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
              Rango: L {facets.priceRange.min.toLocaleString('en-US', { maximumFractionDigits: 0 })} - L {facets.priceRange.max.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </Typography.Text>
          )}
          <Space>
            <InputNumber
              placeholder="Min"
              prefix="$"
              value={filters.minPrice}
              onChange={(v) => onChange({ ...filters, minPrice: v ?? undefined })}
              style={{ width: 100 }}
              min={0}
            />
            <span>-</span>
            <InputNumber
              placeholder="Max"
              prefix="$"
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
      label: `Material${filters.materialId != null ? ' (1)' : ''}`,
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
            Limpiar filtros
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
