import { useState } from 'react'
import {
  Alert, App, Breadcrumb, Button, Card, Empty, Popconfirm, Segmented, Select, Space, Spin,
  Table, Tag, Typography,
} from 'antd'
import { DeleteOutlined, EyeOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import {
  useDeleteReportRun,
  useReportRunsList,
} from '../../../hooks/useReportRuns'
import type {
  ReportType,
  RunListScope,
  RunSummary,
} from '../../../services/reportRunsApi'
import { getErrorMessage } from '../../../utils/errors'

const { Title, Paragraph, Text } = Typography

// Friendly labels for the list. Must stay in sync with REPORT_TYPES in
// reportTemplatesApi.ts — a missing key falls back to the raw kebab-case id.
const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  'sales-analysis': 'Sales Analysis',
  'sales-hierarchy-drill-down': 'Sales Hierarchy Drill-Down',
  'sales-pivot': 'Sales Pivot',
  'best-sellers': 'Best Sellers',
  'stock-status': 'Stock Status',
  'sales-by-day': 'Sales by Day',
  'sales-by-time': 'Sales by Time',
  'salesperson-summary': 'Salesperson Summary',
  'sales-history-by-month': 'Sales History by Month',
  'balancing-transfer': 'Balancing Transfer',
}

function VisibilityTag({ v }: { v: string }): JSX.Element {
  if (v === 'shared') return <Tag color="blue">Visible to all signed-in users</Tag>
  return <Tag>Private</Tag>
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

// Compact byte formatting for the Size column. Snapshots can range from a
// few KB (Sales by Day for one week) to multi-MB (wide SKU_DETAIL runs),
// so we pick the unit per-row.
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export default function RunsListPage() {
  const { message } = App.useApp()
  const [scope, setScope] = useState<RunListScope>('mine')
  const [reportType, setReportType] = useState<ReportType | undefined>(undefined)

  const { data, isLoading, error } = useReportRunsList(scope, { reportType })
  const del = useDeleteReportRun()

  const deleteRun = async (id: string, title: string | null): Promise<void> => {
    try {
      await del.mutateAsync(id)
      message.success(`Snapshot "${title ?? id.slice(0, 8)}" deleted`)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const columns = [
    {
      title: 'Report', dataIndex: 'reportType', key: 'reportType', width: 200,
      render: (rt: ReportType) => REPORT_TYPE_LABELS[rt] ?? rt,
    },
    {
      title: 'Title', dataIndex: 'title', key: 'title', width: 260,
      render: (v: string | null) => v ?? <Text type="secondary">(untitled)</Text>,
    },
    { title: 'Owner', dataIndex: 'userDisplayName', key: 'owner', width: 160 },
    {
      title: 'Visibility', dataIndex: 'visibility', key: 'visibility', width: 220,
      render: (v: string) => <VisibilityTag v={v} />,
    },
    {
      title: 'Rows', dataIndex: 'rowCount', key: 'rowCount', width: 90,
      align: 'right' as const,
      render: (n: number) => n.toLocaleString(),
    },
    {
      title: 'Size', dataIndex: 'resultSizeBytes', key: 'size', width: 100,
      align: 'right' as const,
      render: formatBytes,
    },
    {
      title: 'Captured', dataIndex: 'createdAt', key: 'createdAt', width: 170,
      render: formatDate,
    },
    {
      title: 'Actions', key: 'actions', width: 180,
      render: (_: unknown, r: RunSummary) => (
        <Space>
          <Link to={`/reports/runs/${r.id}`}>
            <Button icon={<EyeOutlined />} type="primary">
              View
            </Button>
          </Link>
          <Popconfirm
            title="Delete this snapshot?"
            description="This can't be undone. The frozen result is gone."
            onConfirm={() => deleteRun(r.id, r.title)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[{ title: <Link to="/reports">Reports</Link> }, { title: 'Snapshots' }]}
      />
      <Title level={2} style={{ marginBottom: 0 }}>
        Report Snapshots
      </Title>
      <Paragraph type="secondary">
        Frozen captures of report runs. Clicking View shows exactly the data
        that was on screen when the snapshot was saved — no re-query against
        live data.
      </Paragraph>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Segmented
            value={scope}
            onChange={(v) => setScope(v as RunListScope)}
            options={[
              { value: 'mine', label: 'My snapshots' },
              { value: 'all', label: 'All snapshots' },
            ]}
          />
          <Select
            allowClear
            placeholder="All report types"
            style={{ width: 260 }}
            value={reportType}
            onChange={(v) => setReportType(v ?? undefined)}
            options={(Object.keys(REPORT_TYPE_LABELS) as ReportType[]).map((rt) => ({
              value: rt,
              label: REPORT_TYPE_LABELS[rt],
            }))}
          />
        </Space>
      </Card>

      {error && (
        <Alert
          type="error"
          message="Failed to load snapshots"
          description={getErrorMessage(error)}
          style={{ marginBottom: 16 }}
        />
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : data && data.runs.length === 0 ? (
        <Empty
          description={
            scope === 'mine'
              ? "You haven't saved any snapshots yet. Run a report and click Save snapshot."
              : 'No snapshots visible to you for the current filter.'
          }
          style={{ padding: 40 }}
        />
      ) : data ? (
        <>
          <Table<RunSummary>
            dataSource={data.runs}
            columns={columns}
            rowKey="id"
            size="middle"
            pagination={{ pageSize: 25, total: data.total }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {data.total.toLocaleString()} snapshot{data.total === 1 ? '' : 's'} total.
            Older runs beyond the first page are paged, not hidden.
          </Text>
        </>
      ) : null}
    </div>
  )
}
