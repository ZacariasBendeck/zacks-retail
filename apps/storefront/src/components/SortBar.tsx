import { Select, Typography, Space } from 'antd'
import { useTranslation } from '@benlow-rics/i18n/react'

interface SortBarProps {
  total: number
  sort: string
  order: string
  onSortChange: (sort: string, order: string) => void
}

export default function SortBar({ total, sort, order, onSortChange }: SortBarProps) {
  const { t } = useTranslation('storefront')
  const currentValue = `${sort}_${order}`
  const sortOptions = [
    { value: 'name_asc', label: t('catalog.sort.nameAsc') },
    { value: 'name_desc', label: t('catalog.sort.nameDesc') },
    { value: 'price_asc', label: t('catalog.sort.priceAsc') },
    { value: 'price_desc', label: t('catalog.sort.priceDesc') },
    { value: 'newest_desc', label: t('catalog.sort.newest') },
  ]

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
        {t('catalog.results', { count: total })}
      </Typography.Text>
      <Space>
        <Typography.Text type="secondary">{t('catalog.sortBy')}</Typography.Text>
        <Select
          value={currentValue}
          onChange={handleChange}
          options={sortOptions}
          style={{ width: 220 }}
        />
      </Space>
    </div>
  )
}
