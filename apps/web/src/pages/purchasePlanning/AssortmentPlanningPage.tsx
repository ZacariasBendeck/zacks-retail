import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CheckOutlined, ReloadOutlined, SaveOutlined, SwapOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { useStores } from '../../hooks/useStores'
import {
  commitAssortmentWave,
  createAssortmentPlan,
  createAssortmentTransferDrafts,
  fetchAssortmentPlan,
  fetchAssortmentPlans,
  previewAssortmentPlan,
  type AssortmentColorMix,
  type AssortmentPlanListItem,
  type AssortmentPlanReport,
  type AssortmentPoolItem,
  type AssortmentStoreAllocation,
  type AssortmentTargetStore,
  type AssortmentWave,
  type AssortmentWaveLine,
} from '../../services/assortmentPlanningApi'

const { Title, Text } = Typography

interface AssortmentForm {
  label?: string
  categoryNumber: number
  warehouseStoreId: number
  targetStoreIds?: number[]
  startDate: Dayjs
  horizonMonths: number
  highSeasonMonths: number[]
}

const integerFmt = new Intl.NumberFormat('en-US')
const pctFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

const HIGH_SEASON_MONTH_OPTIONS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
]

function formatInt(value: number | null | undefined): string {
  return integerFmt.format(Math.round(value ?? 0))
}

function formatPct(value: number | null | undefined): string {
  return `${pctFmt.format(value ?? 0)}%`
}

function reasonTag(reason: AssortmentPoolItem['inclusionReason']) {
  if (reason === 'Both') return <Tag color="purple">Both</Tag>
  if (reason === 'PR') return <Tag color="blue">PR</Tag>
  return <Tag>Never distributed</Tag>
}

function statusTag(status: string) {
  if (status === 'COMMITTED') return <Tag color="green">Committed</Tag>
  if (status === 'TRANSFER_DRAFTED') return <Tag color="blue">Transfer drafted</Tag>
  if (status === 'ACTIVE') return <Tag color="cyan">Active</Tag>
  return <Tag>{status}</Tag>
}

function buildRequest(values: AssortmentForm) {
  return {
    label: values.label?.trim() || undefined,
    categoryNumber: values.categoryNumber,
    warehouseStoreId: values.warehouseStoreId,
    targetStoreIds: values.targetStoreIds?.length ? values.targetStoreIds : undefined,
    startDate: values.startDate.format('YYYY-MM-DD'),
    horizonMonths: values.horizonMonths,
    highSeasonMonths: values.highSeasonMonths,
    createdBy: 'buyer',
  }
}

function allocationSummary(allocations: AssortmentStoreAllocation[]): string {
  return allocations
    .slice(0, 5)
    .map((allocation) => `${allocation.storeId}: ${formatInt(allocation.quantity)}`)
    .join(', ')
}

