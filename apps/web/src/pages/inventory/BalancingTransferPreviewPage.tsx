import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Steps,
  Table,
  Tag,
  Typography,
} from 'antd'
import { BranchesOutlined, CheckOutlined } from '@ant-design/icons'
import { useSkuStoreRollup } from '../../hooks/useRicsInventory'
import type {
  SkuStoreRollupParams,
  SkuStoreRollupRow,
} from '../../services/ricsInventoryApi'
import { getErrorMessage } from '../../utils/errors'

// RICS Ch. 4 p. 77 — Generate Balancing Transfers. Rebalance stock across
// stores by performance. Three methods × three performance metrics × month/
// season/year period. Phase 1 ships the preview against live RIINVQUA;
// commit is Phase 2.
type BalancingMethod =
  | 'OVER_UNDER_MODELS'
  | 'WITHOUT_MODELS'
  | 'WITHOUT_CONSIDERING_MODELS'

type PerformanceMetric = 'YTD_SALES' | 'STD_SALES' | 'MTD_SALES'

interface WizardValues {
  method: BalancingMethod
  metric: PerformanceMetric
  storeNumbers: string
  tieBreakRatio: number
  includeDoublesToLower: boolean
  vendorCode?: string
  categoryMin?: number
  categoryMax?: number
  season?: string
  limit?: number
}

interface BalancingLine {
  sku: string
  description: string | null
  brand: string | null
  category: number | null
  fromStore: number
  fromStoreName: string | null
  toStore: number
  toStoreName: string | null
  suggestedQuantity: number
  reason: string
  fromOnHand: number
  fromSales: number
  toOnHand: number
  toSales: number
  fromModel: number
  toModel: number
}

const METHOD_OPTIONS: Array<{ value: BalancingMethod; label: string; hint: string }> = [
  {
    value: 'OVER_UNDER_MODELS',
    label: 'Over/Under Models',
    hint: 'Only SKUs with a Model participate; surplus moves to shortfalls.',
  },
  {
    value: 'WITHOUT_MODELS',
    label: 'Without Models',
    hint: 'Only SKUs without a Model; move singles from donors with ≥2 to receivers at 0.',
  },
  {
    value: 'WITHOUT_CONSIDERING_MODELS',
    label: 'Ignore Models (default)',
    hint: 'Balance by performance regardless of Model values.',
  },
]

