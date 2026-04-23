import { Button, Card, Space } from 'antd'
import { EditOutlined, PlayCircleOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'

interface Props {
  // Parent owns open state so it can auto-collapse via a useEffect keyed on
  // its data-fetching lifecycle (typically: close when data arrives).
  open: boolean
  onOpenChange: (next: boolean) => void
  // True while the API is in flight. Drives the Re-run button's loading
  // state when collapsed.
  running: boolean
  // The filter form body, rendered only while open.
  children: ReactNode
  // Action row rendered at the bottom of the open panel — typically
  // <RunReportControls /> + <SaveAsTemplateButton /> + export buttons.
  actions: ReactNode
  // Triggered by the compact Re-run button while collapsed. Parents typically
  // wire this to the same onRun used by RunReportControls so the same
  // validation logic applies.
  onRun: () => void
  // Disable the compact Re-run button when the form isn't runnable (e.g.
  // required fields missing).
  canRun?: boolean
}

/**
 * Outer filter shell for every report page. While `open` is true it looks
 * like a normal Card with the filter form + action row. While collapsed it
 * shrinks to a single-line toolbar: [Modify filters] [Re-run]. The
 * FilterChips rendered below the card become the scope summary while
 * collapsed, so the operator never loses sight of what's running.
 *
 * Pages are expected to auto-collapse after a successful run via a
 * useEffect — see SalesAnalysisPage for the canonical wiring.
 */
export default function CollapsibleFilterCard({
  open,
  onOpenChange,
  running,
  children,
  actions,
  onRun,
  canRun = true,
}: Props) {
  if (!open) {
    return (
      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: 12 } }}>
        <Space>
          <Button icon={<EditOutlined />} onClick={() => onOpenChange(true)}>
            Modify filters
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={running}
            disabled={!canRun}
            onClick={onRun}
          >
            Re-run
          </Button>
        </Space>
      </Card>
    )
  }
  return (
    <Card style={{ marginBottom: 16 }}>
      {children}
      <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
        {actions}
      </div>
    </Card>
  )
}
