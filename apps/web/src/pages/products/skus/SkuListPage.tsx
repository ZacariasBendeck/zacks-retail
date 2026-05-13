import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Image,
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
  PlayCircleOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  useDeleteProductsSku,
} from '../../../hooks/useProductsSkus'
import { productsSkuApi } from '../../../services/productsSkuApi'
import { SkuLink } from '../../../components/sku-link'
import {
  useCategories,
  useDepartments,
  useGroups,
  useKeywords,
  useSeasons,
  useSectors,
} from '../../../hooks/useProductsTaxonomy'
import { useVendors } from '../../../hooks/useProductsVendors'
import { useAttributeDimensions } from '../../../hooks/useProductsAttributes'
import { buildRicsImageUrl } from '../../../services/ricsImageUrl'
import type { SkuListFilters } from '../../../types/productsSku'
import type { Department, Sector } from '../../../types/productsTaxonomy'

/**
 * SKU list workbench — query-first.
 *
 * Opening the page does NOT trigger a SKU fetch. The user picks filters and
 * hits **Run query** to pull a result set. Taxonomy dropdowns populate
 * immediately (they're tiny + cached), so filter UX is snappy.
 *
 * Why query-first: the full SKU universe is 200 k+ rows. Auto-loading on
 * every page visit means every tab switch to /products/skus hangs for ~100 s
 * on the first visit per hour, which is awful UX for an admin tool. RICS
 * itself is query-first — you punch in criteria, then get results. Matching
 * that behaviour here.
 *
 * Departments + Sectors on the client: both are derived from Category via
 * range lookup. When the user picks a department, we expand it into its
 * `BegCateg..EndCateg` range and send the full category list to the backend
 * (backend stays dumb: it filters by category[] + vendor[] + etc). Same
 * trick for sector → departments → categories. No new server-side logic.
 */
