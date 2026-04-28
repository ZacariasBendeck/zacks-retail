import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Menu,
  Popconfirm,
  Row,
  Space,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  useAttributeDimensions,
  useDeleteDimension,
} from '../../../hooks/useProductsAttributes'
import CoverageTab from './CoverageTab'
import DimensionFormModal from './DimensionFormModal'
import MacroCategoriesTab from './MacroCategoriesTab'
import RulesTab from './RulesTab'
import ValuesTab from './ValuesTab'
import type { AttributeDimension } from '../../../types/productsAttributes'

/**
 * Extended-attributes admin — the "mini PIM" console.
 *
 * Left: dimensions menu with "+ Nueva" header button and per-row edit/delete
 * affordances. Right: three tabs (Valores | Reglas | Cobertura) for the
 * currently selected dimension.
 *
 * Mutations go through useProductsAttributes hooks which share invalidation
 * keys with /products/families so both pages stay in sync.
 */
export default function CatalogPage() {
  const { message } = App.useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const { data: dimensions, isLoading, error } = useAttributeDimensions(true)
  const del = useDeleteDimension()
  const [selected, setSelected] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formEditing, setFormEditing] = useState<AttributeDimension | null>(null)

  useEffect(() => {
    if (!dimensions || dimensions.length === 0) {
      setSelected(null)
      return
    }
    if (!selected || !dimensions.some((d) => d.code === selected)) {
      const first = dimensions[0]
      if (first) setSelected(first.code)
    }
  }, [dimensions, selected])

  const selectedDim = useMemo(
    () => dimensions?.find((d) => d.code === selected) ?? null,
    [dimensions, selected],
  )
  const activeTopTab = location.pathname.endsWith('/macros') ? 'macros' : 'dimensions'

  if (isLoading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }
  if (error) {
    return (
      <Alert
        type="error"
        message="Error al cargar el catálogo de atributos"
        description={(error as Error).message}
      />
    )
  }

  const menuItems = (dimensions ?? []).map((d) => ({
    key: d.code,
    label: (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <Space size={6}>
          <span>{d.labelEs}</span>
          {d.familyRules.length === 0 ? (
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>
              universal
            </Tag>
          ) : (
            <Tag style={{ marginInlineEnd: 0 }}>{d.familyRules.length} fam.</Tag>
          )}
        </Space>
        <Space size={0} onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Editar">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setFormEditing(d)
                setFormOpen(true)
              }}
            />
          </Tooltip>
          <Popconfirm
            title="¿Eliminar esta dimensión?"
            description="Esta acción se bloquea si hay SKUs con asignaciones activas."
            onConfirm={async () => {
              try {
                await del.mutateAsync(d.code)
                message.success(`Dimensión '${d.code}' eliminada`)
              } catch (e) {
                message.error((e as Error).message)
              }
            }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      </div>
    ),
  }))

  return (
    <div>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Atributos extendidos
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Catálogo de dimensiones y valores que clasifican SKUs más allá de categoría, temporada y
        vendor. Cada dimensión puede aplicarse universalmente o ser específica de ciertas familias
        (ver pestaña <strong>Reglas</strong>). La administración de familias vive en{' '}
        <a href="/products/families">Familias de producto</a>.
      </Typography.Paragraph>
      <Tabs
        activeKey={activeTopTab}
        onChange={(key) => navigate(key === 'macros' ? '/products/attributes/macros' : '/products/attributes')}
        items={[
          {
            key: 'dimensions',
            label: 'Dimensions',
            children: (
              <Row gutter={16}>
        <Col xs={24} md={8} lg={7}>
          <Card
            size="small"
            title="Dimensiones"
            extra={
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  setFormEditing(null)
                  setFormOpen(true)
                }}
              >
                Nueva
              </Button>
            }
            styles={{ body: { padding: 0 } }}
          >
            {dimensions && dimensions.length > 0 ? (
              <Menu
                mode="inline"
                selectedKeys={selected ? [selected] : []}
                items={menuItems}
                onClick={({ key }) => setSelected(String(key))}
                style={{ borderRight: 0 }}
              />
            ) : (
              <Alert
                type="info"
                message="No hay dimensiones"
                description="Cree una con el botón 'Nueva' arriba."
                style={{ margin: 12 }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} md={16} lg={17}>
          {selectedDim ? (
            <Card
              size="small"
              title={
                <Space>
                  <Typography.Text strong>{selectedDim.labelEs}</Typography.Text>
                  <Tag>{selectedDim.code}</Tag>
                  {selectedDim.familyRules.length === 0 ? (
                    <Tag color="blue">universal</Tag>
                  ) : null}
                </Space>
              }
              extra={
                selectedDim.descriptionEs ? (
                  <Typography.Text type="secondary">{selectedDim.descriptionEs}</Typography.Text>
                ) : null
              }
            >
              <Tabs
                items={[
                  { key: 'valores', label: 'Valores', children: <ValuesTab dimension={selectedDim} /> },
                  { key: 'reglas', label: 'Reglas', children: <RulesTab dimension={selectedDim} /> },
                  {
                    key: 'cobertura',
                    label: 'Cobertura',
                    children: <CoverageTab dimension={selectedDim} />,
                  },
                ]}
              />
            </Card>
          ) : (
            <Card size="small">
              <Typography.Text type="secondary">Seleccione una dimensión.</Typography.Text>
            </Card>
          )}
        </Col>
              </Row>
            ),
          },
          {
            key: 'macros',
            label: 'Macro Categories',
            children: <MacroCategoriesTab dimensions={dimensions ?? []} />,
          },
        ]}
      />
      <DimensionFormModal
        open={formOpen}
        editing={formEditing}
        onClose={() => setFormOpen(false)}
        onSaved={(code) => setSelected(code)}
      />
    </div>
  )
}
