import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@benlow-rics/i18n/react';
import { authApi } from '../../services/authApi';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['auth', 'common']);
  const onSubmit = async (values: { oldPassword: string; newPassword: string; confirm: string }) => {
    if (values.newPassword !== values.confirm) {
      message.error(t('auth:password.mismatch'));
      return;
    }
    try {
      await authApi.changePassword(values.oldPassword, values.newPassword);
      message.success(t('auth:password.changed'));
      navigate('/me');
    } catch (err: any) {
      message.error(err.message || t('auth:password.failed'));
    }
  };
  return (
    <Card style={{ maxWidth: 480 }}>
      <Typography.Title level={3}>{t('auth:password.title')}</Typography.Title>
      <Form layout="vertical" onFinish={onSubmit}>
        <Form.Item label={t('auth:password.current')} name="oldPassword" rules={[{ required: true }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item label={t('auth:password.new')} name="newPassword" rules={[{ required: true, min: 8 }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item label={t('auth:password.confirm')} name="confirm" rules={[{ required: true }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit">{t('common:actions.save')}</Button>
      </Form>
    </Card>
  );
}
