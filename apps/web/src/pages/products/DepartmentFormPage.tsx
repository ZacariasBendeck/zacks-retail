import { Button, Card, Form, Input, InputNumber, Space, Typography, App } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import {
  useCreateDepartment,
  useDepartment,
  useUpdateDepartment,
} from '../../hooks/useProductsTaxonomy'
import type { DepartmentInput } from '../../types/productsTaxonomy'

export default function DepartmentFormPage() {
  const { number } = useParams<{ number: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<DepartmentInput>()
  const editing = number != null && number !== 'new'
  const n = editing ? Number(number) : undefined
  const { data } = useDepartment(n)
  const create = useCreateDepartment()
  const update = useUpdateDepartment()

  useEffect(() => {
    if (editing && data) {
      form.setFieldsValue(data)
    }
  }, [editing, data, form])

  const onFinish = async (values: DepartmentInput) => {
    try {
      if (editing && n != null) {
        await update.mutateAsync({ number: n, patch: values })
        message.success('Department updated')
      } else {
        await create.mutateAsync(values)
        message.success('Department created')
      }
      navigate('/products/taxonomy/departments')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Card title={<Typography.Text strong>{editing ? 'Edit department' : 'New department'}</Typography.Text>}>
      <Form<DepartmentInput> form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="number"
          label="Number"
          rules={[
            { required: true, message: 'Department number is required' },
            { type: 'number', min: 1, max: 99, message: 'Must be between 1 and 99 (RICS p. 144)' },
          ]}
        >
          <InputNumber min={1} max={99} disabled={editing} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="description"
          label="Description"
          rules={[
            { required: true, message: 'Description is required' },
            { max: 16, message: 'Max 16 characters' },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="begCateg"
          label="Begin Category"
          rules={[{ required: true, type: 'number', min: 1, max: 999 }]}
        >
          <InputNumber min={1} max={999} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="endCateg"
          label="End Category"
          rules={[{ required: true, type: 'number', min: 1, max: 999 }]}
        >
          <InputNumber min={1} max={999} style={{ width: '100%' }} />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={create.isPending || update.isPending}>
            Save
          </Button>
          <Button onClick={() => navigate('/products/taxonomy/departments')}>Cancel</Button>
        </Space>
      </Form>
    </Card>
  )
}
