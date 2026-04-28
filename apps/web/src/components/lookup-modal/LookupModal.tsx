import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, Space, Table, Typography } from 'antd';
import type { InputRef } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DraggableModal } from '../draggable-modal';

// Generic "pick one row from a searchable list" modal. Owns the shell, so
// every lookup in the app (SKU, vendor, customer, category, employee, …)
// inherits the same debounce, keyboard nav, pagination, and save/cancel chrome.
//
// Callers provide what's actually different: title, columns, rowKey, and a
// `searchFn` that takes `(query, page, pageSize)` and resolves to rows + total.
// Optional slots let a caller insert its own filters, search-field toggle,
// extra footer buttons, or helper text without forking this component.
//
// Design notes:
//  - `searchFn` is expected to be memoized by the caller (useCallback). When
//    any filter it closes over changes, its identity changes, which triggers
//    a refetch and resets to page 1 — that's how the caller signals "filters
//    changed, start over".
//  - Keyboard nav: ↑/↓ walk rows (wraps across page boundaries when on a
//    middle page), PgUp/PgDn step full pages, Enter confirms the highlight
//    (falling back to the first row if nothing is highlighted yet), ↓ from
//    the search input jumps into the first row.
//  - Single-select only. If multi-select comes up later, add a `mode` prop.

export interface LookupModalSearchArgs {
  query: string;
  page: number;
  pageSize: number;
}

export interface LookupModalSearchResult<T> {
  rows: T[];
  total: number;
}

export interface LookupModalProps<T> {
  open: boolean;
  onClose: () => void;
  onSelect: (row: T) => void;
  /** Optional fallback for "no rows, but accept the typed query anyway". */
  onSubmitQuery?: (query: string) => void;
  title: string;
  /** Must be stable. Memoize via useCallback — when it changes, the modal
   *  resets to page 1 and refetches (treated as "filters changed"). */
  searchFn: (args: LookupModalSearchArgs) => Promise<LookupModalSearchResult<T>>;
  columns: ColumnsType<T>;
  /** Uniquely identifies a row. String = dataIndex, function = custom. */
  rowKey: keyof T | string | ((row: T) => string);
  /** Default 960. SKU lookup needs more columns; vendor-style lookups 640. */
  width?: number;
  /** Default 50. */
  pageSize?: number;
  placeholder?: string;
  /** Search input starts pre-filled with this (typically the operator's
   *  current value in the form field so they don't retype). */
  initialQuery?: string;
  /** Renders to the right of the search input on the same row. Typical use:
   *  a Radio.Group that toggles which field the caller's searchFn searches. */
  searchFieldSlot?: React.ReactNode;
  /** Renders between the search row and the table. Typical use: filter Selects. */
  filterSlot?: React.ReactNode;
  /** Rendered in the footer next to Save/Cancel. Typical use: an "Add" button. */
  footerExtras?: React.ReactNode;
  /** Small muted text beneath the table. Good spot for keyboard-hint copy. */
  helperText?: React.ReactNode;
  /** Label for the confirm button. Default "Save". */
  saveLabel?: string;
  /** Table body scroll height in pixels. Default 432 (was 360 before the
   *  2026-04-25 taller-popup tweak). */
  scrollY?: number;
  /** Reduces row vertical padding to ~2px so a row is only as tall as its
   *  tallest cell content. SKU lookup turns this on so the picture column
   *  drives row height (52px) instead of the antd "small" default. */
  compactRows?: boolean;
}

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_SCROLL_Y = 432;

function resolveRowKey<T>(row: T, rowKey: LookupModalProps<T>['rowKey']): string {
  if (typeof rowKey === 'function') return rowKey(row);
  const v = (row as Record<string, unknown>)[rowKey as string];
  return String(v);
}

