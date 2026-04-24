import {
  Button, Card, Col, Form, Input, InputNumber, Layout, Row, Select, Space, Table, Tag, Tooltip, Typography, message,
} from 'antd'
import { DraggableModal } from '../../components/draggable-modal'
import { useEffect, useMemo, useState } from 'react'
import {
  useCopyOtbPlanRow,
  useCreateOtbPlanRow,
  useDeleteOtbPlanRow,
  useOtbPlanRow,
  useOtbPlanRows,
  useRecalculateOtbPlanRow,
  useUpdateOtbPlanRow,
} from '../../hooks/useOtbPlanRows'
import { useOtbEntryMethod } from '../../hooks/useCompanySettings'
import { useStores } from '../../hooks/useStores'
import type { CreateOtbPlanRowPayload, MonthlyArray, OtbPlanRow } from '../../types/otbPlanRow'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const EMPTY_MONTHLY: MonthlyArray = Array(12).fill(null)

function emptyRowInput(storeId: string, fiscalYear: number): CreateOtbPlanRowPayload {
  return {
    storeId,
    categoryId: '',
    fiscalYear,
    pctChangeLyToCy: null,
    pctChangeCyToNy: null,
    plannedTurnover1h: null,
    plannedTurnover2h: null,
    plannedGpPct: null,
    lySales: [...EMPTY_MONTHLY],
    plannedSales: [...EMPTY_MONTHLY],
    markdownPct: [...EMPTY_MONTHLY],
  }
}

