import { Tag, Typography } from 'antd'
import type { ReactNode } from 'react'

const { Text } = Typography

export interface FilterChip {
  // Label shown before the value in the chip, e.g. "Dept".
  label: string
  // The filter value; rendered as the chip's bold body. Pass a string for
  // plain text or a node for e.g. a date range with an arrow. Null/undefined/
  // empty string means "not set" — chip is skipped by the parent.
  value: ReactNode
  // Optional tooltip-style hint shown on the chip via the title attribute.
  hint?: string
}

interface Props {
  chips: Array<FilterChip | null | false | undefined>
  // Optional prefix label ("Showing", "Filtered by"). Default: no prefix.
  prefix?: string
}

/**
 * Compact horizontal summary of the filters a report was run with. Rendered
 * above the results so the operator never has to scroll back to the form to
 * remember the current scope. Null/false/undefined entries are skipped so
 * pages can use simple `isSet && { label, value }` expressions.
 */
export default function FilterChips({ chips, prefix }: Props) {
  const visible = chips.filter((c): c is FilterChip => {
    if (!c) return false
    if (c.value == null) return false
    if (typeof c.value === 'string' && c.value.trim() === '') return false
    return true
  })
  if (visible.length === 0) return null
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 12,
      }}
    >
      {prefix ? (
        <Text type="secondary" style={{ fontSize: 13, marginRight: 4 }}>
          {prefix}:
        </Text>
      ) : null}
      {visible.map((c, i) => (
        <Tag
          key={`${c.label}-${i}`}
          title={c.hint}
          style={{ margin: 0, paddingInline: 10, paddingBlock: 2, fontSize: 13 }}
        >
          <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>
            {c.label}
          </Text>
          <Text strong>{c.value}</Text>
        </Tag>
      ))}
    </div>
  )
}
