import { computeActivityEfficiencyFromData } from "@/lib/analytics/activity-efficiency";
import { ensureValidTimestamps } from "@/lib/utils/timestamp-safety";

export type RankingOrderRow = {
  organizationId: string;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  status: string;
  turnaroundMinutes: number;
};

export type OrganizationRanking = {
  organizationId: string;
  totalTests: number;
  completedTests: number;
  delayedTests: number;
  onTimeTests: number;
  turnaroundScore: number;
  delayRate: number;
  consistencyScore: number;
  healthScore: number;
  completionScore: number;
  activityScore: number;
  finalScore: number;
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function applyLeniencyFloor(value: number) {
  // Keep rankings meaningful while avoiding overly harsh low-end collapse.
  return Math.max(50, value);
}

function groupByOrganization(rows: RankingOrderRow[]) {
  const grouped = new Map<string, RankingOrderRow[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.organizationId);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(row.organizationId, [row]);
    }
  }
  return grouped;
}

export function computeRankings(
  testOrders: RankingOrderRow[],
  previousPeriodOrders: RankingOrderRow[]
): OrganizationRanking[] {
  const currentByOrg = groupByOrganization(testOrders);
  const previousByOrg = groupByOrganization(previousPeriodOrders);
  const nowMs = Date.now();
  const rankings: OrganizationRanking[] = [];

  for (const [organizationId, orgOrders] of Array.from(currentByOrg.entries())) {
    const totalTests = orgOrders.length;
    if (totalTests === 0) continue;

    const previousOrders = previousByOrg.get(organizationId) ?? [];

    let completedTests = 0;
    let delayedTests = 0;
    let onTimeTests = 0;

    for (const order of orgOrders) {
      const safe = ensureValidTimestamps(order);
      const startedMs = safe.startedAt.getTime();
      const endMs = safe.completedAt ? safe.completedAt.getTime() : nowMs;
      const elapsedMinutes = Math.max(0, (endMs - startedMs) / 60000);
      const expectedMinutes = Math.max(1, order.turnaroundMinutes || 1);
      const isDelayed = elapsedMinutes > expectedMinutes;
      const isCompleted = Boolean(safe.completedAt) || order.status === "COMPLETED";

      if (isCompleted) completedTests += 1;
      if (isDelayed) delayedTests += 1;
      else onTimeTests += 1;
    }

    const onTimeRate = onTimeTests / totalTests;
    const turnaroundScore = 55 + onTimeRate * 45;
    const delayRate = delayedTests / totalTests;
    const consistencyScore = 100 - delayRate * 55;
    const healthScore = 100 - delayRate * 45;
    const completionScore = 50 + (completedTests / totalTests) * 50;
    const activity = computeActivityEfficiencyFromData(orgOrders, previousOrders);
    const activityScore = 45 + activity.activityScore * 0.55;

    const finalScore =
      turnaroundScore * 0.3 +
      consistencyScore * 0.2 +
      activityScore * 0.25 +
      healthScore * 0.1 +
      completionScore * 0.15;

    rankings.push({
      organizationId,
      totalTests,
      completedTests,
      delayedTests,
      onTimeTests,
      turnaroundScore: round2(clampScore(turnaroundScore)),
      delayRate: round2(delayRate),
      consistencyScore: round2(clampScore(consistencyScore)),
      healthScore: round2(clampScore(healthScore)),
      completionScore: round2(clampScore(completionScore)),
      activityScore: round2(clampScore(activityScore)),
      finalScore: round2(applyLeniencyFloor(clampScore(finalScore))),
    });
  }

  return rankings.sort((a, b) => b.finalScore - a.finalScore);
}
