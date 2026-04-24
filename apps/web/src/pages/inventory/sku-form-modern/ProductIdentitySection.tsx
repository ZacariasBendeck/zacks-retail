import { Button, Col, Form, Input, Row, Select, Space, Tag, Typography, Upload } from 'antd'
import { CameraOutlined, LoadingOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { sectionCard, sectionTitle, sectionSubtitle, tokens, monoInput } from './styles'
import { aiLabel, fieldStyle, refOptions } from './formHelpers'
import type { ProductFamily, ReferenceItem } from '../../../types/sku'
import type { PostgresCategory } from '../../../hooks/useProductCategories'
import type { Group, SizeType } from '../../../types/productsTaxonomy'

interface ProductIdentitySectionProps {
  /** Image state. */
  imagePreview: string | null
  analyzing: boolean
  analysisWarning: string | null
  onImageFile: (file: File) => void
  onFillWithAi: () => void
  canFillWithAi: boolean

  /** Family picker. */
  selectedFamily: string | null
  onFamilyChange: (code: string | null) => void
  productFamilies: ProductFamily[] | undefined
  familiesLoading: boolean

  /** Category picker. */
  categoryOptions: { label: string; value: number }[]
  onCategoryChange: (n: number | null) => void
  validCategoriesById: Map<number, PostgresCategory>
  familyLabelByCode: Map<string, string>
  derivedFamilyCode: string | null
  derivedDepartmentLabel: string | null

  /** Color, size type. */
  refData: Record<string, ReferenceItem[]> | undefined
  sizeTypes: SizeType[] | undefined
  sizeTypesLoading: boolean

  /** Group code dropdown (app.sku.group_code → ref_groups). */
  groups: Group[] | undefined
  groupsLoading: boolean

  /** Style-color canonical template. */
  styleColorOptions: { label: string; value: string }[]
  styleColorsLoading: boolean
  onStyleColorChange: (id: string | null) => void

  /** AI-filled field set for highlight. */
  aiFilledFields: Set<string>
}

export function ProductIdentitySection({
  imagePreview,
  analyzing,
  analysisWarning,
  onImageFile,
  onFillWithAi,
  canFillWithAi,
  selectedFamily,
  onFamilyChange,
  productFamilies,
  familiesLoading,
  categoryOptions,
  onCategoryChange,
  validCategoriesById,
  familyLabelByCode,
  derivedFamilyCode,
  derivedDepartmentLabel,
  refData,
  sizeTypes,
  sizeTypesLoading,
  groups,
  groupsLoading,
  styleColorOptions,
  styleColorsLoading,
  onStyleColorChange,
  aiFilledFields,
}: ProductIdentitySectionProps) {
  const [templateOpen, setTemplateOpen] = useState(false)
  const sizeTypeOptions = (sizeTypes ?? []).map((s) => ({
    value: s.code,
    label: `${s.code} — ${s.description}`,
  }))
  const groupOptions = (groups ?? []).map((g) => ({
    value: g.code,
    label: `${g.code} — ${g.description}`,
  }))

  return (
    <div style={sectionCard}>
      <div style={{ marginBottom: tokens.card.headerMarginBottom }}>
        <Typography.Text style={sectionTitle}>1. Identidad del Producto</Typography.Text>
        <div style={sectionSubtitle}>
          Arrastra una foto y deja que la IA prellene los atributos, o ingresa los datos manualmente.
        </div>
      </div>

      <Row gutter={tokens.rowGutter}>
        {/* LEFT — 240px image column. Fixed-width wrapper keeps the Dragger +
            button stacked as a single unit; using display:block ensures each
            child takes full inline width. */}
        <Col xs={24} md={8} lg={7} xl={6}>
          <div style={{ width: tokens.image.dropzoneSize, maxWidth: '100%' }}>
            <div
              style={{
                width: '100%',
                height: tokens.image.dropzoneSize,
                marginBottom: 12,
              }}
            >
              <Upload.Dragger
                accept="image/jpeg,image/png,image/gif,image/webp"
                showUploadList={false}
                beforeUpload={(file) => {
                  onImageFile(file)
                  return false
                }}
                disabled={analyzing || !selectedFamily}
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: tokens.image.borderRadius,
                  padding: 0,
                  overflow: 'hidden',
                  background: imagePreview ? '#fff' : tokens.colors.mutedBg,
                }}
              >
                {analyzing ? (
                  <div style={{ textAlign: 'center' }}>
                    <LoadingOutlined style={{ fontSize: 32, color: '#1677ff' }} />
                    <div style={{ marginTop: 8, fontSize: 12 }}>Analizando…</div>
                  </div>
                ) : imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Producto"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      borderRadius: tokens.image.borderRadius,
                    }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: 16 }}>
                    <CameraOutlined style={{ fontSize: 40, color: '#999' }} />
                    <div style={{ marginTop: 12, fontSize: 13, fontWeight: 500 }}>
                      Clic, arrastra, o Ctrl+V
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11, color: tokens.colors.textMuted }}>
                      JPG · PNG · GIF · WebP
                    </div>
                  </div>
                )}
              </Upload.Dragger>
            </div>

            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={onFillWithAi}
              disabled={!canFillWithAi}
              style={{ width: '100%', fontWeight: 600 }}
            >
              Llenar con IA
            </Button>

            {!selectedFamily && (
              <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                Selecciona una Familia primero para habilitar el análisis.
              </Typography.Text>
            )}
            {analysisWarning && (
              <Typography.Text type="warning" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                {analysisWarning}
              </Typography.Text>
            )}
          </div>
        </Col>

        {/* RIGHT — identity fields */}
        <Col xs={24} md={16} lg={17} xl={18}>
          <Row gutter={tokens.rowGutter}>
            <Col xs={24} sm={12}>
              <Form.Item
                label={<span>Familia de Producto <span style={{ color: tokens.colors.required }}>*</span></span>}
                style={{ marginBottom: 12 }}
              >
                <Select
                  placeholder="Selecciona una familia…"
                  value={selectedFamily}
                  onChange={(v) => onFamilyChange(v ?? null)}
                  loading={familiesLoading}
                  allowClear
                  size="large"
                  options={(productFamilies ?? []).map((f) => ({ label: f.labelEs, value: f.code }))}
                />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                label={
                  <Space size={6}>
                    {aiLabel('Categoría', 'categoryId', aiFilledFields)}
                    {derivedFamilyCode && (
                      <Tag color="blue" style={{ fontSize: 11 }}>
                        {familyLabelByCode.get(derivedFamilyCode) ?? derivedFamilyCode}
                      </Tag>
                    )}
                  </Space>
                }
                name="categoryId"
                rules={[
                  { required: true, message: 'Categoría requerida' },
                  {
                    validator: (_, value: number | null | undefined) => {
                      if (value == null) return Promise.resolve()
                      if (!validCategoriesById.has(value)) {
                        return Promise.reject(new Error('Categoría no encontrada en Postgres.'))
                      }
                      return Promise.resolve()
                    },
                  },
                ]}
                style={fieldStyle(aiFilledFields, 'categoryId')}
              >
                <Select
                  placeholder={selectedFamily ? 'Buscar categoría' : 'Selecciona una Familia primero'}
                  disabled={!selectedFamily}
                  allowClear
                  showSearch
                  size="large"
                  optionFilterProp="label"
                  options={categoryOptions}
                  onChange={onCategoryChange}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={tokens.rowGutter}>
            <Col xs={24} sm={12}>
              <Form.Item label="Departamento (auto)" style={{ marginBottom: 12 }}>
                <Input
                  value={derivedDepartmentLabel ?? ''}
                  readOnly
                  placeholder="Deriva de la categoría"
                  style={monoInput}
                  size="large"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Descripción"
                name="ricsDescription"
                rules={[
                  { required: true, message: 'Descripción requerida' },
                  { max: 30, message: 'Máximo 30 caracteres (RICS Desc WCHAR 30)' },
                ]}
                style={{ marginBottom: 12 }}
              >
                <Input placeholder="Descripción corta" maxLength={30} size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={tokens.rowGutter}>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Marca"
                name="brandId"
                rules={[{ required: true, message: 'Marca requerida' }]}
                style={{ marginBottom: 12 }}
              >
                <Input placeholder="Escriba la marca" allowClear size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item
                label="Estilo"
                name="style"
                rules={[
                  { required: true, message: 'Estilo requerido' },
                  { max: 17, message: 'Máximo 17 chars' },
                ]}
                style={{ marginBottom: 12 }}
              >
                <Input placeholder="Estilo" maxLength={17} size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={4}>
              <Form.Item label="Group" name="groupCode" style={{ marginBottom: 12 }}>
                <Select
                  placeholder="Group"
                  allowClear
                  showSearch
                  size="large"
                  optionFilterProp="label"
                  loading={groupsLoading}
                  options={groupOptions}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={tokens.rowGutter}>
            <Col xs={24} sm={12}>
              <Form.Item
                label={aiLabel('Color', 'colorId', aiFilledFields)}
                name="colorId"
                style={fieldStyle(aiFilledFields, 'colorId')}
              >
                <Select
                  placeholder="Seleccionar color"
                  allowClear
                  showSearch
                  size="large"
                  optionFilterProp="label"
                  options={refOptions(refData?.['colors'])}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Size Types" name="sizeType" style={{ marginBottom: 12 }}>
                <Select
                  placeholder="Seleccionar grid"
                  allowClear
                  showSearch
                  size="large"
                  optionFilterProp="label"
                  loading={sizeTypesLoading}
                  options={sizeTypeOptions}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Template affordance — collapsed by default so it doesn't clutter identity */}
          <div style={{ marginTop: 4 }}>
            {!templateOpen ? (
              <Button type="link" size="small" onClick={() => setTemplateOpen(true)} style={{ padding: 0 }}>
                + Usar plantilla style-color existente
              </Button>
            ) : (
              <div
                style={{
                  border: `1px dashed ${tokens.colors.border}`,
                  borderRadius: 8,
                  padding: 12,
                  marginTop: 8,
                  background: tokens.colors.mutedBg,
                }}
              >
                <Row align="middle" gutter={8} style={{ marginBottom: 8 }}>
                  <Col flex="auto">
                    <Typography.Text strong style={{ fontSize: 13 }}>
                      Plantilla style-color
                    </Typography.Text>
                    <div style={{ fontSize: 11, color: tokens.colors.textMuted }}>
                      Copia estilo, marca, color, categoría y temporada de una combinación existente.
                    </div>
                  </Col>
                  <Col>
                    <Button type="link" size="small" onClick={() => setTemplateOpen(false)}>
                      Cerrar
                    </Button>
                  </Col>
                </Row>
                <Form.Item name="styleColorId" style={{ marginBottom: 0 }}>
                  <Select
                    placeholder="Buscar combinación existente…"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    loading={styleColorsLoading}
                    options={styleColorOptions as { label: string; value: string | null }[]}
                    onChange={(v) => onStyleColorChange((v as string | null) ?? null)}
                  />
                </Form.Item>
              </div>
            )}
          </div>
        </Col>
      </Row>

    </div>
  )
}
