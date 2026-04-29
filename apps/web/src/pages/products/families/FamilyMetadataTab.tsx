import { useEffect } from 'react'
import { App, Button, Card, Form, Input, InputNumber, Space } from 'antd'
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

/** Edit labelEs / descriptionEs / sortOrder on a ProductFamily. */
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
          <Form.Item label="Codigo" tooltip="Identificador interno. No se cambia porque lo usan categorias, SKUs y reglas.">
            <Input value={family.code} disabled />
          </Form.Item>
          <Form.Item
            label="Etiqueta"
            name="labelEs"
            rules={[{ required: true, message: 'Etiqueta requerida' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="Descripcion" name="descriptionEs">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="Orden" name="sortOrder">
            <InputNumber min={0} max={32767} step={10} style={{ width: 120 }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={updateMutation.isPending}>
            Guardar
          </Button>
        </Form>
      </Card>
    </Space>
  )
}
