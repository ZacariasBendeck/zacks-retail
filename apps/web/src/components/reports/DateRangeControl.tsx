import { DatePicker, Select, Space, Typography } from 'antd'
import dayjs from 'dayjs'
import {
  DATE_SPEC_PRESETS,
  describeDateSpec,
  presetFromSpec,
  resolveDateSpec,
  specFromPreset,
  type DateSpec,
  type DateSpecPreset,
  type ResolvedDateRange,
} from '../../utils/dateSpec'

const { Text } = Typography
const { RangePicker } = DatePicker

interface Props {
  value: DateSpec
  onChange: (next: DateSpec) => void
  // Optional: hide the preview line when the preset IS "fixed" (since the
  // RangePicker already shows the literal dates). Defaults to false — the
  // preview is helpful for relative specs but harmless for fixed.
  suppressPreviewWhenFixed?: boolean
  resolve?: (value: DateSpec) => ResolvedDateRange
  describe?: (value: DateSpec) => string
}

/**
 * Replacement for the raw RangePicker on date-scoped report pages. Pairs a
 * preset dropdown (This month, Year to date, Trailing N days/months) with a
 * fixed-range picker that only activates when "Fixed range" is selected.
 *
 * The full DateSpec (not a resolved [start, end] pair) is owned by the
 * caller so the page can serialize it into a template's paramsJson — that's
 * what makes replay resolve against current data each time rather than the
 * literal dates captured at save time.
 */
export default function DateRangeControl({
  value,
  onChange,
  suppressPreviewWhenFixed = false,
  resolve = resolveDateSpec,
  describe = describeDateSpec,
}: Props): JSX.Element {
  const preset = presetFromSpec(value)
  const resolved = resolve(value)

  const onPresetChange = (next: DateSpecPreset): void => {
    // When switching preset → fixed, preserve the currently-resolved window
    // as the fixed starting point so the visible dates don't jump on the flip.
    onChange(specFromPreset(next, resolved))
  }

  const onFixedRangeChange = (range: [unknown, unknown] | null): void => {
    if (!range || !range[0] || !range[1]) return
    const start = (range[0] as dayjs.Dayjs).format('YYYY-MM-DD')
    const end = (range[1] as dayjs.Dayjs).format('YYYY-MM-DD')
    onChange({ type: 'fixed', startDate: start, endDate: end })
  }

  const showPreview = !(suppressPreviewWhenFixed && value.type === 'fixed')

  return (
    <Space direction="vertical" size={2}>
      <Space wrap size={8}>
        <Select<DateSpecPreset>
          value={preset}
          onChange={onPresetChange}
          options={DATE_SPEC_PRESETS}
          style={{ width: 180 }}
          data-testid="date-range-preset"
        />
        {value.type === 'fixed' && (
          <RangePicker
            value={[dayjs(value.startDate), dayjs(value.endDate)]}
            onChange={onFixedRangeChange}
            allowClear={false}
            data-testid="date-range-fixed"
          />
        )}
      </Space>
      {showPreview && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {value.type === 'fixed'
            ? `${resolved.startDate} → ${resolved.endDate}`
            : describe(value)}
        </Text>
      )}
    </Space>
  )
}
