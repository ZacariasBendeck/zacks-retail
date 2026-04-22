import { Empty, Typography } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'

const { Text } = Typography

export type EmptyReason =
  // The operator has not yet run the report. Most common case.
  | 'idle'
  // Report ran but returned zero rows against the current filters.
  | 'no-results'
  // Required filter is unset (e.g. store number).
  | 'missing-required'
  // Custom message provided via `message` prop.
  | 'custom'

interface Props {
  reason: EmptyReason
  // Primary headline. Defaults depend on `reason`.
  message?: ReactNode
  // Secondary hint — "Try widening the date range", etc.
  hint?: ReactNode
  // Optional action slot (e.g. a Button to reset filters).
  action?: ReactNode
}

const DEFAULTS: Record<EmptyReason, { message: string; hint: string }> = {
  idle: {
    message: 'Set filters and press Run',
    hint: 'Results appear here once the report runs.',
  },
  'no-results': {
    message: 'No rows match these filters',
    hint: 'Try widening the date range or removing a criterion.',
  },
  'missing-required': {
    message: 'A required filter is missing',
    hint: 'Fill in the highlighted field and press Run.',
  },
  custom: {
    message: '',
    hint: '',
  },
}

/**
 * One look for every "nothing to show here" state on a report page. Pages
 * pass a `reason` and optionally override the message and hint. Keeps empty
 * states visually distinct from loading (which is owned by the parent's
 * Spin / isFetching handling).
 */
export default function ReportEmptyState({ reason, message, hint, action }: Props) {
  const d = DEFAULTS[reason]
  const title = message ?? d.message
  const sub = hint ?? d.hint
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 16px',
        textAlign: 'center',
      }}
    >
      <Empty
        image={<InboxOutlined style={{ fontSize: 48, color: 'rgba(0, 0, 0, 0.25)' }} />}
        styles={{ image: { height: 56 } }}
        description={
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{title}</div>
            {sub ? (
              <Text type="secondary" style={{ fontSize: 13 }}>
                {sub}
              </Text>
            ) : null}
          </div>
        }
      >
        {action}
      </Empty>
    </div>
  )
}