export default function OtbPlanEntryPage() {
  const [fiscalYear, setFiscalYear] = useState<number>(new Date().getFullYear())
  const [storeId, setStoreId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [draft, setDraft] = useState<CreateOtbPlanRowPayload>(emptyRowInput('', fiscalYear))
  const [copyModalOpen, setCopyModalOpen] = useState(false)
  const [copyTarget, setCopyTarget] = useState<{ storeId: string | null; categoryId: string }>({ storeId: null, categoryId: '' })

  const storesQ = useStores()
  const entryMethodQ = useOtbEntryMethod()

  // Default storeId to the first active store once the list loads
  useEffect(() => {
    if (storeId !== null || !storesQ.data) return
    const firstActive = storesQ.data.find((s) => s.active) ?? storesQ.data[0]
    if (firstActive) setStoreId(String(firstActive.id))
  }, [storesQ.data, storeId])

  const rowsQ = useOtbPlanRows({ storeId: storeId ?? undefined, fiscalYear, page: 1, pageSize: 200 })
  const rowQ = useOtbPlanRow(selectedId)

  const createMut = useCreateOtbPlanRow()
  const updateMut = useUpdateOtbPlanRow()
  const deleteMut = useDeleteOtbPlanRow()
  const recalcMut = useRecalculateOtbPlanRow()
  const copyMut = useCopyOtbPlanRow()

  const currentRow: OtbPlanRow | CreateOtbPlanRowPayload | null = useMemo(() => {
    if (isNew) return draft
    if (rowQ.data) return rowQ.data
    return null
  }, [isNew, draft, rowQ.data])

  function onSelectExisting(id: string) {
    setIsNew(false)
    setSelectedId(id)
  }

  function onStartNew() {
    if (!storeId) {
      message.error('Select a store first')
      return
    }
    setIsNew(true)
    setSelectedId(null)
    setDraft(emptyRowInput(storeId, fiscalYear))
  }

  async function onSave() {
    try {
      if (isNew) {
        const created = await createMut.mutateAsync(draft)
        setIsNew(false)
        setSelectedId(created.id)
        message.success('Plan row created')
      } else if (selectedId && rowQ.data) {
        await updateMut.mutateAsync({ id: selectedId, payload: draft })
        message.success('Plan row updated')
      }
    } catch (err) {
      message.error(`Save failed: ${(err as Error).message}`)
    }
  }

  async function onDelete() {
    if (!selectedId) return
    try {
      await deleteMut.mutateAsync(selectedId)
      setSelectedId(null)
      message.success('Plan row deleted')
    } catch (err) {
      message.error(`Delete failed: ${(err as Error).message}`)
    }
  }

  async function onRecalculate() {
    if (!selectedId) return
    try {
      await recalcMut.mutateAsync({ id: selectedId })
      message.success('Recalculated')
    } catch (err) {
      message.error(`ReCalculate failed: ${(err as Error).message}`)
    }
  }

  async function onConfirmCopy() {
    if (!selectedId) return
    if (!copyTarget.storeId) {
      message.error('Pick a target store')
      return
    }
    if (!copyTarget.categoryId.trim()) {
      message.error('Enter a target category')
      return
    }
    try {
      const copied = await copyMut.mutateAsync({
        id: selectedId,
        targetStoreId: copyTarget.storeId,
        targetCategoryId: copyTarget.categoryId,
      })
      setCopyModalOpen(false)
      setSelectedId(copied.id)
      message.success('Copied to new row')
    } catch (err) {
      message.error(`Copy failed: ${(err as Error).message}`)
    }
  }

  function patchDraft(patch: Partial<CreateOtbPlanRowPayload>) {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  function patchMonthlyCell(field: 'lySales' | 'plannedSales' | 'markdownPct', idx: number, value: number | null) {
    setDraft((prev) => {
      const arr = [...(prev[field] ?? EMPTY_MONTHLY)]
      arr[idx] = value
      return { ...prev, [field]: arr }
    })
  }

  useEffect(() => {
    if (!isNew && rowQ.data) {
      setDraft({
        storeId: rowQ.data.storeId,
        categoryId: rowQ.data.categoryId,
        fiscalYear: rowQ.data.fiscalYear,
        pctChangeLyToCy: rowQ.data.pctChangeLyToCy,
        pctChangeCyToNy: rowQ.data.pctChangeCyToNy,
        plannedTurnover1h: rowQ.data.plannedTurnover1h,
        plannedTurnover2h: rowQ.data.plannedTurnover2h,
        plannedGpPct: rowQ.data.plannedGpPct,
        lySales: rowQ.data.lySales,
        plannedSales: rowQ.data.plannedSales,
        markdownPct: rowQ.data.markdownPct,
      })
    }
  }, [rowQ.data, isNew])

  const method = entryMethodQ.data ?? 'CHANGE_OVER_LAST_YEAR'
  const fixedMixDisabled = method !== 'FIXED_MONTHLY_MIX'

  return (
    <Layout style={{ padding: 16 }}>
      <Space style={{ marginBottom: 12 }} wrap>
        <Typography.Text>Store:</Typography.Text>
        <Select
          style={{ minWidth: 220 }}
          loading={storesQ.isLoading}
          value={storeId}
          onChange={(v) => { setStoreId(v); setSelectedId(null); setIsNew(false); }}
          placeholder="Select a store"
          options={(storesQ.data ?? []).map((s) => ({
            value: String(s.id),
            label: `${s.code} — ${s.name}${s.active ? '' : ' (inactive)'}`,
          }))}
        />
        <Typography.Text>Fiscal year:</Typography.Text>
        <InputNumber value={fiscalYear} onChange={(v) => setFiscalYear(Number(v ?? fiscalYear))} min={2020} max={2099} />
        <Button type="primary" onClick={onStartNew} disabled={!storeId}>New row</Button>
        <Tag color="blue">Method: {method}</Tag>
      </Space>

      <Row gutter={16}>
        <Col span={8}>
          <Card title="Plan rows" size="small">
            <Table
              size="small"
              rowKey="id"
              loading={rowsQ.isLoading}
              dataSource={rowsQ.data?.items ?? []}
              pagination={false}
              columns={[
                { title: 'Category', dataIndex: 'categoryId', key: 'category' },
                { title: '%LY→CY', dataIndex: 'pctChangeLyToCy', key: 'ly' },
                { title: 'GP %', dataIndex: 'plannedGpPct', key: 'gp' },
              ]}
              onRow={(r) => ({
                onClick: () => onSelectExisting((r as OtbPlanRow).id),
                style: { cursor: 'pointer', background: selectedId === (r as OtbPlanRow).id ? '#e6f4ff' : undefined },
              })}
            />
          </Card>
        </Col>

        <Col span={16}>
          {!currentRow ? (
            <Card><Typography.Text type="secondary">Select a row on the left, or click &quot;New row&quot; to create one.</Typography.Text></Card>
          ) : (
            <Card title={isNew ? 'New plan row' : `Edit plan row — ${draft.categoryId}`} size="small">
              <Form layout="vertical">
                <Row gutter={8}>
                  <Col span={6}>
                    <Form.Item label="Category">
                      <Input
                        value={draft.categoryId}
                        onChange={(e) => patchDraft({ categoryId: e.target.value })}
                        disabled={!isNew}
                        placeholder="e.g. cat-556"
                      />
                    </Form.Item>
                  </Col>
                  <Col span={6}><Form.Item label="% LY→CY"><InputNumber value={draft.pctChangeLyToCy ?? undefined} onChange={(v) => patchDraft({ pctChangeLyToCy: v === null ? null : Number(v) })} /></Form.Item></Col>
                  <Col span={6}><Form.Item label="% CY→NY"><InputNumber value={draft.pctChangeCyToNy ?? undefined} onChange={(v) => patchDraft({ pctChangeCyToNy: v === null ? null : Number(v) })} /></Form.Item></Col>
                  <Col span={6}><Form.Item label="Planned GP %"><InputNumber value={draft.plannedGpPct ?? undefined} onChange={(v) => patchDraft({ plannedGpPct: v === null ? null : Number(v) })} min={-100} max={100} /></Form.Item></Col>
                </Row>
                <Row gutter={8}>
                  <Col span={6}><Form.Item label="Turnover 1H"><InputNumber value={draft.plannedTurnover1h ?? undefined} onChange={(v) => patchDraft({ plannedTurnover1h: v === null ? null : Number(v) })} /></Form.Item></Col>
                  <Col span={6}><Form.Item label="Turnover 2H"><InputNumber value={draft.plannedTurnover2h ?? undefined} onChange={(v) => patchDraft({ plannedTurnover2h: v === null ? null : Number(v) })} /></Form.Item></Col>
                </Row>

                <Typography.Title level={5}>Monthly cells</Typography.Title>
                <Table
                  size="small"
                  pagination={false}
                  rowKey="label"
                  dataSource={[
                    { label: 'LY Sales $', field: 'lySales' as const },
                    { label: 'Planned Sales $', field: 'plannedSales' as const },
                    { label: 'Markdown %', field: 'markdownPct' as const },
                  ]}
                  columns={[
                    { title: '', dataIndex: 'label', key: 'label', width: 140 },
                    ...MONTH_LABELS.map((m, idx) => ({
                      title: m,
                      key: `m${idx}`,
                      render: (_: unknown, row: { field: 'lySales' | 'plannedSales' | 'markdownPct' }) => {
                        const disabled = row.field === 'markdownPct' && fixedMixDisabled
                        const value = (draft[row.field] as MonthlyArray)?.[idx] ?? null
                        return (
                          <Tooltip title={disabled ? 'Available when company OTB method = Fixed Monthly Mix' : undefined}>
                            <InputNumber
                              size="small"
                              value={value ?? undefined}
                              onChange={(v) => patchMonthlyCell(row.field, idx, v === null ? null : Number(v))}
                              disabled={disabled}
                              style={{ width: 80 }}
                            />
                          </Tooltip>
                        )
                      },
                    })),
                  ]}
                />

                <Space style={{ marginTop: 16 }} wrap>
                  <Button type="primary" onClick={onSave} loading={createMut.isPending || updateMut.isPending}>Save</Button>
                  <Button danger onClick={onDelete} disabled={isNew} loading={deleteMut.isPending}>Delete</Button>
                  <Button onClick={() => setCopyModalOpen(true)} disabled={isNew}>Copy…</Button>
                  <Button onClick={onRecalculate} disabled={isNew} loading={recalcMut.isPending}>ReCalculate</Button>
                  <Tooltip title="Deferred — requires sales-reporting contract"><Button disabled>Copy Sales…</Button></Tooltip>
                  <Tooltip title="Deferred — fixed-mix method slice"><Button disabled>Store Totals</Button></Tooltip>
                  <Tooltip title="Deferred — fixed-mix method slice"><Button disabled>Apply</Button></Tooltip>
                  <Tooltip title="Deferred — fixed-mix method slice"><Button disabled>Category Totals</Button></Tooltip>
                </Space>
              </Form>
            </Card>
          )}
        </Col>
      </Row>

      <DraggableModal
        open={copyModalOpen}
        title="Copy plan row"
        onCancel={() => setCopyModalOpen(false)}
        onOk={onConfirmCopy}
        confirmLoading={copyMut.isPending}
      >
        <Form layout="vertical">
          <Form.Item label="Target store">
            <Select
              style={{ width: '100%' }}
              loading={storesQ.isLoading}
              value={copyTarget.storeId}
              onChange={(v) => setCopyTarget((t) => ({ ...t, storeId: v }))}
              placeholder="Select a store"
              options={(storesQ.data ?? []).map((s) => ({
                value: String(s.id),
                label: `${s.code} — ${s.name}`,
              }))}
            />
          </Form.Item>
          <Form.Item label="Target category">
            <Input value={copyTarget.categoryId} onChange={(e) => setCopyTarget((t) => ({ ...t, categoryId: e.target.value }))} />
          </Form.Item>
        </Form>
      </DraggableModal>
    </Layout>
  )
}
