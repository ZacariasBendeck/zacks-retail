import { ReactNode } from 'react';
import { Result } from 'antd';
import { useAuth } from './useAuth';

export function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { permissions } = useAuth();
  if (!permissions.has(permission)) {
    return <Result status="403" title="403" subTitle="You don't have permission to view this page." />;
  }
  return <>{children}</>;
}
