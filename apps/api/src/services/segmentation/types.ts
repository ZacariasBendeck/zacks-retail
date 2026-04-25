export type SegmentEvaluationMode = 'batch' | 'realtime' | 'hybrid';

export type SegmentStatus = 'draft' | 'active' | 'paused' | 'archived';

export type SegmentFamily =
  | 'lifecycle'
  | 'value'
  | 'rfm'
  | 'category_affinity'
  | 'brand_affinity'
  | 'promo_behavior'
  | 'channel_behavior'
  | 'churn_risk'
  | 'inventory_activation'
  | 'custom';

export type RuleOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'between'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists'
  | 'contains'
  | 'percentile_gte'
  | 'percentile_lte';

export type RuleWindow = '7d' | '30d' | '90d' | '180d' | '365d' | 'lifetime';

export type RuleCondition = {
  metric: string;
  op: RuleOperator;
  value?: unknown;
  dimension?: Record<string, string | number | boolean>;
  window?: RuleWindow;
};

export type RuleGroup = {
  all?: SegmentRule[];
  any?: SegmentRule[];
  not?: SegmentRule[];
};

export type SegmentRule = RuleGroup | RuleCondition;

export type RuleValidationError = {
  path: string;
  code: string;
  message: string;
};

export type MetricValueType = 'integer' | 'numeric' | 'boolean' | 'text' | 'date' | 'timestamp';

export type MetricSourceType =
  | 'customer_feature'
  | 'category_feature'
  | 'brand_feature'
  | 'size_profile'
  | 'custom_sql_view';

export type MetricRegistryEntry = {
  metricKey: string;
  displayName: string;
  description: string | null;
  valueType: MetricValueType;
  sourceType: MetricSourceType;
  sourceTable: string;
  sourceColumn: string | null;
  allowedOperators: RuleOperator[];
  supportsWindow: boolean;
  supportsDimension: boolean;
  dimensionConfig: { required?: string[] } | null;
  sqlTemplate: string | null;
  isActive: boolean;
};

export type ReasonTemplate = {
  metric: string;
  op: string;
  value?: unknown;
  labelTemplate: string;
};

export type CompiledRule = {
  sql: string;
  params: unknown[];
  reasonTemplates: ReasonTemplate[];
  metricDependencies: string[];
};

export type SegmentPreviewRequest = {
  ruleAst: SegmentRule;
  limit?: number;
};

export type ActivationAudienceRequest = {
  name: string;
  description?: string;
  segmentKeys: string[];
  requireAllSegments?: boolean;
  channel?: 'email' | 'sms' | 'push' | 'pos' | 'web' | 'export';
  storeIds?: string[];
  maxAudienceSize?: number;
  suppressRecentlyContacted?: boolean;
  minDaysSinceLastContact?: number;
  requireRelevantInventory?: boolean;
  holdoutPercent?: number;
  additionalFilters?: SegmentRule;
  expiresAt?: string;
};

export type SingleCustomerEvaluationInput = {
  customerId: string;
  changedMetrics?: string[];
  eventType?: string;
  eventId?: string;
};

export type SegmentDefinitionSeed = {
  segmentKey: string;
  name: string;
  description: string;
  segmentFamily: SegmentFamily;
  evaluationMode: SegmentEvaluationMode;
  priority: number;
  ruleAst: SegmentRule;
};

export type CompiledSegmentMatch = {
  customerId: string;
  score: number;
  reasonCodes: {
    reasons: Array<{
      code: string;
      metric: string;
      label: string;
      actualValue: unknown;
      operator: string;
      threshold?: unknown;
    }>;
  };
};
