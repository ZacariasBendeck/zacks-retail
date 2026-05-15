import { Card, Typography, Rate, Space } from 'antd'
import { formatHnl } from '@benlow-rics/i18n'
import { useI18nLocale } from '@benlow-rics/i18n/react'
import { useTranslation } from '@benlow-rics/i18n/react'
import { useNavigate } from 'react-router-dom'
import type { ProductCard as ProductCardType } from '@/types/product'

const { Text, Title } = Typography

interface ProductCardProps {
  product: ProductCardType
}

export default function ProductCard({ product }: ProductCardProps) {
  const navigate = useNavigate()
  const { t } = useTranslation('storefront')
  const { locale } = useI18nLocale()
  const placeholderImg = `https://placehold.co/400x400/f5f5f5/999?text=${encodeURIComponent(t('product.noImage'))}`

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
            src={product.mainImage ?? placeholderImg}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
      }
      styles={{ body: { padding: '12px 16px' } }}
    >
      <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {product.brand ?? t('product.unbranded')}
      </Text>
      <Title level={5} style={{ margin: '4px 0 8px', fontSize: 14, lineHeight: 1.3 }} ellipsis={{ rows: 2 }}>
        {product.name}
      </Title>

      {product.rating != null && (
        <Space size={4} style={{ marginBottom: 8 }}>
          <Rate disabled defaultValue={product.rating} allowHalf style={{ fontSize: 12 }} />
        </Space>
      )}

      <div style={{ marginBottom: 8 }}>
        <Text strong style={{ fontSize: 16, color: '#1677ff' }}>
          {formatHnl(product.price, locale)}
        </Text>
      </div>

      {product.colorSwatches.length > 0 && (
        <Space size={4}>
          {product.colorSwatches.slice(0, 6).map(color => (
            <div
              key={color.colorId}
              title={color.name}
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#ccc',
                border: '1px solid #d9d9d9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 8,
                fontWeight: 600,
              }}
            >
              {color.code.charAt(0)}
            </div>
          ))}
          {product.colorSwatches.length > 6 && (
            <Text type="secondary" style={{ fontSize: 11 }}>+{product.colorSwatches.length - 6}</Text>
          )}
        </Space>
      )}
    </Card>
  )
}
