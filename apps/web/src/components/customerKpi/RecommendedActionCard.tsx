import { Card, Typography } from 'antd'
import { CheckCircleOutlined, InfoCircleOutlined, WarningOutlined } from '@ant-design/icons'
import type { RecommendedAction } from '../../types/customerKpi'

const TONE_BG: Record<RecommendedAction['tone'], string> = {
  positive: '#f6ffed',
  warning: '#fffbe6',
  neutral: '#f5f5f5',
}

const TONE_BORDER: Record<RecommendedAction['tone'], string> = {
  positive: '#b7eb8f',
  warning: '#ffe58f',
  neutral: '#d9d9d9',
}

const TONE_ICON: Record<RecommendedAction['tone'], JSX.Element> = {
  positive: <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />,
  warning: <WarningOutlined style={{ color: '#fa8c16', fontSize: 20 }} />,
  neutral: <InfoCircleOutlined style={{ color: '#1677ff', fontSize: 20 }} />,
}

interface Props {
  action: RecommendedAction
}

export function RecommendedActionCard({ action }: Props) {
  return (
    <Card
      size="small"
      style={{
        background: TONE_BG[action.tone],
        border: `1px solid ${TONE_BORDER[action.tone]}`,
        borderRadius: 12,
      }}
      styles={{ body: { padding: 16 } }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ marginTop: 2 }}>{TONE_ICON[action.tone]}</div>
        <div style={{ flex: 1 }}>
          <Typography.Text strong style={{ fontSize: 14 }}>
            {action.title}
          </Typography.Text>
          <Typography.Paragraph style={{ marginBottom: 0, marginTop: 4 }}>
            {action.message}
          </Typography.Paragraph>
        </div>
      </div>
    </Card>
  )
}

export default RecommendedActionCard
