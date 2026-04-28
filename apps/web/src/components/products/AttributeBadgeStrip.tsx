import { Space, Tag, Tooltip, Typography } from 'antd'
import { useSkuAttributes } from '../../hooks/useProductsAttributes'
import type { SkuDimensionEntry } from '../../types/productsAttributes'

interface Props {
  skuCode: string
  mode?: 'assigned' | 'unassigned'
}

const DIM_COLORS: Record<string, string> = {
  buyer: 'blue',
  company: 'purple',
  store_chain: 'geekblue',
  discount_type: 'orange',
}

const CORE_ATTRIBUTE_CODES = new Set([
  'color',
  'color_family',
  'width_type',
  'pattern',
  'finish',
  'accessory',
  'heel_height',
  'heel_shape',
  'toe_shape',
  'upper_material',
  'outsole_material',
  'heel_material',
])

const MERCHANDISING_ATTRIBUTE_CODES = new Set([
  'buyer',
  'company',
  'store_chain',
  'discount_type',
])

/**
 * Compact read-only badge strip showing SKU attribute classifications.
 * Assigned mode renders value pills. Unassigned mode renders only missing
 * dimension names so the operator can see what still needs work.
 */
export default function AttributeBadgeStrip({ skuCode, mode = 'unassigned' }: Props) {
  const { data, isError, isLoading } = useSkuAttributes(skuCode)

  const entries = Object.entries(data?.byDimension ?? {})
  const coreEntries = entries.filter(([dimCode]) => CORE_ATTRIBUTE_CODES.has(dimCode))
  const merchandisingEntries = entries.filter(([dimCode]) => !CORE_ATTRIBUTE_CODES.has(dimCode))
  const assignedCoreEntries = coreEntries.filter(([, entry]) => entry.values.length > 0)
  const assignedMerchandisingEntries = merchandisingEntries.filter(([, entry]) => entry.values.length > 0)
  const unassignedCoreEntries = coreEntries.filter(([, entry]) => entry.values.length === 0)
  const unassignedMerchandisingEntries = merchandisingEntries.filter(([, entry]) => entry.values.length === 0)
  const hasRenderableRows =
    mode === 'assigned'
      ? assignedCoreEntries.length > 0 || assignedMerchandisingEntries.length > 0
      : unassignedCoreEntries.length > 0 || unassignedMerchandisingEntries.length > 0

  if (!isLoading && !isError && !hasRenderableRows) return null

  return (
    <Space
      direction="vertical"
      size={6}
      style={{
        width: '100%',
        padding: '8px 10px',
        background: mode === 'assigned' ? '#fff' : '#fafbfc',
        border: mode === 'assigned' ? '1px solid #d9e8ff' : '1px solid #f0f0f0',
        borderRadius: 4,
        marginBottom: 8,
        minHeight: mode === 'assigned' ? 132 : undefined,
      }}
    >
      {isLoading ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Loading attributes...
        </Typography.Text>
      ) : isError ? (
        <Typography.Text type="danger" style={{ fontSize: 12 }}>
          Attributes could not be loaded.
        </Typography.Text>
      ) : null}
      {mode === 'assigned' ? (
        <>
          <AssignedAttributeSection title="Attributes" entries={assignedCoreEntries} />
          <AssignedAttributeSection title="Merchandising Attributes" entries={assignedMerchandisingEntries} />
        </>
      ) : (
        <>
          <UnassignedAttributeSection title="Unassigned Attributes" entries={unassignedCoreEntries} />
          <UnassignedAttributeSection
            title="Unassigned Merchandising Attributes"
            entries={unassignedMerchandisingEntries}
          />
        </>
      )}
    </Space>
  )
}

function AssignedAttributeSection({
  title,
  entries,
}: {
  title: string
  entries: Array<[string, SkuDimensionEntry]>
}) {
  if (entries.length === 0) return null
  return (
    <Space size={[8, 4]} wrap>
      <Typography.Text strong style={{ fontSize: 12 }}>
        {title}:
      </Typography.Text>
      {entries.map(([dimCode, entry]) => {
        const color = DIM_COLORS[dimCode] ?? (MERCHANDISING_ATTRIBUTE_CODES.has(dimCode) ? 'cyan' : 'default')
        const label = dimLabel(dimCode)
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

function UnassignedAttributeSection({
  title,
  entries,
}: {
  title: string
  entries: Array<[string, SkuDimensionEntry]>
}) {
  if (entries.length === 0) return null
  return (
    <Space size={[8, 4]} wrap>
      <Typography.Text strong style={{ fontSize: 12 }}>
        {title}:
      </Typography.Text>
      {entries.map(([dimCode]) => (
        <Tag key={dimCode} style={{ marginRight: 0 }}>
          {dimLabel(dimCode)}
        </Tag>
      ))}
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
    case 'color':
      return 'Color'
    case 'color_family':
      return 'Familia de Color'
    case 'width_type':
      return 'Ancho'
    case 'pattern':
      return 'Patron'
    case 'finish':
      return 'Acabado'
    case 'accessory':
      return 'Accesorio'
    case 'heel_height':
      return 'Altura del Tacon'
    case 'heel_shape':
      return 'Forma del Tacon'
    case 'toe_shape':
      return 'Forma de la Punta'
    case 'upper_material':
      return 'Material Superior'
    case 'outsole_material':
      return 'Material de Suela'
    case 'heel_material':
      return 'Material del Tacon'
    default:
      return dimCode
  }
}

function sourceTooltip(assignedBy: string | null): string {
  if (!assignedBy) return 'Clasificacion manual'
  if (assignedBy.startsWith('seed:keyword:')) return 'Derivado de keywords'
  if (assignedBy.startsWith('seed:excel:')) return 'Importado desde Excel'
  return `Editado por: ${assignedBy}`
}
