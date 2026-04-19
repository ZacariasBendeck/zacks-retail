import { Card, Descriptions, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';

export default function MePage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Card>
      <Typography.Title level={3}>My account</Typography.Title>
      <Descriptions column={1} bordered>
        <Descriptions.Item label="Email">{user.email}</Descriptions.Item>
        <Descriptions.Item label="Name">{user.displayName}</Descriptions.Item>
        <Descriptions.Item label="Role">{user.role.name}</Descriptions.Item>
      </Descriptions>
      <p style={{ marginTop: 16 }}>
        <Link to="/change-password">Change password</Link>
      </p>
    </Card>
  );
}
