import { useEffect, useMemo, useState } from 'react'
import type { Dayjs } from 'dayjs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Divider,
  Form,
  Input,
  Modal,
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
  ActivityReviewBulkReviewMode,
  ActivityReviewBulkReviewResult,
  ActivityReviewEvent,
  ActivityReviewFilters,
  ActivityReviewRiskLevel,
  ActivityReviewStatus,
  ActivityReviewUserSummary,
} from '../../services/activityReviewApi'
import { InlinePageHelp, useRegisterPageHelp } from '../../components/page-help'
import { activityReviewHelp } from '../../content/help/pageHelp'

const { RangePicker } = DatePicker

interface ActivityReviewFilterForm extends Omit<ActivityReviewFilters, 'createdFrom' | 'createdTo'> {
  dateRange?: [Dayjs, Dayjs] | null
}

interface BulkReviewForm {
  status?: Exclude<ActivityReviewStatus, 'UNREVIEWED'>
  reviewNote?: string
}

interface BulkReviewIntent {
  mode: ActivityReviewBulkReviewMode
  status: Exclude<ActivityReviewStatus, 'UNREVIEWED'>
}

const DEFAULT_FILTER_VALUES: ActivityReviewFilterForm = {
  reviewStatus: 'UNREVIEWED',
  limit: 100,
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
const BULK_STATUS_OPTIONS: Array<{ value: Exclude<ActivityReviewStatus, 'UNREVIEWED'>; label: string }> = [
  { value: 'NO_ISSUE', label: 'No Issue' },
  { value: 'REVIEWED', label: 'Reviewed' },
  { value: 'FLAGGED', label: 'Flagged' },
]
const LIMIT_OPTIONS = [25, 50, 100, 500, 1000, 5000].map((value) => ({ value, label: String(value) }))
const ACRONYMS = new Set(['API', 'AR', 'CSV', 'GP', 'MFA', 'OTB', 'PO', 'POS', 'SKU'])

function normalizeFilters(values: ActivityReviewFilterForm | undefined): ActivityReviewFilters {
  const normalizedValues = values ?? DEFAULT_FILTER_VALUES
  const dateRange = normalizedValues.dateRange
  return {
    actorUserId: normalizedValues.actorUserId,
    module: normalizedValues.module,
    category: normalizedValues.category,
    resourceType: normalizedValues.resourceType,
    storeId: normalizedValues.storeId,
    outcome: normalizedValues.outcome,
    riskLevel: normalizedValues.riskLevel,
    reviewStatus: normalizedValues.reviewStatus,
    search: normalizedValues.search?.trim() || undefined,
    createdFrom: dateRange?.[0]?.startOf('day').toISOString(),
    createdTo: dateRange?.[1]?.endOf('day').toISOString(),
    limit: normalizedValues.limit ?? 100,
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

function canBulkClearEvent(event: ActivityReviewEvent): boolean {
  return event.outcome === 'SUCCESS' && event.riskLevel !== 'HIGH'
}

function bulkStatusLabel(status: Exclude<ActivityReviewStatus, 'UNREVIEWED'>): string {
  return BULK_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status.replace('_', ' ')
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

type ActorIdentity = {
  actorUserId?: string | null
  actorName?: string | null
  actorEmail?: string | null
}

function actorDisplayName(actor: ActorIdentity): string {
  if (actor.actorName && actor.actorName !== 'System') return actor.actorName
  if (actor.actorEmail) return actor.actorEmail
  if (actor.actorUserId) return `Unknown user (${actor.actorUserId.slice(0, 8)})`
  return 'System'
}

function actorLabel(actor: ActorIdentity): string {
  const displayName = actorDisplayName(actor)
  if (actor.actorEmail && displayName !== actor.actorEmail) {
    return `${displayName} <${actor.actorEmail}>`
  }
  return displayName
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
  useRegisterPageHelp(activityReviewHelp)
  const [form] = Form.useForm<ActivityReviewFilterForm>()
  const [bulkForm] = Form.useForm<BulkReviewForm>()
  const watched = Form.useWatch([], form) as ActivityReviewFilterForm | undefined
  const watchedBulkStatus = Form.useWatch('status', bulkForm) as Exclude<ActivityReviewStatus, 'UNREVIEWED'> | undefined
  const queryClient = useQueryClient()
  const apiFilters = useMemo(() => normalizeFilters(watched), [watched])
  const summaryFilters = useMemo(() => {
    const filters = { ...apiFilters }
    delete filters.limit
    return filters
  }, [apiFilters])
  const [activeTab, setActiveTab] = useState('events')
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([])
  const [bulkIntent, setBulkIntent] = useState<BulkReviewIntent | null>(null)
  const [lastBulkResult, setLastBulkResult] = useState<ActivityReviewBulkReviewResult | null>(null)

  const eventsQuery = useQuery({
    queryKey: ['activity-review-events', apiFilters],
    queryFn: () => activityReviewApi.listEvents(apiFilters),
  })
  const summaryQuery = useQuery({
    queryKey: ['activity-review-summary', summaryFilters],
    queryFn: () => activityReviewApi.getSummary(summaryFilters),
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
  const bulkReviewMutation = useMutation({
    mutationFn: (input: Parameters<typeof activityReviewApi.bulkReview>[0]) => activityReviewApi.bulkReview(input),
    onSuccess: async (result) => {
      setLastBulkResult(result)
      setSelectedEventIds([])
      setBulkIntent(null)
      bulkForm.resetFields()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['activity-review-events'] }),
        queryClient.invalidateQueries({ queryKey: ['activity-review-summary'] }),
      ])
      const summary = `${result.updatedCount} updated${result.skippedCount ? `, ${result.skippedCount} skipped` : ''}`
      if (result.skippedCount || result.hasMore) {
        message.warning(`Bulk review saved: ${summary}`)
      } else {
        message.success(`Bulk review saved: ${summary}`)
      }
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : 'Unable to save bulk review')
    },
  })

  const events = eventsQuery.data?.events ?? []
  const summary = summaryQuery.data?.summary ?? []
  const isEventsTab = activeTab === 'events'
  const selectedEvents = useMemo(
    () => events.filter((event) => selectedEventIds.includes(event.id)),
    [events, selectedEventIds],
  )
  const activeBulkStatus = watchedBulkStatus ?? bulkIntent?.status ?? 'NO_ISSUE'
  const bulkUnsafeCount = useMemo(() => {
    const candidates = bulkIntent?.mode === 'IDS' ? selectedEvents : events
    if (activeBulkStatus === 'FLAGGED') return 0
    return candidates.filter((event) => !canBulkClearEvent(event)).length
  }, [activeBulkStatus, bulkIntent?.mode, events, selectedEvents])

  useEffect(() => {
    if (events.length === 0 && selectedEventIds.length === 0) return
    const visibleIds = new Set(events.map((event) => event.id))
    setSelectedEventIds((current) => current.filter((id) => visibleIds.has(id)))
  }, [events, selectedEventIds.length])
  const actorOptions = useMemo(() => {
    const actors = new Map<string, string>()
    for (const event of events) {
      if (event.actorUserId) actors.set(event.actorUserId, actorLabel(event))
    }
    for (const row of summary) {
      if (row.actorUserId) {
        actors.set(row.actorUserId, actorLabel(row))
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
          <Typography.Text>{actorDisplayName(event)}</Typography.Text>
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
          <Typography.Text>{actorDisplayName(row)}</Typography.Text>
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

  const openBulkReview = (
    mode: ActivityReviewBulkReviewMode,
    status: Exclude<ActivityReviewStatus, 'UNREVIEWED'>,
  ) => {
    if (mode === 'IDS' && selectedEventIds.length === 0) {
      message.warning('Select at least one activity row first')
      return
    }
    setLastBulkResult(null)
    setBulkIntent({ mode, status })
    bulkForm.setFieldsValue({ status, reviewNote: '' })
  }

  const submitBulkReview = async () => {
    if (!bulkIntent) return
    const values = await bulkForm.validateFields()
    const status = values.status ?? bulkIntent.status
    const reviewNote = values.reviewNote?.trim() ?? ''

    if (bulkIntent.mode === 'IDS') {
      bulkReviewMutation.mutate({
        mode: 'IDS',
        eventIds: selectedEventIds,
        status,
        reviewNote,
      })
      return
    }

    bulkReviewMutation.mutate({
      mode: 'FILTER',
      filters: apiFilters,
      status,
      reviewNote,
    })
  }

  const selectAllVisible = () => {
    setSelectedEventIds(events.map((event) => event.id))
  }

  return (
    <>
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Space align="center" style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
          <Typography.Title level={3} style={{ margin: 0 }}>Activity Review</Typography.Title>
          <Space>
            <InlinePageHelp entry={activityReviewHelp} mode="popover" />
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
        <Form form={form} layout="inline" initialValues={DEFAULT_FILTER_VALUES}>
          <Form.Item name="dateRange">
            <RangePicker />
          </Form.Item>
          <Form.Item name="actorUserId" style={{ minWidth: 220 }}>
            <Select
              aria-label="Activity user filter"
              showSearch
              allowClear
              placeholder="User"
              optionFilterProp="label"
              options={actorOptions}
            />
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
          {isEventsTab ? (
            <Form.Item name="limit" style={{ minWidth: 100 }}>
              <Select aria-label="Activity result limit" options={LIMIT_OPTIONS} />
            </Form.Item>
          ) : null}
          <Button onClick={() => form.resetFields()}>Clear</Button>
        </Form>
        {lastBulkResult ? (
          <Alert
            showIcon
            type={lastBulkResult.skippedCount || lastBulkResult.hasMore ? 'warning' : 'success'}
            message={`Bulk review saved: ${lastBulkResult.updatedCount} updated${lastBulkResult.skippedCount ? `, ${lastBulkResult.skippedCount} skipped` : ''}${lastBulkResult.hasMore ? ', more matching rows remain' : ''}.`}
            description={
              lastBulkResult.skippedEvents.length > 0
                ? `Skipped high-risk or failed activity: ${lastBulkResult.skippedEvents.map((event) => event.actionLabel).join(', ')}.`
                : undefined
            }
          />
        ) : null}
        {isEventsTab ? (
          <Space
            align="center"
            wrap
            style={{
              width: '100%',
              justifyContent: 'space-between',
              padding: '8px 12px',
              border: '1px solid #f0f0f0',
              borderRadius: 6,
            }}
          >
            <Space wrap>
              <Typography.Text strong>
                {selectedEventIds.length.toLocaleString()} selected
              </Typography.Text>
              <Button size="small" onClick={selectAllVisible} disabled={events.length === 0}>
                Select all visible
              </Button>
              <Button size="small" onClick={() => setSelectedEventIds([])} disabled={selectedEventIds.length === 0}>
                Clear selection
              </Button>
            </Space>
            <Space wrap>
              <Button
                icon={<CloseCircleOutlined />}
                disabled={selectedEventIds.length === 0}
                onClick={() => openBulkReview('IDS', 'NO_ISSUE')}
              >
                Mark No Issue
              </Button>
              <Button
                icon={<CheckCircleOutlined />}
                disabled={selectedEventIds.length === 0}
                onClick={() => openBulkReview('IDS', 'REVIEWED')}
              >
                Mark Reviewed
              </Button>
              <Button
                danger
                icon={<FlagOutlined />}
                disabled={selectedEventIds.length === 0}
                onClick={() => openBulkReview('IDS', 'FLAGGED')}
              >
                Flag
              </Button>
              <Button onClick={() => openBulkReview('FILTER', 'NO_ISSUE')}>
                Apply to all matching filters
              </Button>
            </Space>
          </Space>
        ) : null}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
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
                  rowSelection={{
                    selectedRowKeys: selectedEventIds,
                    onChange: (keys) => setSelectedEventIds(keys.map(String)),
                  }}
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
    <Modal
      title={
        bulkIntent?.mode === 'FILTER'
          ? 'Bulk review all matching activity'
          : `Bulk mark selected activity ${bulkStatusLabel(activeBulkStatus)}`
      }
      open={Boolean(bulkIntent)}
      okText="Save bulk review"
      confirmLoading={bulkReviewMutation.isPending}
      onCancel={() => {
        setBulkIntent(null)
        bulkForm.resetFields()
      }}
      onOk={() => void submitBulkReview()}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Alert
          showIcon
          type={bulkUnsafeCount > 0 && activeBulkStatus !== 'FLAGGED' ? 'warning' : 'info'}
          message={
            bulkIntent?.mode === 'FILTER'
              ? 'This will apply to all rows matching the current filters, up to 5,000 per run.'
              : `This will apply to ${selectedEventIds.length.toLocaleString()} selected row${selectedEventIds.length === 1 ? '' : 's'}.`
          }
          description={
            activeBulkStatus === 'FLAGGED'
              ? 'Flagged bulk review can include high-risk and failed activity.'
              : `${bulkUnsafeCount.toLocaleString()} visible high-risk or failed row${bulkUnsafeCount === 1 ? '' : 's'} will be skipped.`
          }
        />
        <Form form={bulkForm} layout="vertical">
          {bulkIntent?.mode === 'FILTER' ? (
            <Form.Item
              name="status"
              label="Bulk status"
              rules={[{ required: true, message: 'Choose a review status' }]}
            >
              <Select options={BULK_STATUS_OPTIONS} />
            </Form.Item>
          ) : null}
          <Form.Item
            name="reviewNote"
            label="Manager note"
            rules={[
              { required: true, whitespace: true, message: 'Add a manager note for bulk review' },
              { max: 2000, message: 'Manager note must be 2000 characters or fewer' },
            ]}
          >
            <Input.TextArea
              rows={4}
              maxLength={2000}
              showCount
              placeholder="Example: Routine successful POS/session activity. Spot-checked 10 records."
            />
          </Form.Item>
        </Form>
      </Space>
    </Modal>
    </>
  )
}
