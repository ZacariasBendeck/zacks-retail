import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Flex,
  Input,
  Row,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  migrationDayApi,
  type MigrationActionConfig,
  type MigrationActionDefinition,
  type MigrationDefinition,
  type MigrationJobSnapshot,
  type MigrationJobStatus,
} from '../../services/migrationDayApi'

const { Text, Title } = Typography

const STORAGE_KEY = 'zacks-retail:migration-day-console'

const DEFAULT_CONFIG: MigrationActionConfig = {
  mdbDir: 'E:/data/rics-mdbs',
  bundleDir: 'E:/data/render-conversion/current',
  strictFull: true,
}

interface StoredConsoleState {
  config?: MigrationActionConfig
  manualUploadComplete?: boolean
  operatorChecks?: OperatorChecks
}

interface OperatorChecks {
  skuLookup: boolean
  stockInquiry: boolean
  customerLookup: boolean
  posScan: boolean
  reportsOpen: boolean
}

interface SequenceStep {
  key: string
  title: string
  detail: string
  actionId?: string
  manualKind?: 'upload' | 'operator-checks'
}

interface NotImportedMdbFile {
  file: string
  path: string
  sizeBytes: number
  modifiedAt: string
  reason: string
}

interface MdbFolderCheckResult {
  mdbDir: string
  requiredCount: number
  foundCount: number
  missingCount: number
  notImportedCount?: number
  extraMdbCount?: number
  notImported?: NotImportedMdbFile[]
  extraMdbFiles?: string[]
}

interface MdbTableCoverageRow {
  sourceMdbFile: string
  sourceTable: string
  totalColumns: number
  extractedColumns: number
  totalFields: number
  importedFields: number
  extractionStatus: 'included' | 'pending'
  migrationProcedureStatus: 'included_in_current_extraction' | 'pending_to_add'
  note: string
}

interface MdbTableCoverageReport {
  mdbDir: string
  fileCount: number
  filesScanned: number
  tableCount: number
  includedTableCount: number
  pendingTableCount: number
  totalColumns: number
  extractedColumns: number
  pendingColumns: number
  totalFields: number
  importedFields: number
  pendingFields: number
  tables: MdbTableCoverageRow[]
}

const DEFAULT_OPERATOR_CHECKS: OperatorChecks = {
  skuLookup: false,
  stockInquiry: false,
  customerLookup: false,
  posScan: false,
  reportsOpen: false,
}

const MANUAL_STEP_DETAILS: Record<string, Omit<SequenceStep, 'key'>> = {
  'manual-upload': {
    title: 'Upload bundle to Render',
    detail: 'Manual step. Copy the completed bundle folder to the Render run environment before loading.',
    manualKind: 'upload',
  },
  'manual-operator-spot-checks': {
    title: 'Operator spot checks',
    detail: 'Manual step. Verify that operators can complete the core workflows after the load.',
    manualKind: 'operator-checks',
  },
}

const ACTION_STEP_TITLES: Record<string, string> = {
  'check-mdb-folder': 'Check MDB source folder',
  'check-mdb-table-coverage': 'Check MDB table coverage',
  'check-preflight': 'Check current data',
  'export-bundle': 'Export conversion bundle',
  'check-bundle': 'Check extracted bundle',
  'load-bundle': 'Load bundle into Postgres',
  'post-load-checks': 'Run post-load checks',
}

function readStoredState(): StoredConsoleState {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as StoredConsoleState : {}
  } catch {
    return {}
  }
}

function cleanConfig(config: MigrationActionConfig): MigrationActionConfig {
  return {
    mdbDir: cleanText(config.mdbDir),
    bundleDir: cleanText(config.bundleDir),
    customerCsvPath: cleanText(config.customerCsvPath),
    mailListNamesCsvPath: cleanText(config.mailListNamesCsvPath),
    ticketHeaderCsvPath: cleanText(config.ticketHeaderCsvPath),
    ticketDetailCsvPath: cleanText(config.ticketDetailCsvPath),
    inventoryHistoryAsOf: cleanText(config.inventoryHistoryAsOf),
    skipInventoryHistory: config.skipInventoryHistory === true,
    skipCustomers: config.skipCustomers === true,
    skipCustomerTransactions: config.skipCustomerTransactions === true,
    skipSegmentationDefaults: config.skipSegmentationDefaults === true,
    strictFull: config.strictFull === true,
  }
}

