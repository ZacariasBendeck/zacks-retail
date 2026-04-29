import { Col, Collapse, Form, Input, Row, Select, Switch, Typography } from 'antd'
import { sectionCard, sectionTitle, sectionSubtitle, tokens } from './styles'
import { SeasonAutofill, refOptions } from './formHelpers'
import type { ReferenceItem } from '../../../types/sku'

interface AdvancedSectionProps {
  refData: Record<string, ReferenceItem[]> | undefined
  attributeOptionsByDimension: Record<string, { label: string; value: string }[]>
  seasonsCatalog: { code: string; description: string }[] | undefined
}

export function AdvancedSection({ refData, attributeOptionsByDimension, seasonsCatalog }: AdvancedSectionProps) {
  return (
    <Collapse
      defaultActiveKey={[]}
      style={{ background: 'transparent', border: 'none' }}
      expandIconPosition="end"
      items={[
        {
          key: 'advanced',
          style: { ...sectionCard, padding: 0, border: `1px solid ${tokens.colors.border}` },
          label: (
            <div style={{ padding: '4px 0' }}>
              <Typography.Text style={sectionTitle}>5. Avanzado</Typography.Text>
              <div style={sectionSubtitle}>
                Temporada, ubicación, notas internas, código de barras, cupón. Opcional.
              </div>
            </div>
          ),
          children: (
            <div style={{ padding: '0 20px 20px' }}>
              <Row gutter={tokens.rowGutter}>
                <Col xs={12} sm={6} md={4}>
                  <Form.Item label="Código Temporada" name="season" style={{ marginBottom: 12 }}>
                    <Input placeholder="ej. SS" maxLength={2} />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={10} md={8}>
                  <Form.Item label="Temporada (auto)" style={{ marginBottom: 12 }}>
                    <SeasonAutofill seasons={seasonsCatalog} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8} md={6}>
                  <Form.Item label="Temporada (ref)" name="seasonId" style={{ marginBottom: 12 }}>
                    <Select placeholder="Seleccionar" allowClear options={refOptions(refData?.['seasons'])} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={24} md={6}>
                  <Form.Item label="Tipo de Etiqueta" name="labelTypeId" style={{ marginBottom: 12 }}>
                    <Select placeholder="Tipo" allowClear options={attributeOptionsByDimension.label_type ?? []} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={tokens.rowGutter}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="Palabras Clave"
                    name="keywords"
                    rules={[{ max: 60, message: 'Máximo 60 caracteres' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <Input placeholder="separadas por coma" maxLength={60} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="Descripción Web"
                    name="webDescription"
                    rules={[{ max: 1000 }]}
                    style={{ marginBottom: 12 }}
                  >
                    <Input placeholder="Descripción larga" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={tokens.rowGutter}>
                <Col xs={12} sm={6}>
                  <Form.Item
                    label="Ubicación"
                    name="location"
                    rules={[{ max: 10, message: 'Máximo 10 caracteres' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <Input placeholder="Ubicación" maxLength={10} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={10}>
                  <Form.Item
                    label="Notas Internas"
                    name="comment"
                    rules={[{ max: 30, message: 'Máximo 30 caracteres' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <Input placeholder="Notas internas" maxLength={30} />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={4}>
                  <Form.Item
                    label="Cupón"
                    name="coupon"
                    valuePropName="checked"
                    style={{ marginBottom: 12 }}
                  >
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={tokens.rowGutter}>
                <Col xs={24} sm={12} md={8}>
                  <Form.Item
                    label="Código de Barras / UPC"
                    name="barcode"
                    rules={[{ max: 20, message: 'Máximo 20 caracteres' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <Input placeholder="Auto si se deja vacío" maxLength={20} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <Form.Item
                    label="Archivo de Imagen (legacy)"
                    name="pictureFileName"
                    rules={[{ max: 50, message: 'Máximo 50 caracteres' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <Input placeholder="ej. SKU123.jpg" maxLength={50} />
                  </Form.Item>
                </Col>
              </Row>
            </div>
          ),
        },
      ]}
    />
  )
}
