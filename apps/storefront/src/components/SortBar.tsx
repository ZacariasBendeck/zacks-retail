import { Select, Typography, Space } from 'antd'

interface SortBarProps {
  total: number
  sort: string
  order: string
  onSortChange: (sort: string, order: string) => void
}

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Nombre: A-Z' },
  { value: 'name_desc', label: 'Nombre: Z-A' },
  { value: 'price_asc', label: 'Precio: Menor a Mayor' },
  { value: 'price_desc', label: 'Precio: Mayor a Menor' },
  { value: 'newest_desc', label: 'Mas Recientes' },
]

export default function SortBar({ total, sort, order, onSortChange }: SortBarProps) {
  const currentValue = `${sort}_${order}`

  const handleChange = (value: string) => {
    const [s, o] = value.split('_') as [string, string]
    onSortChange(s, o)
  }

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
          value={currentValue}
          onChange={handleChange}
          options={SORT_OPTIONS}
          style={{ width: 220 }}
        />
      </Space>
    </div>
  )
}
