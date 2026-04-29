import { PlusOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Menu,
  Modal,
  Row,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import {
  useCreateProductFamily,
  useFamilyCategories,
  useProductFamilies,
} from '../../../hooks/useProductFamilies'
import type { FamilyCreateInput } from '../../../services/productFamiliesApi'
import FamilyAttributesTab from './FamilyAttributesTab'
import FamilyCategoriesTab from './FamilyCategoriesTab'
import FamilyMetadataTab from './FamilyMetadataTab'

/**
 * Product Families admin: family -> categories, family -> attribute rules,
 * and family metadata.
 */
export default function FamiliesPage() {
  const { message } = App.useApp()
  const { data: families, isLoading, error } = useProductFamilies()
  const [selected, setSelected] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm] = Form.useForm<FamilyCreateInput>()
  const createFamily = useCreateProductFamily()

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
  const nextSortOrder = useMemo(() => {
    const max = Math.max(0, ...(families ?? []).map((family) => family.sortOrder))
    return max + 10
  }, [families])

  const { data: categories } = useFamilyCategories(selected)

  const openCreate = () => {
    createForm.setFieldsValue({
      code: '',
      labelEs: '',
      descriptionEs: '',
      sortOrder: nextSortOrder,
    })
    setCreateOpen(true)
  }

  const submitCreate = async () => {
    const values = await createForm.validateFields()
    const descriptionEs = values.descriptionEs?.trim() ?? ''
    try {
      const created = await createFamily.mutateAsync({
        code: values.code.trim().toLowerCase(),
        labelEs: values.labelEs.trim(),
        descriptionEs: descriptionEs.length > 0 ? descriptionEs : null,
        sortOrder: values.sortOrder ?? nextSortOrder,
      })
      setSelected(created.code)
      setCreateOpen(false)
      message.success('Familia creada')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

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
        Las familias agrupan categorias RICS y gobiernan que dimensiones de atributo se aplican
        a cada SKU. El catalogo de dimensiones y sus valores se administra en{' '}
        <a href="/products/attributes">Atributos extendidos</a>.
      </Typography.Paragraph>
      <Row gutter={16}>
        <Col xs={24} md={7}>
          <Card
            size="small"
            title="Familias"
            extra={
              <Button size="small" icon={<PlusOutlined />} onClick={openCreate}>
                Nueva
              </Button>
            }
            styles={{ body: { padding: 0 } }}
          >
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
                    {categories?.length ?? 0} categoria{categories?.length === 1 ? '' : 's'}
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
                    label: 'Categorias',
                    children: <FamilyCategoriesTab family={selectedFamily} />,
                  },
                  {
                    key: 'atributos',
                    label: 'Dimensions',
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

      <Modal
        open={createOpen}
        title="Nueva familia de producto"
        onCancel={() => setCreateOpen(false)}
        onOk={() => void submitCreate()}
        okText="Crear"
        confirmLoading={createFamily.isPending}
        destroyOnHidden
      >
        <Form<FamilyCreateInput> form={createForm} layout="vertical">
          <Form.Item
            name="code"
            label="Codigo"
            extra="Identificador interno estable. Use letras minusculas, numeros, guion o guion bajo."
            rules={[
              { required: true, message: 'Codigo requerido' },
              {
                pattern: /^[a-z0-9_-]{2,64}$/,
                message: 'Use 2-64 caracteres: a-z, 0-9, _ o -',
              },
            ]}
          >
            <Input placeholder="ej. ropa_formal" />
          </Form.Item>
          <Form.Item
            name="labelEs"
            label="Etiqueta"
            rules={[{ required: true, message: 'Etiqueta requerida' }]}
          >
            <Input placeholder="Ej. Ropa formal" />
          </Form.Item>
          <Form.Item name="descriptionEs" label="Descripcion">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="sortOrder" label="Orden">
            <InputNumber min={0} max={32767} step={10} style={{ width: 140 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
