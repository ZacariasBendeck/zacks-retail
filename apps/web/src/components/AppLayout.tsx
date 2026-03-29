import { Layout, Menu, Typography } from 'antd'
import { ShopOutlined, DashboardOutlined, PlusOutlined, SwapOutlined, FileTextOutlined, InboxOutlined, BarChartOutlined, SyncOutlined, ClockCircleOutlined, FundOutlined } from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'

const { Header, Sider, Content } = Layout

const menuItems = [
  {
    key: '/dashboard',
    icon: <DashboardOutlined />,
    label: 'Dashboard',
  },
  {
    key: '/inventory/skus',
    icon: <ShopOutlined />,
    label: 'SKU List',
  },
  {
    key: '/inventory/skus/new',
    icon: <PlusOutlined />,
    label: 'New SKU',
  },
  {
    key: '/inventory/adjustments',
    icon: <SwapOutlined />,
    label: 'Adjustments',
  },
  {
    key: '/purchasing/receive',
    icon: <InboxOutlined />,
    label: 'Receive POs',
  },
  {
    key: '/reports/on-hand',
    icon: <FileTextOutlined />,
    label: 'On-Hand Report',
  },
  {
    key: '/reports/sales',
    icon: <BarChartOutlined />,
    label: 'Sales Report',
  },
  {
    key: '/reports/turnover',
    icon: <SyncOutlined />,
    label: 'Turnover Report',
  },
  {
    key: '/reports/aging',
    icon: <ClockCircleOutlined />,
    label: 'Aging Report',
  },
  {
    key: '/reports/sell-through',
    icon: <FundOutlined />,
    label: 'Sell-Through',
  },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth={60}>
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <Typography.Text strong style={{ color: '#fff', fontSize: 16 }}>
            Benlow RICS
          </Typography.Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
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
          }}
        >
          <Typography.Title level={4} style={{ margin: 0 }}>
            Inventory Management
          </Typography.Title>
        </Header>
        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
