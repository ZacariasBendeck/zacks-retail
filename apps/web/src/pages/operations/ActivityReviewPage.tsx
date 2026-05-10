import { useMemo, useState } from 'react'
import type { Dayjs } from 'dayjs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  DatePicker,
  Divider,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  FlagOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  activityReviewApi,
} from '../../services/activityReviewApi'
import type {
  ActivityReviewEvent,
  ActivityReviewFilters,
  ActivityReviewRiskLevel,
  ActivityReviewStatus,
  ActivityReviewUserSummary,
} from '../../services/activityReviewApi'

const { RangePicker } = DatePicker

interface ActivityReviewFilterForm extends Omit<ActivityReviewFilters, 'createdFrom' | 'createdTo'> {
  dateRange?: [Dayjs, Dayjs] | null
}

const MODULE_OPTIONS = [
  { value: 'identity_access', label: 'Identity & Access' },
  { value: 'products', label: 'Products' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'purchasing', label: 'Purchasing' },
  { value: 'import_management', label: 'Import Management' },
  { value: 'customer_intelligence', label: 'Customer Intelligence' },
  { value: 'reports', label: 'Reports' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'sales_pos', label: 'Sales POS' },
  { value: 'employees', label: 'Employees' },
  { value: 'activity_review', label: 'Activity Review' },
]

const CATEGORY_OPTIONS = [
  { value: 'access_control', label: 'Access Control' },
  { value: 'approval', label: 'Approval' },
  { value: 'bulk_change', label: 'Bulk Change' },
  { value: 'change', label: 'Change' },
  { value: 'creation', label: 'Creation' },
  { value: 'failure', label: 'Failure' },
  { value: 'import', label: 'Import' },
  { value: 'removal', label: 'Removal' },
  { value: 'reporting', label: 'Reporting' },
  { value: 'session', label: 'Session' },
  { value: 'work', label: 'Work' },
]

const RISK_OPTIONS: Array<{ value: ActivityReviewRiskLevel; label: string }> = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
]

const REVIEW_OPTIONS: Array<{ value: ActivityReviewStatus; label: string }> = [
  { value: 'UNREVIEWED', label: 'Unreviewed' },
  { value: 'FLAGGED', label: 'Flagged' },
  { value: 'REVIEWED', label: 'Reviewed' },
  { value: 'NO_ISSUE', label: 'No Issue' },
]
const ACRONYMS = new Set(['API', 'AR', 'CSV', 'GP', 'MFA', 'OTB', 'PO', 'POS', 'SKU'])

function normalizeFilters(values: ActivityReviewFilterForm | undefined): ActivityReviewFilters {
  const dateRange = values?.dateRange
  return {
    actorUserId: values?.actorUserId,
    module: values?.module,
    category: values?.category,
    resourceType: values?.resourceType,
    storeId: values?.storeId,
    outcome: values?.outcome,
    riskLevel: values?.riskLevel,
    reviewStatus: values?.reviewStatus,
    search: values?.search?.trim() || undefined,
    createdFrom: dateRange?.[0]?.startOf('day').toISOString(),
    createdTo: dateRange?.[1]?.endOf('day').toISOString(),
    limit: values?.limit ?? 100,
  }
}

function moduleLabel(module: string): string {
  return MODULE_OPTIONS.find((option) => option.value === module)?.label ?? humanize(module)
}

