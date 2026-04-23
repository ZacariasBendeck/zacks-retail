import { Breadcrumb, Button, Space, Tooltip, Typography } from 'antd'
import { FullscreenOutlined } from '@ant-design/icons'
import type { BreadcrumbProps } from 'antd'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

const { Title, Paragraph, Text } = Typography

export type BreadcrumbItems = BreadcrumbProps['items']

interface Props {
  title: string
  description?: ReactNode
  // RICS source citation shown as a subtle tag next to the description
  // (e.g. "RICS Ch. 6 p. 93"). Rendered only when provided.
  citation?: string
  breadcrumb?: BreadcrumbItems
  // Shown right-aligned in the title row (e.g. date-range summary, "5 rows").
  // Keeps the secondary context visible without consuming a second line.
  rightMeta?: ReactNode
  // Actions shown to the far right of the title row (e.g. Save / Export).
  actions?: ReactNode
  // Every page has to disclose the currency once per the Lempira policy in
  // CLAUDE.md. Defaults to true; pages that already render the line elsewhere
  // can pass false.
  showCurrencyNote?: boolean
  // Full-screen toggle button ships next to `actions`. AppLayout honors the
  // `?fullscreen=1` query param and drops the sidebar + header chrome. Pages
  // that want to hide the toggle (e.g. pages already embedded in a fullscreen
  // shell) can pass false.
  enableFullscreen?: boolean
}

/**
 * Standard chrome for every report page: breadcrumb, title, description,
 * optional right-side metadata + action slot, and the one-and-only "Amounts
 * in Lempira (HNL)" disclosure footnote. Pages provide their own filter Card
 * and result area beneath; this component only owns the top strip.
 */
export default function ReportHeader({
  title,
  description,
  citation,
  breadcrumb,
  rightMeta,
  actions,
  showCurrencyNote = true,
  enableFullscreen = true,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const isFullscreen = searchParams.get('fullscreen') === '1'

  // Fullscreen button preserves every other query param, so pivot variants,
  // date ranges, store filters, etc. carry across the toggle. When already
  // fullscreen the button disappears — the floating exit pill in AppLayout
  // owns the opposite direction.
  const fullscreenButton = enableFullscreen && !isFullscreen ? (
    <Tooltip title="Expand to full screen">
      <Button
        icon={<FullscreenOutlined />}
        onClick={() => {
          const next = new URLSearchParams(searchParams)
          next.set('fullscreen', '1')
          setSearchParams(next, { replace: false })
        }}
      >
        Full screen
      </Button>
    </Tooltip>
  ) : null

  return (
    <div style={{ marginBottom: 16 }}>
      {breadcrumb && breadcrumb.length > 0 ? (
        <Breadcrumb style={{ marginBottom: 12 }} items={breadcrumb} />
      ) : null}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <Title level={2} style={{ margin: 0 }}>
            {title}
          </Title>
          {description || citation ? (
            <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
              {description}
              {description && citation ? ' ' : null}
              {citation ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ({citation})
                </Text>
              ) : null}
            </Paragraph>
          ) : null}
          {showCurrencyNote ? (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              Amounts in Lempira (HNL)
            </Text>
          ) : null}
        </div>
        {(rightMeta || actions || fullscreenButton) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexShrink: 0,
            }}
          >
            {rightMeta ? (
              <div style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: 13 }}>{rightMeta}</div>
            ) : null}
            {actions && fullscreenButton ? (
              <Space>{actions}{fullscreenButton}</Space>
            ) : (
              actions ?? fullscreenButton
            )}
          </div>
        )}
      </div>
    </div>
  )
}
