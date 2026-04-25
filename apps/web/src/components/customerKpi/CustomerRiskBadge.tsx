import { Tag } from 'antd'
import type { ChurnRisk } from '../../types/customerKpi'

const RISK_COLOR: Record<ChurnRisk, string> = {
  LOW: 'green',
  MEDIUM: 'orange',
  HIGH: 'red',
}

const RISK_LABEL: Record<ChurnRisk, string> = {
  LOW: 'Low Risk',
  MEDIUM: 'Medium Risk',
  HIGH: 'High Risk',
}

interface Props {
  risk: ChurnRisk | null | undefined
  short?: boolean
}

export function CustomerRiskBadge({ risk, short }: Props) {
  if (!risk) return <Tag color="default">UNKNOWN</Tag>
  return <Tag color={RISK_COLOR[risk]}>{short ? risk : RISK_LABEL[risk]}</Tag>
}

export default CustomerRiskBadge
