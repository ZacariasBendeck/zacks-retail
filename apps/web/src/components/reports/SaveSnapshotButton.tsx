import { useEffect, useMemo, useState } from 'react'
import { App, Button, Form, Input, Radio, Typography } from 'antd'
import { CameraOutlined } from '@ant-design/icons'
import { DraggableModal } from '../draggable-modal'
import { useCreateReportRun } from '../../hooks/useReportRuns'
import { defaultSnapshotTitle, type ReportType, type RunVisibility } from '../../services/reportRunsApi'

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
  // Optional one-line summary of dimensions / report type / criteria,
  // woven into the auto-generated default title so the snapshots list
  // shows what was actually run without opening each row.
  getDescriptor?: () => string
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
  getDescriptor,
  sourceTemplateId,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<FormValues>()
  const { message } = App.useApp()
  const create = useCreateReportRun()

  // Computed once when the modal opens so the timestamp freezes at open-time
  // rather than flickering as the user types. Displayed as the input's
  // placeholder AND used as the submit-time fallback when the field is blank.
  const autoTitle = useMemo(() => {
    if (!open) return ''
    const descriptor = getDescriptor?.()
    return defaultSnapshotTitle(reportType, descriptor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reportType])

  useEffect(() => {
    if (open) {
      form.resetFields()
      form.setFieldsValue({ title: '', visibility: 'private' })
    }
  }, [open, form])

  const handleOk = async () => {
    // Validation has its own outcome: antd shows inline errors itself, and a
    // rejection here means the operator hasn't fixed them yet. Keep the modal
    // open without a toast — the inline messages are already visible feedback.
    let vals: FormValues
    try {
      vals = await form.validateFields()
    } catch {
      return
    }
    try {
      const result = getResultJson()
      if (result === undefined || result === null) {
        message.error('Nothing to snapshot yet — run the report first.')
        return
      }
      // Fall back to the auto-generated title when the operator left the
      // field blank. Backend cap is 100 chars; auto-title is ~40 so it fits
      // comfortably. The operator sees the final title in the success toast.
      const effectiveTitle = vals.title?.trim() ? vals.title.trim() : autoTitle
      await create.mutateAsync({
        reportType,
        title: effectiveTitle,
        paramsJson: getParamsJson(),
        resultJson: result,
        visibility: vals.visibility,
        sourceTemplateId,
      })
      message.success(`Snapshot "${effectiveTitle}" saved`)
      setOpen(false)
    } catch (e) {
      // Always log — operators sometimes miss a brief toast and we want the
      // stack/payload context in DevTools when they share a screenshot.
      // eslint-disable-next-line no-console
      console.error('[SaveSnapshotButton] save failed', e)
      const detail =
        (e as Error)?.message ||
        (typeof e === 'string' ? e : 'see browser console for details')
      message.error(`Save snapshot failed: ${detail}`)
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
      <DraggableModal
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
            rules={[{ max: 100, message: 'Title must be 100 characters or fewer' }]}
            extra={
              <>
                Optional — leave blank to use <Text code>{autoTitle}</Text>.
              </>
            }
          >
            <Input placeholder={autoTitle} autoFocus />
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
