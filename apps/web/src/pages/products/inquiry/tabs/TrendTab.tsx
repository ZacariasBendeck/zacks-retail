import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Spin, Typography } from 'antd';
import { DraggableModal } from '../../../../components/draggable-modal';
import { fetchInquiryTrend } from '../../../../services/ricsInventoryApi';

const wrapperStyle: React.CSSProperties = {
  border: '1px solid #9da3ab',
  background: '#f6f6f6',
  padding: 6,
};

const tableStyle: React.CSSProperties = {
  borderCollapse: 'collapse',
  width: 'max-content',
  minWidth: '100%',
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  border: '1px solid #8f8f8f',
  background: '#efefef',
  padding: '2px 6px',
  textAlign: 'right',
  fontWeight: 400,
  minWidth: 44,
};

const labelStyle: React.CSSProperties = {
  ...thStyle,
  textAlign: 'left',
  minWidth: 108,
};

const tdStyle: React.CSSProperties = {
  border: '1px solid #8f8f8f',
  padding: '2px 6px',
  textAlign: 'right',
  minWidth: 44,
};

interface TrendTabProps {
  skuCode: string;
  storeId?: number;
  onClose: () => void;
}

export const TrendTab: React.FC<TrendTabProps> = ({ skuCode, storeId, onClose }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['inquiry-trend', skuCode, storeId ?? null],
    queryFn: () => fetchInquiryTrend(skuCode, storeId),
    staleTime: 30_000,
  });

  const title = `Trending for SKU ${skuCode}${data ? ` for ${data.scopeLabel}` : ''}`;
  const modalWidth = Math.max(760, 170 + ((data?.columns.length ?? 8) * 84));

  return (
    <DraggableModal
      open
      title={title}
      onCancel={onClose}
      footer={
        <div style={{ textAlign: 'center' }}>
          <Button size="small" onClick={onClose}>OK</Button>
        </div>
      }
      width={modalWidth}
      destroyOnHidden
    >
      {isLoading && (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin />
        </div>
      )}
      {error && <Typography.Text type="danger">{(error as Error).message}</Typography.Text>}
      {data && (
        <div style={{ ...wrapperStyle, overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={labelStyle}></th>
                {data.columns.map((column) => (
                  <th key={column.label} style={thStyle}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <TrendRow label="Avail/Week" values={data.columns.map((column) => column.availWeek)} />
              <TrendRow label="Avail/Period" values={data.columns.map((column) => column.availPeriod)} />
              <TrendRow label="Rec/Tran/Adj" values={data.columns.map((column) => column.recTranAdj)} />
              <TrendRow label="Sales" values={data.columns.map((column) => column.sales)} />
              <TrendRow label="ST%/Weekly" values={data.columns.map((column) => column.stWeekly)} decimals={1} />
              <TrendRow label="ST%/Period" values={data.columns.map((column) => column.stPeriod)} decimals={1} />
            </tbody>
          </table>
        </div>
      )}
    </DraggableModal>
  );
};

const TrendRow: React.FC<{ label: string; values: Array<number | null>; decimals?: number }> = ({
  label,
  values,
  decimals = 0,
}) => (
  <tr>
    <th style={labelStyle}>{label}</th>
    {values.map((value, index) => (
      <td key={`${label}-${index}`} style={tdStyle}>
        {formatTrendValue(value, decimals)}
      </td>
    ))}
  </tr>
);

function formatTrendValue(value: number | null, decimals: number): string {
  if (value == null) return '.';
  return new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
