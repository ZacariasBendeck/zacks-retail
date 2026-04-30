import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  BranchesOutlined,
  CheckOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import {
  useCommitBalancingTransferRun,
  useCreateBalancingTransferRun,
  useTransferStores,
} from '../../hooks/useTransferRuns'
import {
  useCreateReportTemplate,
  useReportTemplate,
  useReportTemplatesList,
  useTouchReportTemplate,
  useUpdateReportTemplate,
} from '../../hooks/useReportTemplates'
import { StockMaintenanceHero } from '../../components/stock-maintenance'
import type {
  BalancingTransferMetricSnapshot,
  BalancingTransferPreviewLine,
  BalancingTransferPreviewRecord,
  CreateBalancingTransferRunPayload,
} from '../../types/transferRuns'
import type { ReportType } from '../../services/reportTemplatesApi'

function splitCodes(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function parseRicsNumberSelection(raw: string): number[] {
  const selected = new Set<number>()
  for (const token of raw.split(',')) {
    const part = token.trim()
    if (!part) continue
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/)
    if (rangeMatch) {
      const start = Number(rangeMatch[1])
      const end = Number(rangeMatch[2])
      const low = Math.min(start, end)
      const high = Math.max(start, end)
      for (let value = low; value <= high; value += 1) selected.add(value)
      continue
    }
    const parsed = Number(part)
    if (Number.isInteger(parsed) && parsed >= 0) selected.add(parsed)
  }
  return [...selected].sort((left, right) => left - right)
}

const BALANCING_REPORT_TYPE: ReportType = 'balancing-transfer'

const RICS_PRESETS: Array<{
  key: string
  title: string
  payload: CreateBalancingTransferRunPayload
}> = [
  {
    key: 'ROPACABALLEROS',
    title: 'ROPACABALLEROS',
    payload: {
      algorithmMode: 'RICS_MIMIC',
      balancingMethod: 'OVER_UNDER_MODELS',
      performanceMetric: 'TURNS',
      salesPeriod: 'MONTH',
      sortOrder: 'CATEGORY',
      tieBreakKind: 'ABSOLUTE',
      tieBreakValue: 0,
      transferDoublesToLowerPriority: false,
      stripStoresBelowSizeCount: null,
      criteria: {
        ricsStoreSelection: '2,5-25,28-30,35-43,99',
        ricsCategorySelection: '301-499',
        ricsSeasonSelection: 'A-Z,1-9,0',
        ricsKeywordExclusions: '<>DST,<>VER26*',
      },
    },
  },
  {
    key: 'ZAPCABALLEROS',
    title: 'ZAP CABALLEROS',
    payload: {
      algorithmMode: 'RICS_MIMIC',
      balancingMethod: 'OVER_UNDER_MODELS',
      performanceMetric: 'TURNS',
      salesPeriod: 'MONTH',
      sortOrder: 'VENDOR',
      tieBreakKind: 'ABSOLUTE',
      tieBreakValue: 0,
      transferDoublesToLowerPriority: false,
      stripStoresBelowSizeCount: null,
      criteria: {
        ricsStoreSelection: '2,5-24,28-30,35-43,99',
        ricsCategorySelection: '500-555',
        ricsSeasonSelection: 'Q-Z,1-9,A',
        ricsKeywordExclusions: '<>DST',
      },
    },
  },
]

type BalancingAlgorithmMode = 'APP_LEGACY' | 'RICS_MIMIC'

function normalizeBalancingPayload(
  raw: Partial<CreateBalancingTransferRunPayload>,
  defaultMode: BalancingAlgorithmMode = 'APP_LEGACY',
): CreateBalancingTransferRunPayload {
  const algorithmMode = raw.algorithmMode ?? defaultMode
  const ricsMode = algorithmMode === 'RICS_MIMIC'

  return {
    algorithmMode,
    balancingMethod: ricsMode ? 'OVER_UNDER_MODELS' : raw.balancingMethod ?? 'WITHOUT_CONSIDERING_MODELS',
    performanceMetric: ricsMode ? 'TURNS' : raw.performanceMetric ?? 'ROI',
    salesPeriod: ricsMode ? 'MONTH' : raw.salesPeriod ?? 'YEAR',
    sortOrder: raw.sortOrder ?? 'SKU',
    tieBreakKind: ricsMode ? 'ABSOLUTE' : raw.tieBreakKind ?? 'PERCENT',
    tieBreakValue: ricsMode ? 0 : raw.tieBreakValue ?? 25,
    transferDoublesToLowerPriority: ricsMode ? false : raw.transferDoublesToLowerPriority ?? false,
    stripStoresBelowSizeCount: ricsMode ? null : raw.stripStoresBelowSizeCount ?? null,
    inTransitPos: raw.inTransitPos ?? false,
    criteria: raw.criteria ?? {},
  }
}