function cleanText(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function isRunning(status: MigrationJobStatus | undefined): boolean {
  return status === 'queued' || status === 'running'
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '-'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return '-'
  if (value < 1024) return `${value} B`
  const kb = value / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

function getMdbFolderReport(result: unknown): MdbFolderCheckResult | null {
  if (!result || typeof result !== 'object') return null
  const candidate = result as Partial<MdbFolderCheckResult>
  if (typeof candidate.mdbDir !== 'string') return null
  if (typeof candidate.requiredCount !== 'number') return null
  return candidate as MdbFolderCheckResult
}

function getMdbTableCoverageReport(result: unknown): MdbTableCoverageReport | null {
  if (!result || typeof result !== 'object') return null
  const candidate = result as Partial<MdbTableCoverageReport>
  if (typeof candidate.mdbDir !== 'string') return null
  if (!Array.isArray(candidate.tables)) return null
  return candidate as MdbTableCoverageReport
}

function statusTag(job: MigrationJobSnapshot | undefined) {
  if (!job) return <Tag>Not run</Tag>
  if (job.status === 'succeeded') return <Tag color="green">Succeeded</Tag>
  if (job.status === 'failed') return <Tag color="red">Failed</Tag>
  if (job.status === 'running') return <Tag color="blue">Running</Tag>
  return <Tag color="gold">Queued</Tag>
}

function requirementTags(action: MigrationActionDefinition) {
  const tags: string[] = []
  if (action.requiresMdbDir) tags.push('MDB folder')
  if (action.requiresBundle) tags.push('bundle')
  if (action.requiresLegacyManifest) tags.push('legacy manifest')
  if (action.requiresAttributeSnapshot) tags.push('attribute snapshot')
  if (action.requiresCustomerFiles) tags.push('customer CSVs')
  if (action.requiresTicketFiles) tags.push('ticket CSVs')
  if (tags.length === 0) return <Tag>none</Tag>
  return (
    <Space size={[0, 4]} wrap>
      {tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
    </Space>
  )
}

function actionCanStart(action: MigrationActionDefinition, config: MigrationActionConfig, anyJobRunning: boolean): boolean {
  if (anyJobRunning) return false
  if (action.requiresMdbDir && !cleanText(config.mdbDir)) return false
  if (action.requiresBundle && !cleanText(config.bundleDir)) return false
  return true
}

export default function MigrationDayConsolePage() {
  const stored = readStoredState()
  const [definition, setDefinition] = useState<MigrationDefinition | null>(null)
  const [config, setConfig] = useState<MigrationActionConfig>(() => ({ ...DEFAULT_CONFIG, ...(stored.config ?? {}) }))
  const [manualUploadComplete, setManualUploadComplete] = useState(() => stored.manualUploadComplete === true)
  const [operatorChecks, setOperatorChecks] = useState<OperatorChecks>(() => ({
    ...DEFAULT_OPERATOR_CHECKS,
    ...(stored.operatorChecks ?? {}),
  }))
  const [jobs, setJobs] = useState<Record<string, MigrationJobSnapshot>>({})
  const [jobIdsByAction, setJobIdsByAction] = useState<Record<string, string>>({})
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [loadingDefinition, setLoadingDefinition] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoadingDefinition(true)
    migrationDayApi.getDefinition()
      .then((nextDefinition) => {
        if (!cancelled) {
          setDefinition(nextDefinition)
          setPageError(null)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setPageError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setLoadingDefinition(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ config, manualUploadComplete, operatorChecks }))
  }, [config, manualUploadComplete, operatorChecks])

  useEffect(() => {
    const runningIds = Object.values(jobs)
      .filter((job) => isRunning(job.status))
      .map((job) => job.id)
    if (runningIds.length === 0) return

    const timer = window.setInterval(() => {
      void Promise.all(runningIds.map((id) => migrationDayApi.getJob(id)))
        .then((snapshots) => {
          setJobs((current) => {
            const next = { ...current }
            for (const snapshot of snapshots) next[snapshot.id] = snapshot
            return next
          })
        })
        .catch((error: unknown) => setPageError(error instanceof Error ? error.message : String(error)))
    }, 1500)

    return () => window.clearInterval(timer)
  }, [jobs])

  const actions = definition?.actions ?? []
  const actionById = new Map(actions.map((action) => [action.id, action]))
  const anyJobRunning = Object.values(jobs).some((job) => isRunning(job.status))
  const allOperatorChecksComplete = Object.values(operatorChecks).every(Boolean)
  const sequenceSteps = (definition?.sequence ?? [])
    .map((key) => buildSequenceStep(key, actionById.get(key)))
    .filter((step): step is SequenceStep => step != null)
  const firstIncompleteIndex = sequenceSteps.findIndex((step) => !isStepComplete(step))
  const activeStepIndex = firstIncompleteIndex >= 0 ? firstIncompleteIndex : Math.max(sequenceSteps.length - 1, 0)
  const allStepsComplete = sequenceSteps.length > 0 && firstIncompleteIndex === -1
  const selectedJob = selectedJobId ? jobs[selectedJobId] : undefined

  function buildSequenceStep(key: string, action: MigrationActionDefinition | undefined): SequenceStep | null {
    const manual = MANUAL_STEP_DETAILS[key]
    if (manual) return { key, ...manual }
    if (!action) return null
    return {
      key,
      actionId: key,
      title: ACTION_STEP_TITLES[key] ?? action.label,
      detail: action.description,
    }
  }

  function getJobForAction(actionId: string): MigrationJobSnapshot | undefined {
    const jobId = jobIdsByAction[actionId]
    return jobId ? jobs[jobId] : undefined
  }

  function isStepComplete(step: SequenceStep): boolean {
    if (step.manualKind === 'upload') return manualUploadComplete
    if (step.manualKind === 'operator-checks') return allOperatorChecksComplete
    if (!step.actionId) return false
    return getJobForAction(step.actionId)?.status === 'succeeded'
  }

  function sequenceStepStatus(step: SequenceStep, index: number) {
    if (isStepComplete(step)) return 'finish' as const
    const job = step.actionId ? getJobForAction(step.actionId) : undefined
    if (job?.status === 'failed') return 'error' as const
    if (index === activeStepIndex) return 'process' as const
    return 'wait' as const
  }

  function updateConfig(key: keyof MigrationActionConfig, value: string | boolean): void {
    setConfig((current) => ({ ...current, [key]: value }))
  }

  async function startAction(actionId: string): Promise<void> {
    if (anyJobRunning) {
      setPageError('Another migration job is already running. Wait for it to finish before starting the next one.')
      return
    }
    const action = actionById.get(actionId)
    if (!action) {
      setPageError(`Unknown migration action: ${actionId}`)
      return
    }
    if (!actionCanStart(action, config, anyJobRunning)) {
      setPageError('This action is missing a required folder setting. Check the MDB source folder and bundle directory.')
      return
    }
    try {
      setPageError(null)
      const job = await migrationDayApi.startJob(actionId, cleanConfig(config))
      setJobs((current) => ({ ...current, [job.id]: job }))
      setJobIdsByAction((current) => ({ ...current, [actionId]: job.id }))
      setSelectedJobId(job.id)
    } catch (error: unknown) {
      setPageError(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshSelectedJob(): Promise<void> {
    if (!selectedJobId) return
    try {
      const job = await migrationDayApi.getJob(selectedJobId)
      setJobs((current) => ({ ...current, [job.id]: job }))
    } catch (error: unknown) {
      setPageError(error instanceof Error ? error.message : String(error))
    }
  }

  function resetManualMarks(): void {
    setManualUploadComplete(false)
    setOperatorChecks(DEFAULT_OPERATOR_CHECKS)
  }

  const actionColumns: ColumnsType<MigrationActionDefinition> = [
    {
      title: 'Process',
      dataIndex: 'label',
      key: 'label',
      render: (_value, action) => (
        <Space direction="vertical" size={2}>
          <Text strong>{action.label}</Text>
          <Text type="secondary">{action.id}</Text>
        </Space>
      ),
    },
    {
      title: 'What it does',
      dataIndex: 'description',
      key: 'description',
      render: (value: string) => <Text>{value}</Text>,
    },
    {
      title: 'Needs',
      key: 'needs',
      width: 170,
      render: (_value, action) => requirementTags(action),
    },
    {
      title: 'Last run',
      key: 'lastRun',
      width: 150,
      render: (_value, action) => {
        const job = getJobForAction(action.id)
        return (
          <Space direction="vertical" size={2}>
            {statusTag(job)}
            <Text type="secondary">{job ? formatDuration(job.durationMs) : '-'}</Text>
          </Space>
        )
      },
    },
    {
      title: '',
      key: 'run',
      width: 130,
      render: (_value, action) => (
        <Button
          icon={<PlayCircleOutlined />}
          disabled={!actionCanStart(action, config, anyJobRunning)}
          onClick={() => { void startAction(action.id) }}
        >
          Run
        </Button>
      ),
    },
  ]

  const logText = selectedJob?.logs
    .map((line) => `[${formatTime(line.at)}] ${line.stream}> ${line.text}`)
    .join('\n')
  const resultText = selectedJob?.result ? JSON.stringify(selectedJob.result, null, 2) : ''
  const mdbFolderReport = selectedJob?.actionId === 'check-mdb-folder'
    ? getMdbFolderReport(selectedJob.result)
    : null
  const notImportedMdbs = mdbFolderReport?.notImported ?? []
  const mdbTableCoverageReport = selectedJob?.actionId === 'check-mdb-table-coverage'
    ? getMdbTableCoverageReport(selectedJob.result)
    : null

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Flex justify="space-between" align="flex-start" gap={16} wrap="wrap">
        <div>
          <Title level={2} style={{ marginBottom: 4 }}>Migration Day Console</Title>
          <Text type="secondary">
            Guided Render conversion runbook with step checks, script buttons, and live logs.
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => { void refreshSelectedJob() }} disabled={!selectedJobId}>
            Refresh log
          </Button>
          <Button onClick={resetManualMarks}>Reset manual marks</Button>
        </Space>
      </Flex>

      {pageError ? <Alert type="error" showIcon message={pageError} /> : null}
      {allStepsComplete ? (
        <Alert type="success" showIcon message="All guided migration-day steps are marked complete." />
      ) : null}

      <Card title="Run Configuration" loading={loadingDefinition}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="Use this console for rehearsals and cutover only."
            description="The MDB folder is the read-only RICS source. The bundle directory is the temporary output folder where the export writes the portable package: legacy CSVs, attribute snapshot, optional CRM files, and manifests. The bundle is what gets uploaded to Render and then loaded into Postgres."
          />
          <Row gutter={[16, 12]}>
            <Col xs={24} lg={12}>
              <Text strong>RICS MDB source folder</Text>
              <Input
                value={config.mdbDir}
                onChange={(event) => updateConfig('mdbDir', event.target.value)}
                placeholder="E:/data/rics-mdbs"
              />
            </Col>
            <Col xs={24} lg={12}>
              <Text strong>Bundle directory</Text>
              <Input
                value={config.bundleDir}
                onChange={(event) => updateConfig('bundleDir', event.target.value)}
                placeholder="E:/data/render-conversion/current"
              />
            </Col>
            <Col xs={24} lg={12}>
              <Text strong>Inventory history as-of date</Text>
              <Input
                value={config.inventoryHistoryAsOf}
                onChange={(event) => updateConfig('inventoryHistoryAsOf', event.target.value)}
                placeholder="YYYY-MM-DD, optional"
              />
            </Col>
            <Col xs={24} lg={12}>
              <Text strong>Customer.csv source path</Text>
              <Input
                value={config.customerCsvPath}
                onChange={(event) => updateConfig('customerCsvPath', event.target.value)}
                placeholder="Optional source copied into bundle"
              />
            </Col>
            <Col xs={24} lg={12}>
              <Text strong>MailListNames.csv source path</Text>
              <Input
                value={config.mailListNamesCsvPath}
                onChange={(event) => updateConfig('mailListNamesCsvPath', event.target.value)}
                placeholder="Optional source copied into bundle"
              />
            </Col>
            <Col xs={24} lg={12}>
              <Text strong>Ticket header CSV source path</Text>
              <Input
                value={config.ticketHeaderCsvPath}
                onChange={(event) => updateConfig('ticketHeaderCsvPath', event.target.value)}
                placeholder="Optional source copied into bundle"
              />
            </Col>
            <Col xs={24} lg={12}>
              <Text strong>Ticket detail CSV source path</Text>
              <Input
                value={config.ticketDetailCsvPath}
                onChange={(event) => updateConfig('ticketDetailCsvPath', event.target.value)}
                placeholder="Optional source copied into bundle"
              />
            </Col>
          </Row>
          <Space size={[16, 8]} wrap>
            <Checkbox
              checked={config.strictFull}
              onChange={(event) => updateConfig('strictFull', event.target.checked)}
            >
              Strict full load
            </Checkbox>
            <Checkbox
              checked={config.skipInventoryHistory}
              onChange={(event) => updateConfig('skipInventoryHistory', event.target.checked)}
            >
              Skip inventory history
            </Checkbox>
            <Checkbox checked={config.skipCustomers} onChange={(event) => updateConfig('skipCustomers', event.target.checked)}>
              Skip customers
            </Checkbox>
            <Checkbox
              checked={config.skipCustomerTransactions}
              onChange={(event) => updateConfig('skipCustomerTransactions', event.target.checked)}
            >
              Skip customer transactions
            </Checkbox>
            <Checkbox
              checked={config.skipSegmentationDefaults}
              onChange={(event) => updateConfig('skipSegmentationDefaults', event.target.checked)}
            >
              Skip segmentation defaults
            </Checkbox>
          </Space>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card title="Guided Migration-Day Steps">
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Steps
                direction="vertical"
                current={activeStepIndex}
                items={sequenceSteps.map((step, index) => ({
                  title: step.title,
                  description: step.detail,
                  status: sequenceStepStatus(step, index),
                }))}
              />
              <Divider style={{ margin: 0 }} />
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {sequenceSteps.map((step, index) => {
                  const action = step.actionId ? actionById.get(step.actionId) : undefined
                  const job = step.actionId ? getJobForAction(step.actionId) : undefined
                  const isFuture = index > activeStepIndex
                  const canRun = action ? actionCanStart(action, config, anyJobRunning) && !isFuture : !isFuture
                  return (
                    <Card key={step.key} size="small" type={index === activeStepIndex ? 'inner' : undefined}>
                      <Flex justify="space-between" align="center" gap={12} wrap="wrap">
                        <Space direction="vertical" size={2} style={{ maxWidth: 620 }}>
                          <Text strong>{index + 1}. {step.title}</Text>
                          <Text type="secondary">{step.detail}</Text>
                          {job ? (
                            <Text type="secondary">
                              Last run: {statusTag(job)} {formatDuration(job.durationMs)}
                            </Text>
                          ) : null}
                        </Space>
                        {step.manualKind === 'upload' ? (
                          <Button
                            icon={<CloudUploadOutlined />}
                            disabled={isFuture}
                            type={manualUploadComplete ? 'default' : 'primary'}
                            onClick={() => setManualUploadComplete(true)}
                          >
                            Mark uploaded
                          </Button>
                        ) : step.manualKind === 'operator-checks' ? (
                          <Tag color={allOperatorChecksComplete ? 'green' : 'gold'}>
                            {allOperatorChecksComplete ? 'Complete' : 'Checklist open'}
                          </Tag>
                        ) : step.actionId ? (
                          <Button
                            type={index === activeStepIndex ? 'primary' : 'default'}
                            icon={<PlayCircleOutlined />}
                            disabled={!canRun}
                            onClick={() => { void startAction(step.actionId ?? '') }}
                          >
                            {job?.status === 'succeeded' ? 'Run again' : 'Run'}
                          </Button>
                        ) : null}
                      </Flex>
                    </Card>
                  )
                })}
              </Space>
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={14}>
          <Card title="Job Log">
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Flex justify="space-between" align="center" gap={12} wrap="wrap">
                <Space>
                  <Text strong>{selectedJob?.actionLabel ?? 'No job selected'}</Text>
                  {statusTag(selectedJob)}
                </Space>
                {selectedJob ? (
                  <Text type="secondary">
                    Started {formatTime(selectedJob.startedAt)} | Duration {formatDuration(selectedJob.durationMs)}
                  </Text>
                ) : null}
              </Flex>
              {selectedJob?.error ? <Alert type="error" showIcon message={selectedJob.error} /> : null}
              <pre
                style={{
                  minHeight: 300,
                  maxHeight: 460,
                  overflow: 'auto',
                  padding: 16,
                  margin: 0,
                  borderRadius: 8,
                  background: '#0f172a',
                  color: '#dbeafe',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {logText || 'Start a migration action to see live output here.'}
              </pre>
              {mdbFolderReport ? (
                <Card size="small" title="MDB Folder Report">
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Space size={[8, 8]} wrap>
                      <Tag color="blue">Required {mdbFolderReport.requiredCount}</Tag>
                      <Tag color="green">Found {mdbFolderReport.foundCount}</Tag>
                      <Tag color={mdbFolderReport.missingCount > 0 ? 'red' : 'green'}>
                        Missing {mdbFolderReport.missingCount}
                      </Tag>
                      <Tag color={notImportedMdbs.length > 0 ? 'gold' : 'green'}>
                        Not imported {mdbFolderReport.notImportedCount ?? mdbFolderReport.extraMdbCount ?? notImportedMdbs.length}
                      </Tag>
                    </Space>
                    <Text type="secondary">
                      These MDBs exist in the source folder but are not in the canonical import allowlist used by the
                      conversion export.
                    </Text>
                    <Table<NotImportedMdbFile>
                      rowKey="path"
                      size="small"
                      pagination={{ pageSize: 10, showSizeChanger: false }}
                      dataSource={notImportedMdbs}
                      columns={[
                        {
                          title: 'MDB file',
                          dataIndex: 'file',
                          key: 'file',
                          render: (value: string) => <Text strong>{value}</Text>,
                        },
                        {
                          title: 'Why not imported',
                          dataIndex: 'reason',
                          key: 'reason',
                        },
                        {
                          title: 'Size',
                          dataIndex: 'sizeBytes',
                          key: 'sizeBytes',
                          width: 110,
                          render: (value: number) => formatBytes(value),
                        },
                        {
                          title: 'Modified',
                          dataIndex: 'modifiedAt',
                          key: 'modifiedAt',
                          width: 170,
                          render: (value: string) => formatDateTime(value),
                        },
                      ]}
                    />
                  </Space>
                </Card>
              ) : null}
              {mdbTableCoverageReport ? (
                <Card size="small" title="MDB Table Coverage Report">
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Space size={[8, 8]} wrap>
                      <Tag color="blue">MDB files {mdbTableCoverageReport.fileCount}</Tag>
                      <Tag color="green">Files scanned {mdbTableCoverageReport.filesScanned}</Tag>
                      <Tag color="blue">Tables {mdbTableCoverageReport.tableCount}</Tag>
                      <Tag color="green">Included {mdbTableCoverageReport.includedTableCount}</Tag>
                      <Tag color="gold">Pending {mdbTableCoverageReport.pendingTableCount}</Tag>
                      <Tag color="blue">
                        Columns {mdbTableCoverageReport.extractedColumns}/{mdbTableCoverageReport.totalColumns}
                      </Tag>
                    </Space>
                    <Text type="secondary">
                      Included tables are in the current canonical CSV extraction. Pending tables exist in MDB files
                      but are not yet part of the extraction and migration procedure.
                    </Text>
                    <Table<MdbTableCoverageRow>
                      rowKey={(row) => `${row.sourceMdbFile}:${row.sourceTable}`}
                      size="small"
                      pagination={{ pageSize: 20, showSizeChanger: false }}
                      dataSource={mdbTableCoverageReport.tables}
                      columns={[
                        {
                          title: 'MDB file',
                          dataIndex: 'sourceMdbFile',
                          key: 'sourceMdbFile',
                          width: 150,
                          render: (value: string) => <Text strong>{value}</Text>,
                        },
                        {
                          title: 'Table',
                          dataIndex: 'sourceTable',
                          key: 'sourceTable',
                          render: (value: string) => <Text>{value}</Text>,
                        },
                        {
                          title: 'Columns imported',
                          key: 'columns',
                          width: 150,
                          render: (_value, row) => `${row.extractedColumns}/${row.totalColumns}`,
                        },
                        {
                          title: 'Fields imported',
                          key: 'fields',
                          width: 140,
                          render: (_value, row) => `${row.importedFields}/${row.totalFields}`,
                        },
                        {
                          title: 'Status',
                          dataIndex: 'migrationProcedureStatus',
                          key: 'migrationProcedureStatus',
                          width: 180,
                          render: (value: MdbTableCoverageRow['migrationProcedureStatus']) => (
                            <Tag color={value === 'included_in_current_extraction' ? 'green' : 'gold'}>
                              {value === 'included_in_current_extraction' ? 'Included' : 'Pending'}
                            </Tag>
                          ),
                        },
                        {
                          title: 'Note',
                          dataIndex: 'note',
                          key: 'note',
                        },
                      ]}
                    />
                  </Space>
                </Card>
              ) : null}
              {resultText ? (
                <pre
                  style={{
                    maxHeight: 240,
                    overflow: 'auto',
                    padding: 16,
                    margin: 0,
                    borderRadius: 8,
                    background: '#f8fafc',
                    color: '#0f172a',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {resultText}
                </pre>
              ) : null}
            </Space>
          </Card>
        </Col>
      </Row>

      <Card title="Operator Spot Checks">
        <Space direction="vertical" size={10}>
          <Alert
            type="warning"
            showIcon
            message="These checks are intentionally manual."
            description="Cutover is blocked until real operators verify that the migrated data works in the daily workflows."
          />
          <Space size={[16, 8]} wrap>
            <Checkbox
              checked={operatorChecks.skuLookup}
              onChange={(event) => setOperatorChecks((current) => ({ ...current, skuLookup: event.target.checked }))}
            >
              SKU lookup and search
            </Checkbox>
            <Checkbox
              checked={operatorChecks.stockInquiry}
              onChange={(event) => setOperatorChecks((current) => ({ ...current, stockInquiry: event.target.checked }))}
            >
              Inventory inquiry by SKU/store
            </Checkbox>
            <Checkbox
              checked={operatorChecks.customerLookup}
              onChange={(event) => setOperatorChecks((current) => ({ ...current, customerLookup: event.target.checked }))}
            >
              Customer lookup
            </Checkbox>
            <Checkbox
              checked={operatorChecks.posScan}
              onChange={(event) => setOperatorChecks((current) => ({ ...current, posScan: event.target.checked }))}
            >
              POS item scan
            </Checkbox>
            <Checkbox
              checked={operatorChecks.reportsOpen}
              onChange={(event) => setOperatorChecks((current) => ({ ...current, reportsOpen: event.target.checked }))}
            >
              Core reports open
            </Checkbox>
          </Space>
          <Space>
            <Button
              icon={<CheckCircleOutlined />}
              type={allOperatorChecksComplete ? 'primary' : 'default'}
              disabled={!allOperatorChecksComplete}
            >
              Operator checks complete
            </Button>
            <Text type="secondary">Completion advances the final guided step.</Text>
          </Space>
        </Space>
      </Card>

      <Card title="Individual Process Test Bench">
        <Table<MigrationActionDefinition>
          rowKey="id"
          columns={actionColumns}
          dataSource={actions}
          pagination={false}
          size="middle"
        />
      </Card>
    </Space>
  )
}
