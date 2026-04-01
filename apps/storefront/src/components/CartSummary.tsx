import { Card, Typography, Divider, Button, Space } from 'antd'
import { ShoppingOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { Cart } from '@/types/cart'

const { Title, Text } = Typography

interface CartSummaryProps {
  cart: Cart
  loading?: boolean
}

export default function CartSummary({ cart, loading }: CartSummaryProps) {
  const navigate = useNavigate()

  return (
    <Card style={{ position: 'sticky', top: 120 }}>
      <Title level={5}>Resumen del Pedido</Title>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text>Subtotal ({cart.itemCount} articulos)</Text>
          <Text>L {cart.subtotal.toFixed(2)}</Text>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text>Impuestos</Text>
          <Text>L {cart.tax.toFixed(2)}</Text>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text>Envio</Text>
          <Text type="success">Gratis</Text>
        </div>
        <Divider style={{ margin: '8px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Title level={4} style={{ margin: 0 }}>Total</Title>
          <Title level={4} style={{ margin: 0, color: '#1677ff' }}>L {cart.total.toFixed(2)}</Title>
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
        Proceder al Pago
      </Button>
      <Button
        type="link"
        block
        style={{ marginTop: 8 }}
        onClick={() => navigate('/')}
      >
        Seguir Comprando
      </Button>
    </Card>
  )
}
