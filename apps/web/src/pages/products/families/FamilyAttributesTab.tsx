import { useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useAttributeDimensions } from '../../../hooks/useProductsAttributes'
import {
  useFamilyAttributeRules,
  useRemoveFamilyAttributeRule,
  useToggleFamilyAttributeRule,
} from '../../../hooks/useProductFamilies'
import type { ProductFamily } from '../../../types/sku'
import type { FamilyAttributeRuleRow } from '../../../types/productsAttributes'

interface Props {
  family: ProductFamily
}

/**
 * Atributos tab — per-family rule editor. Two sections:
 *
 * 1. **Reglas de esta familia** — dimensions with a rule row for this family.
 *    Each row has enabled + isRequired + sortOrder editors plus a Remove.
 *    Adding a new one opens a picker of dimensions not yet ruled for this
 *    family.
 *
 * 2. **Universales** — dimensions with ZERO rule rows. Read-only here; they
 *    apply to every family including this one. Edit them in
 *    /products/attributes → Reglas → flip "Universal" off.
 */
export default function FamilyAttributesTab({ family }: Props) {
  const { message } = App.useApp()
  const { data: dimensions } = useAttributeDimensions()
  const { data: rules } = useFamilyAttributeRules(family.code)
  const toggle = useToggleFamilyAttributeRule()
  const remove = useRemoveFamilyAttributeRule()
  const [pickerDim, setPickerDim] = useState<string | null>(null)

  const ruledDimensionCodes = useMemo(
    () => new Set((rules ?? []).map((r) => r.dimensionCode)),
    [rules],
  )

  const universalDims = useMemo(
    () => (dimensions ?? []).filter((d) => d.familyRules.length === 0),
    [dimensions],
  )

  // Candidates = dims that aren't universal and aren't already ruled for this family.
  const addableDims = useMemo(() => {
    return (dimensions ?? []).filter((d) => {
      if (ruledDimensionCodes.has(d.code)) return false
      if (d.familyRules.length === 0) return false // universal — lives in the other section
      return true
    })
  }, [dimensions, ruledDimensionCodes])

  const ruleColumns = [
    { title: 'Dimensión', dataIndex: 'labelEs', key: 'labelEs', width: 220 },
    {
      title: 'Código',
      dataIndex: 'dimensionCode',
      key: 'dimensionCode',
      width: 160,
      render: (c: string) => <Tag>{c}</Tag>,
    },
    {
      title: 'Habilitada',
      key: 'enabled',
      width: 110,
      align: 'center' as const,
      render: (_: unknown, r: FamilyAttributeRuleRow) => (
        <Switch
          size="small"
          checked={r.enabled}
          loading={toggle.isPending}
          onChange={async (checked) => {
            try {
              await toggle.mutateAsync({
                familyCode: family.code,
                dimensionCode: r.dimensionCode,
                patch: { enabled: checked, ...(checked ? {} : { isRequired: false }) },
              })
            } catch (e) {
              message.error((e as Error).message)
            }
          }}
        />
      ),
    },
    {
      title: 'Requerida',
      key: 'isRequired',
      width: 110,
      align: 'center' as const,
      render: (_: unknown, r: FamilyAttributeRuleRow) => (
        <Switch
          size="small"
          checked={r.isRequired}
          disabled={!r.enabled}
          loading={toggle.isPending}
          onChange={async (checked) => {
            try {
              await toggle.mutateAsync({
                familyCode: family.code,
                dimensionCode: r.dimensionCode,
                patch: { isRequired: checked },
              })
            } catch (e) {
              message.error((e as Error).message)
            }
          }}
        />
      ),
    },
    {
      title: 'Orden',
      key: 'sortOrder',
      width: 100,
      render: (_: unknown, r: FamilyAttributeRuleRow) => (
        <InputNumber
          size="small"
          min={0}
          step={10}
          defaultValue={r.sortOrder}
          onBlur={async (e) => {
            const n = Number((e.target as HTMLInputElement).value)
            if (!Number.isFinite(n) || n === r.sortOrder) return
            try {
              await toggle.mutateAsync({
                familyCode: family.code,
                dimensionCode: r.dimensionCode,
                patch: { sortOrder: n },
              })
            } catch (err) {
              message.error((err as Error).message)
            }
          }}
          style={{ width: 80 }}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, r: FamilyAttributeRuleRow) => (
        <Popconfirm
          title="¿Quitar la regla?"
          description="La dimensión seguirá existiendo, pero ya no se aplicará a esta familia."
          onConfirm={async () => {
            try {
              await remove.mutateAsync({
                familyCode: family.code,
                dimensionCode: r.dimensionCode,
              })
              message.success(`'${r.dimensionCode}' removido de '${family.code}'`)
            } catch (e) {
              message.error((e as Error).message)
            }
          }}
        >
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  const handleAddDim = async () => {
    if (!pickerDim) return
    try {
      await toggle.mutateAsync({
        familyCode: family.code,
        dimensionCode: pickerDim,
        patch: { enabled: true, isRequired: false, sortOrder: 0 },
      })
      message.success(`'${pickerDim}' agregado a '${family.code}'`)
      setPickerDim(null)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        size="small"
        title="Reglas específicas de esta familia"
        extra={
          <Space>
            <Select
              size="small"
              placeholder="Agregar dimensión…"
              value={pickerDim ?? undefined}
              onChange={(v) => setPickerDim(v as string)}
              style={{ minWidth: 200 }}
              options={addableDims.map((d) => ({ value: d.code, label: `${d.code} — ${d.labelEs}` }))}
              showSearch
              optionFilterProp="label"
              allowClear
            />
            <Tooltip
              title={
                addableDims.length === 0
                  ? 'Todas las dimensiones no universales ya tienen regla para esta familia.'
                  : ''
              }
            >
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                disabled={!pickerDim}
                loading={toggle.isPending}
                onClick={handleAddDim}
              >
                Agregar
              </Button>
            </Tooltip>
          </Space>
        }
      >
        {rules && rules.length > 0 ? (
          <Table<FamilyAttributeRuleRow>
            size="small"
            rowKey="dimensionCode"
            columns={ruleColumns}
            dataSource={rules}
            pagination={false}
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message="Sin reglas específicas"
            description="Agregue una dimensión arriba para habilitarla sólo para esta familia."
          />
        )}
      </Card>

      <Card size="small" title="Universales (se aplican a todas las familias)">
        {universalDims.length > 0 ? (
          <Table
            size="small"
            rowKey="code"
            columns={[
              { title: 'Dimensión', dataIndex: 'labelEs', key: 'labelEs', width: 220 },
              { title: 'Código', dataIndex: 'code', key: 'code', width: 160 },
              { title: 'Multi-valor', key: 'mv', width: 110, render: (_: unknown, r: any) => (r.isMultiValue ? 'Sí' : 'No') },
            ]}
            dataSource={universalDims}
            pagination={false}
          />
        ) : (
          <Typography.Text type="secondary">No hay dimensiones universales.</Typography.Text>
        )}
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          Para quitar una dimensión de la lista universal y hacerla específica por familia, vaya a{' '}
          <a href="/products/attributes">Atributos extendidos</a> → pestaña <strong>Reglas</strong>.
        </Typography.Paragraph>
      </Card>
    </Space>
  )
}
