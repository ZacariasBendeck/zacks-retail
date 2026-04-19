import { Button, Card, Form, Input, Space, Typography, App } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import {
  useCreateGroup,
  useGroup,
  useUpdateGroup,
} from '../../hooks/useProductsTaxonomy'
import type { GroupInput } from '../../types/productsTaxonomy'

export default function GroupFormPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<GroupInput>()
  const editing = code != null && code !== 'new'
  const c = editing ? decodeURIComponent(code) : undefined
  const { data } = useGroup(c)
  const create = useCreateGroup()
  const update = useUpdateGroup()

  useEffect(() => {
    if (editing && data) form.setFieldsValue(data)
  }, [editing, data, form])

  const onFinish = async (values: GroupInput) => {
    try {
      if (editing && c) {
        await update.mutateAsync({ code: c, patch: values })
        message.success('Group updated')
      } else {
        await create.mutateAsync(values)
        message.success('Group created')
      }
      navigate('/products/taxonomy/groups')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Card title={<Typography.Text strong>{editing ? 'Edit group' : 'New group'}</Typography.Text>}>
      <Form<GroupInput> form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="code"
          label="Code"
          rules={[
            { required: true, message: 'Code is required' },
            { pattern: /^[A-Za-z0-9]{1,3}$/, message: '1–3 alphanumeric characters (RICS p. 145)' },
          ]}
        >
          <Input disabled={editing} maxLength={3} style={{ textTransform: 'uppercase' }} />
        </Form.Item>
        <Form.Item name="description" label="Description" rules={[{ required: true, max: 20 }]}>
          <Input />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={create.isPending || update.isPending}>
            Save
          </Button>
          <Button onClick={() => navigate('/products/taxonomy/groups')}>Cancel</Button>
        </Space>
      </Form>
    </Card>
  )
}
