import React from 'react'
import { Button, Select, Space, Tooltip, Typography, message } from 'antd'
import { AuthContext } from '../../auth/AuthContext'
import {
  useAttributeDimensions,
  useAttributeMacroRules,
  useSetSkuAttributeDimension,
  useSkuAttributes,
} from '../../hooks/useProductsAttributes'
import type {
  AttributeDimension,
  SkuAttributeAssignment,
  SkuDimensionEntry,
} from '../../types/productsAttributes'

export const OPERATIONAL_ATTRIBUTE_CODES = [
  'buyer',
  'company',
  'store_chain',
  'discount_type',
  'label_type',
] as const

type SetDimensionMutation = ReturnType<typeof useSetSkuAttributeDimension>

interface EditorContext {
  skuCode: string
  canEdit: boolean
  dimensionsByCode: Map<string, AttributeDimension>
  derivedDimensionCodes: Set<string>
  dimensionsLoading: boolean
  mutation: SetDimensionMutation
}

export interface AttributeHeaderEntry {
  dimCode: string
  label: string
  dimension: AttributeDimension | null
  entry: SkuDimensionEntry
}

export interface AttributeHeaderModel {
  editor: EditorContext
  entries: AttributeHeaderEntry[]
  entryByCode: Map<string, AttributeHeaderEntry>
  isError: boolean
  isLoading: boolean
}

export function useAttributeHeaderModel(skuCode: string, editable = false): AttributeHeaderModel {
  const auth = React.useContext(AuthContext)
  const canEdit = Boolean(editable && auth?.permissions.has('products.write'))
  const { data, isError, isLoading } = useSkuAttributes(skuCode)
  const {
    data: dimensions,
    isLoading: dimensionsLoading,
  } = useAttributeDimensions(false)
  const { data: macroRules } = useAttributeMacroRules(canEdit)
  const mutation = useSetSkuAttributeDimension()

  const dimensionsByCode = React.useMemo(() => {
    const map = new Map<string, AttributeDimension>()
    for (const dimension of dimensions ?? []) map.set(dimension.code, dimension)
    return map
  }, [dimensions])

  const derivedDimensionCodes = React.useMemo(
    () => new Set(['color_family', ...(macroRules ?? []).map((rule) => rule.targetDimensionCode)]),
    [macroRules],
  )

  const editor = React.useMemo<EditorContext>(
    () => ({
      skuCode,
      canEdit,
      dimensionsByCode,
      derivedDimensionCodes,
      dimensionsLoading,
      mutation,
    }),
    [canEdit, derivedDimensionCodes, dimensionsByCode, dimensionsLoading, mutation, skuCode],
  )

  const entries = React.useMemo<AttributeHeaderEntry[]>(() => {
    return Object.entries(data?.byDimension ?? {})
      .map(([dimCode, entry]) => {
        const dimension = dimensionsByCode.get(dimCode) ?? null
        return {
          dimCode,
          label: dimension?.labelEs ?? dimLabel(dimCode),
          dimension,
          entry,
        }
      })
      .sort((a, b) => {
        const aOrder = a.dimension?.sortOrder ?? Number.MAX_SAFE_INTEGER
        const bOrder = b.dimension?.sortOrder ?? Number.MAX_SAFE_INTEGER
        return aOrder - bOrder || a.label.localeCompare(b.label)
      })
  }, [data?.byDimension, dimensionsByCode])

  const entryByCode = React.useMemo(() => {
    const map = new Map<string, AttributeHeaderEntry>()
    for (const entry of entries) map.set(entry.dimCode, entry)
    return map
  }, [entries])

  return { editor, entries, entryByCode, isError, isLoading }
}

export function AttributeHeaderValueCell({
  cellValueStyle,
  dimCode,
  model,
}: {
  cellValueStyle: React.CSSProperties
  dimCode: string
  model: AttributeHeaderModel
}) {
  const known = model.entryByCode.get(dimCode)
  const dimension = known?.dimension ?? model.editor.dimensionsByCode.get(dimCode) ?? null
  const entry = known?.entry
  const label = known?.label ?? dimension?.labelEs ?? dimLabel(dimCode)

  return (
    <td style={cellValueStyle}>
      <AttributeValueDisplay
        dimCode={dimCode}
        dimension={dimension}
        editor={model.editor}
        entry={entry}
        label={label}
      />
    </td>
  )
}