function humanize(value: string): string {
  return value
    .split(/[._\s-]+/)
    .filter(Boolean)
    .map((part) => {
      const upper = part.toUpperCase()
      return ACRONYMS.has(upper) ? upper : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join(' ')
}

function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  return new Date(value).toLocaleString()
}

function riskTag(risk: ActivityReviewRiskLevel) {
  const color = risk === 'HIGH' ? 'red' : risk === 'MEDIUM' ? 'orange' : 'green'
  return <Tag color={color}>{risk}</Tag>
}

function outcomeTag(outcome: string) {
  return <Tag color={outcome === 'SUCCESS' ? 'green' : 'red'}>{outcome}</Tag>
}

function reviewTag(status: ActivityReviewStatus) {
  const color =
    status === 'FLAGGED'
      ? 'red'
      : status === 'REVIEWED'
        ? 'blue'
        : status === 'NO_ISSUE'
          ? 'green'
          : 'default'
  return <Tag color={color}>{status.replace('_', ' ')}</Tag>
}

function renderJson(value: unknown) {
  if (value == null) return <Typography.Text type="secondary">None</Typography.Text>
  return (
    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', maxHeight: 280, overflow: 'auto' }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function renderFieldChanges(beforeJson: unknown, afterJson: unknown) {
  const before = asRecord(beforeJson)
  const after = asRecord(afterJson)
  if (!before || !after) return null
  const fields = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null))
  if (fields.length === 0) return null

  return (
    <Table
      rowKey="field"
      size="small"
      pagination={false}
      dataSource={fields.map((field) => ({
        field,
        before: simpleFieldValue(before[field]),
        after: simpleFieldValue(after[field]),
      }))}
      columns={[
        { title: 'Field', dataIndex: 'field', render: (value: string) => humanize(value) },
        { title: 'Before', dataIndex: 'before' },
        { title: 'After', dataIndex: 'after' },
      ]}
    />
  )
}

function simpleFieldValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function actorLabel(event: ActivityReviewEvent): string {
  if (event.actorName || event.actorEmail) {
    return `${event.actorName ?? 'User'}${event.actorEmail ? ` <${event.actorEmail}>` : ''}`
  }
  return 'System'
}

function resourceLabel(event: ActivityReviewEvent): string {
  if (event.resourceLabel) return event.resourceLabel
  if (event.resourceId) return event.resourceId
  return humanize(event.resourceType)
}

function ActivityReviewDetail({
  event,
  onReview,
  reviewing,
}: {
  event: ActivityReviewEvent
  onReview: (eventId: string, status: Exclude<ActivityReviewStatus, 'UNREVIEWED'>, note: string | null) => void
  reviewing: boolean
}) {
  const [note, setNote] = useState(event.reviewNote ?? '')
  const changes = renderFieldChanges(event.beforeJson, event.afterJson)

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Space wrap>
        <Typography.Text strong>Review</Typography.Text>
        {reviewTag(event.reviewStatus)}
        {event.reviewedAt ? <Typography.Text type="secondary">{formatDate(event.reviewedAt)}</Typography.Text> : null}
      </Space>
      <Input.TextArea
        rows={2}
        value={note}
        onChange={(change) => setNote(change.target.value)}
        placeholder="Manager note"
        maxLength={2000}
      />
      <Space wrap>
        <Button
          icon={<CheckCircleOutlined />}
          loading={reviewing}
          onClick={() => onReview(event.id, 'REVIEWED', note)}
        >
          Reviewed
        </Button>
        <Button
          danger
          icon={<FlagOutlined />}
          loading={reviewing}
          onClick={() => onReview(event.id, 'FLAGGED', note)}
        >
          Flag
        </Button>
        <Button
          icon={<CloseCircleOutlined />}
          loading={reviewing}
          onClick={() => onReview(event.id, 'NO_ISSUE', note)}
        >
          No Issue
        </Button>
      </Space>
      {changes ? (
        <>
          <Divider style={{ margin: '8px 0' }} />
          <Typography.Text strong>Changed Fields</Typography.Text>
          {changes}
        </>
      ) : null}
      <Divider style={{ margin: '8px 0' }} />
      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Text strong>Reason</Typography.Text>
        <Typography.Text>{event.reason ?? ''}</Typography.Text>
        <Typography.Text strong>Before</Typography.Text>
        {renderJson(event.beforeJson)}
        <Typography.Text strong>After</Typography.Text>
        {renderJson(event.afterJson)}
        <Typography.Text strong>Metadata</Typography.Text>
        {renderJson(event.metadataJson)}
        <Typography.Text type="secondary">
          IP {event.ipAddress ?? 'unknown'} · {event.userAgent ?? 'unknown device'}
        </Typography.Text>
      </Space>
    </Space>
  )
}

