import type { ReactNode } from 'react'
import { ArrowRightOutlined } from '@ant-design/icons'
import { Button, Card, Col, Empty, InputNumber, Row, Space, Typography } from 'antd'

const heroGradient = 'linear-gradient(135deg, #102a43 0%, #0b3a53 50%, #0f766e 100%)'
const softPanel = 'linear-gradient(180deg, #fffdf7 0%, #f7fafc 100%)'

export const STOCK_MAINTENANCE_LAST_STORE_KEY = 'stock-maintenance:last-store'
export const STOCK_MAINTENANCE_LAST_TAB_KEY = 'stock-maintenance:last-tab'

export function readPersistedNumber(key: string): number | undefined {
  if (typeof window === 'undefined') return undefined
  const raw = window.localStorage.getItem(key)
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

export function persistNumber(key: string, value: number | undefined): void {
  if (typeof window === 'undefined') return
  if (value == null) {
    window.localStorage.removeItem(key)
    return
  }
  window.localStorage.setItem(key, String(value))
}

export function readPersistedString(key: string): string | undefined {
  if (typeof window === 'undefined') return undefined
  const raw = window.localStorage.getItem(key)
  return raw?.trim() || undefined
}

export function persistString(key: string, value: string | undefined): void {
  if (typeof window === 'undefined') return
  if (!value) {
    window.localStorage.removeItem(key)
    return
  }
  window.localStorage.setItem(key, value)
}

export function stockCellKey(rowLabel: string, columnLabel: string): string {
  return `${rowLabel}::${columnLabel}`
}

interface HeroMetric {
  label: string
  value: ReactNode
}

interface StockMaintenanceHeroProps {
  eyebrow?: string
  title: string
  subtitle: ReactNode
  ricsReference?: string
  metrics?: HeroMetric[]
  actions?: ReactNode
  footer?: ReactNode
}

export function StockMaintenanceHero({
  eyebrow,
  title,
  subtitle,
  ricsReference,
  metrics = [],
  actions,
  footer,
}: StockMaintenanceHeroProps) {
  return (
    <Card
      bordered={false}
      style={{
        overflow: 'hidden',
        borderRadius: 24,
        background: heroGradient,
        boxShadow: '0 22px 60px rgba(16, 42, 67, 0.22)',
      }}
    >
      <div style={{ color: '#f8fafc' }}>
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} xl={actions ? 15 : 24}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {eyebrow ? (
                <Typography.Text
                  style={{
                    color: 'rgba(248, 250, 252, 0.72)',
                    fontSize: 12,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                  }}
                >
                  {eyebrow}
                </Typography.Text>
              ) : null}
              <Space align="center" wrap>
                <Typography.Title level={2} style={{ margin: 0, color: '#fff' }}>
                  {title}
                </Typography.Title>
                {ricsReference ? (
                  <span
                    style={{
                      padding: '6px 12px',
                      borderRadius: 999,
                      border: '1px solid rgba(248, 250, 252, 0.22)',
                      background: 'rgba(248, 250, 252, 0.08)',
                      color: 'rgba(248, 250, 252, 0.86)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {ricsReference}
                  </span>
                ) : null}
              </Space>
              <Typography.Paragraph
                style={{
                  margin: 0,
                  maxWidth: 760,
                  color: 'rgba(248, 250, 252, 0.86)',
                  fontSize: 15,
                  lineHeight: 1.7,
                }}
              >
                {subtitle}
              </Typography.Paragraph>
            </Space>
          </Col>

          {actions ? (
            <Col xs={24} xl={9}>
              <div
                style={{
                  borderRadius: 20,
                  background: 'rgba(248, 250, 252, 0.08)',
                  border: '1px solid rgba(248, 250, 252, 0.12)',
                  padding: 18,
                }}
              >
                {actions}
              </div>
            </Col>
          ) : null}
        </Row>

        {metrics.length > 0 ? (
          <Row gutter={[12, 12]} style={{ marginTop: 20 }}>
            {metrics.map((metric) => (
              <Col key={metric.label} xs={12} md={8} xl={6}>
                <div
                  style={{
                    borderRadius: 18,
                    background: 'rgba(248, 250, 252, 0.08)',
                    border: '1px solid rgba(248, 250, 252, 0.12)',
                    padding: '14px 16px',
                    minHeight: 82,
                  }}
                >
                  <Typography.Text style={{ color: 'rgba(248, 250, 252, 0.72)', fontSize: 12 }}>
                    {metric.label}
                  </Typography.Text>
                  <div style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginTop: 6 }}>
                    {metric.value}
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        ) : null}

        {footer ? (
          <div
            style={{
              marginTop: 18,
              paddingTop: 16,
              borderTop: '1px solid rgba(248, 250, 252, 0.14)',
              color: 'rgba(248, 250, 252, 0.8)',
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </Card>
  )
}

export interface StockMaintenanceActionTile {
  key: string
  title: string
  description: string
  icon: ReactNode
  accent?: string
  badge?: string
  actionLabel?: string
  onClick: () => void
}

export function StockMaintenanceActionGrid({ items }: { items: StockMaintenanceActionTile[] }) {
  return (
    <Row gutter={[16, 16]}>
      {items.map((item) => (
        <Col key={item.key} xs={24} md={12} xl={8}>
          <Card
            bordered={false}
            style={{
              height: '100%',
              borderRadius: 20,
              background: softPanel,
              boxShadow: '0 12px 34px rgba(15, 23, 42, 0.08)',
            }}
          >
            <Space direction="vertical" size={14} style={{ width: '100%', height: '100%' }}>
              <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    background: item.accent ?? 'linear-gradient(135deg, #0f766e 0%, #164e63 100%)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                    boxShadow: '0 10px 24px rgba(15, 118, 110, 0.24)',
                  }}
                >
                  {item.icon}
                </div>
                {item.badge ? (
                  <span
                    style={{
                      padding: '5px 10px',
                      borderRadius: 999,
                      background: '#fff7ed',
                      color: '#9a3412',
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </Space>

              <div>
                <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 6 }}>
                  {item.title}
                </Typography.Title>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0, minHeight: 66 }}>
                  {item.description}
                </Typography.Paragraph>
              </div>

              <div style={{ marginTop: 'auto' }}>
                <Button type="link" style={{ paddingInline: 0, fontWeight: 600 }} onClick={item.onClick}>
                  {item.actionLabel ?? 'Open'}
                  <ArrowRightOutlined />
                </Button>
              </div>
            </Space>
          </Card>
        </Col>
      ))}
    </Row>
  )
}

interface StockMaintenanceCellMatrixProps {
  mode: 'receipt' | 'return'
  columns: string[]
  rows: string[]
  values: Record<string, number>
  onHandByCell: Map<string, number>
  onChange: (rowLabel: string, columnLabel: string, nextValue: number | null) => void
}

export function StockMaintenanceCellMatrix({
  mode,
  columns,
  rows,
  values,
  onHandByCell,
  onChange,
}: StockMaintenanceCellMatrixProps) {
  const effectiveColumns = columns.length > 0 ? columns : ['']
  const effectiveRows = rows.length > 0 ? rows : ['']

  if (effectiveColumns.length === 0 || effectiveRows.length === 0) {
    return <Empty description="No size grid is available for this SKU." />
  }

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <table
        style={{
          width: '100%',
          minWidth: Math.max(720, 170 + effectiveColumns.length * 180),
          borderCollapse: 'separate',
          borderSpacing: '0 12px',
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                textAlign: 'left',
                padding: '0 12px 6px 4px',
                color: '#64748b',
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Row
            </th>
            {effectiveColumns.map((columnLabel) => (
              <th
                key={columnLabel || '__blank'}
                style={{
                  textAlign: 'left',
                  padding: '0 8px 6px',
                  color: '#64748b',
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {columnLabel || 'Qty'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {effectiveRows.map((rowLabel) => (
            <tr key={rowLabel || '__blank'}>
              <td style={{ padding: '0 12px 0 4px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                <div style={{ paddingTop: 16, fontWeight: 700, color: '#0f172a' }}>
                  {rowLabel || 'Qty'}
                </div>
              </td>
              {effectiveColumns.map((columnLabel) => {
                const key = stockCellKey(rowLabel, columnLabel)
                const onHand = onHandByCell.get(key) ?? 0
                const value = values[key] ?? 0
                const projected = mode === 'receipt' ? onHand + value : Math.max(0, onHand - value)
                return (
                  <td key={key} style={{ padding: '0 8px', verticalAlign: 'top' }}>
                    <div
                      style={{
                        borderRadius: 18,
                        border: `1px solid ${mode === 'receipt' ? 'rgba(14, 116, 144, 0.18)' : 'rgba(190, 24, 93, 0.18)'}`,
                        background:
                          mode === 'receipt'
                            ? 'linear-gradient(180deg, #f8fafc 0%, #eff6ff 100%)'
                            : 'linear-gradient(180deg, #fff7ed 0%, #fff1f2 100%)',
                        padding: 14,
                        minHeight: 142,
                        boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
                      }}
                    >
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          On hand {onHand}
                        </Typography.Text>
                        <InputNumber
                          min={0}
                          max={mode === 'return' ? onHand : undefined}
                          precision={0}
                          step={1}
                          value={value || undefined}
                          onChange={(nextValue) =>
                            onChange(rowLabel, columnLabel, typeof nextValue === 'number' ? nextValue : null)
                          }
                          style={{ width: '100%' }}
                        />
                        <div
                          style={{
                            marginTop: 'auto',
                            padding: '10px 12px',
                            borderRadius: 14,
                            background: mode === 'receipt' ? '#ecfeff' : '#fff1f2',
                          }}
                        >
                          <Typography.Text
                            style={{
                              display: 'block',
                              color: '#64748b',
                              fontSize: 11,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                            }}
                          >
                            {mode === 'receipt' ? 'Projected on hand' : 'Projected remaining'}
                          </Typography.Text>
                          <Typography.Text
                            style={{
                              fontSize: 20,
                              fontWeight: 700,
                              color: mode === 'receipt' ? '#0f766e' : '#b42318',
                            }}
                          >
                            {projected}
                          </Typography.Text>
                        </div>
                      </Space>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
