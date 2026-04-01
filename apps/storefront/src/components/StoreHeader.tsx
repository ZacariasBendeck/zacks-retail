import { Layout, Input, Space, Typography, Badge, Button } from 'antd'
import { SearchOutlined, ShoppingCartOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import MegaMenu from './MegaMenu'
import { useCartStore } from '@/store/cartStore'

const { Header } = Layout

export default function StoreHeader() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [searchValue, setSearchValue] = useState(searchParams.get('q') ?? '')
  const { cart, loadCart } = useCartStore()

  useEffect(() => {
    loadCart()
  }, [loadCart])

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
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Mobile hamburger - shown via MegaMenu CSS */}
            <div className="mega-menu-mobile-trigger" style={{ display: 'none' }}>
              {/* MegaMenu renders its own trigger button */}
            </div>
            <Typography.Title
              level={3}
              style={{ margin: 0, cursor: 'pointer', color: '#1677ff' }}
              onClick={() => navigate('/')}
            >
              Zapateria
            </Typography.Title>
          </div>

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
            <Badge count={cart?.itemCount ?? 0} showZero={false}>
              <Button type="text" icon={<ShoppingCartOutlined />} onClick={() => navigate('/cart')}>
                Carrito
              </Button>
            </Badge>
          </Space>
        </div>
      </div>

      {/* Mega dropdown navigation */}
      <MegaMenu />
    </Header>
  )
}
