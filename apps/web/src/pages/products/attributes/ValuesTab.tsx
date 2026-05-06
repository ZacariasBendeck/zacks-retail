import { useState } from 'react'
import {
  App,
  Button,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  MergeCellsOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'
import {
  useDeleteValue,
  useUpdateValue,
} from '../../../hooks/useProductsAttributes'
import type { AttributeDimension, AttributeDimensionValue } from '../../../types/productsAttributes'
import ValueFormModal from './ValueFormModal'
import ValueMergeDialog from './ValueMergeDialog'

interface Props {
  dimension: AttributeDimension
}

function fmtInt(n: number | undefined): string {
  return (n ?? 0).toLocaleString('en-US')
}

export default function ValuesTab({ dimension }: Props) {
  const { message } = App.useApp()
  const del = useDeleteValue()
  const updateValue = useUpdateValue()
  const [formOpen, setFormOpen] = useState(false)
  const [formEditing, setFormEditing] = useState<AttributeDimensionValue | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeSource, setMergeSource] = useState<AttributeDimensionValue | null>(null)

  const columns = [
    {
      title: 'Código',
      dataIndex: 'code',
      key: 'code',
      width: 160,
      render: (c: string, r: AttributeDimensionValue) => (
        <Space size={4}>
          <Tag>{c}</Tag>
          {!r.isActive ? <Tag color="default">inactivo</Tag> : null}
        </Space>
      ),
    },
    { title: 'Etiqueta', dataIndex: 'labelEs', key: 'labelEs' },
    {
      title: 'Descripcion',
      dataIndex: 'descriptionEs',
      key: 'descriptionEs',
      ellipsis: true,
      render: (value: string | null) =>
        value ? (
          <Tooltip title={value}>
            <Typography.Text>{value}</Typography.Text>
          </Tooltip>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        ),
    },
    { title: 'Orden', dataIndex: 'sortOrder', key: 'sortOrder', width: 80, align: 'right' as const },
    {
      title: 'Activo',
      key: 'isActive',
      width: 80,
      align: 'center' as const,
      render: (_: unknown, r: AttributeDimensionValue) => (
        <Switch
          size="small"
          checked={r.isActive}
          loading={updateValue.isPending}
          onChange={async (checked) => {
            try {
              await updateValue.mutateAsync({ id: r.id, patch: { isActive: checked } })
              message.success(checked ? `'${r.code}' reactivado` : `'${r.code}' desactivado`)
            } catch (e) {
              message.error((e as Error).message)
            }
          }}
        />
      ),
    },
    {
      title: 'Usado en',
      key: 'skuCount',
      width: 150,
      align: 'right' as const,
      render: (_: unknown, r: AttributeDimensionValue) => {
        if (r.skuCount == null) {
          return <Typography.Text type="secondary">—</Typography.Text>
        }
        if (r.skuCount === 0) {
          return <Typography.Text type="secondary">0</Typography.Text>
        }
        const qs = `attr.${dimension.code}=${encodeURIComponent(r.code)}&run=1`
        return (
          <Link to={`/products/skus?${qs}`}>
            {fmtInt(r.skuCount)} SKU{r.skuCount === 1 ? '' : 's'}
          </Link>
        )
      },
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      render: (_: unknown, r: AttributeDimensionValue) => (
        <Space size={0}>
          <Tooltip title="Editar">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setFormEditing(r)
                setFormOpen(true)
              }}
            />
          </Tooltip>
          <Tooltip title="Combinar en otro valor">
            <Button
              type="text"
              size="small"
              icon={<MergeCellsOutlined />}
              onClick={() => {
                setMergeSource(r)
                setMergeOpen(true)
              }}
            />
          </Tooltip>
          <Popconfirm
            title="¿Eliminar este valor?"
            description={
              r.skuCount && r.skuCount > 0
                ? `${fmtInt(r.skuCount)} SKU(s) lo están usando — se bloqueará. Use Combinar o Desactivar en su lugar.`
                : 'Esta acción no se puede deshacer.'
            }
            onConfirm={async () => {
              try {
                await del.mutateAsync(r.id)
                message.success('Eliminado')
              } catch (e) {
                message.error((e as Error).message)
              }
            }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setFormEditing(null)
            setFormOpen(true)
          }}
        >
          Agregar valor
        </Button>
        <Typography.Text type="secondary">
          {dimension.isMultiValue ? 'Dimensión multi-valor.' : 'Dimensión de un solo valor por SKU.'}
        </Typography.Text>
      </Space>
      <Table
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={dimension.values}
        pagination={false}
      />
      <ValueFormModal
        open={formOpen}
        dimension={dimension}
        editing={formEditing}
        onClose={() => setFormOpen(false)}
      />
      <ValueMergeDialog
        open={mergeOpen}
        dimension={dimension}
        source={mergeSource}
        onClose={() => setMergeOpen(false)}
      />
    </div>
  )
}
