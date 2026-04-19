import React, { useMemo, useState } from 'react';
import { Button, Checkbox, Input, Modal, Radio, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
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
  const [pendingDesc, setPendingDesc] = useState('');
  const [descContains, setDescContains] = useState('');
  const [wholeWord, setWholeWord] = useState(false);
  const [sort, setSort] = useState<SkuLookupSort>('SKU');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SkuLookupRow | null>(null);
  const navigate = useNavigate();

  const queryParams = useMemo(
    () => ({ q, descContains, wholeWord, sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    [q, descContains, wholeWord, sort, page]
  );

  const { data, isFetching } = useQuery({
    queryKey: ['sku-lookup', queryParams],
    queryFn: () => searchSkusForLookup(queryParams),
    enabled: open,
    staleTime: 30_000,
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
          loading={isFetching}
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
