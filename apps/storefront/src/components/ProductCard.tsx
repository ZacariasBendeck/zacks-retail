import { Card, Typography, Rate, Tag, Space } from 'antd'
import { useNavigate } from 'react-router-dom'
import type { Product } from '@/types/product'

const { Text, Title } = Typography

interface ProductCardProps {
  product: Product
}

export default function ProductCard({ product }: ProductCardProps) {
  const navigate = useNavigate()

  return (
    <Card
      hoverable
      onClick={() => navigate(`/product/${product.id}`)}
      cover={
        <div style={{
          height: 280,
          background: '#f5f5f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
          <img
            alt={product.name}
            src={product.image_url}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
      }
      styles={{ body: { padding: '12px 16px' } }}
    >
      <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {product.brand}
      </Text>
      <Title level={5} style={{ margin: '4px 0 8px', fontSize: 14, lineHeight: 1.3 }} ellipsis={{ rows: 2 }}>
        {product.name}
      </Title>

      <Space size={4} style={{ marginBottom: 8 }}>
        <Rate disabled defaultValue={product.rating} allowHalf style={{ fontSize: 12 }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          ({product.review_count})
        </Text>
      </Space>

      <div style={{ marginBottom: 8 }}>
        <Text strong style={{ fontSize: 16, color: '#1677ff' }}>
          ${product.price.toFixed(2)}
        </Text>
        {product.original_price && (
          <>
            <Text delete type="secondary" style={{ fontSize: 13, marginLeft: 8 }}>
              ${product.original_price.toFixed(2)}
            </Text>
            <Tag color="red" style={{ marginLeft: 8, fontSize: 11 }}>
              {Math.round((1 - product.price / product.original_price) * 100)}% OFF
            </Tag>
          </>
        )}
      </div>

      {/* Color swatches */}
      <Space size={4}>
        {product.colors.slice(0, 6).map(color => (
          <div
            key={color.id}
            title={color.name}
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: color.hex ?? '#ccc',
              border: '1px solid #d9d9d9',
              cursor: 'pointer',
            }}
          />
        ))}
        {product.colors.length > 6 && (
          <Text type="secondary" style={{ fontSize: 11 }}>+{product.colors.length - 6}</Text>
        )}
      </Space>
    </Card>
  )
}