export default function SkuListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [searchParams] = useSearchParams()

  // Deep-link hydration: pages that link here (e.g., the attribute admin's
  // "usado en N SKUs") can pre-seed filters via URL — `?attr.color=rojo&run=1`.
  // We read once on mount; changing URL after mount doesn't re-hydrate.
  const initialFilters = useMemo(() => {
    const q = searchParams.get('q') ?? ''
    const styleColor = searchParams.get('styleColor') ?? ''
    const splitCsv = (v: string | null) =>
      v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []
    const vendorCodes = splitCsv(searchParams.get('vendors'))
    const seasonCodes = splitCsv(searchParams.get('seasons'))
    const groupCodes = splitCsv(searchParams.get('groups'))
    const keywordCodes = splitCsv(searchParams.get('keywords'))
    const attrSelections: Record<string, string[]> = {}
    for (const [k, v] of searchParams.entries()) {
      if (k.startsWith('attr.')) {
        const dim = k.slice(5)
        attrSelections[dim] = v.split(',').map((s) => s.trim()).filter(Boolean)
      }
    }
    return { q, styleColor, vendorCodes, seasonCodes, groupCodes, keywordCodes, attrSelections }
  }, [searchParams])

  // Filter state (not yet applied — becomes `activeFilters` when Run clicked)
  const [q, setQ] = useState(initialFilters.q)
  const [departmentNumber, setDepartmentNumber] = useState<number | null>(null)
  const [sectorNumber, setSectorNumber] = useState<number | null>(null)
  const [categoryNumbers, setCategoryNumbers] = useState<number[]>([])
  const [groupCodes, setGroupCodes] = useState<string[]>(initialFilters.groupCodes)
  const [keywordCodes, setKeywordCodes] = useState<string[]>(initialFilters.keywordCodes)
  const [seasonCodes, setSeasonCodes] = useState<string[]>(initialFilters.seasonCodes)
  const [vendorCodes, setVendorCodes] = useState<string[]>(initialFilters.vendorCodes)
  const [styleColor, setStyleColor] = useState(initialFilters.styleColor)
  // Extended-attribute filter state: one entry per dim, each an array of value codes.
  const [attrSelections, setAttrSelections] = useState<Record<string, string[]>>(
    initialFilters.attrSelections,
  )

  // Selection persists across filter/sort changes for bulk ops.
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])

  // Taxonomy data — always loaded so dropdowns are responsive.
  const { data: departments } = useDepartments()
  const { data: sectors } = useSectors()
  const { data: categories } = useCategories()
  const { data: groups } = useGroups()
  const { data: keywords } = useKeywords()
  const { data: seasons } = useSeasons()
  const { data: vendors } = useVendors()
  const { data: attrDimensions } = useAttributeDimensions()

  // Expand a Department pick to its category range.
  const deptCategoryRange = useMemo(() => {
    if (departmentNumber == null || !departments) return null
    const d = departments.find((x) => x.number === departmentNumber)
    if (!d) return null
    const out: number[] = []
    for (let c = d.begCateg; c <= d.endCateg; c++) out.push(c)
    return out
  }, [departmentNumber, departments])

  // Expand a Sector pick → departments in sector → category ranges → flat list.
  const sectorCategoryRange = useMemo(() => {
    if (sectorNumber == null || !sectors || !departments) return null
    const s = sectors.find((x) => x.number === sectorNumber)
    if (!s) return null
    const depts = departments.filter(
      (d) => d.number >= s.begDept && d.number <= s.endDept,
    )
    const out: number[] = []
    for (const d of depts) {
      for (let c = d.begCateg; c <= d.endCateg; c++) out.push(c)
    }
    return out
  }, [sectorNumber, sectors, departments])

  // Intersect department range + sector range + explicit category picks into
  // the single `categories` param the backend accepts.
  const effectiveCategories = useMemo(() => {
    const sets: Set<number>[] = []
    if (deptCategoryRange) sets.push(new Set(deptCategoryRange))
    if (sectorCategoryRange) sets.push(new Set(sectorCategoryRange))
    if (categoryNumbers.length > 0) sets.push(new Set(categoryNumbers))
    if (sets.length === 0) return undefined
    // Intersect all sets.
    const first = sets[0]!
    let result = Array.from(first)
    for (let i = 1; i < sets.length; i++) {
      const s = sets[i]!
      result = result.filter((x) => s.has(x))
    }
    return result
  }, [deptCategoryRange, sectorCategoryRange, categoryNumbers])

  // Committed query — only populated after the user clicks Run. React Query
  // caches per-filter-hash so re-running the same query serves from cache.
  const [activeFilters, setActiveFilters] = useState<SkuListFilters | null>(null)

  const { data: skus, isLoading, isFetching } = useQuery({
    queryKey: ['products-skus', 'list', activeFilters],
    queryFn: () => productsSkuApi.list(activeFilters ?? undefined),
    enabled: activeFilters != null,
    staleTime: 5 * 60_000,
  })

  // Parallel on-hand totals — one aggregate query over rics_mirror.inventory_quantities
  // keyed by the result set's SKU codes. Rendered in the On Hand column below.
  const skuCodes = useMemo(() => (skus ?? []).map((s) => s.code), [skus])
  const { data: onHandTotals } = useQuery({
    queryKey: ['products-skus', 'on-hand-totals', skuCodes],
    queryFn: () => productsSkuApi.onHandTotals(skuCodes),
    enabled: skuCodes.length > 0,
    staleTime: 5 * 60_000,
  })

  const del = useDeleteProductsSku()

  // Range-based rollup for the rendered Department/Sector columns.
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

  const enriched = useMemo(() => {
    if (!skus) return []
    return skus.map((s) => {
      const d = deptFor(s.category)
      const sec = sectorFor(d?.number ?? null)
      return { ...s, _deptNumber: d?.number ?? null, _sectorNumber: sec?.number ?? null }
    })
  }, [skus, deptFor, sectorFor])

  type EnrichedSku = (typeof enriched)[number]

  const columns = [
    {
      title: '',
      key: 'thumb',
      // Column width only sizes the portrait case; wider (landscape) shots can
      // exceed it because maxWidth below is larger. The Table handles overflow
      // by expanding the column as needed.
      width: 56,
      // Strip the cell's own padding so the image fills the whole row height —
      // no top/bottom cushion. Row height is then driven by the image height
      // below; other cells vertically center into the same row.
      onCell: () => ({ style: { padding: 0, verticalAlign: 'middle' as const } }),
      render: (_: unknown, r: EnrichedSku) => {
        if (!r.pictureFileName) {
          return (
            <span
              aria-hidden
              style={{
                display: 'block',
                width: 50,
                height: 50,
                margin: '0 auto',
                border: '1px dashed #e0e0e0',
                borderRadius: 2,
              }}
            />
          )
        }
        const url = buildRicsImageUrl(r.pictureFileName)
        if (!url) {
          return (
            <span
              aria-hidden
              style={{
                display: 'block',
                width: 50,
                height: 50,
                margin: '0 auto',
                border: '1px dashed #e0e0e0',
                borderRadius: 2,
              }}
            />
          )
        }
        return (
          // Ant's <Image> gives us a click-to-enlarge lightbox (zoom, rotate,
          // fullscreen) for free, while keeping the inline thumbnail the same
          // size as before. preview={{ src }} is what powers the large view;
          // we don't pass a separate `previewSrc` since the source is already
          // the full-res RICS image.
          <Image
            src={url}
            alt=""
            loading="lazy"
            // Fixed height = row height (no cushion). width: auto preserves
            // the aspect ratio so portrait shots stay narrow and landscape
            // shots widen the cell naturally, capped at maxWidth.
            style={{
              height: 50,
              width: 'auto',
              maxWidth: 120,
              objectFit: 'contain',
              display: 'block',
              cursor: 'zoom-in',
            }}
            preview={{ mask: false }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
            }}
          />
        )
      },
    },
    {
      title: 'SKU',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      sorter: (a: EnrichedSku, b: EnrichedSku) => a.code.localeCompare(b.code),
      defaultSortOrder: 'ascend' as const,
      render: (_: unknown, r: EnrichedSku) => <SkuLink skuCode={r.code} />,
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
      title: 'On Hand',
      key: 'onHand',
      width: 90,
      align: 'right' as const,
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        (onHandTotals?.[a.code] ?? 0) - (onHandTotals?.[b.code] ?? 0),
      render: (_: unknown, r: EnrichedSku) => {
        if (!onHandTotals) return <Typography.Text type="secondary">…</Typography.Text>
        const n = onHandTotals[r.code] ?? 0
        return n === 0 ? (
          <Typography.Text type="secondary">0</Typography.Text>
        ) : (
          n.toLocaleString()
        )
      },
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
            onClick={() => navigate(`/products/skus/${encodeURIComponent(r.code)}/edit`)}
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

  const buildFilters = (): SkuListFilters => {
    const attrsPayload: Record<string, string[]> = {}
    for (const [dim, vals] of Object.entries(attrSelections)) {
      if (vals.length > 0) attrsPayload[dim] = vals
    }
    return {
      q: q.trim() || undefined,
      vendors: vendorCodes.length > 0 ? vendorCodes : undefined,
      categories: effectiveCategories,
      seasons: seasonCodes.length > 0 ? seasonCodes : undefined,
      groups: groupCodes.length > 0 ? groupCodes : undefined,
      keywords: keywordCodes.length > 0 ? keywordCodes : undefined,
      styleColor: styleColor.trim() || undefined,
      attributes: Object.keys(attrsPayload).length > 0 ? attrsPayload : undefined,
    }
  }

  const runQuery = () => {
    setActiveFilters(buildFilters())
  }

  // Auto-run if the URL asked for it (deep link from the attribute admin, etc.).
  // We guard with a ref so this only fires once — subsequent state changes from
  // the user shouldn't re-trigger just because `run=1` is still in the bar.
  const autoRanRef = useRef(false)
  useEffect(() => {
    if (autoRanRef.current) return
    if (searchParams.get('run') !== '1') return
    autoRanRef.current = true
    // Defer one tick so all initial state settles first.
    const id = setTimeout(() => runQuery(), 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const runQueryLoadAll = () => {
    // Bypass all filters — pulls the full 200 k-row snapshot. Slow on first
    // hit of the hour (~100 s), subsequent hits are RAM-served.
    setActiveFilters({})
  }

  const clearFilters = () => {
    setQ('')
    setDepartmentNumber(null)
    setSectorNumber(null)
    setCategoryNumbers([])
    setGroupCodes([])
    setKeywordCodes([])
    setSeasonCodes([])
    setVendorCodes([])
    setStyleColor('')
    setAttrSelections({})
  }

  const attrFiltersSet = Object.values(attrSelections).some((v) => v.length > 0)

  const anyFilterSet =
    q.trim().length > 0 ||
    departmentNumber != null ||
    sectorNumber != null ||
    categoryNumbers.length > 0 ||
    groupCodes.length > 0 ||
    keywordCodes.length > 0 ||
    seasonCodes.length > 0 ||
    vendorCodes.length > 0 ||
    styleColor.trim().length > 0 ||
    attrFiltersSet

  const isRunning = isLoading || isFetching
  const hasRun = activeFilters != null
  const resultCount = enriched.length

  return (
    <Card
      title={
        <Space>
          <Typography.Text strong>SKUs</Typography.Text>
          {hasRun && !isRunning ? (
            <Typography.Text type="secondary">
              {resultCount.toLocaleString()} result{resultCount === 1 ? '' : 's'}
            </Typography.Text>
          ) : null}
        </Space>
      }
      extra={
        <Link to="/products/skus/new">
          <Button type="primary" icon={<PlusOutlined />}>
            New SKU
          </Button>
        </Link>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* Filter bar */}
        <Space wrap size={8}>
          <Input
            placeholder="Search code, desc, style…"
            prefix={<SearchOutlined />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onPressEnter={runQuery}
            allowClear
            style={{ width: 240 }}
          />
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
            placeholder="Sector"
            value={sectorNumber ?? undefined}
            onChange={(v) => setSectorNumber(typeof v === 'number' ? v : null)}
            allowClear
            showSearch
            style={{ minWidth: 200 }}
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
            onPressEnter={runQuery}
            allowClear
            style={{ width: 200 }}
          />
        </Space>

        {/* Extended-attribute filter row — one multi-select per dim. */}
        {attrDimensions && attrDimensions.length > 0 ? (
          <Space wrap size={8}>
            <Typography.Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>
              Atributos:
            </Typography.Text>
            {attrDimensions.map((dim) => (
              <Select
                key={dim.code}
                mode="multiple"
                placeholder={dim.labelEs}
                value={attrSelections[dim.code] ?? []}
                onChange={(v) =>
                  setAttrSelections((prev) => ({ ...prev, [dim.code]: v as string[] }))
                }
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ minWidth: 200 }}
                maxTagCount="responsive"
                options={dim.values.map((val) => ({
                  value: val.code,
                  label: val.labelEs,
                }))}
              />
            ))}
          </Space>
        ) : null}

        {/* Run / clear / load-all controls */}
        <Space>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={runQuery}
            loading={isRunning && hasRun}
            disabled={!anyFilterSet && hasRun}
          >
            Run query
          </Button>
          {anyFilterSet ? <Button onClick={clearFilters}>Clear filters</Button> : null}
          <Tooltip title="Pulls every SKU (200 k+). Slow first time — use only when you really need the full dataset.">
            <Button onClick={runQueryLoadAll} loading={isRunning && !anyFilterSet}>
              Load all (slow)
            </Button>
          </Tooltip>
        </Space>

        {/* Bulk-ops toolbar — appears when rows selected */}
        {selectedCodes.length > 0 ? (
          <Space>
            <Typography.Text strong>
              {selectedCodes.length.toLocaleString()} selected
            </Typography.Text>
            <Tooltip title="Bulk price-change / discount is part of Step 5 (pricing ops). The selection persists across filter changes so you can queue them up now.">
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

        {/* Empty state / result table */}
        {!hasRun ? (
          <Alert
            type="info"
            showIcon
            message="Pick filters and click Run query"
            description="Nothing loads until you ask for it. Taxonomy dropdowns above are ready — select what you want and hit Run. Use 'Load all (slow)' only if you really need the full 200 k-row dataset."
          />
        ) : (
          <Table<EnrichedSku>
            size="small"
            className="products-compact-table"
            rowKey="code"
            dataSource={enriched}
            columns={columns}
            loading={isRunning}
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
        )}
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
