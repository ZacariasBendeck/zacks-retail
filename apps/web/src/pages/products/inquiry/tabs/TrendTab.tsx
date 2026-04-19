import React from 'react';
import { Alert } from 'antd';

export const TrendTab: React.FC = () => (
  <Alert
    type="info"
    showIcon
    message="Coming in Phase 2"
    description="Eight-Week Trend is waiting on sales-reporting.getEightWeekTrend."
  />
);
