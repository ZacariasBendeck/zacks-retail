import { Form, Input, Select, Button, Typography } from 'antd'
import type { CheckoutData } from '@/types/order'

const { Title } = Typography

const DEPARTMENTS_HN = [
  'Atlantida', 'Choluteca', 'Colon', 'Comayagua', 'Copan',
  'Cortes', 'El Paraiso', 'Francisco Morazan', 'Gracias a Dios',
  'Intibuca', 'Islas de la Bahia', 'La Paz', 'Lempira',
  'Ocotepeque', 'Olancho', 'Santa Barbara', 'Valle', 'Yoro',
]

const PAYMENT_METHODS = [
  { value: 'cash_on_delivery', label: 'Pago contra entrega' },
  { value: 'bank_transfer', label: 'Transferencia bancaria' },
  { value: 'card', label: 'Tarjeta de credito/debito' },
]

interface CheckoutFormProps {
  onSubmit: (data: CheckoutData) => void
  loading?: boolean
}

export default function CheckoutForm({ onSubmit, loading }: CheckoutFormProps) {
  const [form] = Form.useForm<CheckoutData>()

  return (
    <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark={false} size="large">
      <Title level={4}>Informacion de Envio</Title>

      <Form.Item name="shippingName" label="Nombre completo"
        rules={[{ required: true, message: 'Ingrese su nombre' }]}>
        <Input placeholder="Juan Perez" />
      </Form.Item>

      <Form.Item name="shippingPhone" label="Telefono"
        rules={[{ required: true, message: 'Ingrese su telefono' }]}>
        <Input placeholder="+504 9999-9999" />
      </Form.Item>

      <Form.Item name="shippingAddress" label="Direccion"
        rules={[{ required: true, message: 'Ingrese su direccion' }]}>
        <Input.TextArea rows={2} placeholder="Colonia, calle, casa/edificio..." />
      </Form.Item>

      <Form.Item name="shippingCity" label="Ciudad"
        rules={[{ required: true, message: 'Ingrese su ciudad' }]}>
        <Input placeholder="Tegucigalpa" />
      </Form.Item>

      <Form.Item name="shippingDepartment" label="Departamento"
        rules={[{ required: true, message: 'Seleccione departamento' }]}>
        <Select placeholder="Seleccionar departamento"
          options={DEPARTMENTS_HN.map(d => ({ value: d, label: d }))} showSearch />
      </Form.Item>

      <Form.Item name="shippingNotes" label="Notas de envio (opcional)">
        <Input.TextArea rows={2} placeholder="Instrucciones especiales..." />
      </Form.Item>

      <Title level={4} style={{ marginTop: 24 }}>Metodo de Pago</Title>

      <Form.Item name="paymentMethod" label="Forma de pago"
        rules={[{ required: true, message: 'Seleccione forma de pago' }]}>
        <Select placeholder="Seleccionar" options={PAYMENT_METHODS} />
      </Form.Item>

      <Button type="primary" htmlType="submit" block loading={loading} style={{ marginTop: 16 }}>
        Confirmar Pedido
      </Button>
    </Form>
  )
}
