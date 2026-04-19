import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Alert,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import { SearchOutlined, ShopOutlined } from '@ant-design/icons'
import { useInventoryInquiry } from '../../hooks/useRicsInventory'
import type {
  InventoryCell,
  InventoryInquiry,
  InventoryInquiryStore,
} from '../../services/ricsInventoryApi'
import { getErrorMessage } from '../../utils/errors'

// RICS Ch. 4 p. 75 — Inventory Inquiry. Enter a SKU, see on-hand, on-order,
// model, max, reorder, and sales history across every store and every size.
export default function InventoryInquiryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const skuFromUrl = searchParams.get('sku')?.trim() || ''
  const [skuInput, setSkuInput] = useState(skuFromUrl)

  const activeSku = skuFromUrl || null
  const { data, isLoading, isFetching, error } = useInventoryInquiry(activeSku)

  const handleSearch = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setSearchParams({})
      return
    }
    setSearchParams({ sku: trimmed })
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Row align="middle" gutter={16}>
          <Col flex="auto">
            <Typography.Title level={4} style={{ margin: 0 }}>
              Inventory Inquiry
            </Typography.Title>
            <Typography.Text type="secondary">
              RICS Ch. 4 p. 75 — size grid × store for one SKU
            </Typography.Text>
          </Col>
          <Col flex="360px">
            <Input.Search
              placeholder="Enter SKU (e.g. 349101-BKPT)"
              prefix={<SearchOutlined />}
              allowClear
              enterButton="Search"
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value)}
              onSearch={handleSearch}
              loading={isFetching}
            />
          </Col>
        </Row>
      </Card>

      {!activeSku && (
        <Card>
          <Empty description="Enter a SKU to view its full size-grid inventory across every store." />
        </Card>
      )}

      {activeSku && error && (
        <Alert
          type="error"
          showIcon
          message="Inquiry failed"
          description={getErrorMessage(error, 'Unable to load inventory inquiry.')}
        />
      )}

      {activeSku && isLoading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        </Card>
      )}

      {activeSku && data && <InquiryContent data={data} />}
    </Space>
  )
}

function InquiryContent({ data }: { data: InventoryInquiry }) {
  const { master, stores, totals } = data

  const fmtMoney = (v: number | null | undefined) =>
    v == null
      ? '—'
      : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const priceText = fmtMoney(master.retailPrice)
  const costText = fmtMoney(master.currentCost)

  return (
    <>
      <Card>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Typography.Title level={4} style={{ marginTop: 0 }}>
              {data.sku}
            </Typography.Title>
            <Typography.Paragraph style={{ marginBottom: 8 }}>
              {master.description || <Typography.Text type="secondary">(no description)</Typography.Text>}
            </Typography.Paragraph>
            <Space wrap>
              {master.brand && <Tag color="blue">{master.brand}</Tag>}
              {master.vendorCode && <Tag>{master.vendorCode}</Tag>}
              {master.season && <Tag color="gold">Season {master.season}</Tag>}
              {master.category != null && <Tag color="purple">Cat {master.category}</Tag>}
            </Space>
            <Descriptions
              size="small"
              column={2}
              style={{ marginTop: 16 }}
              items={[
                { key: 'retail', label: 'Retail', children: priceText },
                { key: 'cost', label: 'Cost', children: costText },
                {
                  key: 'sizeType',
                  label: 'Size Type',
                  children:
                    master.sizeType.desc ??
                    (master.sizeType.code != null ? `#${master.sizeType.code}` : '—'),
                },
                {
                  key: 'sizes',
                  label: 'Sizes',
                  children: master.sizeType.columnLabels.length
                    ? master.sizeType.columnLabels.join(' · ')
                    : '—',
                },
              ]}
            />
          </Col>
          <Col xs={24} lg={12}>
            <Row gutter={[16, 16]}>
              <Col xs={12}>
                <Statistic title="Total On Hand" value={totals.onHand} />
              </Col>
              <Col xs={12}>
                <Statistic title="Current On Order" value={totals.currentOnOrder} />
              </Col>
              <Col xs={12}>
                <Statistic title="Future On Order" value={totals.futureOnOrder} />
              </Col>
              <Col xs={12}>
                <Statistic title="YTD Sales" value={totals.ytdSales} />
              </Col>
              <Col xs={12}>
                <Statistic title="LY Sales" value={totals.lySales} />
              </Col>
              <Col xs={12}>
                <Statistic title="# Stores" value={stores.length} prefix={<ShopOutlined />} />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      {stores.length === 0 ? (
        <Card>
          <Empty description="No inventory rows found for this SKU across any store." />
        </Card>
      ) : (
        stores.map((store) => (
          <StoreGridCard key={store.storeNumber} store={store} columnLabels={master.sizeType.columnLabels} />
        ))
      )}
    </>
  )
}

