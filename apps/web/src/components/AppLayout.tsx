import { useState } from 'react'
import { Layout, Menu, Typography } from 'antd'
import {
  ShopOutlined,
  DashboardOutlined,
  SwapOutlined,
  FileTextOutlined,
  InboxOutlined,
  BarChartOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  FundOutlined,
  ShoppingOutlined,
  ShoppingCartOutlined,
  ExperimentOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  SearchOutlined,
  ColumnHeightOutlined,
  HistoryOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'

const { Header, Sider, Content } = Layout

const menuItems = [
  {
    key: '/products',
    icon: <AppstoreOutlined />,
    label: 'Products',
    children: [
      { key: '/inventory/inquiry', icon: <SearchOutlined />, label: 'Inquiry' },
      { key: '/inventory/skus', icon: <AppstoreOutlined />, label: 'SKU List' },
    ],
  },
  {
    key: '/inventory',
    icon: <ShopOutlined />,
    label: 'Inventory',
    children: [
      { key: '/inventory/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
      { key: '/inventory/find-by-size', icon: <ColumnHeightOutlined />, label: 'Find by Size' },
      { key: '/inventory/replenishment', icon: <FundOutlined />, label: 'Replenishment' },
      { key: '/inventory/balances', icon: <InboxOutlined />, label: 'Balances' },
      { key: '/inventory/adjustments', icon: <SwapOutlined />, label: 'Adjustments' },
      { key: '/inventory/movements', icon: <SyncOutlined />, label: 'Movements' },
    ],
  },
  {
    key: '/sales',
    icon: <ShoppingCartOutlined />,
    label: 'Sales',
    children: [
      { key: '/inventory/sales-ledger', icon: <HistoryOutlined />, label: 'Sales Ledger' },
    ],
  },
  {
    key: '/purchasing',
    icon: <ShoppingOutlined />,
    label: 'Purchasing',
    children: [
      { key: '/purchasing/orders', icon: <FileTextOutlined />, label: 'Control Tower' },
      { key: '/purchasing/receive', icon: <InboxOutlined />, label: 'Receive POs' },
      {
        key: '/purchasing/orders/new-spec-preview',
        icon: <ExperimentOutlined />,
        label: 'PO Entry (Spec Preview)',
      },
      {
        key: '/purchasing/receive-spec-preview',
        icon: <ExperimentOutlined />,
        label: 'Receive PO (Spec Preview)',
      },
    ],
  },
  {
    key: '/otb',
    icon: <BarChartOutlined />,
    label: 'OTB',
    children: [
      { key: '/otb/monthly-plans', icon: <CalendarOutlined />, label: 'Monthly Plans' },
      { key: '/otb/dashboard', icon: <DashboardOutlined />, label: 'Budget Dashboard' },
    ],
  },
  {
    key: '/customers',
    icon: <TeamOutlined />,
    label: 'Customers',
  },
  {
    key: '/reports',
    icon: <FileTextOutlined />,
    label: 'Reports',
    children: [
      { key: '/reports/on-hand', icon: <FileTextOutlined />, label: 'On-Hand' },
      { key: '/reports/inventory-detail', icon: <InboxOutlined />, label: 'Inventory Detail' },
      { key: '/reports/transfer-summary', icon: <SwapOutlined />, label: 'Transfer Summary' },
      { key: '/reports/sales', icon: <BarChartOutlined />, label: 'Sales' },
      { key: '/reports/turnover', icon: <SyncOutlined />, label: 'Turnover' },
      { key: '/reports/aging', icon: <ClockCircleOutlined />, label: 'Aging' },
      { key: '/reports/sell-through', icon: <FundOutlined />, label: 'Sell-Through' },
      { key: '/reports/others', icon: <AppstoreOutlined />, label: 'Others' },
    ],
  },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentPath = location.pathname

  const allLeafKeys = menuItems.flatMap((item) =>
    item.children ? item.children.map((child) => child.key) : [item.key],
  )

  const selectedLeaf =
    allLeafKeys
      .filter((key) => currentPath === key || currentPath.startsWith(`${key}/`))
      .sort((a, b) => b.length - a.length)[0] ?? '/inventory/dashboard'

  // Keep the currently active module's submenu open, but let the user expand
  // or collapse any of the others by clicking the header. `openKeys` is
  // stateful; we seed it with the active module on first render and from then
  // on the Menu's `onOpenChange` is the source of truth.
  const activeModule =
    menuItems.find((item) => currentPath === item.key || currentPath.startsWith(`${item.key}/`)) ??
    menuItems.find((item) => item.children?.some((child) => child.key === selectedLeaf)) ??
    menuItems[0]
  const [openKeys, setOpenKeys] = useState<string[]>(() => (activeModule ? [activeModule.key] : []))

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
          selectedKeys={[selectedLeaf]}
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys as string[])}
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
            {activeModule?.label ?? 'Inventory'}
          </Typography.Title>
        </Header>
        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
