import React, { useCallback, useMemo, useState } from 'react';
import { Button, Radio, Select, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  fetchSkuLookupFacets,
  searchSkusForLookup,
  type SkuLookupFacetQuery,
  type SkuLookupRow,
  type SkuLookupSort,
} from '../../services/skuApi';
import { LookupModal } from '../lookup-modal/LookupModal';

export interface SkuLookupProps {
  open: boolean;
  onClose: () => void;
  onSelect: (picked: { skuCode: string; skuId: string }) => void;
  initialQuery?: string;
  initialFilters?: Pick<SkuLookupFacetQuery, 'season' | 'vendor' | 'department'>;
  allowCreate?: boolean;
  onSubmitQuery?: (skuCode: string) => void;
  searchFnOverride?: (args: { query: string; page: number; pageSize: number }) => Promise<{ rows: SkuLookupRow[]; total: number }>;
  hideSearchFieldSelector?: boolean;
  hideFilters?: boolean;
  helperTextOverride?: React.ReactNode;
  placeholderOverride?: string;
}

type SearchField = SkuLookupSort; // 'SKU' | 'DESCRIPTION' | 'VENDOR' | 'STYLE_COLOR'
type SkuMatchMode = 'contains' | 'prefix';

const SEARCH_FIELD_OPTIONS: Array<{ value: SearchField; label: string }> = [
  { value: 'SKU',         label: 'SKU' },
  { value: 'DESCRIPTION', label: 'Description' },
  { value: 'VENDOR',      label: 'Vendor' },
  { value: 'STYLE_COLOR', label: 'Style/Color' },
];

function cleanCode(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toUpperCase() : undefined;
}

