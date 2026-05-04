import { Input, Select, Space, Tooltip, Typography } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'

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
  hideGrammar?: boolean
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
  hideGrammar = false,
  helpText,
  selectTestId,
  rawTestId,
}: CriteriaInputProps<V>) {
  const defaultHelp = mode === 'numeric' ? NUMERIC_HELP : STRING_HELP
  const effectiveHelp = helpText ?? defaultHelp
  const grammarPlaceholder =
    mode === 'numeric' ? 'e.g. 556-599, <>575' : 'e.g. *FORMAL*, <>NIKE'
  const testIdSlug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const classes = [
    'criteria-input-compact',
    hideDropdown ? 'criteria-input-compact--grammar-only' : '',
    hideGrammar ? 'criteria-input-compact--picker-only' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      <Space size={4} align="center" className="criteria-input-compact__label">
        <Text strong style={{ fontSize: 12 }}>
          {label}
        </Text>
        <Tooltip title={effectiveHelp} placement="top">
          <QuestionCircleOutlined
            aria-label={`${label} criteria help`}
            className="criteria-input-compact__help"
            tabIndex={0}
            title={effectiveHelp}
          />
        </Tooltip>
      </Space>
      {!hideDropdown && (
        <Select<V[]>
          mode="multiple"
          allowClear
          loading={loading}
          value={selected}
          onChange={onSelectedChange}
          placeholder={`All ${label}`}
          optionFilterProp="label"
          size="small"
          maxTagCount="responsive"
          style={{ width: '100%' }}
          options={options}
          data-testid={selectTestId ?? `${testIdSlug}-criteria-picker`}
        />
      )}
      {!hideGrammar && (
        <Input
          placeholder={grammarPlaceholder}
          value={rawText}
          onChange={(e) => onRawTextChange(e.target.value)}
          size="small"
          style={{ fontFamily: 'Consolas, Menlo, monospace' }}
          aria-label={`${label} grammar criteria`}
          data-testid={rawTestId ?? `${testIdSlug}-criteria-grammar`}
        />
      )}
    </div>
  )
}