export function LookupModal<T>({
  open,
  onClose,
  onSelect,
  onSubmitQuery,
  title,
  searchFn,
  columns,
  rowKey,
  width = 960,
  pageSize = DEFAULT_PAGE_SIZE,
  placeholder = 'Prefix match — press ↓ to enter the list, ←/→ to page, Enter to pick',
  initialQuery = '',
  searchFieldSlot,
  filterSlot,
  footerExtras,
  helperText,
  saveLabel = 'Save',
  scrollY = DEFAULT_SCROLL_Y,
  compactRows = false,
}: LookupModalProps<T>): React.ReactElement {
  const [q, setQ] = useState(initialQuery);
  const [debouncedQ, setDebouncedQ] = useState(initialQuery);
  const [page, setPage] = useState(1);
  // -1 means "no row focused" — the search input has focus.
  const [highlighted, setHighlighted] = useState(-1);
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const inputRef = useRef<InputRef>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // When the user arrows past the last row (or above the first), we page
  // and stash where the highlight should land once the new data arrives.
  const pendingLandingRef = useRef<'top' | 'bottom' | null>(null);

  // ArrowDown pressed before the first fetch lands → queue "highlight first
  // row when rows arrive" so the operator's keystroke is honored even if
  // they pressed ↓ in the brief window before initial results returned.
  const wantsFirstRowOnLoadRef = useRef(false);

  // Mirror rows + highlighted into refs so the keydown handler reads the
  // freshest values. userEvent fires keydowns back-to-back without letting
  // React re-render between them, so closure-captured state goes stale fast.
  const rowsRef = useRef<T[]>(rows);
  const highlightedRef = useRef(highlighted);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  useEffect(() => { highlightedRef.current = highlighted; }, [highlighted]);

  // Reset to initial query + page 1 each time the modal re-opens so the
  // operator always starts fresh (matches RICS desktop behaviour).
  useEffect(() => {
    if (!open) return;
    setQ(initialQuery);
    setDebouncedQ(initialQuery);
    setPage(1);
    setHighlighted(-1);
    wantsFirstRowOnLoadRef.current = false;
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, initialQuery]);

  // Debounce so we only query after the operator pauses typing.
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(h);
  }, [q]);

  // Any change to the query or filters (via a new searchFn identity) resets
  // page to 1 and clears the highlight — old indices point at a different
  // row set now.
  useEffect(() => {
    setPage(1);
    setHighlighted(-1);
  }, [debouncedQ, searchFn]);

  // Fetch. Cancellation guards against a stale response landing after the
  // user has typed further.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoading(true);
    searchFn({ query: debouncedQ, page, pageSize })
      .then((res) => {
        if (cancelled) return;
        setRows(res.rows);
        setTotal(res.total);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setTotal(0);
        setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, searchFn, debouncedQ, page, pageSize]);

  // After a page change lands new rows, resolve where the highlight should
  // go. 'top' = first row (arrowed down past end of prev page), 'bottom' =
  // last row (arrowed up past top of next page). Sync highlightedRef
  // synchronously so a still-firing auto-repeating keydown doesn't use
  // the stale value and trigger another page advance.
  useEffect(() => {
    const pending = pendingLandingRef.current;
    if (pending && rows.length > 0) {
      const next = pending === 'top' ? 0 : rows.length - 1;
      pendingLandingRef.current = null;
      highlightedRef.current = next;
      setHighlighted(next);
      return;
    }
    // ArrowDown pressed before initial rows arrived — honor it now.
    if (wantsFirstRowOnLoadRef.current && rows.length > 0) {
      wantsFirstRowOnLoadRef.current = false;
      highlightedRef.current = 0;
      setHighlighted(0);
    }
  }, [rows]);

  // Keep the highlighted row visible as the operator arrow-keys through.
  useEffect(() => {
    if (highlighted < 0) return;
    const row = rows[highlighted];
    if (!row) return;
    const container = tableContainerRef.current;
    if (!container) return;
    const key = resolveRowKey(row, rowKey);
    // CSS.escape defends against keys with special chars in selectors.
    const target = container.querySelector<HTMLElement>(`tr[data-row-key="${CSS.escape(key)}"]`);
    // jsdom (tests) doesn't implement scrollIntoView — guard so tests stay green.
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted, rows, rowKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedRow = highlighted >= 0 ? rows[highlighted] ?? null : null;

  const confirmSelection = useCallback((row: T | null | undefined) => {
    if (!row) return;
    onSelect(row);
    onClose();
  }, [onSelect, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentRows = rowsRef.current;

    // If a page change is already in flight (landing not yet resolved), ignore
    // navigation keys — otherwise holding ↓ rips through several pages before
    // the first fetch lands because rows still points at the old page.
    const pageInFlight = pendingLandingRef.current !== null;

    // ←/→ paginate the modal, but only when the user isn't editing text in
    // the search input. If the input has any value AND it has focus, we let
    // the browser handle ←/→ for cursor movement.
    const target = e.target as HTMLElement | null;
    const inEditableInput =
      target?.tagName === 'INPUT' &&
      (target as HTMLInputElement).type !== 'checkbox' &&
      (target as HTMLInputElement).type !== 'radio' &&
      (target as HTMLInputElement).value.length > 0;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (pageInFlight) return;
      // No rows yet (first fetch hasn't returned) — queue the highlight so
      // the keystroke isn't lost. Once rows arrive, the load-effect honors it.
      if (currentRows.length === 0) {
        wantsFirstRowOnLoadRef.current = true;
        return;
      }
      const prev = highlightedRef.current;
      if (prev === currentRows.length - 1 && page < totalPages) {
        pendingLandingRef.current = 'top';
        setPage(page + 1);
        return;
      }
      const next = prev === -1 ? 0 : Math.min(prev + 1, currentRows.length - 1);
      highlightedRef.current = next;
      setHighlighted(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (pageInFlight) return;
      if (currentRows.length === 0) return;
      const prev = highlightedRef.current;
      if (prev === 0 && page > 1) {
        pendingLandingRef.current = 'bottom';
        setPage(page - 1);
        return;
      }
      const next = Math.max(prev - 1, -1);
      highlightedRef.current = next;
      setHighlighted(next);
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      // ArrowRight = next page (skipped if user is editing text in input).
      if (e.key === 'ArrowRight' && inEditableInput) return;
      if (page >= totalPages) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      if (pageInFlight) return;
      pendingLandingRef.current = 'top';
      setPage(page + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      // ArrowLeft = previous page (skipped if user is editing text in input).
      if (e.key === 'ArrowLeft' && inEditableInput) return;
      if (page <= 1) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      if (pageInFlight) return;
      pendingLandingRef.current = 'top';
      setPage(page - 1);
    } else if (e.key === 'Enter') {
      if (currentRows.length === 0) {
        const typed = q.trim();
        if (typed && onSubmitQuery) {
          e.preventDefault();
          onSubmitQuery(typed);
        }
        return;
      }
      const idx = highlightedRef.current;
      const pick = idx >= 0 ? currentRows[idx] : currentRows[0];
      if (pick) {
        e.preventDefault();
        confirmSelection(pick);
      }
    }
  };

  const rowKeyForTable = typeof rowKey === 'function'
    ? (rowKey as (row: T) => string)
    : (rowKey as string);

  return (
    <DraggableModal
      title={title}
      open={open}
      onCancel={onClose}
      width={width}
      destroyOnHidden
      footer={[
        <Button
          key="save"
          type="primary"
          disabled={!selectedRow}
          onClick={() => confirmSelection(selectedRow)}
        >
          {saveLabel}
        </Button>,
        <Button key="cancel" onClick={onClose}>Cancel</Button>,
        footerExtras ? <React.Fragment key="extras">{footerExtras}</React.Fragment> : null,
      ]}
    >
      <div onKeyDown={handleKeyDown}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space wrap>
            <Input
              ref={inputRef}
              autoFocus
              value={q}
              placeholder={placeholder}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              style={{ width: 320 }}
              allowClear
            />
            {searchFieldSlot}
          </Space>

          {filterSlot}

          <div ref={tableContainerRef} className={compactRows ? 'lookup-modal-compact' : undefined}>
            <Table<T>
              rowKey={rowKeyForTable}
              size="small"
              loading={isLoading}
              dataSource={rows}
              columns={columns}
              pagination={{
                current: page,
                pageSize,
                total,
                onChange: setPage,
                showSizeChanger: false,
              }}
              onRow={(record, index) => ({
                onClick: () => setHighlighted(index ?? -1),
                onDoubleClick: () => confirmSelection(record),
                style:
                  index === highlighted
                    ? { backgroundColor: '#e6f4ff', cursor: 'pointer' }
                    : { cursor: 'pointer' },
              })}
              scroll={{ y: scrollY }}
            />
            {compactRows ? (
              <style>{`
                .lookup-modal-compact .ant-table-cell {
                  padding-top: 2px !important;
                  padding-bottom: 2px !important;
                  line-height: 1.2 !important;
                }
              `}</style>
            ) : null}
          </div>

          {helperText ? (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {helperText}
            </Typography.Text>
          ) : null}
        </Space>
      </div>
    </DraggableModal>
  );
}
