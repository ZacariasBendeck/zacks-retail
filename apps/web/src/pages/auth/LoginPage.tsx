import { Button, Card, Form, Input, Layout, Typography, message } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { LanguageSelector } from '@benlow-rics/i18n/react';
import { useTranslation } from '@benlow-rics/i18n/react';
import { useAuth } from '../../auth/useAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  const onSubmit = async (values: { email: string; password: string }) => {
    try {
      await login(values.email, values.password);
      navigate(from, { replace: true });
    } catch (err: any) {
      message.error(err.message || t('login.failed'));
    }
  };

  return (
    <Layout style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card style={{ width: 380 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Typography.Title level={3} style={{ marginTop: 0 }}>{t('login.title')}</Typography.Title>
          <LanguageSelector />
        </div>
        <Form layout="vertical" onFinish={onSubmit}>
          <Form.Item
            label={t('login.email')}
            name="email"
            rules={[{ required: true, type: 'email' }]}
          >
            <Input autoComplete="username" autoFocus />
          </Form.Item>
          <Form.Item
            label={t('login.password')}
            name="password"
            rules={[{ required: true }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>{t('login.submit')}</Button>
        </Form>
      </Card>
    </Layout>
  );
}
