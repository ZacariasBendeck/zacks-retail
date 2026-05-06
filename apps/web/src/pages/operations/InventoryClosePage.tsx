import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  Flex,
  Form,
  Input,
  Row,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  App as AntApp,
  type TableColumnsType,
} from 'antd'
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExperimentOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { InlinePageHelp, useRegisterPageHelp } from '../../components/page-help'
import { inventoryCloseHelp } from '../../content/help/pageHelp'
import {
  inventoryCloseApi,
  type InventoryCloseSummary,
  type InventoryMonthCloseResult,
  type InventoryMonthCloseRun,
  type InventoryWeekCloseResult,
  type InventoryWeekCloseRun,
} from '../../services/inventoryCloseApi'

type RunKind = 'month' | 'week'
type RunningAction = 'month-dry-run' | 'month-close' | 'week-dry-run' | 'week-close' | null

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const dateFmt = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const integerFmt = new Intl.NumberFormat('en-US')
const moneyFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function defaultCloseMonth(): string {
  return dayjs().subtract(1, 'month').format('YYYY-MM')
}

function defaultWeekEnding(): Dayjs {
  const today = dayjs()
  const daysSinceSunday = today.day()
  return today.subtract(daysSinceSunday === 0 ? 7 : daysSinceSunday, 'day')
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return dateFmt.format(date)
}

function formatInt(value: number | null | undefined): string {
  return integerFmt.format(value ?? 0)
}

