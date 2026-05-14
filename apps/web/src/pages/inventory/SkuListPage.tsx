import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Image,
  Input,
  Popconfirm,
  Row,
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
  FilterOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth/useAuth'
import { useDeleteProductsSku } from '../../hooks/useProductsSkus'
import { productsSkuApi } from '../../services/productsSkuApi'
import { SkuLink } from '../../components/sku-link'
import SkuBulkChangePanel from './SkuBulkChangePanel'
import {
  useCategories,
  useDepartments,
  useGroups,
  useKeywords,
  useSeasons,
  useSectors,
} from '../../hooks/useProductsTaxonomy'
import { useVendors } from '../../hooks/useProductsVendors'
import { useAttributeDimensions } from '../../hooks/useProductsAttributes'
import { useProductFamilies } from '../../hooks/useProductFamilies'
import { useAllPostgresCategories } from '../../hooks/useProductCategories'
import { buildRicsImageUrl } from '../../services/ricsImageUrl'
import type { SkuListFilters } from '../../types/productsSku'
import type { Department, Sector } from '../../types/productsTaxonomy'
import type { AttributeDimension } from '../../types/productsAttributes'
import { buildSkuListFiltersFromState } from './skuListFilters'

const SKU_BULK_WRITE_PERMISSION = 'products.sku_bulk_write'
const DEFAULT_VISIBLE_COLUMN_KEYS = [
  'thumb',
  'code',
  'description',
  'vendor',
  'vendorSku',
  'category',
  'department',
  'sector',
  'styleColor',
  'season',
  'groupCode',
  'sizeType',
  'keywords',
  'listPrice',
  'onHand',
  'status',
]

/**
 * Merged SKU workbench.
 *
 * The toolbar comes from the old Inventory SKU List: one broad search box,
 * +New SKU, Filters toggle, and Refresh. The result table comes from the
 * Products Phase 1 SKU report so operators keep thumbnails, SKU links, and
 * the richer RICS-facing columns.
 */
