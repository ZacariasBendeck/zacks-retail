import { Space, Tooltip } from 'antd'

interface Props {
  rScore: number | null | undefined
  fScore: number | null | undefined
  mScore: number | null | undefined
  size?: 'sm' | 'md'
}

function colorFor(score: number | null | undefined): string {
  if (score == null) return '#d9d9d9'
  if (score >= 5) return '#52c41a'
  if (score >= 4) return '#73d13d'
  if (score >= 3) return '#faad14'
  if (score >= 2) return '#fa8c16'
  return '#f5222d'
}

function Pill({ letter, score, size }: { letter: string; score: number | null | undefined; size: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 22 : 28
  const fontSize = size === 'sm' ? 11 : 12
  return (
    <Tooltip title={`${letter} score: ${score ?? '—'}`}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: dim,
          height: dim,
          borderRadius: 6,
          background: colorFor(score),
          color: '#fff',
          fontSize,
          fontWeight: 600,
          letterSpacing: 0.5,
        }}
      >
        {letter}
        {score ?? '?'}
      </span>
    </Tooltip>
  )
}

export function RfmScoreBadge({ rScore, fScore, mScore, size = 'md' }: Props) {
  return (
    <Space size={4}>
      <Pill letter="R" score={rScore} size={size} />
      <Pill letter="F" score={fScore} size={size} />
      <Pill letter="M" score={mScore} size={size} />
    </Space>
  )
}

export default RfmScoreBadge
