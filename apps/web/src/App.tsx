import { Suspense, lazy } from 'react'
import { Flex, Spin } from 'antd'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { RequirePermission } from './auth/RequirePermission'

const SkuListPage = lazy(() => import('./pages/inventory/SkuListPage'))
const SkuFormPage = lazy(() => import('./pages/inventory/SkuFormPage'))
const DashboardPage = lazy(() => import('./pages/inventory/DashboardPage'))
const InventoryBalancesPage = lazy(() => import('./pages/inventory/InventoryBalancesPage'))
const SalesLedgerPage = lazy(() => import('./pages/inventory/SalesLedgerPage'))
const InventoryMovementPage = lazy(() => import('./pages/inventory/InventoryMovementPage'))
const InventoryInquiryPage = lazy(() => import('./pages/inventory/InventoryInquiryPage'))
const FindBySizePage = lazy(() => import('./pages/inventory/FindBySizePage'))
const ReplenishmentTargetsPage = lazy(() => import('./pages/inventory/ReplenishmentTargetsPage'))
const TransferSummaryReportPage = lazy(() => import('./pages/inventory/TransferSummaryReportPage'))
const InventoryDetailReportPage = lazy(() => import('./pages/inventory/InventoryDetailReportPage'))
const ChangeDetailPage = lazy(() => import('./pages/inventory/ChangeDetailPage'))
const AdjustmentListPage = lazy(() => import('./pages/inventory/AdjustmentListPage'))
const AdjustmentFormPage = lazy(() => import('./pages/inventory/AdjustmentFormPage'))
const AdjustmentDetailPage = lazy(() => import('./pages/inventory/AdjustmentDetailPage'))
const OnHandReportPage = lazy(() => import('./pages/inventory/OnHandReportPage'))
const SalesReportPage = lazy(() => import('./pages/inventory/SalesReportPage'))
const InventoryTurnoverReportPage = lazy(() => import('./pages/inventory/InventoryTurnoverReportPage'))
const InventoryAgingReportPage = lazy(() => import('./pages/inventory/InventoryAgingReportPage'))
const SellThroughReportPage = lazy(() => import('./pages/inventory/SellThroughReportPage'))
const PoReceivePage = lazy(() => import('./pages/inventory/PoReceivePage'))
const PurchaseOrdersPage = lazy(() => import('./pages/purchasing/PurchaseOrdersPage'))
const PurchaseOrderFormPage = lazy(() => import('./pages/purchasing/PurchaseOrderFormPage'))
const PurchaseOrderDetailPage = lazy(() => import('./pages/purchasing/PurchaseOrderDetailPage'))
const PoEntryMockPage = lazy(() => import('./pages/purchasing/PoEntryMockPage'))
const PoReceiveMockPage = lazy(() => import('./pages/purchasing/PoReceiveMockPage'))
const OtbDashboardPage = lazy(() => import('./pages/otb/OtbDashboardPage'))
const OtbMonthlyPlansPage = lazy(() => import('./pages/otb/OtbMonthlyPlansPage'))
const SalesReportsHubPage = lazy(() => import('./pages/salesReporting/SalesReportsHubPage'))
const SalesAnalysisPage = lazy(() => import('./pages/salesReporting/SalesAnalysisPage'))
const BestSellersPage = lazy(() => import('./pages/salesReporting/BestSellersPage'))
const SalesHistoryByMonthPage = lazy(() => import('./pages/salesReporting/SalesHistoryByMonthPage'))
const StockStatusPage = lazy(() => import('./pages/salesReporting/StockStatusPage'))
const SizeTypeAnalysisPage = lazy(() => import('./pages/salesReporting/SizeTypeAnalysisPage'))
const OtbVsSalesPage = lazy(() => import('./pages/salesReporting/OtbVsSalesPage'))
const ReportsOthersHubPage = lazy(() => import('./pages/salesReporting/ReportsOthersHubPage'))
const SalesByDayPage = lazy(() => import('./pages/salesReporting/SalesByDayPage'))
const SalesByTimePage = lazy(() => import('./pages/salesReporting/SalesByTimePage'))
const SalespersonSummaryPage = lazy(() => import('./pages/salesReporting/SalespersonSummaryPage'))
const CustomerListPage = lazy(() => import('./pages/customers/CustomerListPage'))
const CustomerFormPage = lazy(() => import('./pages/customers/CustomerFormPage'))
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const MePage = lazy(() => import('./pages/auth/MePage'))
const ChangePasswordPage = lazy(() => import('./pages/auth/ChangePasswordPage'))
const UsersListPage = lazy(() => import('./pages/users/UsersListPage'))
const UserFormPage = lazy(() => import('./pages/users/UserFormPage'))

function RouteLoadingFallback() {
  return (
    <Flex align="center" justify="center" style={{ minHeight: 240 }} data-testid="route-loading-fallback">
      <Spin size="large" />
    </Flex>
  )
}

