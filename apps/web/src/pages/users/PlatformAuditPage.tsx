import { Button, Card, Divider, Form, Select, Space, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
  PlatformAuditEvent,
  PlatformAuditFilters,
  PlatformAuditResourceOption,
  PlatformAuditUserRef,
  platformAuditApi,
} from '../../services/platformAuditApi';

const EVENT_LABELS: Record<string, string> = {
  'identity.session.logout': 'User logged out',
  'identity.password_change.success': 'Password changed',
  'identity.password_change.failure': 'Password change failed',
  'identity.password_reset.admin': 'Password reset by admin',
  'identity.user.created': 'User created',
  'identity.user.updated': 'User updated',
  'identity.user.deactivated': 'User deactivated',
  'identity.role_assigned': 'Role assigned',
  'identity.role_revoked': 'Role revoked',
  'identity.role_permissions.updated': 'Role permissions updated',
  'identity.role.created': 'Role created',
  'identity.role.cloned': 'Role cloned',
  'identity.role.updated': 'Role updated',
  'identity.role.archived': 'Role archived',
  'identity.store_scope_granted': 'Store access granted',
  'identity.store_scope_revoked': 'Store access revoked',
  'identity.sessions_revoked': 'Sessions revoked',
  'identity.mfa_factor.revoked': 'MFA factor revoked',
  'identity.external_identity.unlinked': 'External identity unlinked',
};

const ACTION_LABELS: Record<string, string> = {
  LOGOUT: 'Logout',
  CHANGE_PASSWORD: 'Change password',
  RESET_PASSWORD: 'Reset password',
  CREATE_USER: 'Create user',
  UPDATE_USER: 'Update user',
  DEACTIVATE_USER: 'Deactivate user',
  ASSIGN_ROLE: 'Assign role',
  REVOKE_ROLE: 'Revoke role',
  UPDATE_ROLE_PERMISSIONS: 'Update role permissions',
  CREATE_ROLE: 'Create role',
  CLONE_ROLE: 'Clone role',
  UPDATE_ROLE: 'Update role',
  ARCHIVE_ROLE: 'Archive role',
  GRANT_STORE_SCOPE: 'Grant store access',
  REVOKE_STORE_SCOPE: 'Revoke store access',
  REVOKE_USER_SESSIONS: 'Revoke sessions',
  REVOKE_MFA_FACTOR: 'Revoke MFA factor',
  UNLINK_EXTERNAL_IDENTITY: 'Unlink external identity',
};

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  'identity.user': 'User',
  'identity.session': 'Session',
  'identity.role': 'Role',
};

function renderJson(value: unknown) {
  if (value == null) return '';
  return (
    <Typography.Text code style={{ whiteSpace: 'pre-wrap' }}>
      {JSON.stringify(value, null, 2)}
    </Typography.Text>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function permissionDisplay(permission: string) {
  return humanize(permission);
}

function renderPermissionDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const beforePermissions = new Set(stringArray(before?.permissions));
  const afterPermissions = new Set(stringArray(after?.permissions));
  const added = [...afterPermissions].filter((permission) => !beforePermissions.has(permission));
  const removed = [...beforePermissions].filter((permission) => !afterPermissions.has(permission));
  if (added.length === 0 && removed.length === 0) return null;

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {added.length > 0 && (
        <Space wrap>
          <Typography.Text strong>Added</Typography.Text>
          {added.map((permission) => (
            <Tag key={permission} color="green">{permissionDisplay(permission)}</Tag>
          ))}
        </Space>
      )}
      {removed.length > 0 && (
        <Space wrap>
          <Typography.Text strong>Removed</Typography.Text>
          {removed.map((permission) => (
            <Tag key={permission} color="red">{permissionDisplay(permission)}</Tag>
          ))}
        </Space>
      )}
    </Space>
  );
}

function simpleFieldValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function renderFieldChanges(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (!before || !after) return null;
  const ignored = new Set(['passwordHash', 'createdAt', 'updatedAt', 'role', 'permissions']);
  const fields = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter((key) => !ignored.has(key))
    .filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null));
  if (fields.length === 0) return null;

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
        { title: 'Field', dataIndex: 'field', render: (value) => humanize(value) },
        { title: 'Before', dataIndex: 'before' },
        { title: 'After', dataIndex: 'after' },
      ]}
    />
  );
}

function renderChangeSummary(row: PlatformAuditEvent) {
  const before = asRecord(row.beforeJson);
  const after = asRecord(row.afterJson);
  const permissionDiff = renderPermissionDiff(before, after);
  const fieldChanges = renderFieldChanges(before, after);
  const summaries = [permissionDiff, fieldChanges].filter(Boolean);
  if (summaries.length === 0) return null;
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Text strong>Change summary</Typography.Text>
      {summaries}
    </Space>
  );
}

function renderExpandedAuditRow(row: PlatformAuditEvent) {
  const summary = renderChangeSummary(row);
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {summary}
      {summary && <Divider style={{ margin: '8px 0' }} />}
      <Typography.Text strong>Before</Typography.Text>
      {renderJson(row.beforeJson)}
      <Typography.Text strong>After</Typography.Text>
      {renderJson(row.afterJson)}
      <Typography.Text strong>Metadata</Typography.Text>
      {renderJson(row.metadataJson)}
    </Space>
  );
}

function formatUser(user: PlatformAuditUserRef | null, fallback?: string | null) {
  if (!user) return fallback ? 'Unknown user' : 'System';
  return `${user.displayName} <${user.email}>`;
}

