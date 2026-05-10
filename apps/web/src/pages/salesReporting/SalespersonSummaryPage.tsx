import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Button, Checkbox, Drawer, Form, Input, InputNumber, Select, Space, Table, Typography, Spin, Switch, message,
} from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSalesDimensions, useSalespersonSummary, type SalespersonSummaryArgs } from '../../hooks/useReports'
import { manualReportQueryKey, useManualReportRun } from '../../hooks/useManualReportRun'
import type {
  SalespersonSummaryRow,
  SalespersonSubtotalBy,
  CashierRow,
} from '../../services/reportApi'
import { getErrorMessage } from '../../utils/errors'
import RunReportControls from './RunReportControls'
import SaveAsTemplateButton from '../../components/reports/SaveAsTemplateButton'
import SaveSnapshotButton from '../../components/reports/SaveSnapshotButton'
import DateRangeControl from '../../components/reports/DateRangeControl'
import ReportHeader from '../../components/reports/ReportHeader'
import FilterChips from '../../components/reports/FilterChips'
import ReportEmptyState from '../../components/reports/ReportEmptyState'
import CollapsibleFilterCard from '../../components/reports/CollapsibleFilterCard'
import ShareBar from '../../components/reports/ShareBar'
import { fmtMoney, fmtInt } from '../../utils/reportFormatters'
import { useReportTemplate, useTouchReportTemplate } from '../../hooks/useReportTemplates'
import { briefDateSpec, readDateSpecFromParams, resolveDateSpec, type DateSpec } from '../../utils/dateSpec'
import {
  ReportCriteriaPanel,
  hydrateReportCriteria,
  useReportCriteria,
} from '../../components/reports/ReportCriteriaPanel'
import {
  fetchRicsSalesperson,
  updateRicsSalesperson,
  type RicsSalesperson,
} from '../../services/employeeApi'

// Salesperson summary defaults to a 30-day trailing window (matches the
// pre-DateSpec default); templates saved with this default replay a fresh
// 30-day window every time.
const DEFAULT_DATE_SPEC: DateSpec = { type: 'trailing_days', days: 30 }

