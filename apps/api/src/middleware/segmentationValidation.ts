import { z } from 'zod';

const SEGMENT_FAMILIES = [
  'lifecycle',
  'value',
  'rfm',
  'category_affinity',
  'brand_affinity',
  'promo_behavior',
  'channel_behavior',
  'churn_risk',
  'inventory_activation',
  'custom',
] as const;

const SEGMENT_STATUSES = ['draft', 'active', 'paused', 'archived'] as const;
const EVALUATION_MODES = ['batch', 'realtime', 'hybrid'] as const;
const CHANNELS = ['email', 'sms', 'push', 'pos', 'web', 'export'] as const;

export const createSegmentSchema = z.object({
  segmentKey: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  segmentFamily: z.enum(SEGMENT_FAMILIES),
  evaluationMode: z.enum(EVALUATION_MODES),
  priority: z.number().int().min(0).max(1000).optional(),
});

export const updateSegmentSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  segmentFamily: z.enum(SEGMENT_FAMILIES).optional(),
  evaluationMode: z.enum(EVALUATION_MODES).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  status: z.enum(SEGMENT_STATUSES).optional(),
});

export const listSegmentsQuerySchema = z.object({
  status: z.enum(SEGMENT_STATUSES).optional(),
  family: z.enum(SEGMENT_FAMILIES).optional(),
});

export const segmentRulePayloadSchema = z.record(z.any());

export const createSegmentVersionSchema = z.object({
  ruleAst: segmentRulePayloadSchema,
  scoringConfig: z.any().optional().nullable(),
  activationPolicy: z.any().optional().nullable(),
  suppressionPolicy: z.any().optional().nullable(),
});

export const validateSegmentVersionSchema = z.object({
  ruleAst: segmentRulePayloadSchema,
});

export const previewSegmentVersionSchema = z.object({
  ruleAst: segmentRulePayloadSchema,
  limit: z.number().int().min(1).max(100).optional(),
});

export const activateSegmentVersionSchema = z.object({
  evaluateImmediately: z.boolean().optional().default(true),
});

export const evaluateCustomerSegmentsSchema = z.object({
  changedMetrics: z.array(z.string().trim().min(1)).optional(),
  eventType: z.string().trim().min(1).max(120).optional(),
  eventId: z.string().trim().min(1).max(120).optional(),
});

export const membersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const buildAudienceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  segmentKeys: z.array(z.string().trim().min(1)).min(1),
  requireAllSegments: z.boolean().optional().default(true),
  channel: z.enum(CHANNELS).optional(),
  storeIds: z.array(z.string().trim().min(1)).optional(),
  maxAudienceSize: z.number().int().min(1).max(100000).optional(),
  suppressRecentlyContacted: z.boolean().optional(),
  minDaysSinceLastContact: z.number().int().min(0).max(3650).optional(),
  requireRelevantInventory: z.boolean().optional(),
  holdoutPercent: z.number().int().min(0).max(100).optional(),
  additionalFilters: segmentRulePayloadSchema.optional(),
  expiresAt: z.string().datetime().optional(),
});

export const audienceMembersQuerySchema = z.object({
  treatmentGroup: z.enum(['activation', 'holdout', 'suppressed']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