export default function ActivityReviewPage() {
  const [form] = Form.useForm<ActivityReviewFilterForm>()
  const watched = Form.useWatch([], form) as ActivityReviewFilterForm | undefined
  const queryClient = useQueryClient()
  const apiFilters = useMemo(() => normalizeFilters(watched), [watched])

  const eventsQuery = useQuery({
    queryKey: ['activity-review-events', apiFilters],
    queryFn: () => activityReviewApi.listEvents(apiFilters),
  })
  const summaryQuery = useQuery({
    queryKey: ['activity-review-summary', apiFilters],
    queryFn: () => activityReviewApi.getSummary(apiFilters),
  })
  const reviewMutation = useMutation({
    mutationFn: (input: { eventId: string; status: Exclude<ActivityReviewStatus, 'UNREVIEWED'>; note: string | null }) =>
      activityReviewApi.updateReview(input.eventId, { status: input.status, reviewNote: input.note }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['activity-review-events'] }),
        queryClient.invalidateQueries({ queryKey: ['activity-review-summary'] }),
      ])
      message.success('Review status saved')
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Unable to save review status')
    },
  })

  const events = eventsQuery.data?.events ?? []
  const summary = summaryQuery.data?.summary ?? []
  const actorOptions = useMemo(() => {
    const actors = new Map<string, string>()
    for (const event of events) {
      if (event.actorUserId) actors.set(event.actorUserId, actorLabel(event))
    }
    for (const row of summary) {
      if (row.actorUserId) {
        actors.set(row.actorUserId, `${row.actorName}${row.actorEmail ? ` <${row.actorEmail}>` : ''}`)
      }
    }
    return Array.from(actors.entries()).map(([value, label]) => ({ value, label }))
  }, [events, summary])

  const eventColumns: ColumnsType<ActivityReviewEvent> = [
    { title: 'When', dataIndex: 'occurredAt', width: 180, render: formatDate },
    {
      title: 'User',
      width: 220,
      render: (_, event) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{event.actorName ?? event.actorEmail ?? 'System'}</Typography.Text>
          {event.actorEmail ? <Typography.Text type="secondary">{event.actorEmail}</Typography.Text> : null}
        </Space>
      ),
    },
    { title: 'Module', dataIndex: 'module', width: 170, render: (value: string) => moduleLabel(value) },
    {
      title: 'Action',
      width: 210,
      render: (_, event) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{event.actionLabel}</Typography.Text>
          <Typography.Text type="secondary">{humanize(event.category)}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Resource',
      width: 220,
      render: (_, event) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{resourceLabel(event)}</Typography.Text>
          <Typography.Text type="secondary">{event.resourceType}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Store/Register',
      width: 140,
      render: (_, event) => [event.storeId, event.registerId].filter(Boolean).join(' / '),
    },
    { title: 'Outcome', dataIndex: 'outcome', width: 110, render: outcomeTag },
    { title: 'Risk', dataIndex: 'riskLevel', width: 100, render: riskTag },
    { title: 'Review', dataIndex: 'reviewStatus', width: 130, render: reviewTag },
  ]

  const summaryColumns: ColumnsType<ActivityReviewUserSummary> = [
    {
      title: 'User',
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{row.actorName}</Typography.Text>
          {row.actorEmail ? <Typography.Text type="secondary">{row.actorEmail}</Typography.Text> : null}
        </Space>
      ),
    },
    { title: 'Last Activity', dataIndex: 'lastActivityAt', render: formatDate },
    { title: 'Total', dataIndex: 'totalEvents', width: 90 },
    { title: 'Today', dataIndex: 'todayEvents', width: 90 },
    { title: 'This Week', dataIndex: 'thisWeekEvents', width: 110 },
    { title: 'High Risk', dataIndex: 'highRiskEvents', width: 100 },
    { title: 'Failed', dataIndex: 'failedEvents', width: 90 },
    { title: 'Flagged', dataIndex: 'flaggedEvents', width: 90 },
    {
      title: 'Modules',
      render: (_, row) => (
        <Space wrap>
          {row.modules.map((module) => (
            <Tag key={module}>{moduleLabel(module)}</Tag>
          ))}
        </Space>
      ),
    },
  ]

  const handleReview = (
    eventId: string,
    status: Exclude<ActivityReviewStatus, 'UNREVIEWED'>,
    note: string | null,
  ) => {
    reviewMutation.mutate({ eventId, status, note: note?.trim() || null })
  }

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Space align="center" style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
          <Typography.Title level={3} style={{ margin: 0 }}>Activity Review</Typography.Title>
          <Space>
            <Button
              icon={<DownloadOutlined />}
              onClick={() => {
                window.open(activityReviewApi.eventsCsvUrl(apiFilters), '_self')
              }}
            >
              Export
            </Button>
            <Button
              icon={<ReloadOutlined />}
              loading={eventsQuery.isFetching || summaryQuery.isFetching}
              onClick={() => {
                void eventsQuery.refetch()
                void summaryQuery.refetch()
              }}
            >
              Refresh
            </Button>
          </Space>
        </Space>
        <Form form={form} layout="inline" initialValues={{ limit: 100 }}>
          <Form.Item name="dateRange">
            <RangePicker />
          </Form.Item>
          <Form.Item name="actorUserId" style={{ minWidth: 220 }}>
            <Select showSearch allowClear placeholder="User" optionFilterProp="label" options={actorOptions} />
          </Form.Item>
          <Form.Item name="module" style={{ minWidth: 180 }}>
            <Select showSearch allowClear placeholder="Module" optionFilterProp="label" options={MODULE_OPTIONS} />
          </Form.Item>
          <Form.Item name="category" style={{ minWidth: 160 }}>
            <Select allowClear placeholder="Category" options={CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item name="storeId" style={{ minWidth: 120 }}>
            <Input placeholder="Store" />
          </Form.Item>
          <Form.Item name="riskLevel" style={{ minWidth: 120 }}>
            <Select allowClear placeholder="Risk" options={RISK_OPTIONS} />
          </Form.Item>
          <Form.Item name="reviewStatus" style={{ minWidth: 150 }}>
            <Select allowClear placeholder="Review" options={REVIEW_OPTIONS} />
          </Form.Item>
          <Form.Item name="search" style={{ minWidth: 220 }}>
            <Input.Search placeholder="Search" allowClear />
          </Form.Item>
          <Form.Item name="limit" style={{ minWidth: 100 }}>
            <Select options={[25, 50, 100, 200].map((value) => ({ value, label: String(value) }))} />
          </Form.Item>
          <Button onClick={() => form.resetFields()}>Clear</Button>
        </Form>
        <Tabs
          items={[
            {
              key: 'events',
              label: 'Events',
              children: (
                <Table<ActivityReviewEvent>
                  rowKey="id"
                  size="small"
                  loading={eventsQuery.isLoading || eventsQuery.isFetching}
                  dataSource={events}
                  columns={eventColumns}
                  scroll={{ x: 1350 }}
                  expandable={{
                    expandedRowRender: (event) => (
                      <ActivityReviewDetail
                        event={event}
                        onReview={handleReview}
                        reviewing={reviewMutation.isPending}
                      />
                    ),
                  }}
                />
              ),
            },
            {
              key: 'users',
              label: 'User Summary',
              children: (
                <Table<ActivityReviewUserSummary>
                  rowKey={(row) => row.actorUserId ?? row.actorName}
                  size="small"
                  loading={summaryQuery.isLoading || summaryQuery.isFetching}
                  dataSource={summary}
                  columns={summaryColumns}
                />
              ),
            },
          ]}
        />
      </Space>
    </Card>
  )
}
