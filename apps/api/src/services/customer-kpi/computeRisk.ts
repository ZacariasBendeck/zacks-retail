export function computeChurnRisk(
  recencyDays: number | null,
  avgDaysBetweenOrders: number | null,
): 'LOW' | 'MEDIUM' | 'HIGH' | null {
  if (recencyDays == null) return null;

  const expectedCycle =
    avgDaysBetweenOrders != null && avgDaysBetweenOrders > 0 ? avgDaysBetweenOrders : 60;

  if (recencyDays > expectedCycle * 2) return 'HIGH';
  if (recencyDays > expectedCycle * 1.2) return 'MEDIUM';
  return 'LOW';
}
