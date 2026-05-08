import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Collapse,
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
import { useLocation, useNavigate } from 'react-router-dom'
import { useProductFamilies } from '../../../hooks/useProductFamilies'
import {
  useAttributeDimensions,
  useDeleteDimension,
} from '../../../hooks/useProductsAttributes'
import type { AttributeDimension } from '../../../types/productsAttributes'
import CoverageTab from './CoverageTab'
import DimensionFormModal from './DimensionFormModal'
import MacroCategoriesTab from './MacroCategoriesTab'
import RulesTab from './RulesTab'
import ValuesTab from './ValuesTab'

type DimensionFormDefaults = {
  code?: string
  labelEs?: string
  descriptionEs?: string | null
  sortOrder?: number
  isMultiValue?: boolean
}

function sortDimensions(rows: AttributeDimension[], familyCode?: string): AttributeDimension[] {
  return [...rows].sort((a, b) => {
    const aOrder = familyCode
      ? a.familyRules.find((rule) => rule.familyCode === familyCode)?.sortOrder ?? a.sortOrder
      : a.sortOrder
    const bOrder = familyCode
      ? b.familyRules.find((rule) => rule.familyCode === familyCode)?.sortOrder ?? b.sortOrder
      : b.sortOrder
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.labelEs.localeCompare(b.labelEs)
  })
}

/**
 * Extended-attributes admin: dimensions/values/rules/coverage plus macro
 * categories. The Dimensions left rail is grouped by Universal and then by
 * Product Family.
 */
