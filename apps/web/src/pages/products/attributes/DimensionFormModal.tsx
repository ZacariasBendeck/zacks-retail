import { useEffect } from 'react'
import { App, Form, Input, InputNumber, Switch } from 'antd'
import { DraggableModal } from '../../../components/draggable-modal'
import { useCreateDimension, useUpdateDimension } from '../../../hooks/useProductsAttributes'
import type { AttributeDimension } from '../../../types/productsAttributes'

interface Props {
  open: boolean
  editing: AttributeDimension | null
  onClose: () => void
  onSaved?: (code: string) => void
}

interface FormValues {
  code: string
  labelEs: string
  descriptionEs: string | null
  sortOrder: number
  isMultiValue: boolean
}

export default function DimensionFormModal({ open, editing, onClose, onSaved }: Props) {
  const [form] = Form.useForm<FormValues>()
  const { message } = App.useApp()
  const create = useCreateDimension()
  const update = useUpdateDimension()
  const isEdit = editing != null

  useEffect(() => {
    if (!open) return
    if (editing) {
      form.setFieldsValue({
        code: editing.code,
        labelEs: editing.labelEs,
        descriptionEs: editing.descriptionEs ?? '',
        sortOrder: editing.sortOrder,
        isMultiValue: editing.isMultiValue,
      })
    } else {
      form.resetFields()
      form.setFieldsValue({
        code: '',
        labelEs: '',
        descriptionEs: '',
        sortOrder: 0,
        isMultiValue: false,
      })
    }
  }, [open, editing, form])

  const handleOk = async () => {
    const vals = await form.validateFields()
    const descriptionEs =
      typeof vals.descriptionEs === 'string' && vals.descriptionEs.trim().length > 0
        ? vals.descriptionEs.trim()
        : null
    try {
      if (editing) {
        await update.mutateAsync({
          code: editing.code,
          patch: {
            labelEs: vals.labelEs,
            descriptionEs,
            sortOrder: vals.sortOrder,
            isMultiValue: vals.isMultiValue,
          },
        })
        message.success(`Dimensión '${editing.code}' actualizada`)
        onSaved?.(editing.code)
      } else {
        await create.mutateAsync({
          code: vals.code,
          labelEs: vals.labelEs,
          descriptionEs,
          sortOrder: vals.sortOrder,
          isMultiValue: vals.isMultiValue,
        })
        message.success(`Dimensión '${vals.code}' creada`)
        onSaved?.(vals.code)
      }
      onClose()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <DraggableModal
      title={isEdit ? `Editar dimensión · ${editing!.code}` : 'Nueva dimensión'}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={create.isPending || update.isPending}
      okText="Guardar"
      cancelText="Cancelar"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="Código"
          name="code"
          rules={[
            { required: true, message: 'Código requerido' },
            { pattern: /^[a-z][a-z0-9_]*$/, message: 'Solo minúsculas, dígitos y guion bajo' },
          ]}
        >
          <Input disabled={isEdit} placeholder="p. ej. color, fit, closure_type" />
        </Form.Item>
        <Form.Item
          label="Etiqueta (es)"
          name="labelEs"
          rules={[{ required: true, message: 'Etiqueta requerida' }]}
        >
          <Input placeholder="Nombre visible" />
        </Form.Item>
        <Form.Item label="Descripción (es)" name="descriptionEs">
          <Input.TextArea rows={2} placeholder="Contexto para el operador (opcional)" />
        </Form.Item>
        <Form.Item label="Orden" name="sortOrder" initialValue={0}>
          <InputNumber min={0} step={10} style={{ width: 120 }} />
        </Form.Item>
        <Form.Item
          label="Multi-valor"
          name="isMultiValue"
          valuePropName="checked"
          tooltip="Si está activado, un SKU puede tener varios valores simultáneos en esta dimensión."
        >
          <Switch />
        </Form.Item>
      </Form>
    </DraggableModal>
  )
}
