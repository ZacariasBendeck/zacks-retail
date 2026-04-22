import { useMemo } from 'react'
import { Descriptions, Empty, Table, Tag, Typography } from 'antd'
import type { AttributeDimension } from '../../../types/productsAttributes'

interface Props {
  dimension: AttributeDimension | undefined
}

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

function fmtInt(n: number | undefined): string {
  return (n ?? 0).toLocaleString('en-US')
}

export default function CatalogDimensionPanel({ dimension }: Props) {
  // All hooks run unconditionally — early returns below reference the results,
  // but React requires identical hook call order on every render.
  const totalClassified = useMemo(() => {
    if (!dimension) return 0
    // An SKU can appear under multiple values (multi-value dims) — the admin
    // API already returned per-value counts; the header "SKUs clasificados"
    // summary here uses the sum when the dim is single-value and the max when
    // it's multi-value, as an order-of-magnitude display. The coverage
    // endpoint is the authoritative per-SKU classifier count.
    if (!dimension.isMultiValue) {
      return dimension.values.reduce((acc, v) => acc + (v.skuCount ?? 0), 0)
    }
    return Math.max(0, ...dimension.values.map((v) => v.skuCount ?? 0))
  }, [dimension])

  const groupedByMechanic = useMemo(() => {
    if (!dimension || dimension.code !== 'discount_type') return null
    const byPrefix = new Map<string, typeof dimension.values>()
    for (const v of dimension.values) {
      const p = mechanicPrefix(v.code)
      const arr = byPrefix.get(p) ?? []
      arr.push(v)
      byPrefix.set(p, arr)
    }
    return Array.from(byPrefix.entries()).map(([prefix, rows]) => ({
      prefix,
      label: DISCOUNT_GROUP_LABELS[prefix] ?? prefix,
      rows: rows.sort((a, b) => a.sortOrder - b.sortOrder),
    }))
  }, [dimension])

  if (!dimension) {
    return <Empty description="Seleccione una dimensión" />
  }

  const columns = [
    { title: 'Código', dataIndex: 'code', key: 'code', width: 140, render: (c: string) => <Tag>{c}</Tag> },
    { title: 'Etiqueta', dataIndex: 'labelEs', key: 'labelEs' },
    { title: 'Orden', dataIndex: 'sortOrder', key: 'sortOrder', width: 100 },
    {
      title: 'SKUs clasificados',
      dataIndex: 'skuCount',
      key: 'skuCount',
      width: 160,
      align: 'right' as const,
      render: fmtInt,
    },
  ]

  return (
    <div>
      <Descriptions size="small" column={4} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Multi-valor">{dimension.isMultiValue ? 'Sí' : 'No'}</Descriptions.Item>
        <Descriptions.Item label="Valores">{dimension.values.length}</Descriptions.Item>
        <Descriptions.Item label="SKUs clasificados (aprox.)" span={2}>
          {fmtInt(totalClassified)}
        </Descriptions.Item>
      </Descriptions>

      {groupedByMechanic ? (
        groupedByMechanic.map((g) => (
          <div key={g.prefix} style={{ marginBottom: 16 }}>
            <Typography.Title level={5} style={{ marginBottom: 8 }}>
              {g.label}
            </Typography.Title>
            <Table
              size="small"
              rowKey="code"
              columns={columns}
              dataSource={g.rows}
              pagination={false}
            />
          </div>
        ))
      ) : (
        <Table
          size="small"
          rowKey="code"
          columns={columns}
          dataSource={dimension.values}
          pagination={false}
        />
      )}

      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
        Para editar el catálogo, modifique <code>apps/api/seeds/sku_extended_attributes/*.csv</code>{' '}
        y ejecute <code>pnpm seed:sku-attributes</code>.
      </Typography.Text>
    </div>
  )
}