export default function CatalogPage() {
  const { message } = App.useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const { data: dimensions, isLoading: dimensionsLoading, error } = useAttributeDimensions(true)
  const { data: families, isLoading: familiesLoading } = useProductFamilies()
  const del = useDeleteDimension()
  const [selected, setSelected] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formEditing, setFormEditing] = useState<AttributeDimension | null>(null)
  const [formDefaults, setFormDefaults] = useState<DimensionFormDefaults | undefined>(undefined)

  useEffect(() => {
    if (!dimensions || dimensions.length === 0) {
      setSelected(null)
      return
    }
    if (!selected || !dimensions.some((dimension) => dimension.code === selected)) {
      const first = dimensions[0]
      if (first) setSelected(first.code)
    }
  }, [dimensions, selected])

  const selectedDim = useMemo(
    () => dimensions?.find((dimension) => dimension.code === selected) ?? null,
    [dimensions, selected],
  )
  const activeTopTab = location.pathname.endsWith('/macros') ? 'macros' : 'dimensions'

  const editDimension = (dimension: AttributeDimension) => {
    setFormEditing(dimension)
    setFormDefaults(undefined)
    setFormOpen(true)
  }

  const createDimension = (defaults?: DimensionFormDefaults) => {
    setFormEditing(null)
    setFormDefaults(defaults)
    setFormOpen(true)
  }

  const deleteDimension = async (dimension: AttributeDimension) => {
    try {
      await del.mutateAsync(dimension.code)
      message.success(`Dimension '${dimension.code}' eliminada`)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const dimensionMenuItem = (dimension: AttributeDimension, familyCode?: string) => {
    const familyRule = familyCode
      ? dimension.familyRules.find((rule) => rule.familyCode === familyCode)
      : null

    return {
      key: dimension.code,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <Space size={6} wrap>
            <span>{dimension.labelEs}</span>
            {familyCode == null ? (
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                universal
              </Tag>
            ) : (
              <>
                {familyRule?.enabled === false ? <Tag color="default">disabled</Tag> : null}
                {familyRule?.isRequired ? <Tag color="red">required</Tag> : null}
              </>
            )}
          </Space>
          <Space size={0} onClick={(event) => event.stopPropagation()}>
            <Tooltip title="Editar">
              <Button
                type="text"
                size="small"
                aria-label={`Editar dimensión ${dimension.labelEs}`}
                icon={<EditOutlined />}
                onClick={() => editDimension(dimension)}
              />
            </Tooltip>
            <Popconfirm
              title="Eliminar esta dimension?"
              description="Esta accion se bloquea si hay SKUs con asignaciones activas."
              onConfirm={() => void deleteDimension(dimension)}
            >
              <Button
                type="text"
                size="small"
                danger
                aria-label={`Eliminar dimensión ${dimension.labelEs}`}
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          </Space>
        </div>
      ),
    }
  }

  const universalDimensions = sortDimensions(
    (dimensions ?? []).filter((dimension) => dimension.familyRules.length === 0),
  )

  const orderedFamilies = [...(families ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.labelEs.localeCompare(b.labelEs),
  )

  const collapseItems = [
    {
      key: 'universal',
      label: (
        <Space>
          <Typography.Text strong>Universal</Typography.Text>
          <Tag color="blue">{universalDimensions.length}</Tag>
        </Space>
      ),
      children: universalDimensions.length > 0 ? (
        <Menu
          mode="inline"
          selectedKeys={selected ? [selected] : []}
          items={universalDimensions.map((dimension) => dimensionMenuItem(dimension))}
          onClick={({ key }) => setSelected(String(key))}
          style={{ borderRight: 0 }}
        />
      ) : (
        <Typography.Text type="secondary" style={{ display: 'block', padding: 12 }}>
          No universal dimensions.
        </Typography.Text>
      ),
    },
    ...orderedFamilies.map((family) => {
      const familyDimensions = sortDimensions(
        (dimensions ?? []).filter((dimension) =>
          dimension.familyRules.some((rule) => rule.familyCode === family.code),
        ),
        family.code,
      )
      return {
        key: family.code,
        label: (
          <Space>
            <Typography.Text>{family.labelEs}</Typography.Text>
            <Tag>{family.code}</Tag>
            <Typography.Text type="secondary">{familyDimensions.length}</Typography.Text>
          </Space>
        ),
        children: familyDimensions.length > 0 ? (
          <Menu
            mode="inline"
            selectedKeys={selected ? [selected] : []}
            items={familyDimensions.map((dimension) => dimensionMenuItem(dimension, family.code))}
            onClick={({ key }) => setSelected(String(key))}
            style={{ borderRight: 0 }}
          />
        ) : (
          <Typography.Text type="secondary" style={{ display: 'block', padding: 12 }}>
            No dimensions for this family.
          </Typography.Text>
        ),
      }
    }),
  ]

  if (dimensionsLoading || familiesLoading) {
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
        message="Error al cargar el catalogo de atributos"
        description={(error as Error).message}
      />
    )
  }

  return (
    <div>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Atributos extendidos
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Catalogo de dimensiones y valores que clasifican SKUs mas alla de categoria, temporada y
        vendor. Cada dimension puede aplicarse universalmente o ser especifica de ciertas familias
        (ver pestana <strong>Reglas</strong>). La administracion de familias vive en{' '}
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
                        onClick={() => createDimension()}
                      >
                        Nueva
                      </Button>
                    }
                    styles={{ body: { padding: 0 } }}
                  >
                    {dimensions && dimensions.length > 0 ? (
                      <Collapse
                        ghost
                        defaultActiveKey={['universal']}
                        items={collapseItems}
                      />
                    ) : (
                      <Alert
                        type="info"
                        message="No hay dimensiones"
                        description="Cree una con el boton 'Nueva' arriba."
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
                          {selectedDim.familyRules.length === 0 ? <Tag color="blue">universal</Tag> : null}
                        </Space>
                      }
                      extra={
                        <Space wrap style={{ justifyContent: 'flex-end' }}>
                          {selectedDim.descriptionEs ? (
                            <Typography.Text type="secondary">{selectedDim.descriptionEs}</Typography.Text>
                          ) : null}
                          <Button
                            size="small"
                            icon={<EditOutlined />}
                            aria-label={`Editar dimensión seleccionada ${selectedDim.labelEs}`}
                            onClick={() => editDimension(selectedDim)}
                          >
                            Editar dimensión
                          </Button>
                        </Space>
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
                      <Typography.Text type="secondary">Seleccione una dimension.</Typography.Text>
                    </Card>
                  )}
                </Col>
              </Row>
            ),
          },
          {
            key: 'macros',
            label: 'Macro Categories',
            children: (
              <MacroCategoriesTab
                dimensions={dimensions ?? []}
                onCreateMacroCategory={() =>
                  createDimension({
                    code: '',
                    labelEs: '',
                    descriptionEs: 'Categoria macro derivada de otro atributo',
                    sortOrder: 620,
                    isMultiValue: false,
                  })
                }
              />
            ),
          },
        ]}
      />

      <DimensionFormModal
        open={formOpen}
        editing={formEditing}
        defaults={formDefaults}
        onClose={() => setFormOpen(false)}
        onSaved={(code) => setSelected(code)}
      />
    </div>
  )
}
