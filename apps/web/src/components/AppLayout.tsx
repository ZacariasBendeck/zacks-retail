import { useState, type ReactNode } from 'react'
import { Avatar, Button, Dropdown, Layout, Menu, Tooltip, Typography } from 'antd'
import {
  UserOutlined,
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
  ExperimentOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  SearchOutlined,
  PlusOutlined,
  ColumnHeightOutlined,
  HistoryOutlined,
  TeamOutlined,
  AuditOutlined,
  BookOutlined,
  CameraOutlined,
  FullscreenExitOutlined,
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

const { Header, Sider, Content } = Layout

const menuItems = [
  {
    key: '/products',
    icon: <AppstoreOutlined />,
    label: 'Products',
    children: [
      { key: '/products/skus/new', icon: <PlusOutlined />, label: 'New SKU' },
      { key: '/products/skus/new-alt', icon: <FileTextOutlined />, label: 'New SKU alt' },
      { key: '/products/inquiry', icon: <SearchOutlined />, label: 'Inquiry' },
      { key: '/inventory/skus', icon: <AppstoreOutlined />, label: 'SKU List' },
      { key: '/products/taxonomy', icon: <AppstoreOutlined />, label: 'Taxonomy' },
      { key: '/products/taxonomy/departments', icon: <FileTextOutlined />, label: '\u2014 Departments' },
      { key: '/products/taxonomy/categories', icon: <FileTextOutlined />, label: '\u2014 Categories' },
      { key: '/products/taxonomy/sectors', icon: <FileTextOutlined />, label: '\u2014 Sectors' },
      { key: '/products/taxonomy/groups', icon: <FileTextOutlined />, label: '\u2014 Groups' },
      { key: '/products/taxonomy/keywords', icon: <FileTextOutlined />, label: '\u2014 Keywords' },
      { key: '/products/taxonomy/seasons', icon: <FileTextOutlined />, label: '\u2014 Seasons' },
      { key: '/products/taxonomy/return-codes', icon: <FileTextOutlined />, label: '\u2014 Return Codes' },
      { key: '/products/taxonomy/promotion-codes', icon: <FileTextOutlined />, label: '\u2014 Promotion Codes' },
      { key: '/products/taxonomy/size-types', icon: <FileTextOutlined />, label: '\u2014 Size Types' },
      { key: '/products/vendors', icon: <AppstoreOutlined />, label: 'Vendors' },
      { key: '/products/skus', icon: <AppstoreOutlined />, label: 'SKUs (Phase 1)' },
      { key: '/products/attributes', icon: <AppstoreOutlined />, label: 'Atributos' },
      { key: '/products/families', icon: <AppstoreOutlined />, label: 'Familias' },
    ],
  },
  {
    key: '/inventory',
    icon: <ShopOutlined />,
    label: 'Inventory',
    children: [
      { key: '/inventory/sales-ledger', icon: <HistoryOutlined />, label: 'Sales Ledger' },
      { key: '/inventory/balances', icon: <InboxOutlined />, label: 'Balances' },
      { key: '/inventory/adjustments', icon: <SwapOutlined />, label: 'Adjustments' },
      { key: '/inventory/transfers/manual', icon: <SwapOutlined />, label: 'Transfer \u2014 Manual' },
      { key: '/inventory/transfers/auto-preview', icon: <ExperimentOutlined />, label: 'Transfer \u2014 Auto (preview)' },
      { key: '/inventory/transfers/balancing-preview', icon: <ExperimentOutlined />, label: 'Transfer \u2014 Balancing (preview)' },
      { key: '/inventory/movements', icon: <SyncOutlined />, label: 'Movements' },
      { key: '/inventory/change-detail', icon: <HistoryOutlined />, label: 'Change Detail' },
      { key: '/inventory/audit', icon: <AuditOutlined />, label: 'Audit' },
      // Demoted — not in active use (muted style)
      { key: '/inventory/dashboard', icon: <DashboardOutlined />, label: <DemotedLabel>Dashboard</DemotedLabel> },
      { key: '/inventory/find-by-size', icon: <ColumnHeightOutlined />, label: <DemotedLabel>Find by Size</DemotedLabel> },
      { key: '/inventory/replenishment', icon: <FundOutlined />, label: <DemotedLabel>Replenishment</DemotedLabel> },
    ],
  },
  {
    key: '/purchase-planning',
    icon: <FundOutlined />,
    label: 'Plan de Compras',
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
      { key: '/reports/inventory-detail', icon: <InboxOutlined />, label: 'Inventory Detail' },
      { key: '/reports/transfer-summary', icon: <SwapOutlined />, label: 'Transfer Summary' },
      { key: '/reports/recommended-transfers', icon: <FundOutlined />, label: 'Recommended Transfers' },
      { key: '/reports/sales', icon: <BarChartOutlined />, label: 'Sales' },
      { key: '/reports/others', icon: <AppstoreOutlined />, label: 'Others' },
      { key: '/reports/templates', icon: <BookOutlined />, label: 'Templates' },
      { key: '/reports/runs', icon: <CameraOutlined />, label: 'Snapshots' },
      // Demoted — not in active use (muted style)
      { key: '/reports/on-hand', icon: <FileTextOutlined />, label: <DemotedLabel>On-Hand</DemotedLabel> },
      { key: '/reports/turnover', icon: <SyncOutlined />, label: <DemotedLabel>Turnover</DemotedLabel> },
      { key: '/reports/sell-through', icon: <FundOutlined />, label: <DemotedLabel>Sell-Through</DemotedLabel> },
      { key: '/reports/aging', icon: <ClockCircleOutlined />, label: <DemotedLabel>Aging</DemotedLabel> },
    ],
  },
  {
    key: '/utilities',
    icon: <ExperimentOutlined />,
    label: 'Utilities',
    children: [
      { key: '/utilities', icon: <ExperimentOutlined />, label: 'Overview' },
      { key: '/utilities/change-sku-attributes', icon: <FileTextOutlined />, label: 'Change SKU Attributes' },
      { key: '/utilities/change-keywords', icon: <FileTextOutlined />, label: 'Change Keywords' },
      { key: '/utilities/batch-history', icon: <HistoryOutlined />, label: 'Batch History' },
    ],
  },
  // ──────────────── Demoted: modules not in active use ────────────────
  // Parents render with a muted/italic style so they read as deprioritised
  // against the dark sider. Routes stay mounted in App.tsx — direct URLs
  // still resolve.
  {
    key: '/purchasing',
    icon: <ShoppingOutlined />,
    label: <DemotedLabel>Purchasing</DemotedLabel>,
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
    label: <DemotedLabel>OTB</DemotedLabel>,
    children: [
      { key: '/otb/monthly-plans', icon: <CalendarOutlined />, label: 'Monthly Plans' },
      { key: '/otb/dashboard', icon: <DashboardOutlined />, label: 'Budget Dashboard' },
    ],
  },
]

