import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useStores } from '../../hooks/useStores';
import {
  ActiveSessionSummary,
  EffectiveAccess,
  LoginEventSummary,
  RoleAssignmentHistory,
  RoleSafetyWarning,
  SessionEventSummary,
  userApi,
} from '../../services/userApi';

function warningAlertType(severity: RoleSafetyWarning['severity']): 'info' | 'warning' | 'error' {
  if (severity === 'critical') return 'error';
  if (severity === 'warning') return 'warning';
  return 'info';
}

function permissionRows(access: EffectiveAccess | undefined) {
  if (!access) return [];
  if (access.permissionSources?.length) return access.permissionSources;
  return access.effectivePermissions.map((permission) => ({
    permission,
    label: permission,
    module: 'other',
    moduleLabel: 'Other',
    roles: [],
  }));
}

export default function EffectiveAccessPage() {
  const [searchParams] = useSearchParams();
  const requestedUserId = searchParams.get('userId') ?? undefined;
  const accessQuery = useQuery({ queryKey: ['effective-access'], queryFn: () => userApi.listEffectiveAccess() });
  const storesQuery = useStores();
  const rows = accessQuery.data?.effectiveAccess ?? [];
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>();

  useEffect(() => {
    if (requestedUserId && rows.some((row) => row.user.id === requestedUserId)) {
      setSelectedUserId(requestedUserId);
      return;
    }
    if (selectedUserId && rows.some((row) => row.user.id === selectedUserId)) return;
    setSelectedUserId(rows[0]?.user.id);
  }, [requestedUserId, rows, selectedUserId]);

  const selectedAccess = rows.find((row) => row.user.id === selectedUserId);

  const sessionsQuery = useQuery({
    queryKey: ['user-sessions', selectedUserId],
    queryFn: () => userApi.listSessions(selectedUserId!),
    enabled: Boolean(selectedUserId),
  });

  const sessionEventsQuery = useQuery({
    queryKey: ['user-session-events', selectedUserId],
    queryFn: () => userApi.listSessionEvents(selectedUserId!, 50),
    enabled: Boolean(selectedUserId),
  });

  const loginEventsQuery = useQuery({
    queryKey: ['user-login-events', selectedUserId],
    queryFn: () => userApi.listLoginEvents(selectedUserId!, 25),
    enabled: Boolean(selectedUserId),
  });

  const securityOverviewQuery = useQuery({
    queryKey: ['user-security-overview', selectedUserId],
    queryFn: () => userApi.getSecurityOverview(selectedUserId!),
    enabled: Boolean(selectedUserId),
  });

  const roleHistoryQuery = useQuery({
    queryKey: ['role-assignment-history', selectedUserId],
    queryFn: () => userApi.listRoleAssignmentHistory({ userId: selectedUserId!, limit: 100 }),
    enabled: Boolean(selectedUserId),
  });

  const userOptions = useMemo(() => rows.map((row) => ({
    value: row.user.id,
    label: `${row.user.displayName} <${row.user.email}>`,
  })), [rows]);

  const permissions = permissionRows(selectedAccess);
  const storeLabelById = useMemo(() => {
    const labels = new Map<string, string>();
    for (const store of storesQuery.data ?? []) labels.set(String(store.id), `${store.code} - ${store.name}`);
    return labels;
  }, [storesQuery.data]);
  const scopeLabel = (scope: EffectiveAccess['storeScopes'][number]) => {
    if (scope.scopeType === 'ALL_STORES') return 'All stores';
    if (scope.scopeType === 'STORE' && scope.scopeId) return storeLabelById.get(scope.scopeId) ?? `Store ${scope.scopeId}`;
    if (scope.scopeType === 'WAREHOUSE' && scope.scopeId) return `Warehouse ${scope.scopeId}`;
    return scope.scopeId ?? 'All';
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Space style={{ display: 'flex', justifyContent: 'space-between' }} align="start">
          <Space direction="vertical" size={0}>
            <Typography.Title level={3} style={{ margin: 0 }}>Effective Access</Typography.Title>
            <Typography.Text type="secondary">Review a user&apos;s final permissions, role sources, store scopes, active sessions, and recent login activity.</Typography.Text>
          </Space>
          <Button href="/api/v1/users/_reports/effective-access.csv">Export CSV</Button>
        </Space>

        <Space wrap>
          <Select
            showSearch
            style={{ minWidth: 420 }}
            placeholder="Select user"
            loading={accessQuery.isLoading}
            value={selectedUserId}
            onChange={setSelectedUserId}
            optionFilterProp="label"
            options={userOptions}
          />
          {selectedAccess && (
            <>
              <Tag color={selectedAccess.user.active ? 'green' : 'default'}>
                {selectedAccess.user.active ? 'Active' : 'Inactive'}
              </Tag>
              <Tag>{selectedAccess.roles.length} role{selectedAccess.roles.length === 1 ? '' : 's'}</Tag>
              <Tag color="blue">{selectedAccess.effectivePermissions.length} permissions</Tag>
              <Tag>{selectedAccess.storeScopes.length} store scopes</Tag>
              <Tag color={securityOverviewQuery.data?.securityOverview.privileged ? 'red' : 'default'}>
                {securityOverviewQuery.data?.securityOverview.privileged ? 'Privileged' : 'Standard'}
              </Tag>
            </>
          )}
        </Space>

        {(selectedAccess?.safetyWarnings ?? []).length > 0 && (
          <Space direction="vertical" style={{ width: '100%' }}>
            {selectedAccess!.safetyWarnings.map((warning) => (
              <Alert
                key={warning.code}
                type={warningAlertType(warning.severity)}
                showIcon
                message={warning.message}
                description={warning.permissions.length > 0 ? warning.permissions.join(', ') : undefined}
              />
            ))}
          </Space>
        )}

        <Tabs
          items={[
            {
              key: 'permissions',
              label: 'Permissions',
              children: (
                <Table
                  rowKey="permission"
                  size="small"
                  loading={accessQuery.isLoading}
                  dataSource={permissions}
                  pagination={{ pageSize: 50 }}
                  columns={[
                    {
                      title: 'Permission',
                      render: (_, row) => (
                        <Space direction="vertical" size={0}>
                          <Typography.Text>{row.label}</Typography.Text>
                          <Typography.Text type="secondary">{row.permission}</Typography.Text>
                        </Space>
                      ),
                    },
                    { title: 'Module', dataIndex: 'moduleLabel' },
                    {
                      title: 'Granted by',
                      render: (_, row) => (
                        <Space wrap>
                          {row.roles.length > 0
                            ? row.roles.map((role) => <Tag key={role.id}>{role.name}</Tag>)
                            : <Typography.Text type="secondary">No active role source</Typography.Text>}
                        </Space>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'roles',
              label: 'Roles',
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={selectedAccess?.roles ?? []}
                  pagination={false}
                  columns={[
                    { title: 'Role', dataIndex: 'name', render: (value) => <Tag>{value}</Tag> },
                    { title: 'Permissions', dataIndex: 'permissions', render: (value: string[]) => value.length },
                    {
                      title: 'Permission keys',
                      dataIndex: 'permissions',
                      render: (value: string[]) => (
                        <Typography.Text type="secondary">{value.join(', ')}</Typography.Text>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'scopes',
              label: 'Store Scopes',
              children: (
                <Table<EffectiveAccess['storeScopes'][number]>
                  rowKey="id"
                  size="small"
                  dataSource={selectedAccess?.storeScopes ?? []}
                  pagination={false}
                  columns={[
                    { title: 'Type', dataIndex: 'scopeType', render: (value) => <Tag>{value}</Tag> },
                    { title: 'Scope', render: (_, row) => scopeLabel(row) },
                    { title: 'Source', dataIndex: 'source' },
                  ]}
                />
              ),
            },
            {
              key: 'role-history',
              label: 'Role History',
              children: (
                <Table<RoleAssignmentHistory>
                  rowKey="id"
                  size="small"
                  loading={roleHistoryQuery.isLoading}
                  dataSource={roleHistoryQuery.data?.roleAssignmentHistory ?? []}
                  pagination={{ pageSize: 25 }}
                  columns={[
                    { title: 'Role', dataIndex: 'roleName', render: (value) => <Tag>{value}</Tag> },
                    { title: 'Assigned', dataIndex: 'assignedAt', render: (value) => new Date(value).toLocaleString() },
                    { title: 'Revoked', dataIndex: 'revokedAt', render: (value) => value ? new Date(value).toLocaleString() : '' },
                    { title: 'Source', dataIndex: 'source' },
                    { title: 'Reason', dataIndex: 'reason', render: (value) => value ?? '' },
                  ]}
                />
              ),
            },
            {
              key: 'sessions',
              label: 'Sessions',
              children: (
                <Table<ActiveSessionSummary>
                  rowKey="id"
                  size="small"
                  loading={sessionsQuery.isLoading}
                  dataSource={sessionsQuery.data?.sessions ?? []}
                  pagination={false}
                  columns={[
                    { title: 'Session', dataIndex: 'id' },
                    { title: 'Created', dataIndex: 'createdAt', render: (value) => new Date(value).toLocaleString() },
                    { title: 'Expires', dataIndex: 'expiresAt', render: (value) => new Date(value).toLocaleString() },
                  ]}
                />
              ),
            },
            {
              key: 'session-history',
              label: 'Session History',
              children: (
                <Table<SessionEventSummary>
                  rowKey="id"
                  size="small"
                  loading={sessionEventsQuery.isLoading}
                  dataSource={sessionEventsQuery.data?.sessionEvents ?? []}
                  pagination={{ pageSize: 25 }}
                  columns={[
                    { title: 'When', dataIndex: 'occurredAt', render: (value) => new Date(value).toLocaleString() },
                    { title: 'Event', dataIndex: 'eventType', render: (value) => <Tag>{value}</Tag> },
                    { title: 'Session', dataIndex: 'sessionId', render: (value) => value ?? '' },
                    { title: 'Reason', dataIndex: 'reason', render: (value) => value ?? '' },
                    { title: 'IP', dataIndex: 'ipAddress', render: (value) => value ?? '' },
                    { title: 'User agent', dataIndex: 'userAgent', render: (value) => value ?? '' },
                  ]}
                />
              ),
            },
            {
              key: 'activity',
              label: 'Login Activity',
              children: (
                <Table<LoginEventSummary>
                  rowKey="id"
                  size="small"
                  loading={loginEventsQuery.isLoading}
                  dataSource={loginEventsQuery.data?.loginEvents ?? []}
                  pagination={false}
                  columns={[
                    { title: 'When', dataIndex: 'occurredAt', render: (value) => new Date(value).toLocaleString() },
                    { title: 'Outcome', dataIndex: 'outcome', render: (value) => <Tag color={value === 'SUCCESS' ? 'green' : 'red'}>{value}</Tag> },
                    { title: 'Reason', dataIndex: 'reason', render: (value) => value ?? '' },
                    { title: 'IP', dataIndex: 'ipAddress', render: (value) => value ?? '' },
                  ]}
                />
              ),
            },
          ]}
        />
      </Space>
    </Card>
  );
}
