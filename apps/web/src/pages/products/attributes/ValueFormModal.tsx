import { useEffect } from 'react'
import { App, Form, Input, InputNumber } from 'antd'
import { DraggableModal } from '../../../components/draggable-modal'
import { useCreateValue, useUpdateValue } from '../../../hooks/useProductsAttributes'
import type { AttributeDimension, AttributeDimensionValue } from '../../../types/productsAttributes'

interface Props {
  open: boolean
  dimension: AttributeDimension
  editing: AttributeDimensionValue | null
  onClose: () => void
}

interface FormValues {
  code: string
  labelEs: string
  descriptionEs: string | null
  sortOrder: number
}

export default function ValueFormModal({ open, dimension, editing, onClose }: Props) {
  const [form] = Form.useForm<FormValues>()
  const { message } = App.useApp()
  const create = useCreateValue()
  const update = useUpdateValue()
  const isEdit = editing != null

  useEffect(() => {
    if (!open) return
    if (editing) {
      form.setFieldsValue({
        code: editing.code,
        labelEs: editing.labelEs,
        descriptionEs: editing.descriptionEs,
        sortOrder: editing.sortOrder,
      })
    } else {
      form.resetFields()
      form.setFieldsValue({ code: '', labelEs: '', descriptionEs: null, sortOrder: 0 })
    }
  }, [open, editing, form])

  const handleOk = async () => {
    const vals = await form.validateFields()
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          patch: {
            labelEs: vals.labelEs,
            descriptionEs: vals.descriptionEs?.trim() || null,
            sortOrder: vals.sortOrder,
          },
        })
        message.success(`Valor '${editing.code}' actualizado`)
      } else {
        await create.mutateAsync({
          dimensionCode: dimension.code,
          input: {
            code: vals.code,
            labelEs: vals.labelEs,
            descriptionEs: vals.descriptionEs?.trim() || null,
            sortOrder: vals.sortOrder,
          },
        })
        message.success(`Valor '${vals.code}' creado`)
      }
      onClose()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <DraggableModal
      title={isEdit ? `Editar valor · ${editing!.code}` : `Nuevo valor en '${dimension.code}'`}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={create.isPending || update.isPending}
      okText="Guardar"
      cancelText="Cancelar"
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="Código"
          name="code"
          rules={[
            { required: true, message: 'Código requerido' },
            { pattern: /^[a-z0-9][a-z0-9_]*$/, message: 'Solo minúsculas, dígitos y guion bajo' },
          ]}
        >
          <Input disabled={isEdit} placeholder="p. ej. rojo, slim, zipper" />
        </Form.Item>
        <Form.Item
          label="Etiqueta (es)"
          name="labelEs"
          rules={[{ required: true, message: 'Etiqueta requerida' }]}
        >
          <Input placeholder="Nombre visible" />
        </Form.Item>
        <Form.Item
          label="DescripciÃ³n"
          name="descriptionEs"
          extra="SinÃ³nimos, notas o criterios para escoger este valor."
        >
          <Input.TextArea
            placeholder="p. ej. usar cuando el forro del tacÃ³n sea yute/espadrille"
            autoSize={{ minRows: 3, maxRows: 5 }}
            maxLength={1000}
            showCount
          />
        </Form.Item>
        <Form.Item label="Orden" name="sortOrder" initialValue={0}>
          <InputNumber min={0} step={10} style={{ width: 120 }} />
        </Form.Item>
      </Form>
    </DraggableModal>
  )
}
