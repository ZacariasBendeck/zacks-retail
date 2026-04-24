import { Col, Form, Input, Row, Typography } from 'antd'
import { sectionCard, sectionTitle, sectionSubtitle, tokens } from './styles'
import { MarginPercentDisplay, PriceField } from './formHelpers'

export function PricingSection() {
  return (
    <div style={sectionCard}>
      <div style={{ marginBottom: tokens.card.headerMarginBottom }}>
        <Typography.Text style={sectionTitle}>3. Precios</Typography.Text>
        <div style={sectionSubtitle}>
          Montos en Lempiras. El margen se calcula en vivo a partir del costo y el precio de venta.
        </div>
      </div>

      <Row gutter={tokens.rowGutter}>
        <Col xs={24} sm={12} md={8} lg={6}>
          <PriceField
            name="price"
            label="Precio Venta (Retail) *"
            rules={[
              { required: true, message: 'Retail requerido' },
              { type: 'number', min: 0.01, message: 'Debe ser mayor a 0' },
            ]}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <PriceField name="listPrice" label="Precio de Lista" />
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <PriceField name="markDownPrice1" label="Markdown 1" />
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <PriceField name="markDownPrice2" label="Markdown 2" />
        </Col>
      </Row>

      <Row gutter={tokens.rowGutter}>
        <Col xs={24} sm={12} md={8} lg={6}>
          <PriceField name="perks" label="Perks" />
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <Form.Item label="Código de Descuento" name="discountCode" style={{ marginBottom: 12 }}>
            <Input placeholder="Ej. PROMO20" maxLength={20} size="large" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <Form.Item label="Margen %" style={{ marginBottom: 12 }}>
            <MarginPercentDisplay />
          </Form.Item>
        </Col>
      </Row>
    </div>
  )
}
