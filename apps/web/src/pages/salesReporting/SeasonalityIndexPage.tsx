import { useMemo, useState } from 'react'
import { Button, Input, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useSearchParams } from 'react-router-dom'
import ReportHeader from '../../components/reports/ReportHeader'
import { useSeasonalityIndex } from '../../hooks/useReports'
import type { DepartmentSeasonalityRow, SeasonalityMonth } from '../../services/reportApi'
import {
  salesReportColumnGroup,
  salesReportTableClassName,
} from '../../components/reports/salesReportTableZones'

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function monthCell(month: SeasonalityMonth) {
  const color = month.index >= 1.15 ? 'green' : month.index <= 0.85 ? 'orange' : 'default'
  return (
    <Tooltip title={`${formatNumber(month.rawSalesQty)} units sold`}>
      <Space direction="vertical" size={0} style={{ lineHeight: 1.2 }}>
        <Tag color={color} style={{ margin: 0 }}>{month.index.toFixed(2)}</Tag>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {formatNumber(month.rawSalesQty)}
        </Typography.Text>
      </Space>
    </Tooltip>
  )
}

export default function SeasonalityIndexPage() {
  const [params, setParams] = useSearchParams()
  const initialDepartment = Number(params.get('department'))
  const [endMonth, setEndMonth] = useState(params.get('endMonth') ?? currentYearMonth())
  const [department, setDepartment] = useState<number | undefined>(
    Number.isInteger(initialDepartment) && initialDepartment > 0 ? initialDepartment : undefined,
  )

  const query = useMemo(() => ({ endMonth, department }), [department, endMonth])
  const { data, isFetching, error } = useSeasonalityIndex(query)

  const columns = useMemo<ColumnsType<DepartmentSeasonalityRow>>(() => {
    const monthColumns: ColumnsType<DepartmentSeasonalityRow> = (data?.rows[0]?.months ?? []).map((month, index) => ({
      title: month.label,
      key: `month-${month.month}`,
      width: 82,
      align: 'right' as const,
      render: (_, row) => monthCell(row.months[index] ?? { ...month, rawSalesQty: 0, index: 1 }),
    }))
    const baseColumns: ColumnsType<DepartmentSeasonalityRow> = [
      {
        title: 'Department',
        dataIndex: 'departmentLabel',
        key: 'departmentLabel',
        fixed: 'left',
        width: 260,
      },
      {
        title: 'Total units',
        dataIndex: 'totalSalesQty',
        key: 'totalSalesQty',
        width: 110,
        align: 'right',
        render: (value: number) => formatNumber(value),
        sorter: (a, b) => a.totalSalesQty - b.totalSalesQty,
      },
      {
        title: 'Avg/mo',
        dataIndex: 'averageMonthlyQty',
        key: 'averageMonthlyQty',
        width: 100,
        align: 'right',
        render: (value: number) => formatNumber(value, 1),
        sorter: (a, b) => a.averageMonthlyQty - b.averageMonthlyQty,
      },
      ...monthColumns,
    ]
    return [
      salesReportColumnGroup('identity', baseColumns.slice(0, 1), { title: 'Department' }),
      salesReportColumnGroup('performance', baseColumns.slice(1, 3), { boundary: true, title: 'Summary' }),
      salesReportColumnGroup('sales', monthColumns, { boundary: true, title: 'Monthly Index' }),
    ]
  }, [data?.rows])

  const departmentOptions = useMemo(
    () => (data?.rows ?? []).map((row) => ({
      label: row.departmentLabel,
      value: row.departmentNumber,
    })),
    [data?.rows],
  )

  function run() {
    const next = new URLSearchParams()
    if (endMonth) next.set('endMonth', endMonth)
    if (department != null) next.set('department', String(department))
    setParams(next, { replace: true })
  }

  return (
    <div>
      <ReportHeader
        title="Seasonality Index"
        description="Department-level monthly sales weights across all stores. Index 1.00 is the department's average month."
        breadcrumb={[{ title: 'Reports' }, { title: 'Sales' }, { title: 'Seasonality Index' }]}
        showCurrencyNote={false}
      />

      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          aria-label="End month"
          value={endMonth}
          onChange={(event) => setEndMonth(event.target.value)}
          style={{ width: 120 }}
          placeholder="YYYY-MM"
        />
        <Select
          allowClear
          showSearch
          aria-label="Department"
          placeholder="All departments"
          value={department}
          onChange={(value) => setDepartment(typeof value === 'number' ? value : undefined)}
          options={departmentOptions}
          optionFilterProp="label"
          style={{ width: 320 }}
        />
        <Button type="primary" onClick={run}>Run</Button>
        {data && (
          <Typography.Text type="secondary">
            {data.historyStartMonth} to {data.historyEndMonth}
          </Typography.Text>
        )}
      </Space>

      <Table
        className={salesReportTableClassName()}
        size="small"
        rowKey="departmentNumber"
        loading={isFetching}
        columns={columns}
        dataSource={data?.rows ?? []}
        pagination={{ pageSize: 25, showSizeChanger: true }}
        scroll={{ x: 1380 }}
        locale={{ emptyText: error ? (error as Error).message : 'No seasonality rows' }}
      />
    </div>
  )
}
