import { prisma } from '../../db/prisma';
import { buildReasonCodes, decimalToNumber } from './helpers';
import { compileRule } from './ruleCompilerService';
import { validateRule } from './ruleValidatorService';
import { SegmentPreviewRequest } from './types';

function sampleQuery(whereSql: string, sampleLimitParam: string): string {
  return `
    SELECT cfc.customer_id
      FROM app.customer_features_current cfc
     WHERE ${whereSql}
     ORDER BY cfc.net_revenue_365d DESC NULLS LAST, cfc.customer_id
     LIMIT ${sampleLimitParam}
  `;
}

export async function previewSegment(request: SegmentPreviewRequest): Promise<Record<string, unknown>> {
  const validation = await validateRule(request.ruleAst);
  if (!validation.isValid) {
    return {
      isValid: false,
      validationErrors: validation.errors,
      estimatedSize: 0,
      sampleCustomers: [],
      profile: null,
    };
  }

  const compiled = await compileRule(request.ruleAst);
  const limit = Math.min(Math.max(request.limit ?? 25, 1), 100);

  const countRows = await prisma.$queryRawUnsafe<Array<{ estimated_size: bigint }>>(
    `SELECT COUNT(*)::bigint AS estimated_size
       FROM app.customer_features_current cfc
      WHERE ${compiled.sql}`,
    ...compiled.params,
  );

  const sampleRows = await prisma.$queryRawUnsafe<Array<{ customer_id: string }>>(
    sampleQuery(compiled.sql, `$${compiled.params.length + 1}`),
    ...compiled.params,
    limit,
  );

  const profileRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT
        AVG(cfc.net_revenue_365d)::double precision AS avg_net_revenue_365d,
        AVG(cfc.gross_margin_365d)::double precision AS avg_gross_margin_365d,
        AVG(cfc.order_count_365d)::double precision AS avg_order_count_365d,
        AVG(cfc.return_rate_365d)::double precision AS avg_return_rate_365d,
        AVG(cfc.markdown_revenue_share_365d)::double precision AS avg_markdown_share_365d
       FROM app.customer_features_current cfc
      WHERE ${compiled.sql}`,
    ...compiled.params,
  );

  const topStores = await prisma.$queryRawUnsafe<Array<{ preferred_store_id: string | null; customers: bigint }>>(
    `SELECT cfc.preferred_store_id, COUNT(*)::bigint AS customers
       FROM app.customer_features_current cfc
      WHERE ${compiled.sql}
      GROUP BY cfc.preferred_store_id
      ORDER BY COUNT(*) DESC, cfc.preferred_store_id NULLS LAST
      LIMIT 5`,
    ...compiled.params,
  );

  const topChannels = await prisma.$queryRawUnsafe<Array<{ preferred_channel: string | null; customers: bigint }>>(
    `SELECT cfc.preferred_channel, COUNT(*)::bigint AS customers
       FROM app.customer_features_current cfc
      WHERE ${compiled.sql}
      GROUP BY cfc.preferred_channel
      ORDER BY COUNT(*) DESC, cfc.preferred_channel NULLS LAST
      LIMIT 5`,
    ...compiled.params,
  );

  const sampleCustomers = await Promise.all(
    sampleRows.map(async (row) => ({
      customerId: row.customer_id,
      score: 100,
      reasonCodes: await buildReasonCodes(row.customer_id, request.ruleAst),
    })),
  );

  return {
    isValid: true,
    validationErrors: [],
    estimatedSize: Number(countRows[0]?.estimated_size ?? 0n),
    sampleCustomers,
    profile: {
      avgNetRevenue365d: decimalToNumber(profileRows[0]?.avg_net_revenue_365d) ?? 0,
      avgGrossMargin365d: decimalToNumber(profileRows[0]?.avg_gross_margin_365d) ?? 0,
      avgOrderCount365d: decimalToNumber(profileRows[0]?.avg_order_count_365d) ?? 0,
      avgReturnRate365d: decimalToNumber(profileRows[0]?.avg_return_rate_365d) ?? 0,
      avgMarkdownShare365d: decimalToNumber(profileRows[0]?.avg_markdown_share_365d) ?? 0,
      topStores: topStores.map((row) => ({
        preferredStoreId: row.preferred_store_id,
        customers: Number(row.customers),
      })),
      topChannels: topChannels.map((row) => ({
        preferredChannel: row.preferred_channel,
        customers: Number(row.customers),
      })),
      topCategories: [],
    },
  };
}
