import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Card,
  Form,
  Input,
  InputNumber,
  Button,
  Space,
  Switch,
  App,
  Divider,
  Row,
  Col,
  Table,
  Select,
  DatePicker,
  Tabs,
  Statistic,
  Typography,
  Alert,
  Tag,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, DeleteOutlined, PlusOutlined, EditOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  useCustomer,
  useCustomerBalances,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  useCreateFamilyMember,
  useUpdateFamilyMember,
  useDeleteFamilyMember,
} from '../../hooks/useCustomers'
import { DraggableModal } from '../../components/draggable-modal'
import { CustomerTicketHistoryButton } from '../../components/customers/CustomerTicketHistoryButton'
import type { FamilyMember, FamilyMemberCreatePayload } from '../../types/customer'

export default function CustomerFormPage() {
  const { customerId } = useParams<{ customerId: string }>()
  const isEdit = !!customerId
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const [form] = Form.useForm()

  const { data: customer, isLoading } = useCustomer(customerId)
  const { data: balances } = useCustomerBalances(customerId)
  const createCustomer = useCreateCustomer()
  const updateCustomer = useUpdateCustomer()
  const deleteCustomer = useDeleteCustomer()
  const isReadOnlyCustomer = customer?.source === 'mirror' || customer?.source === 'imported'

  useEffect(() => {
    if (customer) {
      form.setFieldsValue({
        accountNumber: customer.accountNumber,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phoneE164: customer.phoneE164,
        email: customer.email,
        addressLine1: customer.addressLine1,
        addressLine2: customer.addressLine2,
        city: customer.city,
        stateRegion: customer.stateRegion,
        postalCode: customer.postalCode,
        country: customer.country,
        creditLimit: customer.creditLimit,
        alertFlag: customer.alertFlag,
        alertMessage: customer.alertMessage,
        comments: customer.comments,
        marketingOptIn: customer.marketingOptIn,
        active: customer.active,
      })
    }
  }, [customer, form])

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      if (isEdit && customerId) {
        await updateCustomer.mutateAsync({ id: customerId, payload: values })
        message.success('Customer updated.')
      } else {
        const created = await createCustomer.mutateAsync(values)
        message.success('Customer created.')
        navigate(`/customers/${created.id}/edit`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save customer'
      message.error(msg)
    }
  }

  const handleDelete = () => {
    if (!customerId) return
    modal.confirm({
      title: 'Delete this customer?',
      content: 'This cannot be undone. Customers with live sales tickets cannot be deleted.',
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteCustomer.mutateAsync(customerId)
          message.success('Customer deleted.')
          navigate('/customers')
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to delete customer'
          message.error(msg)
        }
      },
    })
  }

  return (
    <Card
      title={
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/customers')} />
          {isEdit ? customer?.displayName ?? 'Customer' : 'New Customer'}
          {customer?.source === 'imported' ? <Tag color="blue">Imported Postgres</Tag> : null}
          {customer?.source === 'mirror' ? <Tag color="blue">RICS mirror</Tag> : null}
        </Space>
      }
      extra={
        isEdit && customer ? (
          <Space>
            <CustomerTicketHistoryButton
              customerId={customer.id}
              customerName={customer.displayName}
            />
            {!isReadOnlyCustomer ? (
              <Button danger icon={<DeleteOutlined />} onClick={handleDelete} loading={deleteCustomer.isPending}>
                Delete
              </Button>
            ) : null}
          </Space>
        ) : null
      }
      loading={isEdit && isLoading}
    >
      {customer?.source === 'imported' ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Read-only imported customer"
          description="This record is coming from the imported Postgres customer-intelligence tables. Editing and family-member writes stay disabled until the app-owned write path is extended to this surface."
        />
      ) : null}
      {customer?.source === 'mirror' ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Read-only mirror customer"
          description="This record is coming from the RICS mirror in Postgres. Editing and family-member writes stay disabled until the CRM write path is designed."
        />
      ) : null}

      {isEdit && balances && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Statistic title="A/R Balance" value={balances.arBalanceCents / 100} precision={2}  />
          </Col>
          <Col span={6}>
            <Statistic title="Store Credit" value={balances.storeCreditCents / 100} precision={2}  />
          </Col>
          <Col span={6}>
            <Statistic title="YTD Sales" value={(customer?.ytdSalesCents ?? 0) / 100} precision={2}  />
          </Col>
          <Col span={6}>
            <Statistic
              title="Last Purchase"
              value={customer?.dateOfLastPurchase ? dayjs(customer.dateOfLastPurchase).format('YYYY-MM-DD') : '—'}
            />
          </Col>
        </Row>
      )}

      <Tabs
        items={[
          {
            key: 'info',
            label: 'Customer info',
            children: (
              <Form form={form} layout="vertical" onFinish={handleSubmit} disabled={isReadOnlyCustomer}>
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item
                      label="Account #"
                      name="accountNumber"
                      tooltip="Leave blank to derive from phone (RICS convention)"
                    >
                      <Input maxLength={15} placeholder="Auto-derived from phone if blank" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="First name" name="firstName">
                      <Input maxLength={50} />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="Last name" name="lastName">
                      <Input maxLength={50} />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item label="Phone" name="phoneE164">
                      <Input maxLength={20} placeholder="+15551234567" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="Email" name="email" rules={[{ type: 'email' }]}>
                      <Input maxLength={200} />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="Credit limit" name="creditLimit">
                      <InputNumber min={0} precision={2}  style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Divider orientation="left">Address</Divider>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="Address line 1" name="addressLine1">
                      <Input maxLength={200} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="Address line 2" name="addressLine2">
                      <Input maxLength={200} />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item label="City" name="city">
                      <Input maxLength={100} />
                    </Form.Item>
                  </Col>
                  <Col span={4}>
                    <Form.Item label="State" name="stateRegion">
                      <Input maxLength={100} />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item label="Postal code" name="postalCode">
                      <Input maxLength={20} />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item label="Country" name="country">
                      <Input maxLength={100} />
                    </Form.Item>
                  </Col>
                </Row>

                <Divider orientation="left">ALERT + flags</Divider>
                <Row gutter={16}>
                  <Col span={6}>
                    <Form.Item label="ALERT flag" name="alertFlag" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  </Col>
                  <Col span={18}>
                    <Form.Item
                      label="ALERT message (displayed at POS before sale entry)"
                      name="alertMessage"
                      tooltip="RICS p. 117 — replaces the magic [ALERT] comment prefix"
                    >
                      <Input.TextArea rows={2} maxLength={500} />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="Marketing opt-in" name="marketingOptIn" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  </Col>
                  {isEdit && (
                    <Col span={12}>
                      <Form.Item label="Active" name="active" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    </Col>
                  )}
                </Row>

                <Form.Item label="Comments" name="comments">
                  <Input.TextArea rows={3} maxLength={2000} />
                </Form.Item>

                <Space>
                  {!isReadOnlyCustomer ? (
                    <Button
                      type="primary"
                      htmlType="submit"
                      icon={<SaveOutlined />}
                      loading={createCustomer.isPending || updateCustomer.isPending}
                    >
                      {isEdit ? 'Save' : 'Create'}
                    </Button>
                  ) : null}
                  <Button onClick={() => navigate('/customers')}>Cancel</Button>
                </Space>
              </Form>
            ),
          },
          ...(isEdit
            ? [
                {
                  key: 'family',
                  label: `Family members${customer?.familyMembers.length ? ` (${customer.familyMembers.length})` : ''}`,
                  children: (
                    <FamilyMemberPanel
                      customerId={customerId!}
                      members={customer?.familyMembers ?? []}
                      readOnly={isReadOnlyCustomer}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
    </Card>
  )
}

function FamilyMemberPanel({
  customerId,
  members,
  readOnly = false,
}: {
  customerId: string
  members: FamilyMember[]
  readOnly?: boolean
}) {
  const { message, modal } = App.useApp()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FamilyMember | null>(null)
  const [form] = Form.useForm()

  const createMember = useCreateFamilyMember(customerId)
  const updateMember = useUpdateFamilyMember(customerId)
  const deleteMember = useDeleteFamilyMember(customerId)

  const openForCreate = () => {
    setEditing(null)
    form.resetFields()
    setOpen(true)
  }

  const openForEdit = (m: FamilyMember) => {
    setEditing(m)
    form.setFieldsValue({
      code: m.code,
      firstName: m.firstName,
      lastName: m.lastName,
      gender: m.gender,
      birthday: m.birthday ? dayjs(m.birthday) : null,
      comments: m.comments,
    })
    setOpen(true)
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    const payload: FamilyMemberCreatePayload = {
      code: values.code as string,
      firstName: (values.firstName as string) ?? null,
      lastName: (values.lastName as string) ?? null,
      gender: (values.gender as 'M' | 'F' | 'C' | null) ?? null,
      birthday: values.birthday ? (values.birthday as dayjs.Dayjs).format('YYYY-MM-DD') : null,
      comments: (values.comments as string) ?? null,
    }
    try {
      if (editing) {
        await updateMember.mutateAsync({ familyId: editing.id, payload })
        message.success('Family member updated.')
      } else {
        await createMember.mutateAsync(payload)
        message.success('Family member added.')
      }
      setOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save family member'
      message.error(msg)
    }
  }

  const handleDelete = (m: FamilyMember) => {
    modal.confirm({
      title: `Remove family member ${m.code}?`,
      okText: 'Remove',
      okType: 'danger',
      onOk: async () => {
        await deleteMember.mutateAsync(m.id)
        message.success('Family member removed.')
      },
    })
  }

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        {!readOnly ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={openForCreate}>
            Add family member
          </Button>
        ) : null}
        <Typography.Text type="secondary">RICS p. 118 — 2-char code per family member</Typography.Text>
      </Space>

      <Table
        rowKey="id"
        size="small"
        dataSource={members}
        pagination={false}
        columns={[
          { title: 'Code', dataIndex: 'code', key: 'code', width: 80 },
          { title: 'First name', dataIndex: 'firstName', key: 'firstName' },
          { title: 'Last name', dataIndex: 'lastName', key: 'lastName' },
          {
            title: 'Gender',
            dataIndex: 'gender',
            key: 'gender',
            width: 80,
            render: (v: string | null) => v ?? '—',
          },
          { title: 'Birthday', dataIndex: 'birthday', key: 'birthday', width: 120, render: (v: string | null) => v ?? '—' },
          ...(!readOnly
            ? [
                {
                  title: '',
                  key: 'actions',
                  width: 120,
                  render: (_: unknown, m: FamilyMember) => (
                    <Space>
                      <Button size="small" icon={<EditOutlined />} onClick={() => openForEdit(m)} />
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(m)} />
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />

      {!readOnly ? (
      <DraggableModal
        title={editing ? `Edit ${editing.code}` : 'Add family member'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMember.isPending || updateMember.isPending}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="Code" name="code" rules={[{ required: true, max: 2 }]}>
                <Input maxLength={2} />
              </Form.Item>
            </Col>
            <Col span={9}>
              <Form.Item label="First name" name="firstName">
                <Input maxLength={50} />
              </Form.Item>
            </Col>
            <Col span={9}>
              <Form.Item label="Last name" name="lastName">
                <Input maxLength={50} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="Gender" name="gender">
                <Select
                  allowClear
                  options={[
                    { value: 'M', label: 'M — Male' },
                    { value: 'F', label: 'F — Female' },
                    { value: 'C', label: 'C — Child' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Birthday" name="birthday">
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Comments" name="comments">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      </DraggableModal>
      ) : null}
    </>
  )
}
