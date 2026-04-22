import { useEffect, useMemo, useState } from 'react'
import { Alert, App, Button, Col, Popconfirm, Row, Select, Space, Spin, Tag, Typography } from 'antd'
import {
  useAttributeDimensions,
  useSetSkuAttributes,
  useSkuAttributes,
} from '../../../hooks/useProductsAttributes'
import type { AttributeDimension } from '../../../types/productsAttributes'

const DISCOUNT_GROUP_LABELS: Record<string, string> = {
  pct: '% Descuento',
  bogo: 'BOGO',
  multi: 'Multi',
  fixed: 'Precio Fijo',
}

function mechanicPrefix(code: string): string {
  const idx = code.indexOf('_')
  return idx > 0 ? code.slice(0, idx) : code
}

/**
 * Discount-type select options grouped by mechanic prefix. The UI group labels
 * are derived client-side from `value.code`; the backend doesn't need to know.
 */
function discountTypeOptions(dim: AttributeDimension) {
  const byPrefix = new Map<string, { label: string; options: { value: string; label: string }[] }>()
  for (const v of dim.values) {
    const p = mechanicPrefix(v.code)
    const group =
      byPrefix.get(p) ?? { label: DISCOUNT_GROUP_LABELS[p] ?? p, options: [] }
    group.options.push({ value: v.code, label: v.labelEs })
    byPrefix.set(p, group)
  }
  return Array.from(byPrefix.values()).map((g) => ({
    ...g,
    options: g.options.sort((a, b) => a.value.localeCompare(b.value)),
  }))
}

interface Props {
  skuCode: string
}

export default function SkuAttributesTab({ skuCode }: Props) {
  const { message } = App.useApp()
  const { data: dimensions, isLoading: dimsLoading } = useAttributeDimensions()
  const { data: skuAttrs, isLoading: attrsLoading, error } = useSkuAttributes(skuCode)
  const setMutation = useSetSkuAttributes()

  // Local edit state — Map<dimensionCode, selected value_codes>.
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [dirty, setDirty] = useState(false)

  // Seed local state from server when it arrives.
  useEffect(() => {
    if (skuAttrs) {
      const seed: Record<string, string[]> = {}
      for (const [dim, entry] of Object.entries(skuAttrs.byDimension)) {
        seed[dim] = entry.values.map((v) => v.code)
      }
      setSelections(seed)
      setDirty(false)
    }
  }, [skuAttrs])

  const sourceByDim = useMemo(() => {
    const out: Record<string, { code: string; source: string | null; assignedAt: string }[]> = {}
    if (skuAttrs) {
      for (const [dim, entry] of Object.entries(skuAttrs.byDimension)) {
        out[dim] = entry.values.map((v) => ({
          code: v.code,
          source: v.assignedBy,
          assignedAt: v.assignedAt,
        }))
      }
    }
    return out
  }, [skuAttrs])

  if (dimsLoading || attrsLoading) {
    return <Spin />
  }
  if (error) {
    return <Alert type="error" message={(error as Error).message} />
  }
  if (!dimensions || dimensions.length === 0) {
    return <Alert type="info" message="No hay dimensiones configuradas." />
  }

  const handleChange = (dimCode: string, next: string[], isMulti: boolean) => {
    setSelections((prev) => ({ ...prev, [dimCode]: isMulti ? next : next.slice(0, 1) }))
    setDirty(true)
  }

  const handleSave = async () => {
    const assignments: { dimension_code: string; value_code: string }[] = []
    for (const [dim, codes] of Object.entries(selections)) {
      for (const c of codes) {
        assignments.push({ dimension_code: dim, value_code: c })
      }
    }
    try {
      await setMutation.mutateAsync({ code: skuCode, input: { assignments } })
      message.success('Atributos guardados')
      setDirty(false)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const handleReset = async () => {
    try {
      // Empty assignments = clear operator + excel rows; keyword-derived rebuilds.
      await setMutation.mutateAsync({ code: skuCode, input: { assignments: [] } })
      message.success('Clasificación restaurada a la derivada por keywords.')
      setDirty(false)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const sourceBadge = (assignedBy: string | null) => {
    if (!assignedBy) return <Tag>manual</Tag>
    if (assignedBy.startsWith('seed:keyword:')) return <Tag color="blue">keyword</Tag>
    if (assignedBy.startsWith('seed:excel:')) return <Tag color="gold">excel</Tag>
    return <Tag color="green">{assignedBy}</Tag>
  }

  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        Clasificaciones más allá de vendor/categoría/temporada. Guardar sobrescribe
        la clasificación manual; los valores derivados de keywords se restauran
        al pulsar <strong>Restaurar</strong>.
      </Typography.Paragraph>

      {dimensions.map((dim) => {
        const selected = selections[dim.code] ?? []
        const options =
          dim.code === 'discount_type'
            ? discountTypeOptions(dim)
            : dim.values
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((v) => ({ value: v.code, label: v.labelEs }))
        const sources = sourceByDim[dim.code] ?? []

        return (
          <Row key={dim.code} gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} md={10}>
              <Typography.Text strong>{dim.labelEs}</Typography.Text>
              {dim.isMultiValue ? null : (
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  (un solo valor)
                </Typography.Text>
              )}
            </Col>
            <Col xs={24} md={14}>
              <Select
                mode={dim.isMultiValue ? 'multiple' : undefined}
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Sin clasificar"
                style={{ width: '100%' }}
                value={dim.isMultiValue ? selected : selected[0]}
                options={options as any}
                onChange={(val) => {
                  const next = dim.isMultiValue
                    ? (val as string[])
                    : val
                      ? [val as string]
                      : []
                  handleChange(dim.code, next, dim.isMultiValue)
                }}
              />
              {sources.length > 0 ? (
                <Space size={[6, 4]} wrap style={{ marginTop: 6 }}>
                  {sources.map((s) => (
                    <Typography.Text key={s.code} type="secondary" style={{ fontSize: 12 }}>
                      {s.code} {sourceBadge(s.source)}
                    </Typography.Text>
                  ))}
                </Space>
              ) : null}
            </Col>
          </Row>
        )
      })}

      <Space style={{ marginTop: 16 }}>
        <Button
          type="primary"
          onClick={handleSave}
          disabled={!dirty}
          loading={setMutation.isPending && dirty}
        >
          Guardar atributos
        </Button>
        <Popconfirm
          title="¿Restaurar a la clasificación derivada por keywords?"
          description="Se eliminarán los overrides manuales de este SKU."
          onConfirm={handleReset}
          okText="Restaurar"
          cancelText="Cancelar"
        >
          <Button>Restaurar a keyword</Button>
        </Popconfirm>
      </Space>
    </div>
  )
}
