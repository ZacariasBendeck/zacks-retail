import { Select, Typography, Space } from 'antd'

interface SortBarProps {
  total: number
  sort: string
  onSortChange: (sort: string) => void
}

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Más Relevante' },
  { value: 'price_asc', label: 'Precio: Menor a Mayor' },
  { value: 'price_desc', label: 'Precio: Mayor a Menor' },
  { value: 'newest', label: 'Más Recientes' },
  { value: 'rating', label: 'Mejor Valorados' },
]

export default function SortBar({ total, sort, onSortChange }: SortBarProps) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
      padding: '8px 0',
      borderBottom: '1px solid #f0f0f0',
    }}>
      <Typography.Text>
        <strong>{total.toLocaleString()}</strong> resultados
      </Typography.Text>
      <Space>
        <Typography.Text type="secondary">Ordenar por:</Typography.Text>
        <Select
          value={sort}
          onChange={onSortChange}
          options={SORT_OPTIONS}
          style={{ width: 200 }}
        />
      </Space>
    </div>
  )
}