function shortId(value: string | null | undefined) {
  if (!value) return '';
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function humanize(value: string) {
  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function eventLabel(eventType: string) {
  return EVENT_LABELS[eventType] ?? humanize(eventType);
}

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? humanize(action);
}

function resourceTypeLabel(resourceType: string) {
  return RESOURCE_TYPE_LABELS[resourceType] ?? humanize(resourceType);
}

function resourceLabel(row: PlatformAuditEvent) {
  if (row.resourceLabel && row.resourceLabel !== row.resourceId) return row.resourceLabel;
  if (row.resourceType === 'identity.session') {
    return row.actorUser ? `Session for ${formatUser(row.actorUser)}` : 'Session';
  }
  return resourceTypeLabel(row.resourceType);
}

function resourceOptionLabel(resource: PlatformAuditResourceOption) {
  const typeLabel = resourceTypeLabel(resource.resourceType);
  const label =
    resource.label && resource.label !== resource.resourceId
      ? resource.label
      : `${typeLabel} ${shortId(resource.resourceId)}`;
  return `${label} (${typeLabel})`;
}

export default function PlatformAuditPage() {
  const [form] = Form.useForm<PlatformAuditFilters>();
  const filters = Form.useWatch([], form) ?? {};
  const optionsQuery = useQuery({
    queryKey: ['platform-audit-options'],
    queryFn: () => platformAuditApi.options(),
  });
  const query = useQuery({
    queryKey: ['platform-audit', filters],
    queryFn: () => platformAuditApi.list({ ...filters, limit: filters.limit ?? 50 }),
  });
  const options = optionsQuery.data?.options;
  const selectedResourceType = Form.useWatch('resourceType', form);
  const resourceOptions = (options?.resources ?? [])
    .filter((resource) => !selectedResourceType || resource.resourceType === selectedResourceType)
    .map((resource) => ({
      value: resource.resourceId,
      label: resourceOptionLabel(resource),
    }));

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Typography.Title level={3} style={{ margin: 0 }}>Security Audit</Typography.Title>
        <Form form={form} layout="inline" initialValues={{ limit: 50 }}>
          <Form.Item name="eventType" style={{ minWidth: 220 }}>
            <Select
              showSearch
              allowClear
              placeholder="Event type"
              loading={optionsQuery.isLoading}
              optionFilterProp="label"
              options={(options?.eventTypes ?? []).map((value) => ({
                value,
                label: `${eventLabel(value)} (${value})`,
              }))}
            />
          </Form.Item>
          <Form.Item name="resourceType" style={{ minWidth: 180 }}>
            <Select
              showSearch
              allowClear
              placeholder="Resource type"
              loading={optionsQuery.isLoading}
              optionFilterProp="label"
              options={(options?.resourceTypes ?? []).map((value) => ({
                value,
                label: resourceTypeLabel(value),
              }))}
              onChange={() => form.setFieldValue('resourceId', undefined)}
            />
          </Form.Item>
          <Form.Item name="resourceId" style={{ minWidth: 220 }}>
            <Select
              showSearch
              allowClear
              placeholder="Resource"
              loading={optionsQuery.isLoading}
              optionFilterProp="label"
              options={resourceOptions}
            />
          </Form.Item>
          <Form.Item name="actorUserId" style={{ minWidth: 220 }}>
            <Select
              showSearch
              allowClear
              placeholder="Actor"
              loading={optionsQuery.isLoading}
              optionFilterProp="label"
              options={(options?.actors ?? []).map((user) => ({
                value: user.id,
                label: formatUser(user),
              }))}
            />
          </Form.Item>
          <Form.Item name="outcome" style={{ minWidth: 140 }}>
            <Select
              placeholder="Outcome"
              allowClear
              options={[
                { value: 'SUCCESS', label: 'Success' },
                { value: 'FAILURE', label: 'Failure' },
              ]}
            />
          </Form.Item>
          <Form.Item name="limit" style={{ minWidth: 110 }}>
            <Select
              options={[
                { value: 25, label: '25' },
                { value: 50, label: '50' },
                { value: 100, label: '100' },
                { value: 500, label: '500' },
                { value: 1000, label: '1000' },
                { value: 5000, label: '5000' },
              ]}
            />
          </Form.Item>
          <Button onClick={() => form.resetFields()}>Clear</Button>
          <Button onClick={() => query.refetch()} loading={query.isFetching}>Refresh</Button>
        </Form>
        <Table<PlatformAuditEvent>
          rowKey="id"
          size="small"
          loading={query.isLoading || query.isFetching}
          dataSource={query.data?.events ?? []}
          expandable={{
            expandedRowRender: renderExpandedAuditRow,
          }}
          columns={[
            { title: 'When', dataIndex: 'createdAt', render: (value) => new Date(value).toLocaleString() },
            {
              title: 'Event',
              dataIndex: 'eventType',
              render: (value) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text>{eventLabel(value)}</Typography.Text>
                  <Typography.Text type="secondary">{value}</Typography.Text>
                </Space>
              ),
            },
            { title: 'Action', dataIndex: 'action', render: (value) => <Tag>{actionLabel(value)}</Tag> },
            { title: 'Outcome', dataIndex: 'outcome', render: (value) => <Tag color={value === 'SUCCESS' ? 'green' : 'red'}>{value}</Tag> },
            {
              title: 'Resource',
              render: (_, row) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text>{resourceLabel(row)}</Typography.Text>
                  <Typography.Text type="secondary">
                    {resourceTypeLabel(row.resourceType)}{row.resourceId ? ` ${shortId(row.resourceId)}` : ''}
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: 'Actor',
              render: (_, row) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text>{formatUser(row.actorUser, row.actorUserId)}</Typography.Text>
                  {row.actorUserId && <Typography.Text type="secondary">User {shortId(row.actorUserId)}</Typography.Text>}
                </Space>
              ),
            },
            { title: 'Reason', dataIndex: 'reason', render: (value) => value ?? '' },
          ]}
        />
      </Space>
    </Card>
  );
}
