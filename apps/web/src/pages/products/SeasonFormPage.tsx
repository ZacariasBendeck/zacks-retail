import { App, Button, Card, Form, Input, Space, Typography } from 'antd'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useCreateSeason,
  useSeason,
  useUpdateSeason,
} from '../../hooks/useProductsTaxonomy'
import type { SeasonInput } from '../../types/productsTaxonomy'

export default function SeasonFormPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<SeasonInput>()
  const editing = code != null && code !== 'new'
  const { data } = useSeason(editing ? code : undefined)
  const create = useCreateSeason()
  const update = useUpdateSeason()

  useEffect(() => {
    if (editing && data) {
      form.setFieldsValue({ code: data.code, description: data.description })
    }
  }, [editing, data, form])

  const onFinish = async (values: SeasonInput) => {
    try {
      if (editing && code) {
        await update.mutateAsync({ code, patch: { description: values.description } })
        message.success('Season updated')
      } else {
        await create.mutateAsync(values)
        message.success('Season created')
      }
      navigate('/products/taxonomy/seasons')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Card
      title={
        <Typography.Text strong>{editing ? `Edit season: ${code}` : 'New season'}</Typography.Text>
      }
    >
      <Form<SeasonInput> form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="code"
          label="Code (1–2 chars, alphanumeric)"
          rules={[
            { required: true, message: 'Code is required' },
            { max: 2, message: 'Max 2 characters' },
            { pattern: /^[A-Za-z0-9]+$/, message: 'Alphanumeric only' },
          ]}
        >
          <Input disabled={editing} maxLength={2} style={{ textTransform: 'uppercase' }} />
        </Form.Item>
        <Form.Item
          name="description"
          label="Description"
          rules={[
            { required: true, message: 'Description is required' },
            { max: 32, message: 'Max 32 characters' },
          ]}
        >
          <Input maxLength={32} placeholder="e.g. PRIM 26" />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={create.isPending || update.isPending}>
            Save
          </Button>
          <Button onClick={() => navigate('/products/taxonomy/seasons')}>Cancel</Button>
        </Space>
      </Form>
    </Card>
  )
}
