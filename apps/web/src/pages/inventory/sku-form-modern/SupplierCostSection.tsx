import { Button, Col, Form, InputNumber, Row, Select, Space, Typography } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { sectionCard, sectionTitle, sectionSubtitle, tokens } from './styles'
import { VendorNameAutofill } from './formHelpers'
import { Input } from 'antd'

interface SupplierCostSectionProps {
  vendors: { code: string; name: string }[] | undefined
  vendorsLoading: boolean
  onOpenVendorLookup: () => void
}

export function SupplierCostSection({
  vendors,
  vendorsLoading,
  onOpenVendorLookup,
}: SupplierCostSectionProps) {
  return (
    <div style={sectionCard}>
      <div style={{ marginBottom: tokens.card.headerMarginBottom }}>
        <Typography.Text style={sectionTitle}>2. Proveedor y Costo</Typography.Text>
        <div style={sectionSubtitle}>
          Código de proveedor RICS (4 letras) con autofill de nombre, costo actual en Lempira.
        </div>
      </div>

      <Row gutter={tokens.rowGutter}>
        <Col xs={24} sm={12} md={6}>
          <Form.Item
            label={
              <Space size={6} align="center">
                <span>Código Vendor</span>
                <span style={{ color: tokens.colors.required }}>*</span>
                <Button
                  type="link"
                  size="small"
                  icon={<SearchOutlined />}
                  onClick={onOpenVendorLookup}
                  style={{ padding: 0, height: 'auto', lineHeight: 1 }}
                >
                  Buscar
                </Button>
              </Space>
            }
            name="vendorId"
            rules={[{ required: true, message: 'Vendor requerido' }]}
            style={{ marginBottom: 12 }}
          >
            <Select
              placeholder="Código"
              showSearch
              size="large"
              optionFilterProp="label"
              loading={vendorsLoading}
              options={vendors?.map((v) => ({
                label: `${v.code} — ${v.name}`,
                value: v.code,
                name: v.name,
              }))}
              filterOption={(input, option) => {
                const s = input.toLowerCase()
                const code = String(option?.value ?? '').toLowerCase()
                const name = String((option as { name?: string } | undefined)?.name ?? '').toLowerCase()
                return code.includes(s) || name.includes(s)
              }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={10}>
          <Form.Item label="Nombre Vendor" style={{ marginBottom: 12 }}>
            <VendorNameAutofill vendors={vendors} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item label="Vendor SKU" name="vendorSku" style={{ marginBottom: 12 }}>
            <Input placeholder="SKU del proveedor (referencia original)" size="large" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={tokens.rowGutter}>
        <Col xs={24} sm={12} md={8}>
          <Form.Item
            label={<span>Costo Actual <span style={{ color: tokens.colors.required }}>*</span></span>}
            name="cost"
            rules={[
              { required: true, message: 'Costo requerido' },
              { type: 'number', min: 0, message: 'Costo debe ser mayor o igual a 0' },
            ]}
            style={{ marginBottom: 12 }}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={0.01}
              precision={2}
              placeholder="0.00"
              size="large"
            />
          </Form.Item>
        </Col>
      </Row>
    </div>
  )
}
