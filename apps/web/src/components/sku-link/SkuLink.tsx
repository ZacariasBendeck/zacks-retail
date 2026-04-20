import React from 'react';
import { Link } from 'react-router-dom';
import { useInquiryPopup } from '../inquiry-popup';

export interface SkuLinkProps {
  skuCode: string;
  storeId?: number;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Clickable SKU code. Plain click opens the Inventory Inquiry popup
 * (an overlay over the current report). Modifier-clicks (Cmd, Ctrl,
 * Shift, middle-click) fall back to native anchor behavior — opening
 * the full-page `/products/inquiry/:skuCode` route in a new tab — so
 * bookmarking and new-tab workflows still work.
 */
export const SkuLink: React.FC<SkuLinkProps> = ({ skuCode, storeId, children, className }) => {
  const encoded = encodeURIComponent(skuCode);
  const qs = storeId !== undefined ? `?storeId=${storeId}` : '';
  const to = `/products/inquiry/${encoded}${qs}`;
  const { openInquiry } = useInquiryPopup();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Let the browser handle modifier-clicks (new tab / new window / download).
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    e.preventDefault();
    openInquiry({ skuCode, storeId });
  };

  return (
    <Link to={to} className={className} onClick={handleClick}>
      {children ?? skuCode}
    </Link>
  );
};
