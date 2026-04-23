import { Space, Tooltip, Typography } from 'antd'

interface Props {
  assigned: number
  systemTotal: number | undefined
  /**
   * When the attribute is multi-valued per SKU (e.g. Keywords — a SKU can
   * carry several at once), `assigned` sums references rather than distinct
   * SKUs, so coverage can exceed 100%. Set `multiValued` to relabel the
   * summary honestly.
   */
  multiValued?: boolean
}

/**
 * Single-line footer for taxonomy list tables. Shows how many SKUs have this
 * attribute assigned relative to the system-wide SKU total.
 */
export default function TaxonomyCoverageFooter({ assigned, systemTotal, multiValued }: Props) {
  const totalKnown = typeof systemTotal === 'number' && systemTotal > 0
  const pct = totalKnown ? (assigned / systemTotal!) * 100 : null
  const pctLabel = pct == null ? '—' : `${pct.toFixed(1)}%`
  const assignedLabel = multiValued ? 'references' : 'assigned'

  return (
    <Space style={{ width: '100%', justifyContent: 'flex-end' }} size="middle">
      <Typography.Text>
        <strong>{assigned.toLocaleString('en-US')}</strong> {assignedLabel}
      </Typography.Text>
      <Typography.Text type="secondary">
        of {totalKnown ? systemTotal!.toLocaleString('en-US') : '—'} system SKUs
      </Typography.Text>
      <Tooltip
        title={
          multiValued
            ? 'A SKU can carry multiple values, so this ratio can exceed 100%.'
            : 'Share of system SKUs with this attribute assigned.'
        }
      >
        <Typography.Text type={pct != null && pct < 100 ? 'warning' : 'secondary'}>
          ({pctLabel} coverage)
        </Typography.Text>
      </Tooltip>
    </Space>
  )
}
