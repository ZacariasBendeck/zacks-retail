import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Spin, Typography } from 'antd';
import { DraggableModal } from '../../../../components/draggable-modal';
import { fetchInquiryInfo, type InquiryInfoDetail, type InquiryInfoMetricCell } from '../../../../services/ricsInventoryApi';

const wrapperStyle: React.CSSProperties = {
  border: '1px solid #9da3ab',
  background: '#f3f3f3',
  padding: 10,
};

const splitStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'stretch',
};

const panelStyle: React.CSSProperties = {
  border: '1px solid #9da3ab',
  background: '#efefef',
  padding: 10,
};

const labelCellStyle: React.CSSProperties = {
  width: 96,
  padding: '3px 6px 3px 0',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
  fontSize: 12,
};

const valueBoxStyle: React.CSSProperties = {
  border: '1px solid #9da3ab',
  background: '#fff',
  minHeight: 22,
  padding: '2px 6px',
  fontSize: 12,
  display: 'flex',
  alignItems: 'center',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textAlign: 'center',
  marginBottom: 8,
  textDecoration: 'underline',
};

const salesTableStyle: React.CSSProperties = {
  borderCollapse: 'collapse',
  width: '100%',
  fontSize: 12,
};

const salesHeaderStyle: React.CSSProperties = {
  border: '1px solid #8f8f8f',
  background: '#efefef',
  padding: '2px 6px',
  textAlign: 'right',
  fontWeight: 400,
};

const salesLabelStyle: React.CSSProperties = {
  ...salesHeaderStyle,
  textAlign: 'left',
};

const salesValueStyle: React.CSSProperties = {
  border: '1px solid #8f8f8f',
  background: '#fff',
  padding: '2px 6px',
  textAlign: 'right',
};

interface InfoTabProps {
  skuCode: string;
  storeId?: number;
  onClose: () => void;
}

export const InfoTab: React.FC<InfoTabProps> = ({ skuCode, storeId, onClose }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['inquiry-info', skuCode, storeId ?? null],
    queryFn: () => fetchInquiryInfo(skuCode, storeId),
    staleTime: 30_000,
  });

  const title = `Information for SKU ${skuCode}${data ? ` for ${data.scopeLabel}` : ''}`;

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
      width={860}
      destroyOnHidden
    >
      {isLoading && (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin />
        </div>
      )}
      {error && <Typography.Text type="danger">{(error as Error).message}</Typography.Text>}
      {data && (
        <div style={wrapperStyle}>
          <div style={splitStyle}>
            <div style={{ ...panelStyle, flex: '1 1 58%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <FieldRow label="Season" value={joinCodeAndDescription(data.seasonCode, data.seasonDescription)} />
                  <FieldRow label="Label Code" value={data.labelCode} narrow />
                  <FieldRow label="Group Code" value={joinCodeAndDescription(data.groupCode, data.groupDescription)} />
                  <tr><td colSpan={2} style={{ height: 14 }} /></tr>
                  <FieldRow label="Date Last Markdown" value={formatDateValue(data.lastMarkdownAt)} />
                  <FieldRow label="Perks" value={formatFixed(data.perks, 2)} narrow />
                </tbody>
              </table>

              <div style={{ marginTop: 70 }}>
                <div style={{ fontSize: 12, marginBottom: 2 }}>Keywords</div>
                <div style={{ ...valueBoxStyle, minHeight: 64, alignItems: 'flex-start', whiteSpace: 'pre-wrap' }}>
                  {data.keywords?.trim() || data.comment?.trim() || ''}
                </div>
              </div>
            </div>

            <div style={{ ...panelStyle, flex: '0 0 40%' }}>
              <div style={sectionTitleStyle}>Prior 12 Months Sales</div>
              <table style={salesTableStyle}>
                <thead>
                  <tr>
                    <th style={salesLabelStyle}></th>
                    <th style={salesHeaderStyle}>Qty</th>
                    <th style={salesHeaderStyle}>Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {data.prior12Months.map((row) => (
                    <tr key={row.label}>
                      <td style={salesLabelStyle}>{row.label}</td>
                      <td style={salesValueStyle}>{formatInteger(row.qty)}</td>
                      <td style={salesValueStyle}>{formatMoney(row.sales)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th style={salesLabelStyle}>Total</th>
                    <th style={salesValueStyle}>{formatInteger(data.totals.qty)}</th>
                    <th style={salesValueStyle}>{formatMoney(data.totals.sales)}</th>
                  </tr>
                </tbody>
              </table>

              <div style={{ marginTop: 18 }}>
                <table style={salesTableStyle}>
                  <thead>
                    <tr>
                      <th style={salesLabelStyle}></th>
                      <th style={salesHeaderStyle}>M-T-D</th>
                      <th style={salesHeaderStyle}>S-T-D</th>
                      <th style={salesHeaderStyle}>Y-T-D</th>
                    </tr>
                  </thead>
                  <tbody>
                    <MetricRow label="G.P. %" cells={[data.metrics.mtd, data.metrics.std, data.metrics.ytd]} pick="gpPct" />
                    <MetricRow label="ROI" cells={[data.metrics.mtd, data.metrics.std, data.metrics.ytd]} pick="roi" />
                    <MetricRow label="TURNS" cells={[data.metrics.mtd, data.metrics.std, data.metrics.ytd]} pick="turns" />
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </DraggableModal>
  );
};

const FieldRow: React.FC<{ label: string; value: string | null; narrow?: boolean }> = ({ label, value, narrow = false }) => (
  <tr>
    <td style={labelCellStyle}>{label}</td>
    <td style={{ padding: '3px 0' }}>
      <div style={{ ...valueBoxStyle, width: narrow ? 120 : '100%' }}>{value ?? ''}</div>
    </td>
  </tr>
);

const MetricRow: React.FC<{
  label: string;
  cells: InquiryInfoMetricCell[];
  pick: keyof InquiryInfoMetricCell;
}> = ({ label, cells, pick }) => (
  <tr>
    <th style={salesLabelStyle}>{label}</th>
    {cells.map((cell, index) => (
      <td key={`${label}-${index}`} style={salesValueStyle}>
        {formatMetric(cell[pick], pick)}
      </td>
    ))}
  </tr>
);

function joinCodeAndDescription(code: string | null, description: string | null): string | null {
  const trimmedCode = code?.trim() || null;
  const trimmedDescription = description?.trim() || null;
  if (trimmedCode && trimmedDescription) return `${trimmedCode} - ${trimmedDescription}`;
  return trimmedCode ?? trimmedDescription;
}

function formatDateValue(value: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US').format(parsed);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatFixed(value: number | null, decimals: number): string {
  if (value == null) return '';
  return new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('es-HN', {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMetric(value: number | null, pick: keyof InquiryInfoMetricCell): string {
  if (value == null) return '0';
  if (pick === 'turns') {
    return new Intl.NumberFormat('es-HN', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  }
  if (pick === 'roi') {
    return new Intl.NumberFormat('es-HN', {
      maximumFractionDigits: 0,
    }).format(value);
  }
  return new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value);
}

export type { InquiryInfoDetail };
