import { useEffect, useState } from 'react'
import { App, Button, Form, Input, Radio } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { DraggableModal } from '../draggable-modal'
import { useCreateReportTemplate } from '../../hooks/useReportTemplates'
import type { ReportType, TemplateVisibility } from '../../services/reportTemplatesApi'

interface Props {
  reportType: ReportType
  // The current form state for this page. Passed by parent at click-time so we
  // always save the live values, not a stale captured snapshot.
  getParamsJson: () => Record<string, unknown>
  // Disabled until the user has actually run the report at least once.
  disabled?: boolean
}

interface FormValues {
  title: string
  visibility: TemplateVisibility
}

/**
 * Save the current report form state as a reusable template. Opens a small
 * modal for title + visibility; on submit calls POST /reports/templates.
 * DB stores visibility as 'shared' but the UI says "Visible to all
 * signed-in users" so operators don't misread the scope.
 */
export default function SaveAsTemplateButton({ reportType, getParamsJson, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<FormValues>()
  const { message } = App.useApp()
  const create = useCreateReportTemplate()

  useEffect(() => {
    if (open) {
      form.resetFields()
      form.setFieldsValue({ title: '', visibility: 'private' })
    }
  }, [open, form])

  const handleOk = async () => {
    const vals = await form.validateFields()
    try {
      await create.mutateAsync({
        reportType,
        title: vals.title,
        paramsJson: getParamsJson(),
        visibility: vals.visibility,
      })
      message.success(`Template "${vals.title}" saved`)
      setOpen(false)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <>
      <Button
        icon={<SaveOutlined />}
        disabled={disabled}
        onClick={() => setOpen(true)}
        size="large"
      >
        Save as template
      </Button>
      <DraggableModal
        title="Save report as template"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleOk}
        confirmLoading={create.isPending}
        okText="Save"
        cancelText="Cancel"
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Title"
            name="title"
            rules={[
              { required: true, message: 'Title required' },
              { max: 100, message: 'Title must be 100 characters or fewer' },
            ]}
            extra="Shown in the Templates list. Must be unique among your templates for this report."
          >
            <Input placeholder="e.g. Q1 Footwear Categories" autoFocus />
          </Form.Item>
          <Form.Item
            label="Visibility"
            name="visibility"
            initialValue="private"
            rules={[{ required: true }]}
          >
            <Radio.Group>
              <Radio value="private">Private</Radio>
              <Radio value="shared">Visible to all signed-in users</Radio>
            </Radio.Group>
          </Form.Item>
        </Form>
      </DraggableModal>
    </>
  )
}
