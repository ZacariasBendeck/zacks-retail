import { Button, Card, Form, Input, InputNumber, Space, Switch, Typography, App } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import {
  useCreateReturnCode,
  useReturnCode,
  useUpdateReturnCode,
} from '../../hooks/useProductsTaxonomy'
import type { ReturnCodeInput } from '../../types/productsTaxonomy'

export default function ReturnCodeFormPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<ReturnCodeInput>()
  const editing = code != null && code !== 'new'
  const n = editing ? Number(code) : undefined
  const { data } = useReturnCode(n)
  const create = useCreateReturnCode()
  const update = useUpdateReturnCode()

  useEffect(() => {
    if (editing && data) form.setFieldsValue(data)
  }, [editing, data, form])

  const onFinish = async (values: ReturnCodeInput) => {
    try {
      if (editing && n != null) {
        await update.mutateAsync({ code: n, patch: values })
        message.success('Return code updated')
      } else {
        await create.mutateAsync(values)
        message.success('Return code created')
      }
      navigate('/products/taxonomy/return-codes')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Card title={<Typography.Text strong>{editing ? 'Edit return code' : 'New return code'}</Typography.Text>}>
      <Form<ReturnCodeInput>
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{ trackable: false }}
      >
        <Form.Item name="code" label="Code" rules={[{ required: true, type: 'number', min: 1, max: 99 }]}>
          <InputNumber min={1} max={99} disabled={editing} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="description" label="Description" rules={[{ required: true, max: 30 }]}>
          <Input />
        </Form.Item>
        <Form.Item name="trackable" label="Trackable" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={create.isPending || update.isPending}>
            Save
          </Button>
          <Button onClick={() => navigate('/products/taxonomy/return-codes')}>Cancel</Button>
        </Space>
      </Form>
    </Card>
  )
}
