import { Col, Collapse, Form, Row, Select, Typography } from 'antd'
import { sectionCard, sectionTitle, sectionSubtitle, tokens } from './styles'
import { aiLabel, fieldStyle, isApparienciaFieldVisible } from './formHelpers'

interface AppearanceSectionProps {
  selectedFamily: string | null
  attributeOptionsByDimension: Record<string, { label: string; value: string }[]>
  aiFilledFields: Set<string>
}

/**
 * Apariencia / Diseño — dimensional attributes. Auto-expanded when
 * family=zapatos (14 fields), collapsed by default otherwise (only 5 fields
 * show but still behind a toggle to keep the primary flow tight).
 */
export function AppearanceSection({ selectedFamily, attributeOptionsByDimension, aiFilledFields }: AppearanceSectionProps) {
  const autoExpanded = selectedFamily === 'zapatos'

  return (
    <Collapse
      defaultActiveKey={autoExpanded ? ['appearance'] : []}
      style={{ background: 'transparent', border: 'none' }}
      expandIconPosition="end"
      items={[
        {
          key: 'appearance',
          style: { ...sectionCard, padding: 0, border: `1px solid ${tokens.colors.border}` },
          label: (
            <div style={{ padding: '4px 0' }}>
              <Typography.Text style={sectionTitle}>4. Apariencia y Diseño</Typography.Text>
              <div style={sectionSubtitle}>
                Atributos dimensionales (color, patrón, acabado, materiales). El set completo aparece para zapatos.
              </div>
            </div>
          ),
          children: (
            <div style={{ padding: '0 20px 20px' }}>
              <Row gutter={tokens.rowGutter}>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item
                    label={aiLabel('Patrón', 'patternId', aiFilledFields)}
                    name="patternId"
                    style={fieldStyle(aiFilledFields, 'patternId')}
                  >
                    <Select placeholder="Seleccionar" allowClear options={attributeOptionsByDimension.pattern ?? []} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item
                    label={aiLabel('Acabado', 'finishId', aiFilledFields)}
                    name="finishId"
                    style={fieldStyle(aiFilledFields, 'finishId')}
                  >
                    <Select placeholder="Seleccionar" allowClear options={attributeOptionsByDimension.finish ?? []} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item
                    label={aiLabel('Ocasión', 'occasionId', aiFilledFields)}
                    name="occasionId"
                    style={fieldStyle(aiFilledFields, 'occasionId')}
                  >
                    <Select placeholder="Seleccionar" allowClear options={attributeOptionsByDimension.occasion ?? []} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Form.Item
                    label={aiLabel('Género', 'genderId', aiFilledFields)}
                    name="genderId"
                    style={fieldStyle(aiFilledFields, 'genderId')}
                  >
                    <Select
                      placeholder="Seleccionar"
                      allowClear
                      options={attributeOptionsByDimension.target_audience ?? []}
                    />
                  </Form.Item>
                </Col>
              </Row>

              {(isApparienciaFieldVisible('widthTypeId', selectedFamily)
                || isApparienciaFieldVisible('accessoryId', selectedFamily)
                || isApparienciaFieldVisible('heelHeightId', selectedFamily)
                || isApparienciaFieldVisible('heelShapeId', selectedFamily)
                || isApparienciaFieldVisible('toeShapeId', selectedFamily)) && (
                <Row gutter={tokens.rowGutter}>
                  {isApparienciaFieldVisible('widthTypeId', selectedFamily) && (
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <Form.Item label="Ancho" name="widthTypeId" style={{ marginBottom: 12 }}>
                        <Select placeholder="Seleccionar" allowClear options={attributeOptionsByDimension.width_type ?? []} />
                      </Form.Item>
                    </Col>
                  )}
                  {isApparienciaFieldVisible('accessoryId', selectedFamily) && (
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <Form.Item
                        label={aiLabel('Accesorio', 'accessoryId', aiFilledFields)}
                        name="accessoryId"
                        style={fieldStyle(aiFilledFields, 'accessoryId')}
                      >
                        <Select placeholder="Seleccionar" allowClear options={attributeOptionsByDimension.accessory ?? []} />
                      </Form.Item>
                    </Col>
                  )}
                  {isApparienciaFieldVisible('heelHeightId', selectedFamily) && (
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <Form.Item
                        label={aiLabel('Altura del Tacón', 'heelHeightId', aiFilledFields)}
                        name="heelHeightId"
                        style={fieldStyle(aiFilledFields, 'heelHeightId')}
                      >
                        <Select placeholder="Seleccionar" allowClear options={attributeOptionsByDimension.heel_height ?? []} />
                      </Form.Item>
                    </Col>
                  )}
                  {isApparienciaFieldVisible('heelShapeId', selectedFamily) && (
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <Form.Item
                        label={aiLabel('Forma del Tacón', 'heelShapeId', aiFilledFields)}
                        name="heelShapeId"
                        style={fieldStyle(aiFilledFields, 'heelShapeId')}
                      >
                        <Select placeholder="Seleccionar" allowClear options={attributeOptionsByDimension.heel_shape ?? []} />
                      </Form.Item>
                    </Col>
                  )}
                  {isApparienciaFieldVisible('toeShapeId', selectedFamily) && (
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <Form.Item
                        label={aiLabel('Forma de la Punta', 'toeShapeId', aiFilledFields)}
                        name="toeShapeId"
                        style={fieldStyle(aiFilledFields, 'toeShapeId')}
                      >
                        <Select placeholder="Seleccionar" allowClear options={attributeOptionsByDimension.toe_shape ?? []} />
                      </Form.Item>
                    </Col>
                  )}
                </Row>
              )}

              {(isApparienciaFieldVisible('upperMaterialId', selectedFamily)
                || isApparienciaFieldVisible('outsoleMaterialId', selectedFamily)
                || isApparienciaFieldVisible('heelMaterialId', selectedFamily)) && (
                <Row gutter={tokens.rowGutter}>
                  {isApparienciaFieldVisible('upperMaterialId', selectedFamily) && (
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <Form.Item
                        label={aiLabel('Material Superior', 'upperMaterialId', aiFilledFields)}
                        name="upperMaterialId"
                        style={fieldStyle(aiFilledFields, 'upperMaterialId')}
                      >
                        <Select
                          placeholder="Seleccionar"
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          options={attributeOptionsByDimension.upper_material ?? []}
                        />
                      </Form.Item>
                    </Col>
                  )}
                  {isApparienciaFieldVisible('outsoleMaterialId', selectedFamily) && (
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <Form.Item
                        label={aiLabel('Material de Suela', 'outsoleMaterialId', aiFilledFields)}
                        name="outsoleMaterialId"
                        style={fieldStyle(aiFilledFields, 'outsoleMaterialId')}
                      >
                        <Select placeholder="Seleccionar" allowClear options={attributeOptionsByDimension.outsole_material ?? []} />
                      </Form.Item>
                    </Col>
                  )}
                  {isApparienciaFieldVisible('heelMaterialId', selectedFamily) && (
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <Form.Item
                        label={aiLabel('Material del Tacón', 'heelMaterialId', aiFilledFields)}
                        name="heelMaterialId"
                        style={fieldStyle(aiFilledFields, 'heelMaterialId')}
                      >
                        <Select placeholder="Seleccionar" allowClear options={attributeOptionsByDimension.heel_material ?? []} />
                      </Form.Item>
                    </Col>
                  )}
                </Row>
              )}
            </div>
          ),
        },
      ]}
    />
  )
}
