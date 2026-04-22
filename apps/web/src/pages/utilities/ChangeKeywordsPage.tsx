/**
 * Change Keywords — utilities module's canonical criteria-picker consumer.
 *
 * RICS manual p. 195 (Change Keywords). Adds or removes a keyword for SKUs
 * matching the criteria. Writes land in app.sku_keyword_override as ADD/REMOVE
 * rows layered on top of the RICS space-sep KeyWords string.
 *
 * Spec: docs/dev/specs/2026-04-21-utilities-batch-change-design.md
 */

import { useState } from 'react'
import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  Popconfirm,
  Radio,
  Row,
  Space,
  Typography,
} from 'antd'
import { useNavigate } from 'react-router-dom'
import { SkuCriteriaPicker } from '../../components/utilities/SkuCriteriaPicker'
import { useApplyBatchChange } from '../../hooks/useUtilities'
import type { SkuCriteria } from '../../services/utilitiesApi'

type Action = 'ADD' | 'REMOVE'

export default function ChangeKeywordsPage() {
  const navigate = useNavigate()
  const { message, notification } = App.useApp()
  const [criteria, setCriteria] = useState<SkuCriteria>({})
  const [action, setAction] = useState<Action>('ADD')
  const [keyword, setKeyword] = useState('')

  const apply = useApplyBatchChange()

  const submit = async () => {
    const trimmed = keyword.trim()
    if (!trimmed) {
      message.warning('Enter a keyword.')
      return
    }
    if (trimmed.length > 10) {
      message.warning('Keyword max 10 chars (RICS p. 165).')
      return
    }
    if (/\s/.test(trimmed)) {
      message.warning('No whitespace allowed in a keyword (space is the separator).')
      return
    }

    try {
      const op = action === 'ADD' ? 'CHANGE_KEYWORDS_ADD' as const : 'CHANGE_KEYWORDS_REMOVE' as const
      const result = await apply.mutateAsync({
        operationType: op,
        criteria,
        change: { type: op, keyword: trimmed },
      })
      if (result.affectedCount === 0) {
        message.info('No SKUs matched — nothing changed.')
        return
      }
      const batchId = result.batchId
      notification.success({
        message: `${action === 'ADD' ? 'Added' : 'Removed'} keyword "${trimmed}" on ${result.affectedCount} SKUs`,
        description: (
          <Space direction="vertical" size={0}>
            <Typography.Text type="secondary">
              {result.preview.slice(0, 5).join(', ')}
              {result.affectedCount > 5 && ` …+${result.affectedCount - 5} more`}
            </Typography.Text>
            {batchId && (
              <a href={`/utilities/batch-history/${batchId}`}>View batch / Undo</a>
            )}
          </Space>
        ),
        duration: 30,
      })
      setKeyword('')
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  return (
    <div>
      <Typography.Title level={3}>Change Keywords</Typography.Title>
      <Typography.Paragraph type="secondary">
        Add or remove a keyword across SKUs matching the criteria. Reversible via Batch History.
        <Typography.Text type="secondary"> RICS p. 195.</Typography.Text>
      </Typography.Paragraph>

      <Row gutter={16}>
        <Col xs={24} md={14}>
          <SkuCriteriaPicker value={criteria} onChange={setCriteria} />
        </Col>
        <Col xs={24} md={10}>
          <Card size="small" title={<Typography.Text strong>Change</Typography.Text>}>
            <Form layout="vertical" size="small">
              <Form.Item label="Action">
                <Radio.Group value={action} onChange={(e) => setAction(e.target.value)}>
                  <Radio.Button value="ADD">Add keyword</Radio.Button>
                  <Radio.Button value="REMOVE">Remove keyword</Radio.Button>
                </Radio.Group>
              </Form.Item>
              <Form.Item label="Keyword" extra="1–10 chars, no whitespace. Case-sensitive in RICS.">
                <Input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  maxLength={10}
                  placeholder="WINTER26"
                  autoFocus
                />
              </Form.Item>
              <Space>
                <Popconfirm
                  title={`${action === 'ADD' ? 'Add' : 'Remove'} keyword "${keyword || '…'}"?`}
                  description={`Applies to all SKUs matching the criteria. Reversible via Batch History.`}
                  okText="Apply"
                  cancelText="Cancel"
                  onConfirm={submit}
                  disabled={!keyword.trim()}
                >
                  <Button type="primary" loading={apply.isPending} disabled={!keyword.trim()}>
                    Apply
                  </Button>
                </Popconfirm>
                <Button onClick={() => navigate('/utilities')}>Back</Button>
                <Button onClick={() => navigate('/utilities/batch-history')}>
                  Batch History
                </Button>
              </Space>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
