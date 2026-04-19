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
  Row,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tooltip,
  Typography,
} from 'antd'
import { FileDoneOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { useInventoryDetailReport } from '../../hooks/useRicsInventory'
import type {
  InventoryDetailReportParams,
  InventoryDetailReportRow,
} from '../../services/ricsInventoryApi'
import { getErrorMessage } from '../../utils/errors'

// RICS Ch. 4 p. 80 — Inventory Detail Report. RICS offers five report types
// (Size Detail / SKU Detail / SKU Summary / Category-Vendor Summary / Store
// Summary). This page serves SKU Summary as the default, adds a client-side
// Category+Vendor pivot, and points to the right surface for Size / Store /
// SKU Detail. (Full Size Detail needs per-cell extraction; full Store Summary
// needs per-store aggregation — both are phase-2 adapter work.)
type ReportType =
  | 'SKU_SUMMARY'
  | 'CATEGORY_VENDOR_SUMMARY'
  | 'STORE_SUMMARY'
  | 'SIZE_DETAIL'
  | 'SKU_DETAIL'

// Currency is Honduran Lempira (HNL) system-wide — labeled once at the top of
// the page, not repeated in every cell (see CLAUDE.md "Currency" policy).
function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const REPORT_TYPES: Array<{ value: ReportType; label: string }> = [
  { value: 'SKU_SUMMARY', label: 'SKU Summary' },
  { value: 'CATEGORY_VENDOR_SUMMARY', label: 'Cat / Vendor' },
  { value: 'STORE_SUMMARY', label: 'Store Summary' },
  { value: 'SIZE_DETAIL', label: 'Size Detail' },
  { value: 'SKU_DETAIL', label: 'SKU Detail (ledger)' },
]

export default function InventoryDetailReportPage() {
  const [form] = Form.useForm()
  const [activeParams, setActiveParams] = useState<InventoryDetailReportParams | null>(null)
  const [reportType, setReportType] = useState<ReportType>('SKU_SUMMARY')

  const { data, isLoading, isFetching, error } = useInventoryDetailReport(activeParams)

  const handleRun = (values: {
    storeNumber?: number
    vendorCode?: string
    categoryMin?: number
    categoryMax?: number
    season?: string
    limit?: number
  }) => {
    const params: InventoryDetailReportParams = {
      storeNumber: values.storeNumber ?? undefined,
      vendorCode: values.vendorCode?.trim() || undefined,
      categoryMin: values.categoryMin ?? undefined,
      categoryMax: values.categoryMax ?? undefined,
      season: values.season?.trim() || undefined,
      limit: values.limit ?? 1000,
    }
    setActiveParams(params)
  }

  const handleClear = () => {
    form.resetFields()
    setActiveParams(null)
  }

  const totals = useMemo(() => {
    const rows = data?.rows ?? []
    return {
      skuCount: rows.length,
      onHand: rows.reduce((acc, r) => acc + r.totalOnHand, 0),
      retailValue: rows.reduce((acc, r) => acc + r.retailValue, 0),
      costValue: rows.reduce((acc, r) => acc + r.costValue, 0),
    }
  }, [data])

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Row align="middle" gutter={16}>
          <Col flex="auto">
            <Typography.Title level={4} style={{ margin: 0 }}>
              Inventory Detail Report
            </Typography.Title>
            <Typography.Text type="secondary">
              RICS Ch. 4 p. 80 — five report types over per-SKU on-hand + retail/cost value
            </Typography.Text>
            <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>
              Amounts in Lempira (HNL).
            </Typography.Paragraph>
          </Col>
          <Col>
            <Segmented<ReportType>
              options={REPORT_TYPES.map((t) => ({ label: t.label, value: t.value }))}
              value={reportType}
              onChange={(v) => setReportType(v as ReportType)}
            />
          </Col>
        </Row>
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          onFinish={handleRun}
          initialValues={{ limit: 1000 }}
        >
          <Row gutter={16}>
            <Col xs={12} sm={6} md={4}>
              <Form.Item
                label={
                  <Space size={4}>
                    Store #
                    {reportType === 'STORE_SUMMARY' && (
                      <Tooltip title="Store Summary: set one store to see its rollup. Cross-store Store Summary requires phase-2 adapter.">
                        <InfoCircleOutlined style={{ color: '#1677ff' }} />
                      </Tooltip>
                    )}
                  </Space>
                }
                name="storeNumber"
              >
                <InputNumber min={1} style={{ width: '100%' }} placeholder="All" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Form.Item label="Vendor Code" name="vendorCode">
                <Input placeholder="e.g. BOTE" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Form.Item label="Category Min" name="categoryMin">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="Any" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Form.Item label="Category Max" name="categoryMax">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="Any" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Form.Item label="Season" name="season">
                <Input placeholder="e.g. A" maxLength={4} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Form.Item label="Limit" name="limit">
                <InputNumber min={1} max={20000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              icon={<FileDoneOutlined />}
              loading={isFetching}
            >
              Run Report
            </Button>
            <Button onClick={handleClear}>Clear</Button>
          </Space>
        </Form>
      </Card>

      {reportType === 'SIZE_DETAIL' && (
        <Alert
          type="info"
          showIcon
          message="Size Detail — use Inventory Inquiry"
          description="Per-size quantities for a single SKU are shown on the Inquiry page (Products → Inquiry). Bulk size-level extraction across all SKUs requires the phase-2 adapter that unpacks RIINVQUA cell-by-cell."
        />
      )}

      {reportType === 'SKU_DETAIL' && (
        <Alert
          type="info"
          showIcon
          message="SKU Detail — use the Change Detail page"
          description="RICS's 'SKU Detail' is a line-per-ledger-event view; the same data lives in the Change Detail page under Inventory, which queries RIINVCHG directly."
        />
      )}

      {error && (
        <Alert
          type="error"
          showIcon
          message="Report failed"
          description={getErrorMessage(error, 'Unable to load inventory detail report.')}
        />
      )}

      {!activeParams && reportType !== 'SIZE_DETAIL' && reportType !== 'SKU_DETAIL' && (
        <Card>
          <Empty description="Set filters (or leave blank for all) and click Run Report." />
        </Card>
      )}

      {activeParams && isLoading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
          </div>
        </Card>
      )}

      {activeParams && data && (
        <>
          <Row gutter={16}>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="SKUs in scope" value={totals.skuCount} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Total On Hand" value={totals.onHand} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Retail Value" value={totals.retailValue} precision={2} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic title="Cost Value" value={totals.costValue} precision={2} />
              </Card>
            </Col>
          </Row>

          {reportType === 'SKU_SUMMARY' && <SkuSummaryTable rows={data.rows} />}
          {reportType === 'CATEGORY_VENDOR_SUMMARY' && <CategoryVendorTable rows={data.rows} />}
          {reportType === 'STORE_SUMMARY' && (
            <StoreSummaryPanel rows={data.rows} storeNumber={activeParams.storeNumber} />
          )}
        </>
      )}
    </Space>
  )
}