export default function SalespersonSummaryPage() {
  const qc = useQueryClient()
  const [messageApi, messageContext] = message.useMessage()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('templateId') ?? undefined
  const [dateSpec, setDateSpec] = useState<DateSpec>(DEFAULT_DATE_SPEC)
  const { criteria, setCriteria, updateCriteria, compactCriteria } = useReportCriteria()
  const [subtotalBy, setSubtotalBy] = useState<SalespersonSubtotalBy | undefined>(undefined)
  const [combineStores, setCombineStores] = useState(true)
  const [cashierSummary, setCashierSummary] = useState(false)
  const [filterOpen, setFilterOpen] = useState(true)
  const { run: reportRun, query, commitRun } = useManualReportRun<SalespersonSummaryArgs>({
    storageKey: 'manual-report-run:/reports/others/salesperson-summary:v1',
    queryKeyBase: 'salesperson-summary',
    hydrateArgs: hydrateRunArgs,
  })
  const [employeeDrawerOpen, setEmployeeDrawerOpen] = useState(false)
  const [employeeLoading, setEmployeeLoading] = useState(false)
  const [employeeSaving, setEmployeeSaving] = useState(false)
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState<string | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<RicsSalesperson | null>(null)
  const [employeeForm] = Form.useForm()

  const { data, isFetching, error } = useSalespersonSummary(reportRun)
  const { data: dimensions, isLoading: dimensionsLoading } = useSalesDimensions()
  const running = query != null && isFetching

  useEffect(() => {
    if (query && data && !isFetching) setFilterOpen(false)
  }, [query, data, isFetching])

  // ?templateId=... replay.
  const { data: templateData } = useReportTemplate(templateId)
  const touchTemplate = useTouchReportTemplate()
  const hydratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (reportRun) return
    if (!templateId || !templateData) return
    if (hydratedFor.current === templateId) return
    const t = templateData.template
    if (t.reportType !== 'salesperson-summary') return
    hydratedFor.current = templateId
    const p = t.paramsJson as Partial<SalespersonSummaryArgs> & { storesText?: string }
    const spec = readDateSpecFromParams(t.paramsJson) ?? DEFAULT_DATE_SPEC
    const { startDate, endDate } = resolveDateSpec(spec)
    setDateSpec(spec)
    setCriteria(hydrateReportCriteria({
      ...p,
      storesRaw: p.storesText ?? p.storesRaw,
      stores: Array.isArray(p.stores) ? p.stores : undefined,
    }))
    setSubtotalBy(p.subtotalBy)
    if (p.combineStores !== undefined) setCombineStores(!!p.combineStores)
    if (p.cashierSummary !== undefined) setCashierSummary(!!p.cashierSummary)
    commitRun({
      startDate,
      endDate,
      ...p,
      subtotalBy: p.subtotalBy,
      combineStores: p.combineStores ?? true,
      cashierSummary: !!p.cashierSummary,
    })
    touchTemplate.mutate(templateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templateData, reportRun])

  function hydrateRunArgs(args: SalespersonSummaryArgs): void {
    setDateSpec({ type: 'fixed', startDate: args.startDate, endDate: args.endDate })
    setCriteria(hydrateReportCriteria(args))
    setSubtotalBy(args.subtotalBy)
    if (args.combineStores !== undefined) setCombineStores(!!args.combineStores)
    setCashierSummary(!!args.cashierSummary)
  }

  function onRun(): void {
    const { startDate, endDate } = resolveDateSpec(dateSpec)
    commitRun({
      startDate,
      endDate,
      ...compactCriteria,
      subtotalBy,
      combineStores,
      cashierSummary,
    })
  }
  function onStop(): void {
    qc.cancelQueries({ queryKey: manualReportQueryKey('salesperson-summary', reportRun) })
  }

  async function openEmployee(code: string): Promise<void> {
    setSelectedEmployeeCode(code)
    setEmployeeDrawerOpen(true)
    setEmployeeLoading(true)
    try {
      const employee = await fetchRicsSalesperson(code)
      setSelectedEmployee(employee)
      employeeForm.setFieldsValue(employee)
    } catch (err) {
      messageApi.error(getErrorMessage(err))
    } finally {
      setEmployeeLoading(false)
    }
  }

  async function saveEmployee(): Promise<void> {
    if (!selectedEmployeeCode) return
    const values = await employeeForm.validateFields()
    setEmployeeSaving(true)
    try {
      const employee = await updateRicsSalesperson(selectedEmployeeCode, {
        displayName: values.displayName,
        active: values.active,
        otherInformation: values.otherInformation ?? null,
        commissionRate: values.commissionRate ?? null,
        commissionBase: values.commissionBase,
        timeClockEnabled: values.timeClockEnabled,
        timeClockAdmin: values.timeClockAdmin,
        timeClockFullUser: values.timeClockFullUser,
      })
      setSelectedEmployee(employee)
      employeeForm.setFieldsValue(employee)
      await qc.invalidateQueries({ queryKey: ['salesperson-summary'] })
      messageApi.success('Salesperson saved')
    } catch (err) {
      messageApi.error(getErrorMessage(err))
    } finally {
      setEmployeeSaving(false)
    }
  }

  // Max $ across the visible salespeople — powers the contribution bar.
  const maxSalespersonDollars = useMemo(() => {
    if (!data?.salespeople?.length) return 0
    return data.salespeople.reduce((m, r) => Math.max(m, r.dollars ?? 0), 0)
  }, [data])

  const maxCashierDollars = useMemo(() => {
    if (!data?.cashierSummary?.length) return 0
    return data.cashierSummary.reduce((m, r) => Math.max(m, r.dollars ?? 0), 0)
  }, [data])

  const spColumns = [
    { title: 'Code', dataIndex: 'salespersonCode', key: 'salespersonCode', width: 120 },
    {
      title: 'Name',
      dataIndex: 'salespersonName',
      key: 'salespersonName',
      width: 220,
      render: (v: string | null, record: SalespersonSummaryRow) => (
        record.salespersonCode === '(unknown)' ? (
          v ?? '—'
        ) : (
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: 'auto' }}
            onClick={() => void openEmployee(record.salespersonCode)}
          >
            {v ?? record.salespersonCode}
          </Button>
        )
      ),
    },
    { title: 'Store', dataIndex: 'storeNumber', key: 'storeNumber', width: 80 },
    {
      title: 'Qty', dataIndex: 'qty', key: 'qty', width: 90, align: 'right' as const,
      render: (v: number) => fmtInt(v),
      sorter: (a: SalespersonSummaryRow, b: SalespersonSummaryRow) => a.qty - b.qty,
    },
    {
      title: 'Dollars', dataIndex: 'dollars', key: 'dollars', width: 200,
      align: 'right' as const,
      render: (v: number) => (
        <ShareBar value={v} max={maxSalespersonDollars} label={fmtMoney(v)} />
      ),
      sorter: (a: SalespersonSummaryRow, b: SalespersonSummaryRow) => a.dollars - b.dollars,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Perks', dataIndex: 'perks', key: 'perks', width: 120,
      align: 'right' as const, render: (v: number) => fmtMoney(v),
      sorter: (a: SalespersonSummaryRow, b: SalespersonSummaryRow) => a.perks - b.perks,
    },
  ]

  const cashierColumns = [
    { title: 'Code', dataIndex: 'cashierCode', key: 'cashierCode', width: 120 },
    { title: 'Name', dataIndex: 'cashierName', key: 'cashierName', width: 200, render: (v: string | null) => v ?? '—' },
    { title: 'Store', dataIndex: 'storeNumber', key: 'storeNumber', width: 80 },
    {
      title: 'Tickets', dataIndex: 'tickets', key: 'tickets', width: 100, align: 'right' as const,
      render: (v: number) => fmtInt(v),
      sorter: (a: CashierRow, b: CashierRow) => a.tickets - b.tickets,
    },
    {
      title: 'Dollars', dataIndex: 'dollars', key: 'dollars', width: 200,
      align: 'right' as const,
      render: (v: number) => (
        <ShareBar value={v} max={maxCashierDollars} label={fmtMoney(v)} color="#722ed1" />
      ),
      sorter: (a: CashierRow, b: CashierRow) => a.dollars - b.dollars,
      defaultSortOrder: 'descend' as const,
    },
  ]

  return (
    <div>
      {messageContext}
      <ReportHeader
        title="Salesperson Summary"
        description="Quantity, dollars, and perks per salesperson with optional subtotal breakdown."
        citation="RICS Ch. 2 p. 42"
        breadcrumb={[
          { title: <Link to="/reports/others">Other Reports</Link> },
          { title: 'Salesperson Summary' },
        ]}
      />

      <CollapsibleFilterCard
        open={filterOpen}
        onOpenChange={setFilterOpen}
        running={running}
        onRun={onRun}
        actions={
          <RunReportControls running={running} hasRun={query != null} onRun={onRun} onStop={onStop} />
        }
        persistentActions={
          <>
            <SaveAsTemplateButton
              reportType="salesperson-summary"
              disabled={query == null}
              getParamsJson={() => ({
                dateSpec,
                ...compactCriteria,
                subtotalBy,
                combineStores,
                cashierSummary,
              })}
            />
            <SaveSnapshotButton
              reportType="salesperson-summary"
              disabled={query == null || !data}
              sourceTemplateId={templateId}
              getParamsJson={() => ({
                dateSpec,
                ...compactCriteria,
                subtotalBy,
                combineStores,
                cashierSummary,
              })}
              getResultJson={() => data}
              getDescriptor={() => {
                const parts: string[] = [
                  cashierSummary ? 'Cashier summary' : 'Salesperson summary',
                ]
                if (subtotalBy) {
                  parts.push(`subtotal: ${subtotalBy === 'DEPARTMENT' ? 'Department' : 'Vendor'}`)
                }
                const stores = compactCriteria.stores
                if (stores && stores.length) {
                  parts.push(
                    stores.length <= 3
                      ? `stores ${stores.join(',')}`
                      : `${stores.length} stores`,
                  )
                }
                if (combineStores) parts.push('combined')
                parts.push(briefDateSpec(dateSpec))
                return parts.join(' · ')
              }}
            />
          </>
        }
      >
        <Space wrap>
          <DateRangeControl value={dateSpec} onChange={setDateSpec} />
          <Select
            allowClear
            value={subtotalBy}
            onChange={(v) => setSubtotalBy(v)}
            placeholder="Subtotal by..."
            style={{ width: 180 }}
            options={[
              { value: 'DEPARTMENT', label: 'Subtotal by category' },
              { value: 'VENDOR', label: 'Subtotal by vendor' },
            ]}
          />
          <Checkbox checked={combineStores} onChange={(e) => setCombineStores(e.target.checked)}>
            Combine stores
          </Checkbox>
          <Checkbox checked={cashierSummary} onChange={(e) => setCashierSummary(e.target.checked)}>
            Cashier summary
          </Checkbox>
        </Space>
        <ReportCriteriaPanel
          value={criteria}
          onChange={updateCriteria}
          dimensions={dimensions}
          loading={dimensionsLoading}
        />
      </CollapsibleFilterCard>

      {error && (
        <Alert
          type="error"
          message="Failed to load report"
          description={getErrorMessage(error)}
          style={{ marginBottom: 16 }}
        />
      )}

      {!query ? (
        <ReportEmptyState
          reason="idle"
          message="Pick a date range, then click Run Report."
        />
      ) : running ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="Querying RICS databases…" />
        </div>
      ) : data ? (
        <>
          <FilterChips
            chips={[
              { label: 'Period', value: `${query.startDate} → ${query.endDate}` },
              query.stores?.length
                ? { label: 'Stores', value: query.stores.join(', ') }
                : { label: 'Stores', value: query.storesRaw ?? 'All' },
              query.combineStores === false ? { label: 'Separate', value: 'per store' } : null,
              query.subtotalBy
                ? { label: 'Subtotal', value: query.subtotalBy === 'VENDOR' ? 'by vendor' : 'by category' }
                : null,
              query.cashierSummary ? { label: 'Extra', value: 'Cashier summary' } : null,
            ]}
          />
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 8 }}>Salespeople</Typography.Title>
          <Table<SalespersonSummaryRow>
            dataSource={data.salespeople}
            columns={spColumns}
            rowKey={(r) => `${r.salespersonCode}|${r.storeNumber}`}
            size="small"
            pagination={{ pageSize: 25 }}
            rowClassName={(_r, i) => (i % 2 === 1 ? 'report-zebra-row' : '')}
            style={{ marginBottom: 16 }}
            expandable={
              query.subtotalBy
                ? {
                    expandedRowRender: (record) =>
                      record.subtotals.length ? (
                        <Table
                          dataSource={record.subtotals}
                          columns={[
                            { title: 'Key', dataIndex: 'key', width: 150 },
                            { title: query.subtotalBy === 'VENDOR' ? 'Vendor' : 'Category', dataIndex: 'label', width: 260 },
                            {
                              title: 'Qty', dataIndex: 'qty', align: 'right' as const, width: 100,
                              render: (v: number) => fmtInt(v),
                            },
                            {
                              title: 'Dollars', dataIndex: 'dollars',
                              align: 'right' as const, render: (v: number) => fmtMoney(v),
                            },
                          ]}
                          rowKey="key"
                          pagination={false}
                          size="small"
                        />
                      ) : (
                        <Typography.Text type="secondary">No subtotals</Typography.Text>
                      ),
                  }
                : undefined
            }
          />
          {query.cashierSummary && data.cashierSummary && (
            <>
              <Typography.Title level={4} style={{ marginTop: 24, marginBottom: 8 }}>Cashier Summary</Typography.Title>
              <Table<CashierRow>
                dataSource={data.cashierSummary}
                columns={cashierColumns}
                rowKey={(r) => `${r.cashierCode}|${r.storeNumber}`}
                size="small"
                pagination={{ pageSize: 25 }}
                rowClassName={(_r, i) => (i % 2 === 1 ? 'report-zebra-row' : '')}
              />
            </>
          )}
          <Drawer
            title={selectedEmployee ? `${selectedEmployee.salespersonCode} - ${selectedEmployee.displayName}` : 'Salesperson'}
            open={employeeDrawerOpen}
            width={440}
            onClose={() => setEmployeeDrawerOpen(false)}
            extra={
              <Space>
                <Button onClick={() => setEmployeeDrawerOpen(false)}>Close</Button>
                <Button type="primary" loading={employeeSaving} onClick={() => void saveEmployee()}>
                  Save
                </Button>
              </Space>
            }
          >
            <Spin spinning={employeeLoading}>
              <Form form={employeeForm} layout="vertical">
                <Form.Item label="Code" name="salespersonCode">
                  <Input disabled />
                </Form.Item>
                <Form.Item
                  label="Name"
                  name="displayName"
                  rules={[{ required: true, message: 'Name is required' }]}
                >
                  <Input />
                </Form.Item>
                <Form.Item label="Active" name="active" valuePropName="checked">
                  <Switch />
                </Form.Item>
                <Form.Item label="Other information" name="otherInformation">
                  <Input.TextArea rows={3} />
                </Form.Item>
                <Form.Item label="Commission rate" name="commissionRate">
                  <InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item label="Commission base" name="commissionBase">
                  <Select
                    options={[
                      { value: 'NET_SALES', label: 'Net sales' },
                      { value: 'GROSS_PROFIT', label: 'Gross profit' },
                    ]}
                  />
                </Form.Item>
                <Space size="large" wrap>
                  <Form.Item label="Time clock" name="timeClockEnabled" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Form.Item label="Clock admin" name="timeClockAdmin" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Form.Item label="Full user" name="timeClockFullUser" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Space>
                {selectedEmployee && (
                  <Space direction="vertical" size={2}>
                    <Typography.Text type="secondary">
                      Time clock PIN: {selectedEmployee.hasTimeClockPin ? 'Imported' : 'None'}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      Legacy cashier PIN: {selectedEmployee.hasLegacyCashierPin ? 'Imported' : 'None'}
                    </Typography.Text>
                  </Space>
                )}
              </Form>
            </Spin>
          </Drawer>
        </>
      ) : null}
    </div>
  )
}
