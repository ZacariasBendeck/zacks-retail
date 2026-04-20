import React, { useMemo, useState } from 'react';
import { Button, Checkbox, Input, Modal, Radio, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
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
  const [pendingDesc, setPendingDesc] = useState('');
  const [descContains, setDescContains] = useState('');
  const [wholeWord, setWholeWord] = useState(false);
  // The radio buttons now drive which column the primary search input
  // filters against — NOT the result sort order. Sort order is controlled
  // by clicking the table column headers instead.
  const [searchField, setSearchField] = useState<SearchField>('SKU');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SkuLookupRow | null>(null);
  const navigate = useNavigate();

  // Debounce the prefix so we only query after the user pauses typing.
  React.useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(h);
  }, [q]);

  const queryParams = useMemo(
    () => ({
      q: debouncedQ,
      descContains,
      wholeWord,
      searchField,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [debouncedQ, descContains, wholeWord, searchField, page]
  );

  const { data, isLoading } = useQuery({
    queryKey: ['sku-lookup', queryParams],
    queryFn: () => searchSkusForLookup(queryParams),
    enabled: true,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    placeholderData: keepPreviousData,
  });

  const columns: ColumnsType<SkuLookupRow> = [
    {
      title: '',
      key: 'thumb',
      width: 44,
      render: (_: unknown, record: SkuLookupRow) =>
        record.pictureUrl ? (
          <img
            src={record.pictureUrl}
            alt=""
            loading="lazy"
            style={{ width: 32, height: 32, objectFit: 'cover', border: '1px solid #eee', borderRadius: 2 }}
          />
        ) : (
          <span style={{ display: 'inline-block', width: 32, height: 32, border: '1px dashed #ddd', borderRadius: 2, color: '#ccc', textAlign: 'center', lineHeight: '32px', fontSize: 10 }}>—</span>
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

  const confirmSelection = (row: SkuLookupRow | null) => {
    if (!row) return;
    onSelect({ skuCode: row.skuCode, skuId: row.skuId });
    onClose();
  };

  const currentPrompt = SEARCH_FIELD_OPTIONS.find((o) => o.value === searchField)?.prompt ?? 'SKU';

  return (
    <Modal
      title="SKU Lookup"
      open={open}
      onCancel={onClose}
      width={900}
      footer={[
        <Button key="save" type="primary" disabled={!selected} onClick={() => confirmSelection(selected)}>
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
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Space wrap>
          <label>
            {currentPrompt}:&nbsp;
            <Input
              autoFocus
              value={q}
              placeholder="Prefix match"
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              style={{ width: 200 }}
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
          <label htmlFor="desc-contains">Restrict search to descriptions containing:</label>
          <Input
            id="desc-contains"
            value={pendingDesc}
            onChange={(e) => setPendingDesc(e.target.value)}
            style={{ width: 200 }}
          />
          <Checkbox
            checked={wholeWord}
            onChange={(e) => setWholeWord(e.target.checked)}
          >
            Whole word only
          </Checkbox>
          <Button onClick={() => { setDescContains(pendingDesc); setPage(1); }}>Go</Button>
        </Space>

        <Table<SkuLookupRow>
          rowKey="skuId"
          size="small"
          loading={isLoading}
          dataSource={data?.rows ?? []}
          columns={columns}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
          }}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: selected ? [selected.skuId] : [],
            onChange: (_keys, rows) => setSelected(rows[0] ?? null),
          }}
          onRow={(record) => ({
            onClick: () => setSelected(record),
            onDoubleClick: () => confirmSelection(record),
          })}
          scroll={{ y: 360 }}
        />
      </Space>
    </Modal>
  );
};
