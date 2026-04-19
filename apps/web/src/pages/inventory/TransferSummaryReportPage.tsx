import { useMemo, useState } from 'react'
import {
  Alert,
  Card,
  Col,
  DatePicker,
  Empty,
  Row,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Typography,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { FileSearchOutlined } from '@ant-design/icons'
import { useTransferSummary } from '../../hooks/useRicsInventory'
import type {
  TransferSummaryCell,
  TransferSummaryReport,
} from '../../services/ricsInventoryApi'
import { getErrorMessage } from '../../utils/errors'

const { RangePicker } = DatePicker

// RICS Ch. 4 p. 80 — Transfer Summary Report. Monthly rollup of inter-store
// transfers: from × to matrix + per-month breakdown. Reads RIINVCHG (TOU rows).
type ViewMode = 'months' | 'matrix'

const DEFAULT_DAYS = 90

export default function TransferSummaryReportPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => {
    const end = dayjs()
    const start = end.subtract(DEFAULT_DAYS - 1, 'day')
    return [start, end]
  })
  const [viewMode, setViewMode] = useState<ViewMode>('months')

  const params = useMemo(
    () => ({
      fromDate: range[0].format('YYYY-MM-DD'),
      toDate: range[1].format('YYYY-MM-DD'),
    }),
    [range],
  )

  const { data, isLoading, isFetching, error } = useTransferSummary(params)

  const windowDays = range[1].diff(range[0], 'day') + 1

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Row align="middle" gutter={[16, 16]}>
          <Col flex="auto">
            <Typography.Title level={4} style={{ margin: 0 }}>
              Transfer Summary Report
            </Typography.Title>
            <Typography.Text type="secondary">
              RICS Ch. 4 p. 80 — monthly from × to transfer rollup (reads RIINVCHG TOU rows)
            </Typography.Text>
          </Col>
          <Col>
            <Space>
              <RangePicker
                value={range}
                onChange={(vals) => {
                  if (vals && vals[0] && vals[1]) setRange([vals[0], vals[1]])
                }}
                allowClear={false}
                format="YYYY-MM-DD"
              />
              <Segmented<ViewMode>
                options={[
                  { label: 'Monthly', value: 'months' },
                  { label: 'From × To matrix', value: 'matrix' },
                ]}
                value={viewMode}
                onChange={(v) => setViewMode(v as ViewMode)}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      {windowDays > 366 && (
        <Alert
          type="warning"
          showIcon
          message="Window exceeds 366 days"
          description="The server caps a single request at 366 days. Narrow the range to run the report."
        />
      )}

      {error && (
        <Alert
          type="error"
          showIcon
          message="Report failed"
          description={getErrorMessage(error, 'Unable to load Transfer Summary Report.')}
        />
      )}

      {(isLoading || isFetching) && !data && (
        <Card>
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin />
            <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
              Aggregating RIINVCHG for {windowDays}-day window… this can take ~20 s on larger ranges.
            </Typography.Paragraph>
          </div>
        </Card>
      )}

      {data && <ReportContent report={data} viewMode={viewMode} />}
    </Space>
  )
}

function ReportContent({
  report,
  viewMode,
}: {
  report: TransferSummaryReport
  viewMode: ViewMode
}) {
  if (report.grandTotalEvents === 0) {
    return (
      <Card>
        <Empty
          image={<FileSearchOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />}
          description="No transfer activity recorded in this window."
        />
      </Card>
    )
  }

  return (
    <>
      <Card>
        <Row gutter={[16, 16]}>
          <Col xs={12} md={6}>
            <Statistic title="Total Units Transferred" value={report.grandTotalQuantity} />
          </Col>
          <Col xs={12} md={6}>
            <Statistic
              title="Total Cost Moved"
              value={report.grandTotalCost}
              precision={2}
              prefix="$"
            />
          </Col>
          <Col xs={12} md={6}>
            <Statistic title="Transfer Events" value={report.grandTotalEvents} />
          </Col>
          <Col xs={12} md={6}>
            <Statistic title="Stores Involved" value={report.stores.length} />
          </Col>
        </Row>
      </Card>

      {viewMode === 'months' ? (
        <MonthlyView report={report} />
      ) : (
        <MatrixView report={report} />
      )}
    </>
  )
}

