import { prisma } from '../../db/prisma';
import { DEFAULT_SEGMENT_METRICS } from './defaults';
import { MetricRegistryEntry } from './types';

function toMetricEntry(row: any): MetricRegistryEntry {
  return {
    metricKey: row.metricKey,
    displayName: row.displayName,
    description: row.description ?? null,
    valueType: row.valueType,
    sourceType: row.sourceType,
    sourceTable: row.sourceTable,
    sourceColumn: row.sourceColumn ?? null,
    allowedOperators: row.allowedOperators,
    supportsWindow: row.supportsWindow,
    supportsDimension: row.supportsDimension,
    dimensionConfig: (row.dimensionConfig as { required?: string[] } | null) ?? null,
    sqlTemplate: row.sqlTemplate ?? null,
    isActive: row.isActive,
  };
}

export async function seedDefaultMetrics(): Promise<void> {
  for (const metric of DEFAULT_SEGMENT_METRICS) {
    await prisma.segmentMetricRegistry.upsert({
      where: { metricKey: metric.metricKey },
      update: {
        displayName: metric.displayName,
        description: metric.description,
        valueType: metric.valueType,
        sourceType: metric.sourceType,
        sourceTable: metric.sourceTable,
        sourceColumn: metric.sourceColumn,
        allowedOperators: metric.allowedOperators,
        supportsWindow: metric.supportsWindow,
        supportsDimension: metric.supportsDimension,
        dimensionConfig: metric.dimensionConfig as any,
        sqlTemplate: metric.sqlTemplate,
        isActive: metric.isActive,
      },
      create: {
        metricKey: metric.metricKey,
        displayName: metric.displayName,
        description: metric.description,
        valueType: metric.valueType,
        sourceType: metric.sourceType,
        sourceTable: metric.sourceTable,
        sourceColumn: metric.sourceColumn,
        allowedOperators: metric.allowedOperators,
        supportsWindow: metric.supportsWindow,
        supportsDimension: metric.supportsDimension,
        dimensionConfig: metric.dimensionConfig as any,
        sqlTemplate: metric.sqlTemplate,
        isActive: metric.isActive,
      },
    });
  }
}

export async function listMetrics(): Promise<MetricRegistryEntry[]> {
  const rows = await prisma.segmentMetricRegistry.findMany({
    where: { isActive: true },
    orderBy: { metricKey: 'asc' },
  });
  return rows.map(toMetricEntry);
}

export async function getMetricRegistryMap(): Promise<Map<string, MetricRegistryEntry>> {
  const rows = await listMetrics();
  return new Map(rows.map((row) => [row.metricKey, row]));
}
