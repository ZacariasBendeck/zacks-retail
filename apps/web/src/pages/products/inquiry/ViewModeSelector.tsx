import React from 'react';
import { Button, Space, Tooltip } from 'antd';

export type ViewMode =
  | 'ON_HAND' | 'ON_ORDER_CURRENT' | 'ON_ORDER_FUTURE'
  | 'MODEL' | 'SHORT'
  | 'MTD_SALES' | 'STD_SALES' | 'YTD_SALES' | 'LY_SALES'
  | 'SINGLE_COLUMN'
  | 'ALL_STORES_ON_HAND' | 'ALL_STORES_ONE_ROW' | 'ALL_STORES_SUMMARY'
  | 'MAX' | 'REORDER';

interface Mode {
  value: ViewMode;
  label: string;
  shortcut: string;
  live: boolean;
  waitingOn?: string;
}

export const VIEW_MODES: Mode[] = [
  { value: 'ON_HAND',             label: 'On Hand',                shortcut: 'F2',       live: true },
  { value: 'ON_ORDER_CURRENT',    label: 'On Order (At-Once)',     shortcut: 'F3',       live: false, waitingOn: 'purchasing.getOnOrder' },
  { value: 'ON_ORDER_FUTURE',     label: 'On Order (Future)',      shortcut: 'F4',       live: false, waitingOn: 'purchasing.getOnOrder' },
  { value: 'MODEL',               label: 'Model Quantities',       shortcut: 'F5',       live: true },
  { value: 'SHORT',               label: 'Short Quantities',       shortcut: 'F6',       live: true },
  { value: 'MTD_SALES',           label: 'Month-to-Date Sales',    shortcut: 'F7',       live: false, waitingOn: 'sales-reporting.getSizeGridSales' },
  { value: 'STD_SALES',           label: 'Season-to-Date Sales',   shortcut: 'F8',       live: false, waitingOn: 'sales-reporting.getSizeGridSales' },
  { value: 'YTD_SALES',           label: 'Year-To-Date Sales',     shortcut: 'F9',       live: false, waitingOn: 'sales-reporting.getSizeGridSales' },
  { value: 'SINGLE_COLUMN',       label: 'Column Only',            shortcut: 'F11',      live: false, waitingOn: 'Phase 2 UX' },
  { value: 'ALL_STORES_ON_HAND',  label: 'All Stores - On Hand',   shortcut: 'Shift+F1', live: true },
  { value: 'ALL_STORES_ONE_ROW',  label: 'All Stores - 1 Row',     shortcut: 'Shift+F2', live: false, waitingOn: 'Phase 2 UX' },
  { value: 'ALL_STORES_SUMMARY',  label: 'All Stores Summary',     shortcut: 'Shift+F3', live: true },
  { value: 'MAX',                 label: 'Max Quantities',         shortcut: 'Shift+F4', live: true },
  { value: 'REORDER',             label: 'Reorder Quantities',     shortcut: 'Shift+F5', live: true },
  { value: 'LY_SALES',            label: 'Last Year Sales',        shortcut: 'Shift+F6', live: false, waitingOn: 'sales-reporting.getSizeGridSales' },
];

export const ViewModeSelector: React.FC<{
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}> = ({ value, onChange }) => (
  <Space wrap size={[4, 4]}>
    {VIEW_MODES.map((m) => {
      const button = (
        <Button
          key={m.value}
          size="small"
          type={value === m.value ? 'primary' : 'default'}
          disabled={!m.live}
          onClick={() => onChange(m.value)}
          style={{ fontSize: 11, padding: '0 8px', height: 22 }}
        >
          {m.label}
          <span style={{ opacity: 0.55, marginLeft: 4, fontSize: 10 }}>{m.shortcut}</span>
        </Button>
      );
      return m.live ? (
        button
      ) : (
        <Tooltip key={m.value} title={`Phase 2 — waiting on ${m.waitingOn}`}>
          <span>{button}</span>
        </Tooltip>
      );
    })}
  </Space>
);
