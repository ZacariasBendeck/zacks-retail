import React from 'react';
import { Button, Space, Tooltip } from 'antd';

export type InquiryTab = 'UPCS' | 'POS' | 'TREND' | 'INFO' | 'DETAIL';

interface Props {
  activeTab: InquiryTab | null;
  onTab: (tab: InquiryTab) => void;
  onPrev: () => void;
  onNext: () => void;
  onClear: () => void;
}

const TABS: Array<{ key: InquiryTab; label: string; live: boolean; waitingOn?: string }> = [
  { key: 'UPCS',   label: 'UPCs',   live: true },
  { key: 'POS',    label: 'POs',    live: false, waitingOn: 'purchasing.getOpenPoLines' },
  { key: 'TREND',  label: 'Trend',  live: false, waitingOn: 'sales-reporting.getEightWeekTrend' },
  { key: 'INFO',   label: 'Info',   live: true },
  { key: 'DETAIL', label: 'Detail', live: true },
];

export const ActionBar: React.FC<Props> = ({ activeTab, onTab, onPrev, onNext, onClear }) => (
  <Space wrap>
    <Button onClick={onClear}>Clear</Button>
    <Button onClick={onPrev}>Prev</Button>
    <Button onClick={onNext}>Next</Button>
    {TABS.map((t) => {
      const btn = (
        <Button
          key={t.key}
          type={activeTab === t.key ? 'primary' : 'default'}
          disabled={!t.live}
          onClick={() => onTab(t.key)}
        >
          {t.label}
        </Button>
      );
      return t.live ? btn : (
        <Tooltip key={t.key} title={`Phase 2 — waiting on ${t.waitingOn}`}>
          <span>{btn}</span>
        </Tooltip>
      );
    })}
    <Tooltip title="Phase 2 — waiting on label-print pipeline">
      <span><Button disabled>Print</Button></span>
    </Tooltip>
  </Space>
);
