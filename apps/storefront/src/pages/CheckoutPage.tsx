import { useEffect, useState } from 'react'
import { Row, Col, Typography, Breadcrumb, Card, Result, Button, Spin, Divider } from 'antd'
import { HomeOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { formatHnl } from '@benlow-rics/i18n'
import { useI18nLocale } from '@benlow-rics/i18n/react'
import { useTranslation } from '@benlow-rics/i18n/react'
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '@/store/cartStore'
import CheckoutForm from '@/components/CheckoutForm'
import { submitOrder } from '@/services/orderApi'
import type { CheckoutData, Order } from '@/types/order'

const { Title, Text } = Typography

export default function CheckoutPage() {
  const { t } = useTranslation('storefront')
  const { locale } = useI18nLocale()
  const navigate = useNavigate()
  const { cart, loading: cartLoading, loadCart } = useCartStore()
  const [submitting, setSubmitting] = useState(false)
  const [order, setOrder] = useState<Order | null>(null)

  useEffect(() => {
    loadCart()
  }, [loadCart])

  const handleCheckout = async (data: CheckoutData) => {
    setSubmitting(true)
    try {
      const result = await submitOrder(data)
      setOrder(result)
      loadCart()
    } catch (err: any) {
      console.error('Checkout failed:', err)
    } finally {
      setSubmitting(false)
    }
  }

  if (order) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>
        <Result
          icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
          title={t('checkout.confirmed')}
          subTitle={t('checkout.orderTotal', { orderName: order.name, total: formatHnl(order.total, locale) })}
          extra={[
            <Button key="home" type="primary" onClick={() => navigate('/')}>
              {t('checkout.continueShopping')}
            </Button>,
          ]}
        />
      </div>
    )
  }

  if (cartLoading && !cart) {
    return <div style={{ textAlign: 'center', padding: 120 }}><Spin size="large" /></div>
  }

  if (!cart || cart.lines.length === 0) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>
        <Result title={t('checkout.emptyCart')}
          extra={<Button type="primary" onClick={() => navigate('/')}>{t('checkout.viewProducts')}</Button>} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 24px' }}>
      <Breadcrumb
        items={[
          { title: <><HomeOutlined /> {t('product.home')}</>, href: '/' },
          { title: t('cart.breadcrumb'), href: '/cart' },
          { title: t('checkout.breadcrumb') },
        ]}
        style={{ marginBottom: 24 }}
      />

      <Title level={2}>{t('checkout.title')}</Title>

      <Row gutter={[32, 24]}>
        <Col xs={24} lg={14}>
          <Card>
            <CheckoutForm onSubmit={handleCheckout} loading={submitting} />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title={t('checkout.yourOrder')} style={{ position: 'sticky', top: 120 }}>
            {cart.lines.map((line) => (
              <div key={line.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                <div>
                  <Text>{line.productName}</Text>
                  <Text type="secondary" style={{ marginLeft: 8 }}>x{line.quantity}</Text>
                </div>
                <Text>{formatHnl(line.subtotal, locale)}</Text>
              </div>
            ))}
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>{t('checkout.subtotal')}</Text><Text>{formatHnl(cart.subtotal, locale)}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <Text>{t('checkout.tax')}</Text><Text>{formatHnl(cart.tax, locale)}</Text>
            </div>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Title level={4} style={{ margin: 0 }}>{t('checkout.total')}</Title>
              <Title level={4} style={{ margin: 0, color: '#1677ff' }}>{formatHnl(cart.total, locale)}</Title>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
