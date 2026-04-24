import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { InquiryBody } from './InquiryBody';
import type { ViewMode } from './ViewModeSelector';
import type { InquiryTab, NeighborScope } from './ActionBar';

const VIEW_MODES = new Set<ViewMode>([
  'ON_HAND',
  'ON_ORDER_CURRENT',
  'ON_ORDER_FUTURE',
  'MODEL',
  'SHORT',
  'MTD_SALES',
  'STD_SALES',
  'YTD_SALES',
  'LY_SALES',
  'SINGLE_COLUMN',
  'ALL_STORES_ON_HAND',
  'ALL_STORES_ONE_ROW',
  'ALL_STORES_SUMMARY',
  'MAX',
  'REORDER',
]);

const INQUIRY_TABS = new Set<InquiryTab>(['UPCS', 'POS', 'TREND', 'INFO', 'DETAIL']);
const NEIGHBOR_SCOPES = new Set<NeighborScope>(['general', 'vendor', 'category']);

/**
 * Route-level host for the Inventory Inquiry at `/products/inquiry/:skuCode`.
 *
 * Thin wrapper — reads the SKU and `storeId` query param from the URL and
 * hands them to the shared `<InquiryBody>` which is the same view rendered
 * by the app-wide inquiry popup triggered from `<SkuLink>`.
 */
export const InquiryPage: React.FC = () => {
  const { skuCode: rawSkuCode = '' } = useParams<{ skuCode: string }>();
  const skuCode = decodeURIComponent(rawSkuCode);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const storeIdRaw = params.get('storeId');
  const parsedStoreId = storeIdRaw ? Number(storeIdRaw) : undefined;
  const storeId = parsedStoreId != null && Number.isFinite(parsedStoreId) ? parsedStoreId : undefined;
  const modeRaw = (params.get('mode') ?? 'ALL_STORES_SUMMARY').toUpperCase() as ViewMode;
  const mode = VIEW_MODES.has(modeRaw) ? modeRaw : 'ALL_STORES_SUMMARY';
  const tabRaw = (params.get('tab') ?? '').toUpperCase() as InquiryTab;
  const activeTab = INQUIRY_TABS.has(tabRaw) ? tabRaw : null;
  const scopeRaw = (params.get('scope') ?? 'general').toLowerCase() as NeighborScope;
  const scope = NEIGHBOR_SCOPES.has(scopeRaw) ? scopeRaw : 'general';

  const updateParams = React.useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params);
      mutate(next);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const onPickSku = (picked: { skuCode: string }) => {
    const nextParams = new URLSearchParams(params);
    const qs = nextParams.toString();
    navigate(`/products/inquiry/${encodeURIComponent(picked.skuCode)}${qs ? `?${qs}` : ''}`);
  };

  return (
    <InquiryBody
      skuCode={skuCode}
      storeId={storeId}
      mode={mode}
      activeTab={activeTab}
      scope={scope}
      onPickSku={onPickSku}
      onModeChange={(nextMode) =>
        updateParams((next) => {
          next.set('mode', nextMode);
        })}
      onActiveTabChange={(nextTab) =>
        updateParams((next) => {
          if (nextTab) next.set('tab', nextTab);
          else next.delete('tab');
        })}
      onScopeChange={(nextScope) =>
        updateParams((next) => {
          next.set('scope', nextScope);
        })}
    />
  );
};
