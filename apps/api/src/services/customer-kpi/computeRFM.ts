export type RfmScores = {
  rScore: number | null;
  fScore: number | null;
  mScore: number | null;
};

export function computeRfmScores(input: {
  recencyDays: number | null;
  orders90d: number;
  lifetimeValue: number;
}): RfmScores {
  if (input.recencyDays == null) {
    return { rScore: null, fScore: 1, mScore: 1 };
  }

  return {
    rScore: scoreRecency(input.recencyDays),
    fScore: scoreFrequency(input.orders90d),
    mScore: scoreMonetary(input.lifetimeValue),
  };
}

function scoreRecency(recencyDays: number): number {
  if (recencyDays <= 30) return 5;
  if (recencyDays <= 60) return 4;
  if (recencyDays <= 90) return 3;
  if (recencyDays <= 180) return 2;
  return 1;
}

function scoreFrequency(orders90d: number): number {
  if (orders90d >= 12) return 5;
  if (orders90d >= 6) return 4;
  if (orders90d >= 3) return 3;
  if (orders90d >= 1) return 2;
  return 1;
}

function scoreMonetary(lifetimeValue: number): number {
  if (lifetimeValue >= 10000) return 5;
  if (lifetimeValue >= 5000) return 4;
  if (lifetimeValue >= 2000) return 3;
  if (lifetimeValue >= 500) return 2;
  return 1;
}
