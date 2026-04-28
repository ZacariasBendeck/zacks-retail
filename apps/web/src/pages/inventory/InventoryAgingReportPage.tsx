import { useState, useCallback, useMemo } from 'react'
import {
  Alert,
  Card,
  Row,
  Col,
  Table,
  Button,
  Space,
  Statistic,
  Tag,
  Typography,
  Spin,
  Breadcrumb,
  Empty,
  Radio,
  Select,
  Switch,
  Image,
} from 'antd'
import { buildRicsImageUrl } from '../../services/ricsImageUrl'
import {
  DownloadOutlined,
  ArrowLeftOutlined,
  WarningOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import {
  useAgingByDepartment,
  useAgingDrillDown,
  useAgingDimensions,
} from '../../hooks/useReports'
import { useStoreChains } from '../../hooks/useStores'
import {
  getAgingCsvUrl,
  getAgingXlsxUrl,
  AGING_BUCKET_SCHEMES,
  AGING_GROUP_BY_LABELS,
} from '../../services/reportApi'
import { validateDomainFilterContract } from '../../services/domainFilterContract'
import { getErrorMessage } from '../../utils/errors'
import type {
  AgingGroupSummary,
  AgingDetail,
  AgingBucketScheme,
  AgingGroupBy,
} from '../../services/reportApi'
import type { Department } from '../../types/sku'

const DEPARTMENT_COLORS: Record<Department, string> = {
  FORMAL: '#1677ff',
  CASUAL: '#52c41a',
  FIESTA: '#eb2f96',
  SANDALIAS: '#fa8c16',
  BOOTS: '#fa541c',
  COMFORT: '#13c2c2',
}

// Color is keyed off the bucket *position* within the chosen scheme, not the
// literal label, so the same green/blue/orange/red ramp works for every preset
// (0-30 vs 0-60 vs 0-90 all paint green for "freshest", etc.).
const BUCKET_POSITION_COLORS = ['green', 'blue', 'orange', 'red'] as const

function colorForBucket(bucket: string, scheme: AgingBucketScheme): string {
  const idx = AGING_BUCKET_SCHEMES[scheme].labels.indexOf(bucket)
  const safe = idx >= 0 ? idx : BUCKET_POSITION_COLORS.length - 1
  return BUCKET_POSITION_COLORS[safe] ?? BUCKET_POSITION_COLORS[BUCKET_POSITION_COLORS.length - 1]!
}

function renderAgingBucket(bucket: string, scheme: AgingBucketScheme) {
  return <Tag color={colorForBucket(bucket, scheme)}>{bucket} days</Tag>
}

// Currency is Honduran Lempira (HNL) system-wide — labeled once at the top of
// the page, not repeated in every cell (see CLAUDE.md "Currency" policy).
function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '-'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function InventoryAgingReportPage() {
  // `selectedGroupKey` doubles as the drill-down selector for whichever
  // group dimension is active (department description, sector number,
  // vendor code, or buyer code). The variable kept its old name in some
  // places below to minimize diff churn.
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [bucketScheme, setBucketScheme] = useState<AgingBucketScheme>('30_60_90')
  const [groupBy, setGroupBy] = useState<AgingGroupBy>('department')
  const [selectedStores, setSelectedStores] = useState<number[]>([])
  const [selectedChains, setSelectedChains] = useState<string[]>([])
  const [selectedBuyers, setSelectedBuyers] = useState<string[]>([])
  const [selectedSectors, setSelectedSectors] = useState<number[]>([])
  const [selectedDepartments, setSelectedDepartments] = useState<number[]>([])
  const [showPercentages, setShowPercentages] = useState<boolean>(false)
  const schemeLabels = AGING_BUCKET_SCHEMES[bucketScheme].labels
  const flagThreshold = AGING_BUCKET_SCHEMES[bucketScheme].flagThreshold
  const groupByLabel = AGING_GROUP_BY_LABELS[groupBy]

  const { data: dimensionsData } = useAgingDimensions()
  const { data: storeChains = [] } = useStoreChains()

  // Selecting one or more configured Store Chains expands to the union of
  // stores assigned to those chains. The expanded list combines with
  // explicitly selected stores before being sent to the API as `stores=...`.
  const effectiveStores = useMemo(() => {
    if (selectedChains.length === 0) return selectedStores
    const chainStores = storeChains
      .filter((chain) => selectedChains.includes(chain.id))
      .flatMap((chain) => chain.storeNumbers ?? [])
    const union = new Set<number>([...selectedStores, ...chainStores])
    return Array.from(union)
  }, [selectedStores, selectedChains, storeChains])

  const queryArgs = useMemo(
    () => ({
      groupBy,
      bucketScheme,
      stores: effectiveStores,
      buyers: selectedBuyers,
      sectors: selectedSectors,
      departments: selectedDepartments,
    }),
    [groupBy, bucketScheme, effectiveStores, selectedBuyers, selectedSectors, selectedDepartments],
  )

  const { data: deptData, isLoading: deptLoading, error: deptError } = useAgingByDepartment(queryArgs)
  const { data: drillData, isLoading: drillLoading, error: drillError } = useAgingDrillDown(
    selectedGroupKey ?? '',
    selectedCategory ?? undefined,
    queryArgs,
  )

  const filterValidation = useMemo(
    () =>
      validateDomainFilterContract(
        { department: selectedGroupKey, category: selectedCategory },
        // Category filter is meaningful only when grouping by department —
        // for sector/vendor/buyer groupings we drop the category gate.
        {
          requireDepartmentForCategory: groupBy === 'department',
          allowAnyDepartment: true,
        },
      ),
    [selectedCategory, selectedGroupKey, groupBy],
  )

  const reportErrorMessage = selectedGroupKey
    ? drillError
      ? getErrorMessage(drillError, 'Unable to load aging drill-down report.')
      : null
    : deptError
      ? getErrorMessage(deptError, 'Unable to load aging department summary.')
      : null

  const handleDepartmentClick = useCallback((groupKey: string) => {
    setSelectedGroupKey(groupKey)
    setSelectedCategory(null)
  }, [])

  const handleCategoryClick = useCallback((cat: number) => {
    setSelectedCategory(cat)
  }, [])

  const handleBack = useCallback(() => {
    if (selectedCategory != null) {
      setSelectedCategory(null)
    } else {
      setSelectedGroupKey(null)
    }
  }, [selectedCategory])

  // Switching the group dimension invalidates any in-progress drill-down —
  // a department key is meaningless when grouped by vendor.
  const handleGroupByChange = useCallback((next: AgingGroupBy) => {
    setGroupBy(next)
    setSelectedGroupKey(null)
    setSelectedCategory(null)
  }, [])

  const handleExportCsv = useCallback(() => {
    const url = getAgingCsvUrl(
      selectedGroupKey ?? undefined,
      selectedCategory ?? undefined,
      queryArgs,
    )
    window.open(url, '_blank')
  }, [selectedGroupKey, selectedCategory, queryArgs])

  const handleExportXlsx = useCallback(() => {
    const url = getAgingXlsxUrl(
      selectedGroupKey ?? undefined,
      selectedCategory ?? undefined,
      queryArgs,
    )
    window.open(url, '_blank')
  }, [selectedGroupKey, selectedCategory, queryArgs])

  // The API now ships both `groups` and `departments` (the latter is a
  // backward-compat alias). Read from `groups` so the variable name matches
  // the active dimension; fall back to `departments` for the older shape.
  const groupRows: AgingGroupSummary[] = deptData?.groups ?? deptData?.departments ?? []

  const totals = useMemo(() => {
    const totalUnits = groupRows.reduce((s, d) => s + d.totalUnits, 0)
    const totalValue = groupRows.reduce((s, d) => s + d.totalCostValue, 0)
    const flaggedUnits = groupRows.reduce((s, d) => s + d.flaggedUnits, 0)
    const flaggedValue = groupRows.reduce((s, d) => s + d.flaggedValue, 0)
    return { totalUnits, totalValue, flaggedUnits, flaggedValue }
  }, [groupRows])

  // Category drill-down between the group and per-SKU layers makes sense only
  // when grouping by department (categories live inside departments). For the
  // other dimensions we skip it.
  const categoryBreakdown = useMemo(() => {
    if (groupBy !== 'department') return null
    if (!drillData?.details || selectedCategory != null) return null
    const catMap = new Map<number, { skus: Set<string>; units: number; value: number; flaggedUnits: number; flaggedValue: number }>()
    for (const d of drillData.details) {
      let entry = catMap.get(d.category)
      if (!entry) {
        entry = { skus: new Set(), units: 0, value: 0, flaggedUnits: 0, flaggedValue: 0 }
        catMap.set(d.category, entry)
      }
      entry.skus.add(d.skuId)
      entry.units += d.quantityOnHand
      entry.value += d.costValue
      if (d.flagged) {
        entry.flaggedUnits += d.quantityOnHand
        entry.flaggedValue += d.costValue
      }
    }
    return Array.from(catMap.entries()).map(([category, data]) => ({
      category,
      totalSkus: data.skus.size,
      totalUnits: data.units,
      totalCostValue: data.value,
      flaggedUnits: data.flaggedUnits,
      flaggedValue: data.flaggedValue,
    })).sort((a, b) => b.totalCostValue - a.totalCostValue)
  }, [drillData, selectedCategory, groupBy])

  // Helper to pull a bucket's cost value (or 0) off an AgingGroupSummary.
  // Used as the sort key for the four aging-bucket columns so clicking the
  // header orders groups by how much $$ sits in that bucket.
  const bucketValue = (rec: AgingGroupSummary, bucket: string): number => {
    const b = rec.buckets.find((x) => x.bucket === bucket)
    return b?.totalCostValue ?? 0
  }

  // Render a bucket cell either as plain "X units / Y value" or with the
  // adjacent percentage (% of row's total cost value). Toggled by `showPercentages`.
  const renderBucketCell = (record: AgingGroupSummary, bucketLabel: string) => {
    const b = record.buckets.find((x) => x.bucket === bucketLabel)
    if (!b || b.totalUnits === 0) return '—'
    const pct = record.totalCostValue > 0 ? (b.totalCostValue / record.totalCostValue) * 100 : 0
    const main = `${b.totalUnits} units / ${formatMoney(b.totalCostValue)}`
    if (!showPercentages) return main
    return (
      <span>
        {main}{' '}
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          ({pct.toFixed(1)}%)
        </Typography.Text>
      </span>
    )
  }

  // Color the dimension tag using DEPARTMENT_COLORS only when grouped by
  // department (those colors are keyed off the legacy 6-macro names). For the
  // other dimensions just show the label without a tag color.
  const renderGroupLabel = (label: string) => {
    if (groupBy === 'department') {
      return <Tag color={DEPARTMENT_COLORS[label as Department]}>{label}</Tag>
    }
    return <Tag>{label}</Tag>
  }

  const departmentColumns = [
    {
      title: groupByLabel,
      dataIndex: 'groupLabel',
      key: 'groupLabel',
      render: (label: string) => renderGroupLabel(label),
      sorter: (a: AgingGroupSummary, b: AgingGroupSummary) =>
        a.groupLabel.localeCompare(b.groupLabel),
    },
    ...schemeLabels.slice(0, 3).map((label, idx) => ({
      title: `${label} Days`,
      key: `bucket_${idx}`,
      align: 'right' as const,
      render: (_: unknown, record: AgingGroupSummary) => renderBucketCell(record, label),
      sorter: (a: AgingGroupSummary, b: AgingGroupSummary) =>
        bucketValue(a, label) - bucketValue(b, label),
    })),
    {
      title: (
        <span>
          {schemeLabels[3]} Days <WarningOutlined style={{ color: '#cf1322' }} />
        </span>
      ),
      key: 'bucket_flagged',
      align: 'right' as const,
      render: (_: unknown, record: AgingGroupSummary) => {
        const b = record.buckets.find((x) => x.bucket === schemeLabels[3])
        if (!b || b.totalUnits === 0) return '—'
        const pct = record.totalCostValue > 0 ? (b.totalCostValue / record.totalCostValue) * 100 : 0
        return (
          <Typography.Text type="danger" strong>
            {b.totalUnits} units / {formatMoney(b.totalCostValue)}
            {showPercentages && (
              <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 'normal' }}>
                {' '}({pct.toFixed(1)}%)
              </Typography.Text>
            )}
          </Typography.Text>
        )
      },
      sorter: (a: AgingGroupSummary, b: AgingGroupSummary) =>
        bucketValue(a, schemeLabels[3]) - bucketValue(b, schemeLabels[3]),
    },
    {
      title: 'Total Value',
      dataIndex: 'totalCostValue',
      key: 'totalCostValue',
      align: 'right' as const,
      render: (v: number) => formatMoney(v),
      sorter: (a: AgingGroupSummary, b: AgingGroupSummary) =>
        a.totalCostValue - b.totalCostValue,
      // Default sort across all screens — biggest total value first.
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: AgingGroupSummary) => (
        <Button type="link" size="small" onClick={() => handleDepartmentClick(record.groupKey)}>
          Drill Down
        </Button>
      ),
    },
  ]

  const categoryColumns = [
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      sorter: (a: { category: number }, b: { category: number }) => a.category - b.category,
    },
    {
      title: 'Active SKUs',
      dataIndex: 'totalSkus',
      key: 'totalSkus',
      align: 'right' as const,
      sorter: (a: { totalSkus: number }, b: { totalSkus: number }) => a.totalSkus - b.totalSkus,
    },
    {
      title: 'Total Units',
      dataIndex: 'totalUnits',
      key: 'totalUnits',
      align: 'right' as const,
      sorter: (a: { totalUnits: number }, b: { totalUnits: number }) => a.totalUnits - b.totalUnits,
    },
    {
      title: 'Total Value',
      dataIndex: 'totalCostValue',
      key: 'totalCostValue',
      align: 'right' as const,
      render: (v: number) => formatMoney(v),
      sorter: (a: { totalCostValue: number }, b: { totalCostValue: number }) =>
        a.totalCostValue - b.totalCostValue,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: (
        <span>
          Flagged ({schemeLabels[3]}) <WarningOutlined style={{ color: '#cf1322' }} />
        </span>
      ),
      key: 'flagged',
      align: 'right' as const,
      render: (_: unknown, record: { flaggedUnits: number; flaggedValue: number }) => {
        if (record.flaggedUnits === 0) return '—'
        return (
          <Typography.Text type="danger" strong>
            {record.flaggedUnits} units / {formatMoney(record.flaggedValue)}
          </Typography.Text>
        )
      },
      sorter: (a: { flaggedValue: number }, b: { flaggedValue: number }) =>
        a.flaggedValue - b.flaggedValue,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: { category: number }) => (
        <Button type="link" size="small" onClick={() => handleCategoryClick(record.category)}>
          View Details
        </Button>
      ),
    },
  ]

  const detailColumns = [
    {
      title: 'Picture',
      key: 'picture',
      width: 70,
      align: 'center' as const,
      render: (_: unknown, record: AgingDetail) => {
        const url = buildRicsImageUrl(record.pictureFileName)
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
              maxWidth: 80,
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
      title: 'SKU Code',
      dataIndex: 'skuCode',
      key: 'skuCode',
      width: 180,
      ellipsis: true,
      sorter: (a: AgingDetail, b: AgingDetail) => a.skuCode.localeCompare(b.skuCode),
    },
    {
      title: 'Brand',
      dataIndex: 'brand',
      key: 'brand',
      width: 120,
      sorter: (a: AgingDetail, b: AgingDetail) =>
        (a.brand ?? '').localeCompare(b.brand ?? ''),
    },
    {
      title: 'Color',
      dataIndex: 'color',
      key: 'color',
      width: 100,
      sorter: (a: AgingDetail, b: AgingDetail) =>
        (a.color ?? '').localeCompare(b.color ?? ''),
    },
    {
      title: 'Discount',
      dataIndex: 'discountCode',
      key: 'discountCode',
      width: 110,
      // The legacy import does not currently populate `discount_code`, so most
      // cells render as "—" until the backfill lands.
      render: (code: string | null) => (code ? <Tag>{code}</Tag> : '—'),
      sorter: (a: AgingDetail, b: AgingDetail) =>
        (a.discountCode ?? '').localeCompare(b.discountCode ?? ''),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 90,
      sorter: (a: AgingDetail, b: AgingDetail) => a.category - b.category,
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      width: 90,
      align: 'right' as const,
      render: (v: number) => formatMoney(v),
      sorter: (a: AgingDetail, b: AgingDetail) => a.price - b.price,
    },
    {
      title: 'Qty On Hand',
      dataIndex: 'quantityOnHand',
      key: 'quantityOnHand',
      width: 100,
      align: 'right' as const,
      sorter: (a: AgingDetail, b: AgingDetail) => a.quantityOnHand - b.quantityOnHand,
    },
    {
      title: 'Cost Value',
      dataIndex: 'costValue',
      key: 'costValue',
      width: 110,
      align: 'right' as const,
      render: (v: number) => formatMoney(v),
      sorter: (a: AgingDetail, b: AgingDetail) => a.costValue - b.costValue,
      // Per-screen default: highest-value items at the top. Server already
      // returns rows sorted by cost_value DESC, but this prevents Ant's
      // table from showing the column unsorted on first paint.
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Days On Hand',
      dataIndex: 'daysOnHand',
      key: 'daysOnHand',
      width: 110,
      align: 'right' as const,
      sorter: (a: AgingDetail, b: AgingDetail) => a.daysOnHand - b.daysOnHand,
    },
    {
      title: 'Aging Bucket',
      dataIndex: 'agingBucket',
      key: 'agingBucket',
      width: 120,
      render: (bucket: string) => renderAgingBucket(bucket, bucketScheme),
      // Aging buckets are ordinal, not alphabetical — sort by daysOnHand which
      // is already the canonical ordering for "how old is this stock".
      sorter: (a: AgingDetail, b: AgingDetail) => a.daysOnHand - b.daysOnHand,
    },
    {
      title: 'Flagged',
      dataIndex: 'flagged',
      key: 'flagged',
      width: 80,
      render: (flagged: boolean) =>
        flagged ? <Tag color="red" icon={<WarningOutlined />}>Review</Tag> : null,
      filters: [
        { text: 'Flagged', value: true },
        { text: 'Not flagged', value: false },
      ],
      onFilter: (value: boolean | React.Key, record: AgingDetail) => record.flagged === value,
    },
  ]

  // Resolve the human label for whichever group the operator drilled into.
  // For department/sector the API uses the description for both key and label;
  // for vendor the key is the code (e.g. "SISL") and the label is the
  // short_name from `app.vendor`.
  const selectedGroupLabel = useMemo(() => {
    if (!selectedGroupKey) return null
    return groupRows.find((g) => g.groupKey === selectedGroupKey)?.groupLabel ?? selectedGroupKey
  }, [groupRows, selectedGroupKey])

  const breadcrumbItems = [{ title: `All ${groupByLabel}s` }]
  if (selectedGroupKey) {
    breadcrumbItems.push({ title: selectedGroupLabel ?? selectedGroupKey })
  }
  if (selectedCategory != null) {
    breadcrumbItems.push({ title: `Category ${selectedCategory}` })
  }

  const isLoading = selectedGroupKey ? drillLoading : deptLoading
  const hasData = selectedGroupKey
    ? (drillData?.details?.length ?? 0) > 0
    : groupRows.length > 0

  const filteredDetails = useMemo(() => {
    if (!drillData?.details) return []
    if (selectedCategory != null) {
      return drillData.details.filter((d) => d.category === selectedCategory)
    }
    return drillData.details
  }, [drillData, selectedCategory])

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {filterValidation.errors.length > 0 && (
        <Alert
          type="error"
          showIcon
          message="Invalid report filter selection"
          description={filterValidation.errors.join(' ')}
        />
      )}
      {groupBy === 'buyer' && (dimensionsData?.buyers?.length ?? 0) === 0 && (
        // The legacy importer did not populate `purchase_order_legacy.buyer`,
        // so the report has nothing to group by. Surface this directly so
        // operators don't think the page is broken.
        <Alert
          type="warning"
          showIcon
          message="Buyer field is not populated in the legacy data"
          description="Aging by Buyer will roll up everything into a single &quot;Unmapped&quot; bucket until the buyer column on `purchase_order_legacy` is backfilled. Pick a different dimension above (Department / Sector / Vendor / Store) to see meaningful groupings."
        />
      )}
      {reportErrorMessage && (
        <Alert
          type="error"
          showIcon
          message="Inventory aging request failed"
          description={reportErrorMessage}
        />
      )}
      {/* Header */}
      <Card size="small">
        <Row align="middle" justify="space-between">
          <Col>
            <Space>
              {selectedGroupKey && (
                <Button icon={<ArrowLeftOutlined />} size="small" onClick={handleBack} />
              )}
              <Typography.Title level={4} style={{ margin: 0 }}>
                Inventory Aging Report
              </Typography.Title>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<DownloadOutlined />} onClick={handleExportCsv}>
                Export CSV
              </Button>
              <Button icon={<DownloadOutlined />} onClick={handleExportXlsx}>
                Export XLSX
              </Button>
            </Space>
          </Col>
        </Row>

        {/* Toolbar row 1: report-type (group dimension) + stores criteria */}
        <Row align="middle" style={{ marginTop: 12 }} gutter={[12, 8]}>
          <Col>
            <Typography.Text strong>Aging by:</Typography.Text>
          </Col>
          <Col>
            <Select<AgingGroupBy>
              value={groupBy}
              onChange={handleGroupByChange}
              style={{ minWidth: 150 }}
              options={[
                { value: 'department', label: 'Department' },
                { value: 'sector', label: 'Sector' },
                { value: 'vendor', label: 'Vendor' },
                { value: 'buyer', label: 'Buyer' },
                { value: 'store', label: 'Store' },
              ]}
            />
          </Col>
          <Col>
            <Typography.Text strong>Stores:</Typography.Text>
          </Col>
          <Col flex="auto">
            <Select<number[]>
              mode="multiple"
              allowClear
              value={selectedStores}
              onChange={(values) => setSelectedStores(values)}
              placeholder="All stores"
              style={{ minWidth: 240, width: '100%' }}
              maxTagCount="responsive"
              optionFilterProp="label"
              options={(dimensionsData?.stores ?? []).map((s) => ({
                value: s.number,
                label: `${s.number} — ${s.name ?? '(no name)'}`,
              }))}
            />
          </Col>
        </Row>

        {/* Toolbar row 2: criteria multi-selects (chain / buyer / sector / department) */}
        <Row align="middle" style={{ marginTop: 12 }} gutter={[12, 8]}>
          <Col>
            <Typography.Text strong>Criteria:</Typography.Text>
          </Col>
          <Col flex="1 1 200px">
            <Select<string[]>
              mode="multiple"
              allowClear
              value={selectedChains}
              onChange={setSelectedChains}
              placeholder="Store Chain"
              style={{ width: '100%' }}
              maxTagCount="responsive"
              optionFilterProp="label"
              notFoundContent="No store chains configured"
              options={storeChains.map((c) => ({
                value: c.id,
                label: `${c.label} (${c.storeCount} stores)`,
              }))}
            />
          </Col>
          <Col flex="1 1 200px">
            <Select<string[]>
              mode="multiple"
              allowClear
              value={selectedBuyers}
              onChange={setSelectedBuyers}
              placeholder="Buyer"
              style={{ width: '100%' }}
              maxTagCount="responsive"
              optionFilterProp="label"
              notFoundContent="No buyers (legacy field is unpopulated)"
              options={(dimensionsData?.buyers ?? []).map((b) => ({
                value: b.code,
                label: b.label,
              }))}
            />
          </Col>
          <Col flex="1 1 200px">
            <Select<number[]>
              mode="multiple"
              allowClear
              value={selectedSectors}
              onChange={setSelectedSectors}
              placeholder="Sector"
              style={{ width: '100%' }}
              maxTagCount="responsive"
              optionFilterProp="label"
              options={(dimensionsData?.sectors ?? []).map((s) => ({
                value: s.number,
                label: `${s.number} — ${s.name}`,
              }))}
            />
          </Col>
          <Col flex="1 1 200px">
            <Select<number[]>
              mode="multiple"
              allowClear
              value={selectedDepartments}
              onChange={setSelectedDepartments}
              placeholder="Department"
              style={{ width: '100%' }}
              maxTagCount="responsive"
              optionFilterProp="label"
              options={(dimensionsData?.departments ?? []).map((d) => ({
                value: d.number,
                label: `${d.number} — ${d.name}`,
              }))}
            />
          </Col>
        </Row>

        {/* Toolbar row 3: bucket scheme + show-percentages toggle */}
        <Row align="middle" style={{ marginTop: 12 }} gutter={[12, 8]}>
          <Col>
            <Typography.Text strong>Aging buckets:</Typography.Text>
          </Col>
          <Col>
            <Radio.Group
              value={bucketScheme}
              onChange={(e) => setBucketScheme(e.target.value as AgingBucketScheme)}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="30_60_90">30 / 60 / 90</Radio.Button>
              <Radio.Button value="60_120_180">60 / 120 / 180</Radio.Button>
              <Radio.Button value="90_180_270">90 / 180 / 270</Radio.Button>
            </Radio.Group>
          </Col>
          <Col>
            <Space>
              <Typography.Text strong>Show %</Typography.Text>
              <Switch checked={showPercentages} onChange={setShowPercentages} />
            </Space>
          </Col>
        </Row>

        <Breadcrumb style={{ marginTop: 8 }} items={breadcrumbItems} />
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
          Amounts in Lempira (HNL). Aging clock = days since the most recent
          PO receipt for the SKU (resets each time a PO enters the warehouse).
          SKUs with no PO history fall back to the SKU creation date.
        </Typography.Paragraph>
      </Card>

      {/* Summary KPIs (top-level only) */}
      {!selectedGroupKey && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="Total Units On Hand"
                value={totals.totalUnits}
                prefix={<ClockCircleOutlined />}
                loading={deptLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="Total Inventory Value"
                value={totals.totalValue}
                precision={2}
                loading={deptLoading}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title={`Flagged Units (${flagThreshold}+ Days)`}
                value={totals.flaggedUnits}
                prefix={<WarningOutlined />}
                loading={deptLoading}
                valueStyle={{ color: totals.flaggedUnits > 0 ? '#cf1322' : '#3f8600' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title={`Flagged Value (${flagThreshold}+ Days)`}
                value={totals.flaggedValue}
                precision={2}
                loading={deptLoading}
                valueStyle={{ color: totals.flaggedValue > 0 ? '#cf1322' : '#3f8600' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Content */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : !hasData ? (
        <Card>
          <Empty description="No inventory on hand to report. Ensure there is stock in the system." />
        </Card>
      ) : !selectedGroupKey ? (
        <Card title={`Inventory Aging by ${groupByLabel}`}>
          <Table<AgingGroupSummary>
            dataSource={groupRows}
            columns={departmentColumns}
            rowKey="groupKey"
            pagination={false}
            size="middle"
            summary={(data) => {
              const totalValue = data.reduce((s, r) => s + r.totalCostValue, 0)
              const flaggedUnits = data.reduce((s, r) => s + r.flaggedUnits, 0)
              const flaggedValue = data.reduce((s, r) => s + r.flaggedValue, 0)
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <Typography.Text strong>Total</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} />
                  <Table.Summary.Cell index={2} />
                  <Table.Summary.Cell index={3} />
                  <Table.Summary.Cell index={4} align="right">
                    {flaggedUnits > 0 && (
                      <Typography.Text type="danger" strong>
                        {flaggedUnits} units / {formatMoney(flaggedValue)}
                      </Typography.Text>
                    )}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    <Typography.Text strong>{formatMoney(totalValue)}</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} />
                </Table.Summary.Row>
              )
            }}
          />
        </Card>
      ) : (
        <>
          {selectedCategory == null && categoryBreakdown && (
            <Card title={`Categories in ${selectedGroupLabel ?? selectedGroupKey}`}>
              <Table
                dataSource={categoryBreakdown}
                columns={categoryColumns}
                rowKey="category"
                pagination={false}
                size="middle"
              />
            </Card>
          )}

          <Card
            title={
              selectedCategory != null
                ? `Detail: ${selectedGroupLabel ?? selectedGroupKey} / Category ${selectedCategory}`
                : `All Items in ${selectedGroupLabel ?? selectedGroupKey}`
            }
          >
            <Table<AgingDetail>
              dataSource={filteredDetails}
              columns={detailColumns}
              rowKey="skuId"
              size="small"
              scroll={{ x: 1400 }}
              pagination={{
                pageSize: 50,
                showSizeChanger: true,
                pageSizeOptions: ['25', '50', '100'],
              }}
            />
          </Card>
        </>
      )}
    </Space>
  )
}
