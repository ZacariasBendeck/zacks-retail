import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Modal, Radio, Select, Space, Table } from 'antd';
import type { InputRef } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  fetchSkuLookupFacets,
  searchSkusForLookup,
  type SkuLookupRow,
  type SkuLookupSort,
} from '../../services/skuApi';

export interface SkuLookupProps {
  open: boolean;
  onClose: () => void;
  onSelect: (picked: { skuCode: string; skuId: string }) => void;
  initialQuery?: string;
  allowCreate?: boolean;
}

type SearchField = SkuLookupSort; // 'SKU' | 'DESCRIPTION' | 'VENDOR' | 'STYLE_COLOR'

const PAGE_SIZE = 50;
const SEARCH_FIELD_OPTIONS: Array<{ value: SearchField; label: string; prompt: string }> = [
  { value: 'SKU',         label: 'SKU',         prompt: 'SKU' },
  { value: 'DESCRIPTION', label: 'Description', prompt: 'Description' },
  { value: 'VENDOR',      label: 'Vendor',      prompt: 'Vendor' },
  { value: 'STYLE_COLOR', label: 'Style/Color', prompt: 'Style/Color' },
];

export const SkuLookup: React.FC<SkuLookupProps> = ({
  open, onClose, onSelect, initialQuery = '', allowCreate = false,
}) => {
  const [q, setQ] = useState(initialQuery);
  const [debouncedQ, setDebouncedQ] = useState(initialQuery);
  const [searchField, setSearchField] = useState<SearchField>('SKU');
  const [season, setSeason] = useState<string | undefined>(undefined);
  const [vendor, setVendor] = useState<string | undefined>(undefined);
  const [department, setDepartment] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  // `highlighted` drives keyboard navigation; it's an index into the current
  // result page. -1 means "no row focused" — the search input is active.
  const [highlighted, setHighlighted] = useState(-1);
  const navigate = useNavigate();
  const inputRef = useRef<InputRef>(null);

  // Debounce the prefix so we only query after the user pauses typing.
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(h);
  }, [q]);

  // Reset the highlighted row whenever the query or filters change — the row
  // set is completely different, so the old index is meaningless. Page changes
  // are handled separately so we can "wrap" to the top or bottom of the new
  // page when the user arrow-keys across a page boundary.
  useEffect(() => {
    setHighlighted(-1);
  }, [debouncedQ, season, vendor, department, searchField]);

  // When the user arrows past the last row, we advance the page and stash
  // where the highlight should land once the new data arrives. Same idea in
  // reverse for ArrowUp past the top row.
  const pendingLandingRef = useRef<'top' | 'bottom' | null>(null);

  const queryParams = useMemo(
    () => ({
      q: debouncedQ,
      searchField,
      season,
      vendor,
      department,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [debouncedQ, searchField, season, vendor, department, page]
  );

  const { data, isLoading } = useQuery({
    queryKey: ['sku-lookup', queryParams],
    queryFn: () => searchSkusForLookup(queryParams),
    enabled: open,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    placeholderData: keepPreviousData,
  });

  const { data: facets } = useQuery({
    queryKey: ['sku-lookup-facets'],
    queryFn: fetchSkuLookupFacets,
    enabled: open,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedRow = highlighted >= 0 ? rows[highlighted] ?? null : null;

  // Mirror row data + highlighted into refs so the keydown handler reads
  // the freshest values — userEvent fires keydowns back-to-back without
  // letting React re-render between them, so closure-captured state goes
  // stale fast.
  const rowsRef = useRef<SkuLookupRow[]>(rows);
  const highlightedRef = useRef(highlighted);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  useEffect(() => {
    highlightedRef.current = highlighted;
  }, [highlighted]);

  // After a page change lands new rows, resolve where the highlight should go.
  // 'top' → first row (wrapped from previous page's ArrowDown past the end);
  // 'bottom' → last row (wrapped from next page's ArrowUp past the top).
  // We update `highlightedRef` synchronously as well — the ref-syncing effect
  // for `highlighted` only runs on the next commit, and an auto-repeating
  // keydown firing in that window would otherwise see the stale row index
  // and trigger another page advance.
  useEffect(() => {
    const pending = pendingLandingRef.current;
    if (!pending) return;
    if (rows.length === 0) return;
    const next = pending === 'top' ? 0 : rows.length - 1;
    pendingLandingRef.current = null;
    highlightedRef.current = next;
    setHighlighted(next);
  }, [rows]);

  // When the highlighted row changes, pull it into view inside the scrollable
  // table body. Otherwise the highlight walks past the viewport and the user
  // can't see what they're arrow-keying toward.
  useEffect(() => {
    if (highlighted < 0) return;
    const row = rows[highlighted];
    if (!row) return;
    const container = tableContainerRef.current;
    if (!container) return;
    // CSS.escape defends against SKU codes with special characters in selectors.
    const target = container.querySelector<HTMLElement>(
      `tr[data-row-key="${CSS.escape(row.skuId)}"]`,
    );
    // jsdom (tests) doesn't implement scrollIntoView — guard so tests stay green.
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted, rows]);

  const confirmSelection = (row: SkuLookupRow | null | undefined) => {
    if (!row) return;
    onSelect({ skuCode: row.skuCode, skuId: row.skuId });
    onClose();
  };

  // Modal-wide keyboard handler — ArrowDown from the input moves focus into
  // the rows; ArrowUp/Down shifts the highlight; Enter confirms the
  // highlighted row (or the first row if none yet).
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentRows = rowsRef.current;
    if (currentRows.length === 0) return;
    // If a page change is already in flight (landing not yet resolved), ignore
    // navigation keys — otherwise holding ↓ rips through several pages before
    // the first fetch lands because `rows` still points at the old page.
    const pageInFlight = pendingLandingRef.current !== null;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (pageInFlight) return;
      const prev = highlightedRef.current;
      // At the last row on a non-final page → advance to the next page and
      // land at the top once it loads.
      if (prev === currentRows.length - 1 && page < totalPages) {
        pendingLandingRef.current = 'top';
        setPage(page + 1);
        return;
      }
      const next = prev === -1 ? 0 : Math.min(prev + 1, currentRows.length - 1);
      highlightedRef.current = next;
      setHighlighted(next);
      // Keep the Input focused so further Arrow/Enter keys keep firing on
      // something. preventDefault stops the caret from moving inside it.
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (pageInFlight) return;
      const prev = highlightedRef.current;
      // At the top row on a later page → step back a page and land at the
      // bottom so the user's mental model of "keep scrolling up" holds.
      if (prev === 0 && page > 1) {
        pendingLandingRef.current = 'bottom';
        setPage(page - 1);
        return;
      }
      const next = Math.max(prev - 1, -1);
      highlightedRef.current = next;
      setHighlighted(next);
    } else if (e.key === 'PageDown' && page < totalPages) {
      e.preventDefault();
      if (pageInFlight) return;
      pendingLandingRef.current = 'top';
      setPage(page + 1);
    } else if (e.key === 'PageUp' && page > 1) {
      e.preventDefault();
      if (pageInFlight) return;
      pendingLandingRef.current = 'top';
      setPage(page - 1);
    } else if (e.key === 'Enter') {
      const idx = highlightedRef.current;
      const pick = idx >= 0 ? currentRows[idx] : currentRows[0];
      if (pick) {
        e.preventDefault();
        confirmSelection(pick);
      }
    }
  };

  const columns: ColumnsType<SkuLookupRow> = [
    {
      title: '',
      key: 'thumb',
      width: 64,
      render: (_: unknown, record: SkuLookupRow) =>
        record.pictureUrl ? (
          <img
            src={record.pictureUrl}
            alt=""
            loading="lazy"
            style={{ width: 52, height: 52, objectFit: 'cover', border: '1px solid #eee', borderRadius: 3 }}
          />
        ) : (
          <span style={{ display: 'inline-block', width: 52, height: 52, border: '1px dashed #ddd', borderRadius: 3, color: '#ccc', textAlign: 'center', lineHeight: '52px', fontSize: 12 }}>—</span>
        ),
    },
    {
      title: 'SKU',
      dataIndex: 'skuCode',
      key: 'skuCode',
      width: 140,
      sorter: (a, b) => a.skuCode.localeCompare(b.skuCode),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      sorter: (a, b) => a.description.localeCompare(b.description),
    },
    {
      title: 'Vendor',
      dataIndex: 'vendor',
      key: 'vendor',
      width: 100,
      sorter: (a, b) => a.vendor.localeCompare(b.vendor),
    },
    {
      title: 'Categ.',
      dataIndex: 'category',
      key: 'category',
      width: 80,
      sorter: (a, b) => a.category.localeCompare(b.category),
    },
    {
      title: 'Style/Color',
      dataIndex: 'styleColor',
      key: 'styleColor',
      width: 160,
      sorter: (a, b) => (a.styleColor ?? '').localeCompare(b.styleColor ?? ''),
    },
    {
      title: 'Price',
      dataIndex: 'currentPrice',
      key: 'currentPrice',
      width: 100,
      align: 'right',
      sorter: (a, b) => (a.currentPrice ?? 0) - (b.currentPrice ?? 0),
      render: (value: number | null) =>
        value == null
          ? '—'
          : new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value),
    },
  ];

  const currentPrompt = SEARCH_FIELD_OPTIONS.find((o) => o.value === searchField)?.prompt ?? 'SKU';

  return (
    <Modal
      title="SKU Lookup"
      open={open}
      onCancel={onClose}
      width={960}
      footer={[
        <Button key="save" type="primary" disabled={!selectedRow} onClick={() => confirmSelection(selectedRow)}>
          Save
        </Button>,
        <Button key="cancel" onClick={onClose}>Cancel</Button>,
        allowCreate ? (
          <Button key="add" onClick={() => { onClose(); navigate('/products/skus/new'); }}>
            Add
          </Button>
        ) : null,
      ]}
    >
      <div onKeyDown={handleKeyDown}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space wrap>
            <label>
              {currentPrompt}:&nbsp;
              <Input
                ref={inputRef}
                autoFocus
                value={q}
                placeholder="Prefix match — press ↓ to enter the list, Enter to pick"
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                style={{ width: 280 }}
              />
            </label>

            <Radio.Group
              value={searchField}
              onChange={(e) => {
                setSearchField(e.target.value);
                // Switching the search column resets the page so the first page
                // of the new column's matches is what we see.
                setPage(1);
              }}
            >
              {SEARCH_FIELD_OPTIONS.map((opt) => (
                <Radio key={opt.value} value={opt.value}>{opt.label}</Radio>
              ))}
            </Radio.Group>
          </Space>

          <Space wrap>
            <span>Restrict to:</span>
            <Select
              placeholder="Season"
              allowClear
              value={season}
              onChange={(v) => { setSeason(v); setPage(1); }}
              options={(facets?.seasons ?? []).map((s) => ({ value: s, label: s }))}
              style={{ width: 180 }}
              showSearch
              optionFilterProp="label"
            />
            <Select
              placeholder="Vendor"
              allowClear
              value={vendor}
              onChange={(v) => { setVendor(v); setPage(1); }}
              options={(facets?.vendors ?? []).map((v) => ({ value: v.code, label: v.label }))}
              style={{ width: 260 }}
              showSearch
              optionFilterProp="label"
            />
            <Select
              placeholder="Department"
              allowClear
              value={department}
              onChange={(v) => { setDepartment(v); setPage(1); }}
              options={(facets?.departments ?? []).map((d) => ({
                value: d.number,
                label: `${d.number} — ${d.name}`,
              }))}
              style={{ width: 220 }}
              showSearch
              optionFilterProp="label"
            />
          </Space>

          <div ref={tableContainerRef}>
          <Table<SkuLookupRow>
            rowKey="skuId"
            size="small"
            loading={isLoading}
            dataSource={rows}
            columns={columns}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: data?.total ?? 0,
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
            scroll={{ y: 360 }}
          />
          </div>
        </Space>
      </div>
    </Modal>
  );
};