export const SkuLookup: React.FC<SkuLookupProps> = ({
  open, onClose, onSelect, initialQuery = '', initialFilters, allowCreate = false, onSubmitQuery,
  searchFnOverride, hideSearchFieldSelector = false, hideFilters = false, helperTextOverride, placeholderOverride,
}) => {
  const [searchField, setSearchField] = useState<SearchField>('SKU');
  const [skuMatchMode, setSkuMatchMode] = useState<SkuMatchMode>('contains');
  const [season, setSeason] = useState<string | undefined>(() => cleanCode(initialFilters?.season));
  const [vendor, setVendor] = useState<string | undefined>(() => cleanCode(initialFilters?.vendor));
  const [department, setDepartment] = useState<number | undefined>(() => initialFilters?.department);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!open || !initialFilters) return;
    setSeason(cleanCode(initialFilters.season));
    setVendor(cleanCode(initialFilters.vendor));
    setDepartment(initialFilters.department);
  }, [initialFilters?.department, initialFilters?.season, initialFilters?.vendor, open]);

  const { data: facets } = useQuery({
    queryKey: ['sku-lookup-facets', { season, vendor, department }],
    queryFn: () => fetchSkuLookupFacets({ season, vendor, department }),
    enabled: open && !hideFilters,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });

  React.useEffect(() => {
    if (!facets) return;
    if (season && !facets.seasons.some((item) => item.code.toUpperCase() === season.toUpperCase())) setSeason(undefined);
    if (vendor && !facets.vendors.some((item) => item.code.toUpperCase() === vendor.toUpperCase())) setVendor(undefined);
    if (department != null && !facets.departments.some((item) => item.number === department)) {
      setDepartment(undefined);
    }
  }, [department, facets, season, vendor]);

  // Memoised so LookupModal only refetches when a filter actually changes —
  // identity change is the modal's "filters changed, reset page" signal.
  const searchFn = useCallback(
    ({ query, page, pageSize }: { query: string; page: number; pageSize: number }) =>
      searchFnOverride
        ? searchFnOverride({ query, page, pageSize })
        : searchSkusForLookup({
          q: query,
          searchField,
          skuMatchMode: searchField === 'SKU' ? skuMatchMode : undefined,
          season,
          vendor,
          department,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }).then((r) => ({ rows: r.rows, total: r.total })),
    [searchField, skuMatchMode, season, vendor, department, searchFnOverride],
  );

  const columns: ColumnsType<SkuLookupRow> = useMemo(() => [
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
      title: 'SKU', dataIndex: 'skuCode', key: 'skuCode', width: 140,
      sorter: (a, b) => a.skuCode.localeCompare(b.skuCode),
    },
    {
      title: 'Description', dataIndex: 'description', key: 'description',
      sorter: (a, b) => a.description.localeCompare(b.description),
    },
    {
      title: 'Vendor', dataIndex: 'vendor', key: 'vendor', width: 100,
      sorter: (a, b) => a.vendor.localeCompare(b.vendor),
    },
    {
      title: 'Categ.', dataIndex: 'category', key: 'category', width: 80,
      sorter: (a, b) => a.category.localeCompare(b.category),
    },
    {
      title: 'Style/Color', dataIndex: 'styleColor', key: 'styleColor', width: 160,
      sorter: (a, b) => (a.styleColor ?? '').localeCompare(b.styleColor ?? ''),
    },
    {
      title: 'Price', dataIndex: 'currentPrice', key: 'currentPrice', width: 100,
      align: 'right',
      sorter: (a, b) => (a.currentPrice ?? 0) - (b.currentPrice ?? 0),
      render: (value: number | null) =>
        value == null
          ? '—'
          : new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value),
    },
  ], []);

  const searchFieldSlot = (
    <Space wrap>
      <Radio.Group
        value={searchField}
        onChange={(e) => setSearchField(e.target.value)}
      >
        {SEARCH_FIELD_OPTIONS.map((opt) => (
          <Radio key={opt.value} value={opt.value}>{opt.label}</Radio>
        ))}
      </Radio.Group>
      {searchField === 'SKU' ? (
        <Space size={4}>
          <Typography.Text type="secondary">SKU match:</Typography.Text>
          <Radio.Group
            aria-label="SKU match mode"
            optionType="button"
            buttonStyle="solid"
            size="small"
            value={skuMatchMode}
            onChange={(e) => setSkuMatchMode(e.target.value)}
          >
            <Radio.Button value="prefix">Starts with</Radio.Button>
            <Radio.Button value="contains">Contains</Radio.Button>
          </Radio.Group>
        </Space>
      ) : null}
    </Space>
  );

  const placeholder = placeholderOverride
    ?? (searchField === 'SKU'
      ? skuMatchMode === 'prefix'
        ? 'Search SKU - starts with typed text'
        : 'Search SKU - SKU matches anywhere'
      : 'Search selected field');

  const filterSlot = (
    <Space wrap>
      <span>Restrict to:</span>
      <Select
        placeholder="Season"
        allowClear
        value={season}
        onChange={setSeason}
        options={(facets?.seasons ?? []).map((s) => ({ value: s.code, label: s.label }))}
        style={{ width: 180 }}
        showSearch
        optionFilterProp="label"
      />
      <Select
        placeholder="Vendor"
        allowClear
        value={vendor}
        onChange={setVendor}
        options={(facets?.vendors ?? []).map((v) => ({ value: v.code, label: v.label }))}
        style={{ width: 260 }}
        showSearch
        optionFilterProp="label"
      />
      <Select
        placeholder="Department"
        allowClear
        value={department}
        onChange={setDepartment}
        options={(facets?.departments ?? []).map((d) => ({
          value: d.number,
          label: `${d.number} — ${d.name}`,
        }))}
        style={{ width: 220 }}
        showSearch
        optionFilterProp="label"
      />
    </Space>
  );

  const footerExtras = allowCreate ? (
    <Button onClick={() => { onClose(); navigate('/products/skus/new'); }}>
      Add
    </Button>
  ) : null;

  return (
    <LookupModal<SkuLookupRow>
      open={open}
      onClose={onClose}
      onSelect={(row) => onSelect({ skuCode: row.skuCode, skuId: row.skuId })}
      title="SKU Lookup"
      searchFn={searchFn}
      columns={columns}
      rowKey="skuId"
      width={960}
      pageSize={50}
      initialQuery={initialQuery}
      placeholder={placeholder}
      searchFieldSlot={hideSearchFieldSelector ? null : searchFieldSlot}
      filterSlot={hideFilters ? null : filterSlot}
      footerExtras={footerExtras}
      helperText={helperTextOverride}
      onSubmitQuery={searchField === 'SKU' ? onSubmitQuery : undefined}
      compactRows
    />
  );
};
