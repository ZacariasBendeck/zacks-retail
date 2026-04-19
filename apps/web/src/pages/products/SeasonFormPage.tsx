import { App, Button, Card, Form, Input, Space, Typography } from 'antd'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSeason, useUpdateSeason } from '../../hooks/useProductsTaxonomy'

interface FormShape {
  code: string
  description: string
}

/**
 * Edit the description for one of the 20 fixed RICS season slots. The code
 * itself cannot change — RICS pins the 20 codes (0, V–Z, 1–9, A–E). "New" is
 * not exposed as a path; adding a season means picking an empty slot from the
 * list and editing its description.
 */
export default function SeasonFormPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<FormShape>()
  const { data } = useSeason(code)
  const update = useUpdateSeason()

  useEffect(() => {
    if (data) {
      form.setFieldsValue({ code: data.code, description: data.description ?? '' })
    } else if (code) {
      form.setFieldsValue({ code })
    }
  }, [code, data, form])

  const onFinish = async (values: FormShape) => {
    if (!code) return
    try {
      await update.mutateAsync({ code, patch: { description: values.description } })
      message.success('Season description saved')
      navigate('/products/taxonomy/seasons')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <Card title={<Typography.Text strong>Edit season: {code}</Typography.Text>}>
      <Form<FormShape> form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="code" label="Code (fixed — RICS p. 218)">
          <Input disabled />
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
          <Button type="primary" htmlType="submit" loading={update.isPending}>
            Save
          </Button>
          <Button onClick={() => navigate('/products/taxonomy/seasons')}>Cancel</Button>
        </Space>
      </Form>
    </Card>
  )
}
