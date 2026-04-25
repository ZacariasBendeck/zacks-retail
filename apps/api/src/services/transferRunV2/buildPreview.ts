import type {
  BalancingTransferPreviewComparisonV2,
  BalancingTransferPreviewLineV2,
  BalancingTransferPreviewSummaryV2,
} from '../../models/transferRunsV2';
import type { TransferPreviewException } from '../../models/transferRuns';
import { buildBalancingPreviewLinesV2 } from './decisionPasses';
import { deriveDemandFactsV2 } from './deriveDemand';
import { deriveNeedAndSpareV2 } from './deriveNeedAndSpare';
import type { BalancingFactsV2, BuildPreviewResultV2 } from './types';

function pushException(bucket: TransferPreviewException[], exception: TransferPreviewException): void {
  bucket.push(exception);
}

function withLimitWarning(
  facts: BalancingFactsV2,
  summary: BalancingTransferPreviewSummaryV2,
  lines: BalancingTransferPreviewLineV2[],
  exceptions: TransferPreviewException[],
): void {
  const limit = facts.input.criteria.limit;
  if (limit != null && facts.skus.length >= limit) {
    pushException(exceptions, {
      code: 'BALANCING_V2_SKU_LIMIT_REACHED',
      severity: 'warning',
      message: `Preview hit the explicit SKU limit at ${limit.toLocaleString()} SKUs. Narrow criteria if results look truncated.`,
    });
    summary.exceptionCount = exceptions.length;
  }
  if (lines.length === 0 && exceptions.length === 0) {
    pushException(exceptions, {
      code: 'BALANCING_V2_NO_TRANSFERS',
      severity: 'warning',
      message: 'No v2 balancing transfers were proposed for the selected criteria.',
    });
    summary.exceptionCount = exceptions.length;
  }
}

function buildComparison(): BalancingTransferPreviewComparisonV2 | null {
  return null;
}

export function buildBalancingPreviewV2(facts: BalancingFactsV2): BuildPreviewResultV2 {
  deriveDemandFactsV2(facts);
  deriveNeedAndSpareV2(facts);

  const preview = buildBalancingPreviewLinesV2(facts);
  withLimitWarning(facts, preview.summary, preview.lines, preview.exceptions);

  return {
    lines: preview.lines,
    exceptions: preview.exceptions,
    summary: preview.summary,
    comparison: buildComparison(),
  };
}
