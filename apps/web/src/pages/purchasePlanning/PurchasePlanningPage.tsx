import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  InputNumber,
  Row,
  Segmented,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { useSalesDimensions } from '../../hooks/useReports'
import CriteriaInput from '../salesReporting/CriteriaInput'
import {
  postPurchasePlan,
  type PurchasePlanDimension,
  type PurchasePlanEohMethod,
  type PurchasePlanForecastMethod,
  type PurchasePlanRequest,
  type PurchasePlanResponse,
  type PurchasePlanRow,
  type PurchasePlanTotals,
} from '../../services/purchasePlanningApi'

const { Title, Paragraph, Text } = Typography

const DIMENSION_OPTIONS: Array<{ value: PurchasePlanDimension; label: string }> = [
  { value: 'department', label: 'Departamento' },
  { value: 'category', label: 'Categoría' },
  { value: 'vendor', label: 'Proveedor' },
]

const FORECAST_OPTIONS: Array<{ value: PurchasePlanForecastMethod; label: string }> = [
  { value: 'sameMonthLastYear', label: 'Mes año pasado' },
  { value: 'trailingAverage', label: 'Promedio móvil' },
  { value: 'yoyGrowth', label: 'Crecimiento YoY %' },
  { value: 'blendedMultiYear', label: 'Promedio 2–3 años' },
]

const EOH_OPTIONS: Array<{ value: PurchasePlanEohMethod; label: string }> = [
  { value: 'forward', label: 'Cobertura forward' },
  { value: 'seasonal', label: 'Multiplicador estacional' },
]

const integerFmt = new Intl.NumberFormat('en-US')

function formatMonthShort(yearMonth: string): string {
  return dayjs(`${yearMonth}-01`).format('MMM-YY')
}

interface PivotRow {
  key: string
  dimKey: string
  dimLabel: string
  currentOnHand: number
  hasHistory: boolean
  buyByMonth: Record<string, number>
  totalBuy: number
}

function buildPivot(
  totals: PurchasePlanTotals[],
  rows: PurchasePlanRow[],
  horizon: string[],
): PivotRow[] {
  const byDim = new Map<string, PivotRow>()
  for (const t of totals) {
    byDim.set(t.dimKey, {
      key: t.dimKey,
      dimKey: t.dimKey,
      dimLabel: t.dimLabel,
      currentOnHand: t.currentOnHand,
      hasHistory: t.hasHistory,
      buyByMonth: Object.fromEntries(horizon.map((ym) => [ym, 0])),
      totalBuy: t.totalBuy,
    })
  }
  for (const r of rows) {
    const pivot = byDim.get(r.dimKey)
    if (pivot) pivot.buyByMonth[r.yearMonth] = r.buy
  }
  return [...byDim.values()]
}

function buildDetailColumns(): ColumnsType<PurchasePlanRow> {
  return [
    { title: 'Mes', dataIndex: 'yearMonth', key: 'yearMonth', render: (v: string) => formatMonthShort(v) },
    {
      title: 'BOH', dataIndex: 'boh', key: 'boh', align: 'right',
      render: (v: number) => integerFmt.format(v),
    },
    {
      title: 'Venta Proy', dataIndex: 'projSales', key: 'projSales', align: 'right',
      render: (v: number) => integerFmt.format(v),
    },
    {
      title: 'EOH Target', dataIndex: 'eohTarget', key: 'eohTarget', align: 'right',
      render: (v: number) => integerFmt.format(v),
    },
    {
      title: 'Compras', dataIndex: 'buy', key: 'buy', align: 'right',
      render: (v: number) => <Text strong style={{ color: '#389e0d' }}>{integerFmt.format(v)}</Text>,
    },
    {
      title: 'EOH Real', dataIndex: 'eohActual', key: 'eohActual', align: 'right',
      render: (v: number) => integerFmt.format(v),
    },
  ]
}