function LazyRouteOutlet() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Outlet />
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route
          path="/login"
          element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <LoginPage />
            </Suspense>
          }
        />
        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route path="/" element={<Navigate to="/inventory/dashboard" replace />} />
          <Route path="/dashboard" element={<Navigate to="/inventory/dashboard" replace />} />
          <Route path="/inventory" element={<Navigate to="/inventory/dashboard" replace />} />
          <Route element={<LazyRouteOutlet />}>
            <Route path="/inventory/dashboard" element={<DashboardPage />} />
            <Route path="/inventory/balances" element={<InventoryBalancesPage />} />
            <Route path="/inventory/skus" element={<SkuListPage />} />
            <Route path="/inventory/skus/new" element={<SkuFormPage />} />
            <Route path="/inventory/skus/:skuId/edit" element={<SkuFormPage />} />
            <Route path="/inventory/adjustments" element={<AdjustmentListPage />} />
            <Route path="/inventory/adjustments/new" element={<AdjustmentFormPage />} />
            <Route path="/inventory/adjustments/:adjustmentId" element={<AdjustmentDetailPage />} />
            <Route path="/inventory/sales-ledger" element={<SalesLedgerPage />} />
            <Route path="/inventory/movements" element={<InventoryMovementPage />} />
            <Route path="/inventory/inquiry" element={<InventoryInquiryPage />} />
            <Route path="/inventory/find-by-size" element={<FindBySizePage />} />
            <Route path="/inventory/replenishment" element={<ReplenishmentTargetsPage />} />
            <Route path="/reports/transfer-summary" element={<TransferSummaryReportPage />} />
            <Route path="/reports/inventory-detail" element={<InventoryDetailReportPage />} />
            <Route path="/inventory/change-detail" element={<ChangeDetailPage />} />
            <Route path="/purchasing" element={<Navigate to="/purchasing/orders" replace />} />
            <Route path="/purchasing/orders" element={<PurchaseOrdersPage />} />
            <Route path="/purchasing/orders/new" element={<PurchaseOrderFormPage />} />
            <Route path="/purchasing/orders/new-spec-preview" element={<PoEntryMockPage />} />
            <Route path="/purchasing/receive-spec-preview" element={<PoReceiveMockPage />} />
            <Route path="/purchasing/receive-spec-preview/:poId" element={<PoReceiveMockPage />} />
            <Route path="/purchasing/orders/:poId" element={<PurchaseOrderDetailPage />} />
            <Route path="/purchasing/receive" element={<PoReceivePage />} />
            <Route path="/purchasing/receive/:poId" element={<PoReceivePage />} />
            <Route path="/otb" element={<Navigate to="/otb/monthly-plans" replace />} />
            <Route path="/otb/monthly-plans" element={<OtbMonthlyPlansPage />} />
            <Route path="/otb/dashboard" element={<OtbDashboardPage />} />
            <Route path="/reports" element={<Navigate to="/reports/sales" replace />} />
            <Route path="/reports/on-hand" element={<OnHandReportPage />} />
            <Route path="/reports/sales" element={<SalesReportsHubPage />} />
            <Route path="/reports/sales/performance" element={<SalesReportPage />} />
            <Route path="/reports/sales/analysis" element={<SalesAnalysisPage />} />
            <Route path="/reports/sales/best-sellers" element={<BestSellersPage />} />
            <Route path="/reports/sales/history-by-month" element={<SalesHistoryByMonthPage />} />
            <Route path="/reports/sales/stock-status" element={<StockStatusPage />} />
            <Route path="/reports/sales/size-type-analysis" element={<SizeTypeAnalysisPage />} />
            <Route path="/reports/sales/otb-vs-sales" element={<OtbVsSalesPage />} />
            <Route path="/reports/others" element={<ReportsOthersHubPage />} />
            <Route path="/reports/others/sales-by-day" element={<SalesByDayPage />} />
            <Route path="/reports/others/sales-by-time" element={<SalesByTimePage />} />
            <Route path="/reports/others/salesperson-summary" element={<SalespersonSummaryPage />} />
            <Route path="/reports/turnover" element={<InventoryTurnoverReportPage />} />
            <Route path="/reports/aging" element={<InventoryAgingReportPage />} />
            <Route path="/reports/sell-through" element={<SellThroughReportPage />} />
            <Route path="/customers" element={<CustomerListPage />} />
            <Route path="/customers/new" element={<CustomerFormPage />} />
            <Route path="/customers/:customerId/edit" element={<CustomerFormPage />} />
            <Route path="/me" element={<MePage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route
              path="/admin/users"
              element={<RequirePermission permission="employees.view"><UsersListPage /></RequirePermission>}
            />
            <Route
              path="/admin/users/new"
              element={<RequirePermission permission="employees.manage"><UserFormPage /></RequirePermission>}
            />
            <Route
              path="/admin/users/:id/edit"
              element={<RequirePermission permission="employees.manage"><UserFormPage /></RequirePermission>}
            />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  )
}
