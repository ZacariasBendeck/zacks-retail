import { Breadcrumb } from 'antd'
import { HomeOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from '@benlow-rics/i18n/react'

export default function Breadcrumbs() {
  const { t } = useTranslation('storefront')
  const [searchParams] = useSearchParams()
  const category = searchParams.get('category')
  const q = searchParams.get('q')

  const items: { title: ReactNode; href: string }[] = [
    { title: <><HomeOutlined /> {t('catalog.home')}</>, href: '/' },
    { title: t('product.shoes'), href: '/' },
  ]

  if (category) {
    items.push({ title: category, href: `/?category=${category}` })
  }
  if (q) {
    items.push({ title: t('catalog.searchResults', { query: q }), href: '' })
  }

  return (
    <Breadcrumb
      items={items}
      style={{ marginBottom: 16 }}
    />
  )
}