function DemotedLabel({ children }: { children: ReactNode }) {
  return (
    <span style={{ opacity: 0.55, fontStyle: 'italic' }}>
      {children}{' '}
      <span style={{ fontSize: 11, opacity: 0.85 }}>— no en uso</span>
    </span>
  )
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentPath = location.pathname
  const { user, logout } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const isFullscreen = searchParams.get('fullscreen') === '1'

  // Fullscreen mode: hide sidebar + header so reports (and any page that
  // wants more canvas) get the entire viewport. The floating "Exit full
  // screen" pill in the top-right clears the flag and restores chrome.
  if (isFullscreen) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Content style={{ margin: 16, position: 'relative' }}>
          <div
            style={{
              position: 'fixed',
              top: 12,
              right: 16,
              zIndex: 1000,
            }}
          >
            <Tooltip title="Exit full screen">
              <Button
                size="small"
                icon={<FullscreenExitOutlined />}
                onClick={() => {
                  const next = new URLSearchParams(searchParams)
                  next.delete('fullscreen')
                  setSearchParams(next, { replace: true })
                }}
              >
                Exit full screen
              </Button>
            </Tooltip>
          </div>
          <Outlet />
        </Content>
      </Layout>
    )
  }

  const userMenuItems = [
    {
      key: 'me',
      label: 'My account',
      onClick: () => navigate('/me'),
    },
    {
      key: 'users',
      label: 'Users',
      onClick: () => navigate('/admin/users'),
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      label: 'Sign out',
      onClick: async () => {
        await logout()
        navigate('/login')
      },
    },
  ]

  const allLeafKeys = menuItems.flatMap((item) =>
    item.children ? item.children.map((child) => child.key) : [item.key],
  )

  const selectedLeaf =
    allLeafKeys
      .filter((key) => currentPath === key || currentPath.startsWith(`${key}/`))
      .sort((a, b) => b.length - a.length)[0] ?? '/inventory/dashboard'

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
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Typography.Title level={4} style={{ margin: 0 }}>
            {activeModule?.label ?? 'Inventory'}
          </Typography.Title>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Button type="text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size="small" icon={<UserOutlined />} />
              {user?.displayName ?? user?.email ?? 'Account'}
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