export default function SkuListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { permissions } = useAuth()
  const [searchParams] = useSearchParams()
  const canBulkChangeSkus = permissions.has(SKU_BULK_WRITE_PERMISSION)

  const initialFilters = useMemo(() => {
    const q = searchParams.get('q') ?? ''
    const sku = searchParams.get('sku') ?? ''
    const description = searchParams.get('description') ?? ''
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
    return { q, sku, description, styleColor, vendorCodes, seasonCodes, groupCodes, keywordCodes, attrSelections }
  }, [searchParams])

  const [q, setQ] = useState(initialFilters.q)
  const [skuPattern, setSkuPattern] = useState(initialFilters.sku)
  const [showFilters, setShowFilters] = useState(true)
  const [bulkMode, setBulkMode] = useState(canBulkChangeSkus && searchParams.get('bulk') === '1')
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [visibleResultColumnKeys, setVisibleResultColumnKeys] = useState<string[]>(DEFAULT_VISIBLE_COLUMN_KEYS)
  const [productFamilyCode, setProductFamilyCode] = useState<string | null>(null)
  const [departmentNumber, setDepartmentNumber] = useState<number | null>(null)
  const [sectorNumber, setSectorNumber] = useState<number | null>(null)
  const [categoryNumbers, setCategoryNumbers] = useState<number[]>([])
  const [groupCodes, setGroupCodes] = useState<string[]>(initialFilters.groupCodes)
  const [keywordCodes, setKeywordCodes] = useState<string[]>(initialFilters.keywordCodes)
  const [seasonCodes, setSeasonCodes] = useState<string[]>(initialFilters.seasonCodes)
  const [vendorCodes, setVendorCodes] = useState<string[]>(initialFilters.vendorCodes)
  const [styleColor, setStyleColor] = useState(initialFilters.styleColor)
  const [description, setDescription] = useState(initialFilters.description)
  const [attrSelections, setAttrSelections] = useState<Record<string, string[]>>(
    initialFilters.attrSelections,
  )

  const { data: departments } = useDepartments()
  const { data: sectors } = useSectors()
  const { data: categories } = useCategories()
  const { data: groups } = useGroups()
  const { data: keywords } = useKeywords()
  const { data: seasons } = useSeasons()
  const { data: vendors } = useVendors()
  const { data: attrDimensions } = useAttributeDimensions()
  const { data: productFamilies } = useProductFamilies()
  const { data: postgresCategories } = useAllPostgresCategories()

  const familyLabelByCode = useMemo(() => {
    return new Map((productFamilies ?? []).map((family) => [family.code, family.labelEs]))
  }, [productFamilies])

  const familyCategoryNumbers = useMemo(() => {
    if (!productFamilyCode) return null
    if (!postgresCategories) return null
    return postgresCategories
      .filter((category) => category.familyCode === productFamilyCode)
      .map((category) => category.categoryNumber)
  }, [productFamilyCode, postgresCategories])

  const categoryOptions = useMemo(() => {
    if (postgresCategories && postgresCategories.length > 0) {
      return postgresCategories
        .filter((category) => !productFamilyCode || category.familyCode === productFamilyCode)
        .map((category) => ({
          value: category.categoryNumber,
          label: `${category.categoryNumber} - ${category.categoryDesc}`,
        }))
    }
    return (categories ?? []).map((category) => ({
      value: category.number,
      label: `${category.number} - ${category.description}`,
    }))
  }, [categories, postgresCategories, productFamilyCode])

  const visibleAttrDimensions = useMemo(() => {
    return visibleDimensionsForFamily(attrDimensions ?? [], productFamilyCode)
  }, [attrDimensions, productFamilyCode])

  const deptCategoryRange = useMemo(() => {
    if (departmentNumber == null || !departments) return null
    const d = departments.find((x) => x.number === departmentNumber)
    if (!d) return null
    const out: number[] = []
    for (let c = d.begCateg; c <= d.endCateg; c++) out.push(c)
    return out
  }, [departmentNumber, departments])

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

  const effectiveCategories = useMemo(() => {
    const sets: Set<number>[] = []
    if (familyCategoryNumbers) sets.push(new Set(familyCategoryNumbers))
    if (deptCategoryRange) sets.push(new Set(deptCategoryRange))
    if (sectorCategoryRange) sets.push(new Set(sectorCategoryRange))
    if (categoryNumbers.length > 0) sets.push(new Set(categoryNumbers))
    if (sets.length === 0) return undefined
    let result = Array.from(sets[0]!)
    for (let i = 1; i < sets.length; i++) {
      const s = sets[i]!
      result = result.filter((x) => s.has(x))
    }
    return result
  }, [familyCategoryNumbers, deptCategoryRange, sectorCategoryRange, categoryNumbers])

  const buildFilters = (): SkuListFilters => {
    return buildSkuListFiltersFromState({
      q,
      skuPattern,
      vendorCodes,
      sectorNumber,
      departmentNumber,
      productFamilyCode,
      effectiveCategories,
      seasonCodes,
      groupCodes,
      keywordCodes,
      styleColor,
      description,
      attrSelections,
    })
  }

  const [activeFilters, setActiveFilters] = useState<SkuListFilters | null>(null)

  const { data: skus, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['products-skus', 'list', activeFilters],
    queryFn: () => productsSkuApi.list(activeFilters ?? undefined),
    enabled: activeFilters != null,
    staleTime: 5 * 60_000,
  })

  const skuCodes = useMemo(() => (skus ?? []).map((s) => s.code), [skus])
  const { data: onHandTotals } = useQuery({
    queryKey: ['products-skus', 'on-hand-totals', skuCodes],
    queryFn: () => productsSkuApi.onHandTotals(skuCodes),
    enabled: skuCodes.length > 0,
    staleTime: 5 * 60_000,
  })

  const del = useDeleteProductsSku()

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

  const runQuery = () => {
    setActiveFilters(buildFilters())
  }

  const refresh = () => {
    if (activeFilters == null) {
      setActiveFilters(buildFilters())
      return
    }
    void refetch()
  }

  const runQueryLoadAll = () => {
    setActiveFilters({})
  }

  const clearFilters = () => {
    setQ('')
    setSkuPattern('')
    setProductFamilyCode(null)
    setDepartmentNumber(null)
    setSectorNumber(null)
    setCategoryNumbers([])
    setGroupCodes([])
    setKeywordCodes([])
    setSeasonCodes([])
    setVendorCodes([])
    setStyleColor('')
    setDescription('')
    setAttrSelections({})
  }

  const autoRanRef = useRef(false)
  useEffect(() => {
    if (autoRanRef.current) return
    if (searchParams.get('run') !== '1') return
    autoRanRef.current = true
    const id = setTimeout(() => runQuery(), 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    if (canBulkChangeSkus && searchParams.get('bulk') === '1') {
      setBulkMode(true)
    }
    if (!canBulkChangeSkus && bulkMode) {
      setBulkMode(false)
      setSelectedCodes([])
    }
  }, [bulkMode, canBulkChangeSkus, searchParams])

  useEffect(() => {
    if (!productFamilyCode || !familyCategoryNumbers) return
    const allowed = new Set(familyCategoryNumbers)
    setCategoryNumbers((prev) => prev.filter((category) => allowed.has(category)))
  }, [productFamilyCode, familyCategoryNumbers])

  useEffect(() => {
    if (!attrDimensions) return
    const visibleCodes = new Set(visibleAttrDimensions.map((dimension) => dimension.code))
    setAttrSelections((prev) => {
      let changed = false
      const next: Record<string, string[]> = {}
      for (const [code, values] of Object.entries(prev)) {
        if (visibleCodes.has(code)) {
          next[code] = values
        } else {
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [attrDimensions, visibleAttrDimensions])

  const attrFiltersSet = Object.values(attrSelections).some((v) => v.length > 0)
  const anyFilterSet =
    q.trim().length > 0 ||
    skuPattern.trim().length > 0 ||
    description.trim().length > 0 ||
    productFamilyCode != null ||
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

  const columns = [
    {
      title: '',
      key: 'thumb',
      width: 56,
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
          <Image
            src={url}
            alt=""
            loading="lazy"
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
      title: 'Vendor SKU',
      dataIndex: 'vendorSku',
      key: 'vendorSku',
      width: 130,
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        (a.vendorSku ?? '').localeCompare(b.vendorSku ?? ''),
      render: (value: string | null) =>
        value ? value : <Typography.Text type="secondary">-</Typography.Text>,
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
          <Typography.Text type="danger">- no dept range</Typography.Text>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
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
          <Typography.Text type="secondary">- no sector range</Typography.Text>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
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
      title: 'Group',
      dataIndex: 'groupCode',
      key: 'groupCode',
      width: 90,
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        (a.groupCode ?? '').localeCompare(b.groupCode ?? ''),
      render: (value: string | null) =>
        value ? value : <Typography.Text type="secondary">-</Typography.Text>,
    },
    {
      title: 'Size Type',
      dataIndex: 'sizeType',
      key: 'sizeType',
      width: 90,
      align: 'right' as const,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.sizeType ?? 0) - (b.sizeType ?? 0),
      render: (value: number | null) =>
        value == null ? <Typography.Text type="secondary">-</Typography.Text> : value,
    },
    {
      title: 'Keywords',
      key: 'keywords',
      width: 180,
      render: (_: unknown, r: EnrichedSku) => {
        const keywords = r.keywords ?? []
        if (keywords.length === 0) return <Typography.Text type="secondary">-</Typography.Text>
        return (
          <Space size={2} wrap>
            {keywords.map((keyword) => (
              <Tag key={keyword} style={{ marginInlineEnd: 0 }}>
                {keyword}
              </Tag>
            ))}
          </Space>
        )
      },
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
          <Typography.Text type="secondary">-</Typography.Text>
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
        if (!onHandTotals) return <Typography.Text type="secondary">...</Typography.Text>
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
          <Tooltip title="Edit SKU">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => navigate(`/products/skus/${encodeURIComponent(r.code)}/edit`)}
            />
          </Tooltip>
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

  const resultColumnOptions = columns
    .filter((column) => String(column.key) !== 'actions')
    .map((column) => ({
      value: String(column.key),
      label: typeof column.title === 'string' ? column.title || 'Image' : String(column.key),
      disabled: String(column.key) === 'code',
    }))

  const visibleColumns = columns.filter((column) => {
    const key = String(column.key)
    return key === 'actions' || visibleResultColumnKeys.includes(key)
  })

  const setVisibleResultColumns = (keys: string[]) => {
    setVisibleResultColumnKeys(Array.from(new Set(['code', ...keys])))
  }

  const resetResultColumns = () => {
    setVisibleResultColumnKeys(DEFAULT_VISIBLE_COLUMN_KEYS)
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Row gutter={[12, 12]} align="middle">
          <Col flex="auto">
            <Input.Search
              placeholder="Search SKU, vendor, brand, style/color, web description, category, department..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onSearch={runQuery}
              enterButton={<SearchOutlined />}
              allowClear
              onClear={() => setQ('')}
              style={{ maxWidth: 560 }}
            />
          </Col>
          <Col>
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate('/products/skus/new')}
              >
                New SKU
              </Button>
              {canBulkChangeSkus ? (
                <Button
                  icon={<TagsOutlined />}
                  onClick={() => setBulkMode((value) => !value)}
                  type={bulkMode ? 'primary' : 'default'}
                  ghost={bulkMode}
                >
                  Change attributes
                </Button>
              ) : null}
              <Button
                icon={<FilterOutlined />}
                onClick={() => setShowFilters(!showFilters)}
                type={showFilters ? 'primary' : 'default'}
                ghost={showFilters}
              >
                Filters
              </Button>
              <Tooltip title={activeFilters == null ? 'Run current search' : 'Refresh results'}>
                <Button icon={<ReloadOutlined />} onClick={refresh} loading={isRunning} />
              </Tooltip>
            </Space>
          </Col>
        </Row>
      </Card>

      {showFilters && (
        <Card size="small" title="Filters">
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <FilterGroup title="1. Identidad del Producto">
              <Row gutter={[12, 12]}>
                <Col xs={24} sm={12} md={8} lg={6} xl={5}>
                  {filterLabel('Familia de Producto')}
                  <Select
                    placeholder="Any family"
                    value={productFamilyCode ?? undefined}
                    onChange={(v) => setProductFamilyCode((v as string | undefined) ?? null)}
                    allowClear
                    showSearch
                    style={{ width: '100%' }}
                    options={(productFamilies ?? []).map((family) => ({
                      value: family.code,
                      label: `${family.labelEs} (${family.code})`,
                    }))}
                    filterOption={(input, option) =>
                      String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Col>
                <Col xs={24} sm={12} md={8} lg={6} xl={4}>
                  {filterLabel('SKU')}
                  <Input
                    placeholder="ABC*, *123, AB*12"
                    value={skuPattern}
                    onChange={(e) => setSkuPattern(e.target.value)}
                    onPressEnter={runQuery}
                    allowClear
                    maxLength={15}
                  />
                </Col>
                <Col xs={24} sm={12} md={8} lg={6} xl={5}>
                  {filterLabel('Category')}
                  <Select
                    mode="multiple"
                    placeholder={productFamilyCode ? 'Family categories' : 'Any category'}
                    value={categoryNumbers}
                    onChange={setCategoryNumbers}
                    allowClear
                    showSearch
                    style={{ width: '100%' }}
                    maxTagCount="responsive"
                    options={categoryOptions}
                    filterOption={(input, option) =>
                      String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Col>
                <Col xs={24} sm={12} md={8} lg={6} xl={4}>
                  {filterLabel('Department')}
                  <Select
                    placeholder="All departments"
                    value={departmentNumber ?? undefined}
                    onChange={(v) => setDepartmentNumber(typeof v === 'number' ? v : null)}
                    allowClear
                    showSearch
                    style={{ width: '100%' }}
                    options={(departments ?? []).map((d) => ({
                      value: d.number,
                      label: `${d.number} - ${d.description}`,
                    }))}
                    filterOption={(input, option) =>
                      String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Col>
                <Col xs={24} sm={12} md={8} lg={6} xl={4}>
                  {filterLabel('Sector')}
                  <Select
                    placeholder="All sectors"
                    value={sectorNumber ?? undefined}
                    onChange={(v) => setSectorNumber(typeof v === 'number' ? v : null)}
                    allowClear
                    showSearch
                    style={{ width: '100%' }}
                    options={(sectors ?? []).map((s) => ({
                      value: s.number,
                      label: `${s.number} - ${s.description}`,
                    }))}
                    filterOption={(input, option) =>
                      String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Col>
                <Col xs={24} sm={12} md={8} lg={6} xl={4}>
                  {filterLabel('Style/Color')}
                  <Input
                    placeholder="Contains..."
                    value={styleColor}
                    onChange={(e) => setStyleColor(e.target.value)}
                    onPressEnter={runQuery}
                    allowClear
                    maxLength={20}
                  />
                </Col>
                <Col xs={24} sm={12} md={8} lg={6} xl={4}>
                  {filterLabel('Group')}
                  <Select
                    mode="multiple"
                    placeholder="Any group"
                    value={groupCodes}
                    onChange={setGroupCodes}
                    allowClear
                    showSearch
                    style={{ width: '100%' }}
                    maxTagCount="responsive"
                    options={(groups ?? []).map((g) => ({
                      value: g.code,
                      label: `${g.code} - ${g.description}`,
                    }))}
                    filterOption={(input, option) =>
                      String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Col>
                <Col xs={24} sm={12} md={8} lg={6} xl={5}>
                  {filterLabel('Description')}
                  <Input
                    placeholder="BOOT*, *CUERO, BO*RO"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onPressEnter={runQuery}
                    allowClear
                    maxLength={30}
                  />
                </Col>
              </Row>
            </FilterGroup>

            <FilterGroup title="2. Proveedor">
              <Row gutter={[12, 12]}>
                <Col xs={24} sm={12} md={8} lg={6} xl={5}>
                  {filterLabel('Vendor')}
                  <Select
                    mode="multiple"
                    placeholder="Any vendor"
                    value={vendorCodes}
                    onChange={setVendorCodes}
                    allowClear
                    showSearch
                    style={{ width: '100%' }}
                    maxTagCount="responsive"
                    options={(vendors ?? []).map((v) => ({
                      value: v.code,
                      label: `${v.code} - ${v.name}`,
                    }))}
                    filterOption={(input, option) =>
                      String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Col>
              </Row>
            </FilterGroup>

            {visibleAttrDimensions.length > 0 ? (
              <FilterGroup
                title="4. Apariencia y Diseño"
                extra={
                  productFamilyCode
                    ? `Showing attributes for ${familyLabelByCode.get(productFamilyCode) ?? productFamilyCode}`
                    : 'Select a product family to narrow family-specific attributes'
                }
              >
                <Row gutter={[12, 12]}>
                  {visibleAttrDimensions.map((dim) => (
                    <Col xs={24} sm={12} md={8} lg={6} xl={4} key={dim.code}>
                      {filterLabel(dim.labelEs)}
                      <Select
                        mode="multiple"
                        placeholder={`Any ${dim.labelEs}`}
                        value={attrSelections[dim.code] ?? []}
                        onChange={(v) =>
                          setAttrSelections((prev) => ({ ...prev, [dim.code]: v as string[] }))
                        }
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        style={{ width: '100%' }}
                        maxTagCount="responsive"
                        options={dim.values
                          .filter((val) => val.isActive)
                          .map((val) => ({
                            value: val.code,
                            label: val.labelEs,
                          }))}
                      />
                    </Col>
                  ))}
                </Row>
              </FilterGroup>
            ) : null}

            <FilterGroup title="5. Avanzado">
              <Row gutter={[12, 12]}>
                <Col xs={24} sm={12} md={8} lg={6} xl={4}>
                  {filterLabel('Season')}
                  <Select
                    mode="multiple"
                    placeholder="Any season"
                    value={seasonCodes}
                    onChange={setSeasonCodes}
                    allowClear
                    showSearch
                    style={{ width: '100%' }}
                    maxTagCount="responsive"
                    options={(seasons ?? []).map((s) => ({
                      value: s.code,
                      label: `${s.code} - ${s.description}`,
                    }))}
                    filterOption={(input, option) =>
                      String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Col>
                <Col xs={24} sm={12} md={8} lg={6} xl={5}>
                  {filterLabel('Keyword')}
                  <Select
                    mode="multiple"
                    placeholder="Any keyword"
                    value={keywordCodes}
                    onChange={setKeywordCodes}
                    allowClear
                    showSearch
                    style={{ width: '100%' }}
                    maxTagCount="responsive"
                    options={(keywords ?? []).map((k) => ({
                      value: k.keyword,
                      label: k.description ? `${k.keyword} - ${k.description}` : k.keyword,
                    }))}
                    filterOption={(input, option) =>
                      String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Col>
              </Row>
            </FilterGroup>

            <Space>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={runQuery}
                loading={isRunning && hasRun}
              >
                Apply filters
              </Button>
              {anyFilterSet ? <Button onClick={clearFilters}>Clear filters</Button> : null}
              <Tooltip title="Pulls every SKU. Slow first time; use only when you need the full catalog.">
                <Button onClick={runQueryLoadAll} loading={isRunning && !anyFilterSet}>
                  Load all
                </Button>
              </Tooltip>
            </Space>
          </Space>
        </Card>
      )}

      {bulkMode && canBulkChangeSkus ? (
        <SkuBulkChangePanel
          activeFilters={activeFilters}
          hasRun={hasRun}
          resultCount={resultCount}
          resultSkus={enriched}
          selectedCodes={selectedCodes}
          setSelectedCodes={setSelectedCodes}
        />
      ) : null}

      {bulkMode && canBulkChangeSkus && hasRun ? (
        <Card size="small">
          <Space wrap size="small">
            <Typography.Text type="secondary">Result columns</Typography.Text>
            <Select
              mode="multiple"
              value={visibleResultColumnKeys}
              onChange={setVisibleResultColumns}
              options={resultColumnOptions}
              optionFilterProp="label"
              maxTagCount="responsive"
              style={{ minWidth: 420, maxWidth: 760 }}
            />
            <Button size="small" onClick={resetResultColumns}>
              Reset columns
            </Button>
          </Space>
        </Card>
      ) : null}

      <Card
        size="small"
        title={
          <Space>
            <Typography.Text strong>SKU</Typography.Text>
            {hasRun && !isRunning ? (
              <Typography.Text type="secondary">
                {resultCount.toLocaleString()} result{resultCount === 1 ? '' : 's'}
              </Typography.Text>
            ) : null}
          </Space>
        }
      >
        {!hasRun ? (
          <Alert
            type="info"
            showIcon
            message="Search or apply filters to load SKUs"
            description="Use the general search bar for SKU, vendor, brand, style/color, RICS or web description, category, or department. Open Filters for exact taxonomy and attribute filters."
          />
        ) : (
          <Table<EnrichedSku>
            size="small"
            className="products-compact-table"
            rowKey="code"
            dataSource={enriched}
            columns={visibleColumns}
            loading={isRunning}
            rowSelection={
              bulkMode && canBulkChangeSkus
                ? {
                    selectedRowKeys: selectedCodes,
                    onChange: (keys) => setSelectedCodes(keys.map(String)),
                    preserveSelectedRowKeys: true,
                  }
                : undefined
            }
            pagination={{
              defaultPageSize: 25,
              showSizeChanger: true,
              pageSizeOptions: [25, 50, 100, 200, 500],
            }}
            scroll={{ x: 1500 }}
          />
        )}
      </Card>
    </Space>
  )
}

function formatMoney(n: number): string {
  return n.toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function filterLabel(label: string) {
  return (
    <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 2 }}>
      {label}
    </Typography.Text>
  )
}

function FilterGroup({
  title,
  extra,
  children,
}: {
  title: string
  extra?: ReactNode
  children: ReactNode
}) {
  return (
    <Card
      size="small"
      type="inner"
      title={<Typography.Text strong>{title}</Typography.Text>}
      extra={
        extra ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {extra}
          </Typography.Text>
        ) : null
      }
      styles={{ body: { padding: 12 } }}
    >
      {children}
    </Card>
  )
}

function visibleDimensionsForFamily(
  dimensions: AttributeDimension[],
  familyCode: string | null,
): AttributeDimension[] {
  return dimensions
    .filter((dimension) => dimension.values.some((value) => value.isActive))
    .filter((dimension) => {
      if (!familyCode) return true
      if (dimension.familyRules.length === 0) return true
      return dimension.familyRules.some(
        (rule) => rule.familyCode === familyCode && rule.enabled,
      )
    })
    .sort((a, b) => {
      if (!familyCode) return a.sortOrder - b.sortOrder
      return familySortOrder(a, familyCode) - familySortOrder(b, familyCode)
    })
}

function familySortOrder(dimension: AttributeDimension, familyCode: string): number {
  const rule = dimension.familyRules.find((entry) => entry.familyCode === familyCode)
  return rule?.sortOrder ?? dimension.sortOrder
}
