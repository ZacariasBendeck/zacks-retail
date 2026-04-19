import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import {
  useCreateSizeType,
  useNrfLookup,
  useSizeType,
  useUpdateSizeType,
} from '../../hooks/useProductsTaxonomy'
import type { SizeTypeInput } from '../../types/productsTaxonomy'

interface HeaderValues {
  code: number
  description: string
  columnDescription: string
  rowDescription: string
  tableType?: string | null
}

export default function SizeTypeGridEditorPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<HeaderValues>()
  const editing = code != null && code !== 'new'
  const n = editing ? Number(code) : undefined
  const { data } = useSizeType(n)
  const create = useCreateSizeType()
  const update = useUpdateSizeType()

  const [columns, setColumns] = useState<string[]>([])
  const [rowLabels, setRowLabels] = useState<string[]>([])
  const [newCol, setNewCol] = useState('')
  const [newRow, setNewRow] = useState('')

  const nrfEnabled = editing && n != null
  const { data: nrfCells } = useNrfLookup(nrfEnabled ? n : undefined)

  useEffect(() => {
    if (editing && data) {
      form.setFieldsValue({
        code: data.code,
        description: data.description,
        columnDescription: data.columnDescription,
        rowDescription: data.rowDescription,
        tableType: data.tableType ?? '',
      })
      setColumns(data.columns)
      setRowLabels(data.rows)
    }
  }, [editing, data, form])

  const nrfByCell = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of nrfCells ?? []) {
      map.set(`${c.rowLabel}-${c.columnPosition}`, c.nrfCode)
    }
    return map
  }, [nrfCells])

  const onAddColumn = () => {
    const v = newCol.trim()
    if (!v) return
    if (v.length > 3) {
      message.error('Column label exceeds 3 characters (RICS p. 147)')
      return
    }
    if (columns.length >= 54) {
      message.error('Size type supports at most 54 columns')
      return
    }
    setColumns([...columns, v])
    setNewCol('')
  }

  const onAddRow = () => {
    const v = newRow.trim()
    if (!v) return
    if (v.length > 2) {
      message.error('Row label exceeds 2 characters (RICS p. 147)')
      return
    }
    if (rowLabels.length >= 27) {
      message.error('Size type supports at most 27 rows')
      return
    }
    setRowLabels([...rowLabels, v])
    setNewRow('')
  }

  const onFinish = async () => {
    try {
      const header = await form.validateFields()
      const payload: SizeTypeInput = {
        code: header.code,
        description: header.description,
        columnDescription: header.columnDescription,
        rowDescription: header.rowDescription,
        tableType: header.tableType || null,
        columns,
        rows: rowLabels,
      }
      if (editing && n != null) {
        await update.mutateAsync({ code: n, patch: payload })
        message.success('Size type updated')
      } else {
        await create.mutateAsync(payload)
        message.success('Size type created')
      }
      navigate('/products/taxonomy/size-types')
    } catch (e) {
      if (e instanceof Error) message.error(e.message)
    }
  }

  const gridColumns = useMemo(() => {
    const base = [{ title: '', dataIndex: 'rowLabel', key: 'rowLabel', width: 80, fixed: 'left' as const }]
    const dataCols = columns.map((c, i) => ({
      title: c,
      key: `col-${i}`,
      width: 80,
      render: (_: unknown, record: { rowLabel: string }) => {
        const rowIndex = rowLabels.indexOf(record.rowLabel)
        const nrfKey = `${rowIndex + 1}-${i + 1}`
        const nrf = nrfByCell.get(nrfKey)
        return nrf ? (
          <Tooltip title={`NRF code ${nrf} (RICS pp. 148–152)`}>
            <Tag color="blue">{nrf}</Tag>
          </Tooltip>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )
      },
    }))
    return [...base, ...dataCols]
  }, [columns, rowLabels, nrfByCell])

  const gridData = rowLabels.map((r) => ({ key: r, rowLabel: r }))

  return (
    <Card title={<Typography.Text strong>{editing ? `Edit size type ${code}` : 'New size type'}</Typography.Text>}>
      <Form<HeaderValues> form={form} layout="vertical">
        <Row gutter={16}>
          <Col xs={24} sm={6}>
            <Form.Item name="code" label="Code" rules={[{ required: true, type: 'number', min: 0 }]}>
              <InputNumber min={0} max={9999} disabled={editing} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="description" label="Description" rules={[{ required: true, max: 20 }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={6}>
            <Form.Item name="tableType" label="Table Type (NRF)">
              <Input placeholder="e.g. 5 (footwear)" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="columnDescription"
              label="Column axis label"
              rules={[{ max: 5, message: 'Max 5 chars (RICS p. 147)' }]}
            >
              <Input placeholder="e.g. SIZE" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="rowDescription"
              label="Row axis label"
              rules={[{ max: 5, message: 'Max 5 chars (RICS p. 147)' }]}
            >
              <Input placeholder="e.g. WIDTH" />
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <Typography.Title level={5}>Columns ({columns.length}/54)</Typography.Title>
      <Space wrap style={{ marginBottom: 12 }}>
        {columns.map((c, i) => (
          <Tag
            key={`${c}-${i}`}
            closable
            onClose={() => setColumns(columns.filter((_, j) => j !== i))}
          >
            {c}
          </Tag>
        ))}
        <Space.Compact>
          <Input placeholder="New column (≤3)" value={newCol} onChange={(e) => setNewCol(e.target.value)} maxLength={3} style={{ width: 140 }} />
          <Button icon={<PlusOutlined />} onClick={onAddColumn} />
        </Space.Compact>
      </Space>

      <Typography.Title level={5}>Rows ({rowLabels.length}/27)</Typography.Title>
      <Space wrap style={{ marginBottom: 12 }}>
        {rowLabels.map((r, i) => (
          <Tag
            key={`${r}-${i}`}
            closable
            onClose={() => setRowLabels(rowLabels.filter((_, j) => j !== i))}
          >
            {r}
          </Tag>
        ))}
        <Space.Compact>
          <Input placeholder="New row (≤2)" value={newRow} onChange={(e) => setNewRow(e.target.value)} maxLength={2} style={{ width: 140 }} />
          <Button icon={<PlusOutlined />} onClick={onAddRow} />
        </Space.Compact>
      </Space>

      <Typography.Title level={5}>Grid preview (with NRF lookup)</Typography.Title>
      <Table
        dataSource={gridData}
        columns={gridColumns}
        pagination={false}
        scroll={{ x: 'max-content' }}
        size="small"
      />

      <Space style={{ marginTop: 16 }}>
        <Button type="primary" onClick={onFinish} loading={create.isPending || update.isPending}>
          Save
        </Button>
        <Popconfirm title="Discard changes?" onConfirm={() => navigate('/products/taxonomy/size-types')}>
          <Button icon={<DeleteOutlined />}>Cancel</Button>
        </Popconfirm>
      </Space>
    </Card>
  )
}
