import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import SkuListPage from './pages/inventory/SkuListPage'
import SkuFormPage from './pages/inventory/SkuFormPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/inventory/skus" replace />} />
        <Route path="/inventory/skus" element={<SkuListPage />} />
        <Route path="/inventory/skus/new" element={<SkuFormPage />} />
        <Route path="/inventory/skus/:skuId/edit" element={<SkuFormPage />} />
      </Route>
    </Routes>
  )
}
