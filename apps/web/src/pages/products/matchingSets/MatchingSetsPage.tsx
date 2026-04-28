import { useEffect, useMemo, useState } from 'react'
import {
  App,
  Button,
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { SkuLookup } from '../../../components/sku-lookup'
import { SkuLink } from '../../../components/sku-link/SkuLink'
import { useVendors } from '../../../hooks/useProductsVendors'
import {
  useAddMatchingSetMember,
  useArchiveMatchingSet,
  useCreateMatchingSet,
  useCreateMatchingSetRole,
  useCreateMatchingSetType,
  useMatchingSet,
  useMatchingSets,
  useMatchingSetTypes,
  useRemoveMatchingSetMember,
  useRestoreMatchingSet,
  useUpdateMatchingSet,
  useUpdateMatchingSetMember,
  useUpdateMatchingSetRole,
  useUpdateMatchingSetType,
} from '../../../hooks/useProductMatchingSets'
import type {
  MatchingSetInput,
  MatchingSetListFilters,
  MatchingSetListItem,
  MatchingSetMember,
  MatchingSetMemberInput,
  MatchingSetType,
} from '../../../services/productMatchingSetsApi'

type HeaderFormValues = {
  setTypeCode: string
  descriptionEs?: string | null
  vendorId?: string | null
  vendorStyle?: string | null
  sharedColorCode?: string | null
  sharedColorLabel?: string | null
  season?: string | null
  notes?: string | null
}

type DraftMember = MatchingSetMemberInput & {
  key: string
  displayCode: string
  description?: string | null
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  return s.length > 0 ? s : null
}

function roleOptions(type: MatchingSetType | undefined) {
  return (type?.roles ?? [])
    .filter((role) => role.active)
    .map((role) => ({ value: role.code, label: role.labelEs }))
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('es-HN', { maximumFractionDigits: 0 }).format(value)
}

function primarySku(record: MatchingSetListItem): string {
  return record.primaryMember?.skuCode ?? record.primaryMember?.provisionalCode ?? '-'
}

export default function MatchingSetsPage() {
  const { message } = App.useApp()
  const [searchParams] = useSearchParams()
  const [filters, setFilters] = useState<MatchingSetListFilters>({ active: true, pageSize: 50 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [skuLookupOpen, setSkuLookupOpen] = useState(false)
  const [memberTarget, setMemberTarget] = useState<'draft' | 'existing'>('draft')
  const [draftMembers, setDraftMembers] = useState<DraftMember[]>([])
  const [newMemberRole, setNewMemberRole] = useState<string | null>(null)
  const [typeForm] = Form.useForm()
  const [roleForm] = Form.useForm()
  const [form] = Form.useForm<HeaderFormValues>()

  const { data: types } = useMatchingSetTypes()
  const { data: vendors } = useVendors()
  const { data: rows, isFetching, refetch } = useMatchingSets(filters)
  const { data: detail, isFetching: detailLoading } = useMatchingSet(selectedId)
  const createSet = useCreateMatchingSet()
  const updateSet = useUpdateMatchingSet()
  const archiveSet = useArchiveMatchingSet()
  const restoreSet = useRestoreMatchingSet()
  const addMember = useAddMatchingSetMember()
  const updateMember = useUpdateMatchingSetMember()
  const removeMember = useRemoveMatchingSetMember()
  const createType = useCreateMatchingSetType()
  const updateType = useUpdateMatchingSetType()
  const createRole = useCreateMatchingSetRole()
  const updateRole = useUpdateMatchingSetRole()

  useEffect(() => {
    const sku = searchParams.get('sku')
    if (sku) setFilters((current) => ({ ...current, sku }))
  }, [searchParams])

  const watchedType = Form.useWatch('setTypeCode', form)
  const selectedType = useMemo(
    () => types?.find((type) => type.code === (watchedType ?? detail?.setTypeCode)),
    [detail?.setTypeCode, types, watchedType],
  )

  useEffect(() => {
    if (!drawerOpen) return
    if (detail) {
      form.setFieldsValue({
        setTypeCode: detail.setTypeCode,
        descriptionEs: detail.descriptionEs,
        vendorId: detail.vendorId,
        vendorStyle: detail.vendorStyle,
        sharedColorCode: detail.sharedColorCode,
        sharedColorLabel: detail.sharedColorLabel,
        season: detail.season,
        notes: detail.notes,
      })
      setNewMemberRole(detail.setTypeCode === selectedType?.code ? roleOptions(selectedType)[0]?.value ?? null : null)
      return
    }
    const firstType = types?.find((type) => type.active) ?? types?.[0]
    form.resetFields()
    form.setFieldsValue({ setTypeCode: firstType?.code ?? 'suit' })
    setDraftMembers([])
  }, [detail, drawerOpen, form, selectedType, types])

  useEffect(() => {
    const options = roleOptions(selectedType)
    if (options.length > 0 && !options.some((option) => option.value === newMemberRole)) {
      const first = options[0]
      if (first) setNewMemberRole(first.value)
    }
  }, [newMemberRole, selectedType])

  const vendorOptions = useMemo(
    () => (vendors ?? []).map((vendor) => ({ value: vendor.code, label: `${vendor.code} - ${vendor.name}` })),
    [vendors],
  )

  const openNew = () => {
    setSelectedId(null)
    setDrawerOpen(true)
  }

  const openExisting = (id: string) => {
    setSelectedId(id)
    setDrawerOpen(true)
  }

  const saveHeader = async () => {
    const values = await form.validateFields()
    const payload: MatchingSetInput = {
      setTypeCode: values.setTypeCode,
      descriptionEs: clean(values.descriptionEs),
      vendorId: clean(values.vendorId),
      vendorStyle: clean(values.vendorStyle),
      sharedColorCode: clean(values.sharedColorCode),
      sharedColorLabel: clean(values.sharedColorLabel),
      season: clean(values.season),
      notes: clean(values.notes),
    }
    if (detail) {
      await updateSet.mutateAsync({ id: detail.id, patch: payload })
      message.success('Conjunto actualizado')
      return
    }
    const created = await createSet.mutateAsync({ ...payload, members: draftMembers })
    message.success(`Conjunto creado: ${created.code}`)
    setSelectedId(created.id)
    setDraftMembers([])
  }

  const handlePickedSku = async (picked: { skuCode: string; skuId: string }) => {
    setSkuLookupOpen(false)
    const roleCode = newMemberRole ?? roleOptions(selectedType)[0]?.value
    if (!roleCode) {
      message.error('Seleccione un rol primero.')
      return
    }
    if (memberTarget === 'existing' && detail) {
      await addMember.mutateAsync({
        id: detail.id,
        input: { skuCode: picked.skuCode, roleCode, isPrimary: detail.members.length === 0 },
      })
      message.success('SKU agregado al conjunto')
      return
    }
    if (draftMembers.some((member) => member.skuCode === picked.skuCode || member.skuId === picked.skuId)) {
      message.info('Ese SKU ya esta en la lista.')
      return
    }
    setDraftMembers((current) => [
      ...current,
      {
        key: picked.skuId || picked.skuCode,
        skuId: picked.skuId,
        skuCode: picked.skuCode,
        roleCode,
        isPrimary: current.length === 0,
        quantityRatio: 1,
        displayCode: picked.skuCode,
      },
    ])
  }

  const listColumns: ColumnsType<MatchingSetListItem> = [
    {
      title: 'Set',
      dataIndex: 'code',
      width: 150,
      render: (value: string, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => openExisting(record.id)}>
          {value}
        </Button>
      ),
    },
    { title: 'Type', dataIndex: 'setTypeLabelEs', width: 170 },
    {
      title: 'Vendor',
      width: 220,
      render: (_, record) => record.vendorId ? `${record.vendorId} ${record.vendorName ?? ''}` : '-',
    },
    { title: 'Style', dataIndex: 'vendorStyle', width: 120, render: (v) => v ?? '-' },
    { title: 'Color', dataIndex: 'sharedColorCode', width: 100, render: (v) => v ?? '-' },
    {
      title: 'Primary SKU',
      width: 150,
      render: (_, record) => {
        const code = primarySku(record)
        return code === '-' ? '-' : <SkuLink skuCode={code}>{code}</SkuLink>
      },
    },
    { title: 'Members', dataIndex: 'memberCount', width: 90, align: 'right' },
    { title: 'On Hand', dataIndex: 'totalOnHand', width: 100, align: 'right', render: formatNumber },
    { title: '90d Sales', dataIndex: 'salesLast90Days', width: 100, align: 'right', render: formatNumber },
    {
      title: 'Gaps',
      width: 120,
      render: (_, record) =>
        record.gaps.length > 0 ? <Tag color="red">{record.gaps.length}</Tag> : <Tag color="green">OK</Tag>,
    },
    {
      title: 'Status',
      width: 100,
      render: (_, record) => <Tag color={record.active ? 'green' : 'default'}>{record.active ? 'Active' : 'Archived'}</Tag>,
    },
  ]

  const memberColumns: ColumnsType<MatchingSetMember> = [
    {
      title: 'SKU',
      width: 150,
      render: (_, record) => {
        const code = record.skuCode ?? record.provisionalCode
        return code ? <SkuLink skuCode={code}>{code}</SkuLink> : '-'
      },
    },
    { title: 'Description', dataIndex: 'description', ellipsis: true },
    {
      title: 'Role',
      width: 170,
      render: (_, record) => (
        <Select
          value={record.roleCode}
          options={roleOptions(selectedType)}
          style={{ width: '100%' }}
          onChange={(roleCode) => {
            if (!detail) return
            updateMember.mutate({ id: detail.id, skuId: record.skuId, patch: { roleCode } })
          }}
        />
      ),
    },
    {
      title: 'Primary',
      width: 90,
      render: (_, record) => (
        <Switch
          checked={record.isPrimary}
          onChange={(isPrimary) => {
            if (!detail) return
            updateMember.mutate({ id: detail.id, skuId: record.skuId, patch: { isPrimary } })
          }}
        />
      ),
    },
    { title: 'State', dataIndex: 'skuState', width: 120, render: (v) => <Tag>{v}</Tag> },
    { title: 'On Hand', dataIndex: 'onHandTotal', width: 90, align: 'right', render: formatNumber },
    { title: '90d Sales', dataIndex: 'salesLast90Days', width: 90, align: 'right', render: formatNumber },
    {
      title: '',
      width: 80,
      render: (_, record) => (
        <Popconfirm
          title="Remove SKU?"
          onConfirm={() => detail && removeMember.mutate({ id: detail.id, skuId: record.skuId })}
        >
          <Button size="small" danger>
            Remove
          </Button>
        </Popconfirm>
      ),
    },
  ]

  const draftColumns: ColumnsType<DraftMember> = [
    { title: 'SKU', dataIndex: 'displayCode', width: 160 },
    {
      title: 'Role',
      render: (_, record) => (
        <Select
          value={record.roleCode}
          options={roleOptions(selectedType)}
          style={{ width: 180 }}
          onChange={(roleCode) =>
            setDraftMembers((current) =>
              current.map((member) => member.key === record.key ? { ...member, roleCode } : member),
            )
          }
        />
      ),
    },
    {
      title: 'Primary',
      width: 90,
      render: (_, record) => (
        <Switch
          checked={record.isPrimary === true}
          onChange={(checked) =>
            setDraftMembers((current) =>
              current.map((member) => ({
                ...member,
                isPrimary: checked ? member.key === record.key : false,
              })),
            )
          }
        />
      ),
    },
    {
      title: '',
      width: 80,
      render: (_, record) => (
        <Button
          size="small"
          danger
          onClick={() => setDraftMembers((current) => current.filter((member) => member.key !== record.key))}
        >
          Remove
        </Button>
      ),
    },
  ]

  return (
    <div>
      <Flex justify="space-between" align="center" wrap="wrap" gap={12} style={{ marginBottom: 12 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Matching Sets
        </Typography.Title>
        <Space>
          <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>
            Types & Roles
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
            New Matching Set
          </Button>
        </Space>
      </Flex>

      <Flex gap={8} wrap="wrap" style={{ marginBottom: 12 }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="Search set, SKU, vendor, style, color"
          allowClear
          value={filters.q}
          onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value || undefined }))}
          style={{ width: 320 }}
        />
        <Input
          placeholder="SKU"
          allowClear
          value={filters.sku}
          onChange={(event) => setFilters((current) => ({ ...current, sku: event.target.value || undefined }))}
          style={{ width: 180 }}
        />
        <Select
          placeholder="Type"
          allowClear
          value={filters.setType}
          options={(types ?? []).map((type) => ({ value: type.code, label: type.labelEs }))}
          onChange={(setType) => setFilters((current) => ({ ...current, setType }))}
          style={{ width: 220 }}
        />
        <Select
          placeholder="Status"
          value={filters.active}
          options={[
            { value: true, label: 'Active' },
            { value: false, label: 'Archived' },
          ]}
          allowClear
          onChange={(active) => setFilters((current) => ({ ...current, active }))}
          style={{ width: 140 }}
        />
        <Select
          placeholder="Gaps"
          value={filters.hasGap}
          options={[
            { value: true, label: 'Has gaps' },
            { value: false, label: 'No gaps' },
          ]}
          allowClear
          onChange={(hasGap) => setFilters((current) => ({ ...current, hasGap }))}
          style={{ width: 140 }}
        />
      </Flex>

      <Table
        rowKey="id"
        size="small"
        loading={isFetching}
        columns={listColumns}
        dataSource={rows ?? []}
        pagination={{ pageSize: 50, showSizeChanger: true }}
        scroll={{ x: 1280 }}
      />

      <Drawer
        open={drawerOpen}
        width={980}
        onClose={() => setDrawerOpen(false)}
        title={detail ? detail.code : 'New Matching Set'}
        extra={
          <Space>
            {detail && (
              detail.active ? (
                <Popconfirm title="Archive set?" onConfirm={() => archiveSet.mutate(detail.id)}>
                  <Button>Archive</Button>
                </Popconfirm>
              ) : (
                <Button onClick={() => restoreSet.mutate(detail.id)}>Restore</Button>
              )
            )}
            <Button type="primary" loading={createSet.isPending || updateSet.isPending} onClick={saveHeader}>
              Save
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Flex gap={12} wrap="wrap">
            <Form.Item name="setTypeCode" label="Type" rules={[{ required: true }]} style={{ minWidth: 220, flex: 1 }}>
              <Select options={(types ?? []).map((type) => ({ value: type.code, label: type.labelEs }))} />
            </Form.Item>
            <Form.Item name="vendorId" label="Vendor" style={{ minWidth: 260, flex: 1 }}>
              <Select showSearch allowClear optionFilterProp="label" options={vendorOptions} />
            </Form.Item>
            <Form.Item name="vendorStyle" label="Vendor Style" style={{ minWidth: 180, flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="season" label="Season" style={{ width: 120 }}>
              <Input maxLength={2} />
            </Form.Item>
          </Flex>
          <Flex gap={12} wrap="wrap">
            <Form.Item name="descriptionEs" label="Description" style={{ minWidth: 300, flex: 2 }}>
              <Input />
            </Form.Item>
            <Form.Item name="sharedColorCode" label="Color Code" style={{ minWidth: 140, flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="sharedColorLabel" label="Color Label" style={{ minWidth: 180, flex: 1 }}>
              <Input />
            </Form.Item>
          </Flex>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>

        <Flex justify="space-between" align="center" style={{ margin: '16px 0 8px' }}>
          <Space>
            <Typography.Title level={5} style={{ margin: 0 }}>
              Members
            </Typography.Title>
            {detail?.gaps.map((gap) => (
              <Tag key={`${gap.severity}-${gap.roleCode}`} color={gap.severity === 'missing_required_role' ? 'red' : 'gold'}>
                {gap.roleLabelEs}
              </Tag>
            ))}
          </Space>
          <Space>
            <Select
              value={newMemberRole}
              options={roleOptions(selectedType)}
              onChange={setNewMemberRole}
              style={{ width: 180 }}
            />
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                setMemberTarget(detail ? 'existing' : 'draft')
                setSkuLookupOpen(true)
              }}
            >
              Add SKU
            </Button>
          </Space>
        </Flex>

        {detail ? (
          <Table
            rowKey="skuId"
            size="small"
            loading={detailLoading}
            columns={memberColumns}
            dataSource={detail.members}
            pagination={false}
          />
        ) : (
          <Table
            rowKey="key"
            size="small"
            columns={draftColumns}
            dataSource={draftMembers}
            pagination={false}
          />
        )}
      </Drawer>

      <RoleSettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        types={types ?? []}
        typeForm={typeForm}
        roleForm={roleForm}
        createType={createType.mutateAsync}
        updateType={(code, patch) => updateType.mutateAsync({ code, patch })}
        createRole={(typeCode, input) => createRole.mutateAsync({ typeCode, input })}
        updateRole={(typeCode, roleCode, patch) => updateRole.mutateAsync({ typeCode, roleCode, patch })}
      />

      <SkuLookup
        open={skuLookupOpen}
        onClose={() => setSkuLookupOpen(false)}
        onSelect={handlePickedSku}
      />
    </div>
  )
}

function RoleSettingsDrawer({
  open,
  onClose,
  types,
  typeForm,
  roleForm,
  createType,
  updateType,
  createRole,
  updateRole,
}: {
  open: boolean
  onClose: () => void
  types: MatchingSetType[]
  typeForm: ReturnType<typeof Form.useForm>[0]
  roleForm: ReturnType<typeof Form.useForm>[0]
  createType: (input: { code: string; labelEs: string; descriptionEs?: string | null; sortOrder?: number; active?: boolean }) => Promise<unknown>
  updateType: (code: string, patch: { labelEs?: string; descriptionEs?: string | null; sortOrder?: number; active?: boolean }) => Promise<unknown>
  createRole: (typeCode: string, input: { code: string; labelEs: string; sortOrder?: number; requiredDefault?: boolean; active?: boolean }) => Promise<unknown>
  updateRole: (typeCode: string, roleCode: string, patch: { labelEs?: string; sortOrder?: number; requiredDefault?: boolean; active?: boolean }) => Promise<unknown>
}) {
  const [selectedTypeCode, setSelectedTypeCode] = useState<string | null>(null)
  const selectedType = types.find((type) => type.code === selectedTypeCode) ?? types[0]

  useEffect(() => {
    if (!selectedTypeCode && types[0]) setSelectedTypeCode(types[0].code)
  }, [selectedTypeCode, types])

  const typeColumns: ColumnsType<MatchingSetType> = [
    { title: 'Code', dataIndex: 'code', width: 130 },
    {
      title: 'Label',
      dataIndex: 'labelEs',
      render: (value, record) => (
        <Input
          defaultValue={value}
          onBlur={(event) => updateType(record.code, { labelEs: event.target.value })}
        />
      ),
    },
    {
      title: 'Active',
      dataIndex: 'active',
      width: 90,
      render: (value, record) => (
        <Switch checked={value} onChange={(active) => updateType(record.code, { active })} />
      ),
    },
  ]

  const roleColumns: ColumnsType<MatchingSetType['roles'][number]> = [
    { title: 'Code', dataIndex: 'code', width: 130 },
    {
      title: 'Label',
      dataIndex: 'labelEs',
      render: (value, record) => selectedType ? (
        <Input
          defaultValue={value}
          onBlur={(event) => updateRole(selectedType.code, record.code, { labelEs: event.target.value })}
        />
      ) : value,
    },
    {
      title: 'Required',
      dataIndex: 'requiredDefault',
      width: 100,
      render: (value, record) => selectedType ? (
        <Switch
          checked={value}
          onChange={(requiredDefault) => updateRole(selectedType.code, record.code, { requiredDefault })}
        />
      ) : null,
    },
    {
      title: 'Active',
      dataIndex: 'active',
      width: 90,
      render: (value, record) => selectedType ? (
        <Switch checked={value} onChange={(active) => updateRole(selectedType.code, record.code, { active })} />
      ) : null,
    },
  ]

  return (
    <Drawer open={open} onClose={onClose} width={860} title="Types & Roles">
      <Tabs
        items={[
          {
            key: 'types',
            label: 'Types',
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <Form
                  form={typeForm}
                  layout="inline"
                  onFinish={(values) => {
                    void createType(values as { code: string; labelEs: string; descriptionEs?: string | null; sortOrder?: number; active?: boolean })
                    typeForm.resetFields()
                  }}
                >
                  <Form.Item name="code" rules={[{ required: true }]}>
                    <Input placeholder="code" />
                  </Form.Item>
                  <Form.Item name="labelEs" rules={[{ required: true }]}>
                    <Input placeholder="label" />
                  </Form.Item>
                  <Form.Item name="sortOrder">
                    <InputNumber placeholder="sort" />
                  </Form.Item>
                  <Button htmlType="submit" icon={<PlusOutlined />}>
                    Add Type
                  </Button>
                </Form>
                <Table
                  rowKey="code"
                  size="small"
                  columns={typeColumns}
                  dataSource={types}
                  pagination={false}
                  onRow={(record) => ({ onClick: () => setSelectedTypeCode(record.code) })}
                />
              </Space>
            ),
          },
          {
            key: 'roles',
            label: 'Roles',
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <Select
                  value={selectedType?.code}
                  options={types.map((type) => ({ value: type.code, label: type.labelEs }))}
                  onChange={setSelectedTypeCode}
                  style={{ width: 260 }}
                />
                <Form
                  form={roleForm}
                  layout="inline"
                  onFinish={(values) => {
                    if (!selectedType) return
                    void createRole(selectedType.code, values as { code: string; labelEs: string; sortOrder?: number; requiredDefault?: boolean; active?: boolean })
                    roleForm.resetFields()
                  }}
                >
                  <Form.Item name="code" rules={[{ required: true }]}>
                    <Input placeholder="code" />
                  </Form.Item>
                  <Form.Item name="labelEs" rules={[{ required: true }]}>
                    <Input placeholder="label" />
                  </Form.Item>
                  <Form.Item name="sortOrder">
                    <InputNumber placeholder="sort" />
                  </Form.Item>
                  <Form.Item name="requiredDefault" valuePropName="checked">
                    <Switch checkedChildren="Required" unCheckedChildren="Optional" />
                  </Form.Item>
                  <Button htmlType="submit" icon={<PlusOutlined />}>
                    Add Role
                  </Button>
                </Form>
                <Table
                  rowKey="code"
                  size="small"
                  columns={roleColumns}
                  dataSource={selectedType?.roles ?? []}
                  pagination={false}
                />
              </Space>
            ),
          },
        ]}
      />
    </Drawer>
  )
}
