import { Breadcrumb, Typography } from 'antd'
import type { BreadcrumbProps } from 'antd'
import type { ReactNode } from 'react'

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
  // Retained for backward compatibility with call sites that still pass it —
  // the old full-screen toggle was removed (it was unreliable), so the flag
  // is now a no-op. Safe to drop from callers.
  enableFullscreen?: boolean
  // Compact report-builder screens can opt into tighter vertical chrome.
  compact?: boolean
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
  compact = false,
}: Props) {
  return (
    <div style={{ marginBottom: compact ? 8 : 16 }}>
      {breadcrumb && breadcrumb.length > 0 ? (
        <Breadcrumb style={{ marginBottom: compact ? 4 : 12, fontSize: compact ? 12 : undefined }} items={breadcrumb} />
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
          <Title level={compact ? 3 : 2} style={{ margin: 0 }}>
            {title}
          </Title>
          {description || citation ? (
            <Paragraph type="secondary" style={{ marginTop: compact ? 2 : 4, marginBottom: 0, fontSize: compact ? 12 : undefined }}>
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
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: compact ? 1 : 4 }}>
              Amounts in Lempira (HNL)
            </Text>
          ) : null}
        </div>
        {(rightMeta || actions) && (
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
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
