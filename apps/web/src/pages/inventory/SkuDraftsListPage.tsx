/**
 * Drafts admin page — /inventory/sku-drafts
 *
 * Lists every SKU in DRAFT state (from `app.sku` via the lifecycle service),
 * with per-row actions:
 *   - Finalizar     → opens FinalizeDraftModal, requires the final code
 *                     and enforces required-fields checklist
 *   - Descontinuar  → DRAFT → DISCONTINUED (hides from list after refresh)
 *
 * Entry point for creating a new DRAFT is the "Nuevo borrador" button top-right
 * which opens CreateDraftModal (minimal form: familyCode + descriptionRics +
 * vendorSku). Full-field editing comes when the main SKU form is repointed in
 * Phase 5f.
 */
import { useMemo, useState } from 'react'
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  Popconfirm,
  InputNumber,
} from 'antd'
import { PlusOutlined, CheckCircleOutlined, DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { DraggableModal } from '../../components/draggable-modal'
import {
  useSkuDraftsList,
  useCreateSkuDraft,
  useUpdateSkuDraft,
  useFinalizeSkuDraft,
  useDiscontinueSkuDraft,
} from '../../hooks/useSkuDrafts'
import { useProductFamilies } from '../../hooks/useProductFamilies'
import type { SkuLifecycleRow } from '../../types/skuLifecycle'

const REQUIRED_FIELDS: Array<{
  key: keyof SkuLifecycleRow
  label: string
}> = [
  { key: 'familyCode', label: 'Familia' },
  { key: 'categoryNumber', label: 'Categoría' },
  { key: 'brandId', label: 'Marca' },
  { key: 'descriptionRics', label: 'Descripción RICS' },
]

function ageDays(createdAt: string): number {
  const ms = Date.now() - new Date(createdAt).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

function isFieldPresent(row: SkuLifecycleRow, key: keyof SkuLifecycleRow): boolean {
  const v = row[key]
  if (v == null) return false
  if (typeof v === 'string' && v.trim().length === 0) return false
  return true
}

export default function SkuDraftsListPage() {
  const { message } = App.useApp()
  const { data: drafts, isLoading, isError } = useSkuDraftsList()
  const { data: families } = useProductFamilies()
  const discontinueMutation = useDiscontinueSkuDraft()

  const [createOpen, setCreateOpen] = useState(false)
  const [finalizeFor, setFinalizeFor] = useState<SkuLifecycleRow | null>(null)

  const familyLabel = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of families ?? []) m.set(f.code, f.labelEs)
    return m
  }, [families])

  const columns: ColumnsType<SkuLifecycleRow> = [
    {
      title: 'Código provisional',
      dataIndex: 'provisionalCode',
      key: 'provisionalCode',
      width: 160,
      render: (v: string) => <Tag color="gold" style={{ fontFamily: 'monospace' }}>{v}</Tag>,
    },
    {
      title: 'Familia',
      dataIndex: 'familyCode',
      key: 'familyCode',
      width: 140,
      render: (v: string | null) => v ? (familyLabel.get(v) ?? v) : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: 'SKU Proveedor',
      dataIndex: 'vendorSku',
      key: 'vendorSku',
      width: 140,
      render: (v: string | null) => v ?? <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: 'Descripción',
      dataIndex: 'descriptionRics',
      key: 'descriptionRics',
      ellipsis: true,
      render: (v: string | null) => v ?? <Typography.Text type="secondary">sin descripción</Typography.Text>,
    },
    {
      title: 'Campos listos',
      key: 'ready',
      width: 140,
      render: (_: unknown, row: SkuLifecycleRow) => {
        const filled = REQUIRED_FIELDS.filter((f) => isFieldPresent(row, f.key)).length
        const total = REQUIRED_FIELDS.length
        const color = filled === total ? 'green' : filled === 0 ? 'default' : 'blue'
        return <Tag color={color}>{filled}/{total}</Tag>
      },
    },
    {
      title: 'Edad',
      key: 'age',
      width: 80,
      render: (_: unknown, row: SkuLifecycleRow) => {
        const d = ageDays(row.createdAt)
        return <Typography.Text type={d > 30 ? 'warning' : undefined}>{d} d</Typography.Text>
      },
    },
    {
      title: 'Creado por',
      dataIndex: 'createdBy',
      key: 'createdBy',
      width: 140,
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 260,
      render: (_: unknown, row: SkuLifecycleRow) => {
        const missing = REQUIRED_FIELDS.filter((f) => !isFieldPresent(row, f.key))
        return (
          <Space size="small">
            <Tooltip title={missing.length > 0 ? `Faltan: ${missing.map((f) => f.label).join(', ')}` : 'Finalizar SKU'}>
              <Button
                type="primary"
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => setFinalizeFor(row)}
              >
                Finalizar
              </Button>
            </Tooltip>
            <Popconfirm
              title="¿Descontinuar este borrador?"
              description="El borrador pasará a DISCONTINUED y se ocultará de la lista."
              okText="Sí, descontinuar"
              cancelText="Cancelar"
              onConfirm={async () => {
                try {
                  await discontinueMutation.mutateAsync(row.id)
                  message.success('Borrador descontinuado.')
                } catch (err) {
                  message.error(err instanceof Error ? err.message : 'Error al descontinuar')
                }
              }}
            >
              <Button size="small" danger icon={<DeleteOutlined />}>
                Descontinuar
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>Borradores de SKU</Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            SKUs en estado DRAFT. El warehouse puede recibir mercancía contra éstos, pero no se pueden allocar, imprimir barcodes, ni vender hasta finalizar.
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Nuevo borrador
        </Button>
      </div>

      <Card bodyStyle={{ padding: 0 }}>
        <Table<SkuLifecycleRow>
          rowKey="id"
          columns={columns}
          dataSource={drafts ?? []}
          loading={isLoading}
          size="small"
          pagination={{ pageSize: 20 }}
          locale={{
            emptyText: isError
              ? 'Error al cargar borradores.'
              : 'No hay borradores. Crea uno con "Nuevo borrador" arriba.',
          }}
        />
      </Card>

      <CreateDraftModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <FinalizeDraftModal draft={finalizeFor} onClose={() => setFinalizeFor(null)} />
    </div>
  )
}

// ────────────────── Create-draft modal ──────────────────
function CreateDraftModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp()
  const { data: families } = useProductFamilies()
  const createMutation = useCreateSkuDraft()
  const [form] = Form.useForm()

  async function handleOk() {
    try {
      const values = await form.validateFields()
      await createMutation.mutateAsync(values)
      message.success('Borrador creado.')
      form.resetFields()
      onClose()
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return // validation fail
      message.error(err instanceof Error ? err.message : 'Error al crear borrador')
    }
  }

  return (
    <DraggableModal
      title="Nuevo borrador de SKU"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="Crear borrador"
      cancelText="Cancelar"
      confirmLoading={createMutation.isPending}
      destroyOnClose
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        El código interno se genera automáticamente (ej. <code>DRF-260422-XXXX</code>).
        Lo finalizas después con el código real cuando estés listo para imprimir barcodes.
      </Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item
          label="Familia de Producto"
          name="familyCode"
          rules={[{ required: true, message: 'Familia es requerida' }]}
        >
          <Select
            placeholder="Seleccionar familia"
            showSearch
            optionFilterProp="label"
            options={(families ?? []).map((f) => ({ label: f.labelEs, value: f.code }))}
          />
        </Form.Item>
        <Form.Item label="SKU del Proveedor" name="vendorSku">
          <Input placeholder="Código que te dio el proveedor (opcional)" />
        </Form.Item>
        <Form.Item label="Descripción RICS" name="descriptionRics">
          <Input placeholder="Descripción breve (se puede editar después)" />
        </Form.Item>
        <Form.Item label="Comentario" name="comment">
          <Input.TextArea rows={2} placeholder="Notas internas (opcional)" />
        </Form.Item>
      </Form>
    </DraggableModal>
  )
}

