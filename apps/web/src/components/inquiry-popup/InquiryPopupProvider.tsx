import React from 'react';
import { Drawer } from 'antd';
import { InquiryBody } from '../../pages/products/inquiry/InquiryBody';

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
  const [state, setState] = React.useState<{ open: boolean; skuCode: string; storeId?: number }>({
    open: false,
    skuCode: '',
  });

  const openInquiry = React.useCallback((args: OpenArgs) => {
    setState({ open: true, skuCode: args.skuCode, storeId: args.storeId });
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
    },
    [],
  );

  return (
    <InquiryPopupContext.Provider value={ctx}>
      {children}
      <Drawer
        title={state.skuCode ? `Inventory Inquiry — ${state.skuCode}` : 'Inventory Inquiry'}
        placement="right"
        width="90%"
        open={state.open}
        onClose={closeInquiry}
        destroyOnClose
        // Drawer body padding is generous by default; trim it so the dense
        // inquiry layout (12px base font) has room to breathe horizontally.
        styles={{ body: { padding: 12 } }}
      >
        {state.open && (
          <InquiryBody
            skuCode={state.skuCode}
            storeId={state.storeId}
            onPickSku={handlePickSku}
          />
        )}
      </Drawer>
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
