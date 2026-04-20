import { useMemo, useState } from 'react'
import {
  App,
  Button,
  Card,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import {
  useDeleteProductsSku,
  useProductsSkus,
} from '../../../hooks/useProductsSkus'
import {
  useCategories,
  useDepartments,
  useGroups,
  useKeywords,
  useSeasons,
  useSectors,
} from '../../../hooks/useProductsTaxonomy'
import { useVendors } from '../../../hooks/useProductsVendors'
import type { SkuListFilters } from '../../../types/productsSku'
import type { Department, Sector } from '../../../types/productsTaxonomy'

/**
 * SKU list workbench.
 *
 * Goals:
 *  - Every column sortable (click header to toggle asc/desc).
 *  - Dropdown filters for every dimension the user cares about: Department,
 *    Sector, Category, Group, Keyword, Season, Vendor. Style/Color takes a
 *    substring search because it's free-text.
 *  - Row selection wired up so future bulk ops (price discount, discontinue,
 *    add keyword) have a selection to operate on. For now the "Apply
 *    discount" button is a stub that shows the count and waits on Step 5.
 *
 * Filtering is client-side. The backend returns the full snapshot (cached
 * in-memory server-side) and we filter + sort here; this matches the
 * storefront adapter's approach and keeps the filter UI snappy.
 */
export default function SkuListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()

  // Text search stays separate from the dropdown filters — it maps to the
  // backend `q` so the server-side cache can narrow large result sets when a
  // user is searching a specific SKU.
  const [searchValue, setSearchValue] = useState('')
  const [q, setQ] = useState('')

  // Department is single-select — user preference. Every other dimension
  // stays multi-select so you can e.g. pick a bunch of vendors at once.
  const [departmentNumber, setDepartmentNumber] = useState<number | null>(null)
  const [sectorNumbers, setSectorNumbers] = useState<number[]>([])
  const [categoryNumbers, setCategoryNumbers] = useState<number[]>([])
  const [groupCodes, setGroupCodes] = useState<string[]>([])
  const [keywordCodes, setKeywordCodes] = useState<string[]>([])
  const [seasonCodes, setSeasonCodes] = useState<string[]>([])
  const [vendorCodes, setVendorCodes] = useState<string[]>([])
  const [styleColor, setStyleColor] = useState('')

  const [selectedCodes, setSelectedCodes] = useState<string[]>([])

  // Fetch the full snapshot — no `limit`, so the backend returns every row.
  // Server-side in-memory cache makes this a 35 ms response once warm; the
  // payload is ~9-15 MB of JSON but only travels on the first visit per
  // hour, and React Query caches it locally for the session after that.
  const filter: SkuListFilters = useMemo(
    () => ({ q: q || undefined }),
    [q],
  )
  const { data, isLoading } = useProductsSkus(filter)
  const del = useDeleteProductsSku()

  const { data: departments } = useDepartments()
  const { data: sectors } = useSectors()
  const { data: categories } = useCategories()
  const { data: groups } = useGroups()
  const { data: keywords } = useKeywords()
  const { data: seasons } = useSeasons()
  const { data: vendors } = useVendors()

  // Range-based rollup — Category → Department, Department → Sector.
  const deptFor = useMemo(() => {
    return (categoryNum: number | null): Department | null => {
      if (categoryNum == null || !departments) return null
      return (
        departments.find(
          (d) => d.begCateg <= categoryNum && d.endCateg >= categoryNum,
        ) ?? null
      )
    }
  }, [departments])

  const sectorFor = useMemo(() => {
    return (deptNum: number | null): Sector | null => {
      if (deptNum == null || !sectors) return null
      return (
        sectors.find((s) => s.begDept <= deptNum && s.endDept >= deptNum) ?? null
      )
    }
  }, [sectors])

  // Pre-compute department/sector per SKU so filter & render don't both
  // re-walk the ranges for every row.
  const enriched = useMemo(() => {
    if (!data) return []
    return data.map((s) => {
      const d = deptFor(s.category)
      const sec = sectorFor(d?.number ?? null)
      return { ...s, _deptNumber: d?.number ?? null, _sectorNumber: sec?.number ?? null }
    })
  }, [data, deptFor, sectorFor])

  type EnrichedSku = (typeof enriched)[number]

  const filtered = useMemo(() => {
    let out: EnrichedSku[] = enriched
    if (departmentNumber != null) {
      out = out.filter((s) => s._deptNumber === departmentNumber)
    }
    if (sectorNumbers.length > 0) {
      const set = new Set(sectorNumbers)
      out = out.filter((s) => s._sectorNumber != null && set.has(s._sectorNumber))
    }
    if (categoryNumbers.length > 0) {
      const set = new Set(categoryNumbers)
      out = out.filter((s) => s.category != null && set.has(s.category))
    }
    if (groupCodes.length > 0) {
      const set = new Set(groupCodes.map((c) => c.toUpperCase()))
      out = out.filter((s) => s.groupCode != null && set.has(s.groupCode.toUpperCase()))
    }
    if (keywordCodes.length > 0) {
      const set = new Set(keywordCodes.map((c) => c.toUpperCase()))
      out = out.filter((s) => s.keywords.some((k) => set.has(k.toUpperCase())))
    }
    if (seasonCodes.length > 0) {
      const set = new Set(seasonCodes.map((c) => c.toUpperCase()))
      out = out.filter((s) => s.season != null && set.has(s.season.toUpperCase()))
    }
    if (vendorCodes.length > 0) {
      const set = new Set(vendorCodes.map((c) => c.toUpperCase()))
      out = out.filter((s) => s.vendor != null && set.has(s.vendor.toUpperCase()))
    }
    if (styleColor.trim().length > 0) {
      const needle = styleColor.trim().toUpperCase()
      out = out.filter((s) => (s.styleColor ?? '').toUpperCase().includes(needle))
    }
    return out
  }, [
    enriched,
    departmentNumber,
    sectorNumbers,
    categoryNumbers,
    groupCodes,
    keywordCodes,
    seasonCodes,
    vendorCodes,
    styleColor,
  ])

  const columns = [
    {
      title: 'SKU',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      sorter: (a: EnrichedSku, b: EnrichedSku) => a.code.localeCompare(b.code),
      defaultSortOrder: 'ascend' as const,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        a.description.localeCompare(b.description),
    },
    {
      title: 'Vendor',
      dataIndex: 'vendor',
      key: 'vendor',
      width: 90,
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        (a.vendor ?? '').localeCompare(b.vendor ?? ''),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      align: 'right' as const,
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        (a.category ?? 0) - (b.category ?? 0),
    },
    {
      title: 'Department',
      key: 'department',
      width: 180,
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        (a._deptNumber ?? 0) - (b._deptNumber ?? 0),
      render: (_: unknown, r: EnrichedSku) => {
        const d = deptFor(r.category)
        return d ? (
          <Space size={4}>
            <Tag>{d.number}</Tag>
            <span>{d.description}</span>
          </Space>
        ) : r.category != null ? (
          <Typography.Text type="danger">— no dept range</Typography.Text>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )
      },
    },
    {
      title: 'Sector',
      key: 'sector',
      width: 160,
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        (a._sectorNumber ?? 0) - (b._sectorNumber ?? 0),
      render: (_: unknown, r: EnrichedSku) => {
        const d = deptFor(r.category)
        const s = sectorFor(d?.number ?? null)
        return s ? (
          <Space size={4}>
            <Tag color="purple">{s.number}</Tag>
            <span>{s.description}</span>
          </Space>
        ) : d != null ? (
          <Typography.Text type="secondary">— no sector range</Typography.Text>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )
      },
    },
    {
      title: 'Style/Color',
      dataIndex: 'styleColor',
      key: 'styleColor',
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        (a.styleColor ?? '').localeCompare(b.styleColor ?? ''),
    },
    {
      title: 'Season',
      dataIndex: 'season',
      key: 'season',
      width: 90,
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        (a.season ?? '').localeCompare(b.season ?? ''),
    },
    {
      title: 'List',
      key: 'listPrice',
      width: 110,
      align: 'right' as const,
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        (a.listPrice ?? 0) - (b.listPrice ?? 0),
      render: (_: unknown, r: EnrichedSku) =>
        r.listPrice == null ? (
          <Typography.Text type="secondary">—</Typography.Text>
        ) : (
          formatMoney(r.listPrice)
        ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        (a.status ?? '').localeCompare(b.status ?? ''),
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_: unknown, r: EnrichedSku) => (
        <Space size={0}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/products/skus/${encodeURIComponent(r.code)}`)}
          />
          <Popconfirm
            title="Delete this SKU? RICS semantics require no sales/POs/inventory activity."
            onConfirm={async () => {
              try {
                await del.mutateAsync(r.code)
                message.success('Deleted')
              } catch (e) {
                message.error((e as Error).message)
              }
            }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const clearFilters = () => {
    setDepartmentNumber(null)
    setSectorNumbers([])
    setCategoryNumbers([])
    setGroupCodes([])
    setKeywordCodes([])
    setSeasonCodes([])
    setVendorCodes([])
    setStyleColor('')
    setSelectedCodes([])
  }

  const anyFilterActive =
    departmentNumber != null ||
    sectorNumbers.length > 0 ||
    categoryNumbers.length > 0 ||
    groupCodes.length > 0 ||
    keywordCodes.length > 0 ||
    seasonCodes.length > 0 ||
    vendorCodes.length > 0 ||
    styleColor.trim().length > 0 ||
    q.trim().length > 0

  return (
    <Card
      title={
        <Space>
          <Typography.Text strong>SKUs</Typography.Text>
          <Typography.Text type="secondary">
            {isLoading
              ? 'loading…'
              : `${filtered.length.toLocaleString()} of ${(data?.length ?? 0).toLocaleString()}`}
          </Typography.Text>
        </Space>
      }
      extra={
        <Space>
          <Input
            placeholder="Search code, desc, style…"
            prefix={<SearchOutlined />}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onPressEnter={() => setQ(searchValue.trim())}
            allowClear
            onClear={() => {
              setSearchValue('')
              setQ('')
            }}
            style={{ width: 260 }}
          />
          <Link to="/products/skus/new">
            <Button type="primary" icon={<PlusOutlined />}>
              New SKU
            </Button>
          </Link>
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* Filter bar. Each Select multi-select runs against in-memory data
             so reactions are instant. */}
        <Space wrap size={8}>
          <Select
            placeholder="Department"
            value={departmentNumber ?? undefined}
            onChange={(v) => setDepartmentNumber(typeof v === 'number' ? v : null)}
            allowClear
            showSearch
            style={{ minWidth: 240 }}
            options={(departments ?? []).map((d) => ({
              value: d.number,
              label: `${d.number} — ${d.description}`,
            }))}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
          <Select
            mode="multiple"
            placeholder="Sector"
            value={sectorNumbers}
            onChange={setSectorNumbers}
            allowClear
            style={{ minWidth: 200 }}
            maxTagCount="responsive"
            options={(sectors ?? []).map((s) => ({
              value: s.number,
              label: `${s.number} — ${s.description}`,
            }))}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
          <Select
            mode="multiple"
            placeholder="Category"
            value={categoryNumbers}
            onChange={setCategoryNumbers}
            allowClear
            style={{ minWidth: 220 }}
            maxTagCount="responsive"
            options={(categories ?? []).map((c) => ({
              value: c.number,
              label: `${c.number} — ${c.description}`,
            }))}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
          <Select
            mode="multiple"
            placeholder="Group"
            value={groupCodes}
            onChange={setGroupCodes}
            allowClear
            style={{ minWidth: 180 }}
            maxTagCount="responsive"
            options={(groups ?? []).map((g) => ({
              value: g.code,
              label: `${g.code} — ${g.description}`,
            }))}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
          <Select
            mode="multiple"
            placeholder="Keyword"
            value={keywordCodes}
            onChange={setKeywordCodes}
            allowClear
            style={{ minWidth: 180 }}
            maxTagCount="responsive"
            options={(keywords ?? []).map((k) => ({
              value: k.keyword,
              label: k.description ? `${k.keyword} — ${k.description}` : k.keyword,
            }))}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
          <Select
            mode="multiple"
            placeholder="Season"
            value={seasonCodes}
            onChange={setSeasonCodes}
            allowClear
            style={{ minWidth: 160 }}
            maxTagCount="responsive"
            options={(seasons ?? []).map((s) => ({
              value: s.code,
              label: `${s.code} — ${s.description}`,
            }))}
          />
          <Select
            mode="multiple"
            placeholder="Vendor"
            value={vendorCodes}
            onChange={setVendorCodes}
            allowClear
            style={{ minWidth: 220 }}
            maxTagCount="responsive"
            showSearch
            options={(vendors ?? []).map((v) => ({
              value: v.code,
              label: `${v.code} — ${v.name}`,
            }))}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
          <Input
            placeholder="Style/Color contains…"
            value={styleColor}
            onChange={(e) => setStyleColor(e.target.value)}
            allowClear
            style={{ width: 200 }}
          />
          {anyFilterActive ? (
            <Button onClick={clearFilters}>Clear all</Button>
          ) : null}
        </Space>

        {/* Bulk-ops bar. Enabled when rows are selected. "Apply discount"
             is a placeholder until Step 5 ships the bulk-discount flow. */}
        {selectedCodes.length > 0 ? (
          <Space>
            <Typography.Text strong>
              {selectedCodes.length.toLocaleString()} selected
            </Typography.Text>
            <Tooltip title="Bulk price-change / discount is part of Step 5 (pricing ops). The selection persists across filter/sort changes so you can queue them up now.">
              <Button disabled>Apply discount…</Button>
            </Tooltip>
            <Tooltip title="Step 5 (Discontinue SKU) — coming next.">
              <Button disabled>Discontinue…</Button>
            </Tooltip>
            <Tooltip title="Step 6 (Bulk labels) — coming next.">
              <Button disabled>Queue labels…</Button>
            </Tooltip>
            <Button onClick={() => setSelectedCodes([])}>Clear selection</Button>
          </Space>
        ) : null}

        <Table<EnrichedSku>
          size="small"
          className="products-compact-table"
          rowKey="code"
          dataSource={filtered}
          columns={columns}
          loading={isLoading}
          pagination={{
            defaultPageSize: 25,
            showSizeChanger: true,
            pageSizeOptions: [25, 50, 100, 200, 500],
          }}
          rowSelection={{
            selectedRowKeys: selectedCodes,
            onChange: (keys) => setSelectedCodes(keys.map(String)),
            preserveSelectedRowKeys: true,
          }}
        />
      </Space>
    </Card>
  )
}

function formatMoney(n: number): string {
  // House style: no currency symbol, 2-decimal precision, comma thousands
  // separator. See `feedback_currency_format` memory.
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
