import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
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
  PieChartOutlined,
  CrownOutlined,
  AlertOutlined,
  TagOutlined,
  ApartmentOutlined,
  CreditCardOutlined,
  ContainerOutlined,
  QuestionCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { PageHelpDrawer, PageHelpProvider, type PageHelpEntry } from './page-help'

const { Header, Sider, Content } = Layout

const PRODUCTS_ENRICHMENT_MENU_KEY = '/products/enrichment'
const FILE_SETUP_MENU_KEY = '/file-setup'

const ROUTER_LINK_STYLE: CSSProperties = {
  color: 'inherit',
  display: 'block',
  textDecoration: 'none',
}

const routeForMenuKey = (key: string) => (key === '/utilities/overview' ? '/utilities' : key)

const isModifiedNavigationEvent = (
  event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
) => {
  if (event.defaultPrevented) return true
  if ('button' in event && event.button !== 0) return true
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
}

const appMenuItems = [
  {
    key: '/products',
    icon: <AppstoreOutlined />,
    label: 'Products',
    children: [
      { key: '/products/skus/new', icon: <PlusOutlined />, label: 'New SKU', requiredPermissions: ['products.write'] },
      { key: '/inventory/skus', icon: <AppstoreOutlined />, label: 'SKU List', requiredPermissions: ['products.view'] },
      { key: '/inventory/sku-drafts', icon: <FileTextOutlined />, label: 'Borradores de SKU', requiredPermissions: ['products.write'] },
      { key: '/products/inquiry', icon: <SearchOutlined />, label: 'Inquiry', requiredPermissions: ['products.view'] },
      { type: 'divider' as const },
      {
        key: PRODUCTS_ENRICHMENT_MENU_KEY,
        label: 'Product Enrichment',
        children: [
          { key: '/products/attributes', icon: <AppstoreOutlined />, label: 'Attributes', requiredPermissions: ['products.view'] },
          { key: '/products/attributes/macros', icon: <TagOutlined />, label: 'Macro Categories', requiredPermissions: ['products.view'] },
          { key: '/products/families', icon: <AppstoreOutlined />, label: 'Product Families', requiredPermissions: ['products.view'] },
          { key: '/products/matching-sets', icon: <ApartmentOutlined />, label: 'Matching Sets', requiredPermissions: ['products.view'] },
        ],
      },
    ],
  },
  {
    key: FILE_SETUP_MENU_KEY,
    icon: <FileTextOutlined />,
    label: 'File Setup',
    children: [
      { key: '/products/vendors', icon: <AppstoreOutlined />, label: 'Vendors', requiredPermissions: ['products.view'] },
      { key: '/products/taxonomy/categories', icon: <FileTextOutlined />, label: 'Categories', requiredPermissions: ['products.view'] },
      { key: '/products/taxonomy/departments', icon: <FileTextOutlined />, label: 'Departments', requiredPermissions: ['products.view'] },
      { key: '/products/taxonomy/sectors', icon: <FileTextOutlined />, label: 'Sectors', requiredPermissions: ['products.view'] },
      { key: '/products/taxonomy/groups', icon: <FileTextOutlined />, label: 'Groups', requiredPermissions: ['products.view'] },
      { key: '/products/taxonomy/keywords', icon: <FileTextOutlined />, label: 'Keywords', requiredPermissions: ['products.view'] },
      { key: '/products/taxonomy/seasons', icon: <FileTextOutlined />, label: 'Seasons', requiredPermissions: ['products.view'] },
      { key: '/products/taxonomy/size-types', icon: <FileTextOutlined />, label: 'Size Types', requiredPermissions: ['products.view'] },
      { key: '/file-setup/case-packs', icon: <FileTextOutlined />, label: 'Case Packs', requiredPermissions: ['products.view'] },
      { key: '/products/taxonomy/return-codes', icon: <FileTextOutlined />, label: 'Return Codes', requiredPermissions: ['products.view'] },
      { key: '/products/taxonomy/promotion-codes', icon: <FileTextOutlined />, label: 'Promotion Codes', requiredPermissions: ['products.view'] },
      { key: '/utilities/stores', icon: <ShopOutlined />, label: 'Stores', requiredPermissions: ['store_ops.view'] },
      { key: '/utilities/store-chains', icon: <ApartmentOutlined />, label: 'Store Chains', requiredPermissions: ['store_ops.view'] },
      { key: '/employees/salespeople', icon: <TeamOutlined />, label: 'Salespeople', requiredPermissions: ['employees.view'] },
      { key: '/admin/users', icon: <UserOutlined />, label: 'Users', requiredPermissions: ['identity_access.view'] },
      { key: '/admin/roles', icon: <CrownOutlined />, label: 'Roles & Permissions', requiredPermissions: ['identity_access.manage'] },
      { key: '/admin/security', icon: <AlertOutlined />, label: 'Security Center', requiredPermissions: ['identity_access.view'] },
      { key: '/admin/effective-access', icon: <AuditOutlined />, label: 'Effective Access', requiredPermissions: ['identity_access.view'] },
    ],
  },
  {
    key: '/inventory',
    icon: <ShopOutlined />,
    label: 'Inventory',
    children: [
      { key: '/inventory/adjustments', icon: <SwapOutlined />, label: 'Stock Maintenance', requiredPermissions: ['inventory.adjust'] },
      { key: '/inventory/balances', icon: <InboxOutlined />, label: 'Balances', requiredPermissions: ['inventory.view'] },
      { key: '/inventory/find-by-size', icon: <ColumnHeightOutlined />, label: 'Find by Size', requiredPermissions: ['inventory.view'] },
      { key: '/inventory/replenishment', icon: <FundOutlined />, label: 'Model Quantities', requiredPermissions: ['inventory.view'] },
      { key: '/inventory/transfers/manual', icon: <SwapOutlined />, label: 'Transfer - Manual', requiredPermissions: ['inventory.adjust'] },
      { key: '/inventory/transfers/automatic', icon: <ExperimentOutlined />, label: 'Transfer - Automatic', requiredPermissions: ['inventory.adjust'] },
      { key: '/inventory/transfers/balancing', icon: <ExperimentOutlined />, label: 'Transfer - Balancing (Legacy)', requiredPermissions: ['inventory.adjust'] },
      { key: '/inventory/transfers/balancing-v2', icon: <ExperimentOutlined />, label: 'Transfer - Balancing v2', requiredPermissions: ['inventory.adjust'] },
      { key: '/inventory/movements', icon: <SyncOutlined />, label: 'Movements', requiredPermissions: ['inventory.view'] },
      { key: '/inventory/change-detail', icon: <HistoryOutlined />, label: 'Change Detail', requiredPermissions: ['inventory.view'] },
      { key: '/inventory/sales-ledger', icon: <HistoryOutlined />, label: 'Sales Ledger', requiredPermissions: ['inventory.view'] },
      { key: '/inventory/audit', icon: <AuditOutlined />, label: 'Audit', requiredPermissions: ['inventory.view'] },
      // Demoted - not in active use (muted style)
      { key: '/inventory/dashboard', icon: <DashboardOutlined />, label: <DemotedLabel>Dashboard</DemotedLabel>, requiredPermissions: ['inventory.view'] },
    ],
  },
  {
    key: '/purchase-planning-group',
    icon: <FundOutlined />,
    label: 'Plan de Compras',
    requiredPermissions: ['purchasing.view'],
    children: [
      { key: '/purchase-planning', icon: <FundOutlined />, label: 'V2 - Actual', requiredPermissions: ['purchasing.view'] },
      { key: '/purchase-planning/v3', icon: <FundOutlined />, label: 'V3 - Warehouse Shared', requiredPermissions: ['purchasing.view'] },
      { key: '/purchase-planning/assortment', icon: <SwapOutlined />, label: 'Assortment Releases', requiredPermissions: ['purchasing.view'] },
      { key: '/purchase-planning/buyer-checklist', icon: <CheckCircleOutlined />, label: 'Buyer Checklist', requiredPermissions: ['purchasing.view'] },
    ],
  },
  {
    key: '/import-management',
    icon: <ContainerOutlined />,
    label: 'Import Management',
    requiredPermissions: ['import_management.view'],
  },
  {
    key: '/sales',
    icon: <CreditCardOutlined />,
    label: 'Sales POS',
    children: [
      { key: '/sales/enter', icon: <CreditCardOutlined />, label: 'Enter Sales', requiredPermissions: ['sales_pos.operate'] },
    ],
  },
  {
    key: '/customers-group',
    icon: <TeamOutlined />,
    label: 'Customer Intelligence',
    children: [
      { key: '/customers/dashboard', icon: <PieChartOutlined />, label: 'Dashboard', requiredPermissions: ['segmentation.read'] },
      { key: '/customers/intelligence', icon: <TeamOutlined />, label: 'Customers (KPI)', requiredPermissions: ['segmentation.read'] },
      { key: '/customers', icon: <TeamOutlined />, label: 'Customer Records', requiredPermissions: ['segmentation.read'] },
      { key: '/customers/segments', icon: <ApartmentOutlined />, label: 'Segments', requiredPermissions: ['segmentation.read'] },
      { key: '/customers/churn-risk', icon: <AlertOutlined />, label: 'Churn Risk', requiredPermissions: ['segmentation.read'] },
      { key: '/customers/vip', icon: <CrownOutlined />, label: 'VIP Customers', requiredPermissions: ['segmentation.read'] },
      { key: '/customers/discount-sensitive', icon: <TagOutlined />, label: 'Discount Sensitivity', requiredPermissions: ['segmentation.read'] },
    ],
  },
  {
    key: '/reports',
    icon: <FileTextOutlined />,
    label: 'Reports',
    children: [
      { key: '/reports/aging', icon: <ClockCircleOutlined />, label: 'Aging', requiredPermissions: ['reports.view'] },
      { key: '/reports/inventory-detail', icon: <InboxOutlined />, label: 'Inventory Detail', requiredPermissions: ['reports.view'] },
      { key: '/reports/transfer-summary', icon: <SwapOutlined />, label: 'Transfer Summary', requiredPermissions: ['reports.view'] },
      { key: '/reports/recommended-transfers', icon: <FundOutlined />, label: 'Recommended Transfers', requiredPermissions: ['reports.view'] },
      { key: '/reports/sales', icon: <BarChartOutlined />, label: 'Sales', requiredPermissions: ['reports.view'] },
      { key: '/reports/sales/seasonality-index', icon: <FundOutlined />, label: 'Seasonality Index', requiredPermissions: ['reports.view'] },
      { key: '/reports/others', icon: <AppstoreOutlined />, label: 'Others', requiredPermissions: ['reports.view'] },
      { key: '/reports/templates', icon: <BookOutlined />, label: 'Templates', requiredPermissions: ['reports.admin'] },
      { key: '/reports/runs', icon: <CameraOutlined />, label: 'Snapshots', requiredPermissions: ['reports.admin'] },
      // Demoted - not in active use (muted style)
      { key: '/reports/on-hand', icon: <FileTextOutlined />, label: <DemotedLabel>On-Hand</DemotedLabel>, requiredPermissions: ['reports.view'] },
      { key: '/reports/turnover', icon: <SyncOutlined />, label: <DemotedLabel>Turnover</DemotedLabel>, requiredPermissions: ['reports.view'] },
      { key: '/reports/sell-through', icon: <FundOutlined />, label: <DemotedLabel>Sell-Through</DemotedLabel>, requiredPermissions: ['reports.view'] },
    ],
  },
  {
    key: '/operations',
    icon: <AuditOutlined />,
    label: 'Operations',
    children: [
      { key: '/operations/activity-review', icon: <AuditOutlined />, label: 'Activity Review', requiredPermissions: ['activity_review.view'] },
      { key: '/operations/inventory-close', icon: <CalendarOutlined />, label: 'Inventory Close', requiredPermissions: ['employees.manage'] },
      { key: '/operations/migration-day', icon: <SyncOutlined />, label: 'Migration Day', requiredPermissions: ['employees.manage'] },
    ],
  },
  {
    key: '/utilities',
    icon: <ExperimentOutlined />,
    label: 'Utilities',
    children: [
      { key: '/utilities/overview', icon: <ExperimentOutlined />, label: 'Overview', requiredPermissions: ['store_ops.view'] },
      { key: '/utilities/change-keywords', icon: <FileTextOutlined />, label: 'Change Keywords', requiredPermissions: ['products.sku_bulk_write'] },
      { key: '/utilities/batch-history', icon: <HistoryOutlined />, label: 'Batch History', requiredPermissions: ['products.sku_bulk_write'] },
    ],
  },
  {
    key: '/purchasing',
    icon: <ShoppingOutlined />,
    label: 'Purchasing',
    children: [
      { key: '/purchasing/orders', icon: <FileTextOutlined />, label: 'Purchase Orders', requiredPermissions: ['purchasing.view'] },
      { key: '/purchasing/quotations', icon: <TagOutlined />, label: 'Supplier Quotations', requiredPermissions: ['purchasing.view'] },
      { key: '/purchasing/orders/new-spec-preview', icon: <ExperimentOutlined />, label: 'PO Entry (Spec Preview)', requiredPermissions: ['purchasing.edit'] },
      { key: '/purchasing/receive', icon: <InboxOutlined />, label: 'Receive POs', requiredPermissions: ['purchasing.edit'] },
      { key: '/purchasing/receive-spec-preview', icon: <ExperimentOutlined />, label: 'Receive PO (Spec Preview)', requiredPermissions: ['purchasing.edit'] },
      { key: '/purchasing/reports', icon: <BarChartOutlined />, label: 'Reports', requiredPermissions: ['purchasing.view'] },
    ],
  },
  {
    key: '/otb',
    icon: <BarChartOutlined />,
    label: <DemotedLabel>OTB</DemotedLabel>,
    children: [
      { key: '/otb/monthly-plans', icon: <CalendarOutlined />, label: 'Monthly Plans', requiredPermissions: ['otb.view'] },
      { key: '/otb/dashboard', icon: <DashboardOutlined />, label: 'Budget Dashboard', requiredPermissions: ['otb.view'] },
    ],
  },
]

