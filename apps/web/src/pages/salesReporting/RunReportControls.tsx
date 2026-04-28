import { Button, Space } from 'antd'
import { PlayCircleOutlined, StopOutlined } from '@ant-design/icons'

interface Props {
  running: boolean
  hasRun: boolean
  onRun: () => void
  onStop: () => void
  runLabel?: string
  disabled?: boolean
}

/**
 * Shared "Run Report" + "Stop" pair for every sales-reporting page.
 *
 * - `onRun` commits the current form state into the committed query args and
 *   triggers TanStack Query to fetch.
 * - `onStop` calls `queryClient.cancelQueries({ queryKey })` — the in-flight
 *   `fetch` is aborted via AbortSignal, and any rendered loading spinner
 *   resolves to the last successful result (if any).
 * - Stop is disabled when no query is running; Run shows a loading spinner
 *   while fetching.
 */
export default function RunReportControls({
  running,
  hasRun,
  onRun,
  onStop,
  runLabel = 'Run Report',
  disabled = false,
}: Props) {
  return (
    <Space>
      <Button
        type="primary"
        icon={<PlayCircleOutlined />}
        loading={running}
        disabled={disabled}
        onClick={onRun}
        size="large"
      >
        {hasRun && !running ? 'Re-run' : runLabel}
      </Button>
      <Button
        danger
        icon={<StopOutlined />}
        disabled={!running}
        onClick={onStop}
        size="large"
      >
        Stop
      </Button>
    </Space>
  )
}