function SkuSummaryTable({ rows }: { rows: InventoryDetailReportRow[] }) {
  return (
    <Card>
      <Table<InventoryDetailReportRow>
        dataSource={rows}
        rowKey="sku"
        pagination={{ pageSize: 50, showSizeChanger: true }}
        size="small"
        scroll={{ x: 1400 }}
        columns={[
          { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160, fixed: 'left', sorter: (a, b) => a.sku.localeCompare(b.sku) },
          { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true, width: 220 },
          { title: 'Brand', dataIndex: 'brand', key: 'brand', width: 120, sorter: (a, b) => (a.brand ?? '').localeCompare(b.brand ?? '') },
          { title: 'Style/Color', dataIndex: 'styleColor', key: 'styleColor', width: 120 },
          { title: 'Cat', dataIndex: 'category', key: 'category', width: 70, sorter: (a, b) => (a.category ?? 0) - (b.category ?? 0) },
          { title: 'Season', dataIndex: 'season', key: 'season', width: 70 },
          {
            title: 'Retail',
            dataIndex: 'retailPrice',
            key: 'retailPrice',
            align: 'right',
            width: 100,
            render: (v: number | null) => formatMoney(v),
          },
          {
            title: 'Cost',
            dataIndex: 'currentCost',
            key: 'currentCost',
            align: 'right',
            width: 100,
            render: (v: number | null) => formatMoney(v),
          },
          {
            title: 'On Hand',
            dataIndex: 'totalOnHand',
            key: 'totalOnHand',
            align: 'right',
            width: 100,
            sorter: (a, b) => a.totalOnHand - b.totalOnHand,
            defaultSortOrder: 'descend',
            render: (v: number) => <strong>{v}</strong>,
          },
          { title: 'On Order', dataIndex: 'totalCurrentOnOrder', key: 'totalCurrentOnOrder', align: 'right', width: 100 },
          { title: 'YTD', dataIndex: 'totalYtdSales', key: 'totalYtdSales', align: 'right', width: 90 },
          { title: 'LY', dataIndex: 'totalLySales', key: 'totalLySales', align: 'right', width: 90 },
          {
            title: 'Retail Value',
            dataIndex: 'retailValue',
            key: 'retailValue',
            align: 'right',
            width: 130,
            sorter: (a, b) => a.retailValue - b.retailValue,
            render: (v: number) => formatMoney(v),
          },
          {
            title: 'Cost Value',
            dataIndex: 'costValue',
            key: 'costValue',
            align: 'right',
            width: 130,
            sorter: (a, b) => a.costValue - b.costValue,
            render: (v: number) => formatMoney(v),
          },
        ]}
      />
    </Card>
  )
}

