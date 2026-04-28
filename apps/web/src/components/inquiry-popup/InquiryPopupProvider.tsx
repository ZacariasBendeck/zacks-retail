import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DraggableModal } from '../draggable-modal';
import { InquiryBody } from '../../pages/products/inquiry/InquiryBody';
import type { InquiryTab, NeighborScope } from '../../pages/products/inquiry/ActionBar';
import type { ViewMode } from '../../pages/products/inquiry/ViewModeSelector';

interface OpenArgs {
  skuCode: string;
  storeId?: number;
}

interface InquiryPopupContextValue {
  /** Open (or re-target) the inquiry popup for the given SKU. */
  openInquiry: (args: OpenArgs) => void;
  /** Close the popup programmatically. */
  closeInquiry: () => void;
}

const InquiryPopupContext = React.createContext<InquiryPopupContextValue | null>(null);

/**
 * Wrap the app so any descendant can trigger the app-wide Inventory Inquiry
 * popup via `useInquiryPopup().openInquiry({ skuCode })`.
 *
 * The popup renders the same `<InquiryBody>` the `/products/inquiry/:skuCode`
 * route uses — so the UX is identical to a direct-link inquiry, just
 * overlaid on top of the current view instead of replacing it.
 */
export const InquiryPopupProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [state, setState] = React.useState<{ open: boolean; skuCode: string; storeId?: number }>({
    open: false,
    skuCode: '',
  });
  const [mode, setMode] = React.useState<ViewMode>('ALL_STORES_SUMMARY');
  const [activeTab, setActiveTab] = React.useState<InquiryTab | null>(null);
  const [scope, setScope] = React.useState<NeighborScope>('general');
  const [selectedRow, setSelectedRow] = React.useState<string | null>(null);

  const openInquiry = React.useCallback((args: OpenArgs) => {
    setState({ open: true, skuCode: args.skuCode, storeId: args.storeId });
    setMode('ALL_STORES_SUMMARY');
    setActiveTab(null);
    setScope('general');
    setSelectedRow(null);
  }, []);

  const closeInquiry = React.useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  const ctx = React.useMemo<InquiryPopupContextValue>(
    () => ({ openInquiry, closeInquiry }),
    [openInquiry, closeInquiry],
  );

  // When the user picks a different SKU from the lookup inside the popup,
  // re-point the popup at it instead of navigating away — the whole point
  // of the popup is to keep the caller's context visible underneath.
  const handlePickSku = React.useCallback(
    (picked: { skuCode: string; skuId: string }) => {
      setState((s) => ({ ...s, skuCode: picked.skuCode }));
      setSelectedRow(null);
    },
    [],
  );

  const handleEditSku = React.useCallback(
    (skuCode: string) => {
      setState((s) => ({ ...s, open: false }));
      navigate(`/products/skus/${encodeURIComponent(skuCode)}/edit`);
    },
    [navigate],
  );

  return (
    <InquiryPopupContext.Provider value={ctx}>
      {children}
      <DraggableModal
        title={state.skuCode ? `Inventory Inquiry - ${state.skuCode}` : 'Inventory Inquiry'}
        width="92vw"
        open={state.open}
        onCancel={closeInquiry}
        footer={null}
        destroyOnHidden
        styles={{ body: { padding: 12, maxHeight: 'calc(100vh - 140px)', overflow: 'auto' } }}
      >
        {state.open && (
          <InquiryBody
            skuCode={state.skuCode}
            storeId={state.storeId}
            selectedRow={selectedRow}
            onPickSku={handlePickSku}
            onEditSku={handleEditSku}
            mode={mode}
            activeTab={activeTab}
            scope={scope}
            onModeChange={setMode}
            onActiveTabChange={setActiveTab}
            onScopeChange={setScope}
            onSelectedRowChange={setSelectedRow}
          />
        )}
      </DraggableModal>
    </InquiryPopupContext.Provider>
  );
};

export function useInquiryPopup(): InquiryPopupContextValue {
  const ctx = React.useContext(InquiryPopupContext);
  if (!ctx) {
    throw new Error('useInquiryPopup() must be used inside <InquiryPopupProvider>.');
  }
  return ctx;
}