export default function BalancingTransferPreviewPage() {
  const [form] = Form.useForm<WizardValues>()
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [rollupParams, setRollupParams] = useState<SkuStoreRollupParams | null>(null)
  const [committedSettings, setCommittedSettings] = useState<WizardValues | null>(null)

  const { data, isLoading, isFetching, error } = useSkuStoreRollup(rollupParams)

  const handleCompute = async () => {
    try {
      const v = await form.validateFields()
      setCommittedSettings(v)
      const storeNumbers = v.storeNumbers
        ? v.storeNumbers.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
        : undefined
      setRollupParams({
        storeNumbers,
        vendorCode: v.vendorCode?.trim() || undefined,
        categoryMin: v.categoryMin,
        categoryMax: v.categoryMax,
        season: v.season?.trim() || undefined,
        limit: v.limit ?? 500,
      })
      setStep(2)
    } catch {
      // validation failed
    }
  }

  const previewLines = useMemo<BalancingLine[]>(() => {
    if (!data || !committedSettings) return []
    return computeBalancingLines(data.rows, committedSettings)
  }, [data, committedSettings])

  const summary = useMemo(() => {
    const skus = new Set(previewLines.map((l) => l.sku))
    const pairs = new Set(previewLines.map((l) => `${l.fromStore}-${l.toStore}`))
    const units = previewLines.reduce((a, l) => a + l.suggestedQuantity, 0)
    return { lines: previewLines.length, skus: skus.size, pairs: pairs.size, units }
  }, [previewLines])

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Balancing Transfer — Preview
        </Typography.Title>
        <Typography.Text type="secondary">
          RICS Ch. 4 p. 77 — rebalance across stores by performance
        </Typography.Text>
        <Steps
          current={step}
          style={{ marginTop: 16 }}
          items={[
            { title: 'Method + metric' },
            { title: 'Criteria' },
            { title: 'Preview + commit' },
          ]}
        />
      </Card>

      <Alert
        type="info"
        showIcon
        message="Preview only (Phase 1)"
        description="Reads live RIINVQUA for balancing candidates. Commit is Phase 2."
      />

      <Card>
        <Form<WizardValues>
          form={form}
          layout="vertical"
          initialValues={{
            method: 'WITHOUT_CONSIDERING_MODELS' as BalancingMethod,
            metric: 'YTD_SALES' as PerformanceMetric,
            tieBreakRatio: 2,
            includeDoublesToLower: false,
            limit: 50000,
          }}
          onValuesChange={() => {
            if (step === 2) {
              setStep(1)
              setRollupParams(null)
            }
          }}
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label="Balancing method" name="method">
                <Radio.Group optionType="button" buttonStyle="solid">
                  {METHOD_OPTIONS.map((o) => (
                    <Radio.Button value={o.value} key={o.value}>
                      {o.label}
                    </Radio.Button>
                  ))}
                </Radio.Group>
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item label="Performance metric" name="metric">
                <Select
                  options={[
                    { value: 'YTD_SALES', label: 'YTD sales' },
                    { value: 'STD_SALES', label: 'Season-to-date' },
                    { value: 'MTD_SALES', label: 'Month-to-date' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item
                label="Priority ratio (donor ÷ receiver ≥)"
                name="tieBreakRatio"
                tooltip="A receiver wins over a donor when its sales are at least this many times the donor's."
              >
                <InputNumber min={1.1} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item label="Store #s (comma-separated)" name="storeNumbers">
                <Input placeholder="blank = all stores in rollup" />
              </Form.Item>
            </Col>
            <Col xs={12} md={3}>
              <Form.Item label="Vendor" name="vendorCode">
                <Input placeholder="All" />
              </Form.Item>
            </Col>
            <Col xs={12} md={3}>
              <Form.Item label="Cat Min" name="categoryMin">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={3}>
              <Form.Item label="Cat Max" name="categoryMax">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={3}>
              <Form.Item label="Season" name="season">
                <Input maxLength={4} />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item
                label="SKU safety cap"
                name="limit"
                tooltip="Upper bound, not a scope limit. Filters decide what's scanned."
              >
                <InputNumber min={100} max={200000} step={1000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Space>
            <Button type="primary" icon={<BranchesOutlined />} loading={isFetching} onClick={handleCompute}>
              Compute preview
            </Button>
            <Button disabled icon={<CheckOutlined />}>Commit (Phase 2)</Button>
          </Space>
        </Form>
      </Card>

      {error && !data && (
        <Alert
          type="error"
          showIcon
          message="Preview failed"
          description={getErrorMessage(error, 'Unable to compute balancing preview.')}
        />
      )}
      {error && data && (
        <Alert
          type="warning"
          showIcon
          message="Last refresh failed — showing previous scan"
          description={`${getErrorMessage(error, 'Refresh errored.')} Click Compute preview to retry.`}
          closable
        />
      )}

      {step === 2 && rollupParams && isLoading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
            <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
              Scanning every SKU that matches your filters…
            </Typography.Paragraph>
          </div>
        </Card>
      )}

      {step === 2 && data && rollupParams && data.rows.length >= (rollupParams.limit ?? 50000) && (
        <Alert
          type="warning"
          showIcon
          message={`Scan hit the safety cap at ${(rollupParams.limit ?? 50000).toLocaleString()} SKU×Store rows`}
          description="Results may be truncated. Narrow filters or raise the cap."
        />
      )}

      {step === 2 && data && (
        <>
          <Row gutter={16}>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Proposed lines" value={summary.lines} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="SKUs" value={summary.skus} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Store pairs" value={summary.pairs} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Units" value={summary.units} />
              </Card>
            </Col>
          </Row>

          {summary.lines === 0 ? (
            <Card>
              <Empty description="No balancing opportunities found for this method + scan. Try widening filters or switching method." />
            </Card>
          ) : (
            <Card>
              <Table<BalancingLine>
                size="small"
                rowKey={(r) => `${r.sku}-${r.fromStore}-${r.toStore}`}
                dataSource={previewLines}
                pagination={{ pageSize: 50 }}
                scroll={{ x: 1500 }}
                columns={[
                  {
                    title: 'SKU',
                    dataIndex: 'sku',
                    key: 'sku',
                    width: 140,
                    fixed: 'left',
                    sorter: (a, b) => a.sku.localeCompare(b.sku),
                    defaultSortOrder: 'ascend',
                  },
                  {
                    title: 'Description',
                    dataIndex: 'description',
                    key: 'description',
                    ellipsis: true,
                    width: 200,
                    sorter: (a, b) => (a.description ?? '').localeCompare(b.description ?? ''),
                  },
                  {
                    title: 'Brand / Vendor',
                    dataIndex: 'brand',
                    key: 'brand',
                    width: 120,
                    sorter: (a, b) => (a.brand ?? '').localeCompare(b.brand ?? ''),
                    render: (v: string | null) => (v ? <Tag>{v}</Tag> : '—'),
                  },
                  {
                    title: 'Category',
                    dataIndex: 'category',
                    key: 'category',
                    width: 90,
                    align: 'right',
                    sorter: (a, b) => (a.category ?? 0) - (b.category ?? 0),
                    render: (v: number | null) => (v != null ? v : '—'),
                  },
                  {
                    title: 'From',
                    key: 'from',
                    width: 180,
                    sorter: (a, b) => a.fromStore - b.fromStore,
                    render: (_, r) =>
                      r.fromStoreName ? `${r.fromStore} — ${r.fromStoreName}` : String(r.fromStore),
                  },
                  {
                    title: 'To',
                    key: 'to',
                    width: 180,
                    sorter: (a, b) => a.toStore - b.toStore,
                    render: (_, r) =>
                      r.toStoreName ? `${r.toStore} — ${r.toStoreName}` : String(r.toStore),
                  },
                  {
                    title: 'Qty',
                    dataIndex: 'suggestedQuantity',
                    key: 'suggestedQuantity',
                    align: 'right',
                    width: 70,
                    sorter: (a, b) => a.suggestedQuantity - b.suggestedQuantity,
                    render: (v: number) => <strong>{v}</strong>,
                  },
                  {
                    title: 'From OH / Sales',
                    key: 'from-state',
                    align: 'right',
                    width: 140,
                    sorter: (a, b) => a.fromSales - b.fromSales,
                    render: (_, r) => `${r.fromOnHand} / ${r.fromSales}`,
                  },
                  {
                    title: 'To OH / Sales',
                    key: 'to-state',
                    align: 'right',
                    width: 140,
                    sorter: (a, b) => a.toSales - b.toSales,
                    render: (_, r) => `${r.toOnHand} / ${r.toSales}`,
                  },
                  { title: 'Reason', dataIndex: 'reason', key: 'reason', ellipsis: true, width: 320 },
                ]}
              />
            </Card>
          )}
        </>
      )}
    </Space>
  )
}

function computeBalancingLines(
  rows: SkuStoreRollupRow[],
  settings: WizardValues,
): BalancingLine[] {
  const salesFor = (r: SkuStoreRollupRow) =>
    settings.metric === 'YTD_SALES' ? r.ytdSales :
    settings.metric === 'STD_SALES' ? r.stdSales :
                                       r.mtdSales

  const bySku = new Map<string, SkuStoreRollupRow[]>()
  for (const r of rows) {
    const list = bySku.get(r.sku) ?? []
    list.push(r)
    bySku.set(r.sku, list)
  }

  const threshold = Math.max(1.1, settings.tieBreakRatio ?? 2)
  const out: BalancingLine[] = []

  for (const [sku, list] of bySku) {
    if (list.length < 2) continue

    // Filter participation by method.
    const hasModel = list.some((r) => r.model > 0)
    let participants = list
    if (settings.method === 'OVER_UNDER_MODELS' && !hasModel) continue
    if (settings.method === 'WITHOUT_MODELS' && hasModel) continue

    if (settings.method === 'OVER_UNDER_MODELS') {
      // Donors above model, receivers below model — tie-break by metric.
      const donors = participants
        .filter((r) => r.model > 0 && r.onHand > r.model)
        .sort((a, b) => salesFor(a) - salesFor(b)) // slowest sellers donate first
      const receivers = participants
        .filter((r) => r.model > 0 && r.onHand < r.model)
        .sort((a, b) => salesFor(b) - salesFor(a)) // fastest sellers receive first
      for (const receiver of receivers) {
        const need = receiver.model - receiver.onHand
        for (const donor of donors) {
          if (donor.store === receiver.store) continue
          const surplus = donor.onHand - donor.model
          if (surplus <= 0) continue
          // tie-break: receiver must be at least `threshold`× the donor's metric.
          const donorSales = Math.max(salesFor(donor), 1)
          if (salesFor(receiver) / donorSales < threshold) continue
          const move = Math.min(surplus, need)
          if (move <= 0) continue
          out.push(mkLine(list[0], donor, receiver, move,
            `Donor over model by ${surplus}; receiver short by ${need}; sales ratio ${(salesFor(receiver) / donorSales).toFixed(2)}`,
            salesFor(donor), salesFor(receiver),
          ))
          donor.onHand -= move
          break
        }
      }
    } else if (settings.method === 'WITHOUT_MODELS') {
      const donors = participants.filter((r) => r.onHand >= 2).sort((a, b) => salesFor(a) - salesFor(b))
      const receivers = participants.filter((r) => r.onHand === 0).sort((a, b) => salesFor(b) - salesFor(a))
      if (donors.length === 0 || receivers.length === 0) continue
      for (const receiver of receivers) {
        for (const donor of donors) {
          if (donor.store === receiver.store || donor.onHand < 2) continue
          const donorSales = Math.max(salesFor(donor), 1)
          if (salesFor(receiver) === 0 && salesFor(donor) === 0) {
            // no sales signal either way — skip
            continue
          }
          if (salesFor(receiver) / donorSales < threshold) continue
          out.push(mkLine(list[0], donor, receiver, 1,
            `Slow seller donates 1; fast/new receiver at 0 (ratio ${salesFor(receiver) === 0 ? '—' : (salesFor(receiver) / donorSales).toFixed(2)})`,
            salesFor(donor), salesFor(receiver),
          ))
          donor.onHand -= 1
          break
        }
      }
    } else {
      // WITHOUT_CONSIDERING_MODELS: balance by metric regardless.
      const sorted = [...participants].sort((a, b) => salesFor(b) - salesFor(a))
      const fastest = sorted[0]
      for (const slow of sorted.slice(1)) {
        if (slow.onHand <= 0) continue
        const slowSales = Math.max(salesFor(slow), 1)
        if (salesFor(fastest) / slowSales < threshold) continue
        const move = settings.includeDoublesToLower
          ? Math.min(slow.onHand, Math.max(1, Math.floor(slow.onHand / 2)))
          : slow.onHand >= 2
            ? 1
            : 0
        if (move <= 0) continue
        out.push(mkLine(list[0], slow, fastest, move,
          `Fastest seller pulls from slower; ratio ${salesFor(fastest) / slowSales === Infinity ? '∞' : (salesFor(fastest) / slowSales).toFixed(2)}`,
          salesFor(slow), salesFor(fastest),
        ))
        slow.onHand -= move
        fastest.onHand += move
      }
    }

    // Side effect: if settings.includeDoublesToLower is set in OVER_UNDER_MODELS
    // or WITHOUT_MODELS, we could add extra "push doubles to lower-priority"
    // passes here — deferred to keep this preview lean.
    void sku
  }

  // Primary: alphabetical by SKU. Column sorters allow operator override.
  out.sort((a, b) => a.sku.localeCompare(b.sku))
  return out
}

function mkLine(
  seed: SkuStoreRollupRow,
  from: SkuStoreRollupRow,
  to: SkuStoreRollupRow,
  qty: number,
  reason: string,
  fromSales: number,
  toSales: number,
): BalancingLine {
  return {
    sku: seed.sku,
    description: seed.description,
    brand: seed.brand,
    category: seed.category,
    fromStore: from.store,
    fromStoreName: from.storeName,
    toStore: to.store,
    toStoreName: to.storeName,
    suggestedQuantity: qty,
    reason,
    fromOnHand: from.onHand,
    fromSales,
    toOnHand: to.onHand,
    toSales,
    fromModel: from.model,
    toModel: to.model,
  }
}
