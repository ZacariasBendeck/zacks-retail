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

const PAGE_SIZE = 50;
const SORT_OPTIONS: Array<{ value: SkuLookupSort; label: string }> = [
  { value: 'SKU',         label: 'SKU' },
  { value: 'DESCRIPTION', label: 'Description' },
  { value: 'VENDOR',      label: 'Vendor' },
  { value: 'STYLE_COLOR', label: 'Style/Color' },
];

export const SkuLookup: React.FC<SkuLookupProps> = ({
  open, onClose, onSelect, initialQuery = '', allowCreate = false,
}) => {
  const [q, setQ] = useState(initialQuery);
  const [debouncedQ, setDebouncedQ] = useState(initialQuery);
  const [pendingDesc, setPendingDesc] = useState('');
  const [descContains, setDescContains] = useState('');
  const [wholeWord, setWholeWord] = useState(false);
  const [sort, setSort] = useState<SkuLookupSort>('SKU');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SkuLookupRow | null>(null);
  const navigate = useNavigate();

  // Debounce the SKU prefix so we only query after the user pauses typing.
  // The live-query fallback in the backend (when a SKU is past the snapshot
  // cap) costs ~2 seconds; firing per-keystroke would stack those requests.
  React.useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(h);
  }, [q]);

  const queryParams = useMemo(
    () => ({ q: debouncedQ, descContains, wholeWord, sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    [debouncedQ, descContains, wholeWord, sort, page]
  );

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ['sku-lookup', queryParams],
    queryFn: () => searchSkusForLookup(queryParams),
    // Always kept warm — refetched in the background but the modal never waits
    // on a spinner to re-show the rows it already has. TanStack caches results
    // across opens so the second time the modal opens it shows instantly.
    enabled: true,
    staleTime: 5 * 60_000,  // 5 min — the backend index refreshes every 10 min
    gcTime: 15 * 60_000,
    placeholderData: keepPreviousData,
  });

  const columns: ColumnsType<SkuLookupRow> = [
    { title: 'SKU',         dataIndex: 'skuCode',      key: 'skuCode',      width: 140 },
    { title: 'Description', dataIndex: 'description',  key: 'description' },
    { title: 'Vendor',      dataIndex: 'vendor',       key: 'vendor',       width: 100 },
    { title: 'Categ.',      dataIndex: 'category',     key: 'category',     width: 80 },
    { title: 'Style/Color', dataIndex: 'styleColor',   key: 'styleColor',   width: 160 },
    {
      title: 'Price',
      dataIndex: 'currentPrice',
      key: 'currentPrice',
      width: 100,
      align: 'right',
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
            SKU:&nbsp;
            <Input
              autoFocus
              value={q}
              placeholder="Prefix match"
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              style={{ width: 200 }}
            />
          </label>

          <Radio.Group
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
          >
            {SORT_OPTIONS.map((opt) => (
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
          // Only show the overlay spinner on the very first load (no data yet).
          // Background refetches keep the cached rows visible — this matches
          // the RICS feel where the list is there the moment the modal opens.
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
