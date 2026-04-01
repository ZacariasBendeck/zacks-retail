import { useParams, useNavigate } from 'react-router-dom'
import { Row, Col, Typography, Button, Rate, Space, Divider, Breadcrumb, Select, Spin, Image, message } from 'antd'
import { ArrowLeftOutlined, HomeOutlined, ShoppingCartOutlined, HeartOutlined } from '@ant-design/icons'
import { useProduct } from '@/hooks/useProducts'
import { useState } from 'react'
import { useCartStore } from '@/store/cartStore'

const { Title, Text, Paragraph } = Typography

const PLACEHOLDER_IMG = 'https://placehold.co/600x600/f5f5f5/999?text=Sin+Imagen'

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: product, isLoading } = useProduct(id ?? '')
  const [selectedSize, setSelectedSize] = useState<string>()
  const [selectedColor, setSelectedColor] = useState<number>()
  const { addItem } = useCartStore()

  const handleAddToCart = async () => {
    if (!product || !selectedSize) return
    await addItem(parseInt(selectedSize, 10))
    message.success('Agregado al carrito')
  }

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

  const specsEntries = product.specs
    ? Object.entries(product.specs).filter(([, v]) => v != null) as [string, string][]
    : []

  const SPEC_LABELS: Record<string, string> = {
    shoeType: 'Tipo de Zapato',
    heelShape: 'Forma del Tacon',
    heelHeight: 'Altura del Tacon',
    toeShape: 'Forma de Punta',
    closureType: 'Tipo de Cierre',
    upperMaterial: 'Material Superior',
    outsoleMaterial: 'Material de Suela',
    finish: 'Acabado',
    widthType: 'Ancho',
    pattern: 'Patron',
    occasion: 'Ocasion',
    heelType: 'Tipo de Tacon',
    material: 'Material',
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 24px' }}>
      <Breadcrumb
        items={[
          { title: <><HomeOutlined /> Inicio</>, href: '/' },
          { title: 'Zapatos', href: '/' },
          ...(product.department ? [{ title: product.department }] : []),
          ...(product.category ? [{ title: product.category }] : []),
          { title: product.name },
        ]}
        style={{ marginBottom: 24 }}
      />

      <Row gutter={[48, 24]}>
        {/* Image */}
        <Col xs={24} md={12}>
          <div style={{ position: 'sticky', top: 120 }}>
            <Image
              src={product.mainImage ?? PLACEHOLDER_IMG}
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
          </div>
        </Col>

        {/* Product info */}
        <Col xs={24} md={12}>
          <Text type="secondary" style={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 13 }}>
            {product.brand ?? 'Sin marca'}
          </Text>
          <Title level={2} style={{ margin: '8px 0 12px' }}>{product.name}</Title>

          {product.rating != null && (
            <Space size={8} style={{ marginBottom: 16 }}>
              <Rate disabled value={product.rating} allowHalf style={{ fontSize: 16 }} />
            </Space>
          )}

          <div style={{ marginBottom: 24 }}>
            <Title level={3} style={{ color: '#1677ff', margin: 0, display: 'inline' }}>
              ${product.price.toFixed(2)}
            </Title>
          </div>

          <Divider />

          {/* Color selector */}
          {product.availableColors.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                Color: {product.availableColors.find(c => c.colorId === selectedColor)?.name ?? product.color ?? 'Seleccionar'}
              </Text>
              <Space size={8}>
                {product.availableColors.map(color => (
                  <div
                    key={color.colorId}
                    onClick={() => setSelectedColor(color.colorId)}
                    title={color.name}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: '#ccc',
                      border: selectedColor === color.colorId ? '3px solid #1677ff' : '2px solid #d9d9d9',
                      cursor: 'pointer',
                      transition: 'border 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {color.code}
                  </div>
                ))}
              </Space>
            </div>
          )}

          {/* Size selector */}
          {product.availableSizes.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>Talla:</Text>
              <Select
                placeholder="Seleccionar talla"
                value={selectedSize}
                onChange={setSelectedSize}
                style={{ width: 200 }}
                options={product.availableSizes.map(s => ({
                  value: s.id,
                  label: `Talla ${s.label}${s.inStock ? '' : ' (Agotado)'}`,
                  disabled: !s.inStock,
                }))}
              />
            </div>
          )}

          {/* Action buttons */}
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Button
              type="primary"
              size="large"
              icon={<ShoppingCartOutlined />}
              block
              disabled={!selectedSize}
              onClick={handleAddToCart}
            >
              {selectedSize ? 'Agregar al Carrito' : 'Selecciona una talla'}
            </Button>
            <Button size="large" icon={<HeartOutlined />} block>
              Agregar a Favoritos
            </Button>
          </Space>

          <Divider />

          {/* Description */}
          {product.description && (
            <div style={{ marginBottom: 24 }}>
              <Title level={5}>Descripcion</Title>
              <Paragraph>{product.description}</Paragraph>
            </div>
          )}

          {/* Specifications */}
          {specsEntries.length > 0 && (
            <div>
              <Title level={5}>Especificaciones</Title>
              <div style={{ background: '#fafafa', borderRadius: 8, padding: 16 }}>
                {specsEntries.map(([key, value]) => (
                  <Row key={key} style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <Col span={10}><Text type="secondary">{SPEC_LABELS[key] ?? key}</Text></Col>
                    <Col span={14}><Text>{value}</Text></Col>
                  </Row>
                ))}
              </div>
            </div>
          )}

          {/* SKU code */}
          <div style={{ marginTop: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>SKU: {product.skuCode}</Text>
          </div>
        </Col>
      </Row>
    </div>
  )
}
