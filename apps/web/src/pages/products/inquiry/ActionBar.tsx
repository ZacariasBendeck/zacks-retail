import React from 'react';
import { Button, Segmented, Space, Tooltip } from 'antd';

export type InquiryTab = 'UPCS' | 'POS' | 'TREND' | 'INFO' | 'DETAIL';

/**
 * Scope selector for Prev/Next SKU navigation. Mirrors the RICS inquiry's
 * "step through" modes: any SKU in the catalog, any SKU of the same vendor,
 * or any SKU in the same category — all in alphabetical SKU order.
 */
export type NeighborScope = 'general' | 'vendor' | 'category';

interface Props {
  activeTab: InquiryTab | null;
  onTab: (tab: InquiryTab) => void;
  onPrev: () => void;
  onNext: () => void;
  onClear: () => void;
  scope: NeighborScope;
  onScopeChange: (scope: NeighborScope) => void;
  navLoading?: boolean;
}

const TABS: Array<{ key: InquiryTab; label: string; live: boolean; waitingOn?: string }> = [
  { key: 'UPCS',   label: 'UPCs',   live: true },
  { key: 'POS',    label: 'POs',    live: false, waitingOn: 'purchasing.getOpenPoLines' },
  { key: 'TREND',  label: 'Trend',  live: false, waitingOn: 'sales-reporting.getEightWeekTrend' },
  { key: 'INFO',   label: 'Info',   live: true },
  { key: 'DETAIL', label: 'Detail', live: true },
];

const btnStyle: React.CSSProperties = { fontSize: 11, padding: '0 10px', height: 24 };

export const ActionBar: React.FC<Props> = ({
  activeTab, onTab, onPrev, onNext, onClear, scope, onScopeChange, navLoading,
}) => (
  <Space wrap size={[4, 4]}>
    <Button size="small" style={btnStyle} onClick={onClear}>Clear</Button>
    <Button size="small" style={btnStyle} onClick={onPrev} loading={navLoading}>Prev</Button>
    <Button size="small" style={btnStyle} onClick={onNext} loading={navLoading}>Next</Button>
    <Tooltip title="Scope for Prev / Next navigation">
      <Segmented
        size="small"
        value={scope}
        onChange={(v) => onScopeChange(v as NeighborScope)}
        options={[
          { label: 'Any',      value: 'general' },
          { label: 'Vendor',   value: 'vendor' },
          { label: 'Category', value: 'category' },
        ]}
      />
    </Tooltip>
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
