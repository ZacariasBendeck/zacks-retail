import { useEffect } from 'react'
import { App, Button, Card, Form, Input, InputNumber, Space, Tooltip, Typography } from 'antd'
import type { ProductFamily } from '../../../types/sku'
import { useUpdateFamilyMetadata } from '../../../hooks/useProductFamilies'

interface Props {
  family: ProductFamily
}

interface FormValues {
  labelEs: string
  descriptionEs: string
  sortOrder: number
}

/**
 * Edit labelEs / descriptionEs / sortOrder on a ProductFamily. Create /
 * delete actions are surfaced but disabled — the 11 families are a fixed
 * taxonomy today (see the plan's "Not created deliberately" section).
 */
export default function FamilyMetadataTab({ family }: Props) {
  const [form] = Form.useForm<FormValues>()
  const { message } = App.useApp()
  const updateMutation = useUpdateFamilyMetadata()

  useEffect(() => {
    form.setFieldsValue({
      labelEs: family.labelEs,
      descriptionEs: family.descriptionEs ?? '',
      sortOrder: family.sortOrder,
    })
  }, [family, form])

  const onFinish = async (values: FormValues) => {
    const descriptionEs = values.descriptionEs?.trim() ?? ''
    try {
      await updateMutation.mutateAsync({
        code: family.code,
        patch: {
          labelEs: values.labelEs,
          descriptionEs: descriptionEs.length > 0 ? descriptionEs : null,
          sortOrder: values.sortOrder,
        },
      })
      message.success('Familia actualizada')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card size="small" title="Metadatos">
        <Form<FormValues> form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item label="Código" tooltip="Identificador interno, no se puede cambiar.">
            <Input value={family.code} disabled />
          </Form.Item>
          <Form.Item
            label="Etiqueta (es)"
            name="labelEs"
            rules={[{ required: true, message: 'Etiqueta requerida' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="Descripción (es)" name="descriptionEs">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="Orden" name="sortOrder">
            <InputNumber min={0} step={10} style={{ width: 120 }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={updateMutation.isPending}>
            Guardar
          </Button>
        </Form>
      </Card>

      <Card size="small" title="Acciones avanzadas">
        <Space>
          <Tooltip title="Las 11 familias están fijas — contactar al admin para agregar/eliminar.">
            <Button disabled>Nueva familia…</Button>
          </Tooltip>
          <Tooltip title="Las 11 familias están fijas — contactar al admin para agregar/eliminar.">
            <Button disabled danger>
              Eliminar familia
            </Button>
          </Tooltip>
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          El set de familias se mantiene estable para proteger las reglas y la clasificación
          existente. Una migración futura puede abrir esta acción.
        </Typography.Paragraph>
      </Card>
    </Space>
  )
}
