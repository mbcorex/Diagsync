import { prisma } from "@/lib/prisma";

function dayStart(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function nextMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
}

function safeGrowth(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

export async function getRevenueStats(orgId: string) {
  const now = new Date();
  const todayStart = dayStart(now);
  const monthCurrentStart = monthStart(now);
  const monthNextStart = nextMonthStart(now);
  const monthPreviousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);

  const [todayAgg, monthAgg, prevMonthAgg, topTestsRaw, staffRevenueRaw] = await Promise.all([
    prisma.visit.aggregate({
      where: {
        organizationId: orgId,
        registeredAt: { gte: todayStart, lt: now },
      },
      _sum: { amountPaid: true },
    }),
    prisma.visit.aggregate({
      where: {
        organizationId: orgId,
        registeredAt: { gte: monthCurrentStart, lt: monthNextStart },
      },
      _sum: { amountPaid: true },
    }),
    prisma.visit.aggregate({
      where: {
        organizationId: orgId,
        registeredAt: { gte: monthPreviousStart, lt: monthCurrentStart },
      },
      _sum: { amountPaid: true },
    }),
    prisma.testOrder.groupBy({
      by: ["testId"],
      where: {
        organizationId: orgId,
        registeredAt: { gte: monthCurrentStart, lt: monthNextStart },
      },
      _sum: { price: true },
      orderBy: { _sum: { price: "desc" } },
      take: 5,
    }),
    prisma.testOrder.groupBy({
      by: ["assignedToId"],
      where: {
        organizationId: orgId,
        registeredAt: { gte: monthCurrentStart, lt: monthNextStart },
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
    todayRevenue: Number(todayAgg._sum.amount ?? 0),
    monthRevenue: Number(monthAgg._sum.amount ?? 0),
    growth: safeGrowth(Number(monthAgg._sum.amount ?? 0), Number(prevMonthAgg._sum.amount ?? 0)),
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
