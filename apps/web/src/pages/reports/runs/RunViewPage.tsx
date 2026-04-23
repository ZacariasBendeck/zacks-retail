import { useMemo } from 'react'
import {
  Alert, App, Breadcrumb, Button, Card, Descriptions, Empty, Popconfirm, Space, Spin, Tag, Typography,
} from 'antd'
import { CameraOutlined, DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDeleteReportRun, useReportRun } from '../../../hooks/useReportRuns'
import type { ReportType } from '../../../services/reportRunsApi'
import { getErrorMessage } from '../../../utils/errors'
import RenderSalesAnalysis from '../../../components/reports/renderers/renderSalesAnalysis'
import RenderBestSellers from '../../../components/reports/renderers/renderBestSellers'
import RenderSalesHierarchyDrillDown from '../../../components/reports/renderers/renderSalesHierarchyDrillDown'
import type { SalesAnalysisReport, SalesHierarchyReport } from '../../../services/reportApi'

const { Title, Paragraph, Text } = Typography

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  'sales-analysis': 'Sales Analysis',
  'sales-hierarchy-drill-down': 'Sales Hierarchy Drill-Down',
  'best-sellers': 'Best Sellers',
  'stock-status': 'Stock Status',
  'sales-by-day': 'Sales by Day',
  'sales-by-time': 'Sales by Time',
  'salesperson-summary': 'Salesperson Summary',
  'sales-history-by-month': 'Sales History by Month',
}

// Where each report's builder lives. Used by the "Open in builder" fallback
// for snapshot types that don't have a dedicated renderer yet (Phase 1.2
// adds the rest).
const REPORT_TYPE_PATHS: Record<ReportType, string> = {
  'sales-analysis': '/reports/sales/analysis',
  'sales-hierarchy-drill-down': '/reports/sales/hierarchy-drill-down',
  'best-sellers': '/reports/sales/best-sellers',
  'stock-status': '/reports/sales/stock-status',
  'sales-by-day': '/reports/others/sales-by-day',
  'sales-by-time': '/reports/others/sales-by-time',
  'salesperson-summary': '/reports/others/salesperson-summary',
  'sales-history-by-month': '/reports/sales/history-by-month',
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

// Dispatch on reportType. Renderers are intentionally tiny & dumb — they
// receive the frozen resultJson and render a read-only view. When a type
// has no dedicated renderer we show the envelope + a builder-link fallback.
function RendererFor(props: { reportType: ReportType; result: unknown }): JSX.Element {
  const { reportType, result } = props
  switch (reportType) {
    case 'sales-analysis':
      return <RenderSalesAnalysis result={result as SalesAnalysisReport} />
    case 'sales-hierarchy-drill-down':
      return <RenderSalesHierarchyDrillDown result={result as SalesHierarchyReport} />
    case 'best-sellers':
      // Cast through `any` — the renderer owns its own shape assertion and
      // we don't want to couple this file to the Best Sellers row type.
      return <RenderBestSellers result={result as any} />
    default:
      return <SnapshotFallback reportType={reportType} />
  }
}

function SnapshotFallback({ reportType }: { reportType: ReportType }): JSX.Element {
  return (
    <Card>
      <Empty
        description={
          <Space direction="vertical" align="center">
            <Text>
              Frozen-view rendering for <strong>{REPORT_TYPE_LABELS[reportType] ?? reportType}</strong>
              {' '}is not implemented yet.
            </Text>
            <Text type="secondary">
              The snapshot's filters are preserved — open the builder to re-run against live data.
            </Text>
            <Link to={REPORT_TYPE_PATHS[reportType] ?? '/reports'}>
              <Button icon={<PlayCircleOutlined />} type="primary">
                Open in builder
              </Button>
            </Link>
          </Space>
        }
      />
    </Card>
  )
}

export default function RunViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { data, isLoading, error } = useReportRun(id)
  const del = useDeleteReportRun()

  // Stable view of paramsJson as key-value pairs for the "Filters at
  // capture time" card. Objects render as JSON, primitives as-is.
  const paramPairs = useMemo(() => {
    const p = data?.run.paramsJson
    if (!p || typeof p !== 'object') return []
    return Object.entries(p).filter(([, v]) => v != null && v !== '')
  }, [data])

  const onDelete = async (): Promise<void> => {
    if (!data) return
    try {
      await del.mutateAsync(data.run.id)
      message.success('Snapshot deleted')
      navigate('/reports/runs')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert
        type="error"
        message="Failed to load snapshot"
        description={getErrorMessage(error)}
        style={{ marginBottom: 16 }}
      />
    )
  }

  if (!data) return null
  const r = data.run
  const reportType = r.reportType as ReportType
  const reportLabel = REPORT_TYPE_LABELS[reportType] ?? reportType
  const builderPath = REPORT_TYPE_PATHS[reportType] ?? '/reports'

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/reports">Reports</Link> },
          { title: <Link to="/reports/runs">Snapshots</Link> },
          { title: r.title ?? 'Snapshot' },
        ]}
      />

      <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 12 }}>
        <Space align="baseline" wrap>
          <Title level={2} style={{ margin: 0 }}>
            {r.title ?? <Text type="secondary">(untitled snapshot)</Text>}
          </Title>
          <Tag icon={<CameraOutlined />} color="purple">Frozen snapshot</Tag>
          {r.visibility === 'shared'
            ? <Tag color="blue">Visible to all signed-in users</Tag>
            : <Tag>Private</Tag>}
        </Space>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          {reportLabel} · captured {formatDate(r.createdAt)} by {r.userDisplayName}
        </Paragraph>
      </Space>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="Rows">{r.rowCount.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="Size">{formatBytes(r.resultSizeBytes)}</Descriptions.Item>
          <Descriptions.Item label="Schema version">{r.reportTypeVersion}</Descriptions.Item>
          {r.sourceTemplateId ? (
            <Descriptions.Item label="From template">
              <Link to={`${builderPath}?templateId=${encodeURIComponent(r.sourceTemplateId)}`}>
                Open source template
              </Link>
            </Descriptions.Item>
          ) : null}
        </Descriptions>
        <Space style={{ marginTop: 12 }} wrap>
          <Link to={builderPath}>
            <Button icon={<PlayCircleOutlined />}>Open builder (live data)</Button>
          </Link>
          <Popconfirm
            title="Delete this snapshot?"
            description="This can't be undone."
            onConfirm={onDelete}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button icon={<DeleteOutlined />} danger>Delete</Button>
          </Popconfirm>
        </Space>
      </Card>

      {paramPairs.length > 0 && (
        <Card size="small" title="Filters at capture time" style={{ marginBottom: 16 }}>
          <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
            {paramPairs.map(([k, v]) => (
              <Descriptions.Item key={k} label={k}>
                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </Descriptions.Item>
            ))}
          </Descriptions>
        </Card>
      )}

      <RendererFor reportType={reportType} result={r.resultJson} />
    </div>
  )
}
