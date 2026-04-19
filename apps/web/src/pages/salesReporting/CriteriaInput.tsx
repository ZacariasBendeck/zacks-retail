import { Col, Input, Row, Select, Space, Typography } from 'antd'

const { Text } = Typography

type OptionValue = string | number

interface Option<V extends OptionValue> {
  value: V
  label: string
}

export interface CriteriaInputProps<V extends OptionValue> {
  label: string
  /** Informs the help text. `numeric` hints ranges; `string` hints wildcards. */
  mode: 'numeric' | 'string'
  options: Option<V>[]
  selected: V[]
  onSelectedChange: (value: V[]) => void
  rawText: string
  onRawTextChange: (value: string) => void
  loading?: boolean
  hideDropdown?: boolean
  /** Overrides the default help line under the text box. */
  helpText?: string
  /** Optional data-testid for the multi-select. */
  selectTestId?: string
  /** Optional data-testid for the grammar text Input. */
  rawTestId?: string
}

const NUMERIC_HELP =
  'Ranges: 556-599   Exclude: <>575   Wildcard: 5?0   Escape hyphen: 100!-120'
const STRING_HELP =
  'Ranges: AAA-AZZ   Exclude: <>NIKE   Wildcard: *FORMAL*   Keyword AND: +A +B'

/**
 * Shared criteria input pairing an Ant multi-select with a RICS-grammar text
 * box. Caller owns both pieces of state so the parent can ship both to the
 * server in its request payload.
 */
export default function CriteriaInput<V extends OptionValue>({
  label,
  mode,
  options,
  selected,
  onSelectedChange,
  rawText,
  onRawTextChange,
  loading = false,
  hideDropdown = false,
  helpText,
  selectTestId,
  rawTestId,
}: CriteriaInputProps<V>) {
  const defaultHelp = mode === 'numeric' ? NUMERIC_HELP : STRING_HELP
  const effectiveHelp = helpText ?? defaultHelp
  const grammarPlaceholder =
    mode === 'numeric' ? 'e.g. 556-599, <>575' : 'e.g. *FORMAL*, <>NIKE'

  return (
    <Row gutter={12} align="top" wrap={false}>
      <Col flex="140px" style={{ textAlign: 'right', paddingTop: 6 }}>
        <Text strong>{label}</Text>
      </Col>
      <Col flex="auto">
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {!hideDropdown && (
            <Select<V[]>
              mode="multiple"
              allowClear
              loading={loading}
              value={selected}
              onChange={onSelectedChange}
              placeholder={`All ${label}`}
              optionFilterProp="label"
              style={{ width: '100%' }}
              options={options}
              data-testid={selectTestId}
            />
          )}
          <Input
            placeholder={grammarPlaceholder}
            value={rawText}
            onChange={(e) => onRawTextChange(e.target.value)}
            style={{ fontFamily: 'Consolas, Menlo, monospace' }}
            data-testid={rawTestId}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {effectiveHelp}
          </Text>
        </Space>
      </Col>
    </Row>
  )
}
