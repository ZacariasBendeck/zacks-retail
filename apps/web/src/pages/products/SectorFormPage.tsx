import { Button, Card, Form, Input, InputNumber, Space, Typography, App } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import {
  useCreateSector,
  useSector,
  useUpdateSector,
} from '../../hooks/useProductsTaxonomy'
import type { SectorInput } from '../../types/productsTaxonomy'

export default function SectorFormPage() {
  const { number } = useParams<{ number: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<SectorInput>()
  const editing = number != null && number !== 'new'
  const n = editing ? Number(number) : undefined
  const { data } = useSector(n)
  const create = useCreateSector()
  const update = useUpdateSector()

  useEffect(() => {
    if (editing && data) form.setFieldsValue(data)
  }, [editing, data, form])

  const onFinish = async (values: SectorInput) => {
    try {
      if (editing && n != null) {
        await update.mutateAsync({ number: n, patch: values })
        message.success('Sector updated')
      } else {
        await create.mutateAsync(values)
        message.success('Sector created')
      }
      navigate('/products/taxonomy/sectors')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Card title={<Typography.Text strong>{editing ? 'Edit sector' : 'New sector'}</Typography.Text>}>
      <Form<SectorInput> form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="number" label="Number" rules={[{ required: true, type: 'number', min: 1, max: 99 }]}>
          <InputNumber min={1} max={99} disabled={editing} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="description" label="Description" rules={[{ required: true, max: 20 }]}>
          <Input />
        </Form.Item>
        <Form.Item name="begDept" label="Begin Department" rules={[{ required: true, type: 'number', min: 1, max: 99 }]}>
          <InputNumber min={1} max={99} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="endDept" label="End Department" rules={[{ required: true, type: 'number', min: 1, max: 99 }]}>
          <InputNumber min={1} max={99} style={{ width: '100%' }} />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={create.isPending || update.isPending}>
            Save
          </Button>
          <Button onClick={() => navigate('/products/taxonomy/sectors')}>Cancel</Button>
        </Space>
      </Form>
    </Card>
  )
}
