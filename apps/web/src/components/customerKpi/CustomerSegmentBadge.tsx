import { Tag } from 'antd'
import type { CustomerKpiSegment } from '../../types/customerKpi'

const SEGMENT_COLOR: Record<CustomerKpiSegment, string> = {
  vip: 'purple',
  loyal: 'blue',
  at_risk: 'orange',
  dormant: 'default',
  promo_sensitive: 'gold',
  omnichannel: 'cyan',
  new: 'geekblue',
  lost: 'default',
  other: 'default',
}

const SEGMENT_LABEL: Record<CustomerKpiSegment, string> = {
  vip: 'VIP',
  loyal: 'Loyal',
  at_risk: 'At Risk',
  dormant: 'Dormant',
  promo_sensitive: 'Promo Sensitive',
  omnichannel: 'Omnichannel',
  new: 'New',
  lost: 'Lost',
  other: 'Other',
}

interface Props {
  segment: CustomerKpiSegment | null | undefined
}

export function CustomerSegmentBadge({ segment }: Props) {
  if (!segment) return null
  return <Tag color={SEGMENT_COLOR[segment]}>{SEGMENT_LABEL[segment]}</Tag>
}

export const SEGMENT_LABELS = SEGMENT_LABEL
export const SEGMENT_COLORS = SEGMENT_COLOR

export default CustomerSegmentBadge
