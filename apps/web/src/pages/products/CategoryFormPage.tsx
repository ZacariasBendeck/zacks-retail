import { App, Button, Card, Form, Input, InputNumber, Space, Typography } from 'antd'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useCategory,
  useCreateCategory,
  useUpdateCategory,
} from '../../hooks/useProductsTaxonomy'
import type { CategoryInput } from '../../types/productsTaxonomy'

export default function CategoryFormPage() {
  const { number } = useParams<{ number: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<CategoryInput>()
  const editing = number != null && number !== 'new'
  const n = editing ? Number(number) : undefined
  const { data } = useCategory(n)
  const create = useCreateCategory()
  const update = useUpdateCategory()

  useEffect(() => {
    if (editing && data) {
      form.setFieldsValue({
        number: data.number,
        description: data.description,
      })
    }
  }, [editing, data, form])

  const onFinish = async (values: CategoryInput) => {
    try {
      if (editing && n != null) {
        await update.mutateAsync({ number: n, patch: { description: values.description } })
        message.success('Category updated')
      } else {
        await create.mutateAsync(values)
        message.success('Category created')
      }
      navigate('/products/taxonomy/categories')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Card title={<Typography.Text strong>{editing ? 'Edit category' : 'New category'}</Typography.Text>}>
      <Form<CategoryInput> form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="number"
          label="Number"
          rules={[
            { required: true, message: 'Category number is required' },
            { type: 'number', min: 1, max: 999, message: 'Must be between 1 and 999 (RICS p. 145)' },
          ]}
        >
          <InputNumber min={1} max={999} disabled={editing} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="description"
          label="Description"
          rules={[
            { required: true, message: 'Description is required' },
            { max: 20, message: 'Max 20 characters' },
          ]}
        >
          <Input />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={create.isPending || update.isPending}>
            Save
          </Button>
          <Button onClick={() => navigate('/products/taxonomy/categories')}>Cancel</Button>
        </Space>
      </Form>
    </Card>
  )
}