function formatMoney(value: number | null | undefined): string {
  return moneyFmt.format(value ?? 0)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function statusTag(status: string | null | undefined) {
  if (status === 'SUCCEEDED') return <Tag color="green">Succeeded</Tag>
  if (status === 'DRY_RUN') return <Tag color="blue">Dry Run</Tag>
  if (status === 'RUNNING') return <Tag color="processing">Running</Tag>
  if (status === 'FAILED') return <Tag color="red">Failed</Tag>
  return <Tag>Unknown</Tag>
}

function validationTag(status: string | null | undefined) {
  if (status === 'PASSED') return <Tag color="green">Passed</Tag>
  if (status === 'FAILED') return <Tag color="red">Failed</Tag>
  return <Tag>Not checked</Tag>
}

function ResultPanel({
  kind,
  result,
}: {
  kind: RunKind
  result: InventoryMonthCloseResult | InventoryWeekCloseResult | null
}) {
  if (!result) {
    return (
      <Card size="small" title="Last Result">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No run in this session" />
      </Card>
    )
  }

  const title =
    kind === 'month'
      ? `${(result as InventoryMonthCloseResult).closeMonth} ${result.dryRun ? 'dry run' : 'close'}`
      : `${(result as InventoryWeekCloseResult).weekEndingDate} ${result.dryRun ? 'dry run' : 'close'}`

  const validation =
    kind === 'month'
      ? (result as InventoryMonthCloseResult).validation
      : (result as InventoryWeekCloseResult).validation
  const mismatchCount =
    kind === 'month'
      ? (validation as InventoryMonthCloseResult['validation']).salesCellMismatchCount
      : (validation as InventoryWeekCloseResult['validation']).weekSalesMismatchCount
  const mismatchQty =
    kind === 'month'
      ? (validation as InventoryMonthCloseResult['validation']).salesCellMismatchQtyAbs
      : (validation as InventoryWeekCloseResult['validation']).weekSalesMismatchQtyAbs

  return (
    <Card size="small" title={title} extra={statusTag(result.status)}>
      <Descriptions size="small" column={{ xs: 1, md: 2 }}>
        <Descriptions.Item label="Run ID">{result.runId}</Descriptions.Item>
        <Descriptions.Item label="Snapshot as of">{formatDateTime(result.snapshotAsOf)}</Descriptions.Item>
        <Descriptions.Item label="Snapshots scanned">{formatInt(result.snapshotsScanned)}</Descriptions.Item>
        <Descriptions.Item label="Snapshots updated">{formatInt(result.snapshotsUpdated)}</Descriptions.Item>
        <Descriptions.Item label="Qty sales">
          {formatInt(
            kind === 'month'
              ? (result as InventoryMonthCloseResult).totalQtySales
              : (result as InventoryWeekCloseResult).totalWeekQtySales,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Net sales">
          {formatMoney(
            kind === 'month'
              ? (result as InventoryMonthCloseResult).totalNetSales
              : (result as InventoryWeekCloseResult).totalWeekNetSales,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Profit">
          {formatMoney(
            kind === 'month'
              ? (result as InventoryMonthCloseResult).totalProfit
              : (result as InventoryWeekCloseResult).totalWeekProfit,
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Validation">
          {validation.unpromotedPosTickets === 0 && mismatchCount === 0 ? (
            <Tag color="green">Passed</Tag>
          ) : (
            <Tag color="red">Failed</Tag>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Unpromoted tickets">
          {formatInt(validation.unpromotedPosTickets)}
        </Descriptions.Item>
        <Descriptions.Item label="Mismatch units">{formatInt(mismatchQty)}</Descriptions.Item>
      </Descriptions>
    </Card>
  )
}

export default function InventoryClosePage() {
  useRegisterPageHelp(inventoryCloseHelp)
  const { message, modal } = AntApp.useApp()

  const [summary, setSummary] = useState<InventoryCloseSummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [month, setMonth] = useState(defaultCloseMonth)
  const [weekEnding, setWeekEnding] = useState<Dayjs | null>(defaultWeekEnding)
  const [running, setRunning] = useState<RunningAction>(null)
  const [lastKind, setLastKind] = useState<RunKind>('month')
  const [lastResult, setLastResult] = useState<InventoryMonthCloseResult | InventoryWeekCloseResult | null>(null)

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true)
    try {
      setSummary(await inventoryCloseApi.getSummary(30))
    } catch (error) {
      message.error(errorMessage(error))
    } finally {
      setLoadingSummary(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const runMonthClose = useCallback(
    async (dryRun: boolean) => {
      const normalized = month.trim()
      if (!MONTH_RE.test(normalized)) {
        message.error('Month must match YYYY-MM.')
        return
      }
      setRunning(dryRun ? 'month-dry-run' : 'month-close')
      try {
        const result = await inventoryCloseApi.runMonthClose({ closeMonth: normalized, dryRun })
        setLastKind('month')
        setLastResult(result)
        message.success(dryRun ? 'Month dry run finished.' : 'Month close finished.')
        await loadSummary()
      } catch (error) {
        message.error(errorMessage(error))
      } finally {
        setRunning(null)
      }
    },
    [loadSummary, month],
  )

  const runWeekClose = useCallback(
    async (dryRun: boolean) => {
      if (!weekEnding) {
        message.error('Week ending date is required.')
        return
      }
      const weekEndingDate = weekEnding.format('YYYY-MM-DD')
      setRunning(dryRun ? 'week-dry-run' : 'week-close')
      try {
        const result = await inventoryCloseApi.runWeekClose({ weekEndingDate, dryRun })
        setLastKind('week')
        setLastResult(result)
        message.success(dryRun ? 'Week dry run finished.' : 'Week close finished.')
        await loadSummary()
      } catch (error) {
        message.error(errorMessage(error))
      } finally {
        setRunning(null)
      }
    },
    [loadSummary, weekEnding],
  )

  const confirmMonthClose = () => {
    modal.confirm({
      title: 'Run month close?',
      icon: <WarningOutlined />,
      content: `This will close inventory month ${month.trim()} and cannot be run again for the same month.`,
      okText: 'Run Close',
      okButtonProps: { danger: true },
      onOk: () => runMonthClose(false),
    })
  }

  const confirmWeekClose = () => {
    const label = weekEnding?.format('YYYY-MM-DD') ?? ''
    modal.confirm({
      title: 'Run week close?',
      icon: <WarningOutlined />,
      content: `This will close inventory week ending ${label} and cannot be run again for the same week.`,
      okText: 'Run Close',
      okButtonProps: { danger: true },
      onOk: () => runWeekClose(false),
    })
  }

  const latestClosedMonth = summary?.closedMonths[0]
  const latestClosedWeek = summary?.closedWeeks[0]

  const monthRunColumns = useMemo<TableColumnsType<InventoryMonthCloseRun>>(
    () => [
      { title: 'Month', dataIndex: 'yearMonth', fixed: 'left', width: 110 },
      { title: 'Status', dataIndex: 'status', width: 120, render: statusTag },
      { title: 'Validation', dataIndex: 'validationStatus', width: 120, render: validationTag },
      { title: 'Dry Run', dataIndex: 'dryRun', width: 90, render: (v: boolean) => (v ? 'Yes' : 'No') },
      { title: 'Qty', dataIndex: 'totalQtySales', align: 'right', width: 100, render: formatInt },
      { title: 'Net Sales', dataIndex: 'totalNetSales', align: 'right', width: 120, render: formatMoney },
      { title: 'Profit', dataIndex: 'totalProfit', align: 'right', width: 120, render: formatMoney },
      { title: 'Snapshots', dataIndex: 'snapshotsScanned', align: 'right', width: 110, render: formatInt },
      { title: 'MTD Cells Reset', dataIndex: 'salesCellsReset', align: 'right', width: 130, render: formatInt },
      { title: 'Mismatch Cells', dataIndex: 'salesCellMismatchCount', align: 'right', width: 130, render: formatInt },
      { title: 'Started', dataIndex: 'startedAt', width: 170, render: formatDateTime },
      { title: 'Closed By', dataIndex: 'closedBy', width: 150 },
      {
        title: 'Error',
        dataIndex: 'errorText',
        width: 220,
        ellipsis: true,
        render: (value: string | null) => value || '-',
      },
    ],
    [],
  )

  const weekRunColumns = useMemo<TableColumnsType<InventoryWeekCloseRun>>(
    () => [
      { title: 'Week Ending', dataIndex: 'weekEndingDate', fixed: 'left', width: 130 },
      { title: 'Status', dataIndex: 'status', width: 120, render: statusTag },
      { title: 'Validation', dataIndex: 'validationStatus', width: 120, render: validationTag },
      { title: 'Dry Run', dataIndex: 'dryRun', width: 90, render: (v: boolean) => (v ? 'Yes' : 'No') },
      { title: 'Qty', dataIndex: 'totalWeekQtySales', align: 'right', width: 100, render: formatInt },
      { title: 'Net Sales', dataIndex: 'totalWeekNetSales', align: 'right', width: 120, render: formatMoney },
      { title: 'Profit', dataIndex: 'totalWeekProfit', align: 'right', width: 120, render: formatMoney },
      { title: 'Snapshots', dataIndex: 'snapshotsScanned', align: 'right', width: 110, render: formatInt },
      { title: 'Trend Rows', dataIndex: 'trendRowsWritten', align: 'right', width: 120, render: formatInt },
      { title: 'Mismatch Rows', dataIndex: 'weekSalesMismatchCount', align: 'right', width: 130, render: formatInt },
      { title: 'Started', dataIndex: 'startedAt', width: 170, render: formatDateTime },
      { title: 'Closed By', dataIndex: 'closedBy', width: 150 },
      {
        title: 'Error',
        dataIndex: 'errorText',
        width: 220,
        ellipsis: true,
        render: (value: string | null) => value || '-',
      },
    ],
    [],
  )

  const historyTabs = useMemo(
    () => [
      {
        key: 'month',
        label: 'Month Runs',
        children: (
          <Table
            rowKey="id"
            size="small"
            loading={loadingSummary}
            columns={monthRunColumns}
            dataSource={summary?.monthRuns ?? []}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 1580 }}
          />
        ),
      },
      {
        key: 'week',
        label: 'Week Runs',
        children: (
          <Table
            rowKey="id"
            size="small"
            loading={loadingSummary}
            columns={weekRunColumns}
            dataSource={summary?.weekRuns ?? []}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 1580 }}
          />
        ),
      },
    ],
    [loadingSummary, monthRunColumns, summary?.monthRuns, summary?.weekRuns, weekRunColumns],
  )

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Flex align="flex-start" justify="space-between" gap={12} wrap="wrap">
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              <CalendarOutlined /> Inventory Close
            </Typography.Title>
            <Typography.Text type="secondary">
              Weekly trend close and monthly RICS-compatible history close.
            </Typography.Text>
          </div>
          <Space>
            <Tooltip title="Refresh history">
              <Button icon={<ReloadOutlined />} onClick={loadSummary} loading={loadingSummary} />
            </Tooltip>
            <InlinePageHelp entry={inventoryCloseHelp} mode="popover" />
          </Space>
        </Flex>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <CalendarOutlined />
                Month Close
              </Space>
            }
            extra={latestClosedMonth ? <Tag color="green">Last {latestClosedMonth.yearMonth}</Tag> : <Tag>No closes</Tag>}
          >
            <Form layout="vertical">
              <Form.Item label="Close month" style={{ maxWidth: 220 }}>
                <Input value={month} onChange={(event) => setMonth(event.target.value)} placeholder="YYYY-MM" />
              </Form.Item>
              <Space wrap>
                <Button
                  icon={<ExperimentOutlined />}
                  onClick={() => runMonthClose(true)}
                  loading={running === 'month-dry-run'}
                >
                  Dry Run
                </Button>
                <Button
                  danger
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={confirmMonthClose}
                  loading={running === 'month-close'}
                >
                  Run Close
                </Button>
              </Space>
            </Form>
            <Alert
              style={{ marginTop: 16 }}
              type="info"
              showIcon
              message="Month close writes inventory history month slots, resets monthly inventory counters, and resets MTD size-cell sales."
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined />
                Week Close
              </Space>
            }
            extra={latestClosedWeek?.weekEndingDate ? <Tag color="green">Last {latestClosedWeek.weekEndingDate}</Tag> : <Tag>No closes</Tag>}
          >
            <Form layout="vertical">
              <Form.Item label="Week ending date" style={{ maxWidth: 240 }}>
                <DatePicker
                  value={weekEnding}
                  onChange={setWeekEnding}
                  format="YYYY-MM-DD"
                  style={{ width: '100%' }}
                  allowClear={false}
                />
              </Form.Item>
              <Space wrap>
                <Button
                  icon={<ExperimentOutlined />}
                  onClick={() => runWeekClose(true)}
                  loading={running === 'week-dry-run'}
                >
                  Dry Run
                </Button>
                <Button
                  danger
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={confirmWeekClose}
                  loading={running === 'week-close'}
                >
                  Run Close
                </Button>
              </Space>
            </Form>
            <Alert
              style={{ marginTop: 16 }}
              type="info"
              showIcon
              message="Week close rotates the 8-week trend projection and resets current-week inventory sales counters."
            />
          </Card>
        </Col>
      </Row>

      <ResultPanel kind={lastKind} result={lastResult} />

      <Card
        title="Run History"
        extra={
          <Button icon={<ReloadOutlined />} onClick={loadSummary} loading={loadingSummary}>
            Refresh
          </Button>
        }
      >
        <Tabs items={historyTabs} />
      </Card>
    </Space>
  )
}
