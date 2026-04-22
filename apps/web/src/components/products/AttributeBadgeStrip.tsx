import { Space, Tag, Tooltip, Typography } from 'antd'
import { useSkuAttributes } from '../../hooks/useProductsAttributes'

interface Props {
  skuCode: string
}

const DIM_COLORS: Record<string, string> = {
  buyer: 'blue',
  company: 'purple',
  store_chain: 'geekblue',
  discount_type: 'orange',
}

/**
 * Compact read-only badge strip showing the SKU's extended-attribute
 * classifications. One pill per dim; unclassified dims render muted.
 * Spec: docs/dev/specs/2026-04-22-sku-extended-attributes-foundation-design.md §4d.
 */
export default function AttributeBadgeStrip({ skuCode }: Props) {
  const { data, isLoading } = useSkuAttributes(skuCode)

  if (isLoading || !data) return null

  const entries = Object.entries(data.byDimension)
  if (entries.length === 0) return null

  return (
    <Space
      size={[8, 4]}
      wrap
      style={{
        padding: '6px 8px',
        background: '#fafbfc',
        border: '1px solid #f0f0f0',
        borderRadius: 4,
        marginBottom: 8,
      }}
    >
      {entries.map(([dimCode, entry]) => {
        const color = DIM_COLORS[dimCode]
        const label = dimLabel(dimCode)
        if (entry.values.length === 0) {
          return (
            <Typography.Text key={dimCode} type="secondary" style={{ fontSize: 12 }}>
              {label}: sin clasificar
            </Typography.Text>
          )
        }
        return (
          <Space key={dimCode} size={4} wrap>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {label}:
            </Typography.Text>
            {entry.values.map((v) => (
              <Tooltip key={v.code} title={sourceTooltip(v.assignedBy)}>
                <Tag color={color} style={{ marginRight: 0 }}>
                  {v.labelEs}
                </Tag>
              </Tooltip>
            ))}
          </Space>
        )
      })}
    </Space>
  )
}

function dimLabel(dimCode: string): string {
  switch (dimCode) {
    case 'buyer':
      return 'Comprador'
    case 'company':
      return 'Empresa'
    case 'store_chain':
      return 'Cadena'
    case 'discount_type':
      return 'Descuento'
    default:
      return dimCode
  }
}

function sourceTooltip(assignedBy: string | null): string {
  if (!assignedBy) return 'Clasificación manual'
  if (assignedBy.startsWith('seed:keyword:')) return 'Derivado de keywords'
  if (assignedBy.startsWith('seed:excel:')) return 'Importado desde Excel'
  return `Editado por: ${assignedBy}`
}
