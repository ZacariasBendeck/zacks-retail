import { AutoComplete, Col, Form, Input, Row, Spin, Typography } from 'antd'
import { LoadingOutlined, SearchOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { sectionCard, sectionTitle, sectionSubtitle, readonlyInput } from './styles'
import type { SkuLifecycleRow } from '../../../types/skuLifecycle'

interface SkuCodeStripProps {
  /** Route-based edit mode: we're editing an existing SKU (has skuId in URL). */
  isRouteEdit: boolean
  /** Whether there's a final SKU code locked (ACTIVE/DISCONTINUED). */
  isDraft: boolean
  isActive: boolean
  lifecycleSku: SkuLifecycleRow | undefined

  /** Create-mode lookup options + state. */
  skuSearchOptions: { value: string; label: React.ReactNode }[]
  matched: boolean
  searchPending: boolean
  lookupPending: boolean
  onSearch: (text: string) => void
  onSelect: (value: string) => void
  onBlur: () => void
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
  skuSearchOptions,
  matched,
  searchPending,
  lookupPending,
  onSearch,
  onSelect,
  onBlur,
}: SkuCodeStripProps) {
  const [text, setText] = useState('')
  return (
    <div style={sectionCard}>
      {!isRouteEdit ? (
        <Row gutter={16} align="middle">
          <Col xs={24} sm={12} md={10} lg={8}>
            <Typography.Text style={sectionTitle}>Buscar SKU existente</Typography.Text>
            <div style={sectionSubtitle}>
              Escribe un código para editarlo. Si no, se creará uno nuevo con código provisional auto-generado.
            </div>
            <Form.Item name="skuCode" style={{ marginBottom: 0 }}>
              <AutoComplete
                options={skuSearchOptions}
                onSearch={(v) => {
                  setText(v)
                  onSearch(v)
                }}
                onSelect={onSelect}
                onBlur={onBlur}
                placeholder="ej. FORMAL-NIKE-BLK-001 (opcional)"
                disabled={matched}
                popupMatchSelectWidth={420}
                notFoundContent={
                  searchPending
                    ? <Spin size="small" />
                    : text.length >= 1 ? 'No se encontraron SKUs' : null
                }
              >
                <Input
                  size="large"
                  suffix={
                    lookupPending || searchPending ? (
                      <LoadingOutlined />
                    ) : (
                      <SearchOutlined style={{ color: '#999' }} />
                    )
                  }
                  onPressEnter={(e) => {
                    e.preventDefault()
                    onBlur()
                  }}
                />
              </AutoComplete>
            </Form.Item>
          </Col>
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
