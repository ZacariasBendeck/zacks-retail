import { Form, Input, InputNumber } from 'antd'
import type { FormRule } from 'antd'
import type { CSSProperties, ReactNode } from 'react'
import { ThunderboltOutlined } from '@ant-design/icons'
import type { ReferenceItem } from '../../../types/sku'
import { AI_FILLED_STYLE, readonlyInput, monoInput } from './styles'

export { AI_FILLED_STYLE }

export function normalize(s: string): string {
  return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function matchReference(aiValue: string, items: ReferenceItem[]): number | null {
  if (!aiValue || !items?.length) return null
  const norm = normalize(aiValue)

  const exact = items.find((i) => normalize(i.name) === norm)
  if (exact) return exact.id

  const substr = items.find((i) => {
    const refNorm = normalize(i.name)
    return refNorm.includes(norm) || norm.includes(refNorm)
  })
  if (substr) return substr.id

  const aiWords = norm.split(/[\s/,]+/).filter(Boolean)
  let bestScore = 0
  let bestItem: ReferenceItem | null = null
  for (const item of items) {
    const refWords = normalize(item.name).split(/[\s/,]+/).filter(Boolean)
    const overlap = aiWords.filter((w) => refWords.some((rw) => rw.includes(w) || w.includes(rw))).length
    const score = overlap / Math.max(aiWords.length, refWords.length)
    if (score > bestScore && score >= 0.5) {
      bestScore = score
      bestItem = item
    }
  }
  return bestItem?.id ?? null
}

export function refOptions(items: ReferenceItem[] | undefined) {
  if (!items) return []
  return items.map((i) => ({ label: i.name, value: i.id }))
}

export function aiLabel(label: string, fieldName: string, filledSet: Set<string>): ReactNode {
  if (!filledSet.has(fieldName)) return label
  return (
    <span>
      {label} <ThunderboltOutlined style={{ color: '#52c41a', fontSize: 11 }} />
    </span>
  )
}

/** Merge compact-field spacing with the AI-filled green-border highlight. */
export function fieldStyle(filledSet: Set<string>, fieldName: string, base?: CSSProperties): CSSProperties {
  return {
    marginBottom: 12,
    ...(base ?? {}),
    ...(filledSet.has(fieldName) ? AI_FILLED_STYLE : {}),
  }
}

/** Readonly input that shows the vendor name resolved from the selected code. */
export function VendorNameAutofill({ vendors }: { vendors: { code: string; name: string }[] | undefined }) {
  const selectedCode = Form.useWatch('vendorId') as string | undefined
  const resolved = vendors?.find((v) => v.code === selectedCode)
  return (
    <Input
      value={resolved?.name ?? ''}
      readOnly
      placeholder="Auto"
      style={readonlyInput}
    />
  )
}

/** Readonly description for the 2-character Season Code. */
export function SeasonAutofill({
  seasons,
}: {
  seasons: { code: string; description: string }[] | undefined
}) {
  const code = (Form.useWatch('season') as string | undefined) ?? ''
  const norm = code.trim().toUpperCase()
  const match = seasons?.find((s) => s.code.trim().toUpperCase() === norm)
  return (
    <Input
      value={match?.description ?? ''}
      readOnly
      placeholder={norm ? 'Código no encontrado' : 'Auto'}
      style={readonlyInput}
    />
  )
}

/** Margin % = (retail - cost) / retail × 100, rounded to 1 decimal. Live-computed. */
export function MarginPercentDisplay() {
  const retail = Form.useWatch('price') as number | undefined
  const cost = Form.useWatch('cost') as number | undefined
  let label = '—'
  let positive = false
  if (typeof retail === 'number' && retail > 0 && typeof cost === 'number') {
    const pct = ((retail - cost) / retail) * 100
    label = `${(Math.round(pct * 10) / 10).toFixed(1)} %`
    positive = pct >= 0
  }
  return (
    <Input
      value={label}
      readOnly
      style={{
        ...monoInput,
        textAlign: 'right',
        color: label === '—' ? 'rgba(0,0,0,0.45)' : positive ? '#389e0d' : '#cf1322',
        fontWeight: 600,
      }}
    />
  )
}

interface PriceFieldProps {
  name: string
  label: string
  rules?: FormRule[]
  placeholder?: string
}

/** Vertical currency input, plain decimal (no $/L), precision 2, min 0. */
export function PriceField({ name, label, rules, placeholder = '0.00' }: PriceFieldProps) {
  return (
    <Form.Item name={name} label={label} rules={rules} style={{ marginBottom: 12 }}>
      <InputNumber
        style={{ width: '100%' }}
        min={0}
        step={0.01}
        precision={2}
        placeholder={placeholder}
      />
    </Form.Item>
  )
}

/** Apariencia / Diseño visibility per Product Family. Shoe-only dims are
 *  gated to family=zapatos; other families see Color/Pattern/Finish-style dims. */
export const APARIENCIA_SHOE_ONLY_FIELDS = new Set([
  'widthTypeId',
  'accessoryId',
  'heelHeightId',
  'heelShapeId',
  'toeShapeId',
  'upperMaterialId',
  'outsoleMaterialId',
  'heelMaterialId',
])

export function isApparienciaFieldVisible(field: string, family: string | null): boolean {
  if (!family) return true
  if (family === 'zapatos') return true
  return !APARIENCIA_SHOE_ONLY_FIELDS.has(field)
}
