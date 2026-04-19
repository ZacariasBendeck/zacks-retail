import { Button, Card, Form, Input, Space, Typography, App } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import {
  useCreateKeyword,
  useKeyword,
  useUpdateKeyword,
} from '../../hooks/useProductsTaxonomy'
import type { KeywordInput } from '../../types/productsTaxonomy'

export default function KeywordFormPage() {
  const { keyword } = useParams<{ keyword: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<KeywordInput>()
  const editing = keyword != null && keyword !== 'new'
  const k = editing ? decodeURIComponent(keyword) : undefined
  const { data } = useKeyword(k)
  const create = useCreateKeyword()
  const update = useUpdateKeyword()

  useEffect(() => {
    if (editing && data) form.setFieldsValue(data)
  }, [editing, data, form])

  const onFinish = async (values: KeywordInput) => {
    try {
      if (editing && k) {
        await update.mutateAsync({ keyword: k, patch: values })
        message.success('Keyword updated')
      } else {
        await create.mutateAsync(values)
        message.success('Keyword created')
      }
      navigate('/products/taxonomy/keywords')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Card title={<Typography.Text strong>{editing ? 'Edit keyword' : 'New keyword'}</Typography.Text>}>
      <Form<KeywordInput> form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="keyword"
          label="Keyword"
          rules={[
            { required: true, message: 'Keyword is required' },
            { max: 10, message: 'Max 10 characters (RICS p. 165)' },
            { pattern: /^\S+$/, message: 'No whitespace — space is the separator on SKUs' },
          ]}
        >
          <Input disabled={editing} maxLength={10} />
        </Form.Item>
        <Form.Item name="description" label="Description" rules={[{ max: 40 }]}>
          <Input />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={create.isPending || update.isPending}>
            Save
          </Button>
          <Button onClick={() => navigate('/products/taxonomy/keywords')}>Cancel</Button>
        </Space>
      </Form>
    </Card>
  )
}
