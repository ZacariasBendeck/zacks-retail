import { getMetricRegistryMap } from './metricRegistryService';
import {
  MetricRegistryEntry,
  RuleCondition,
  RuleValidationError,
  SegmentRule,
} from './types';

const MAX_DEPTH = 5;
const GROUP_KEYS = ['all', 'any', 'not'] as const;
const CONDITION_KEYS = ['metric', 'op', 'value', 'dimension', 'window'] as const;
const SUPPORTED_WINDOWS = new Set(['7d', '30d', '90d', '180d', '365d', 'lifetime']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRuleCondition(value: Record<string, unknown>): value is RuleCondition {
  return typeof value.metric === 'string' && typeof value.op === 'string';
}

function pushError(
  errors: RuleValidationError[],
  path: string,
  code: string,
  message: string,
): void {
  errors.push({ path, code, message });
}

function validateConditionShape(
  node: Record<string, unknown>,
  path: string,
  errors: RuleValidationError[],
): void {
  const unknownKeys = Object.keys(node).filter((key) => !CONDITION_KEYS.includes(key as never));
  for (const key of unknownKeys) {
    pushError(errors, path ? `${path}.${key}` : key, 'UNKNOWN_FIELD', 'Unknown rule field.');
  }
}

function validateValueType(
  entry: MetricRegistryEntry,
  condition: RuleCondition,
  path: string,
  errors: RuleValidationError[],
): void {
  const valuePath = path ? `${path}.value` : 'value';
  const { op, value } = condition;
  if (op === 'exists' || op === 'not_exists') {
    if (value !== undefined) {
      pushError(errors, valuePath, 'UNEXPECTED_VALUE', `Operator ${op} does not accept a value.`);
    }
    return;
  }
  if (op === 'between') {
    if (!Array.isArray(value) || value.length !== 2) {
      pushError(
        errors,
        valuePath,
        'INVALID_BETWEEN_VALUE',
        'Operator between requires an array with exactly two values.',
      );
      return;
    }
  }
  if (op === 'in' || op === 'not_in') {
    if (!Array.isArray(value) || value.length === 0) {
      pushError(
        errors,
        valuePath,
        'INVALID_IN_VALUE',
        `Operator ${op} requires a non-empty array.`,
      );
      return;
    }
  }
  const values = Array.isArray(value) ? value : [value];
  for (const candidate of values) {
    switch (entry.valueType) {
      case 'integer':
        if (typeof candidate !== 'number' || !Number.isInteger(candidate)) {
          pushError(errors, valuePath, 'INVALID_VALUE_TYPE', 'Metric requires an integer value.');
        }
        break;
      case 'numeric':
        if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
          pushError(errors, valuePath, 'INVALID_VALUE_TYPE', 'Metric requires a numeric value.');
        }
        break;
      case 'boolean':
        if (typeof candidate !== 'boolean') {
          pushError(errors, valuePath, 'INVALID_VALUE_TYPE', 'Metric requires a boolean value.');
        }
        break;
      case 'text':
        if (typeof candidate !== 'string') {
          pushError(errors, valuePath, 'INVALID_VALUE_TYPE', 'Metric requires a text value.');
        }
        break;
      case 'date':
      case 'timestamp':
        if (typeof candidate !== 'string' && !(candidate instanceof Date)) {
          pushError(errors, valuePath, 'INVALID_VALUE_TYPE', 'Metric requires a date-like value.');
        }
        break;
      default:
        break;
    }
  }
}

