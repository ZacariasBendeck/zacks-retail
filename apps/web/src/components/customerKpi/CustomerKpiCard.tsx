import { Card, Skeleton, Tooltip, Typography } from 'antd'
import type { ReactNode } from 'react'

interface Props {
  label: string
  value: ReactNode
  hint?: ReactNode
  loading?: boolean
  tooltip?: string
  tone?: 'default' | 'positive' | 'warning' | 'danger'
}

const TONE_BG: Record<NonNullable<Props['tone']>, string> = {
  default: '#ffffff',
  positive: '#f6ffed',
  warning: '#fffbe6',
  danger: '#fff1f0',
}

export function CustomerKpiCard({ label, value, hint, loading, tooltip, tone = 'default' }: Props) {
  const card = (
    <Card
      size="small"
      style={{
        background: TONE_BG[tone],
        borderRadius: 12,
        height: '100%',
      }}
      styles={{ body: { padding: 16 } }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </Typography.Text>
      {loading ? (
        <Skeleton active paragraph={{ rows: 1, width: '60%' }} title={false} />
      ) : (
        <>
          <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.2, marginTop: 6 }}>{value}</div>
          {hint != null ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {hint}
            </Typography.Text>
          ) : null}
        </>
      )}
    </Card>
  )

  if (tooltip) {
    return <Tooltip title={tooltip}>{card}</Tooltip>
  }
  return card
}

export default CustomerKpiCard
