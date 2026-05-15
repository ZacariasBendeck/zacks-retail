import { Routes, Route } from 'react-router-dom'
import { Layout } from 'antd'
import { useTranslation } from '@benlow-rics/i18n/react'
import StoreHeader from '@/components/StoreHeader'
import ProductListingPage from '@/pages/ProductListingPage'
import ProductDetailPage from '@/pages/ProductDetailPage'
import CartPage from '@/pages/CartPage'
import CheckoutPage from '@/pages/CheckoutPage'

const { Footer, Content } = Layout

export default function App() {
  const { t } = useTranslation('storefront')
  return (
    <Layout style={{ minHeight: '100vh', background: '#fff' }}>
      <StoreHeader />
      <Content>
        <Routes>
          <Route path="/" element={<ProductListingPage />} />
          <Route path="/product/:id" element={<ProductDetailPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
        </Routes>
      </Content>
      <Footer style={{ textAlign: 'center', background: '#001529', color: '#fff', padding: '24px 50px' }}>
        {t('footer')}
      </Footer>
    </Layout>
  )
}
