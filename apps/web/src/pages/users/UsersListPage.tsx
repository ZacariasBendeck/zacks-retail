import { Button, Card, Popconfirm, Space, Table, Tag, Typography, message } from 'antd';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AdminUser, userApi } from '../../services/userApi';

export default function UsersListPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => userApi.list(),
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => userApi.remove(id),
    onSuccess: () => {
      message.success('User deleted');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => message.error(err.message || 'Delete failed'),
  });

  return (
    <Card>
      <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>Users</Typography.Title>
        <Link to="/admin/users/new"><Button type="primary">New user</Button></Link>
      </Space>
      <Table<AdminUser>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.users ?? []}
        columns={[
          { title: 'Email', dataIndex: 'email' },
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
                <Link to={`/admin/users/${row.id}/edit`}>Edit</Link>
                <Popconfirm
                  title="Delete this user?"
                  onConfirm={() => removeMutation.mutate(row.id)}
                >
                  <a>Delete</a>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );
}
