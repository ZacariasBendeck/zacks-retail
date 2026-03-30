import { useParams, useNavigate } from 'react-router-dom'
import { Row, Col, Typography, Button, Rate, Tag, Space, Divider, Breadcrumb, Select, Spin, Image } from 'antd'
import { ArrowLeftOutlined, HomeOutlined, ShoppingCartOutlined, HeartOutlined } from '@ant-design/icons'
import { useProduct } from '@/hooks/useProducts'
import { useState } from 'react'

const { Title, Text, Paragraph } = Typography

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: product, isLoading } = useProduct(Number(id))
  const [selectedSize, setSelectedSize] = useState<string>()
  const [selectedColor, setSelectedColor] = useState<number>()
  const [mainImage, setMainImage] = useState(0)

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 120 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!product) {
    return (
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>Volver</Button>
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Title level={3}>Producto no encontrado</Title>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 24px' }}>
      <Breadcrumb
        items={[
          { title: <><HomeOutlined /> Inicio</>, href: '/' },
          { title: 'Zapatos', href: '/' },
          ...product.category_path.slice(1).map(p => ({ title: p })),
          { title: product.name },
        ]}
        style={{ marginBottom: 24 }}
      />

      <Row gutter={[48, 24]}>
        {/* Image gallery */}
        <Col xs={24} md={12}>
          <div style={{ position: 'sticky', top: 120 }}>
            <Image
              src={product.images[mainImage] ?? product.image_url}
              alt={product.name}
              style={{
                width: '100%',
                maxHeight: 500,
                objectFit: 'contain',
                background: '#f5f5f5',
                borderRadius: 8,
              }}
              preview
            />
            <Space style={{ marginTop: 12 }}>
              {product.images.map((img, idx) => (
                <div
                  key={idx}
                  onClick={() => setMainImage(idx)}
                  style={{
                    width: 64,
                    height: 64,
                    border: idx === mainImage ? '2px solid #1677ff' : '1px solid #d9d9d9',
                    borderRadius: 4,
                    cursor: 'pointer',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f5f5f5',
                  }}
                >
                  <img src={img} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>
              ))}
            </Space>
          </div>
        </Col>

        {/* Product info */}
        <Col xs={24} md={12}>
          <Text type="secondary" style={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 13 }}>
            {product.brand}
          </Text>
          <Title level={2} style={{ margin: '8px 0 12px' }}>{product.name}</Title>

          <Space size={8} style={{ marginBottom: 16 }}>
            <Rate disabled value={product.rating} allowHalf style={{ fontSize: 16 }} />
            <Text type="secondary">({product.review_count} opiniones)</Text>
          </Space>

          <div style={{ marginBottom: 24 }}>
            <Title level={3} style={{ color: '#1677ff', margin: 0, display: 'inline' }}>
              ${product.price.toFixed(2)}
            </Title>
            {product.original_price && (
              <>
                <Text delete type="secondary" style={{ fontSize: 18, marginLeft: 12 }}>
                  ${product.original_price.toFixed(2)}
                </Text>
                <Tag color="red" style={{ marginLeft: 12 }}>
                  {Math.round((1 - product.price / product.original_price) * 100)}% OFF
                </Tag>
              </>
            )}
          </div>

          <Divider />

          {/* Color selector */}
          <div style={{ marginBottom: 20 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              Color: {product.colors.find(c => c.id === selectedColor)?.name ?? 'Seleccionar'}
            </Text>
            <Space size={8}>
              {product.colors.map(color => (
                <div
                  key={color.id}
                  onClick={() => setSelectedColor(color.id)}
                  title={color.name}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: color.hex ?? '#ccc',
                    border: selectedColor === color.id ? '3px solid #1677ff' : '2px solid #d9d9d9',
                    cursor: 'pointer',
                    transition: 'border 0.2s',
                  }}
                />
              ))}
            </Space>
          </div>

          {/* Size selector */}
          <div style={{ marginBottom: 24 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Talla:</Text>
            <Select
              placeholder="Seleccionar talla"
              value={selectedSize}
              onChange={setSelectedSize}
              style={{ width: 200 }}
              options={product.sizes.map(s => ({ value: s, label: `Talla ${s}` }))}
            />
          </div>

          {/* Action buttons */}
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Button
              type="primary"
              size="large"
              icon={<ShoppingCartOutlined />}
              block
              disabled={!selectedSize}
            >
              {selectedSize ? 'Agregar al Carrito' : 'Selecciona una talla'}
            </Button>
            <Button size="large" icon={<HeartOutlined />} block>
              Agregar a Favoritos
            </Button>
          </Space>

          <Divider />

          {/* Description */}
          {product.web_description && (
            <div style={{ marginBottom: 24 }}>
              <Title level={5}>Descripción</Title>
              <Paragraph>{product.web_description}</Paragraph>
            </div>
          )}

          {/* Specifications */}
          {product.specifications && Object.keys(product.specifications).length > 0 && (
            <div>
              <Title level={5}>Especificaciones</Title>
              <div style={{ background: '#fafafa', borderRadius: 8, padding: 16 }}>
                {Object.entries(product.specifications).map(([key, value]) => (
                  <Row key={key} style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <Col span={10}><Text type="secondary">{key}</Text></Col>
                    <Col span={14}><Text>{value}</Text></Col>
                  </Row>
                ))}
              </div>
            </div>
          )}
        </Col>
      </Row>
    </div>
  )
}