// ────────────────── Finalize modal ──────────────────
function FinalizeDraftModal({
  draft,
  onClose,
}: {
  draft: SkuLifecycleRow | null
  onClose: () => void
}) {
  const { message } = App.useApp()
  const { data: families } = useProductFamilies()
  const updateMutation = useUpdateSkuDraft()
  const finalizeMutation = useFinalizeSkuDraft()

  // Local form state for the required fields + final code. Since this modal
  // reopens with different drafts, we reset whenever `draft` changes.
  const [code, setCode] = useState('')
  const [familyCode, setFamilyCode] = useState<string | null>(null)
  const [categoryNumber, setCategoryNumber] = useState<number | null>(null)
  const [brandId, setBrandId] = useState<number | null>(null)
  const [descriptionRics, setDescriptionRics] = useState('')

  // Hydrate on draft change
  useMemo(() => {
    if (draft) {
      setCode('')
      setFamilyCode(draft.familyCode)
      setCategoryNumber(draft.categoryNumber)
      setBrandId(draft.brandId)
      setDescriptionRics(draft.descriptionRics ?? '')
    }
  }, [draft?.id])

  if (!draft) return null

  const codeValid = /^[A-Za-z0-9][A-Za-z0-9\-_]{0,14}$/.test(code.trim())
  const fieldsReady =
    !!familyCode &&
    categoryNumber != null &&
    brandId != null &&
    descriptionRics.trim().length > 0
  const canFinalize = codeValid && fieldsReady

  async function handleFinalize() {
    if (!draft) return
    try {
      // First, push any field edits
      const patch: Record<string, unknown> = {}
      if (familyCode !== draft.familyCode) patch.familyCode = familyCode
      if (categoryNumber !== draft.categoryNumber) patch.categoryNumber = categoryNumber
      if (brandId !== draft.brandId) patch.brandId = brandId
      if (descriptionRics !== (draft.descriptionRics ?? '')) patch.descriptionRics = descriptionRics
      if (Object.keys(patch).length > 0) {
        await updateMutation.mutateAsync({ id: draft.id, patch })
      }
      await finalizeMutation.mutateAsync({ id: draft.id, input: { code: code.trim() } })
      message.success(`SKU finalizado como ${code.trim()}.`)
      onClose()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Error al finalizar')
    }
  }

  return (
    <DraggableModal
      title={<span>Finalizar borrador <Tag color="gold" style={{ fontFamily: 'monospace' }}>{draft.provisionalCode}</Tag></span>}
      open={!!draft}
      onCancel={onClose}
      onOk={handleFinalize}
      okText={<span><ThunderboltOutlined /> Finalizar SKU</span>}
      cancelText="Cancelar"
      okButtonProps={{ disabled: !canFinalize, loading: finalizeMutation.isPending || updateMutation.isPending }}
      destroyOnClose
      width={560}
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        Al finalizar, el SKU pasa a ACTIVE. El código ya no se puede renombrar.
      </Typography.Paragraph>

      <Form layout="vertical">
        <Form.Item
          label="Código final del SKU"
          required
          validateStatus={code.length > 0 && !codeValid ? 'error' : undefined}
          help={
            code.length > 0 && !codeValid
              ? 'Máx 15 caracteres, solo letras, números, - o _; debe empezar con letra o número.'
              : 'Ej. NAVY-ZARA-42R. Hasta 15 caracteres.'
          }
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="CÓDIGO-FINAL-001"
            maxLength={15}
            autoFocus
          />
        </Form.Item>

        <Form.Item
          label="Familia"
          required
          validateStatus={!familyCode ? 'error' : undefined}
        >
          <Select
            value={familyCode}
            onChange={(v) => setFamilyCode(v)}
            showSearch
            optionFilterProp="label"
            options={(families ?? []).map((f) => ({ label: f.labelEs, value: f.code }))}
          />
        </Form.Item>

        <Form.Item
          label="Categoría (número RICS)"
          required
          validateStatus={categoryNumber == null ? 'error' : undefined}
        >
          <InputNumber
            value={categoryNumber}
            onChange={(v) => setCategoryNumber(v as number | null)}
            style={{ width: '100%' }}
            placeholder="Ej. 591"
          />
        </Form.Item>

        <Form.Item
          label="Marca (ID)"
          required
          validateStatus={brandId == null ? 'error' : undefined}
        >
          <InputNumber
            value={brandId}
            onChange={(v) => setBrandId(v as number | null)}
            style={{ width: '100%' }}
            placeholder="Ej. 1"
          />
        </Form.Item>

        <Form.Item
          label="Descripción RICS"
          required
          validateStatus={descriptionRics.trim().length === 0 ? 'error' : undefined}
        >
          <Input
            value={descriptionRics}
            onChange={(e) => setDescriptionRics(e.target.value)}
            placeholder="Descripción breve que aparece en RICS"
            maxLength={500}
          />
        </Form.Item>

        <div style={{ marginTop: 12, padding: 8, background: '#fafafa', borderRadius: 4, fontSize: 12 }}>
          <strong>Validaciones:</strong>{' '}
          <Tag color={codeValid ? 'green' : 'default'}>Código {codeValid ? '✓' : '—'}</Tag>
          <Tag color={familyCode ? 'green' : 'default'}>Familia {familyCode ? '✓' : '—'}</Tag>
          <Tag color={categoryNumber != null ? 'green' : 'default'}>Categoría {categoryNumber != null ? '✓' : '—'}</Tag>
          <Tag color={brandId != null ? 'green' : 'default'}>Marca {brandId != null ? '✓' : '—'}</Tag>
          <Tag color={descriptionRics.trim().length > 0 ? 'green' : 'default'}>Descripción {descriptionRics.trim().length > 0 ? '✓' : '—'}</Tag>
        </div>
      </Form>
    </DraggableModal>
  )
}
