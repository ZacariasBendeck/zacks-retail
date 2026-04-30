import { Button, Card, Space, Table, Tabs, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AdminUser, EffectiveAccess, LoginEventSummary, userApi } from '../../services/userApi';

export default function SecurityCenterPage() {
  const privilegedUsersQuery = useQuery({
    queryKey: ['privileged-users'],
    queryFn: () => userApi.listPrivilegedUsers(),
  });
  const inactiveUsersQuery = useQuery({
    queryKey: ['inactive-users'],
    queryFn: () => userApi.listInactiveUsers(),
  });
  const failedLoginsQuery = useQuery({
    queryKey: ['failed-logins', { limit: 100 }],
    queryFn: () => userApi.listFailedLogins({ limit: 100 }),
  });

  const privilegedUsers = privilegedUsersQuery.data?.privilegedUsers ?? [];
  const inactiveUsers = inactiveUsersQuery.data?.users ?? [];
  const failedLogins = failedLoginsQuery.data?.failedLogins ?? [];

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Space style={{ display: 'flex', justifyContent: 'space-between' }} align="start">
          <Space direction="vertical" size={0}>
            <Typography.Title level={3} style={{ margin: 0 }}>Security Center</Typography.Title>
            <Typography.Text type="secondary">Review risky access, inactive accounts, and failed login activity.</Typography.Text>
          </Space>
          <Space>
            <Link to="/admin/effective-access"><Button>Effective access</Button></Link>
            <Link to="/admin/audit"><Button>Security audit</Button></Link>
          </Space>
        </Space>

        <Space wrap>
          <Tag color={privilegedUsers.length > 0 ? 'red' : 'green'}>{privilegedUsers.length} privileged users</Tag>
          <Tag>{inactiveUsers.length} inactive users</Tag>
          <Tag color={failedLogins.length > 0 ? 'orange' : 'green'}>{failedLogins.length} recent failed logins</Tag>
        </Space>

        <Tabs
          items={[
            {
              key: 'privileged',
              label: 'Privileged Users',
              children: (
                <Table<EffectiveAccess & { privilegedPermissions: string[] }>
                  rowKey={(row) => row.user.id}
                  size="small"
                  loading={privilegedUsersQuery.isLoading}
                  dataSource={privilegedUsers}
                  pagination={{ pageSize: 25 }}
                  columns={[
                    {
                      title: 'User',
                      render: (_, row) => (
                        <Space direction="vertical" size={0}>
                          <Link to={`/admin/effective-access?userId=${row.user.id}`}>{row.user.displayName}</Link>
                          <Typography.Text type="secondary">{row.user.email}</Typography.Text>
                        </Space>
                      ),
                    },
                    {
                      title: 'Roles',
                      render: (_, row) => (
                        <Space wrap>
                          {row.roles.map((role) => <Tag key={role.id}>{role.name}</Tag>)}
                        </Space>
                      ),
                    },
                    {
                      title: 'Privileged permissions',
                      render: (_, row) => (
                        <Space wrap>
                          {row.privilegedPermissions.map((permission) => <Tag color="red" key={permission}>{permission}</Tag>)}
                        </Space>
                      ),
                    },
                    {
                      title: 'Store scope',
                      render: (_, row) => row.storeScopes.length > 0
                        ? `${row.storeScopes.length} scope${row.storeScopes.length === 1 ? '' : 's'}`
                        : 'Default access',
                    },
                  ]}
                />
              ),
            },
            {
              key: 'inactive',
              label: 'Inactive Users',
              children: (
                <Table<AdminUser>
                  rowKey="id"
                  size="small"
                  loading={inactiveUsersQuery.isLoading}
                  dataSource={inactiveUsers}
                  pagination={{ pageSize: 25 }}
                  columns={[
                    {
                      title: 'User',
                      render: (_, row) => (
                        <Space direction="vertical" size={0}>
                          <Typography.Text>{row.displayName}</Typography.Text>
                          <Typography.Text type="secondary">{row.email}</Typography.Text>
                        </Space>
                      ),
                    },
                    { title: 'Role', dataIndex: ['role', 'name'], render: (value) => <Tag>{value}</Tag> },
                    { title: 'Updated', dataIndex: 'updatedAt', render: (value) => new Date(value).toLocaleString() },
                    {
                      title: 'Access',
                      render: (_, row) => <Link to={`/admin/effective-access?userId=${row.id}`}>Review</Link>,
                    },
                  ]}
                />
              ),
            },
            {
              key: 'failed-logins',
              label: 'Failed Logins',
              children: (
                <Table<LoginEventSummary>
                  rowKey="id"
                  size="small"
                  loading={failedLoginsQuery.isLoading}
                  dataSource={failedLogins}
                  pagination={{ pageSize: 25 }}
                  columns={[
                    { title: 'When', dataIndex: 'occurredAt', render: (value) => new Date(value).toLocaleString() },
                    { title: 'Email', dataIndex: 'email' },
                    { title: 'Reason', dataIndex: 'reason', render: (value) => value ?? '' },
                    { title: 'IP', dataIndex: 'ipAddress', render: (value) => value ?? '' },
                    { title: 'User agent', dataIndex: 'userAgent', render: (value) => value ?? '' },
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
