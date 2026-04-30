import { Alert, Button, Card, Popconfirm, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { AdminUser, userApi } from '../../services/userApi';
import { useAuth } from '../../auth/useAuth';

export default function UsersListPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user: currentUser, permissions, refresh } = useAuth();
  const canManageIdentity = permissions.has('identity_access.manage');
  const canViewEmployees = permissions.has('employees.view');
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['users'],
    queryFn: () => userApi.list(),
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => userApi.remove(id),
    onSuccess: () => {
      message.success('User deactivated');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => message.error(err.message || 'Delete failed'),
  });

  return (
    <Card>
      <Tabs
        activeKey="users"
        onChange={(key) => {
          if (key === 'salespeople') navigate('/employees/salespeople');
        }}
        items={[
          ...(canViewEmployees ? [{ key: 'salespeople', label: 'Salespeople' }] : []),
          { key: 'users', label: 'Users' },
        ]}
      />
      <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>Users</Typography.Title>
        <Space>
          <Button href="/api/v1/users/_reports/effective-access.csv">Effective access CSV</Button>
          <Button href="/api/v1/users/_reports/role-assignment-history.csv">Role history CSV</Button>
          <Button href="/api/v1/users/_reports/failed-logins.csv">Failed logins CSV</Button>
          <Link to="/admin/security"><Button>Security center</Button></Link>
          <Link to="/admin/effective-access"><Button>Effective access</Button></Link>
          <Link to="/admin/audit"><Button>Security audit</Button></Link>
          {canManageIdentity && <Link to="/admin/users/new"><Button type="primary">New user</Button></Link>}
        </Space>
      </Space>
      {isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Could not load users"
          description={
            error instanceof Error
              ? error.message
              : 'The user list request failed. Refresh your session and try again.'
          }
          action={<Button size="small" onClick={() => void refresh()}>Refresh session</Button>}
        />
      )}
      <Table<AdminUser>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.users ?? []}
        columns={[
          {
            title: 'Email',
            dataIndex: 'email',
            render: (value, row) => (
              <Space>
                <span>{value}</span>
                {row.id === currentUser?.id && <Tag color="blue">You</Tag>}
              </Space>
            ),
          },
          { title: 'Name', dataIndex: 'displayName' },
          { title: 'Role', dataIndex: ['role', 'name'], render: (v) => <Tag>{v}</Tag> },
          {
            title: 'Active',
            dataIndex: 'active',
            render: (v: boolean) => (v ? <Tag color="green">active</Tag> : <Tag>inactive</Tag>),
          },
          {
            title: 'Actions',
            render: (_, row) => (
              <Space>
                <Link to={`/admin/effective-access?userId=${row.id}`}>Access</Link>
                {canManageIdentity && (
                  <>
                    <Link to={`/admin/users/${row.id}/edit`}>Edit</Link>
                    <Popconfirm
                      title="Deactivate this user?"
                      onConfirm={() => removeMutation.mutate(row.id)}
                    >
                      <a>Deactivate</a>
                    </Popconfirm>
                  </>
                )}
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );
}