function validateCondition(
  node: Record<string, unknown>,
  entry: MetricRegistryEntry | undefined,
  path: string,
  errors: RuleValidationError[],
): void {
  validateConditionShape(node, path, errors);
  if (!entry) return;
  const condition = node as unknown as RuleCondition;
  if (!entry.isActive) {
    pushError(errors, path ? `${path}.metric` : 'metric', 'INACTIVE_METRIC', 'Metric is not active.');
  }
  if (!entry.allowedOperators.includes(condition.op)) {
    pushError(
      errors,
      path ? `${path}.op` : 'op',
      'INVALID_OPERATOR',
      `Operator ${condition.op} is not allowed for metric ${condition.metric}.`,
    );
  }
  if (entry.supportsDimension) {
    if (!isPlainObject(condition.dimension)) {
      pushError(
        errors,
        path ? `${path}.dimension` : 'dimension',
        'MISSING_DIMENSION',
        'Metric requires dimensions.',
      );
    } else {
      const required = entry.dimensionConfig?.required ?? [];
      for (const key of required) {
        if (!(key in condition.dimension!)) {
          pushError(
            errors,
            path ? `${path}.dimension.${key}` : `dimension.${key}`,
            'MISSING_DIMENSION',
            `Missing required dimension ${key}.`,
          );
        }
      }
    }
  } else if (condition.dimension !== undefined) {
    pushError(
      errors,
      path ? `${path}.dimension` : 'dimension',
      'UNEXPECTED_DIMENSION',
      'Metric does not support dimensions.',
    );
  }
  if (condition.window !== undefined) {
    if (!entry.supportsWindow) {
      pushError(
        errors,
        path ? `${path}.window` : 'window',
        'UNSUPPORTED_WINDOW',
        'Metric does not support windows.',
      );
    } else if (!SUPPORTED_WINDOWS.has(condition.window)) {
      pushError(
        errors,
        path ? `${path}.window` : 'window',
        'INVALID_WINDOW',
        'Window is not supported.',
      );
    }
  }
  validateValueType(entry, condition, path, errors);
}

async function walkRule(
  rule: unknown,
  registry: Map<string, MetricRegistryEntry>,
  path: string,
  depth: number,
  errors: RuleValidationError[],
  dependencies: Set<string>,
): Promise<void> {
  if (!isPlainObject(rule)) {
    pushError(errors, path, 'INVALID_RULE_NODE', 'Rule node must be an object.');
    return;
  }
  if (depth > MAX_DEPTH) {
    pushError(errors, path, 'RULE_TOO_DEEP', `Rule nesting depth cannot exceed ${MAX_DEPTH}.`);
    return;
  }

  const presentGroups = GROUP_KEYS.filter((key) => key in rule);
  const isCondition = isRuleCondition(rule);
  if (presentGroups.length + (isCondition ? 1 : 0) !== 1) {
    pushError(
      errors,
      path,
      'INVALID_RULE_SHAPE',
      'Rule must contain exactly one of all, any, not, or a condition.',
    );
    return;
  }

  if (isCondition) {
    const metricKey = String(rule.metric);
    const entry = registry.get(metricKey);
    if (!entry) {
      pushError(
        errors,
        path ? `${path}.metric` : 'metric',
        'UNKNOWN_METRIC',
        'Metric does not exist in registry.',
      );
    } else {
      dependencies.add(metricKey);
    }
    validateCondition(rule, entry, path, errors);
    return;
  }

  const groupKey = presentGroups[0];
  const children = rule[groupKey];
  const childPath = path ? `${path}.${groupKey}` : groupKey;
  if (!Array.isArray(children) || children.length === 0) {
    pushError(errors, childPath, 'EMPTY_GROUP', `${groupKey} must contain at least one child rule.`);
    return;
  }
  const unknownKeys = Object.keys(rule).filter((key) => !GROUP_KEYS.includes(key as never));
  for (const key of unknownKeys) {
    pushError(errors, path ? `${path}.${key}` : key, 'UNKNOWN_FIELD', 'Unknown rule field.');
  }
  await Promise.all(
    children.map((child, index) =>
      walkRule(child, registry, `${childPath}[${index}]`, depth + 1, errors, dependencies),
    ),
  );
}

export async function validateRule(
  ruleAst: unknown,
): Promise<{ isValid: boolean; errors: RuleValidationError[]; metricDependencies: string[] }> {
  const registry = await getMetricRegistryMap();
  const errors: RuleValidationError[] = [];
  const dependencies = new Set<string>();
  await walkRule(ruleAst, registry, '', 1, errors, dependencies);
  return {
    isValid: errors.length === 0,
    errors,
    metricDependencies: [...dependencies].sort(),
  };
}