function hasMenuPermission(item: any, permissions: ReadonlySet<string>): boolean {
  const required = item?.requiredPermissions as string[] | undefined;
  if (!required || required.length === 0) return true;
  return required.some((permission) => permissions.has(permission));
}

function compactDividers(items: any[]): any[] {
  const out: any[] = [];
  for (const item of items) {
    if (item?.type === 'divider') {
      if (out.length === 0 || out[out.length - 1]?.type === 'divider') continue;
    }
    out.push(item);
  }
  while (out[out.length - 1]?.type === 'divider') out.pop();
  return out;
}

function filterMenuItemsForPermissions(items: readonly any[], permissions: ReadonlySet<string>): any[] {
  const filtered = items.flatMap((item) => {
    if (!item) return [];
    if (item.type === 'divider') return [item];
    if (Array.isArray(item.children)) {
      const children = filterMenuItemsForPermissions(item.children, permissions);
      if (children.length === 0) return [];
      if (!hasMenuPermission(item, permissions)) return [];
      return [{ ...item, children }];
    }
    return hasMenuPermission(item, permissions) ? [item] : [];
  });
  return compactDividers(filtered);
}

function firstLeafRoute(items: readonly any[]): string | null {
  for (const item of items) {
    if (!item || item.type === 'divider') continue;
    if (Array.isArray(item.children)) {
      const childRoute = firstLeafRoute(item.children);
      if (childRoute) return childRoute;
      continue;
    }
    if (typeof item.key === 'string' && item.key.startsWith('/')) return routeForMenuKey(item.key);
  }
  return null;
}