interface MetricRow {
  key: string
  label: string
  metric: keyof Pick<
    InventoryCell,
    'onHand' | 'currentOnOrder' | 'futureOnOrder' | 'model' | 'maxQty' | 'reorder' | 'mtdSales' | 'stdSales' | 'ytdSales' | 'lySales'
  >
  emphasize?: boolean
}

const METRIC_ROWS: MetricRow[] = [
  { key: 'onHand', label: 'On Hand', metric: 'onHand', emphasize: true },
  { key: 'onOrder', label: 'Current On Order', metric: 'currentOnOrder' },
  { key: 'future', label: 'Future On Order', metric: 'futureOnOrder' },
  { key: 'model', label: 'Model', metric: 'model' },
  { key: 'max', label: 'Max', metric: 'maxQty' },
  { key: 'reorder', label: 'Reorder', metric: 'reorder' },
  { key: 'mtd', label: 'MTD Sales', metric: 'mtdSales' },
  { key: 'std', label: 'Season Sales', metric: 'stdSales' },
  { key: 'ytd', label: 'YTD Sales', metric: 'ytdSales' },
  { key: 'ly', label: 'LY Sales', metric: 'lySales' },
]

function StoreGridCard({
  store,
  columnLabels,
}: {
  store: InventoryInquiryStore
  columnLabels: string[]
}) {
  // Group cells by row label, then index by column label for O(1) lookup.
  const cellsByRow = useMemo(() => {
    const byRow = new Map<string, Map<string, InventoryCell>>()
    for (const c of store.cells) {
      const row = byRow.get(c.rowLabel) ?? new Map<string, InventoryCell>()
      row.set(c.columnLabel, c)
      byRow.set(c.rowLabel, row)
    }
    return byRow
  }, [store.cells])

  const rowLabels = [...cellsByRow.keys()]

  // Columns actually present in this store's data (falls back to master's list if empty).
  const columnsShown = useMemo(() => {
    const present = new Set<string>()
    for (const c of store.cells) present.add(c.columnLabel)
    const base = columnLabels.length ? columnLabels : [...present]
    return base.filter((c) => present.has(c))
  }, [columnLabels, store.cells])

  const storeLabel =
    store.storeName ? `${store.storeNumber} — ${store.storeName}` : `Store ${store.storeNumber}`

  if (store.totals.onHand === 0 && store.totals.ytdSales === 0 && store.totals.lySales === 0 &&
      store.totals.currentOnOrder === 0 && store.totals.futureOnOrder === 0) {
    // Collapse empty stores into a thin summary row — easier to scan a long list.
    return (
      <Card size="small" title={storeLabel}>
        <Typography.Text type="secondary">No activity recorded for this store.</Typography.Text>
      </Card>
    )
  }

  return (
    <Card
      size="small"
      title={storeLabel}
      extra={
        <Space size="large">
          <Typography.Text>On Hand: <strong>{store.totals.onHand}</strong></Typography.Text>
          <Typography.Text>On Order: <strong>{store.totals.currentOnOrder}</strong></Typography.Text>
          <Typography.Text>YTD: <strong>{store.totals.ytdSales}</strong></Typography.Text>
          <Typography.Text>LY: <strong>{store.totals.lySales}</strong></Typography.Text>
        </Space>
      }
    >
      {rowLabels.map((rowLabel) => (
        <MetricTable
          key={rowLabel || '_'}
          rowLabel={rowLabel}
          row={cellsByRow.get(rowLabel) ?? new Map()}
          columnsShown={columnsShown}
        />
      ))}
    </Card>
  )
}

function MetricTable({
  rowLabel,
  row,
  columnsShown,
}: {
  rowLabel: string
  row: Map<string, InventoryCell>
  columnsShown: string[]
}) {
  const columns = [
    {
      title: rowLabel ? `Size (${rowLabel})` : 'Metric',
      dataIndex: 'label',
      key: 'label',
      fixed: 'left' as const,
      width: 160,
      render: (v: string, rec: { emphasize?: boolean }) =>
        rec.emphasize ? <strong>{v}</strong> : v,
    },
    ...columnsShown.map((col) => ({
      title: col,
      key: col,
      align: 'right' as const,
      render: (_: unknown, rec: MetricRow & { values: Record<string, number> }) => {
        const v = rec.values[col] ?? 0
        if (v === 0) return <Typography.Text type="secondary">0</Typography.Text>
        return rec.emphasize ? <strong>{v}</strong> : v
      },
    })),
  ]

  const dataSource = METRIC_ROWS.map((m) => ({
    ...m,
    values: Object.fromEntries(
      columnsShown.map((col) => [col, row.get(col)?.[m.metric] ?? 0]),
    ) as Record<string, number>,
  }))

  return (
    <div style={{ marginBottom: rowLabel ? 16 : 0 }}>
      {rowLabel && (
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
          Row: {rowLabel}
        </Typography.Text>
      )}
      <Table
        size="small"
        columns={columns}
        dataSource={dataSource}
        rowKey="key"
        pagination={false}
        scroll={{ x: 160 + columnsShown.length * 72 }}
      />
    </div>
  )
}