interface CategoryVendorRow {
  key: string
  category: number | null
  vendorCode: string | null
  brand: string | null
  skuCount: number
  totalOnHand: number
  totalCurrentOnOrder: number
  totalYtdSales: number
  totalLySales: number
  retailValue: number
  costValue: number
}

function CategoryVendorTable({ rows }: { rows: InventoryDetailReportRow[] }) {
  const pivoted = useMemo<CategoryVendorRow[]>(() => {
    const map = new Map<string, CategoryVendorRow>()
    for (const r of rows) {
      const key = `${r.category ?? '·'}|${r.vendorCode ?? '·'}`
      const existing = map.get(key) ?? {
        key,
        category: r.category,
        vendorCode: r.vendorCode,
        brand: r.brand,
        skuCount: 0,
        totalOnHand: 0,
        totalCurrentOnOrder: 0,
        totalYtdSales: 0,
        totalLySales: 0,
        retailValue: 0,
        costValue: 0,
      }
      existing.skuCount += 1
      existing.totalOnHand += r.totalOnHand
      existing.totalCurrentOnOrder += r.totalCurrentOnOrder
      existing.totalYtdSales += r.totalYtdSales
      existing.totalLySales += r.totalLySales
      existing.retailValue += r.retailValue
      existing.costValue += r.costValue
      map.set(key, existing)
    }
    return [...map.values()].sort(
      (a, b) => (a.category ?? 0) - (b.category ?? 0) ||
        (a.vendorCode ?? '').localeCompare(b.vendorCode ?? ''),
    )
  }, [rows])

  return (
    <Card>
      <Table<CategoryVendorRow>
        dataSource={pivoted}
        rowKey="key"
        pagination={{ pageSize: 50 }}
        size="small"
        scroll={{ x: 1200 }}
        summary={(page) => {
          const totals = page.reduce(
            (acc, p) => ({
              skuCount: acc.skuCount + p.skuCount,
              totalOnHand: acc.totalOnHand + p.totalOnHand,
              totalCurrentOnOrder: acc.totalCurrentOnOrder + p.totalCurrentOnOrder,
              totalYtdSales: acc.totalYtdSales + p.totalYtdSales,
              totalLySales: acc.totalLySales + p.totalLySales,
              retailValue: acc.retailValue + p.retailValue,
              costValue: acc.costValue + p.costValue,
            }),
            { skuCount: 0, totalOnHand: 0, totalCurrentOnOrder: 0, totalYtdSales: 0, totalLySales: 0, retailValue: 0, costValue: 0 },
          )
          return (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={3}>
                <strong>Page totals</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">{totals.skuCount}</Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right"><strong>{totals.totalOnHand}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">{totals.totalCurrentOnOrder}</Table.Summary.Cell>
              <Table.Summary.Cell index={6} align="right">{totals.totalYtdSales}</Table.Summary.Cell>
              <Table.Summary.Cell index={7} align="right">{totals.totalLySales}</Table.Summary.Cell>
              <Table.Summary.Cell index={8} align="right">{formatMoney(totals.retailValue)}</Table.Summary.Cell>
              <Table.Summary.Cell index={9} align="right">{formatMoney(totals.costValue)}</Table.Summary.Cell>
            </Table.Summary.Row>
          )
        }}
        columns={[
          {
            title: 'Category',
            dataIndex: 'category',
            key: 'category',
            width: 100,
            fixed: 'left',
            sorter: (a, b) => (a.category ?? 0) - (b.category ?? 0),
            render: (v: number | null) => v ?? <Typography.Text type="secondary">—</Typography.Text>,
          },
          {
            title: 'Vendor',
            dataIndex: 'vendorCode',
            key: 'vendorCode',
            width: 120,
            sorter: (a, b) => (a.vendorCode ?? '').localeCompare(b.vendorCode ?? ''),
          },
          { title: 'Brand', dataIndex: 'brand', key: 'brand', width: 160 },
          { title: '# SKUs', dataIndex: 'skuCount', key: 'skuCount', align: 'right', width: 90 },
          {
            title: 'On Hand',
            dataIndex: 'totalOnHand',
            key: 'totalOnHand',
            align: 'right',
            width: 100,
            sorter: (a, b) => a.totalOnHand - b.totalOnHand,
            defaultSortOrder: 'descend',
            render: (v: number) => <strong>{v}</strong>,
          },
          { title: 'On Order', dataIndex: 'totalCurrentOnOrder', key: 'totalCurrentOnOrder', align: 'right', width: 100 },
          { title: 'YTD Sales', dataIndex: 'totalYtdSales', key: 'totalYtdSales', align: 'right', width: 100 },
          { title: 'LY Sales', dataIndex: 'totalLySales', key: 'totalLySales', align: 'right', width: 100 },
          {
            title: 'Retail Value',
            dataIndex: 'retailValue',
            key: 'retailValue',
            align: 'right',
            width: 130,
            sorter: (a, b) => a.retailValue - b.retailValue,
            render: (v: number) => formatMoney(v),
          },
          {
            title: 'Cost Value',
            dataIndex: 'costValue',
            key: 'costValue',
            align: 'right',
            width: 130,
            render: (v: number) => formatMoney(v),
          },
        ]}
      />
    </Card>
  )
}

function StoreSummaryPanel({
  rows,
  storeNumber,
}: {
  rows: InventoryDetailReportRow[]
  storeNumber?: number
}) {
  return (
    <>
      {!storeNumber && (
        <Alert
          type="info"
          showIcon
          message="Store Summary tip"
          description="Filter by a single Store # in the form above and re-run the report to see that store's rollup. (A cross-store Store Summary is phase-2 work — the current adapter collapses across stores by default.)"
        />
      )}
      <SkuSummaryTable rows={rows} />
    </>
  )
}
