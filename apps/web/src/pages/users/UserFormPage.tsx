import { useEffect, useMemo } from 'react';
import { Button, Card, Divider, Form, Input, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ActiveSessionSummary,
  ExternalIdentitySummary,
  LoginEventSummary,
  MfaFactorSummary,
  RoleAssignment,
  SessionEventSummary,
  StoreScope,
  userApi,
} from '../../services/userApi';
import { useStores } from '../../hooks/useStores';

export default function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [roleForm] = Form.useForm();
  const [scopeForm] = Form.useForm();
  const [passwordResetForm] = Form.useForm();
  const watchedScopeType = Form.useWatch('scopeType', scopeForm);

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: () => userApi.listRoles() });
  const storesQuery = useStores();

  const userQuery = useQuery({
    queryKey: ['user', id],
    queryFn: () => userApi.get(id!),
    enabled: isEdit,
  });

  const initial = userQuery.data?.user;

  const roles = rolesQuery.data?.roles ?? [];
  const storeOptions = useMemo(
    () => (storesQuery.data ?? [])
      .filter((store) => store.active)
      .map((store) => ({
        value: String(store.id),
        label: `${store.code} - ${store.name}`,
      })),
    [storesQuery.data],
  );
  const storeLabelById = useMemo(() => {
    const labels = new Map<string, string>();
    for (const store of storesQuery.data ?? []) labels.set(String(store.id), `${store.code} - ${store.name}`);
    return labels;
  }, [storesQuery.data]);
  const scopeLabel = (scope: Pick<StoreScope, 'scopeType' | 'scopeId'>) => {
    if (scope.scopeType === 'ALL_STORES') return 'All stores';
    if (scope.scopeType === 'STORE' && scope.scopeId) return storeLabelById.get(scope.scopeId) ?? `Store ${scope.scopeId}`;
    if (scope.scopeType === 'WAREHOUSE' && scope.scopeId) return `Warehouse ${scope.scopeId}`;
    return scope.scopeId ?? 'All';
  };

  const accessQuery = useQuery({
    queryKey: ['user-effective-access', id],
    queryFn: () => userApi.getEffectiveAccess(id!),
    enabled: isEdit,
  });

  const roleAssignmentsQuery = useQuery({
    queryKey: ['user-role-assignments', id],
    queryFn: () => userApi.listRoleAssignments(id!),
    enabled: isEdit,
  });

  const storeScopesQuery = useQuery({
    queryKey: ['user-store-scopes', id],
    queryFn: () => userApi.listStoreScopes(id!),
    enabled: isEdit,
  });

  const sessionsQuery = useQuery({
    queryKey: ['user-sessions', id],
    queryFn: () => userApi.listSessions(id!),
    enabled: isEdit,
  });

  const sessionEventsQuery = useQuery({
    queryKey: ['user-session-events', id],
    queryFn: () => userApi.listSessionEvents(id!, 50),
    enabled: isEdit,
  });

  const loginEventsQuery = useQuery({
    queryKey: ['user-login-events', id],
    queryFn: () => userApi.listLoginEvents(id!, 25),
    enabled: isEdit,
  });

  const securityOverviewQuery = useQuery({
    queryKey: ['user-security-overview', id],
    queryFn: () => userApi.getSecurityOverview(id!),
    enabled: isEdit,
  });

  const mfaFactorsQuery = useQuery({
    queryKey: ['user-mfa-factors', id],
    queryFn: () => userApi.listMfaFactors(id!),
    enabled: isEdit,
  });

  const externalIdentitiesQuery = useQuery({
    queryKey: ['user-external-identities', id],
    queryFn: () => userApi.listExternalIdentities(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (!initial) return;
    form.setFieldsValue({
      email: initial.email,
      displayName: initial.displayName,
      roleId: initial.roleId,
      active: initial.active,
    });
  }, [form, initial]);

  const refreshIdentityQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['user', id] });
    queryClient.invalidateQueries({ queryKey: ['user-effective-access', id] });
    queryClient.invalidateQueries({ queryKey: ['user-role-assignments', id] });
    queryClient.invalidateQueries({ queryKey: ['user-store-scopes', id] });
    queryClient.invalidateQueries({ queryKey: ['user-sessions', id] });
    queryClient.invalidateQueries({ queryKey: ['user-session-events', id] });
    queryClient.invalidateQueries({ queryKey: ['user-login-events', id] });
    queryClient.invalidateQueries({ queryKey: ['user-security-overview', id] });
    queryClient.invalidateQueries({ queryKey: ['user-mfa-factors', id] });
    queryClient.invalidateQueries({ queryKey: ['user-external-identities', id] });
  };

  const mutation = useMutation({
    mutationFn: async (values: any) => {
      if (isEdit) {
        const { password, ...rest } = values;
        return userApi.update(id!, rest);
      }
      return userApi.create(values);
    },
    onSuccess: () => {
      message.success(isEdit ? 'User updated' : 'User created');
      refreshIdentityQueries();
      navigate('/admin/users');
    },
    onError: (err: any) => message.error(err.message || 'Save failed'),
  });

  const assignRoleMutation = useMutation({
    mutationFn: (values: { roleId: string; reason?: string }) =>
      userApi.assignRole(id!, { roleId: values.roleId, reason: values.reason || null }),
    onSuccess: () => {
      message.success('Role assigned');
      roleForm.resetFields();
      refreshIdentityQueries();
    },
    onError: (err: any) => message.error(err.message || 'Role assignment failed'),
  });

  const revokeRoleMutation = useMutation({
    mutationFn: (assignmentId: string) => userApi.revokeRoleAssignment(id!, assignmentId),
    onSuccess: () => {
      message.success('Role revoked');
      refreshIdentityQueries();
    },
    onError: (err: any) => message.error(err.message || 'Role revoke failed'),
  });

  const grantScopeMutation = useMutation({
    mutationFn: (values: { scopeType: string; scopeId?: string; reason?: string }) =>
      userApi.grantStoreScope(id!, {
        scopeType: values.scopeType,
        scopeId: values.scopeId || null,
        reason: values.reason || null,
      }),
    onSuccess: () => {
      message.success('Store scope granted');
      scopeForm.resetFields();
      refreshIdentityQueries();
    },
    onError: (err: any) => message.error(err.message || 'Store scope failed'),
  });

  const revokeScopeMutation = useMutation({
    mutationFn: (scopeGrantId: string) => userApi.revokeStoreScope(id!, scopeGrantId),
    onSuccess: () => {
      message.success('Store scope revoked');
      refreshIdentityQueries();
    },
    onError: (err: any) => message.error(err.message || 'Store scope revoke failed'),
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: () => userApi.revokeSessions(id!),
    onSuccess: (res) => {
      message.success(`Revoked ${res.revokedCount} session${res.revokedCount === 1 ? '' : 's'}`);
      refreshIdentityQueries();
    },
    onError: (err: any) => message.error(err.message || 'Session revoke failed'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (values: { newPassword: string; reason?: string }) =>
      userApi.resetPassword(id!, { newPassword: values.newPassword, reason: values.reason || null }),
    onSuccess: (res) => {
      message.success(`Password reset; revoked ${res.revokedCount} session${res.revokedCount === 1 ? '' : 's'}`);
      passwordResetForm.resetFields();
      refreshIdentityQueries();
    },
    onError: (err: any) => message.error(err.message || 'Password reset failed'),
  });

  const revokeMfaFactorMutation = useMutation({
    mutationFn: (factorId: string) =>
      userApi.revokeMfaFactor(id!, factorId, { reason: 'revoked through admin users screen' }),
    onSuccess: (res) => {
      message.success(`MFA factor revoked; revoked ${res.revokedCount} session${res.revokedCount === 1 ? '' : 's'}`);
      refreshIdentityQueries();
    },
    onError: (err: any) => message.error(err.message || 'MFA revoke failed'),
  });

  const unlinkExternalIdentityMutation = useMutation({
    mutationFn: (externalIdentityId: string) =>
      userApi.unlinkExternalIdentity(id!, externalIdentityId, {
        reason: 'unlinked through admin users screen',
      }),
    onSuccess: (res) => {
      message.success(`External identity unlinked; revoked ${res.revokedCount} session${res.revokedCount === 1 ? '' : 's'}`);
      refreshIdentityQueries();
    },
    onError: (err: any) => message.error(err.message || 'External identity unlink failed'),
  });

  const permissionCount = accessQuery.data?.effectiveAccess.effectivePermissions.length ?? 0;

  return (
    <Card>
      <Typography.Title level={3}>{isEdit ? 'Edit user' : 'New user'}</Typography.Title>
      <Form
        form={form}
        layout="vertical"
        initialValues={
          initial
            ? { email: initial.email, displayName: initial.displayName, roleId: initial.roleId, active: initial.active }
            : { active: true }
        }
        onFinish={(values) => mutation.mutate(values)}
      >
        <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email' }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Name" name="displayName" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        {!isEdit && (
          <Form.Item label="Password" name="password" rules={[{ required: true, min: 8 }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        )}
        <Form.Item label="Role" name="roleId" rules={[{ required: true }]}>
          <Select
            loading={rolesQuery.isLoading}
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
          />
        </Form.Item>
        <Form.Item label="Active" name="active" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
          {isEdit ? 'Save' : 'Create'}
        </Button>
      </Form>
      {isEdit && (
        <>
          <Divider />
          <Tabs
            items={[
              {
                key: 'access',
                label: 'Access',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size="large">
                    <Space wrap>
                      <Tag color="blue">{permissionCount} permissions</Tag>
                      {(accessQuery.data?.effectiveAccess.roles ?? []).map((role) => (
                        <Tag key={role.id}>{role.name}</Tag>
                      ))}
                      <Button size="small" onClick={() => navigate('/admin/roles')}>
                        Manage role permissions
                      </Button>
                    </Space>
                    <Form form={roleForm} layout="inline" onFinish={(values) => assignRoleMutation.mutate(values)}>
                      <Form.Item name="roleId" rules={[{ required: true }]} style={{ minWidth: 220 }}>
                        <Select
                          placeholder="Role"
                          loading={rolesQuery.isLoading}
                          options={roles.map((role) => ({ value: role.id, label: role.name }))}
                        />
                      </Form.Item>
                      <Form.Item name="reason" style={{ minWidth: 240 }}>
                        <Input placeholder="Reason" />
                      </Form.Item>
                      <Button type="primary" htmlType="submit" loading={assignRoleMutation.isPending}>
                        Assign role
                      </Button>
                    </Form>
                    <Table<RoleAssignment>
                      rowKey="id"
                      size="small"
                      loading={roleAssignmentsQuery.isLoading}
                      dataSource={roleAssignmentsQuery.data?.roleAssignments ?? []}
                      pagination={false}
                      columns={[
                        { title: 'Role', dataIndex: 'roleName', render: (value) => <Tag>{value}</Tag> },
                        { title: 'Source', dataIndex: 'source' },
                        { title: 'Assigned', dataIndex: 'assignedAt', render: (value) => new Date(value).toLocaleString() },
                        {
                          title: 'Actions',
                          render: (_, row) => (
                            <Popconfirm
                              title="Revoke this role?"
                              onConfirm={() => revokeRoleMutation.mutate(row.id)}
                              disabled={row.source === 'legacy_user_role'}
                            >
                              <Button
                                danger
                                size="small"
                                disabled={row.source === 'legacy_user_role'}
                                loading={revokeRoleMutation.isPending}
                              >
                                Revoke
                              </Button>
                            </Popconfirm>
                          ),
                        },
                      ]}
                    />
                  </Space>
                ),
              },
              {
                key: 'scopes',
                label: 'Store Access',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size="large">
                    <Form
                      form={scopeForm}
                      layout="inline"
                      initialValues={{ scopeType: 'STORE' }}
                      onFinish={(values) => grantScopeMutation.mutate(values)}
                    >
                      <Form.Item name="scopeType" rules={[{ required: true }]} style={{ minWidth: 170 }}>
                        <Select
                          onChange={(value) => {
                            if (value === 'ALL_STORES') scopeForm.setFieldValue('scopeId', null);
                            else scopeForm.setFieldValue('scopeId', undefined);
                          }}
                          options={[
                            { value: 'STORE', label: 'Store' },
                            { value: 'WAREHOUSE', label: 'Warehouse' },
                            { value: 'ALL_STORES', label: 'All stores' },
                          ]}
                        />
                      </Form.Item>
                      {watchedScopeType === 'ALL_STORES' ? (
                        <Form.Item name="scopeId" style={{ minWidth: 180 }}>
                          <Input placeholder="All stores" disabled />
                        </Form.Item>
                      ) : watchedScopeType === 'WAREHOUSE' ? (
                        <Form.Item name="scopeId" style={{ minWidth: 180 }} rules={[{ required: true }]}>
                          <Input placeholder="Warehouse id" />
                        </Form.Item>
                      ) : (
                        <Form.Item name="scopeId" style={{ minWidth: 260 }} rules={[{ required: true }]}>
                          <Select
                            showSearch
                            placeholder="Select store"
                            loading={storesQuery.isLoading}
                            optionFilterProp="label"
                            options={storeOptions}
                          />
                        </Form.Item>
                      )}
                      <Form.Item name="reason" style={{ minWidth: 220 }}>
                        <Input placeholder="Reason" />
                      </Form.Item>
                      <Button type="primary" htmlType="submit" loading={grantScopeMutation.isPending}>
                        Grant scope
                      </Button>
                    </Form>
                    <Table<StoreScope>
                      rowKey="id"
                      size="small"
                      loading={storeScopesQuery.isLoading}
                      dataSource={storeScopesQuery.data?.storeScopes ?? []}
                      pagination={false}
                      columns={[
                        { title: 'Type', dataIndex: 'scopeType', render: (value) => <Tag>{value}</Tag> },
                        { title: 'Scope', render: (_, row) => scopeLabel(row) },
                        { title: 'Source', dataIndex: 'source' },
                        { title: 'Granted', dataIndex: 'grantedAt', render: (value) => new Date(value).toLocaleString() },
                        {
                          title: 'Actions',
                          render: (_, row) => (
                            <Popconfirm title="Revoke this scope?" onConfirm={() => revokeScopeMutation.mutate(row.id)}>
                              <Button danger size="small" loading={revokeScopeMutation.isPending}>
                                Revoke
                              </Button>
                            </Popconfirm>
                          ),
                        },
                      ]}
                    />
                  </Space>
                ),
              },
              {
                key: 'security',
                label: 'Security',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <Space wrap>
                      <Tag color={securityOverviewQuery.data?.securityOverview.privileged ? 'red' : 'green'}>
                        {securityOverviewQuery.data?.securityOverview.privileged ? 'Privileged' : 'Standard access'}
                      </Tag>
                      <Tag color={securityOverviewQuery.data?.securityOverview.mfaRequired ? 'orange' : 'default'}>
                        MFA {securityOverviewQuery.data?.securityOverview.mfaRequired ? 'required' : 'optional'}
                      </Tag>
                      <Tag color={securityOverviewQuery.data?.securityOverview.mfaEnrolled ? 'green' : 'default'}>
                        {securityOverviewQuery.data?.securityOverview.activeMfaFactorCount ?? 0} MFA factors
                      </Tag>
                      <Tag>{securityOverviewQuery.data?.securityOverview.externalIdentityCount ?? 0} external identities</Tag>
                      <Tag>{securityOverviewQuery.data?.securityOverview.activeSessionCount ?? 0} active sessions</Tag>
                      <Tag color={(securityOverviewQuery.data?.securityOverview.recentFailedLoginCount ?? 0) > 0 ? 'red' : 'default'}>
                        {securityOverviewQuery.data?.securityOverview.recentFailedLoginCount ?? 0} recent failed logins
                      </Tag>
                    </Space>
                    <Table<string>
                      rowKey={(permission) => permission}
                      size="small"
                      loading={securityOverviewQuery.isLoading}
                      dataSource={securityOverviewQuery.data?.securityOverview.privilegedPermissions ?? []}
                      pagination={false}
                      columns={[
                        { title: 'Privileged permission', render: (permission) => <Tag color="red">{permission}</Tag> },
                      ]}
                    />
                    <Form
                      form={passwordResetForm}
                      layout="inline"
                      onFinish={(values) => resetPasswordMutation.mutate(values)}
                    >
                      <Form.Item name="newPassword" rules={[{ required: true, min: 8 }]} style={{ minWidth: 220 }}>
                        <Input.Password placeholder="New password" autoComplete="new-password" />
                      </Form.Item>
                      <Form.Item name="reason" style={{ minWidth: 260 }}>
                        <Input placeholder="Reason" />
                      </Form.Item>
                      <Button danger htmlType="submit" loading={resetPasswordMutation.isPending}>
                        Reset password
                      </Button>
                    </Form>
                    <Table<MfaFactorSummary>
                      rowKey="id"
                      size="small"
                      loading={mfaFactorsQuery.isLoading}
                      dataSource={mfaFactorsQuery.data?.mfaFactors ?? []}
                      pagination={false}
                      columns={[
                        { title: 'Factor', dataIndex: 'factorType', render: (value) => <Tag>{value}</Tag> },
                        { title: 'Label', dataIndex: 'label', render: (value) => value ?? '' },
                        { title: 'Active', dataIndex: 'active', render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? 'Active' : 'Inactive'}</Tag> },
                        { title: 'Verified', dataIndex: 'verifiedAt', render: (value) => value ? new Date(value).toLocaleString() : '' },
                        {
                          title: 'Actions',
                          render: (_, row) => (
                            <Popconfirm
                              title="Revoke this MFA factor?"
                              onConfirm={() => revokeMfaFactorMutation.mutate(row.id)}
                              disabled={!row.active}
                            >
                              <Button
                                danger
                                size="small"
                                disabled={!row.active}
                                loading={revokeMfaFactorMutation.isPending}
                              >
                                Revoke
                              </Button>
                            </Popconfirm>
                          ),
                        },
                      ]}
                    />
                    <Table<ExternalIdentitySummary>
                      rowKey="id"
                      size="small"
                      loading={externalIdentitiesQuery.isLoading}
                      dataSource={externalIdentitiesQuery.data?.externalIdentities ?? []}
                      pagination={false}
                      columns={[
                        { title: 'Provider', dataIndex: 'provider', render: (value) => <Tag>{value}</Tag> },
                        { title: 'Email', dataIndex: 'emailAtProvider', render: (value) => value ?? '' },
                        { title: 'Subject', dataIndex: 'providerSubject' },
                        { title: 'Created', dataIndex: 'createdAt', render: (value) => new Date(value).toLocaleString() },
                        {
                          title: 'Last auth',
                          dataIndex: 'lastAuthenticatedAt',
                          render: (value) => value ? new Date(value).toLocaleString() : '',
                        },
                        {
                          title: 'Actions',
                          render: (_, row) => (
                            <Popconfirm
                              title="Unlink this external identity?"
                              onConfirm={() => unlinkExternalIdentityMutation.mutate(row.id)}
                            >
                              <Button danger size="small" loading={unlinkExternalIdentityMutation.isPending}>
                                Unlink
                              </Button>
                            </Popconfirm>
                          ),
                        },
                      ]}
                    />
                  </Space>
                ),
              },
              {
                key: 'sessions',
                label: 'Sessions',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Popconfirm title="Revoke all sessions for this user?" onConfirm={() => revokeSessionsMutation.mutate()}>
                      <Button danger loading={revokeSessionsMutation.isPending}>Revoke all sessions</Button>
                    </Popconfirm>
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
                    <Typography.Title level={5} style={{ margin: 0 }}>Session history</Typography.Title>
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
                      ]}
                    />
                  </Space>
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
        </>
      )}
    </Card>
  );
}
