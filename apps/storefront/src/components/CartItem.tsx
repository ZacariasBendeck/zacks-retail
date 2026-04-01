import { Row, Col, Typography, InputNumber, Button, Image } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import type { CartLine } from '@/types/cart'

const { Text } = Typography
const PLACEHOLDER = 'https://placehold.co/120x120/f5f5f5/999?text=Sin+Imagen'

interface CartItemProps {
  line: CartLine
  onUpdateQuantity: (lineId: number, quantity: number) => void
  onRemove: (lineId: number) => void
  disabled?: boolean
}

export default function CartItem({ line, onUpdateQuantity, onRemove, disabled }: CartItemProps) {
  return (
    <Row
      align="middle"
      gutter={16}
      style={{ padding: '16px 0', borderBottom: '1px solid #f0f0f0' }}
    >
      <Col xs={6} md={3}>
        <Image
          src={line.productImage ?? PLACEHOLDER}
          alt={line.productName}
          width={80}
          height={80}
          style={{ objectFit: 'contain', borderRadius: 4 }}
          preview={false}
        />
      </Col>
      <Col xs={18} md={8}>
        <Text strong style={{ display: 'block' }}>{line.productName}</Text>
        {line.size && <Text type="secondary">Talla: {line.size}</Text>}
        {line.color && <Text type="secondary" style={{ marginLeft: 12 }}>Color: {line.color}</Text>}
        {line.skuCode && (
          <div><Text type="secondary" style={{ fontSize: 11 }}>SKU: {line.skuCode}</Text></div>
        )}
      </Col>
      <Col xs={8} md={4}>
        <Text type="secondary">L {line.unitPrice.toFixed(2)}</Text>
      </Col>
      <Col xs={8} md={4}>
        <InputNumber
          min={1}
          max={99}
          value={line.quantity}
          onChange={(val) => val != null && onUpdateQuantity(line.id, val)}
          disabled={disabled}
          size="small"
        />
      </Col>
      <Col xs={5} md={3}>
        <Text strong>L {line.subtotal.toFixed(2)}</Text>
      </Col>
      <Col xs={3} md={2}>
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => onRemove(line.id)}
          disabled={disabled}
        />
      </Col>
    </Row>
  )
}
