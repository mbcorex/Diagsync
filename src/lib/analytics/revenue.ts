import { prisma } from "@/lib/prisma";

export function dayStart(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function nextMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
}

function safeGrowth(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

export type RevenuePeriod = "today" | "last7" | "last30" | "thisMonth" | "lastMonth" | "thisYear" | "allTime" | "custom";

export function getDateRangeForPeriod(period: RevenuePeriod, customStart?: Date, customEnd?: Date) {
  const now = new Date();
  let rangeStart: Date;
  let rangeEnd: Date = now;
  let comparisonStart: Date;
  let comparisonEnd: Date;

  switch (period) {
    case "today":
      rangeStart = dayStart(now);
      comparisonStart = dayStart(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      comparisonEnd = rangeStart;
      break;
    case "last7":
      rangeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      comparisonStart = new Date(rangeStart.getTime() - 7 * 24 * 60 * 60 * 1000);
      comparisonEnd = rangeStart;
      break;
    case "last30":
      rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      comparisonStart = new Date(rangeStart.getTime() - 30 * 24 * 60 * 60 * 1000);
      comparisonEnd = rangeStart;
      break;
    case "thisMonth":
      rangeStart = monthStart(now);
      comparisonStart = monthStart(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      comparisonEnd = rangeStart;
      break;
    case "lastMonth":
      rangeEnd = monthStart(now);
      rangeStart = monthStart(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      comparisonStart = monthStart(new Date(now.getFullYear(), now.getMonth() - 2, 1));
      comparisonEnd = rangeStart;
      break;
    case "thisYear":
      rangeStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      comparisonStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      comparisonEnd = rangeStart;
      break;
    case "custom":
      rangeStart = customStart || dayStart(now);
      rangeEnd = customEnd || now;
      const rangeDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000));
      comparisonStart = new Date(rangeStart.getTime() - rangeDays * 24 * 60 * 60 * 1000);
      comparisonEnd = rangeStart;
      break;
    case "allTime":
    default:
      rangeStart = new Date(1970, 0, 1);
      comparisonStart = new Date(1970, 0, 1);
      comparisonEnd = rangeStart;
  }

  return { rangeStart, rangeEnd, comparisonStart, comparisonEnd };
}

export async function getRevenueStats(orgId: string, period: RevenuePeriod = "today", customStart?: Date, customEnd?: Date) {
  const now = new Date();
  const { rangeStart, rangeEnd, comparisonStart, comparisonEnd } = getDateRangeForPeriod(period, customStart, customEnd);
  const monthCurrentStart = monthStart(now);
  const monthNextStart = nextMonthStart(now);

  const [rangeAgg, comparisonAgg, topTestsRaw, staffRevenueRaw] = await Promise.all([
    prisma.visit.aggregate({
      where: {
        organizationId: orgId,
        registeredAt: { gte: rangeStart, lte: rangeEnd },
      },
      _sum: { amountPaid: true },
    }),
    prisma.visit.aggregate({
      where: {
        organizationId: orgId,
        registeredAt: { gte: comparisonStart, lt: comparisonEnd },
      },
      _sum: { amountPaid: true },
    }),
    prisma.testOrder.groupBy({
      by: ["testId"],
      where: {
        organizationId: orgId,
        registeredAt: { gte: rangeStart, lte: rangeEnd },
      },
      _sum: { price: true },
      orderBy: { _sum: { price: "desc" } },
      take: 5,
    }),
    prisma.testOrder.groupBy({
      by: ["assignedToId"],
      where: {
        organizationId: orgId,
        registeredAt: { gte: rangeStart, lte: rangeEnd },
        assignedToId: { not: null },
      },
      _sum: { price: true },
      orderBy: { _sum: { price: "desc" } },
    }),
  ]);

  const testIds = topTestsRaw.map((x) => x.testId);
  const staffIds = staffRevenueRaw
    .map((x) => x.assignedToId)
    .filter((id): id is string => Boolean(id));

  const [tests, staff] = await Promise.all([
    testIds.length
      ? prisma.diagnosticTest.findMany({
          where: { id: { in: testIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    staffIds.length
      ? prisma.staff.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, fullName: true },
        })
      : Promise.resolve([]),
  ]);

  const testMap = new Map(tests.map((t) => [t.id, t.name]));
  const staffMap = new Map(staff.map((s) => [s.id, s.fullName]));

  return {
    periodRevenue: Number(rangeAgg._sum.amountPaid ?? 0),
    comparisonRevenue: Number(comparisonAgg._sum.amountPaid ?? 0),
    growth: safeGrowth(Number(rangeAgg._sum.amountPaid ?? 0), Number(comparisonAgg._sum.amountPaid ?? 0)),
    rangeStart,
    rangeEnd,
    topTests: topTestsRaw.map((row) => ({
      testId: row.testId,
      testName: testMap.get(row.testId) ?? "Unknown Test",
      amount: Number(row._sum.price ?? 0),
    })),
    staffRevenue: staffRevenueRaw.map((row) => ({
      staffId: row.assignedToId,
      staffName: row.assignedToId ? staffMap.get(row.assignedToId) ?? "Unknown Staff" : "Unassigned",
      amount: Number(row._sum.price ?? 0),
    })),
  };
}
