import { useMemo, useState, type ReactNode } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useStoreChains } from '../../hooks/useStores'
import { useDepartments } from '../../hooks/useProductsTaxonomy'
import {
  archivePurchasePlanV3,
  createPurchasePlanV3,
  fetchPurchasePlanV3,
  fetchPurchasePlanV3Plans,
  generatePurchasePlanV3Report,
  type PurchasePlanEohMethod,
  type PurchasePlanForecastMethod,
  type PurchasePlanV3ListItem,
  type PurchasePlanV3Report,
  type PurchasePlanV3Request,
  type PurchasePlanV3SeasonRow,
  type PurchasePlanV3WarehouseDetail,
} from '../../services/purchasePlanningApi'

const { Title, Paragraph, Text } = Typography

const integerFmt = new Intl.NumberFormat('en-US')

const FORECAST_OPTIONS: Array<{ value: PurchasePlanForecastMethod; label: string }> = [
  { value: 'holtWinters', label: 'Holt-Winters' },
  { value: 'sameMonthLastYear', label: 'Same month last year' },
  { value: 'trailingAverage', label: 'Trailing average' },
  { value: 'yoyGrowth', label: 'YoY growth %' },
  { value: 'blendedMultiYear', label: 'Blended multi-year' },
]

const EOH_OPTIONS: Array<{ value: PurchasePlanEohMethod; label: string }> = [
  { value: 'forward', label: 'Forward cover' },
  { value: 'seasonal', label: 'Seasonal multiplier' },
]

interface V3Form {
  storeGroupCodes?: string[]
  departmentNumber: number
  year: number
  label?: string
  forecastMethod: PurchasePlanForecastMethod
  eohMethod: PurchasePlanEohMethod
  coverMonths: number
  discountNormalization: boolean
}

function formatInt(value: number): string {
  return integerFmt.format(Math.round(value ?? 0))
}

function renderUnits(value: { units: number }): ReactNode {
  return <Text>{formatInt(value.units)}</Text>
}

function detailReason(reason: PurchasePlanV3WarehouseDetail['reason']): string {
  if (reason === 'no_chain_tag') return 'No chain tag'
  if (reason === 'no_selected_chain_need') return 'No selected-chain need'
  return 'Credited'
}

function normalizeChainText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function isWarehouseChainOption(chain: { id: string; label: string }): boolean {
  const text = normalizeChainText(`${chain.id} ${chain.label}`)
  return text.includes('bodega') || text.includes('almacen') || text.includes('warehouse')
}

function buildRequest(values: V3Form, defaultStoreGroupCodes: string[]): PurchasePlanV3Request {
  return {
    storeGroupCodes: values.storeGroupCodes?.length ? values.storeGroupCodes : defaultStoreGroupCodes,
    departmentNumber: values.departmentNumber,
    year: values.year,
    label: values.label?.trim() || undefined,
    forecast: { method: values.forecastMethod },
    eohMethod: values.eohMethod,
    coverMonths: values.coverMonths,
    discountNormalization: values.discountNormalization,
    createdBy: 'buyer',
  }
}

