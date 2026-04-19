import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../services/authApi';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const onSubmit = async (values: { oldPassword: string; newPassword: string; confirm: string }) => {
    if (values.newPassword !== values.confirm) {
      message.error('New passwords do not match');
      return;
    }
    try {
      await authApi.changePassword(values.oldPassword, values.newPassword);
      message.success('Password changed');
      navigate('/me');
    } catch (err: any) {
      message.error(err.message || 'Change failed');
    }
  };
  return (
    <Card style={{ maxWidth: 480 }}>
      <Typography.Title level={3}>Change password</Typography.Title>
      <Form layout="vertical" onFinish={onSubmit}>
        <Form.Item label="Current password" name="oldPassword" rules={[{ required: true }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item label="New password" name="newPassword" rules={[{ required: true, min: 8 }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item label="Confirm new password" name="confirm" rules={[{ required: true }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit">Change password</Button>
      </Form>
    </Card>
  );
}
