import React from 'react';
import { Alert } from 'antd';

export const PosTab: React.FC = () => (
  <Alert
    type="info"
    showIcon
    message="Coming in Phase 2"
    description="Open POs tab is waiting on purchasing.getOpenPoLines(skuId)."
  />
);
