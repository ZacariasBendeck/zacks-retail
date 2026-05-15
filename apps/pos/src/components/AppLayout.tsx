import { Layout, Menu, Typography } from 'antd'
import { ShoppingCartOutlined } from '@ant-design/icons'
import { LanguageSelector } from '@benlow-rics/i18n/react'
import { useTranslation } from '@benlow-rics/i18n/react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'

const { Header, Sider, Content } = Layout

// The POS is intentionally minimal — cashiers only need register + a couple of
// future screens (shift summary, reprint posted). Admin modules stay in apps/web.
export default function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { t } = useTranslation('pos')
  const menuItems = [
    { key: '/checkout', icon: <ShoppingCartOutlined />, label: t('layout.checkout') },
  ]

  const selected =
    menuItems.find((i) => pathname === i.key || pathname.startsWith(`${i.key}/`))?.key ??
    '/checkout'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth={60} width={200}>
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <Typography.Text strong style={{ color: '#fff', fontSize: 16 }}>
            {t('layout.brand')}
          </Typography.Text>
          <div>
            <Typography.Text style={{ color: '#94a3b8', fontSize: 12 }}>
              {t('layout.register')}
            </Typography.Text>
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid #f0f0f0',
              justifyContent: 'space-between',
          }}
        >
          <Typography.Title level={4} style={{ margin: 0 }}>
            {t('layout.register')}
          </Typography.Title>
          <LanguageSelector />
        </Header>
        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
