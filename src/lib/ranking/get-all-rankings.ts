import { prisma } from "@/lib/prisma";
import { computeRankings, type RankingOrderRow } from "./compute-ranking";

export type RankingPeriod = "weekly" | "monthly";

export type RankingItem = {
  organizationId: string;
  labName: string;
  city: string;
  totalTests: number;
  completedTests: number;
  delayedTests: number;
  onTimeTests: number;
  turnaroundScore: number;
  consistencyScore: number;
  activityScore: number;
  healthScore: number;
  completionScore: number;
  finalScore: number;
  delayRate: number;
};

export type RankingsResult = {
  period: RankingPeriod;
  startDate: Date;
  endDate: Date;
  topLab: RankingItem | null;
  totalLabsRanked: number;
  items: RankingItem[];
  groupedByCity: Record<string, RankingItem[]>;
};

function getPeriodWindow(period: RankingPeriod) {
  const endDate = new Date();
  if (period === "weekly") {
    const days = 7;
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    const previousEndDate = new Date(startDate);
    const previousStartDate = new Date(previousEndDate.getTime() - days * 24 * 60 * 60 * 1000);
    return { startDate, endDate, previousStartDate, previousEndDate };
  }

  const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1, 0, 0, 0, 0);
  const previousStartDate = new Date(endDate.getFullYear(), endDate.getMonth() - 1, 1, 0, 0, 0, 0);
  const previousEndDate = new Date(startDate);
  return { startDate, endDate, previousStartDate, previousEndDate };
}

function toRankingRows(
  rows: Array<{
    organizationId: string;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    status: string;
    test: { turnaroundMinutes: number; organization: { id: string; name: string; city: string | null } };
  }>
): { metricRows: RankingOrderRow[]; orgMeta: Map<string, { labName: string; city: string }> } {
  const metricRows: RankingOrderRow[] = [];
  const orgMeta = new Map<string, { labName: string; city: string }>();

  for (const row of rows) {
    metricRows.push({
      organizationId: row.organizationId,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      status: row.status,
      turnaroundMinutes: row.test.turnaroundMinutes,
    });

    if (!orgMeta.has(row.organizationId)) {
      orgMeta.set(row.organizationId, {
        labName: row.test.organization.name,
        city: row.test.organization.city?.trim() || "Unknown",
      });
    }
  }

  return { metricRows, orgMeta };
}

export async function getAllRankings(period: RankingPeriod): Promise<RankingsResult> {
  const { startDate, endDate, previousStartDate, previousEndDate } = getPeriodWindow(period);

  const [currentRows, previousRows] = await Promise.all([
    prisma.testOrder.findMany({
      where: {
        createdAt: { gte: startDate, lt: endDate },
      },
      select: {
        organizationId: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        status: true,
        test: {
          select: {
            turnaroundMinutes: true,
            organization: { select: { id: true, name: true, city: true } },
          },
        },
      },
    }),
    prisma.testOrder.findMany({
      where: {
        createdAt: { gte: previousStartDate, lt: previousEndDate },
      },
      select: {
        organizationId: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        status: true,
        test: {
          select: {
            turnaroundMinutes: true,
            organization: { select: { id: true, name: true, city: true } },
          },
        },
      },
    }),
  ]);

  const current = toRankingRows(currentRows);
  const previous = toRankingRows(previousRows);
  const computed = computeRankings(current.metricRows, previous.metricRows);

  const items: RankingItem[] = computed
    .filter((item) => item.totalTests >= 20)
    .map((item) => {
      const meta = current.orgMeta.get(item.organizationId) ?? previous.orgMeta.get(item.organizationId);
      return {
        organizationId: item.organizationId,
        labName: meta?.labName ?? "Unknown Lab",
        city: meta?.city ?? "Unknown",
        totalTests: item.totalTests,
        completedTests: item.completedTests,
        delayedTests: item.delayedTests,
        onTimeTests: item.onTimeTests,
        turnaroundScore: item.turnaroundScore,
        consistencyScore: item.consistencyScore,
        activityScore: item.activityScore,
        healthScore: item.healthScore,
        completionScore: item.completionScore,
        finalScore: item.finalScore,
        delayRate: item.delayRate,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);

  const groupedByCity: Record<string, RankingItem[]> = {};
  for (const item of items) {
    if (!groupedByCity[item.city]) groupedByCity[item.city] = [];
    groupedByCity[item.city].push(item);
  }

  return {
    period,
    startDate,
    endDate,
    topLab: items[0] ?? null,
    totalLabsRanked: items.length,
    items,
    groupedByCity,
  };
}
