import { getMetricRegistryMap } from './metricRegistryService';
import { validateRule } from './ruleValidatorService';
import {
  CompiledRule,
  MetricRegistryEntry,
  ReasonTemplate,
  RuleCondition,
  SegmentRule,
} from './types';

type CompileContext = {
  params: unknown[];
  reasonTemplates: ReasonTemplate[];
  metricDependencies: Set<string>;
};

function nextParam(context: CompileContext, value: unknown): string {
  context.params.push(value);
  return `$${context.params.length}`;
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function qualifySourceTable(entry: MetricRegistryEntry): string {
  return `app.${quoteIdent(entry.sourceTable)}`;
}

function normalizeReasonCode(metricKey: string): string {
  return metricKey.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function pushReasonTemplate(context: CompileContext, condition: RuleCondition, entry: MetricRegistryEntry): void {
  context.reasonTemplates.push({
    metric: condition.metric,
    op: condition.op,
    value: condition.value,
    labelTemplate: `${entry.displayName} ${condition.op}`,
  });
  context.metricDependencies.add(condition.metric);
}

function compileCustomerFeature(
  entry: MetricRegistryEntry,
  condition: RuleCondition,
  context: CompileContext,
): string {
  const columnRef = `cfc.${quoteIdent(entry.sourceColumn ?? entry.metricKey)}`;
  switch (condition.op) {
    case '=':
    case '!=':
    case '>':
    case '>=':
    case '<':
    case '<=':
      return `${columnRef} ${condition.op} ${nextParam(context, condition.value)}`;
    case 'between': {
      const [min, max] = condition.value as [unknown, unknown];
      return `${columnRef} BETWEEN ${nextParam(context, min)} AND ${nextParam(context, max)}`;
    }
    case 'in':
    case 'not_in': {
      const values = condition.value as unknown[];
      const placeholders = values.map((value) => nextParam(context, value)).join(', ');
      const op = condition.op === 'in' ? 'IN' : 'NOT IN';
      return `${columnRef} ${op} (${placeholders})`;
    }
    case 'exists':
      return `${columnRef} IS NOT NULL`;
    case 'not_exists':
      return `${columnRef} IS NULL`;
    case 'contains':
      return `${columnRef} ILIKE ('%' || ${nextParam(context, condition.value)} || '%')`;
    case 'percentile_gte': {
      const percentile = nextParam(context, condition.value);
      return `${columnRef} >= (SELECT percentile_cont(${percentile}) WITHIN GROUP (ORDER BY ${quoteIdent(entry.sourceColumn ?? entry.metricKey)}) FROM ${qualifySourceTable(entry)})`;
    }
    case 'percentile_lte': {
      const percentile = nextParam(context, condition.value);
      return `${columnRef} <= (SELECT percentile_cont(${percentile}) WITHIN GROUP (ORDER BY ${quoteIdent(entry.sourceColumn ?? entry.metricKey)}) FROM ${qualifySourceTable(entry)})`;
    }
    default:
      throw new Error(`Unsupported operator ${condition.op}`);
  }
}

function buildDimensionFilters(
  condition: RuleCondition,
  context: CompileContext,
  tableAlias: string,
): string[] {
  const filters: string[] = [];
  for (const [key, value] of Object.entries(condition.dimension ?? {})) {
    filters.push(`${tableAlias}.${quoteIdent(key)} = ${nextParam(context, value)}`);
  }
  return filters;
}

function compileDimensionedSubquery(
  entry: MetricRegistryEntry,
  condition: RuleCondition,
  context: CompileContext,
): string {
  const alias = entry.sourceType === 'category_feature'
    ? 'ccf'
    : entry.sourceType === 'brand_feature'
      ? 'cbf'
      : 'csp';
  const filters = buildDimensionFilters(condition, context, alias);
  const columnRef = `${alias}.${quoteIdent(entry.sourceColumn ?? entry.metricKey)}`;
  let predicate = '';

  switch (condition.op) {
    case '=':
    case '!=':
    case '>':
    case '>=':
    case '<':
    case '<=':
      predicate = `${columnRef} ${condition.op} ${nextParam(context, condition.value)}`;
      break;
    case 'between': {
      const [min, max] = condition.value as [unknown, unknown];
      predicate = `${columnRef} BETWEEN ${nextParam(context, min)} AND ${nextParam(context, max)}`;
      break;
    }
    case 'in':
    case 'not_in': {
      const placeholders = (condition.value as unknown[])
        .map((value) => nextParam(context, value))
        .join(', ');
      const op = condition.op === 'in' ? 'IN' : 'NOT IN';
      predicate = `${columnRef} ${op} (${placeholders})`;
      break;
    }
    case 'exists':
    case 'not_exists':
      predicate = '1 = 1';
      break;
    default:
      throw new Error(`Unsupported dimensioned operator ${condition.op}`);
  }

  const existsSql = [
    'EXISTS (',
    `  SELECT 1 FROM ${qualifySourceTable(entry)} ${alias}`,
    `  WHERE ${alias}.customer_id = cfc.customer_id`,
    ...filters.map((filter) => `    AND ${filter}`),
    `    AND ${predicate}`,
    ')',
  ].join('\n');

  return condition.op === 'not_exists' ? `NOT (${existsSql})` : existsSql;
}

function isCondition(rule: SegmentRule): rule is RuleCondition {
  return typeof (rule as RuleCondition).metric === 'string';
}

function compileNode(
  rule: SegmentRule,
  registry: Map<string, MetricRegistryEntry>,
  context: CompileContext,
): string {
  if (isCondition(rule)) {
    const entry = registry.get(rule.metric);
    if (!entry) throw new Error(`Unknown metric ${rule.metric}`);
    pushReasonTemplate(context, rule, entry);
    if (entry.sourceType === 'customer_feature') {
      return compileCustomerFeature(entry, rule, context);
    }
    return compileDimensionedSubquery(entry, rule, context);
  }

  if (rule.all) {
    return `(${rule.all.map((child) => compileNode(child, registry, context)).join(' AND ')})`;
  }
  if (rule.any) {
    return `(${rule.any.map((child) => compileNode(child, registry, context)).join(' OR ')})`;
  }
  if (rule.not) {
    return `NOT (${rule.not.map((child) => compileNode(child, registry, context)).join(' AND ')})`;
  }
  throw new Error('Invalid rule group.');
}

export async function compileRule(ruleAst: SegmentRule): Promise<CompiledRule> {
  const validation = await validateRule(ruleAst);
  if (!validation.isValid) {
    const summary = validation.errors.map((error) => `${error.path}:${error.code}`).join(', ');
    throw new Error(`RULE_VALIDATION_FAILED:${summary}`);
  }
  const registry = await getMetricRegistryMap();
  const context: CompileContext = {
    params: [],
    reasonTemplates: [],
    metricDependencies: new Set<string>(),
  };
  const sql = compileNode(ruleAst, registry, context);
  return {
    sql,
    params: context.params,
    reasonTemplates: context.reasonTemplates.map((template) => ({
      ...template,
      labelTemplate: `${normalizeReasonCode(template.metric)}:${template.labelTemplate}`,
    })),
    metricDependencies: [...context.metricDependencies].sort(),
  };
}
