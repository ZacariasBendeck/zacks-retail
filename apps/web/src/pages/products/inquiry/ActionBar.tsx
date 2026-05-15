import React from 'react';
import { Button, Segmented, Space, Tooltip } from 'antd';
import { useTranslation } from '@benlow-rics/i18n/react';

export type InquiryTab = 'UPCS' | 'POS' | 'TREND' | 'INFO' | 'DETAIL';

/**
 * Scope selector for Prev/Next SKU navigation. Mirrors the RICS inquiry's
 * "step through" modes: any SKU in the catalog, any SKU of the same vendor,
 * or any SKU in the same category, all in alphabetical SKU order.
 */
export type NeighborScope = 'general' | 'vendor' | 'category';

interface Props {
  activeTab: InquiryTab | null;
  onTab: (tab: InquiryTab | null) => void;
  onPrev: () => void;
  onNext: () => void;
  onClear: () => void;
  scope: NeighborScope;
  onScopeChange: (scope: NeighborScope) => void;
  navLoading?: boolean;
}

const TABS: Array<{ key: InquiryTab; labelKey: string; live: boolean; waitingOn?: string }> = [
  { key: 'UPCS', labelKey: 'tabs.upcs', live: true },
  { key: 'POS', labelKey: 'tabs.pos', live: true },
  { key: 'TREND', labelKey: 'tabs.trend', live: true },
  { key: 'INFO', labelKey: 'tabs.info', live: true },
  { key: 'DETAIL', labelKey: 'tabs.detail', live: true },
];

const btnStyle: React.CSSProperties = { fontSize: 11, padding: '0 10px', height: 24 };

export const ActionBar: React.FC<Props> = ({
  activeTab,
  onTab,
  onPrev,
  onNext,
  onClear,
  scope,
  onScopeChange,
  navLoading,
}) => {
  const { t } = useTranslation(['inquiry', 'common']);

  return (
    <Space wrap size={[4, 4]}>
      <Button size="small" style={btnStyle} onClick={onClear}>{t('common:actions.clear')}</Button>
      <Button size="small" style={btnStyle} onClick={onPrev} loading={navLoading}>{t('common:actions.previous')}</Button>
      <Button size="small" style={btnStyle} onClick={onNext} loading={navLoading}>{t('common:actions.next')}</Button>
      <Tooltip title={t('inquiry:scope.tooltip')}>
        <Segmented
          size="small"
          value={scope}
          onChange={(v) => onScopeChange(v as NeighborScope)}
          options={[
            { label: t('inquiry:scope.general'), value: 'general' },
            { label: t('inquiry:scope.vendor'), value: 'vendor' },
            { label: t('inquiry:scope.category'), value: 'category' },
          ]}
        />
      </Tooltip>
      {TABS.map((tab) => {
        const btn = (
          <Button
            key={tab.key}
            size="small"
            style={btnStyle}
            type={activeTab === tab.key ? 'primary' : 'default'}
            disabled={!tab.live}
            onClick={() => onTab(activeTab === tab.key ? null : tab.key)}
          >
            {t(`inquiry:${tab.labelKey}`)}
          </Button>
        );
        return tab.live ? btn : (
          <Tooltip key={tab.key} title={`Phase 2 - waiting on ${tab.waitingOn}`}>
            <span>{btn}</span>
          </Tooltip>
        );
      })}
      <Tooltip title="Phase 2 - waiting on label-print pipeline">
        <span><Button size="small" style={btnStyle} disabled>{t('common:actions.print')}</Button></span>
      </Tooltip>
    </Space>
  );
};
