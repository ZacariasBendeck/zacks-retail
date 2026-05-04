import { DownOutlined } from '@ant-design/icons'
import { Button, Collapse, Popover } from 'antd'
import { PageHelpContent } from './PageHelpContent'
import type { PageHelpEntry } from './types'

export function InlinePageHelp({
  entry,
  mode = 'collapse',
}: {
  entry: PageHelpEntry
  mode?: 'collapse' | 'popover'
}) {
  if (mode === 'popover') {
    return (
      <Popover
        trigger="click"
        placement="bottomRight"
        title="Ayuda de esta página"
        content={
          <div style={{ maxWidth: 520 }}>
            <PageHelpContent entry={entry} compact />
          </div>
        }
      >
        <Button size="small" icon={<DownOutlined />} iconPosition="end">
          Ayuda de esta página
        </Button>
      </Popover>
    )
  }

  return (
    <Collapse
      size="small"
      items={[
        {
          key: entry.id,
          label: 'Ayuda de esta página',
          children: <PageHelpContent entry={entry} compact />,
        },
      ]}
    />
  )
}
