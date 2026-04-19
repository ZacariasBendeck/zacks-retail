import { Suspense, lazy } from 'react'
import { Flex, Spin } from 'antd'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import AppLayout from './components/AppLayout'

const CheckoutPage = lazy(() => import('./pages/CheckoutPage'))

function Loading() {
  return (
    <Flex align="center" justify="center" style={{ minHeight: 240 }}>
      <Spin size="large" />
    </Flex>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          element={
            <Suspense fallback={<Loading />}>
              <Outlet />
            </Suspense>
          }
        >
          <Route path="/" element={<Navigate to="/checkout" replace />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="*" element={<Navigate to="/checkout" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
