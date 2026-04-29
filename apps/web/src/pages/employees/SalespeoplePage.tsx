import { Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import {
  createRicsSalesperson,
  deleteRicsSalesperson,
  fetchRicsSalespeople,
  updateRicsSalesperson,
  type RicsSalesperson,
  type RicsSalespersonCreate,
} from '../../services/employeeApi'

interface SalespersonFormValues {
  salespersonCode: string
  displayName: string
  active: boolean
  otherInformation?: string | null
  commissionRate?: number | null
  commissionBase: 'NET_SALES' | 'GROSS_PROFIT'
  timeClockEnabled: boolean
  timeClockAdmin: boolean
  timeClockFullUser: boolean
}

const commissionBaseOptions = [
  { value: 'NET_SALES', label: 'Net sales' },
  { value: 'GROSS_PROFIT', label: 'Gross profit' },
]

function normalizeFormValues(values: SalespersonFormValues): RicsSalespersonCreate {
  return {
    ...values,
    salespersonCode: values.salespersonCode.trim().toUpperCase(),
    displayName: values.displayName.trim(),
    otherInformation: values.otherInformation?.trim() || null,
    commissionRate: values.commissionRate ?? null,
    commissionBase: values.commissionBase ?? 'NET_SALES',
    active: values.active ?? true,
    timeClockEnabled: values.timeClockEnabled ?? true,
    timeClockAdmin: values.timeClockAdmin ?? false,
    timeClockFullUser: values.timeClockFullUser ?? false,
  }
}

export default function SalespeoplePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { permissions } = useAuth()
  const canManage = permissions.has('employees.manage')
  const [form] = Form.useForm<SalespersonFormValues>()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RicsSalesperson | null>(null)

  const salespeopleQuery = useQuery({
    queryKey: ['salespeople'],
    queryFn: fetchRicsSalespeople,
  })

  const saveMutation = useMutation({
    mutationFn: async (values: SalespersonFormValues) => {
      const normalized = normalizeFormValues(values)
      if (editing) {
        const { salespersonCode: _salespersonCode, ...patch } = normalized
        return updateRicsSalesperson(editing.salespersonCode, patch)
      }
      return createRicsSalesperson(normalized)
    },
    onSuccess: () => {
      message.success(editing ? 'Salesperson updated' : 'Salesperson created')
      queryClient.invalidateQueries({ queryKey: ['salespeople'] })
      setModalOpen(false)
      setEditing(null)
      form.resetFields()
    },
    onError: (err: any) => message.error(err.message || 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteRicsSalesperson,
    onSuccess: () => {
      message.success('Salesperson deleted')
      queryClient.invalidateQueries({ queryKey: ['salespeople'] })
    },
    onError: (err: any) => message.error(err.message || 'Delete failed'),
  })

  const filteredSalespeople = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const rows = salespeopleQuery.data ?? []
    if (!needle) return rows
    return rows.filter((row) =>
      [
        row.salespersonCode,
        row.displayName,
        row.otherInformation ?? '',
        row.commissionBase,
      ].some((value) => value.toLowerCase().includes(needle)),
    )
  }, [salespeopleQuery.data, search])

  const openNew = () => {
    setEditing(null)
    form.setFieldsValue({
      salespersonCode: '',
      displayName: '',
      active: true,
      otherInformation: '',
      commissionRate: null,
      commissionBase: 'NET_SALES',
      timeClockEnabled: true,
      timeClockAdmin: false,
      timeClockFullUser: false,
    })
    setModalOpen(true)
  }

  const openEdit = (row: RicsSalesperson) => {
    setEditing(row)
    form.setFieldsValue({
      salespersonCode: row.salespersonCode,
      displayName: row.displayName,
      active: row.active,
      otherInformation: row.otherInformation ?? '',
      commissionRate: row.commissionRate,
      commissionBase: row.commissionBase,
      timeClockEnabled: row.timeClockEnabled,
      timeClockAdmin: row.timeClockAdmin,
      timeClockFullUser: row.timeClockFullUser,
    })
    setModalOpen(true)
  }

  const columns: ColumnsType<RicsSalesperson> = [
    {
      title: 'Code',
      dataIndex: 'salespersonCode',
      width: 90,
      sorter: (a, b) => a.salespersonCode.localeCompare(b.salespersonCode),
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      title: 'Name',
      dataIndex: 'displayName',
      sorter: (a, b) => a.displayName.localeCompare(b.displayName),
    },
    {
      title: 'Active',
      dataIndex: 'active',
      width: 100,
      filters: [
        { text: 'Active', value: true },
        { text: 'Inactive', value: false },
      ],
      onFilter: (value, row) => row.active === value,
      render: (value: boolean) => (value ? <Tag color="green">active</Tag> : <Tag>inactive</Tag>),
    },
    {
      title: 'Commission',
      dataIndex: 'commissionRate',
      width: 130,
      align: 'right',
      render: (value: number | null) => (value == null ? '-' : `${value.toFixed(2)}%`),
    },
    {
      title: 'Base',
      dataIndex: 'commissionBase',
      width: 130,
      render: (value: string) => value === 'GROSS_PROFIT' ? 'Gross profit' : 'Net sales',
    },
    {
      title: 'Time clock',
      dataIndex: 'timeClockEnabled',
      width: 120,
      render: (value: boolean, row) => (
        <Space size={4} wrap>
          {value ? <Tag color="blue">enabled</Tag> : <Tag>off</Tag>}
          {row.timeClockAdmin ? <Tag>admin</Tag> : null}
          {row.timeClockFullUser ? <Tag>full</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'RICS import',
      dataIndex: 'ricsSalespersonImportedAt',
      width: 130,
      render: (value: string | null) => (value ? <Tag>imported</Tag> : <Tag color="purple">native</Tag>),
    },
    {
      title: 'Actions',
      width: 150,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => openEdit(row)} disabled={!canManage}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this salesperson?"
            description="Historical tickets keep their salesperson code, but this roster row will be removed."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteMutation.mutate(row.salespersonCode)}
            disabled={!canManage}
          >
            <Button size="small" danger disabled={!canManage}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card>
      <Tabs
        activeKey="salespeople"
        onChange={(key) => {
          if (key === 'users') navigate('/admin/users')
        }}
        items={[
          { key: 'salespeople', label: 'Salespeople' },
          { key: 'users', label: 'Users' },
        ]}
      />

      <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>Salespeople</Typography.Title>
          <Typography.Text type="secondary">
            Salesperson roster used by POS, time clock, commissions, and salesperson reports.
          </Typography.Text>
        </div>
        <Space>
          <Input.Search
            allowClear
            placeholder="Search code, name, notes"
            onSearch={setSearch}
            onChange={(event) => setSearch(event.target.value)}
            style={{ width: 260 }}
          />
          <Link to="/reports/others/salesperson-summary">
            <Button>Summary Report</Button>
          </Link>
          <Button type="primary" onClick={openNew} disabled={!canManage}>
            New salesperson
          </Button>
        </Space>
      </Space>

      <Table<RicsSalesperson>
        rowKey="salespersonCode"
        loading={salespeopleQuery.isLoading}
        dataSource={filteredSalespeople}
        columns={columns}
        pagination={{ pageSize: 50, showSizeChanger: true }}
      />

      <Modal
        title={editing ? 'Edit salesperson' : 'New salesperson'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditing(null)
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        okText={editing ? 'Save' : 'Create'}
        okButtonProps={{ disabled: !canManage }}
      >
        <Form
          form={form}
          layout="vertical"
          disabled={!canManage}
          onFinish={(values) => saveMutation.mutate(values)}
        >
          <Space align="start" wrap>
            <Form.Item
              label="Salesperson code"
              name="salespersonCode"
              normalize={(value) => String(value ?? '').toUpperCase()}
              rules={[
                { required: true, message: 'Code is required' },
                { pattern: /^[A-Z0-9]{1,4}$/, message: 'Use 1-4 letters or numbers' },
              ]}
            >
              <Input disabled={Boolean(editing)} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item label="Active" name="active" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>

          <Form.Item label="Name" name="displayName" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item label="Other information" name="otherInformation">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Space align="start" wrap>
            <Form.Item label="Commission %" name="commissionRate">
              <InputNumber min={0} max={100} precision={2} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item label="Commission base" name="commissionBase" rules={[{ required: true }]}>
              <Select options={commissionBaseOptions} style={{ width: 180 }} />
            </Form.Item>
          </Space>

          <Space align="start" wrap>
            <Form.Item label="Time clock enabled" name="timeClockEnabled" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item label="Time clock admin" name="timeClockAdmin" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item label="Full time-clock user" name="timeClockFullUser" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Card>
  )
}