function formatMetric(
  metric: BalancingTransferMetricSnapshot,
  kind: 'ROI' | 'TURNS' | 'SELL_THRU',
): string {
  if (kind === 'TURNS') {
    return metric.displayValue.toFixed(2)
  }
  return `${metric.displayValue.toFixed(1)}%`
}

export default function BalancingTransferPreviewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') ?? undefined
  const { message } = App.useApp()
  const { data: stores = [], isLoading: storesLoading, error: storesError } = useTransferStores()
  const createRun = useCreateBalancingTransferRun()
  const commitRun = useCommitBalancingTransferRun()
  const createTemplate = useCreateReportTemplate()
  const updateTemplate = useUpdateReportTemplate()
  const touchTemplate = useTouchReportTemplate()
  const { data: balancingTemplates } = useReportTemplatesList('mine', BALANCING_REPORT_TYPE)
  const { data: templateData } = useReportTemplate(templateId)
  const hydratedFor = useRef<string | null>(null)

  const [storeIds, setStoreIds] = useState<number[]>([])
  const [algorithmMode, setAlgorithmMode] = useState<BalancingAlgorithmMode>('APP_LEGACY')
  const [balancingMethod, setBalancingMethod] = useState<'OVER_UNDER_MODELS' | 'WITHOUT_MODELS' | 'WITHOUT_CONSIDERING_MODELS'>(
    'WITHOUT_CONSIDERING_MODELS',
  )
  const [performanceMetric, setPerformanceMetric] = useState<'ROI' | 'TURNS' | 'SELL_THRU'>('ROI')
  const [salesPeriod, setSalesPeriod] = useState<'MONTH' | 'SEASON' | 'YEAR'>('YEAR')
  const [sortOrder, setSortOrder] = useState<'SKU' | 'VENDOR' | 'CATEGORY'>('SKU')
  const [tieBreakKind, setTieBreakKind] = useState<'ABSOLUTE' | 'PERCENT'>('PERCENT')
  const [tieBreakValue, setTieBreakValue] = useState<number>(25)
  const [transferDoublesToLowerPriority, setTransferDoublesToLowerPriority] = useState(false)
  const [stripStoresBelowSizeCount, setStripStoresBelowSizeCount] = useState<number | null>(null)
  const [vendorCodes, setVendorCodes] = useState('')
  const [seasons, setSeasons] = useState('')
  const [styleColors, setStyleColors] = useState('')
  const [groupCodes, setGroupCodes] = useState('')
  const [keywords, setKeywords] = useState('')
  const [skuCodes, setSkuCodes] = useState('')
  const [ricsStoreSelection, setRicsStoreSelection] = useState('')
  const [ricsCategorySelection, setRicsCategorySelection] = useState('')
  const [ricsSeasonSelection, setRicsSeasonSelection] = useState('')
  const [ricsKeywordExclusions, setRicsKeywordExclusions] = useState('')
  const [categoryMin, setCategoryMin] = useState<number | null>(null)
  const [categoryMax, setCategoryMax] = useState<number | null>(null)
  const [includeOriginalRetailOnly, setIncludeOriginalRetailOnly] = useState(false)
  const [includeMarkdownOnly, setIncludeMarkdownOnly] = useState(false)
  const [includePerksOnly, setIncludePerksOnly] = useState(false)
  const [preview, setPreview] = useState<BalancingTransferPreviewRecord | null>(null)

  const ricsMode = algorithmMode === 'RICS_MIMIC'
  const selectedRicsStoreIds = useMemo(
    () => (ricsMode ? parseRicsNumberSelection(ricsStoreSelection) : []),
    [ricsMode, ricsStoreSelection],
  )
  const effectiveStoreIds = useMemo(() => {
    if (ricsMode) {
      if (selectedRicsStoreIds.length > 0) return selectedRicsStoreIds
      if (storeIds.length > 0) return storeIds
    }
    return storeIds.length > 0 ? storeIds : stores.map((store) => store.storeId)
  }, [ricsMode, selectedRicsStoreIds, storeIds, stores])

  const summaryMetrics = preview?.summary ?? {
    transferCount: 0,
    skuCount: 0,
    storePairCount: 0,
    totalUnits: 0,
    exceptionCount: 0,
    negativeMtdSalesSkipCount: 0,
  }
  const storeLoadErrorMessage = storesError instanceof Error ? storesError.message : null
  const negativeMtdSalesRows = useMemo(
    () =>
      preview?.negativeMtdSalesSkips?.flatMap((skip) =>
        skip.negativeStores.map((store) => ({
          key: `${skip.skuId}-${store.storeId}`,
          skuCode: skip.skuCode,
          description: skip.description,
          vendorCode: skip.vendorCode,
          categoryNumber: skip.categoryNumber,
          storeId: store.storeId,
          storeLabel: store.storeLabel,
          totalMtdSales: store.totalMtdSales,
          onHandTotal: store.onHandTotal,
          modelTotal: store.modelTotal,
          negativeCells: store.negativeCells,
        })),
      ) ?? [],
    [preview],
  )

  const applyPayload = useCallback((payload: CreateBalancingTransferRunPayload) => {
    const normalized = normalizeBalancingPayload(payload)
    const criteria = normalized.criteria ?? {}

    setAlgorithmMode(normalized.algorithmMode ?? 'APP_LEGACY')
    setBalancingMethod(normalized.balancingMethod)
    setPerformanceMetric(normalized.performanceMetric)
    setSalesPeriod(normalized.salesPeriod)
    setSortOrder(normalized.sortOrder ?? 'SKU')
    setTieBreakKind(normalized.tieBreakKind)
    setTieBreakValue(normalized.tieBreakValue)
    setTransferDoublesToLowerPriority(Boolean(normalized.transferDoublesToLowerPriority))
    setStripStoresBelowSizeCount(normalized.stripStoresBelowSizeCount ?? null)
    setStoreIds(Array.isArray(criteria.storeIds) ? criteria.storeIds : [])
    setVendorCodes(Array.isArray(criteria.vendorCodes) ? criteria.vendorCodes.join(',') : '')
    setSeasons(Array.isArray(criteria.seasons) ? criteria.seasons.join(',') : '')
    setStyleColors(Array.isArray(criteria.styleColors) ? criteria.styleColors.join(',') : '')
    setGroupCodes(Array.isArray(criteria.groupCodes) ? criteria.groupCodes.join(',') : '')
    setKeywords(Array.isArray(criteria.keywords) ? criteria.keywords.join(',') : '')
    setSkuCodes(Array.isArray(criteria.skuCodes) ? criteria.skuCodes.join(',') : '')
    setRicsStoreSelection(typeof criteria.ricsStoreSelection === 'string' ? criteria.ricsStoreSelection : '')
    setRicsCategorySelection(typeof criteria.ricsCategorySelection === 'string' ? criteria.ricsCategorySelection : '')
    setRicsSeasonSelection(typeof criteria.ricsSeasonSelection === 'string' ? criteria.ricsSeasonSelection : '')
    setRicsKeywordExclusions(typeof criteria.ricsKeywordExclusions === 'string' ? criteria.ricsKeywordExclusions : '')
    setCategoryMin(typeof criteria.categoryMin === 'number' ? criteria.categoryMin : null)
    setCategoryMax(typeof criteria.categoryMax === 'number' ? criteria.categoryMax : null)
    setIncludeOriginalRetailOnly(Boolean(criteria.includeOriginalRetailOnly))
    setIncludeMarkdownOnly(Boolean(criteria.includeMarkdownOnly))
    setIncludePerksOnly(Boolean(criteria.includePerksOnly))
  }, [])

  const buildPayload = useCallback((): CreateBalancingTransferRunPayload => {
    const isRicsMode = algorithmMode === 'RICS_MIMIC'

    return {
      algorithmMode,
      balancingMethod: isRicsMode ? 'OVER_UNDER_MODELS' : balancingMethod,
      performanceMetric: isRicsMode ? 'TURNS' : performanceMetric,
      salesPeriod: isRicsMode ? 'MONTH' : salesPeriod,
      sortOrder,
      tieBreakKind: isRicsMode ? 'ABSOLUTE' : tieBreakKind,
      tieBreakValue: isRicsMode ? 0 : tieBreakValue,
      transferDoublesToLowerPriority: isRicsMode ? false : transferDoublesToLowerPriority,
      stripStoresBelowSizeCount: isRicsMode ? null : stripStoresBelowSizeCount,
      criteria: {
        storeIds: storeIds.length > 0 ? storeIds : undefined,
        vendorCodes: splitCodes(vendorCodes),
        seasons: splitCodes(seasons),
        styleColors: splitCodes(styleColors),
        groupCodes: splitCodes(groupCodes),
        keywords: splitCodes(keywords),
        skuCodes: splitCodes(skuCodes),
        categoryMin,
        categoryMax,
        ricsStoreSelection: isRicsMode ? ricsStoreSelection.trim() || null : null,
        ricsCategorySelection: isRicsMode ? ricsCategorySelection.trim() || null : null,
        ricsSeasonSelection: isRicsMode ? ricsSeasonSelection.trim() || null : null,
        ricsKeywordExclusions: isRicsMode ? ricsKeywordExclusions.trim() || null : null,
        includeOriginalRetailOnly,
        includeMarkdownOnly,
        includePerksOnly,
      },
    }
  }, [
    algorithmMode,
    balancingMethod,
    categoryMax,
    categoryMin,
    groupCodes,
    includeMarkdownOnly,
    includeOriginalRetailOnly,
    includePerksOnly,
    keywords,
    performanceMetric,
    ricsCategorySelection,
    ricsKeywordExclusions,
    ricsSeasonSelection,
    ricsStoreSelection,
    salesPeriod,
    seasons,
    skuCodes,
    sortOrder,
    storeIds,
    stripStoresBelowSizeCount,
    styleColors,
    tieBreakKind,
    tieBreakValue,
    transferDoublesToLowerPriority,
    vendorCodes,
  ])

  async function runPreview(payload: CreateBalancingTransferRunPayload) {
    if (payload.algorithmMode !== 'RICS_MIMIC' && effectiveStoreIds.length < 2) {
      message.error('Select at least two stores')
      return
    }
    if (payload.criteria?.includeOriginalRetailOnly && payload.criteria?.includeMarkdownOnly) {
      message.error('Use either Original Retail Only or Markdown Only, not both')
      return
    }

    try {
      const result = await createRun.mutateAsync(payload)
      setPreview(result)
      message.success(`Balancing preview ready with ${result.summary.transferCount} transfer lines`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to compute balancing transfers')
    }
  }

  async function handlePreview() {
    await runPreview(buildPayload())
  }

  function handleAlgorithmModeChange(nextMode: BalancingAlgorithmMode) {
    setAlgorithmMode(nextMode)
    if (nextMode === 'RICS_MIMIC') {
      setBalancingMethod('OVER_UNDER_MODELS')
      setPerformanceMetric('TURNS')
      setSalesPeriod('MONTH')
      setTieBreakKind('ABSOLUTE')
      setTieBreakValue(0)
      setTransferDoublesToLowerPriority(false)
      setStripStoresBelowSizeCount(null)
    }
  }

  function applyPreset(preset: (typeof RICS_PRESETS)[number]) {
    applyPayload(preset.payload)
    setPreview(null)
    message.success(`${preset.title} preset loaded`)
  }

  async function savePresetAsTemplate(preset: (typeof RICS_PRESETS)[number]) {
    const existing = balancingTemplates?.templates.find(
      (template) => template.reportType === BALANCING_REPORT_TYPE && template.title === preset.title,
    )
    try {
      if (existing) {
        await updateTemplate.mutateAsync({
          id: existing.id,
          patch: {
            paramsJson: preset.payload as unknown as Record<string, unknown>,
            visibility: 'shared',
          },
        })
      } else {
        await createTemplate.mutateAsync({
          reportType: BALANCING_REPORT_TYPE,
          title: preset.title,
          paramsJson: preset.payload as unknown as Record<string, unknown>,
          visibility: 'shared',
        })
      }
      message.success(`${preset.title} shared template saved`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : `Failed to save ${preset.title}`)
    }
  }

  async function saveAllPresetsAsTemplates() {
    for (const preset of RICS_PRESETS) {
      await savePresetAsTemplate(preset)
    }
  }

  async function handleCommit() {
    if (!preview) return
    try {
      const result = await commitRun.mutateAsync(preview.id)
      setPreview((current) =>
        current
          ? {
              ...current,
              status: 'COMMITTED',
              committedAt: result.committedAt,
              generatedTransferIds: result.generatedTransferIds,
            }
          : current,
      )
      message.success(`Committed ${result.totalTransfers} transfer document(s)`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to commit balancing transfers')
    }
  }

  useEffect(() => {
    if (!templateId || !templateData) return
    if (hydratedFor.current === templateId) return
    const template = templateData.template
    if (template.reportType !== BALANCING_REPORT_TYPE) return

    hydratedFor.current = templateId
    const payload = normalizeBalancingPayload(
      template.paramsJson as Partial<CreateBalancingTransferRunPayload>,
      'RICS_MIMIC',
    )
    applyPayload(payload)
    touchTemplate.mutate(templateId)
    void runPreview(payload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templateData])

  return (
    <App>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <StockMaintenanceHero
          eyebrow="Transfers"
          title="Balancing Transfers"
          subtitle="Run the current app legacy algorithm or the RICS mimic replay path. Preview shows the exact cells that move, the store-priority comparison behind each line, and any negative M-T-D sales skips that need manual review."
          ricsReference="RICS Ch. 4 p. 77"
          metrics={[
            { label: 'Stores in scope', value: effectiveStoreIds.length },
            { label: 'Engine', value: algorithmMode === 'RICS_MIMIC' ? 'RICS MIMIC' : 'APP LEGACY' },
            { label: 'Transfer lines', value: summaryMetrics.transferCount },
            { label: 'Units proposed', value: summaryMetrics.totalUnits },
          ]}
          actions={
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Text style={{ color: 'rgba(248, 250, 252, 0.82)', fontWeight: 600 }}>
                Operator actions
              </Typography.Text>
              <Space wrap>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/inventory/adjustments')}>
                  Back to workspace
                </Button>
                <Button icon={<BranchesOutlined />} onClick={handlePreview} loading={createRun.isPending}>
                  Recompute Preview
                </Button>
              </Space>
            </Space>
          }
          footer={
            <Typography.Text style={{ color: 'rgba(248, 250, 252, 0.82)' }}>
              Both engines stay app-owned: on hand, models, sales cells, preview history, and committed transfer documents all live in Postgres.
            </Typography.Text>
          }
        />

        {preview?.status === 'COMMITTED' ? (
          <Alert
            type="success"
            showIcon
            message="Balancing transfers committed"
            description={`This run created ${preview.generatedTransferIds.length} transfer document(s).`}
          />
        ) : null}

        {storeLoadErrorMessage ? (
          <Alert
            type="error"
            showIcon
            message="Store list unavailable"
            description={storeLoadErrorMessage}
          />
        ) : !storesLoading && stores.length === 0 ? (
          <Alert
            type="warning"
            showIcon
            message="No stores available for transfer setup"
            description="The transfer store list is empty. Verify that Store Master is loaded into app.store_master and refresh the page."
          />
        ) : null}

        <Row gutter={[16, 16]} align="top">
          <Col xs={24} xl={8}>
            <div style={{ position: 'sticky', top: 16 }}>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Card
                  bordered={false}
                  style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
                  title="Run setup"
                >
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Engine
                      </Typography.Text>
                      <Radio.Group
                        value={algorithmMode}
                        onChange={(event) => handleAlgorithmModeChange(event.target.value)}
                        optionType="button"
                        buttonStyle="solid"
                        style={{ width: '100%', marginTop: 6 }}
                      >
                        <Radio.Button value="APP_LEGACY">App legacy</Radio.Button>
                        <Radio.Button value="RICS_MIMIC">RICS mimic</Radio.Button>
                      </Radio.Group>
                    </div>

                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Stores
                      </Typography.Text>
                      <Select
                        mode="multiple"
                        showSearch
                        optionFilterProp="label"
                        loading={storesLoading}
                        disabled={storesLoading || stores.length === 0}
                        data-testid="balancing-stores-select"
                        placeholder={ricsMode ? 'Select stores or use RICS store expression' : 'Blank = all transfer-capable stores'}
                        value={storeIds}
                        onChange={setStoreIds}
                        style={{ width: '100%', marginTop: 6 }}
                        options={stores.map((store) => ({
                          value: store.storeId,
                          label: store.storeLabel,
                        }))}
                      />
                    </div>

                    {ricsMode ? (
                      <Space direction="vertical" size={10} style={{ width: '100%' }}>
                        <Space.Compact style={{ width: '100%' }}>
                          <Button tabIndex={-1}>RICS stores</Button>
                          <Input
                            aria-label="RICS stores"
                            allowClear
                            placeholder="2,5-24,28-30,35-43,99"
                            value={ricsStoreSelection}
                            onChange={(event) => setRicsStoreSelection(event.target.value)}
                          />
                        </Space.Compact>
                        <Space.Compact style={{ width: '100%' }}>
                          <Button tabIndex={-1}>RICS categories</Button>
                          <Input
                            aria-label="RICS categories"
                            allowClear
                            placeholder="500-555"
                            value={ricsCategorySelection}
                            onChange={(event) => setRicsCategorySelection(event.target.value)}
                          />
                        </Space.Compact>
                        <Space.Compact style={{ width: '100%' }}>
                          <Button tabIndex={-1}>RICS seasons</Button>
                          <Input
                            aria-label="RICS seasons"
                            allowClear
                            placeholder="Q-Z,1-9,A"
                            value={ricsSeasonSelection}
                            onChange={(event) => setRicsSeasonSelection(event.target.value)}
                          />
                        </Space.Compact>
                        <Space.Compact style={{ width: '100%' }}>
                          <Button tabIndex={-1}>RICS excludes</Button>
                          <Input
                            aria-label="RICS keyword exclusions"
                            allowClear
                            placeholder="<>DST,<>VER26*"
                            value={ricsKeywordExclusions}
                            onChange={(event) => setRicsKeywordExclusions(event.target.value)}
                          />
                        </Space.Compact>
                      </Space>
                    ) : null}

                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        RICS presets
                      </Typography.Text>
                      <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 6 }}>
                        {RICS_PRESETS.map((preset) => (
                          <Space key={preset.key} wrap>
                            <Button onClick={() => applyPreset(preset)}>Apply {preset.title}</Button>
                            <Button
                              icon={<SaveOutlined />}
                              onClick={() => savePresetAsTemplate(preset)}
                              loading={createTemplate.isPending || updateTemplate.isPending}
                            >
                              Save shared template
                            </Button>
                          </Space>
                        ))}
                        <Button
                          icon={<SaveOutlined />}
                          onClick={saveAllPresetsAsTemplates}
                          loading={createTemplate.isPending || updateTemplate.isPending}
                        >
                          Save both shared templates
                        </Button>
                      </Space>
                    </div>

                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Balancing method
                      </Typography.Text>
                      <Radio.Group
                        value={balancingMethod}
                        onChange={(event) => setBalancingMethod(event.target.value)}
                        disabled={ricsMode}
                        style={{ width: '100%', marginTop: 6 }}
                      >
                        <Space direction="vertical">
                          <Radio value="OVER_UNDER_MODELS">Over / Under Models</Radio>
                          <Radio value="WITHOUT_MODELS">Without Models</Radio>
                          <Radio value="WITHOUT_CONSIDERING_MODELS">Ignore Models</Radio>
                        </Space>
                      </Radio.Group>
                    </div>

                    <Row gutter={12}>
                      <Col span={8}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Metric
                        </Typography.Text>
                        <Select
                          value={performanceMetric}
                          onChange={setPerformanceMetric}
                          disabled={ricsMode}
                          style={{ width: '100%', marginTop: 6 }}
                          options={[
                            { value: 'ROI', label: 'ROI' },
                            { value: 'TURNS', label: 'Turns' },
                            { value: 'SELL_THRU', label: 'Sell-Thru' },
                          ]}
                        />
                      </Col>
                      <Col span={8}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Period
                        </Typography.Text>
                        <Select
                          value={salesPeriod}
                          onChange={setSalesPeriod}
                          disabled={ricsMode}
                          style={{ width: '100%', marginTop: 6 }}
                          options={[
                            { value: 'MONTH', label: 'Month' },
                            { value: 'SEASON', label: 'Season' },
                            { value: 'YEAR', label: 'Year' },
                          ]}
                        />
                      </Col>
                      <Col span={8}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Sort by
                        </Typography.Text>
                        <Select
                          value={sortOrder}
                          onChange={setSortOrder}
                          style={{ width: '100%', marginTop: 6 }}
                          options={[
                            { value: 'SKU', label: 'SKU' },
                            { value: 'VENDOR', label: 'Vendor' },
                            { value: 'CATEGORY', label: 'Category' },
                          ]}
                        />
                      </Col>
                    </Row>

                    <Row gutter={12}>
                      <Col span={12}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Tie-break kind
                        </Typography.Text>
                        <Select
                          value={tieBreakKind}
                          onChange={setTieBreakKind}
                          disabled={ricsMode}
                          style={{ width: '100%', marginTop: 6 }}
                          options={[
                            { value: 'ABSOLUTE', label: 'Absolute' },
                            { value: 'PERCENT', label: 'Percent' },
                          ]}
                        />
                      </Col>
                      <Col span={12}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Tie-break value
                        </Typography.Text>
                        <InputNumber
                          min={0}
                          step={tieBreakKind === 'PERCENT' ? 5 : 0.1}
                          value={tieBreakValue}
                          onChange={(value) => setTieBreakValue(value ?? 0)}
                          disabled={ricsMode}
                          style={{ width: '100%', marginTop: 6 }}
                        />
                      </Col>
                    </Row>

                    <Checkbox
                      checked={transferDoublesToLowerPriority}
                      onChange={(event) => setTransferDoublesToLowerPriority(event.target.checked)}
                      disabled={ricsMode}
                    >
                      Transfer doubles to lower-priority stores
                    </Checkbox>

                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Strip stores below size count
                      </Typography.Text>
                      <InputNumber
                        min={1}
                        value={stripStoresBelowSizeCount}
                        onChange={(value) => setStripStoresBelowSizeCount(value ?? null)}
                        placeholder="optional"
                        disabled={ricsMode}
                        style={{ width: '100%', marginTop: 6 }}
                      />
                    </div>

                    <Row gutter={12}>
                      <Col span={12}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Category min
                        </Typography.Text>
                        <InputNumber
                          aria-label="Category min"
                          min={0}
                          value={categoryMin}
                          onChange={(value) => setCategoryMin(value ?? null)}
                          style={{ width: '100%', marginTop: 6 }}
                        />
                      </Col>
                      <Col span={12}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Category max
                        </Typography.Text>
                        <InputNumber
                          aria-label="Category max"
                          min={0}
                          value={categoryMax}
                          onChange={(value) => setCategoryMax(value ?? null)}
                          style={{ width: '100%', marginTop: 6 }}
                        />
                      </Col>
                    </Row>

                    <Space.Compact style={{ width: '100%' }}>
                      <Button disabled>Vendor</Button>
                      <Input
                        placeholder="comma-separated codes"
                        value={vendorCodes}
                        onChange={(event) => setVendorCodes(event.target.value)}
                      />
                    </Space.Compact>
                    <Space.Compact style={{ width: '100%' }}>
                      <Button disabled>Season</Button>
                      <Input
                        placeholder="comma-separated"
                        value={seasons}
                        onChange={(event) => setSeasons(event.target.value)}
                      />
                    </Space.Compact>
                    <Space.Compact style={{ width: '100%' }}>
                      <Button disabled>Style</Button>
                      <Input
                        placeholder="comma-separated"
                        value={styleColors}
                        onChange={(event) => setStyleColors(event.target.value)}
                      />
                    </Space.Compact>
                    <Space.Compact style={{ width: '100%' }}>
                      <Button disabled>Group</Button>
                      <Input
                        placeholder="comma-separated"
                        value={groupCodes}
                        onChange={(event) => setGroupCodes(event.target.value)}
                      />
                    </Space.Compact>
                    <Space.Compact style={{ width: '100%' }}>
                      <Button disabled>Keyword</Button>
                      <Input
                        placeholder="comma-separated"
                        value={keywords}
                        onChange={(event) => setKeywords(event.target.value)}
                      />
                    </Space.Compact>
                    <Space.Compact style={{ width: '100%' }}>
                      <Button disabled>SKU</Button>
                      <Input
                        placeholder="comma-separated codes"
                        value={skuCodes}
                        onChange={(event) => setSkuCodes(event.target.value)}
                      />
                    </Space.Compact>

                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                      <Checkbox
                        checked={includeOriginalRetailOnly}
                        onChange={(event) => {
                          setIncludeOriginalRetailOnly(event.target.checked)
                          if (event.target.checked) setIncludeMarkdownOnly(false)
                        }}
                      >
                        Original retail only
                      </Checkbox>
                      <Checkbox
                        checked={includeMarkdownOnly}
                        onChange={(event) => {
                          setIncludeMarkdownOnly(event.target.checked)
                          if (event.target.checked) setIncludeOriginalRetailOnly(false)
                        }}
                      >
                        Markdown only
                      </Checkbox>
                      <Checkbox
                        checked={includePerksOnly}
                        onChange={(event) => setIncludePerksOnly(event.target.checked)}
                      >
                        Perks only
                      </Checkbox>
                    </Space>

                    <Space wrap>
                      <Button type="primary" icon={<BranchesOutlined />} onClick={handlePreview} loading={createRun.isPending}>
                        Preview Transfers
                      </Button>
                      <Button
                        icon={<CheckOutlined />}
                        onClick={handleCommit}
                        loading={commitRun.isPending}
                        disabled={!preview || preview.lines.length === 0 || preview.status === 'COMMITTED'}
                      >
                        Commit Transfers
                      </Button>
                    </Space>
                  </Space>
                </Card>

                <Card
                  bordered={false}
                  style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
                  title="RICS behavior"
                >
                  <Space direction="vertical" size={10}>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      Balancing Transfers use store performance to move units from lower-priority stores to higher-priority stores, with separate rules for model-driven and no-model scenarios.
                    </Typography.Paragraph>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      Negative on hand is surfaced as an exception. RICS mimic also lists SKUs skipped because selected stores have negative M-T-D sales.
                    </Typography.Paragraph>
                  </Space>
                </Card>
              </Space>
            </div>
          </Col>

          <Col xs={24} xl={16}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Row gutter={[16, 16]}>
                <Col xs={12} md={6} xl={5}>
                  <Card bordered={false} style={{ borderRadius: 18 }}>
                    <Statistic title="Transfer lines" value={summaryMetrics.transferCount} />
                  </Card>
                </Col>
                <Col xs={12} md={6} xl={5}>
                  <Card bordered={false} style={{ borderRadius: 18 }}>
                    <Statistic title="SKUs" value={summaryMetrics.skuCount} />
                  </Card>
                </Col>
                <Col xs={12} md={6} xl={5}>
                  <Card bordered={false} style={{ borderRadius: 18 }}>
                    <Statistic title="Store pairs" value={summaryMetrics.storePairCount} />
                  </Card>
                </Col>
                <Col xs={12} md={6} xl={5}>
                  <Card bordered={false} style={{ borderRadius: 18 }}>
                    <Statistic title="Exceptions" value={summaryMetrics.exceptionCount} />
                  </Card>
                </Col>
                <Col xs={12} md={6} xl={4}>
                  <Card bordered={false} style={{ borderRadius: 18 }}>
                    <Statistic title="MTD skips" value={summaryMetrics.negativeMtdSalesSkipCount ?? 0} />
                  </Card>
                </Col>
              </Row>

              {negativeMtdSalesRows.length > 0 ? (
                <Card
                  bordered={false}
                  style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
                  title="Negative M-T-D sales skips"
                >
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Alert
                      type="warning"
                      showIcon
                      message="These SKUs were excluded from RICS mimic balancing because at least one selected store has negative total month-to-date sales."
                    />
                    <Table
                      size="small"
                      rowKey="key"
                      dataSource={negativeMtdSalesRows}
                      pagination={{ pageSize: 10 }}
                      scroll={{ x: 1100 }}
                      columns={[
                        { title: 'SKU', dataIndex: 'skuCode', width: 130, fixed: 'left' },
                        { title: 'Description', dataIndex: 'description', width: 220, ellipsis: true },
                        { title: 'Store', dataIndex: 'storeLabel', width: 180 },
                        {
                          title: 'MTD sales',
                          dataIndex: 'totalMtdSales',
                          width: 100,
                          align: 'right',
                          render: (value: number) => <Tag color="red">{value}</Tag>,
                        },
                        { title: 'On hand', dataIndex: 'onHandTotal', width: 90, align: 'right' },
                        { title: 'Model', dataIndex: 'modelTotal', width: 90, align: 'right' },
                        {
                          title: 'Negative cells',
                          dataIndex: 'negativeCells',
                          width: 280,
                          render: (cells: Array<{ rowLabel: string; columnLabel: string; mtdSales: number }>) => (
                            <Space wrap>
                              {cells.map((cell) => (
                                <Tag key={`${cell.rowLabel}-${cell.columnLabel}`}>
                                  {[cell.rowLabel, cell.columnLabel].filter(Boolean).join('-') || '(qty)'}: {cell.mtdSales}
                                </Tag>
                              ))}
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </Space>
                </Card>
              ) : null}

              {preview?.exceptions.length ? (
                <Card
                  bordered={false}
                  style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
                  title="Exceptions"
                >
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    {preview.exceptions.map((exception, index) => (
                      <Alert
                        key={`${exception.code}-${index}`}
                        type={exception.severity === 'error' ? 'error' : 'warning'}
                        showIcon
                        message={exception.message}
                      />
                    ))}
                  </Space>
                </Card>
              ) : null}

              {!preview ? (
                <Card
                  bordered={false}
                  style={{ borderRadius: 20, minHeight: 260, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
                >
                  <Empty description="Build a preview to inspect the balancing journal before posting." />
                </Card>
              ) : preview.lines.length === 0 ? (
                <Card bordered={false} style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}>
                  <Empty description="No balancing opportunities matched the selected rules and criteria." />
                </Card>
              ) : (
                <Card
                  bordered={false}
                  style={{ borderRadius: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)' }}
                  title="Preview journal"
                  extra={
                    <Tag color={preview.status === 'COMMITTED' ? 'green' : 'blue'}>
                      {preview.status === 'COMMITTED' ? 'Committed' : 'Previewed'}
                    </Tag>
                  }
                >
                  <Table<BalancingTransferPreviewLine>
                    size="small"
                    rowKey={(row) => `${row.skuId}-${row.fromStoreId}-${row.toStoreId}`}
                    dataSource={preview.lines}
                    pagination={{ pageSize: 25, showSizeChanger: true }}
                    scroll={{ x: 1500 }}
                    columns={[
                      {
                        title: 'SKU',
                        dataIndex: 'skuCode',
                        width: 140,
                        fixed: 'left',
                      },
                      {
                        title: 'Description',
                        dataIndex: 'description',
                        width: 220,
                        ellipsis: true,
                      },
                      {
                        title: 'From',
                        dataIndex: 'fromStoreLabel',
                        width: 120,
                      },
                      {
                        title: 'To',
                        dataIndex: 'toStoreLabel',
                        width: 120,
                      },
                      {
                        title: 'Qty',
                        dataIndex: 'suggestedQuantity',
                        width: 80,
                        align: 'right',
                        render: (value: number) => <strong>{value}</strong>,
                      },
                      {
                        title: 'From metric',
                        width: 120,
                        render: (_, row) => formatMetric(row.fromMetric, preview.performanceMetric),
                      },
                      {
                        title: 'To metric',
                        width: 120,
                        render: (_, row) => formatMetric(row.toMetric, preview.performanceMetric),
                      },
                      {
                        title: 'From OH / Model',
                        width: 130,
                        render: (_, row) => `${row.fromMetric.endingOnHand} / ${row.fromModelQty}`,
                      },
                      {
                        title: 'To OH / Model',
                        width: 130,
                        render: (_, row) => `${row.toMetric.endingOnHand} / ${row.toModelQty}`,
                      },
                      {
                        title: 'Reason',
                        dataIndex: 'reason',
                        width: 320,
                        ellipsis: true,
                      },
                      {
                        title: 'Cells',
                        key: 'cells',
                        width: 320,
                        render: (_, row) => (
                          <Space wrap>
                            {row.cells.map((cell) => (
                              <Tag key={`${cell.rowLabel}-${cell.columnLabel}`}>
                                {[cell.rowLabel, cell.columnLabel].filter(Boolean).join('-') || '(qty)'}: {cell.suggestedQuantity}
                              </Tag>
                            ))}
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              )}
            </Space>
          </Col>
        </Row>
      </Space>
    </App>
  )
}
