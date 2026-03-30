import { Routes, Route } from 'react-router-dom'
import { Layout } from 'antd'
import StoreHeader from '@/components/StoreHeader'
import ProductListingPage from '@/pages/ProductListingPage'
import ProductDetailPage from '@/pages/ProductDetailPage'

const { Footer, Content } = Layout

export default function App() {
  return (
    <Layout style={{ minHeight: '100vh', background: '#fff' }}>
      <StoreHeader />
      <Content>
        <Routes>
          <Route path="/" element={<ProductListingPage />} />
          <Route path="/product/:id" element={<ProductDetailPage />} />
        </Routes>
      </Content>
      <Footer style={{ textAlign: 'center', background: '#001529', color: '#fff', padding: '24px 50px' }}>
        Zapatería &copy; 2026. Todos los derechos reservados.
      </Footer>
    </Layout>
  )
}
