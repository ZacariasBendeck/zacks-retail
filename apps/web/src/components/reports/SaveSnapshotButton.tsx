import { useEffect, useState } from 'react'
import { App, Button, Form, Input, Modal, Radio, Typography } from 'antd'
import { CameraOutlined } from '@ant-design/icons'
import { useCreateReportRun } from '../../hooks/useReportRuns'
import type { ReportType, RunVisibility } from '../../services/reportRunsApi'

const { Text } = Typography

interface Props {
  reportType: ReportType
  // Called at click-time so we always freeze the live filter state, not a
  // stale capture. The object returned is persisted verbatim as params_json.
  getParamsJson: () => Record<string, unknown>
  // Called at click-time to get the current result payload. The snapshot
  // stores this verbatim under result_json; the saved-view page re-renders
  // from exactly this shape.
  getResultJson: () => unknown
  // Populated when the current run was kicked off from a saved template
  // (?templateId=... replay). Lets the runs list link back to the template
  // that produced each snapshot.
  sourceTemplateId?: string
  // Disabled until the user has run the report at least once and there is
  // a result payload to capture.
  disabled?: boolean
}

interface FormValues {
  title: string
  visibility: RunVisibility
}

/**
 * Save the currently-displayed result as an immutable snapshot. Opens a
 * small modal for a title + visibility, then POSTs to /reports/runs with
 * the full result payload. The resulting snapshot shows up at
 * /reports/runs and can be opened to view the exact data that was on
 * screen at capture — no re-query against live data.
 */
export default function SaveSnapshotButton({
  reportType,
  getParamsJson,
  getResultJson,
  sourceTemplateId,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<FormValues>()
  const { message } = App.useApp()
  const create = useCreateReportRun()

  useEffect(() => {
    if (open) {
      form.resetFields()
      form.setFieldsValue({ title: '', visibility: 'private' })
    }
  }, [open, form])

  const handleOk = async () => {
    const vals = await form.validateFields()
    try {
      const result = getResultJson()
      if (result === undefined || result === null) {
        message.error('Nothing to snapshot yet — run the report first.')
        return
      }
      await create.mutateAsync({
        reportType,
        title: vals.title.trim(),
        paramsJson: getParamsJson(),
        resultJson: result,
        visibility: vals.visibility,
        sourceTemplateId,
      })
      message.success(`Snapshot "${vals.title}" saved`)
      setOpen(false)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <>
      <Button
        icon={<CameraOutlined />}
        disabled={disabled}
        onClick={() => setOpen(true)}
        size="large"
      >
        Save snapshot
      </Button>
      <Modal
        title="Save snapshot of this run"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleOk}
        confirmLoading={create.isPending}
        okText="Save snapshot"
        cancelText="Cancel"
        destroyOnClose
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Freezes exactly what is on screen now. Opening the snapshot later shows
          the same data without re-querying — useful for sharing a point-in-time
          view or bookmarking a result you expect to change.
        </Text>
        <Form form={form} layout="vertical">
          <Form.Item
            label="Title"
            name="title"
            rules={[
              { required: true, message: 'Title required' },
              { max: 100, message: 'Title must be 100 characters or fewer' },
            ]}
            extra="Shown in the Snapshots list."
          >
            <Input placeholder="e.g. Q1 2026 close-out review" autoFocus />
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
      </Modal>
    </>
  )
}
