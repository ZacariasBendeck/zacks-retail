import { useState } from 'react'
import { App, Form, Select, Typography } from 'antd'
import { DraggableModal } from '../../../components/draggable-modal'
import { useMergeValues } from '../../../hooks/useProductsAttributes'
import type { AttributeDimension, AttributeDimensionValue } from '../../../types/productsAttributes'

interface Props {
  open: boolean
  dimension: AttributeDimension
  source: AttributeDimensionValue | null
  onClose: () => void
}

/**
 * Merge dialog: move every SKU assignment from `source` to a chosen target
 * value, then delete `source`. Used when a value was mis-named and has live
 * assignments blocking a hard delete.
 */
export default function ValueMergeDialog({ open, dimension, source, onClose }: Props) {
  const { message } = App.useApp()
  const [targetId, setTargetId] = useState<number | null>(null)
  const merge = useMergeValues()

  const candidates = dimension.values.filter((v) => source == null || v.id !== source.id)

  const handleOk = async () => {
    if (!source || targetId == null) return
    try {
      const result = await merge.mutateAsync({ sourceId: source.id, targetId })
      const target = candidates.find((v) => v.id === targetId)
      message.success(
        `${result.moved.toLocaleString('en-US')} asignación(es) movida(s) a '${target?.code ?? targetId}'.`,
      )
      setTargetId(null)
      onClose()
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <DraggableModal
      title={source ? `Combinar valor · ${source.code}` : 'Combinar valor'}
      open={open}
      onCancel={() => {
        setTargetId(null)
        onClose()
      }}
      onOk={handleOk}
      confirmLoading={merge.isPending}
      okButtonProps={{ disabled: targetId == null, danger: true }}
      okText="Combinar y eliminar origen"
      cancelText="Cancelar"
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        Todas las asignaciones del valor <code>{source?.code}</code> se moverán al valor destino
        elegido, y el valor origen será eliminado. Esta acción no se puede deshacer.
      </Typography.Paragraph>
      <Form layout="vertical">
        <Form.Item label="Valor destino">
          <Select
            value={targetId ?? undefined}
            onChange={(v) => setTargetId(v as number)}
            placeholder="Elegir valor destino"
            showSearch
            optionFilterProp="label"
            options={candidates.map((v) => ({
              value: v.id,
              label: `${v.code} — ${v.labelEs}${v.isActive ? '' : ' (inactivo)'}`,
            }))}
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Form>
    </DraggableModal>
  )
}
