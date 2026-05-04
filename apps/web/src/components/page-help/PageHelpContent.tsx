import { Button, Collapse, Divider, Space, Typography } from 'antd'
import { BookOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import type { PageHelpEntry, PageHelpLink } from './types'

function ManualLinks({ links, onNavigate }: { links: PageHelpLink[]; onNavigate?: () => void }) {
  if (links.length === 0) return null

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      {links.map((link) => (
        <Link key={`${link.label}:${link.to}`} to={link.to} onClick={onNavigate}>
          <Button icon={<BookOutlined />} block>
            {link.label}
          </Button>
        </Link>
      ))}
    </Space>
  )
}

export function PageHelpContent({
  entry,
  compact = false,
  onNavigate,
}: {
  entry: PageHelpEntry
  compact?: boolean
  onNavigate?: () => void
}) {
  return (
    <Space direction="vertical" size={compact ? 12 : 16} style={{ width: '100%' }}>
      <div>
        <Typography.Text type="secondary">{entry.module}</Typography.Text>
        <Typography.Title level={compact ? 5 : 4} style={{ marginTop: 4, marginBottom: 0 }}>
          {entry.title}
        </Typography.Title>
      </div>

      <div>
        <Typography.Text strong>Proceso</Typography.Text>
        <ol style={{ marginTop: 8, paddingLeft: 20 }}>
          {entry.processSteps.map((step) => (
            <li key={step} style={{ marginBottom: 6 }}>
              <Typography.Text>{step}</Typography.Text>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <Typography.Text strong>Filosofía de diseño</Typography.Text>
        <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
          {entry.philosophy}
        </Typography.Paragraph>
      </div>

      {entry.tabNotes && entry.tabNotes.length > 0 ? (
        <Collapse
          size="small"
          ghost={compact}
          items={entry.tabNotes.map((tab) => ({
            key: tab.key,
            label: tab.label,
            children: (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {tab.processSteps && tab.processSteps.length > 0 ? (
                  <div>
                    <Typography.Text strong>Proceso del tab</Typography.Text>
                    <ol style={{ marginTop: 8, paddingLeft: 20 }}>
                      {tab.processSteps.map((step) => (
                        <li key={step} style={{ marginBottom: 6 }}>
                          <Typography.Text>{step}</Typography.Text>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
                {tab.philosophy ? (
                  <Typography.Paragraph style={{ marginBottom: 0 }}>
                    {tab.philosophy}
                  </Typography.Paragraph>
                ) : null}
                {tab.manualLinks ? <ManualLinks links={tab.manualLinks} onNavigate={onNavigate} /> : null}
              </Space>
            ),
          }))}
        />
      ) : null}

      <Divider style={{ margin: compact ? '4px 0' : '8px 0' }} />

      <div>
        <Typography.Text strong>Manual</Typography.Text>
        <div style={{ marginTop: 8 }}>
          <ManualLinks links={entry.manualLinks} onNavigate={onNavigate} />
        </div>
      </div>
    </Space>
  )
}
