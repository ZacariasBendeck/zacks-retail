import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import SkuListPage from './pages/inventory/SkuListPage'
import SkuFormPage from './pages/inventory/SkuFormPage'
import DashboardPage from './pages/inventory/DashboardPage'
import AdjustmentListPage from './pages/inventory/AdjustmentListPage'
import AdjustmentFormPage from './pages/inventory/AdjustmentFormPage'
import AdjustmentDetailPage from './pages/inventory/AdjustmentDetailPage'
import OnHandReportPage from './pages/inventory/OnHandReportPage'
import SalesReportPage from './pages/inventory/SalesReportPage'
import PoReceivePage from './pages/inventory/PoReceivePage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
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
      </Route>
    </Routes>
  )
}
