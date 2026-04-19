import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Spin, Flex } from 'antd'
import AppLayout from './components/AppLayout'
import SkuListPage from './pages/inventory/SkuListPage'
import SkuFormPage from './pages/inventory/SkuFormPage'
import DashboardPage from './pages/inventory/DashboardPage'
import AdjustmentListPage from './pages/inventory/AdjustmentListPage'
import AdjustmentFormPage from './pages/inventory/AdjustmentFormPage'
import AdjustmentDetailPage from './pages/inventory/AdjustmentDetailPage'
import OnHandReportPage from './pages/inventory/OnHandReportPage'
import SalesReportPage from './pages/inventory/SalesReportPage'
import InventoryTurnoverReportPage from './pages/inventory/InventoryTurnoverReportPage'
import InventoryAgingReportPage from './pages/inventory/InventoryAgingReportPage'
import SellThroughReportPage from './pages/inventory/SellThroughReportPage'
import PoReceivePage from './pages/inventory/PoReceivePage'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { RequirePermission } from './auth/RequirePermission'

const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const MePage = lazy(() => import('./pages/auth/MePage'))
const ChangePasswordPage = lazy(() => import('./pages/auth/ChangePasswordPage'))
const UsersListPage = lazy(() => import('./pages/users/UsersListPage'))
const UserFormPage = lazy(() => import('./pages/users/UserFormPage'))

function RouteLoadingFallback() {
  return (
    <Flex align="center" justify="center" style={{ minHeight: 240 }}>
      <Spin size="large" />
    </Flex>
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
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/inventory/skus" element={<SkuListPage />} />
          <Route path="/inventory/skus/new" element={<SkuFormPage />} />
          <Route path="/inventory/skus/:skuId/edit" element={<SkuFormPage />} />
          <Route path="/inventory/adjustments" element={<AdjustmentListPage />} />
          <Route path="/inventory/adjustments/new" element={<AdjustmentFormPage />} />
          <Route path="/inventory/adjustments/:adjustmentId" element={<AdjustmentDetailPage />} />
          <Route path="/purchasing/receive" element={<PoReceivePage />} />
          <Route path="/purchasing/receive/:poId" element={<PoReceivePage />} />
          <Route path="/reports/on-hand" element={<OnHandReportPage />} />
          <Route path="/reports/sales" element={<SalesReportPage />} />
          <Route path="/reports/turnover" element={<InventoryTurnoverReportPage />} />
          <Route path="/reports/aging" element={<InventoryAgingReportPage />} />
          <Route path="/reports/sell-through" element={<SellThroughReportPage />} />
          <Route
            path="/me"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <MePage />
              </Suspense>
            }
          />
          <Route
            path="/change-password"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <ChangePasswordPage />
              </Suspense>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequirePermission permission="employees.view">
                <Suspense fallback={<RouteLoadingFallback />}>
                  <UsersListPage />
                </Suspense>
              </RequirePermission>
            }
          />
          <Route
            path="/admin/users/new"
            element={
              <RequirePermission permission="employees.manage">
                <Suspense fallback={<RouteLoadingFallback />}>
                  <UserFormPage />
                </Suspense>
              </RequirePermission>
            }
          />
          <Route
            path="/admin/users/:id/edit"
            element={
              <RequirePermission permission="employees.manage">
                <Suspense fallback={<RouteLoadingFallback />}>
                  <UserFormPage />
                </Suspense>
              </RequirePermission>
            }
          />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