export default function PurchasePlanningV3Page() {
  const [form] = Form.useForm<V3Form>()
  const [messageApi, contextHolder] = message.useMessage()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('report')
  const [report, setReport] = useState<PurchasePlanV3Report | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)

  const { data: chains = [], isLoading: chainsLoading } = useStoreChains()
  const { data: departments = [], isLoading: departmentsLoading } = useDepartments()

  const defaultStoreGroupCodes = useMemo(
    () => chains
      .filter((chain) => chain.active && chain.storeCount > 0 && !isWarehouseChainOption(chain))
      .map((chain) => chain.id),
    [chains],
  )

  const plans = useQuery({
    queryKey: ['purchase-planning-v3', 'plans'],
    queryFn: () => fetchPurchasePlanV3Plans({ status: 'draft' }),
    staleTime: 60_000,
  })

  const selectedPlan = useQuery({
    queryKey: ['purchase-planning-v3', 'plan', selectedPlanId],
    queryFn: () => fetchPurchasePlanV3(selectedPlanId!),
    enabled: !!selectedPlanId,
  })

  const generateMutation = useMutation({
    mutationFn: (values: V3Form) => generatePurchasePlanV3Report(buildRequest(values, defaultStoreGroupCodes)),
    onSuccess: (next) => {
      setReport(next)
      setSelectedPlanId(null)
      messageApi.success('V3 report generated')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not generate V3 report'),
  })

  const saveMutation = useMutation({
    mutationFn: (values: V3Form) => createPurchasePlanV3(buildRequest(values, defaultStoreGroupCodes)),
    onSuccess: async (next) => {
      setReport(next)
      setSelectedPlanId(next.plan?.id ?? null)
      await qc.invalidateQueries({ queryKey: ['purchase-planning-v3'] })
      messageApi.success('V3 plan saved')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not save V3 plan'),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archivePurchasePlanV3(id, 'buyer'),
    onSuccess: async () => {
      setSelectedPlanId(null)
      setReport(null)
      await qc.invalidateQueries({ queryKey: ['purchase-planning-v3'] })
      messageApi.success('V3 plan archived')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not archive V3 plan'),
  })

  const visibleReport = selectedPlan.data ?? report
  const rows = useMemo(
    () => visibleReport?.seasons.flatMap((season) => season.rows) ?? [],
    [visibleReport],
  )

  const rowColumns = useMemo<ColumnsType<PurchasePlanV3SeasonRow>>(() => [
    {
      title: 'Chain',
      dataIndex: 'storeGroupLabel',
      fixed: 'left',
      width: 185,
      render: (value: string, row) => (
        <Space size={6}>
          <Text strong>{value}</Text>
          <Tag>{row.seasonLabel}</Tag>
        </Space>
      ),
    },
    { title: 'Projected BOH', dataIndex: 'projectedBoh', align: 'right', width: 115, render: renderUnits },
    { title: 'Projected sales', dataIndex: 'projectedSales', align: 'right', width: 125, render: renderUnits },
    { title: 'Store inventory', dataIndex: 'chainOnHand', align: 'right', width: 125, render: renderUnits },
    {
      title: 'Open POs',
      align: 'right',
      width: 95,
      render: (_: unknown, row) => formatInt(row.currentOnOrder.units + row.futureOnOrder.units + row.nativeOpenPo.units),
    },
    { title: 'Warehouse credit', dataIndex: 'warehousePlanningCredit', align: 'right', width: 145, render: (value: { units: number }) => <Text type="success">{formatInt(value.units)}</Text> },
    { title: 'Total available', dataIndex: 'totalAvailableForPlan', align: 'right', width: 125, render: renderUnits },
    { title: 'Recommended buy', dataIndex: 'recommendedBuy', align: 'right', width: 135, render: (value: { units: number }) => <Text strong>{formatInt(value.units)}</Text> },
    { title: 'Projected EOH', dataIndex: 'projectedEoh', align: 'right', width: 115, render: renderUnits },
  ], [])

  const detailColumns = useMemo<ColumnsType<PurchasePlanV3WarehouseDetail>>(() => [
    { title: 'SKU', dataIndex: 'skuCode', width: 130 },
    { title: 'Description', dataIndex: 'skuDescription' },
    { title: 'WH on hand', dataIndex: 'startingWarehouseOnHand', align: 'right', width: 110, render: formatInt },
    { title: 'Credited', dataIndex: 'allocatedUnits', align: 'right', width: 95, render: formatInt },
    { title: 'Eligible chains', dataIndex: 'eligibleStoreGroupCodes', width: 180, render: (codes: string[]) => codes.join(', ') || '-' },
    { title: 'Basis', dataIndex: 'reason', width: 145, render: detailReason },
  ], [])

  const planColumns = useMemo<ColumnsType<PurchasePlanV3ListItem>>(() => [
    {
      title: 'Plan',
      dataIndex: 'label',
      render: (value: string, plan) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => {
          setSelectedPlanId(plan.id)
          setActiveTab('report')
        }}>
          {value}
        </Button>
      ),
    },
    { title: 'Department', dataIndex: 'departmentLabel' },
    { title: 'Year', dataIndex: 'year', width: 90, align: 'right' },
    { title: 'Rows', dataIndex: 'rowCount', width: 90, align: 'right' },
    { title: 'WH credit', dataIndex: 'warehousePlanningCredit', width: 120, align: 'right', render: formatInt },
    { title: 'Buy', dataIndex: 'recommendedBuy', width: 100, align: 'right', render: formatInt },
  ], [])

  return (
    <div>
      {contextHolder}
      <Title level={2} style={{ marginBottom: 0 }}>Plan de Compras V3</Title>
      <Paragraph type="secondary" style={{ marginBottom: 8 }}>
        Warehouse-shared buying plan. This is planning credit only; it does not create transfer instructions.
      </Paragraph>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'report',
            label: 'V3 report',
            children: (
              <>
                <Card size="small" style={{ marginBottom: 12 }}>
                  <Form<V3Form>
                    form={form}
                    layout="vertical"
                    initialValues={{
                      year: dayjs().year(),
                      forecastMethod: 'holtWinters',
                      eohMethod: 'forward',
                      coverMonths: 3,
                      discountNormalization: true,
                    }}
                    onFinish={(values) => generateMutation.mutate(values)}
                  >
                    <Row gutter={[8, 0]} align="bottom">
                      <Col xs={24} md={7} xl={5}>
                        <Form.Item label="Chains" name="storeGroupCodes" style={{ marginBottom: 8 }}>
                          <Select
                            mode="multiple"
                            allowClear
                            loading={chainsLoading}
                            placeholder="All active chains"
                            options={chains
                              .filter((chain) => !isWarehouseChainOption(chain))
                              .map((chain) => ({
                                value: chain.id,
                                label: `${chain.label} (${chain.storeCount})`,
                                disabled: !chain.active || chain.storeCount === 0,
                              }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={7} xl={5}>
                        <Form.Item label="Department" name="departmentNumber" rules={[{ required: true, message: 'Select a department' }]} style={{ marginBottom: 8 }}>
                          <Select
                            loading={departmentsLoading}
                            optionFilterProp="label"
                            options={departments.map((department) => ({
                              value: department.number,
                              label: `${department.number} - ${department.description}`,
                            }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={6} md={3} xl={2}>
                        <Form.Item label="Year" name="year" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
                          <InputNumber min={2020} max={2100} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={6} md={4} xl={3}>
                        <Form.Item label="Forecast" name="forecastMethod" style={{ marginBottom: 8 }}>
                          <Select options={FORECAST_OPTIONS} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={6} md={3} xl={3}>
                        <Form.Item label="EOH" name="eohMethod" style={{ marginBottom: 8 }}>
                          <Select options={EOH_OPTIONS} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={6} md={3} xl={2}>
                        <Form.Item label="Cover" name="coverMonths" style={{ marginBottom: 8 }}>
                          <InputNumber min={1} max={12} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={6} md={4} xl={2}>
                        <Form.Item label="Normalize" name="discountNormalization" valuePropName="checked" style={{ marginBottom: 8 }}>
                          <Switch />
                        </Form.Item>
                      </Col>
                      <Col xs={24} xl={2}>
                        <Form.Item label="Label" name="label" style={{ marginBottom: 8 }}>
                          <Input placeholder="Optional" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Space wrap>
                      <Button type="primary" htmlType="submit" loading={generateMutation.isPending}>
                        Generate V3
                      </Button>
                      <Button onClick={() => form.validateFields().then((values) => saveMutation.mutate(values))} loading={saveMutation.isPending}>
                        Save V3 plan
                      </Button>
                    </Space>
                  </Form>
                </Card>

                {selectedPlan.error ? (
                  <Alert
                    type="error"
                    message="Could not load V3 plan"
                    description={selectedPlan.error instanceof Error ? selectedPlan.error.message : String(selectedPlan.error)}
                    style={{ marginBottom: 12 }}
                  />
                ) : null}

                <Card
                  title={visibleReport
                    ? `${visibleReport.departmentLabel} ${visibleReport.year}`
                    : 'V3 warehouse-shared report'}
                  extra={visibleReport?.plan ? (
                    <Space>
                      <Tag>Saved V3</Tag>
                      <Button danger onClick={() => archiveMutation.mutate(visibleReport.plan!.id)} loading={archiveMutation.isPending}>
                        Archive
                      </Button>
                    </Space>
                  ) : null}
                >
                  {visibleReport ? (
                    <>
                      {visibleReport.warnings.length > 0 ? (
                        <Alert
                          type="warning"
                          showIcon
                          message={visibleReport.warnings.join(' ')}
                          style={{ marginBottom: 12 }}
                        />
                      ) : null}
                      <Space wrap style={{ marginBottom: 12 }}>
                        <Text type="secondary">History: {visibleReport.historyFromYearMonth} to {visibleReport.historyToYearMonth}</Text>
                        <Text type="secondary">Warehouse stores: {visibleReport.warehouseStoreNumbers.join(', ') || '-'}</Text>
                        <Tag color="blue">Demand fair-share</Tag>
                      </Space>
                      <Row gutter={12} style={{ marginBottom: 16 }}>
                        <Col xs={24} sm={8}>
                          <Text type="secondary">Baseline buy</Text>
                          <Title level={4} style={{ margin: 0 }}>{formatInt(visibleReport.totals.baselineBuy.units)}</Title>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Text type="secondary">Warehouse credit</Text>
                          <Title level={4} style={{ margin: 0 }}>{formatInt(visibleReport.totals.warehousePlanningCredit.units)}</Title>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Text type="secondary">Recommended buy</Text>
                          <Title level={4} style={{ margin: 0 }}>{formatInt(visibleReport.totals.recommendedBuy.units)}</Title>
                        </Col>
                      </Row>
                      <Table<PurchasePlanV3SeasonRow>
                        dataSource={rows}
                        columns={rowColumns}
                        rowKey={(row) => `${row.storeGroupCode}-${row.season}`}
                        size="small"
                        loading={generateMutation.isPending || selectedPlan.isFetching}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        expandable={{
                          expandedRowRender: (row) => row.warehouseDetails.length > 0 ? (
                            <Table<PurchasePlanV3WarehouseDetail>
                              dataSource={row.warehouseDetails}
                              columns={detailColumns}
                              rowKey={(detail) => `${detail.skuCode}-${detail.allocatedUnits}-${detail.remainingUnits}`}
                              size="small"
                              pagination={{ pageSize: 8 }}
                            />
                          ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No warehouse planning credit for this row." />
                          ),
                        }}
                      />
                    </>
                  ) : (
                    <Empty description="Generate a V3 report to compare warehouse-shared buying recommendations." image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </Card>
              </>
            ),
          },
          {
            key: 'saved',
            label: 'Saved V3 plans',
            children: (
              <Card title="Saved V3 draft plans">
                <Table<PurchasePlanV3ListItem>
                  dataSource={plans.data ?? []}
                  columns={planColumns}
                  rowKey="id"
                  size="small"
                  loading={plans.isLoading}
                  pagination={{ pageSize: 12 }}
                  scroll={{ x: 'max-content' }}
                />
              </Card>
            ),
          },
        ]}
      />
    </div>
  )
}