export function firstAccessibleMenuRoute(permissions: ReadonlySet<string>): string {
  return firstLeafRoute(filterMenuItemsForPermissions(appMenuItems, permissions)) ?? '/me';
}

function linkLeafMenuItems(items: readonly any[]): any[] {
  return items.map((item) => {
    if (!item || item.type === 'divider') return item
    const menuItem = { ...item }
    delete menuItem.requiredPermissions
    if (Array.isArray(item.children)) {
      return {
        ...menuItem,
        children: linkLeafMenuItems(item.children),
      }
    }
    if (typeof item.key !== 'string' || !item.key.startsWith('/')) return item
    return {
      ...menuItem,
      label: (
        <Link to={routeForMenuKey(item.key)} style={ROUTER_LINK_STYLE}>
          {item.label}
        </Link>
      ),
    }
  })
}

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
  const { user, logout, permissions } = useAuth()
  const visibleAppMenuItems = useMemo(() => filterMenuItemsForPermissions(appMenuItems, permissions), [permissions])
  const menuItems = useMemo(() => linkLeafMenuItems(visibleAppMenuItems), [visibleAppMenuItems])

  const userMenuItems = [
    {
      key: 'me',
      label: <Link to="/me">My account</Link>,
    },
    ...(permissions.has('identity_access.view')
      ? [{
          key: 'users',
          label: <Link to="/admin/users">Users</Link>,
        }]
      : []),
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
    let bestKeys: string[] = []
    let bestScore = -1

    const visit = (nodes: readonly any[], parentKeys: string[]) => {
      for (const item of nodes) {
        if (!item || item.type === 'divider') continue

        const itemKey = typeof item.key === 'string' ? item.key : null
        const hasChildren = Array.isArray(item.children)
        const itemKeys = itemKey ? [...parentKeys, itemKey] : parentKeys

        if (itemKey && (path === itemKey || path.startsWith(`${itemKey}/`))) {
          const score = itemKey.length + (hasChildren ? 0 : 10_000)
          if (score > bestScore) {
            bestKeys = hasChildren ? itemKeys : parentKeys
            bestScore = score
          }
        }

        if (hasChildren) visit(item.children, itemKeys)
      }
    }

    visit(items, ancestors)
    return bestKeys
  }

  const allMenuKeys = visibleAppMenuItems.flatMap((item) =>
    item.children ? [item.key, ...collectMenuKeys(item.children)] : typeof item.key === 'string' ? [item.key] : [],
  )
  const allLeafKeys = visibleAppMenuItems.flatMap((item) =>
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
    visibleAppMenuItems.find((item) => item.children && collectLeafKeys(item.children).includes(selectedLeaf)) ??
    visibleAppMenuItems.find(
      (item) =>
        typeof item.key === 'string' &&
        (currentPath === item.key || currentPath.startsWith(`${item.key}/`)),
    ) ??
    visibleAppMenuItems.find((item) => item.children && collectMenuKeys(item.children).includes(selectedMenuKey)) ??
    visibleAppMenuItems[0]
  const activeModuleLabel = currentPath.startsWith('/manual') ? 'Manual' : activeModule?.label ?? 'Inventory'

  const desiredOpenKeys = Array.from(new Set(collectOpenKeysForPath(visibleAppMenuItems, currentPath)))
  const [openKeys, setOpenKeys] = useState<string[]>(() => desiredOpenKeys)
  const [currentHelp, setCurrentHelp] = useState<PageHelpEntry | null>(null)
  const [helpDrawerOpen, setHelpDrawerOpen] = useState(false)

  useEffect(() => {
    setOpenKeys(desiredOpenKeys)
  }, [currentPath, desiredOpenKeys.join('|')])

  useEffect(() => {
    if (!currentHelp) setHelpDrawerOpen(false)
  }, [currentHelp])

  return (
    <PageHelpProvider currentHelp={currentHelp} setCurrentHelp={setCurrentHelp}>
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
            onClick={({ key, domEvent }) => {
              if (isModifiedNavigationEvent(domEvent)) return
              navigate(routeForMenuKey(String(key)))
            }}
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
              {activeModuleLabel}
            </Typography.Title>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {currentHelp ? (
                <Tooltip title="Ayuda de esta página">
                  <Button
                    aria-label="Ayuda de esta página"
                    icon={<QuestionCircleOutlined />}
                    onClick={() => setHelpDrawerOpen(true)}
                  >
                    Ayuda
                  </Button>
                </Tooltip>
              ) : null}
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                <Button type="text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar size="small" icon={<UserOutlined />} />
                  {user?.displayName ?? user?.email ?? 'Account'}
                </Button>
              </Dropdown>
            </div>
          </Header>
          <Content style={{ margin: 16 }}>
            <Outlet />
          </Content>
          <PageHelpDrawer
            entry={currentHelp}
            open={helpDrawerOpen}
            onClose={() => setHelpDrawerOpen(false)}
          />
        </Layout>
      </Layout>
    </PageHelpProvider>
  )
}
