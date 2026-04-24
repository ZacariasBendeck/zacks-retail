import { useState } from 'react'
import {
  Alert, App, Breadcrumb, Button, Card, Empty, Popconfirm, Segmented, Select, Space, Spin,
  Table, Tag, Typography,
} from 'antd'
import { DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import {
  useDeleteReportTemplate,
  useReportTemplatesList,
} from '../../../hooks/useReportTemplates'
import type {
  ReportType,
  TemplateListScope,
  TemplateSummary,
} from '../../../services/reportTemplatesApi'
import { getErrorMessage } from '../../../utils/errors'

const { Title, Paragraph, Text } = Typography

// Friendly labels for list rendering.
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
}

// Where each report's builder lives.
const REPORT_TYPE_PATHS: Record<ReportType, string> = {
  'sales-analysis': '/reports/sales/analysis',
  'sales-hierarchy-drill-down': '/reports/sales/hierarchy-drill-down',
  'sales-pivot': '/reports/sales/pivot',
  'best-sellers': '/reports/sales/best-sellers',
  'stock-status': '/reports/sales/stock-status',
  'sales-by-day': '/reports/others/sales-by-day',
  'sales-by-time': '/reports/others/sales-by-time',
  'salesperson-summary': '/reports/others/salesperson-summary',
  'sales-history-by-month': '/reports/sales/history-by-month',
}

function VisibilityTag({ v }: { v: string }): JSX.Element {
  if (v === 'shared') return <Tag color="blue">Visible to all signed-in users</Tag>
  return <Tag>Private</Tag>
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  // Renders as locale short date + time; avoids absolute-time drift vs relative
  // formatting libraries.
  return new Date(iso).toLocaleString()
}

export default function TemplatesListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [scope, setScope] = useState<TemplateListScope>('mine')
  const [reportType, setReportType] = useState<ReportType | undefined>(undefined)

  const { data, isLoading, error } = useReportTemplatesList(scope, reportType)
  const del = useDeleteReportTemplate()

  const runTemplate = (t: TemplateSummary): void => {
    const path = REPORT_TYPE_PATHS[t.reportType]
    navigate(`${path}?templateId=${encodeURIComponent(t.id)}`)
  }

  const deleteTemplate = async (id: string, title: string): Promise<void> => {
    try {
      await del.mutateAsync(id)
      message.success(`Template "${title}" deleted`)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const columns = [
    {
      title: 'Report', dataIndex: 'reportType', key: 'reportType', width: 180,
      render: (rt: ReportType) => REPORT_TYPE_LABELS[rt] ?? rt,
    },
    { title: 'Title', dataIndex: 'title', key: 'title', width: 260 },
    { title: 'Owner', dataIndex: 'ownerDisplayName', key: 'owner', width: 160 },
    {
      title: 'Visibility', dataIndex: 'visibility', key: 'visibility', width: 220,
      render: (v: string) => <VisibilityTag v={v} />,
    },
    {
      title: 'Created', dataIndex: 'createdAt', key: 'createdAt', width: 160,
      render: formatDate,
    },
    {
      title: 'Last used', dataIndex: 'lastUsedAt', key: 'lastUsedAt', width: 160,
      render: formatDate,
    },
    {
      title: 'Actions', key: 'actions', width: 220,
      render: (_: unknown, t: TemplateSummary) => (
        <Space>
          <Button icon={<PlayCircleOutlined />} type="primary" onClick={() => runTemplate(t)}>
            Run
          </Button>
          <Popconfirm
            title="Delete this template?"
            description="This can't be undone."
            onConfirm={() => deleteTemplate(t.id, t.title)}
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
        items={[{ title: <Link to="/reports">Reports</Link> }, { title: 'Templates' }]}
      />
      <Title level={2} style={{ marginBottom: 0 }}>
        Report Templates
      </Title>
      <Paragraph type="secondary">
        Reusable saved report queries. Click Run to replay against current data —
        templates re-run against current data each time.
      </Paragraph>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Segmented
            value={scope}
            onChange={(v) => setScope(v as TemplateListScope)}
            options={[
              { value: 'mine', label: 'My templates' },
              { value: 'all', label: 'All templates' },
            ]}
          />
          <Select
            allowClear
            placeholder="All report types"
            style={{ width: 240 }}
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
          message="Failed to load templates"
          description={getErrorMessage(error)}
          style={{ marginBottom: 16 }}
        />
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : data && data.templates.length === 0 ? (
        <Empty
          description={
            scope === 'mine'
              ? "You haven't saved any templates yet. Run a report and click Save as template."
              : 'No templates visible to you for the current filter.'
          }
          style={{ padding: 40 }}
        />
      ) : data ? (
        <Table<TemplateSummary>
          dataSource={data.templates}
          columns={columns}
          rowKey="id"
          size="middle"
          pagination={{ pageSize: 25 }}
        />
      ) : null}

      <Text type="secondary" style={{ fontSize: 12 }}>
        Tip: change visibility to "Visible to all signed-in users" when saving so
        teammates can replay it too.
      </Text>
    </div>
  )
}
