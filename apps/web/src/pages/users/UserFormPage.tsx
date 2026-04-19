import { Button, Card, Form, Input, Select, Switch, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { userApi } from '../../services/userApi';

export default function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: () => userApi.listRoles() });

  const userQuery = useQuery({
    queryKey: ['user', id],
    queryFn: () => userApi.get(id!),
    enabled: isEdit,
  });

  const initial = userQuery.data?.user;

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
      queryClient.invalidateQueries({ queryKey: ['users'] });
      navigate('/admin/users');
    },
    onError: (err: any) => message.error(err.message || 'Save failed'),
  });

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
            options={(rolesQuery.data?.roles ?? []).map((r) => ({ value: r.id, label: r.name }))}
          />
        </Form.Item>
        <Form.Item label="Active" name="active" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
          {isEdit ? 'Save' : 'Create'}
        </Button>
      </Form>
    </Card>
  );
}
