import { Button, Card, Form, Input, InputNumber, Space, Typography, App } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import {
  useCreatePromotionCode,
  usePromotionCode,
  useUpdatePromotionCode,
} from '../../hooks/useProductsTaxonomy'
import type { PromotionCodeInput } from '../../types/productsTaxonomy'

export default function PromotionCodeFormPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<PromotionCodeInput>()
  const editing = code != null && code !== 'new'
  const c = editing ? decodeURIComponent(code) : undefined
  const { data } = usePromotionCode(c)
  const create = useCreatePromotionCode()
  const update = useUpdatePromotionCode()

  useEffect(() => {
    if (editing && data) form.setFieldsValue(data)
  }, [editing, data, form])

  const onFinish = async (values: PromotionCodeInput) => {
    try {
      if (editing && c) {
        await update.mutateAsync({ code: c, patch: values })
        message.success('Promotion code updated')
      } else {
        await create.mutateAsync(values)
        message.success('Promotion code created')
      }
      navigate('/products/taxonomy/promotion-codes')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Card title={<Typography.Text strong>{editing ? 'Edit promotion code' : 'New promotion code'}</Typography.Text>}>
      <Form<PromotionCodeInput> form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="code"
          label="Code"
          rules={[
            { required: true },
            { pattern: /^[A-Za-z0-9]{1,6}$/, message: '1–6 alphanumeric characters (RICS p. 167)' },
          ]}
        >
          <Input disabled={editing} maxLength={6} style={{ textTransform: 'uppercase' }} />
        </Form.Item>
        <Form.Item name="description" label="Description" rules={[{ required: true, max: 40 }]}>
          <Input />
        </Form.Item>
        <Form.Item name="pieces" label="Pieces">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="cost" label="Cost">
          <InputNumber min={0} step={0.01} style={{ width: '100%' }} prefix="$" />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={create.isPending || update.isPending}>
            Save
          </Button>
          <Button onClick={() => navigate('/products/taxonomy/promotion-codes')}>Cancel</Button>
        </Space>
      </Form>
    </Card>
  )
}
