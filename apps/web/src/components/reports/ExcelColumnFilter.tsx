import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { Button, Checkbox, Divider, Input, Popover, Select, Space, Typography } from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  FilterFilled,
  FilterOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons'

const { Text } = Typography

export type ExcelFilterKind = 'text' | 'number'
export type ExcelSortDirection = 'asc' | 'desc'
export type NumericFilterOp = 'eq' | 'gt' | 'gte' | 'lt' | 'lte'

export interface ExcelColumnFilterState {
  sort?: ExcelSortDirection
  text?: string
  numericOp?: NumericFilterOp
  numericValue?: string
  selectedValues?: string[]
}

interface ExcelColumnFilterProps {
  title: React.ReactNode
  kind?: ExcelFilterKind
  values: string[]
  value?: ExcelColumnFilterState
  popupZIndex?: number
  onApply: (next: ExcelColumnFilterState) => void
  onClear: () => void
}

const NUMERIC_OP_OPTIONS = [
  { value: 'eq', label: '=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
] satisfies Array<{ value: NumericFilterOp; label: string }>

export default function ExcelColumnFilter({
  title,
  kind = 'text',
  values,
  value,
  popupZIndex,
  onApply,
  onClear,
}: ExcelColumnFilterProps): JSX.Element {
  const distinctValues = useMemo(() => Array.from(new Set(values)).sort(naturalCompare), [values])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<ExcelSortDirection | undefined>(value?.sort)
  const [text, setText] = useState(value?.text ?? '')
  const [numericOp, setNumericOp] = useState<NumericFilterOp>(value?.numericOp ?? 'eq')
  const [numericValue, setNumericValue] = useState(value?.numericValue ?? '')
  const [selected, setSelected] = useState<string[]>(value?.selectedValues ?? distinctValues)

  useEffect(() => {
    if (!open) return
    setSort(value?.sort)
    setText(value?.text ?? '')
    setNumericOp(value?.numericOp ?? 'eq')
    setNumericValue(value?.numericValue ?? '')
    setSelected(value?.selectedValues ?? distinctValues)
  }, [distinctValues, open, value])

  const filteredValues = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return distinctValues
    return distinctValues.filter((v) => v.toLowerCase().includes(q))
  }, [distinctValues, search])

  const active = !!value?.sort
    || !!value?.text?.trim()
    || !!value?.numericValue?.trim()
    || (value?.selectedValues != null && value.selectedValues.length !== distinctValues.length)

  const apply = (): void => {
    onApply({
      sort,
      text: text.trim() || undefined,
      numericOp: numericValue.trim() ? numericOp : undefined,
      numericValue: numericValue.trim() || undefined,
      selectedValues: selected.length === distinctValues.length ? undefined : selected,
    })
    setOpen(false)
  }

  const clear = (): void => {
    setSort(undefined)
    setText('')
    setNumericOp('eq')
    setNumericValue('')
    setSelected(distinctValues)
    setSearch('')
    onClear()
    setOpen(false)
  }

  const content = (
    <div className="excel-column-filter" onClick={(event) => event.stopPropagation()}>
      <Space direction="vertical" size={8} style={{ width: 240 }}>
        <Button
          type={sort === 'asc' ? 'primary' : 'text'}
          icon={kind === 'number' ? <ArrowUpOutlined /> : <SortAscendingOutlined />}
          block
          size="small"
          onClick={() => setSort(sort === 'asc' ? undefined : 'asc')}
        >
          {kind === 'number' ? 'Sort smallest to largest' : 'Sort A to Z'}
        </Button>
        <Button
          type={sort === 'desc' ? 'primary' : 'text'}
          icon={kind === 'number' ? <ArrowDownOutlined /> : <SortDescendingOutlined />}
          block
          size="small"
          onClick={() => setSort(sort === 'desc' ? undefined : 'desc')}
        >
          {kind === 'number' ? 'Sort largest to smallest' : 'Sort Z to A'}
        </Button>
        <Divider style={{ margin: '4px 0' }} />
        {kind === 'number' ? (
          <Space.Compact block>
            <Select<NumericFilterOp>
              value={numericOp}
              onChange={setNumericOp}
              options={NUMERIC_OP_OPTIONS}
              size="small"
              style={{ width: 74 }}
            />
            <Input
              value={numericValue}
              onChange={(event) => setNumericValue(event.target.value)}
              placeholder="Value"
              size="small"
            />
          </Space.Compact>
        ) : (
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Text filter"
            size="small"
          />
        )}
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search values"
          size="small"
        />
        <Space size={6}>
          <Button size="small" onClick={() => setSelected(distinctValues)}>Select all</Button>
          <Button size="small" onClick={() => setSelected([])}>Deselect all</Button>
        </Space>
        <div className="excel-column-filter__values">
          {filteredValues.length === 0 ? (
            <Text type="secondary">No values</Text>
          ) : (
            filteredValues.map((item) => (
              <Checkbox
                key={item}
                checked={selected.includes(item)}
                onChange={(event) => {
                  setSelected((prev) => {
                    if (event.target.checked) return Array.from(new Set([...prev, item]))
                    return prev.filter((v) => v !== item)
                  })
                }}
              >
                {item || '(blank)'}
              </Checkbox>
            ))
          )}
        </div>
        <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
          <Button size="small" onClick={clear}>Clear</Button>
          <Button size="small" type="primary" onClick={apply}>Apply</Button>
        </Space>
      </Space>
    </div>
  )

  return (
    <span className="excel-column-filter__header">
      <span className="excel-column-filter__title">{title}</span>
      <Popover
        open={open}
        onOpenChange={setOpen}
        content={content}
        trigger="click"
        placement="bottomLeft"
        zIndex={popupZIndex}
      >
        <Button
          aria-label={`Filter ${String(title)}`}
          className="excel-column-filter__button"
          type="text"
          size="small"
          icon={active ? <FilterFilled /> : <FilterOutlined />}
          onClick={(event) => event.stopPropagation()}
        />
      </Popover>
    </span>
  )
}

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
