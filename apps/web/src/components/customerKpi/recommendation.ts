import type { CustomerKpiListRow, CustomerMetrics, RecommendedAction } from '../../types/customerKpi'

type MetricsLike = Pick<
  CustomerKpiListRow | CustomerMetrics,
  | 'churnRisk'
  | 'isDormant'
  | 'rScore'
  | 'fScore'
  | 'mScore'
  | 'recencyDays'
  | 'discountRatio'
  | 'avgDaysBetweenOrders'
  | 'lifetimeValue'
  | 'totalOrders'
>

export function deriveRecommendation(metrics: MetricsLike): RecommendedAction {
  const r = metrics.rScore ?? 0
  const f = metrics.fScore ?? 0
  const m = metrics.mScore ?? 0
  const recency = metrics.recencyDays ?? null
  const expected = metrics.avgDaysBetweenOrders ?? null
  const discountRatio = metrics.discountRatio ?? 0

  if (metrics.totalOrders === 0) {
    return {
      type: 'NEUTRAL',
      title: 'Recommended Action',
      message: 'No purchases yet. Recommendations will appear after the first transaction.',
      tone: 'neutral',
    }
  }

  if (r >= 5 && f >= 4 && m >= 4) {
    return {
      type: 'VIP_RETENTION',
      title: 'Protect this VIP customer',
      message:
        'High value and recently active. Do not send aggressive discounts. Recommended campaign: early access, new arrivals, or exclusive preview.',
      tone: 'positive',
    }
  }

  if (metrics.churnRisk === 'HIGH' && m >= 3) {
    const recencyText = recency != null ? `${recency} days` : 'a long time'
    const expectedText = expected != null ? ` Previously bought every ${Math.round(expected)} days.` : ''
    return {
      type: 'WIN_BACK',
      title: 'Win-back high-value customer',
      message: `This customer has not purchased in ${recencyText}.${expectedText} Recommended campaign: limited-time win-back offer.`,
      tone: 'warning',
    }
  }

  if (discountRatio >= 0.5) {
    return {
      type: 'CONTROLLED_DISCOUNT',
      title: 'Use controlled promotions',
      message:
        'This customer buys mostly during promotions. Recommended campaign: controlled discount with excluded premium SKUs.',
      tone: 'warning',
    }
  }

  if (metrics.isDormant) {
    return {
      type: 'INACTIVE_OUTREACH',
      title: 'Reactivation outreach',
      message:
        'No purchases in 120+ days. Recommended campaign: re-engagement message with a low-cost incentive.',
      tone: 'warning',
    }
  }

  if (r >= 4 && f <= 2) {
    return {
      type: 'NEW_CUSTOMER_NURTURE',
      title: 'Nurture this new customer',
      message:
        'Recently acquired with limited history. Recommended campaign: welcome series and category education.',
      tone: 'neutral',
    }
  }

  if (f >= 4 && m >= 3) {
    return {
      type: 'STEADY_LOYAL',
      title: 'Steady loyal customer',
      message: 'Consistent purchasing pattern. Recommended campaign: loyalty rewards and category cross-sell.',
      tone: 'positive',
    }
  }

  return {
    type: 'NEUTRAL',
    title: 'Maintain engagement',
    message: 'No urgent action required. Continue routine marketing.',
    tone: 'neutral',
  }
}
