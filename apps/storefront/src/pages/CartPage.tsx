import { useEffect } from 'react'
import { Row, Col, Typography, Breadcrumb, Empty, Spin } from 'antd'
import { HomeOutlined, ShoppingCartOutlined } from '@ant-design/icons'
import { useTranslation } from '@benlow-rics/i18n/react'
import { useCartStore } from '@/store/cartStore'
import CartItem from '@/components/CartItem'
import CartSummary from '@/components/CartSummary'

const { Title } = Typography

export default function CartPage() {
  const { t } = useTranslation('storefront')
  const { cart, loading, loadCart, updateItem, removeItem } = useCartStore()

  useEffect(() => {
    loadCart()
  }, [loadCart])

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 24px' }}>
      <Breadcrumb
        items={[
          { title: <><HomeOutlined /> {t('product.home')}</>, href: '/' },
          { title: <><ShoppingCartOutlined /> {t('cart.breadcrumb')}</> },
        ]}
        style={{ marginBottom: 24 }}
      />

      <Title level={2}>{t('cart.title')}</Title>

      {loading && !cart && (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      )}

      {cart && cart.lines.length === 0 && (
        <Empty description={t('cart.empty')} style={{ padding: 80 }} />
      )}

      {cart && cart.lines.length > 0 && (
        <Row gutter={[32, 24]}>
          <Col xs={24} lg={16}>
            {cart.lines.map((line) => (
              <CartItem
                key={line.id}
                line={line}
                onUpdateQuantity={updateItem}
                onRemove={removeItem}
                disabled={loading}
              />
            ))}
          </Col>
          <Col xs={24} lg={8}>
            <CartSummary cart={cart} loading={loading} />
          </Col>
        </Row>
      )}
    </div>
  )
}
