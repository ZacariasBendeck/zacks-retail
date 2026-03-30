import { Breadcrumb } from 'antd'
import { HomeOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'

export default function Breadcrumbs() {
  const [searchParams] = useSearchParams()
  const category = searchParams.get('category')
  const q = searchParams.get('q')

  const items = [
    { title: <><HomeOutlined /> Inicio</>, href: '/' },
    { title: 'Zapatos', href: '/' },
  ]

  if (category) {
    items.push({ title: category, href: `/?category=${category}` })
  }
  if (q) {
    items.push({ title: `Resultados: "${q}"`, href: '' })
  }

  return (
    <Breadcrumb
      items={items}
      style={{ marginBottom: 16 }}
    />
  )
}