function MonthlyView({ report }: { report: TransferSummaryReport }) {
  return (
    <>
      {report.months.map((m) => (
        <Card
          key={m.month}
          size="small"
          title={
            <Space>
              <Typography.Text strong>{monthLabel(m.month)}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontWeight: 'normal' }}>
                {m.totalEvents} events · {m.totalQuantity} units · ${m.totalCost.toLocaleString()}
              </Typography.Text>
            </Space>
          }
        >
          <Table
            size="small"
            dataSource={m.cells}
            rowKey={(r) => `${r.fromStore}-${r.toStore}`}
            pagination={false}
            columns={cellColumns}
          />
        </Card>
      ))}
    </>
  )
}

function MatrixView({ report }: { report: TransferSummaryReport }) {
  // Build a dense from × to grid over the stores that participated.
  const storeNumbers = report.stores.map((s) => s.number)
  const cellIndex = new Map<string, TransferSummaryCell>()
  for (const c of report.matrix) {
    cellIndex.set(`${c.fromStore}-${c.toStore}`, c)
  }

  const columns = [
    {
      title: 'From ↓ / To →',
      dataIndex: 'fromLabel',
      key: 'fromLabel',
      fixed: 'left' as const,
      width: 200,
      render: (v: string) => <strong>{v}</strong>,
    },
    ...storeNumbers.map((toStoreNum) => {
      const toStore = report.stores.find((s) => s.number === toStoreNum)
      const label = toStore?.name
        ? `${toStoreNum} — ${toStore.name}`
        : String(toStoreNum)
      return {
        title: label,
        key: `to-${toStoreNum}`,
        align: 'right' as const,
        width: 120,
        render: (_: unknown, rec: { fromStore: number }) => {
          if (rec.fromStore === toStoreNum) {
            return <Typography.Text type="secondary">—</Typography.Text>
          }
          const cell = cellIndex.get(`${rec.fromStore}-${toStoreNum}`)
          if (!cell || cell.quantity === 0) {
            return <Typography.Text type="secondary">·</Typography.Text>
          }
          return (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 600 }}>{cell.quantity}</div>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                ${Math.round(cell.cost).toLocaleString()}
              </Typography.Text>
            </div>
          )
        },
      }
    }),
  ]

  const dataSource = storeNumbers.map((fromStoreNum) => {
    const s = report.stores.find((x) => x.number === fromStoreNum)
    return {
      key: fromStoreNum,
      fromStore: fromStoreNum,
      fromLabel: s?.name ? `${fromStoreNum} — ${s.name}` : String(fromStoreNum),
    }
  })

  return (
    <Card
      size="small"
      title={
        <Typography.Text strong>
          From × To matrix — each cell shows total units transferred (cost below)
        </Typography.Text>
      }
    >
      <Table
        size="small"
        columns={columns}
        dataSource={dataSource}
        pagination={false}
        scroll={{ x: 200 + storeNumbers.length * 120 }}
      />
    </Card>
  )
}

const cellColumns = [
  {
    title: 'From',
    key: 'from',
    render: (_: unknown, rec: TransferSummaryCell) =>
      rec.fromStoreName ? `${rec.fromStore} — ${rec.fromStoreName}` : String(rec.fromStore),
  },
  {
    title: 'To',
    key: 'to',
    render: (_: unknown, rec: TransferSummaryCell) =>
      rec.toStoreName ? `${rec.toStore} — ${rec.toStoreName}` : String(rec.toStore),
  },
  {
    title: 'Events',
    dataIndex: 'transferEvents',
    key: 'events',
    align: 'right' as const,
    width: 96,
  },
  {
    title: 'Units',
    dataIndex: 'quantity',
    key: 'quantity',
    align: 'right' as const,
    width: 96,
    render: (v: number) => <strong>{v}</strong>,
  },
  {
    title: 'Cost',
    dataIndex: 'cost',
    key: 'cost',
    align: 'right' as const,
    width: 128,
    render: (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  },
]

function monthLabel(m: string): string {
  return dayjs(`${m}-01`).format('MMMM YYYY')
}
