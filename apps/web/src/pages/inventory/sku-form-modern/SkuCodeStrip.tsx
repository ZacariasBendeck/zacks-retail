import { AutoComplete, Button, Col, Form, Input, Row, Spin, Typography } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { sectionCard, sectionTitle, sectionSubtitle, readonlyInput, tokens } from './styles'
import type { SkuLifecycleRow } from '../../../types/skuLifecycle'

interface SkuCodeStripProps {
  /** Route-based edit mode: we're editing an existing SKU (has skuId in URL). */
  isRouteEdit: boolean
  /** Whether there's a final SKU code locked (ACTIVE/DISCONTINUED). */
  isDraft: boolean
  isActive: boolean
  lifecycleSku: SkuLifecycleRow | undefined

  /** Create-mode lookup options + state. */
  existingSkuImageUrl?: string | null
  skuSearchOptions: { value: string; label: React.ReactNode }[]
  matched: boolean
  searchPending: boolean
  lookupPending: boolean
  onSearch: (text: string) => void
  onSelect: (value: string) => void
  onBlur: () => void
  /** Opens the full SKU Lookup modal (table view + facets). */
  onOpenSkuLookup?: () => void
}


/**
 * Compact strip above Product Identity. Two renders:
 *  - create mode (no route id): AutoComplete for looking up existing SKUs.
 *    Kept because operators still use it to switch to edit mode when typing a
 *    known code. Optional field — provisional DRF-… code auto-generates.
 *  - edit mode (draft): editable final-code Input, enabled only while DRAFT.
 */
export function SkuCodeStrip({
  isRouteEdit,
  isDraft,
  isActive,
  lifecycleSku,
  existingSkuImageUrl,
  skuSearchOptions,
  matched,
  searchPending,
  lookupPending,
  onSearch,
  onSelect,
  onBlur,
  onOpenSkuLookup,
}: SkuCodeStripProps) {
  const [text, setText] = useState('')
  const showExistingPreview = matched
  return (
    <div style={sectionCard}>
      {!isRouteEdit ? (
        <Row gutter={16} align="middle">
          <Col xs={24} sm={showExistingPreview ? 16 : 12} md={showExistingPreview ? 15 : 10} lg={showExistingPreview ? 14 : 8}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <Typography.Text style={sectionTitle}>Buscar SKU existente</Typography.Text>
              {onOpenSkuLookup && (
                <Button
                  type="link"
                  size="small"
                  icon={<SearchOutlined />}
                  onClick={onOpenSkuLookup}
                  disabled={matched}
                  style={{ padding: 0, height: 'auto', lineHeight: 1 }}
                  title="Abrir lookup de SKUs (Code / Description / Vendor / Style-Color)"
                >
                  Buscar
                </Button>
              )}
            </div>
            <div style={sectionSubtitle}>
              Escribe un código para editarlo, o haz clic en <b>Buscar</b> para abrir el lookup por descripción, vendor o style-color. Si no, se creará uno nuevo con código provisional auto-generado.
            </div>
            <Form.Item name="skuCode" style={{ marginBottom: 0 }}>
              <AutoComplete
                options={skuSearchOptions}
                onSearch={(v) => {
                  setText(v)
                  onSearch(v)
                }}
                onSelect={(value) => onSelect(value as string)}
                onBlur={onBlur}
                placeholder="ej. FORMAL-NIKE-BLK-001 (opcional)"
                disabled={matched}
                allowClear
                size="large"
                style={{ width: '100%' }}
                popupMatchSelectWidth={420}
                notFoundContent={
                  searchPending || lookupPending
                    ? <Spin size="small" />
                    : text.length >= 1 ? 'No se encontraron SKUs' : null
                }
              />
            </Form.Item>
          </Col>
          {showExistingPreview && (
            <Col xs={24} sm={8} md={9} lg={6}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ width: tokens.image.dropzoneSize, maxWidth: '100%' }}>
                  <Typography.Text style={sectionTitle}>Foto existente</Typography.Text>
                  <div
                    style={{
                      marginTop: 8,
                      height: 110,
                      border: '1px solid #d9d9d9',
                      borderRadius: tokens.image.borderRadius,
                      background: tokens.colors.mutedBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {existingSkuImageUrl ? (
                      <img
                        src={existingSkuImageUrl}
                        alt="SKU existente"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          pointerEvents: 'none',
                        }}
                      />
                    ) : (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Sin foto RICS
                      </Typography.Text>
                    )}
                  </div>
                </div>
              </div>
            </Col>
          )}
        </Row>
      ) : (
        <Row gutter={16}>
          <Col xs={24} sm={12} md={8}>
            <Form.Item
              label="Código SKU final"
              name="skuCode"
              style={{ marginBottom: 0 }}
              extra={
                isDraft
                  ? 'Define el código SKU final antes de finalizar.'
                  : isActive
                  ? 'El código ya no puede renombrarse (SKU ACTIVO).'
                  : 'SKU descontinuado — solo lectura.'
              }
              rules={[{ max: 15, message: 'Máximo 15 caracteres' }]}
            >
              <Input
                placeholder={isDraft ? 'ej. NAVY-ZARA-42R' : ''}
                disabled={!isDraft}
                maxLength={15}
                size="large"
              />
            </Form.Item>
          </Col>
          {lifecycleSku && (
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="Código provisional" style={{ marginBottom: 0 }}>
                <Input value={lifecycleSku.provisionalCode} readOnly style={{ ...readonlyInput, fontFamily: 'monospace' }} size="large" />
              </Form.Item>
            </Col>
          )}
        </Row>
      )}
    </div>
  )
}
