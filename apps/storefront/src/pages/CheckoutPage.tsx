import { useEffect, useState } from 'react'
import { Row, Col, Typography, Breadcrumb, Card, Result, Button, Spin, Divider } from 'antd'
import { HomeOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '@/store/cartStore'
import CheckoutForm from '@/components/CheckoutForm'
import { submitOrder } from '@/services/orderApi'
import type { CheckoutData, Order } from '@/types/order'

const { Title, Text } = Typography

export default function CheckoutPage() {
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
          title="Pedido Confirmado"
          subTitle={`Orden #${order.name} - Total: L ${order.total.toFixed(2)}`}
          extra={[
            <Button key="home" type="primary" onClick={() => navigate('/')}>
              Seguir Comprando
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
        <Result title="Tu carrito esta vacio"
          extra={<Button type="primary" onClick={() => navigate('/')}>Ver Productos</Button>} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 24px' }}>
      <Breadcrumb
        items={[
          { title: <><HomeOutlined /> Inicio</>, href: '/' },
          { title: 'Carrito', href: '/cart' },
          { title: 'Checkout' },
        ]}
        style={{ marginBottom: 24 }}
      />

      <Title level={2}>Finalizar Compra</Title>

      <Row gutter={[32, 24]}>
        <Col xs={24} lg={14}>
          <Card>
            <CheckoutForm onSubmit={handleCheckout} loading={submitting} />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Tu Pedido" style={{ position: 'sticky', top: 120 }}>
            {cart.lines.map((line) => (
              <div key={line.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                <div>
                  <Text>{line.productName}</Text>
                  <Text type="secondary" style={{ marginLeft: 8 }}>x{line.quantity}</Text>
                </div>
                <Text>L {line.subtotal.toFixed(2)}</Text>
              </div>
            ))}
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>Subtotal</Text><Text>L {cart.subtotal.toFixed(2)}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <Text>Impuestos</Text><Text>L {cart.tax.toFixed(2)}</Text>
            </div>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Title level={4} style={{ margin: 0 }}>Total</Title>
              <Title level={4} style={{ margin: 0, color: '#1677ff' }}>L {cart.total.toFixed(2)}</Title>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
