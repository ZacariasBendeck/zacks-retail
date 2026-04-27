import React from 'react';
import { Alert, Button, Input, List, Modal, Space, Spin, Tag, Typography } from 'antd';
import { useInquiryRecommendation } from './useInquiryRecommendation';
import type {
  InquiryRecommendation,
  InquiryRecommendationConfidence,
  InquiryRecommendationStyleTag,
  InquiryRecommendationUrgency,
} from '../../../types/inventoryInquiry';

const { Paragraph, Text } = Typography;
const DEFAULT_BUSINESS_NOTE =
  'Store 32 / Unlimited Premier is closed for renovations; do not recommend replenishment there unless explicitly staging inventory.';

export interface SkuAiRecommendationModalProps {
  open: boolean;
  skuCode: string;
  onClose: () => void;
}

export function SkuAiRecommendationModal({
  open,
  skuCode,
  onClose,
}: SkuAiRecommendationModalProps) {
  const [notes, setNotes] = React.useState(DEFAULT_BUSINESS_NOTE);
  const recommendation = useInquiryRecommendation();

  React.useEffect(() => {
    if (!open) {
      setNotes(DEFAULT_BUSINESS_NOTE);
      recommendation.reset();
    }
  }, [open, recommendation]);

  const runAnalysis = React.useCallback(() => {
    recommendation.mutate({
      skuCode,
      notes,
    });
  }, [notes, recommendation, skuCode]);

  return (
    <Modal
      open={open}
      width={780}
      title={`AI Recommendation - ${skuCode}`}
      onCancel={onClose}
      destroyOnHidden
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        <Button
          key="analyze"
          type="primary"
          loading={recommendation.isPending}
          onClick={runAnalysis}
        >
          Analyze SKU
        </Button>,
      ]}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="Optional operator context"
          description="The renovation note for Store 32 / Unlimited Premier is prefilled. Add any other business context the raw inquiry cannot know."
        />

        <Input.TextArea
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Add more context if needed: This style is being phased out. Keep inventory out of damaged store 91."
        />

        {recommendation.error && (
          <Alert
            type="error"
            showIcon
            message="AI request failed"
            description={(recommendation.error as Error).message}
          />
        )}

        {recommendation.isPending && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Spin />
            <div style={{ marginTop: 8, color: '#666' }}>Analyzing SKU {skuCode}...</div>
          </div>
        )}

        {recommendation.data && <RecommendationView recommendation={recommendation.data} />}

        {!recommendation.data && !recommendation.isPending && !recommendation.error && (
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Run the analysis to get a structured recommendation for model changes, future buys,
            markdown review, consolidation, hold, or investigation.
          </Paragraph>
        )}
      </Space>
    </Modal>
  );
}

function RecommendationView({ recommendation }: { recommendation: InquiryRecommendation }) {
  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <div>
        <Space wrap size={[8, 8]} style={{ marginBottom: 8 }}>
          <Tag color={styleTagColor(recommendation.styleTag)}>{recommendation.styleTag}</Tag>
          <Tag color="blue">{recommendation.decision}</Tag>
          <Tag color={urgencyColor(recommendation.urgency)}>Urgency: {recommendation.urgency}</Tag>
          <Tag color={confidenceColor(recommendation.confidence)}>
            Confidence: {recommendation.confidence}
          </Tag>
        </Space>
        <Paragraph style={{ marginBottom: 0 }}>{recommendation.summary}</Paragraph>
      </div>

      <div>
        <Text strong>Baseline outlook</Text>
        <Paragraph style={{ marginBottom: 0 }}>
          {formatBaselineRisk(recommendation)}
        </Paragraph>
      </div>

      <div>
        <Text strong>Buy plan</Text>
        <Paragraph style={{ marginBottom: 0 }}>
          {formatBuyPlan(recommendation)}
        </Paragraph>
      </div>

      <div>
        <Text strong>Recommended actions</Text>
        <List
          size="small"
          locale={{ emptyText: 'No explicit action items returned.' }}
          dataSource={recommendation.actions}
          renderItem={(action) => (
            <List.Item>
              <div style={{ width: '100%' }}>
                <div style={{ fontWeight: 600 }}>
                  {action.priority}. {action.title}
                </div>
                <div>{action.details}</div>
                {renderActionMeta(action)}
              </div>
            </List.Item>
          )}
        />
      </div>

      <StringList title="Why" values={recommendation.reasons} />
      <StringList title="Watchouts" values={recommendation.watchouts} />
      <StringList title="Questions" values={recommendation.questions} />
    </Space>
  );
}

function StringList({ title, values }: { title: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div>
      <Text strong>{title}</Text>
      <List
        size="small"
        dataSource={values}
        renderItem={(value) => <List.Item>{value}</List.Item>}
      />
    </div>
  );
}

function renderActionMeta(action: InquiryRecommendation['actions'][number]) {
  const parts: string[] = [];
  if (action.sourceStoreNumber != null) {
    parts.push(
      `From ${action.sourceStoreNumber}${action.sourceStoreName ? ` - ${action.sourceStoreName}` : ''}`,
    );
  }
  if (action.targetStoreNumber != null) {
    parts.push(
      `To ${action.targetStoreNumber}${action.targetStoreName ? ` - ${action.targetStoreName}` : ''}`,
    );
  }
  if (action.size) parts.push(`Size ${action.size}`);
  if (action.quantity != null) parts.push(`Qty ${action.quantity}`);
  if (!parts.length) return null;
  return (
    <div style={{ marginTop: 4 }}>
      <Text type="secondary">{parts.join(' | ')}</Text>
    </div>
  );
}

function urgencyColor(value: InquiryRecommendationUrgency): string {
  if (value === 'HIGH') return 'red';
  if (value === 'MEDIUM') return 'gold';
  return 'default';
}

function confidenceColor(value: InquiryRecommendationConfidence): string {
  if (value === 'HIGH') return 'green';
  if (value === 'MEDIUM') return 'blue';
  return 'default';
}

function styleTagColor(value: InquiryRecommendationStyleTag): string {
  if (value === 'WINNER') return 'green';
  if (value === 'DUD') return 'red';
  return 'gold';
}

function formatBaselineRisk(recommendation: InquiryRecommendation): string {
  const days = recommendation.baselineRisk.daysUntilModelRisk;
  const date = recommendation.baselineRisk.estimatedModelRiskDate;
  const headline =
    days == null
      ? 'Not enough data to calculate model-risk timing.'
      : `Estimated model-risk point: ${days} days${date ? ` (${date})` : ''}.`;
  return `${headline} ${recommendation.baselineRisk.basis}`;
}

function formatBuyPlan(recommendation: InquiryRecommendation): string {
  if (!recommendation.buyPlan.shouldBuy) {
    return `Do not buy now. ${recommendation.buyPlan.basis}`;
  }

  const quantity = recommendation.buyPlan.quantity != null
    ? `${recommendation.buyPlan.quantity} units`
    : 'an unspecified quantity';
  const orderBy = recommendation.buyPlan.orderByDate ?? 'an unspecified date';
  const arrival = recommendation.buyPlan.estimatedArrivalDate ?? 'an unspecified arrival date';
  return `Buy ${quantity}. Order by ${orderBy} for arrival around ${arrival}. ${recommendation.buyPlan.basis}`;
}