export function AttributeHeaderGroupRows({
  cellLabelStyle,
  cellValueStyle,
  excludedDimensionCodes,
  model,
}: {
  cellLabelStyle: React.CSSProperties
  cellValueStyle: React.CSSProperties
  excludedDimensionCodes: readonly string[]
  model: AttributeHeaderModel
}) {
  if (model.isLoading || model.isError) return null

  const excluded = new Set(excludedDimensionCodes)
  const visibleEntries = model.entries.filter((entry) => !excluded.has(entry.dimCode))
  const universalEntries = visibleEntries.filter((entry) => (entry.dimension?.familyRules.length ?? 0) === 0)
  const familyEntries = visibleEntries.filter((entry) => (entry.dimension?.familyRules.length ?? 0) > 0)

  return (
    <>
      <AttributeSectionRows
        cellLabelStyle={cellLabelStyle}
        cellValueStyle={cellValueStyle}
        entries={universalEntries}
        model={model}
        title="Universal Attributes"
      />
      <AttributeSectionRows
        cellLabelStyle={cellLabelStyle}
        cellValueStyle={cellValueStyle}
        entries={familyEntries}
        model={model}
        title="Family Attributes"
      />
    </>
  )
}

function AttributeSectionRows({
  cellLabelStyle,
  cellValueStyle,
  entries,
  model,
  title,
}: {
  cellLabelStyle: React.CSSProperties
  cellValueStyle: React.CSSProperties
  entries: AttributeHeaderEntry[]
  model: AttributeHeaderModel
  title: string
}) {
  if (entries.length === 0) return null

  const rows = chunk(entries, 3)
  return (
    <>
      <tr>
        <th
          colSpan={6}
          style={{
            ...cellLabelStyle,
            textAlign: 'left',
            paddingTop: 8,
            borderBottom: '1px solid #eee',
          }}
        >
          {title}
        </th>
      </tr>
      {rows.map((row, rowIndex) => (
        <tr key={`${title}-${rowIndex}`}>
          {row.map((entry) => (
            <React.Fragment key={entry.dimCode}>
              <th style={cellLabelStyle}>{entry.label}</th>
              <td style={cellValueStyle}>
                <AttributeValueDisplay
                  dimCode={entry.dimCode}
                  dimension={entry.dimension}
                  editor={model.editor}
                  entry={entry.entry}
                  label={entry.label}
                />
              </td>
            </React.Fragment>
          ))}
          {Array.from({ length: 3 - row.length }).map((_, index) => (
            <React.Fragment key={`empty-${index}`}>
              <th style={cellLabelStyle} />
              <td style={cellValueStyle} />
            </React.Fragment>
          ))}
        </tr>
      ))}
    </>
  )
}

function AttributeValueDisplay({
  dimCode,
  dimension,
  editor,
  entry,
  label,
}: {
  dimCode: string
  dimension: AttributeDimension | null
  editor: EditorContext
  entry: SkuDimensionEntry | undefined
  label: string
}) {
  const currentValues = entry?.values ?? []
  const displayText = currentValues.length > 0
    ? currentValues.map((value) => value.labelEs).join(', ')
    : '-'
  const [open, setOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<string[]>(() => currentValues.map((value) => value.code))
  const currentCodes = React.useMemo(() => currentValues.map((value) => value.code), [currentValues])
  const isDerived = editor.derivedDimensionCodes.has(dimCode)
  const canEditThis =
    editor.canEdit &&
    !editor.dimensionsLoading &&
    Boolean(dimension) &&
    Boolean(entry) &&
    !isDerived

  React.useEffect(() => {
    if (open) setSelected(currentCodes)
  }, [currentCodes, open])

  const tooltipText = tooltipForCell({
    canEdit: editor.canEdit,
    canEditThis,
    dimCode,
    dimensionsLoading: editor.dimensionsLoading,
    hasDimension: Boolean(dimension),
    hasEntry: Boolean(entry),
    isDerived,
    label,
    values: currentValues,
  })

  if (!canEditThis || !dimension || !entry) {
    return (
      <Tooltip title={tooltipText}>
        <span>{displayText}</span>
      </Tooltip>
    )
  }

  if (open) {
    return (
      <AttributeEditPopover
        currentCodes={currentCodes}
        dimension={dimension}
        entry={entry}
        label={label}
        mutation={editor.mutation}
        selected={selected}
        setSelected={setSelected}
        skuCode={editor.skuCode}
        onClose={() => setOpen(false)}
      />
    )
  }

  return (
    <Button
      type="link"
      size="small"
      aria-label={currentValues.length > 0 ? undefined : `Edit ${label}`}
      title={tooltipText}
      onMouseDown={(event) => {
        event.preventDefault()
        setOpen(true)
      }}
      onClick={() => setOpen(true)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        setOpen(true)
      }}
      style={{
        background: 'transparent',
        border: 0,
        color: 'inherit',
        font: 'inherit',
        height: 'auto',
        lineHeight: 'inherit',
        margin: 0,
        padding: 0,
        textAlign: 'left',
      }}
    >
      {displayText}
    </Button>
  )
}

