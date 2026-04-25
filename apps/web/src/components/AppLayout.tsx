import { useEffect, useState, type ReactNode } from 'react'
import { Avatar, Button, Dropdown, Layout, Menu, Typography } from 'antd'
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
  PieChartOutlined,
  CrownOutlined,
  AlertOutlined,
  TagOutlined,
  ApartmentOutlined,
  CreditCardOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

const { Header, Sider, Content } = Layout

const PRODUCTS_TAXONOMY_MENU_KEY = '/products/taxonomy'
const PRODUCTS_PIM_MENU_KEY = '/products/pim'
const PRODUCTS_REFERENCE_MENU_KEY = '/products/reference'

const menuItems = [
  {
    key: '/products',
    icon: <AppstoreOutlined />,
    label: 'Products',
    children: [
      { key: '/products/skus/new', icon: <PlusOutlined />, label: 'New SKU' },
      { key: '/products/skus/new-modern', icon: <PlusOutlined />, label: 'New SKU (Modern)' },
      { key: '/inventory/skus', icon: <AppstoreOutlined />, label: 'SKU List' },
      { key: '/inventory/sku-drafts', icon: <FileTextOutlined />, label: 'Borradores de SKU' },
      { key: '/products/inquiry', icon: <SearchOutlined />, label: 'Inquiry' },
      { type: 'divider' as const },
      {
        key: PRODUCTS_TAXONOMY_MENU_KEY,
        label: 'Taxonomy',
        children: [
          { key: '/products/taxonomy/categories', icon: <FileTextOutlined />, label: 'Categories' },
          { key: '/products/taxonomy/departments', icon: <FileTextOutlined />, label: 'Departments' },
          { key: '/products/taxonomy/sectors', icon: <FileTextOutlined />, label: 'Sectors' },
          { key: '/products/taxonomy/groups', icon: <FileTextOutlined />, label: 'Groups' },
          { key: '/products/taxonomy/keywords', icon: <FileTextOutlined />, label: 'Keywords' },
          { key: '/products/taxonomy/seasons', icon: <FileTextOutlined />, label: 'Seasons' },
        ],
      },
      { type: 'divider' as const },
      {
        key: PRODUCTS_PIM_MENU_KEY,
        label: 'PIM',
        children: [
          { key: '/products/attributes', icon: <AppstoreOutlined />, label: 'Attributes' },
          { key: '/products/families', icon: <AppstoreOutlined />, label: 'Product Families' },
        ],
      },
      { type: 'divider' as const },
      {
        key: PRODUCTS_REFERENCE_MENU_KEY,
        label: 'Reference',
        children: [
          { key: '/products/vendors', icon: <AppstoreOutlined />, label: 'Vendors' },
          { key: '/products/taxonomy/size-types', icon: <FileTextOutlined />, label: 'Size Types' },
          { key: '/products/taxonomy/return-codes', icon: <FileTextOutlined />, label: 'Return Codes' },
          { key: '/products/taxonomy/promotion-codes', icon: <FileTextOutlined />, label: 'Promotion Codes' },
        ],
      },
      { type: 'divider' as const },
      {
        type: 'group' as const,
        label: 'Legacy (temporary)',
        children: [
          { key: '/products/skus', icon: <AppstoreOutlined />, label: 'SKUs (Phase 1)' },
          { key: '/products/skus/new-alt', icon: <FileTextOutlined />, label: 'New SKU alt' },
        ],
      },
    ],
  },
  {
    key: '/inventory',
    icon: <ShopOutlined />,
    label: 'Inventory',
    children: [
      { key: '/inventory/adjustments', icon: <SwapOutlined />, label: 'Stock Maintenance' },
      { key: '/inventory/balances', icon: <InboxOutlined />, label: 'Balances' },
      { key: '/inventory/find-by-size', icon: <ColumnHeightOutlined />, label: 'Find by Size' },
      { key: '/inventory/replenishment', icon: <FundOutlined />, label: 'Model Quantities' },
      { key: '/inventory/transfers/manual', icon: <SwapOutlined />, label: 'Transfer - Manual' },
      { key: '/inventory/transfers/automatic', icon: <ExperimentOutlined />, label: 'Transfer - Automatic' },
      { key: '/inventory/transfers/balancing', icon: <ExperimentOutlined />, label: 'Transfer - Balancing (Legacy)' },
      { key: '/inventory/transfers/balancing-v2', icon: <ExperimentOutlined />, label: 'Transfer - Balancing v2' },
      { key: '/inventory/movements', icon: <SyncOutlined />, label: 'Movements' },
      { key: '/inventory/change-detail', icon: <HistoryOutlined />, label: 'Change Detail' },
      { key: '/inventory/sales-ledger', icon: <HistoryOutlined />, label: 'Sales Ledger' },
      { key: '/inventory/audit', icon: <AuditOutlined />, label: 'Audit' },
      // Demoted - not in active use (muted style)
      { key: '/inventory/dashboard', icon: <DashboardOutlined />, label: <DemotedLabel>Dashboard</DemotedLabel> },
    ],
  },
  {
    key: '/purchase-planning',
    icon: <FundOutlined />,
    label: 'Plan de Compras',
  },
  {
    key: '/sales',
    icon: <CreditCardOutlined />,
    label: 'Sales POS',
    children: [
      { key: '/sales/enter', icon: <CreditCardOutlined />, label: 'Enter Sales' },
    ],
  },
  {
    key: '/customers-group',
    icon: <TeamOutlined />,
    label: 'Customer Intelligence',
    children: [
      { key: '/customers/dashboard', icon: <PieChartOutlined />, label: 'Dashboard' },
      { key: '/customers/intelligence', icon: <TeamOutlined />, label: 'Customers (KPI)' },
      { key: '/customers', icon: <TeamOutlined />, label: 'Customer Records' },
      { key: '/customers/segments', icon: <ApartmentOutlined />, label: 'Segments' },
      { key: '/customers/churn-risk', icon: <AlertOutlined />, label: 'Churn Risk' },
      { key: '/customers/vip', icon: <CrownOutlined />, label: 'VIP Customers' },
      { key: '/customers/discount-sensitive', icon: <TagOutlined />, label: 'Discount Sensitivity' },
    ],
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
      // Demoted - not in active use (muted style)
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
      { key: '/utilities/overview', icon: <ExperimentOutlined />, label: 'Overview' },
      { key: '/utilities/change-sku-attributes', icon: <FileTextOutlined />, label: 'Change SKU Attributes' },
      { key: '/utilities/change-keywords', icon: <FileTextOutlined />, label: 'Change Keywords' },
      { key: '/utilities/batch-history', icon: <HistoryOutlined />, label: 'Batch History' },
    ],
  },
  // Demoted: modules not in active use.
  // Parents render with a muted style so they read as deprioritised against the dark sider.
  // Routes stay mounted in App.tsx, so direct URLs still resolve.
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
      <span style={{ fontSize: 11, opacity: 0.85 }}>- no en uso</span>
    </span>
  )
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentPath = location.pathname
  const { user, logout } = useAuth()

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

  const collectMenuKeys = (items: readonly any[]): string[] => {
    const out: string[] = []
    for (const item of items) {
      if (!item || item.type === 'divider') continue
      if (typeof item.key === 'string') out.push(item.key)
      if (Array.isArray(item.children)) out.push(...collectMenuKeys(item.children))
    }
    return out
  }

  // Walk nested items (SubMenu children may themselves be Group items with their own children)
  // and collect every leaf key. Dividers and Groups carry no clickable key of their own - only
  // the inner leaves do.
  const collectLeafKeys = (items: readonly any[]): string[] => {
    const out: string[] = []
    for (const item of items) {
      if (!item || item.type === 'divider') continue
      if (Array.isArray(item.children)) out.push(...collectLeafKeys(item.children))
      else if (typeof item.key === 'string') out.push(item.key)
    }
    return out
  }

  const collectOpenKeysForPath = (items: readonly any[], path: string, ancestors: string[] = []): string[] => {
    for (const item of items) {
      if (!item || item.type === 'divider') continue

      const itemKey = typeof item.key === 'string' ? item.key : null
      const nextAncestors = itemKey ? [...ancestors, itemKey] : ancestors

      if (Array.isArray(item.children)) {
        const childMatch = collectOpenKeysForPath(item.children, path, nextAncestors)
        if (childMatch.length > 0) return childMatch
        if (itemKey && (path === itemKey || path.startsWith(`${itemKey}/`))) return nextAncestors
      } else if (itemKey && (path === itemKey || path.startsWith(`${itemKey}/`))) {
        return ancestors
      }
    }
    return []
  }

  const allMenuKeys = menuItems.flatMap((item) =>
    item.children ? [item.key, ...collectMenuKeys(item.children)] : typeof item.key === 'string' ? [item.key] : [],
  )
  const allLeafKeys = menuItems.flatMap((item) =>
    item.children ? collectLeafKeys(item.children) : typeof item.key === 'string' ? [item.key] : [],
  )

  const selectedMenuKey =
    allMenuKeys
      .filter((key) => typeof key === 'string' && (currentPath === key || currentPath.startsWith(`${key}/`)))
      .sort((a, b) => b.length - a.length)[0] ?? '/inventory/adjustments'

  const selectedLeaf =
    allLeafKeys
      .filter((key) => currentPath === key || currentPath.startsWith(`${key}/`))
      .sort((a, b) => b.length - a.length)[0] ?? selectedMenuKey

  const activeModule =
    menuItems.find(
      (item) =>
        typeof item.key === 'string' &&
        (currentPath === item.key || currentPath.startsWith(`${item.key}/`)),
    ) ??
    menuItems.find((item) => item.children && collectMenuKeys(item.children).includes(selectedMenuKey)) ??
    menuItems[0]

  const desiredOpenKeys = Array.from(new Set(collectOpenKeysForPath(menuItems, currentPath)))
  const [openKeys, setOpenKeys] = useState<string[]>(() => desiredOpenKeys)

  useEffect(() => {
    setOpenKeys(desiredOpenKeys)
  }, [currentPath])

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
          onClick={({ key }) => navigate(key === '/utilities/overview' ? '/utilities' : key)}
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
