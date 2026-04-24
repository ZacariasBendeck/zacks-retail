/**
 * Change SKU Attributes — consolidated bulk-edit workbench.
 *
 * Replaces the four previous one-attribute pages (Change Categories, Vendors,
 * Seasons, Group Codes). Same SKU search/select workflow; an "Action" picker
 * at the top of the Apply bar decides which attribute to overwrite. Reduces
 * four near-identical pages to one and lets the operator pivot between
 * attributes mid-flow without losing the selection.
 *
 * Spec: docs/modules/utilities.md, docs/dev/specs/2026-04-21-utilities-batch-change-design.md
 * RICS p. 194.
 */

import { useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Image,
  Input,
  Popconfirm,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { PlayCircleOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { productsSkuApi } from '../../services/productsSkuApi'
import { SkuLink } from '../../components/sku-link'
import {
  useCategories,
  useDepartments,
  useGroups,
  useKeywords,
  useSeasons,
  useSectors,
} from '../../hooks/useProductsTaxonomy'
import { useVendors } from '../../hooks/useProductsVendors'
import { useApplyBatchChange } from '../../hooks/useUtilities'
import { buildRicsImageUrl } from '../../services/ricsImageUrl'
import type { SkuListFilters } from '../../types/productsSku'
import type { Department, Sector } from '../../types/productsTaxonomy'
import type {
  AttributeChange,
  BatchOperationType,
} from '../../services/utilitiesApi'

type ActionKind = 'CATEGORY' | 'VENDOR' | 'SEASON' | 'GROUP'

const ACTION_META: Record<ActionKind, { label: string; verb: string; opType: BatchOperationType }> = {
  CATEGORY: { label: 'Category', verb: 'Move to category', opType: 'CHANGE_CATEGORY' },
  VENDOR:   { label: 'Vendor',   verb: 'Reassign to vendor', opType: 'CHANGE_VENDOR' },
  SEASON:   { label: 'Season',   verb: 'Reassign to season', opType: 'CHANGE_SEASON' },
  GROUP:    { label: 'Group',    verb: 'Reassign to group',  opType: 'CHANGE_GROUP_CODE' },
}

export default function ChangeSkuAttributesPage() {
  const navigate = useNavigate()
  const { message, notification } = App.useApp()

  // Filter state
  const [q, setQ] = useState('')
  const [departmentNumber, setDepartmentNumber] = useState<number | null>(null)
  const [sectorNumber, setSectorNumber] = useState<number | null>(null)
  const [categoryNumbers, setCategoryNumbers] = useState<number[]>([])
  const [groupCodes, setGroupCodes] = useState<string[]>([])
  const [keywordCodes, setKeywordCodes] = useState<string[]>([])
  const [seasonCodes, setSeasonCodes] = useState<string[]>([])
  const [vendorCodes, setVendorCodes] = useState<string[]>([])
  const [styleColor, setStyleColor] = useState('')
  const [description, setDescription] = useState('')

  // Selection persists across filter/sort changes for bulk ops.
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])

  // Action + per-action target value. Reset all targets when action changes
  // so a stale category target doesn't apply when we switch to vendor.
  const [action, setAction] = useState<ActionKind>('CATEGORY')
  const [targetCategory, setTargetCategory] = useState<number | undefined>(undefined)
  const [targetVendor, setTargetVendor] = useState<string | undefined>(undefined)
  const [targetSeason, setTargetSeason] = useState<string | undefined>(undefined)
  const [targetGroup, setTargetGroup] = useState<string | undefined>(undefined)

  const onActionChange = (next: ActionKind) => {
    setAction(next)
    setTargetCategory(undefined)
    setTargetVendor(undefined)
    setTargetSeason(undefined)
    setTargetGroup(undefined)
  }

  // Taxonomy data
  const { data: departments } = useDepartments()
  const { data: sectors } = useSectors()
  const { data: categories } = useCategories()
  const { data: groups } = useGroups()
  const { data: keywords } = useKeywords()
  const { data: seasons } = useSeasons()
  const { data: vendors } = useVendors()

  // Department → category range
  const deptCategoryRange = useMemo(() => {
    if (departmentNumber == null || !departments) return null
    const d = departments.find((x) => x.number === departmentNumber)
    if (!d) return null
    const out: number[] = []
    for (let c = d.begCateg; c <= d.endCateg; c++) out.push(c)
    return out
  }, [departmentNumber, departments])

  // Sector → departments → category ranges
  const sectorCategoryRange = useMemo(() => {
    if (sectorNumber == null || !sectors || !departments) return null
    const s = sectors.find((x) => x.number === sectorNumber)
    if (!s) return null
    const depts = departments.filter((d) => d.number >= s.begDept && d.number <= s.endDept)
    const out: number[] = []
    for (const d of depts) {
      for (let c = d.begCateg; c <= d.endCateg; c++) out.push(c)
    }
    return out
  }, [sectorNumber, sectors, departments])

  const effectiveCategories = useMemo(() => {
    const sets: Set<number>[] = []
    if (deptCategoryRange) sets.push(new Set(deptCategoryRange))
    if (sectorCategoryRange) sets.push(new Set(sectorCategoryRange))
    if (categoryNumbers.length > 0) sets.push(new Set(categoryNumbers))
    if (sets.length === 0) return undefined
    const first = sets[0]!
    let result = Array.from(first)
    for (let i = 1; i < sets.length; i++) {
      const s = sets[i]!
      result = result.filter((x) => s.has(x))
    }
    return result
  }, [deptCategoryRange, sectorCategoryRange, categoryNumbers])

  // Hierarchical narrowing: Sector → Departments → Categories
  const availableDepartments = useMemo(() => {
    if (!departments) return []
    if (sectorNumber == null) return departments
    const s = sectors?.find((x) => x.number === sectorNumber)
    if (!s) return departments
    return departments.filter((d) => d.number >= s.begDept && d.number <= s.endDept)
  }, [departments, sectors, sectorNumber])

  const availableCategories = useMemo(() => {
    if (!categories) return []
    const parentRange = new Set<number>()
    if (deptCategoryRange) for (const c of deptCategoryRange) parentRange.add(c)
    else if (sectorCategoryRange) for (const c of sectorCategoryRange) parentRange.add(c)
    if (parentRange.size === 0) return categories
    return categories.filter((c) => parentRange.has(c.number))
  }, [categories, deptCategoryRange, sectorCategoryRange])

  const onSectorChange = (v: number | null) => {
    setSectorNumber(v)
    if (v != null) {
      const s = sectors?.find((x) => x.number === v)
      if (s) {
        if (departmentNumber != null && (departmentNumber < s.begDept || departmentNumber > s.endDept)) {
          setDepartmentNumber(null)
        }
        const validCats = new Set<number>()
        for (const d of departments ?? []) {
          if (d.number >= s.begDept && d.number <= s.endDept) {
            for (let c = d.begCateg; c <= d.endCateg; c++) validCats.add(c)
          }
        }
        setCategoryNumbers((prev) => prev.filter((c) => validCats.has(c)))
      }
    }
  }
  const onDepartmentChange = (v: number | null) => {
    setDepartmentNumber(v)
    if (v != null) {
      const d = departments?.find((x) => x.number === v)
      if (d) {
        setCategoryNumbers((prev) => prev.filter((c) => c >= d.begCateg && c <= d.endCateg))
      }
    }
  }

  // Committed query
  const [activeFilters, setActiveFilters] = useState<SkuListFilters | null>(null)
  const { data: skus, isLoading, isFetching } = useQuery({
    queryKey: ['products-skus', 'list', activeFilters],
    queryFn: () => productsSkuApi.list(activeFilters ?? undefined),
    enabled: activeFilters != null,
    staleTime: 5 * 60_000,
  })

  const apply = useApplyBatchChange()

  // Parallel on-hand totals query
  const skuCodes = useMemo(() => (skus ?? []).map((s) => s.code), [skus])
  const { data: onHandTotals } = useQuery({
    queryKey: ['products-skus', 'on-hand-totals', skuCodes],
    queryFn: () => productsSkuApi.onHandTotals(skuCodes),
    enabled: skuCodes.length > 0,
    staleTime: 5 * 60_000,
  })

  // Dept/Sector rollup
  const deptFor = useMemo(() => {
    return (categoryNum: number | null): Department | null => {
      if (categoryNum == null || !departments) return null
      return (
        departments.find((d) => d.begCateg <= categoryNum && d.endCateg >= categoryNum) ?? null
      )
    }
  }, [departments])

  const sectorFor = useMemo(() => {
    return (deptNum: number | null): Sector | null => {
      if (deptNum == null || !sectors) return null
      return sectors.find((s) => s.begDept <= deptNum && s.endDept >= deptNum) ?? null
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
              ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
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
      sorter: (a: EnrichedSku, b: EnrichedSku) => a.description.localeCompare(b.description),
    },
    {
      title: 'Vendor',
      dataIndex: 'vendor',
      key: 'vendor',
      width: 90,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.vendor ?? '').localeCompare(b.vendor ?? ''),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      align: 'right' as const,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.category ?? 0) - (b.category ?? 0),
    },
    {
      title: 'Department',
      key: 'department',
      width: 180,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a._deptNumber ?? 0) - (b._deptNumber ?? 0),
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
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.season ?? '').localeCompare(b.season ?? ''),
    },
    {
      title: 'Group',
      dataIndex: 'groupCode',
      key: 'groupCode',
      width: 90,
      sorter: (a: EnrichedSku, b: EnrichedSku) =>
        (a.groupCode ?? '').localeCompare(b.groupCode ?? ''),
      render: (v: string | null) =>
        v ? v : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: 'Size Type',
      dataIndex: 'sizeType',
      key: 'sizeType',
      width: 90,
      align: 'right' as const,
      sorter: (a: EnrichedSku, b: EnrichedSku) => (a.sizeType ?? 0) - (b.sizeType ?? 0),
      render: (v: number | null) =>
        v == null ? <Typography.Text type="secondary">—</Typography.Text> : v,
    },
    {
      title: 'Keywords',
      key: 'keywords',
      render: (_: unknown, r: EnrichedSku) => {
        const kws = r.keywords ?? []
        if (kws.length === 0) return <Typography.Text type="secondary">—</Typography.Text>
        return (
          <Space size={2} wrap>
            {kws.map((k) => (
              <Tag key={k} style={{ marginInlineEnd: 0 }}>
                {k}
              </Tag>
            ))}
          </Space>
        )
      },
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
  ]

  const buildFilters = (): SkuListFilters => ({
    q: q.trim() || undefined,
    vendors: vendorCodes.length > 0 ? vendorCodes : undefined,
    categories: effectiveCategories,
    seasons: seasonCodes.length > 0 ? seasonCodes : undefined,
    groups: groupCodes.length > 0 ? groupCodes : undefined,
    keywords: keywordCodes.length > 0 ? keywordCodes : undefined,
    styleColor: styleColor.trim() || undefined,
    description: description.trim() || undefined,
  })

  const runQuery = () => setActiveFilters(buildFilters())

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
    setDescription('')
  }

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
    description.trim().length > 0

  const selectAllVisible = () => {
    const visible = enriched.map((r) => r.code)
    const merged = Array.from(new Set([...selectedCodes, ...visible]))
    setSelectedCodes(merged)
  }

  // ─────────── action helpers ───────────

  /** Returns the currently-set target value for the active action (null/undefined if blank). */
  const currentTarget = (): number | string | undefined => {
    switch (action) {
      case 'CATEGORY': return targetCategory
      case 'VENDOR':   return targetVendor
      case 'SEASON':   return targetSeason
      case 'GROUP':    return targetGroup
    }
  }

  /** Build the AttributeChange payload from action + target. Returns null if invalid. */
  const buildChange = (): AttributeChange | null => {
    switch (action) {
      case 'CATEGORY': return targetCategory != null ? { type: 'CHANGE_CATEGORY', category: targetCategory } : null
      case 'VENDOR':   return targetVendor ? { type: 'CHANGE_VENDOR', vendor: targetVendor } : null
      case 'SEASON':   return targetSeason ? { type: 'CHANGE_SEASON', season: targetSeason } : null
      case 'GROUP':    return targetGroup ? { type: 'CHANGE_GROUP_CODE', groupCode: targetGroup } : null
    }
  }

  const targetReady = currentTarget() != null && currentTarget() !== ''
  const meta = ACTION_META[action]

  const applyChange = async () => {
    if (selectedCodes.length === 0) {
      message.warning('Select at least one SKU.')
      return
    }
    const change = buildChange()
    if (!change) {
      message.warning(`Pick a target ${meta.label.toLowerCase()}.`)
      return
    }
    try {
      const result = await apply.mutateAsync({
        operationType: meta.opType,
        criteria: { skus: selectedCodes },
        change,
      })
      if (result.affectedCount === 0) {
        message.info('No SKUs matched — nothing changed.')
        return
      }
      const targetDisplay =
        action === 'CATEGORY' ? `category ${targetCategory}`
        : action === 'VENDOR' ? `vendor ${targetVendor}`
        : action === 'SEASON' ? `season ${targetSeason}`
        : `group ${targetGroup}`
      notification.success({
        message: `Reassigned ${result.affectedCount} SKU${result.affectedCount === 1 ? '' : 's'} to ${targetDisplay}`,
        description: result.batchId && (
          <a href={`/utilities/batch-history/${result.batchId}`}>View batch / Undo</a>
        ),
        duration: 30,
      })
      setSelectedCodes([])
      setTargetCategory(undefined)
      setTargetVendor(undefined)
      setTargetSeason(undefined)
      setTargetGroup(undefined)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const isRunning = isLoading || isFetching
  const hasRun = activeFilters != null
  const resultCount = enriched.length

  // Target value field — single component depending on action.
  const renderTargetField = () => {
    switch (action) {
      case 'CATEGORY':
        return (
          <Select<number>
            placeholder="Target category"
            value={targetCategory}
            options={(categories ?? []).map((c) => ({
              value: c.number,
              label: `${c.number} — ${c.description}`,
            }))}
            onChange={setTargetCategory}
            allowClear
            showSearch
            style={{ minWidth: 280 }}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
        )
      case 'VENDOR':
        return (
          <Select<string>
            placeholder="Target vendor"
            value={targetVendor}
            options={(vendors ?? []).map((v) => ({
              value: v.code,
              label: `${v.code} — ${v.name}`,
            }))}
            onChange={setTargetVendor}
            allowClear
            showSearch
            style={{ minWidth: 280 }}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
        )
      case 'SEASON':
        return (
          <Select<string>
            placeholder="Target season"
            value={targetSeason}
            options={(seasons ?? []).map((s) => ({
              value: s.code,
              label: `${s.code} — ${s.description}`,
            }))}
            onChange={setTargetSeason}
            allowClear
            showSearch
            style={{ minWidth: 240 }}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
        )
      case 'GROUP':
        return (
          <Select<string>
            placeholder="Target group"
            value={targetGroup}
            options={(groups ?? []).map((g) => ({
              value: g.code,
              label: `${g.code} — ${g.description}`,
            }))}
            onChange={setTargetGroup}
            allowClear
            showSearch
            style={{ minWidth: 240 }}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
        )
    }
  }

  return (
    <Card
      title={
        <Space>
          <Typography.Text strong>Change SKU Attributes</Typography.Text>
          {hasRun && !isRunning ? (
            <Typography.Text type="secondary">
              {resultCount.toLocaleString()} result{resultCount === 1 ? '' : 's'}
            </Typography.Text>
          ) : null}
        </Space>
      }
      extra={
        <Space>
          <Button onClick={() => navigate('/utilities')}>Back to Utilities</Button>
          <Button onClick={() => navigate('/utilities/batch-history')}>Batch History</Button>
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Search SKUs → select the ones you want to change → pick the action and target
          → Apply. Reversible via Batch History. <Typography.Text type="secondary">RICS p. 194.</Typography.Text>
        </Typography.Paragraph>

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
            placeholder="Sector"
            value={sectorNumber ?? undefined}
            onChange={(v) => onSectorChange(typeof v === 'number' ? v : null)}
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
            placeholder={
              sectorNumber != null
                ? `Department (${availableDepartments.length} in sector)`
                : 'Department'
            }
            value={departmentNumber ?? undefined}
            onChange={(v) => onDepartmentChange(typeof v === 'number' ? v : null)}
            allowClear
            showSearch
            style={{ minWidth: 240 }}
            options={availableDepartments.map((d) => ({
              value: d.number,
              label: `${d.number} — ${d.description}`,
            }))}
            filterOption={(input, option) =>
              (option?.label as string).toLowerCase().includes(input.toLowerCase())
            }
          />
          <Select
            mode="multiple"
            placeholder={
              departmentNumber != null || sectorNumber != null
                ? `Category (${availableCategories.length} in scope)`
                : 'Category'
            }
            value={categoryNumbers}
            onChange={setCategoryNumbers}
            allowClear
            style={{ minWidth: 280 }}
            maxTagCount={2}
            options={availableCategories.map((c) => ({
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
            style={{ minWidth: 220 }}
            maxTagCount={2}
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
            style={{ minWidth: 220 }}
            maxTagCount={2}
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
            style={{ minWidth: 200 }}
            maxTagCount={2}
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
            style={{ minWidth: 260 }}
            maxTagCount={2}
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
          <Tooltip title="Description match with optional asterisks. Examples: BOOT (contains), BOOT* (starts with), *BOOT (ends with), BOOT*CUERO (starts BOOT ends CUERO).">
            <Input
              placeholder="Description (BOOT*, *CUERO, BO*RO)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onPressEnter={runQuery}
              allowClear
              style={{ width: 260 }}
            />
          </Tooltip>
        </Space>

        {/* Run / clear controls */}
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
        </Space>

        {/* Apply bar — selection summary, action picker, target field, apply */}
        <Card size="small" style={{ background: '#fafafa' }}>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Space wrap>
              <Typography.Text strong>
                {selectedCodes.length.toLocaleString()} SKU{selectedCodes.length === 1 ? '' : 's'} selected
              </Typography.Text>
              {hasRun && resultCount > 0 && (
                <Tooltip title="Add every SKU in the current result set to the selection. Existing picks are kept.">
                  <Button size="small" onClick={selectAllVisible}>
                    Select all in results ({resultCount})
                  </Button>
                </Tooltip>
              )}
              {selectedCodes.length > 0 && (
                <Button size="small" onClick={() => setSelectedCodes([])}>
                  Clear selection
                </Button>
              )}
            </Space>
            <Space wrap>
              <span>Change:</span>
              <Radio.Group
                value={action}
                onChange={(e) => onActionChange(e.target.value as ActionKind)}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="CATEGORY">Category</Radio.Button>
                <Radio.Button value="VENDOR">Vendor</Radio.Button>
                <Radio.Button value="SEASON">Season</Radio.Button>
                <Radio.Button value="GROUP">Group</Radio.Button>
              </Radio.Group>
              <span style={{ marginLeft: 12 }}>{meta.verb}:</span>
              {renderTargetField()}
              <Popconfirm
                title={`${meta.verb} for ${selectedCodes.length} SKU${selectedCodes.length === 1 ? '' : 's'}?`}
                description="Reversible via Batch History."
                okText="Apply"
                cancelText="Cancel"
                onConfirm={applyChange}
                disabled={selectedCodes.length === 0 || !targetReady}
              >
                <Button
                  type="primary"
                  loading={apply.isPending}
                  disabled={selectedCodes.length === 0 || !targetReady}
                >
                  Apply
                </Button>
              </Popconfirm>
            </Space>
          </Space>
        </Card>

        {/* Empty state / result table */}
        {!hasRun ? (
          <Alert
            type="info"
            showIcon
            message="Pick filters and click Run query"
            description="Nothing loads until you ask for it. Use the filters above, hit Run query, then select the SKUs you want to change."
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