function AttributeEditPopover({
  currentCodes,
  dimension,
  entry,
  label,
  mutation,
  selected,
  setSelected,
  skuCode,
  onClose,
}: {
  currentCodes: string[]
  dimension: AttributeDimension
  entry: SkuDimensionEntry
  label: string
  mutation: SetDimensionMutation
  selected: string[]
  setSelected: (next: string[]) => void
  skuCode: string
  onClose: () => void
}) {
  const dirty = !sameSelection(currentCodes, selected)
  const saving = mutation.isPending

  const save = async () => {
    try {
      await mutation.mutateAsync({
        code: skuCode,
        dimensionCode: dimension.code,
        input: { value_codes: selected },
      })
      message.success(`${label} saved`)
      onClose()
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  return (
    <Space direction="vertical" size={8} style={{ width: 260 }}>
      <Typography.Text strong style={{ fontSize: 12 }}>
        {label}
      </Typography.Text>
      <Select
        mode={entry.isMultiValue ? 'multiple' : undefined}
        allowClear
        showSearch
        optionFilterProp="label"
        placeholder="Sin clasificar"
        value={entry.isMultiValue ? selected : selected[0]}
        options={valueOptions(dimension, currentCodes)}
        onChange={(value) => {
          const next = entry.isMultiValue
            ? (value as string[])
            : value
              ? [value as string]
              : []
          setSelected(next)
        }}
        popupMatchSelectWidth={false}
        style={{ width: '100%' }}
        virtual={false}
      />
      <Space size={6}>
        <Button size="small" type="primary" onClick={save} disabled={!dirty} loading={saving}>
          Save
        </Button>
        <Button size="small" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button size="small" onClick={() => setSelected([])} disabled={selected.length === 0 || saving}>
          Clear
        </Button>
      </Space>
    </Space>
  )
}

function valueOptions(dimension: AttributeDimension, currentCodes: string[]) {
  const options = dimension.values
    .filter((value) => value.isActive)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.labelEs.localeCompare(b.labelEs))
    .map((value) => ({ value: value.code, label: value.labelEs }))
  const seen = new Set(options.map((option) => option.value))
  for (const code of currentCodes) {
    if (seen.has(code)) continue
    const value = dimension.values.find((candidate) => candidate.code === code)
    options.push({
      value: code,
      label: value ? `${value.labelEs} (inactive)` : code,
      disabled: true,
    } as { value: string; label: string; disabled: boolean })
  }
  return options
}

function sameSelection(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const a = [...left].sort()
  const b = [...right].sort()
  return a.every((value, index) => value === b[index])
}

function tooltipForCell({
  canEdit,
  canEditThis,
  dimCode,
  dimensionsLoading,
  hasDimension,
  hasEntry,
  isDerived,
  label,
  values,
}: {
  canEdit: boolean
  canEditThis: boolean
  dimCode: string
  dimensionsLoading: boolean
  hasDimension: boolean
  hasEntry: boolean
  isDerived: boolean
  label: string
  values: SkuAttributeAssignment[]
}) {
  if (canEditThis) return values.length > 0 ? sourceTooltip(values) : `Sin clasificar. Click to edit ${label}.`
  if (isDerived) return `${label} is derived from another attribute. Edit the source attribute instead.`
  if (canEdit && dimensionsLoading) return 'Loading attribute options...'
  if (canEdit && !hasDimension) return `No value catalog found for ${dimCode}.`
  if (canEdit && !hasEntry) return `${label} does not apply to this SKU.`
  return values.length > 0 ? sourceTooltip(values) : `Sin clasificar: ${label}`
}

function sourceTooltip(values: SkuAttributeAssignment[]): string {
  const sources = Array.from(new Set(values.map((value) => value.assignedBy)))
  if (sources.length === 0 || sources.every((source) => !source)) return 'Clasificacion manual'
  if (sources.every((source) => source?.startsWith('seed:keyword:'))) return 'Derivado de keywords'
  if (sources.every((source) => source?.startsWith('seed:excel:'))) return 'Importado desde Excel'
  return sources.map((source) => (source ? `Editado por: ${source}` : 'Clasificacion manual')).join(', ')
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size))
  }
  return rows
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
