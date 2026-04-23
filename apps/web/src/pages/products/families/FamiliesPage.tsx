import { useEffect, useMemo, useState } from 'react'
import { Alert, Card, Col, Menu, Row, Space, Spin, Tabs, Tag, Typography } from 'antd'
import { useProductFamilies, useFamilyCategories } from '../../../hooks/useProductFamilies'
import FamilyCategoriesTab from './FamilyCategoriesTab'
import FamilyAttributesTab from './FamilyAttributesTab'
import FamilyMetadataTab from './FamilyMetadataTab'

/**
 * Product Families admin — layer 3 of the mini-PIM (family → categories,
 * family → attribute rules, family metadata). Pairs with /products/attributes
 * which owns layers 1 + 2.
 */
export default function FamiliesPage() {
  const { data: families, isLoading, error } = useProductFamilies()
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!families || families.length === 0) {
      setSelected(null)
      return
    }
    if (!selected || !families.some((f) => f.code === selected)) {
      const first = families[0]
      if (first) setSelected(first.code)
    }
  }, [families, selected])

  const selectedFamily = useMemo(
    () => families?.find((f) => f.code === selected) ?? null,
    [families, selected],
  )

  const { data: categories } = useFamilyCategories(selected)

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
        message="Error al cargar las familias"
        description={(error as Error).message}
      />
    )
  }

  const menuItems = (families ?? []).map((f) => ({
    key: f.code,
    label: (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>{f.labelEs}</span>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {f.code}
        </Typography.Text>
      </div>
    ),
  }))

  return (
    <div>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Familias de producto
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Las 11 familias agrupan categorías RICS y gobiernan qué dimensiones de atributo se aplican
        a cada SKU. El catálogo de dimensiones y sus valores se administra en{' '}
        <a href="/products/attributes">Atributos extendidos</a>.
      </Typography.Paragraph>
      <Row gutter={16}>
        <Col xs={24} md={7}>
          <Card size="small" title="Familias" styles={{ body: { padding: 0 } }}>
            <Menu
              mode="inline"
              selectedKeys={selected ? [selected] : []}
              items={menuItems}
              onClick={({ key }) => setSelected(String(key))}
              style={{ borderRight: 0 }}
            />
          </Card>
        </Col>
        <Col xs={24} md={17}>
          {selectedFamily ? (
            <Card
              size="small"
              title={
                <Space>
                  <Typography.Text strong>{selectedFamily.labelEs}</Typography.Text>
                  <Tag>{selectedFamily.code}</Tag>
                  <Typography.Text type="secondary">
                    {categories?.length ?? 0} categoría{categories?.length === 1 ? '' : 's'}
                  </Typography.Text>
                </Space>
              }
              extra={
                selectedFamily.descriptionEs ? (
                  <Typography.Text type="secondary">{selectedFamily.descriptionEs}</Typography.Text>
                ) : null
              }
            >
              <Tabs
                items={[
                  {
                    key: 'categorias',
                    label: 'Categorías',
                    children: <FamilyCategoriesTab family={selectedFamily} />,
                  },
                  {
                    key: 'atributos',
                    label: 'Atributos',
                    children: <FamilyAttributesTab family={selectedFamily} />,
                  },
                  {
                    key: 'metadatos',
                    label: 'Metadatos',
                    children: <FamilyMetadataTab family={selectedFamily} />,
                  },
                ]}
              />
            </Card>
          ) : (
            <Card size="small">
              <Typography.Text type="secondary">Seleccione una familia.</Typography.Text>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  )
}
