import { prisma } from '../../db/prisma';
import { getMetricRegistryMap } from './metricRegistryService';
import { MetricRegistryEntry, RuleCondition, SegmentRule } from './types';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function schemaQualified(entry: MetricRegistryEntry): string {
  return `app.${quoteIdent(entry.sourceTable)}`;
}

export function extractConditions(rule: SegmentRule): RuleCondition[] {
  if ((rule as RuleCondition).metric) return [rule as RuleCondition];
  const group = rule as { all?: SegmentRule[]; any?: SegmentRule[]; not?: SegmentRule[] };
  return [...(group.all ?? []), ...(group.any ?? []), ...(group.not ?? [])].flatMap(extractConditions);
}

function toReasonCode(metricKey: string): string {
  return metricKey.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function formatActualValue(value: unknown): string {
  if (value == null) return 'no value';
  if (typeof value === 'number') {
    const fractionDigits = Number.isInteger(value) ? 0 : 2;
    return new Intl.NumberFormat('es-HN', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  }
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function loadActualMetricValue(
  customerId: string,
  entry: MetricRegistryEntry,
  condition: RuleCondition,
): Promise<unknown> {
  const column = quoteIdent(entry.sourceColumn ?? entry.metricKey);
  if (entry.sourceType === 'customer_feature') {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT ${column} AS value
         FROM ${schemaQualified(entry)}
        WHERE customer_id = $1::uuid
        LIMIT 1`,
      customerId,
    );
    return rows[0]?.value ?? null;
  }

  const filters: string[] = ['customer_id = $1::uuid'];
  const params: unknown[] = [customerId];
  for (const [key, value] of Object.entries(condition.dimension ?? {})) {
    params.push(value);
    filters.push(`${quoteIdent(key)} = $${params.length}`);
  }
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT ${column} AS value
       FROM ${schemaQualified(entry)}
      WHERE ${filters.join(' AND ')}
      LIMIT 1`,
    ...params,
  );
  return rows[0]?.value ?? null;
}

export async function buildReasonCodes(
  customerId: string,
  ruleAst: SegmentRule,
): Promise<{ reasons: Array<Record<string, unknown>> }> {
  const registry = await getMetricRegistryMap();
  const reasons: Array<Record<string, unknown>> = [];
  for (const condition of extractConditions(ruleAst)) {
    const entry = registry.get(condition.metric);
    if (!entry) continue;
    const actualValue = await loadActualMetricValue(customerId, entry, condition);
    reasons.push({
      code: toReasonCode(condition.metric),
      metric: condition.metric,
      label: `${entry.displayName}: ${formatActualValue(actualValue)}`,
      actualValue,
      operator: condition.op,
      threshold: condition.value,
    });
  }
  return { reasons };
}

export function decimalToNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object' && value && 'toNumber' in value && typeof (value as any).toNumber === 'function') {
    return (value as any).toNumber();
  }
  return null;
}
