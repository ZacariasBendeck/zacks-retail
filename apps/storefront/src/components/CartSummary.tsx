import { Card, Typography, Divider, Button, Space } from 'antd'
import { ShoppingOutlined } from '@ant-design/icons'
import { formatHnl } from '@benlow-rics/i18n'
import { useI18nLocale } from '@benlow-rics/i18n/react'
import { useTranslation } from '@benlow-rics/i18n/react'
import { useNavigate } from 'react-router-dom'
import type { Cart } from '@/types/cart'

const { Title, Text } = Typography

interface CartSummaryProps {
  cart: Cart
  loading?: boolean
}

export default function CartSummary({ cart, loading }: CartSummaryProps) {
  const navigate = useNavigate()
  const { t } = useTranslation('storefront')
  const { locale } = useI18nLocale()

  return (
    <Card style={{ position: 'sticky', top: 120 }}>
      <Title level={5}>{t('cart.summaryTitle')}</Title>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text>{t('cart.subtotalItems', { count: cart.itemCount })}</Text>
          <Text>{formatHnl(cart.subtotal, locale)}</Text>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text>{t('checkout.tax')}</Text>
          <Text>{formatHnl(cart.tax, locale)}</Text>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text>{t('cart.shipping')}</Text>
          <Text type="success">{t('cart.free')}</Text>
        </div>
        <Divider style={{ margin: '8px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Title level={4} style={{ margin: 0 }}>{t('checkout.total')}</Title>
          <Title level={4} style={{ margin: 0, color: '#1677ff' }}>{formatHnl(cart.total, locale)}</Title>
        </div>
      </Space>
      <Button
        type="primary"
        size="large"
        icon={<ShoppingOutlined />}
        block
        style={{ marginTop: 24 }}
        onClick={() => navigate('/checkout')}
        disabled={cart.lines.length === 0 || loading}
      >
        {t('cart.checkout')}
      </Button>
      <Button
        type="link"
        block
        style={{ marginTop: 8 }}
        onClick={() => navigate('/')}
      >
        {t('checkout.continueShopping')}
      </Button>
    </Card>
  )
}
