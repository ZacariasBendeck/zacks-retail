import { Card, Descriptions, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { LanguageSelector } from '@benlow-rics/i18n/react';
import { useTranslation } from '@benlow-rics/i18n/react';
import { useAuth } from '../../auth/useAuth';

export default function MePage() {
  const { user, updatePreferences } = useAuth();
  const { t } = useTranslation('auth');
  if (!user) return null;
  return (
    <Card>
      <Typography.Title level={3}>{t('account.title')}</Typography.Title>
      <Descriptions column={1} bordered>
        <Descriptions.Item label={t('account.email')}>{user.email}</Descriptions.Item>
        <Descriptions.Item label={t('account.name')}>{user.displayName}</Descriptions.Item>
        <Descriptions.Item label={t('account.role')}>{user.role.name}</Descriptions.Item>
        <Descriptions.Item label={t('account.preferredLanguage')}>
          <LanguageSelector onLocaleChange={(preferredLocale) => updatePreferences({ preferredLocale })} />
        </Descriptions.Item>
      </Descriptions>
      <p style={{ marginTop: 16 }}>
        <Link to="/change-password">{t('account.changePassword')}</Link>
      </p>
    </Card>
  );
}
