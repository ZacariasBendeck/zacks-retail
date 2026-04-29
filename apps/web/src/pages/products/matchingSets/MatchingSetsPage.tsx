import { useEffect, useMemo, useState } from 'react'
import {
  App,
  Alert,
  Button,
  Card,
  Divider,
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
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
  QuestionCircleOutlined,
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
  useMatchingSetBuyingPlan,
  useMatchingSets,
  useMatchingSetTypes,
  useRemoveMatchingSetMember,
  useRestoreMatchingSet,
  useSaveMatchingSetBuyingPlan,
  useCreatePoFromMatchingSetBuyingPlan,
  useUpdateMatchingSet,
  useUpdateMatchingSetMember,
  useUpdateMatchingSetRole,
  useUpdateMatchingSetType,
} from '../../../hooks/useProductMatchingSets'
import { useStoreChains } from '../../../hooks/useStores'
import { matchingSetSuitBuyingHelp } from '../../../content/help/matchingSetSuitBuying'
import type {
  MatchingSetBuyingPlan,
  MatchingSetBuyingPlanMember,
  MatchingSetBuyingPlanSizeLine,
  MatchingSetOtbImpactRow,
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
  materialCode?: string | null
  materialLabel?: string | null
  sharedColorCode?: string | null
  sharedColorLabel?: string | null
  season?: string | null
  chainId?: string | null
  sellMode?: 'separates' | 'bundle_required'
  planningActive?: boolean
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
  const [receiptMonth, setReceiptMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [horizonWeeks, setHorizonWeeks] = useState(13)
  const [targetCoverWeeks, setTargetCoverWeeks] = useState(8)
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null)
  const [typeForm] = Form.useForm()
  const [roleForm] = Form.useForm()
  const [form] = Form.useForm<HeaderFormValues>()

  const { data: types } = useMatchingSetTypes()
  const { data: vendors } = useVendors()
  const { data: chains } = useStoreChains()
  const { data: rows, isFetching, refetch } = useMatchingSets(filters)
  const { data: detail, isFetching: detailLoading } = useMatchingSet(selectedId)
  const { data: buyingPlan, isFetching: buyingPlanLoading, refetch: refetchBuyingPlan } = useMatchingSetBuyingPlan(
    selectedId,
    { chainId: detail?.chainId, receiptMonth, horizonWeeks, targetCoverWeeks },
  )
  const createSet = useCreateMatchingSet()
  const updateSet = useUpdateMatchingSet()
  const archiveSet = useArchiveMatchingSet()
  const restoreSet = useRestoreMatchingSet()
  const addMember = useAddMatchingSetMember()
  const updateMember = useUpdateMatchingSetMember()
  const removeMember = useRemoveMatchingSetMember()
  const saveBuyingPlan = useSaveMatchingSetBuyingPlan()
  const createPoFromPlan = useCreatePoFromMatchingSetBuyingPlan()
  const createType = useCreateMatchingSetType()
  const updateType = useUpdateMatchingSetType()
  const createRole = useCreateMatchingSetRole()
  const updateRole = useUpdateMatchingSetRole()

  useEffect(() => {
    const sku = searchParams.get('sku')
    if (sku) setFilters((current) => ({ ...current, sku }))
  }, [searchParams])

  const watchedType = Form.useWatch('setTypeCode', form)
  const watchedVendorId = Form.useWatch('vendorId', form)
  const selectedType = useMemo(
    () => types?.find((type) => type.code === (watchedType ?? detail?.setTypeCode)),
    [detail?.setTypeCode, types, watchedType],
  )
  const skuLookupInitialFilters = useMemo(() => {
    const vendor = clean(watchedVendorId) ?? clean(detail?.vendorId)
    return vendor ? { vendor } : undefined
  }, [detail?.vendorId, watchedVendorId])

  useEffect(() => {
    if (!drawerOpen) return
    if (detail) {
      form.setFieldsValue({
        setTypeCode: detail.setTypeCode,
        descriptionEs: detail.descriptionEs,
        vendorId: detail.vendorId,
        vendorStyle: detail.vendorStyle,
        materialCode: detail.materialCode,
        materialLabel: detail.materialLabel,
        sharedColorCode: detail.sharedColorCode,
        sharedColorLabel: detail.sharedColorLabel,
        season: detail.season,
        chainId: detail.chainId,
        sellMode: detail.sellMode,
        planningActive: detail.planningActive,
        notes: detail.notes,
      })
      setSavedPlanId(null)
      setNewMemberRole(detail.setTypeCode === selectedType?.code ? roleOptions(selectedType)[0]?.value ?? null : null)
      return
    }
    const firstType = types?.find((type) => type.active) ?? types?.[0]
    form.resetFields()
    form.setFieldsValue({
      setTypeCode: firstType?.code ?? 'suit',
      sellMode: 'separates',
      planningActive: true,
    })
    setSavedPlanId(null)
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
  const chainOptions = useMemo(
    () => (chains ?? []).filter((chain) => chain.active).map((chain) => ({ value: chain.id, label: chain.label })),
    [chains],
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
      materialCode: clean(values.materialCode),
      materialLabel: clean(values.materialLabel),
      sharedColorCode: clean(values.sharedColorCode),
      sharedColorLabel: clean(values.sharedColorLabel),
      season: clean(values.season),
      chainId: clean(values.chainId),
      sellMode: values.sellMode ?? 'separates',
      planningActive: values.planningActive ?? true,
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
    {
      title: 'Ratio',
      dataIndex: 'quantityRatio',
      width: 105,
      render: (value, record) => (
        <InputNumber
          min={0.001}
          step={0.1}
          value={value}
          style={{ width: 86 }}
          onBlur={(event) => {
            if (!detail) return
            const next = Number(event.target.value)
            if (Number.isFinite(next) && next > 0 && next !== record.quantityRatio) {
              updateMember.mutate({ id: detail.id, skuId: record.skuId, patch: { quantityRatio: next } })
            }
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
      title: 'Ratio',
      width: 105,
      render: (_, record) => (
        <InputNumber
          min={0.001}
          step={0.1}
          value={record.quantityRatio ?? 1}
          style={{ width: 86 }}
          onChange={(quantityRatio) =>
            setDraftMembers((current) =>
              current.map((member) => member.key === record.key ? { ...member, quantityRatio: Number(quantityRatio ?? 1) } : member),
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
            <Form.Item name="materialCode" label="Material Code" style={{ minWidth: 150, flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="materialLabel" label="Material" style={{ minWidth: 200, flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="sharedColorCode" label="Color Code" style={{ minWidth: 140, flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="sharedColorLabel" label="Color Label" style={{ minWidth: 180, flex: 1 }}>
              <Input />
            </Form.Item>
          </Flex>
          <Flex gap={12} wrap="wrap">
            <Form.Item name="chainId" label="Retail Chain" style={{ minWidth: 260, flex: 1 }}>
              <Select allowClear showSearch optionFilterProp="label" options={chainOptions} />
            </Form.Item>
            <Form.Item name="sellMode" label="Sell Mode" style={{ minWidth: 190, flex: 1 }}>
              <Select
                options={[
                  { value: 'separates', label: 'Separates' },
                  { value: 'bundle_required', label: 'Bundle required' },
                ]}
              />
            </Form.Item>
            <Form.Item name="planningActive" label="Planning Active" valuePropName="checked" style={{ width: 150 }}>
              <Switch />
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
          <Tabs
            items={[
              {
                key: 'members',
                label: 'Members',
                children: (
                  <Table
                    rowKey="skuId"
                    size="small"
                    loading={detailLoading}
                    columns={memberColumns}
                    dataSource={detail.members}
                    pagination={false}
                  />
                ),
              },
              {
                key: 'buying-plan',
                label: 'Buying Plan',
                children: (
                  <BuyingPlanPanel
                    plan={buyingPlan}
                    loading={buyingPlanLoading}
                    receiptMonth={receiptMonth}
                    horizonWeeks={horizonWeeks}
                    targetCoverWeeks={targetCoverWeeks}
                    savedPlanId={savedPlanId}
                    saving={saveBuyingPlan.isPending}
                    creatingPo={createPoFromPlan.isPending}
                    onReceiptMonthChange={setReceiptMonth}
                    onHorizonWeeksChange={setHorizonWeeks}
                    onTargetCoverWeeksChange={setTargetCoverWeeks}
                    onRefresh={() => void refetchBuyingPlan()}
                    onSave={async () => {
                      if (!detail) return
                      const saved = await saveBuyingPlan.mutateAsync({
                        id: detail.id,
                        input: {
                          chainId: detail.chainId,
                          receiptMonth,
                          horizonWeeks,
                          targetCoverWeeks,
                        },
                      })
                      setSavedPlanId(saved.planId)
                      message.success('Buying plan saved')
                    }}
                    onCreatePo={async () => {
                      if (!savedPlanId) return
                      const created = await createPoFromPlan.mutateAsync(savedPlanId)
                      message.success(`PO worksheet created: ${created.poNumber}`)
                      setSavedPlanId(null)
                    }}
                  />
                ),
              },
            ]}
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
        initialFilters={skuLookupInitialFilters}
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

function formatMoney(value: number | null | undefined): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function BuyingPlanPanel({
  plan,
  loading,
  receiptMonth,
  horizonWeeks,
  targetCoverWeeks,
  savedPlanId,
  saving,
  creatingPo,
  onReceiptMonthChange,
  onHorizonWeeksChange,
  onTargetCoverWeeksChange,
  onRefresh,
  onSave,
  onCreatePo,
}: {
  plan: MatchingSetBuyingPlan | undefined
  loading: boolean
  receiptMonth: string
  horizonWeeks: number
  targetCoverWeeks: number
  savedPlanId: string | null
  saving: boolean
  creatingPo: boolean
  onReceiptMonthChange: (value: string) => void
  onHorizonWeeksChange: (value: number) => void
  onTargetCoverWeeksChange: (value: number) => void
  onRefresh: () => void
  onSave: () => Promise<void>
  onCreatePo: () => Promise<void>
}) {
  const [workflowOpen, setWorkflowOpen] = useState(false)

  const roleColumns: ColumnsType<MatchingSetBuyingPlanMember> = [
    { title: 'Role', dataIndex: 'roleLabelEs', width: 130 },
    {
      title: 'SKU',
      width: 130,
      render: (_, record) => record.skuCode ? <SkuLink skuCode={record.skuCode}>{record.skuCode}</SkuLink> : '-',
    },
    { title: 'Ratio', dataIndex: 'quantityRatio', width: 80, align: 'right' },
    { title: 'On Hand', dataIndex: 'onHand', width: 90, align: 'right', render: formatNumber },
    { title: 'On Order', dataIndex: 'onOrder', width: 90, align: 'right', render: formatNumber },
    { title: 'Sales', dataIndex: 'salesLookback', width: 80, align: 'right', render: formatNumber },
    { title: 'WOS', dataIndex: 'weeksOfSupply', width: 80, align: 'right', render: (v) => v == null ? '-' : formatMoney(v) },
    { title: 'Base Buy', dataIndex: 'baseRecommendedQty', width: 90, align: 'right', render: formatNumber },
    { title: 'Balanced Buy', dataIndex: 'recommendedQty', width: 110, align: 'right', render: formatNumber },
    { title: 'Orphans', dataIndex: 'orphanQty', width: 90, align: 'right', render: formatNumber },
  ]

  const sizeColumns: ColumnsType<MatchingSetBuyingPlanSizeLine> = [
    { title: 'Role', dataIndex: 'roleCode', width: 100 },
    {
      title: 'SKU',
      width: 130,
      render: (_, record) => record.skuCode ? <SkuLink skuCode={record.skuCode}>{record.skuCode}</SkuLink> : '-',
    },
    { title: 'Size', dataIndex: 'sizeLabel', width: 120 },
    { title: 'On Hand', dataIndex: 'onHand', width: 85, align: 'right', render: formatNumber },
    { title: 'On Order', dataIndex: 'onOrder', width: 85, align: 'right', render: formatNumber },
    { title: 'Sales', dataIndex: 'salesLookback', width: 80, align: 'right', render: formatNumber },
    { title: 'Projected', dataIndex: 'projectedSales', width: 90, align: 'right', render: formatNumber },
    { title: 'Target EOH', dataIndex: 'targetEnding', width: 95, align: 'right', render: formatNumber },
    { title: 'Buy', dataIndex: 'recommendedQty', width: 80, align: 'right', render: formatNumber },
  ]

  const otbColumns: ColumnsType<MatchingSetOtbImpactRow> = [
    { title: 'Department', render: (_, r) => r.departmentName ?? r.departmentNumber ?? '-' },
    { title: 'Category', render: (_, r) => r.categoryName ?? r.categoryNumber ?? '-' },
    { title: 'Units', dataIndex: 'proposedUnits', width: 80, align: 'right', render: formatNumber },
    { title: 'Proposed Cost', dataIndex: 'proposedCost', width: 120, align: 'right', render: formatMoney },
    { title: 'Proposed Retail', dataIndex: 'proposedRetail', width: 120, align: 'right', render: formatMoney },
    { title: 'Committed Cost', dataIndex: 'committedCost', width: 125, align: 'right', render: formatMoney },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 100,
      render: (status) => <Tag color={status === 'NO_PLAN' ? 'gold' : status === 'BLOCK' ? 'red' : 'green'}>{status}</Tag>,
    },
  ]

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Flex justify="space-between" align="start" gap={12} wrap="wrap">
        <Alert
          type="info"
          showIcon
          style={{ flex: 1, minWidth: 360 }}
          message="Amounts in Lempira (HNL). OTB preview is Postgres-safe; if no Postgres OTB plan exists yet, status shows NO_PLAN instead of reading legacy SQLite budgets."
        />
        <Button icon={<QuestionCircleOutlined />} onClick={() => setWorkflowOpen(true)}>
          Buyer Workflow
        </Button>
      </Flex>
      <Flex gap={8} wrap="wrap" align="end">
        <div>
          <Typography.Text type="secondary">Receipt month</Typography.Text>
          <Input
            type="month"
            value={receiptMonth}
            onChange={(event) => onReceiptMonthChange(event.target.value)}
            style={{ display: 'block', width: 150 }}
          />
        </div>
        <div>
          <Typography.Text type="secondary">Horizon weeks</Typography.Text>
          <InputNumber
            min={1}
            max={52}
            value={horizonWeeks}
            onChange={(value) => onHorizonWeeksChange(Number(value ?? 13))}
            style={{ display: 'block', width: 130 }}
          />
        </div>
        <div>
          <Typography.Text type="secondary">Target cover weeks</Typography.Text>
          <InputNumber
            min={1}
            max={52}
            value={targetCoverWeeks}
            onChange={(value) => onTargetCoverWeeksChange(Number(value ?? 8))}
            style={{ display: 'block', width: 160 }}
          />
        </div>
        <Button onClick={onRefresh} loading={loading}>Recalculate</Button>
        <Button type="primary" onClick={() => void onSave()} loading={saving} disabled={!plan || (plan.recommendedUnits ?? 0) <= 0}>
          Save Plan
        </Button>
        <Button onClick={() => void onCreatePo()} loading={creatingPo} disabled={!savedPlanId}>
          Create PO Worksheet
        </Button>
      </Flex>

      {plan?.warnings.map((warning) => (
        <Alert key={warning} type="warning" showIcon message={warning} />
      ))}

      <Flex gap={12} wrap="wrap">
        <Card size="small" title="Complete Set Capacity" style={{ minWidth: 180, flex: 1 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>{formatNumber(plan?.completeSetCapacity)}</Typography.Title>
        </Card>
        <Card size="small" title="Bottleneck" style={{ minWidth: 180, flex: 1 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>{plan?.bottleneckRoleCode ?? '-'}</Typography.Title>
        </Card>
        <Card size="small" title="Orphan Units" style={{ minWidth: 180, flex: 1 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>{formatNumber(plan?.orphanUnits)}</Typography.Title>
        </Card>
        <Card size="small" title="Recommended Buy" style={{ minWidth: 180, flex: 1 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>{formatNumber(plan?.recommendedUnits)}</Typography.Title>
          <Typography.Text type="secondary">{formatMoney(plan?.recommendedCost)} cost</Typography.Text>
        </Card>
      </Flex>

      <Divider orientation="left">Roles</Divider>
      <Table
        rowKey={(record) => record.skuId}
        size="small"
        loading={loading}
        columns={roleColumns}
        dataSource={plan?.members ?? []}
        pagination={false}
        scroll={{ x: 1000 }}
      />

      <Divider orientation="left">Size Recommendation</Divider>
      <Table
        rowKey={(record) => `${record.skuId}:${record.columnLabel}:${record.rowLabel}`}
        size="small"
        loading={loading}
        columns={sizeColumns}
        dataSource={(plan?.sizeLines ?? []).filter((line) => line.recommendedQty > 0)}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 980 }}
      />

      <Divider orientation="left">OTB Preview</Divider>
      <Table
        rowKey={(record) => `${record.departmentNumber ?? ''}:${record.categoryNumber ?? ''}`}
        size="small"
        loading={loading}
        columns={otbColumns}
        dataSource={plan?.otbImpact ?? []}
        pagination={false}
      />

      <Modal
        open={workflowOpen}
        title={matchingSetSuitBuyingHelp.title}
        onCancel={() => setWorkflowOpen(false)}
        footer={<Button onClick={() => setWorkflowOpen(false)}>Close</Button>}
        width={760}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {matchingSetSuitBuyingHelp.subtitle}
          </Typography.Paragraph>

          <Card size="small" title="Context for this screen">
            <Space direction="vertical" size={8}>
              {matchingSetSuitBuyingHelp.context.map((item) => (
                <Typography.Text key={item}>{item}</Typography.Text>
              ))}
            </Space>
          </Card>

          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {matchingSetSuitBuyingHelp.steps.map((step, index) => (
              <Card
                key={step.title}
                size="small"
                title={`${index + 1}. ${step.title}`}
                styles={{ body: { paddingTop: 8 } }}
              >
                <Typography.Paragraph style={{ marginBottom: 0 }}>{step.body}</Typography.Paragraph>
              </Card>
            ))}
          </Space>
        </Space>
      </Modal>
    </Space>
  )
}