export default function PurchasePlanningPage() {
  // ── Form state ──
  const [dimension, setDimension] = useState<PurchasePlanDimension>('vendor')
  const [selectedStores, setSelectedStores] = useState<number[]>([])
  const [forecastMethod, setForecastMethod] =
    useState<PurchasePlanForecastMethod>('sameMonthLastYear')
  const [trailingMonths, setTrailingMonths] = useState<number>(6)
  const [growthPct, setGrowthPct] = useState<number>(0)
  const [yearsToBlend, setYearsToBlend] = useState<2 | 3>(2)
  const [eohMethod, setEohMethod] = useState<PurchasePlanEohMethod>('forward')
  const [coverMonths, setCoverMonths] = useState<number>(6)
  const [asOfMonth, setAsOfMonth] = useState<Dayjs>(() => dayjs().startOf('month'))

  const [categoriesSelected, setCategoriesSelected] = useState<number[]>([])
  const [categoriesRaw, setCategoriesRaw] = useState('')
  const [vendorsRaw, setVendorsRaw] = useState('')
  const [departmentsRaw, setDepartmentsRaw] = useState('')

  // ── Committed query (null until Run is clicked) ──
  const [query, setQuery] = useState<PurchasePlanRequest | null>(null)

  const qc = useQueryClient()
  const { data: dims, isLoading: dimsLoading } = useSalesDimensions()

  const result = useQuery<PurchasePlanResponse>({
    queryKey: ['purchase-planning', query] as const,
    queryFn: ({ signal }) => postPurchasePlan(query!, signal),
    enabled: !!query,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  })

  const running = !!query && result.isFetching

  function onRun(): void {
    const combinedCategories = [
      ...categoriesSelected.map(String),
      ...(categoriesRaw.trim() ? [categoriesRaw.trim()] : []),
    ].join(',')
    setQuery({
      dimension,
      // Empty → all stores (server resolves via listSalesDimensions).
      storeNumbers: selectedStores.length > 0 ? selectedStores : undefined,
      forecast: {
        method: forecastMethod,
        trailingMonths: forecastMethod === 'trailingAverage' ? trailingMonths : undefined,
        growthPct: forecastMethod === 'yoyGrowth' ? growthPct : undefined,
        yearsToBlend: forecastMethod === 'blendedMultiYear' ? yearsToBlend : undefined,
      },
      eohMethod,
      coverMonths: eohMethod === 'forward' ? coverMonths : undefined,
      asOfYearMonth: asOfMonth.format('YYYY-MM'),
      filters: {
        categoriesRaw: combinedCategories || undefined,
        vendorsRaw: vendorsRaw.trim() || undefined,
        departmentsRaw: departmentsRaw.trim() || undefined,
      },
    })
  }

  // Cancel the in-flight query. TanStack Query aborts the fetch via
  // AbortSignal (wired through postPurchasePlan → fetch). We also reset the
  // committed query so the UI returns to the "not run yet" state — otherwise
  // clicking Run again with identical params would be a no-op (cache hit).
  function onStop(): void {
    qc.cancelQueries({ queryKey: ['purchase-planning', query] })
    setQuery(null)
  }

  const pivotRows = useMemo(() => {
    if (!result.data) return []
    return buildPivot(result.data.totals, result.data.rows, result.data.meta.horizonYearMonths)
  }, [result.data])

  const columns = useMemo<ColumnsType<PivotRow>>(() => {
    const horizon = result.data?.meta.horizonYearMonths ?? []
    const dimLabel =
      dimension === 'department' ? 'Departamento' : dimension === 'category' ? 'Categoría' : 'Proveedor'
    const monthCols: ColumnsType<PivotRow> = horizon.map((ym) => ({
      title: formatMonthShort(ym),
      key: `m-${ym}`,
      align: 'right',
      width: 70,
      render: (_: unknown, row: PivotRow) => integerFmt.format(row.buyByMonth[ym] ?? 0),
    }))
    return [
      {
        title: dimLabel,
        dataIndex: 'dimLabel',
        key: 'dimLabel',
        fixed: 'left',
        width: 180,
        render: (label: string, row: PivotRow) =>
          row.hasHistory ? (
            <Text>{label}</Text>
          ) : (
            <Space size={4}>
              <Text>{label}</Text>
              <Tag color="gold">sin historial</Tag>
            </Space>
          ),
      },
      {
        title: 'OH Actual',
        dataIndex: 'currentOnHand',
        key: 'currentOnHand',
        align: 'right',
        width: 90,
        render: (v: number) => integerFmt.format(v),
      },
      ...monthCols,
      {
        title: 'Total Compras',
        dataIndex: 'totalBuy',
        key: 'totalBuy',
        align: 'right',
        fixed: 'right',
        width: 110,
        defaultSortOrder: 'descend',
        sorter: (a, b) => a.totalBuy - b.totalBuy,
        render: (v: number) => (
          <Text strong style={{ color: '#389e0d' }}>{integerFmt.format(v)}</Text>
        ),
      },
    ]
  }, [dimension, result.data])

  // ── Expanded-row detail ──
  const detailColumns = useMemo(() => buildDetailColumns(), [])

  return (
    <div>
      <Title level={2} style={{ marginBottom: 0 }}>Plan de Compras</Title>
      <Paragraph type="secondary" style={{ marginBottom: 4 }}>
        Plan mensual de compras por departamento, categoría o proveedor. Proyección a 12 meses
        calculada a partir de ventas históricas y el inventario actual. Lectura en vivo de RICS.
      </Paragraph>
      <Paragraph type="secondary" style={{ marginTop: 0, fontSize: 12 }}>
        Cantidades en unidades. Montos en <strong>Lempira (HNL)</strong> cuando se muestran.
      </Paragraph>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Card size="small" title="Dimensión" style={{ marginBottom: 12 }}>
              <Segmented<PurchasePlanDimension>
                value={dimension}
                onChange={(v) => setDimension(v as PurchasePlanDimension)}
                options={DIMENSION_OPTIONS}
                block
              />
            </Card>
            <Card size="small" title="Método de proyección" style={{ marginBottom: 12 }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Segmented<PurchasePlanForecastMethod>
                  value={forecastMethod}
                  onChange={(v) => setForecastMethod(v as PurchasePlanForecastMethod)}
                  options={FORECAST_OPTIONS}
                  block
                />
                {forecastMethod === 'trailingAverage' && (
                  <Space>
                    <Text>Meses a promediar:</Text>
                    <InputNumber
                      min={1}
                      max={24}
                      value={trailingMonths}
                      onChange={(v) => setTrailingMonths(Number(v) || 6)}
                    />
                  </Space>
                )}
                {forecastMethod === 'yoyGrowth' && (
                  <Space>
                    <Text>Crecimiento vs. año anterior:</Text>
                    <InputNumber
                      min={-99}
                      max={500}
                      value={growthPct}
                      onChange={(v) => setGrowthPct(Number(v) || 0)}
                      addonAfter="%"
                    />
                  </Space>
                )}
                {forecastMethod === 'blendedMultiYear' && (
                  <Space>
                    <Text>Años a promediar:</Text>
                    <Select<2 | 3>
                      value={yearsToBlend}
                      onChange={(v) => setYearsToBlend(v)}
                      options={[
                        { value: 2, label: '2 años' },
                        { value: 3, label: '3 años' },
                      ]}
                      style={{ width: 120 }}
                    />
                  </Space>
                )}
              </Space>
            </Card>
            <Card size="small" title="Método EOH">
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Segmented<PurchasePlanEohMethod>
                  value={eohMethod}
                  onChange={(v) => setEohMethod(v as PurchasePlanEohMethod)}
                  options={EOH_OPTIONS}
                  block
                />
                {eohMethod === 'forward' && (
                  <Space>
                    <Text>Cobertura (meses):</Text>
                    <InputNumber
                      min={1}
                      max={24}
                      value={coverMonths}
                      onChange={(v) => setCoverMonths(Number(v) || 6)}
                    />
                  </Space>
                )}
              </Space>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card size="small" title="Período" style={{ marginBottom: 12 }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                    Mes base (el plan empieza en el siguiente mes):
                  </Text>
                  <DatePicker
                    picker="month"
                    value={asOfMonth}
                    allowClear={false}
                    onChange={(v) => v && setAsOfMonth(v.startOf('month'))}
                    style={{ width: '100%' }}
                  />
                </div>
              </Space>
            </Card>
            <Card size="small" title="Tiendas" style={{ marginBottom: 12 }}>
              <Select<number[]>
                mode="multiple"
                allowClear
                loading={dimsLoading}
                value={selectedStores}
                onChange={setSelectedStores}
                placeholder="Todas las tiendas (dejar vacío para incluir todas)"
                optionFilterProp="label"
                style={{ width: '100%' }}
                options={(dims?.stores ?? []).map((s) => ({
                  value: s.number,
                  label: s.name ? `${s.number} — ${s.name}` : String(s.number),
                }))}
              />
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                {selectedStores.length === 0
                  ? `Se incluirán todas las tiendas (${dims?.stores?.length ?? 0}).`
                  : `${selectedStores.length} tienda${selectedStores.length === 1 ? '' : 's'} seleccionada${selectedStores.length === 1 ? '' : 's'}.`}
              </Text>
            </Card>

            <Card size="small" title="Filtros (opcional)">
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <CriteriaInput
                  label="Departamentos"
                  mode="numeric"
                  options={[]}
                  selected={[]}
                  onSelectedChange={() => {}}
                  rawText={departmentsRaw}
                  onRawTextChange={setDepartmentsRaw}
                  hideDropdown
                  helpText="Rangos/excluir: 1-10, <>5"
                />
                <CriteriaInput
                  label="Categorías"
                  mode="numeric"
                  loading={dimsLoading}
                  options={(dims?.categories ?? []).map((c) => ({
                    value: c.number,
                    label: c.desc ? `${c.number} — ${c.desc}` : String(c.number),
                  }))}
                  selected={categoriesSelected}
                  onSelectedChange={setCategoriesSelected}
                  rawText={categoriesRaw}
                  onRawTextChange={setCategoriesRaw}
                />
                <CriteriaInput
                  label="Proveedores"
                  mode="string"
                  options={[]}
                  selected={[]}
                  onSelectedChange={() => {}}
                  rawText={vendorsRaw}
                  onRawTextChange={setVendorsRaw}
                  hideDropdown
                  helpText="e.g. NIKE, <>ADIDAS"
                />
              </Space>
            </Card>
          </Col>
        </Row>

        <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
          <Space align="center">
            <Button
              type="primary"
              onClick={onRun}
              loading={running}
              disabled={running}
            >
              Calcular plan
            </Button>
            <Button onClick={onStop} disabled={!running} danger>
              Detener
            </Button>
            {running && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Calculando… puedes presionar Detener si fue un error.
              </Text>
            )}
            {!running && query && result.data?.meta && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Historia: {result.data.meta.historyFromYearMonth} a {result.data.meta.historyToYearMonth}.
                OH actualizado: {dayjs(result.data.meta.onHandAsOf).format('DD/MM HH:mm')}.
              </Text>
            )}
          </Space>
        </div>
      </Card>

      {result.error && (
        <Alert
          type="error"
          message="No se pudo calcular el plan"
          description={result.error instanceof Error ? result.error.message : String(result.error)}
          style={{ marginBottom: 16 }}
        />
      )}

      {!query ? (
        <Empty
          description="Configura los filtros y presiona Calcular plan."
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: 40 }}
        />
      ) : result.isFetching && !result.data ? (
        <Card>
          <Skeleton active paragraph={{ rows: 10 }} />
        </Card>
      ) : result.data ? (
        <Card>
          <Table<PivotRow>
            dataSource={pivotRows}
            columns={columns}
            rowKey="key"
            size="small"
            pagination={{ pageSize: 50, showSizeChanger: true }}
            scroll={{ x: 'max-content' }}
            sticky
            expandable={{
              expandedRowRender: (row) => {
                const detailRows = result.data!.rows.filter((r) => r.dimKey === row.dimKey)
                return (
                  <Table<PurchasePlanRow>
                    dataSource={detailRows}
                    columns={detailColumns}
                    rowKey={(r) => `${r.dimKey}-${r.yearMonth}`}
                    size="small"
                    pagination={false}
                  />
                )
              },
            }}
          />
        </Card>
      ) : null}
    </div>
  )
}
