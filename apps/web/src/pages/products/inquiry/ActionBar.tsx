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

const btnStyle: React.CSSProperties = { fontSize: 11, padding: '0 10px', height: 24 };

export const ActionBar: React.FC<Props> = ({ activeTab, onTab, onPrev, onNext, onClear }) => (
  <Space wrap size={[4, 4]}>
    <Button size="small" style={btnStyle} onClick={onClear}>Clear</Button>
    <Button size="small" style={btnStyle} onClick={onPrev}>Prev</Button>
    <Button size="small" style={btnStyle} onClick={onNext}>Next</Button>
    {TABS.map((t) => {
      const btn = (
        <Button
          key={t.key}
          size="small"
          style={btnStyle}
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
      <span><Button size="small" style={btnStyle} disabled>Print</Button></span>
    </Tooltip>
  </Space>
);