export default function AssortmentPlanningPage() {
  const [form] = Form.useForm<AssortmentForm>()
  const [messageApi, contextHolder] = message.useMessage()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('plan')
  const [report, setReport] = useState<AssortmentPlanReport | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)

  const { data: stores = [], isLoading: storesLoading } = useStores()
  const plans = useQuery({
    queryKey: ['assortment-planning', 'plans'],
    queryFn: () => fetchAssortmentPlans({ status: 'all' }),
    staleTime: 60_000,
  })
  const selectedPlan = useQuery({
    queryKey: ['assortment-planning', 'plan', selectedPlanId],
    queryFn: () => fetchAssortmentPlan(selectedPlanId!),
    enabled: !!selectedPlanId,
  })

  const storeOptions = useMemo(
    () => stores
      .filter((store) => store.active)
      .map((store) => ({
        value: store.id,
        label: `${store.id} - ${store.name}`,
      })),
    [stores],
  )

  const previewMutation = useMutation({
    mutationFn: (values: AssortmentForm) => previewAssortmentPlan(buildRequest(values)),
    onSuccess: (next, values) => {
      setReport(next)
      setSelectedPlanId(null)
      if (!values.targetStoreIds?.length) {
        form.setFieldsValue({ targetStoreIds: next.targetStores.map((store) => store.storeId) })
      }
      messageApi.success('Preview generated')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not generate preview'),
  })

  const saveMutation = useMutation({
    mutationFn: (values: AssortmentForm) => createAssortmentPlan(buildRequest(values)),
    onSuccess: async (next) => {
      setReport(next)
      setSelectedPlanId(next.plan?.id ?? null)
      await qc.invalidateQueries({ queryKey: ['assortment-planning'] })
      messageApi.success('Assortment plan saved')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not save plan'),
  })

  const draftMutation = useMutation({
    mutationFn: ({ planId, waveId }: { planId: string; waveId: string }) =>
      createAssortmentTransferDrafts(planId, waveId),
    onSuccess: async (next) => {
      setReport(next)
      setSelectedPlanId(next.plan?.id ?? null)
      await qc.invalidateQueries({ queryKey: ['assortment-planning'] })
      messageApi.success('Transfer drafts created')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not create transfer drafts'),
  })

  const commitMutation = useMutation({
    mutationFn: ({ planId, waveId }: { planId: string; waveId: string }) => commitAssortmentWave(planId, waveId),
    onSuccess: async (next) => {
      setReport(next)
      setSelectedPlanId(next.plan?.id ?? null)
      await qc.invalidateQueries({ queryKey: ['assortment-planning'] })
      messageApi.success('Wave committed')
    },
    onError: (err) => messageApi.error(err instanceof Error ? err.message : 'Could not commit wave'),
  })

  const visibleReport = selectedPlan.data ?? report
  const planId = visibleReport?.plan?.id
  const targetStoreById = useMemo(
    () => new Map((visibleReport?.targetStores ?? []).map((store) => [store.storeId, store])),
    [visibleReport],
  )

  const targetColumns = useMemo<ColumnsType<AssortmentTargetStore>>(() => [
    { title: 'Store', dataIndex: 'storeLabel', width: 180 },
    { title: 'SKU budget', dataIndex: 'suggestedSkuBudget', align: 'right', width: 110, render: formatInt },
    { title: 'Model/style', dataIndex: 'suggestedModelQuantity', align: 'right', width: 110, render: formatInt },
    { title: 'Sales units', dataIndex: 'salesUnits', align: 'right', width: 110, render: formatInt },
    { title: 'Monthly sales', dataIndex: 'averageMonthlySales', align: 'right', width: 120, render: formatInt },
    { title: 'Sales/SKU/mo', dataIndex: 'salesPerSkuMonth', align: 'right', width: 120 },
    { title: 'Current SKUs', dataIndex: 'currentSkuCount', align: 'right', width: 110, render: formatInt },
    { title: 'Current units', dataIndex: 'currentUnits', align: 'right', width: 110, render: formatInt },
    { title: 'Weight', dataIndex: 'weight', align: 'right', width: 90, render: formatInt },
  ], [])

  const poolColumns = useMemo<ColumnsType<AssortmentPoolItem>>(() => [
    { title: 'SKU', dataIndex: 'skuCode', fixed: 'left', width: 130 },
    { title: 'Description', dataIndex: 'skuDescription', ellipsis: true },
    { title: 'Reason', dataIndex: 'inclusionReason', width: 150, render: reasonTag },
    { title: 'Color', dataIndex: 'canonicalColor', width: 130, render: (value: string, row) => <Space size={4}><Text>{value}</Text><Tag>{row.rawColorKey}</Tag></Space> },
    { title: 'WH units', dataIndex: 'warehouseUnits', align: 'right', width: 100, render: formatInt },
    { title: 'Store units', dataIndex: 'storeUnits', align: 'right', width: 100, render: formatInt },
    { title: 'Wave', dataIndex: 'assignedWaveSequence', align: 'right', width: 80, render: (value?: number) => value ? `#${value}` : '-' },
    { title: 'Keywords', dataIndex: 'keywords', ellipsis: true, width: 180, render: (value: string | null) => value || '-' },
  ], [])

  const colorColumns = useMemo<ColumnsType<AssortmentColorMix>>(() => [
    { title: 'Color', dataIndex: 'canonicalColor', width: 160 },
    { title: 'Family', dataIndex: 'colorFamily', width: 120 },
    { title: 'Sales units', dataIndex: 'salesUnits', align: 'right', width: 110, render: formatInt },
    { title: 'Sales mix', dataIndex: 'salesPct', align: 'right', width: 100, render: formatPct },
    { title: 'Planned styles', dataIndex: 'plannedStyleCount', align: 'right', width: 120, render: formatInt },
    { title: 'Planned mix', dataIndex: 'plannedStylePct', align: 'right', width: 110, render: formatPct },
  ], [])

  const lineColumns = useMemo<ColumnsType<AssortmentWaveLine>>(() => [
    { title: 'SKU', dataIndex: 'skuCode', width: 130 },
    { title: 'Description', dataIndex: 'skuDescription', ellipsis: true },
    { title: 'Color', dataIndex: 'canonicalColor', width: 130 },
    { title: 'WH on hand', dataIndex: 'warehouseUnits', align: 'right', width: 110, render: formatInt },
    { title: 'Release', dataIndex: 'releaseUnits', align: 'right', width: 90, render: formatInt },
    { title: 'Reserve', dataIndex: 'reserveUnits', align: 'right', width: 90, render: formatInt },
    {
      title: 'Stores',
      dataIndex: 'allocations',
      width: 180,
      render: (allocations: AssortmentStoreAllocation[]) => (
        <Text type="secondary">{allocations.length} stores{allocations.length ? ` (${allocationSummary(allocations)})` : ''}</Text>
      ),
    },
  ], [])

  const allocationColumns = useMemo<ColumnsType<AssortmentStoreAllocation>>(() => [
    { title: 'Store', dataIndex: 'storeLabel', width: 220 },
    {
      title: 'Model/style',
      align: 'right',
      width: 110,
      render: (_: unknown, allocation) => formatInt(allocation.modelQuantity ?? targetStoreById.get(allocation.storeId)?.suggestedModelQuantity ?? 0),
    },
    { title: 'Transfer', dataIndex: 'quantity', align: 'right', width: 100, render: (value: number) => <Text strong>{formatInt(value)}</Text> },
    {
      title: 'Sales 12m',
      align: 'right',
      width: 100,
      render: (_: unknown, allocation) => formatInt(targetStoreById.get(allocation.storeId)?.salesUnits ?? 0),
    },
    {
      title: 'Current units',
      align: 'right',
      width: 115,
      render: (_: unknown, allocation) => formatInt(targetStoreById.get(allocation.storeId)?.currentUnits ?? 0),
    },
  ], [targetStoreById])

  const waveColumns = useMemo<ColumnsType<AssortmentWave>>(() => [
    { title: 'Wave', dataIndex: 'sequence', width: 80, render: (value: number) => `#${value}` },
    { title: 'Release date', dataIndex: 'releaseDate', width: 125 },
    { title: 'Status', dataIndex: 'status', width: 150, render: statusTag },
    { title: 'Styles', dataIndex: 'styleCount', align: 'right', width: 90, render: formatInt },
    { title: 'Release units', dataIndex: 'totalUnits', align: 'right', width: 115, render: formatInt },
    { title: 'Draft transfers', dataIndex: 'generatedTransferIds', align: 'right', width: 120, render: (ids: string[]) => formatInt(ids.length) },
    {
      title: 'Actions',
      fixed: 'right',
      width: 240,
      render: (_: unknown, wave) => {
        const saved = !!planId && !!wave.id
        const committed = wave.status === 'COMMITTED'
        const hasDrafts = wave.generatedTransferIds.length > 0
        return (
          <Space>
            <Button
              size="small"
              icon={<SwapOutlined />}
              disabled={!saved || committed || hasDrafts}
              loading={draftMutation.isPending}
              onClick={() => {
                if (!planId || !wave.id) return
                draftMutation.mutate({ planId, waveId: wave.id })
              }}
            >
              Drafts
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<CheckOutlined />}
              disabled={!saved || committed || !hasDrafts}
              loading={commitMutation.isPending}
              onClick={() => {
                if (!planId || !wave.id) return
                Modal.confirm({
                  title: `Commit wave #${wave.sequence}`,
                  content: 'This will move warehouse stock into the destination stores for the draft transfers in this wave.',
                  okText: 'Commit',
                  onOk: () => commitMutation.mutateAsync({ planId, waveId: wave.id! }),
                })
              }}
            >
              Commit
            </Button>
          </Space>
        )
      },
    },
  ], [commitMutation, draftMutation, planId])

  const planColumns = useMemo<ColumnsType<AssortmentPlanListItem>>(() => [
    {
      title: 'Plan',
      dataIndex: 'label',
      render: (value: string, plan) => (
        <Button
          type="link"
          style={{ padding: 0 }}
          onClick={() => {
            setSelectedPlanId(plan.id)
            setActiveTab('plan')
          }}
        >
          {value}
        </Button>
      ),
    },
    { title: 'Status', dataIndex: 'status', width: 140, render: statusTag },
    { title: 'Category', dataIndex: 'categoryLabel', width: 220 },
    { title: 'Start', dataIndex: 'startDate', width: 110 },
    { title: 'SKUs', dataIndex: 'poolSkuCount', align: 'right', width: 90, render: formatInt },
    { title: 'Units', dataIndex: 'poolUnits', align: 'right', width: 90, render: formatInt },
    { title: 'Waves', dataIndex: 'waveCount', align: 'right', width: 90, render: formatInt },
    { title: 'Drafts', dataIndex: 'transferDraftCount', align: 'right', width: 90, render: formatInt },
  ], [])

  return (
    <div>
      {contextHolder}
      <Title level={2} style={{ marginTop: 0, marginBottom: 12 }}>Assortment Releases</Title>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'plan',
            label: 'Plan',
            children: (
              <>
                <Card size="small" style={{ marginBottom: 12 }}>
                  <Form<AssortmentForm>
                    form={form}
                    layout="vertical"
                    initialValues={{
                      categoryNumber: 71,
                      warehouseStoreId: 99,
                      startDate: dayjs(),
                      horizonMonths: 12,
                      highSeasonMonths: [6, 11, 12],
                    }}
                    onFinish={(values) => previewMutation.mutate(values)}
                  >
                    <Row gutter={12}>
                      <Col xs={24} md={6} lg={4}>
                        <Form.Item name="categoryNumber" label="Category" rules={[{ required: true }]}>
                          <InputNumber min={1} max={9999} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6} lg={5}>
                        <Form.Item name="warehouseStoreId" label="Warehouse" rules={[{ required: true }]}>
                          <Select loading={storesLoading} options={storeOptions} showSearch optionFilterProp="label" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6} lg={5}>
                        <Form.Item name="startDate" label="Start date" rules={[{ required: true }]}>
                          <DatePicker style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6} lg={4}>
                        <Form.Item name="horizonMonths" label="Months" rules={[{ required: true }]}>
                          <InputNumber min={1} max={24} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12} lg={6}>
                        <Form.Item name="highSeasonMonths" label="High season">
                          <Select mode="multiple" options={HIGH_SEASON_MONTH_OPTIONS} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12} lg={8}>
                        <Form.Item name="label" label="Plan label">
                          <Input placeholder="Optional" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} lg={16}>
                        <Form.Item name="targetStoreIds" label="Target stores">
                          <Select
                            mode="multiple"
                            allowClear
                            loading={storesLoading}
                            options={storeOptions.filter((option) => option.value !== form.getFieldValue('warehouseStoreId'))}
                            showSearch
                            optionFilterProp="label"
                            maxTagCount="responsive"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Space>
                      <Button htmlType="submit" type="primary" icon={<ReloadOutlined />} loading={previewMutation.isPending}>
                        Preview
                      </Button>
                      <Button
                        icon={<SaveOutlined />}
                        loading={saveMutation.isPending}
                        onClick={async () => saveMutation.mutate(await form.validateFields())}
                      >
                        Save Plan
                      </Button>
                    </Space>
                  </Form>
                </Card>

                {visibleReport?.warnings.length ? (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message={visibleReport.warnings.join(' ')}
                  />
                ) : null}

                {visibleReport ? (
                  <>
                    <Row gutter={12} style={{ marginBottom: 12 }}>
                      <Col xs={12} md={6}>
                        <Card size="small"><Statistic title="Pool SKUs" value={visibleReport.totals.poolSkuCount} /></Card>
                      </Col>
                      <Col xs={12} md={6}>
                        <Card size="small"><Statistic title="Warehouse units" value={visibleReport.totals.poolUnits} /></Card>
                      </Col>
                      <Col xs={12} md={6}>
                        <Card size="small"><Statistic title="Release units" value={visibleReport.totals.plannedReleaseUnits} /></Card>
                      </Col>
                      <Col xs={12} md={6}>
                        <Card size="small"><Statistic title="Warehouse reserve" value={visibleReport.totals.reserveUnits} /></Card>
                      </Col>
                    </Row>

                    <Tabs
                      items={[
                        {
                          key: 'waves',
                          label: 'Waves',
                          children: (
                            <Table<AssortmentWave>
                              size="small"
                              rowKey={(wave) => wave.id ?? `preview-${wave.sequence}`}
                              columns={waveColumns}
                              dataSource={visibleReport.waves}
                              pagination={false}
                              scroll={{ x: 900 }}
                              expandable={{
                                expandedRowRender: (wave) => (
                                  <Table<AssortmentWaveLine>
                                    size="small"
                                    rowKey={(line) => line.id ?? `${wave.sequence}-${line.skuCode}`}
                                    columns={lineColumns}
                                    dataSource={wave.lines}
                                    pagination={false}
                                    expandable={{
                                      expandedRowRender: (line) => (
                                        <Table<AssortmentStoreAllocation>
                                          size="small"
                                          rowKey={(allocation) => `${line.skuId}-${allocation.storeId}`}
                                          columns={allocationColumns}
                                          dataSource={[...line.allocations].sort((left, right) => right.quantity - left.quantity)}
                                          pagination={false}
                                        />
                                      ),
                                      rowExpandable: (line) => line.allocations.length > 0,
                                    }}
                                  />
                                ),
                              }}
                            />
                          ),
                        },
                        {
                          key: 'pool',
                          label: 'Pool Review',
                          children: (
                            <Table<AssortmentPoolItem>
                              size="small"
                              rowKey="skuId"
                              columns={poolColumns}
                              dataSource={visibleReport.pool}
                              pagination={{ pageSize: 50, showSizeChanger: true }}
                              scroll={{ x: 1100 }}
                            />
                          ),
                        },
                        {
                          key: 'colors',
                          label: 'Color Mix',
                          children: (
                            <Table<AssortmentColorMix>
                              size="small"
                              rowKey="canonicalColor"
                              columns={colorColumns}
                              dataSource={visibleReport.colorMix}
                              pagination={false}
                            />
                          ),
                        },
                        {
                          key: 'stores',
                          label: 'Stores',
                          children: (
                            <Table<AssortmentTargetStore>
                              size="small"
                              rowKey="storeId"
                              columns={targetColumns}
                              dataSource={visibleReport.targetStores}
                              pagination={false}
                            />
                          ),
                        },
                      ]}
                    />
                  </>
                ) : (
                  <Card size="small">
                    <Text type="secondary">No assortment plan loaded.</Text>
                  </Card>
                )}
              </>
            ),
          },
          {
            key: 'saved',
            label: 'Saved Plans',
            children: (
              <Table<AssortmentPlanListItem>
                size="small"
                rowKey="id"
                loading={plans.isLoading || selectedPlan.isFetching}
                columns={planColumns}
                dataSource={plans.data ?? []}
                pagination={{ pageSize: 25, showSizeChanger: true }}
                scroll={{ x: 1000 }}
              />
            ),
          },
        ]}
      />
    </div>
  )
}
