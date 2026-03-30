import { Layout, Input, Menu, Space, Typography, Badge, Button } from 'antd'
import { SearchOutlined, ShoppingCartOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useState } from 'react'

const { Header } = Layout

const CATEGORIES = [
  { key: 'all', label: 'Todos' },
  { key: 'Formal', label: 'Formal' },
  { key: 'Casual', label: 'Casual' },
  { key: 'Fiesta', label: 'Fiesta' },
  { key: 'Sandalias', label: 'Sandalias' },
  { key: 'Botas', label: 'Botas' },
  { key: 'Comfort', label: 'Comfort' },
]

export default function StoreHeader() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const currentCategory = searchParams.get('category') ?? 'all'
  const [searchValue, setSearchValue] = useState(searchParams.get('q') ?? '')

  const handleSearch = (value: string) => {
    const params = new URLSearchParams(searchParams)
    if (value) {
      params.set('q', value)
    } else {
      params.delete('q')
    }
    params.set('page', '1')
    navigate(`/?${params}`)
  }

  const handleCategoryClick = (key: string) => {
    const params = new URLSearchParams()
    if (key !== 'all') params.set('category', key)
    params.set('page', '1')
    navigate(`/?${params}`)
  }

  return (
    <Header
      style={{
        background: '#fff',
        padding: 0,
        height: 'auto',
        lineHeight: 'normal',
        borderBottom: '1px solid #f0f0f0',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px' }}>
        {/* Top bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 0',
          borderBottom: '1px solid #f5f5f5',
        }}>
          <Typography.Title
            level={3}
            style={{ margin: 0, cursor: 'pointer', color: '#1677ff' }}
            onClick={() => navigate('/')}
          >
            Zapatería
          </Typography.Title>

          <Input.Search
            placeholder="Buscar zapatos..."
            allowClear
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onSearch={handleSearch}
            prefix={<SearchOutlined />}
            style={{ maxWidth: 500, flex: 1, margin: '0 40px' }}
            size="large"
          />

          <Space size="middle">
            <Button type="text" icon={<UserOutlined />}>Mi Cuenta</Button>
            <Badge count={0} showZero={false}>
              <Button type="text" icon={<ShoppingCartOutlined />}>Carrito</Button>
            </Badge>
          </Space>
        </div>

        {/* Category nav */}
        <Menu
          mode="horizontal"
          selectedKeys={[currentCategory]}
          items={CATEGORIES.map(c => ({
            key: c.key,
            label: c.label,
            onClick: () => handleCategoryClick(c.key),
          }))}
          style={{ border: 'none', fontWeight: 500 }}
        />
      </div>
    </Header>
  )
}
