import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRevenueStats } from "@/lib/analytics/revenue";
import { getLabStats } from "@/lib/analytics/lab-stats";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const user = session.user as any;
    if (!["SUPER_ADMIN", "HRM", "MD"].includes(user.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [revenueStats, labStats, patientsToday, completedOrders, staffPerformanceRaw] = await Promise.all([
      getRevenueStats(user.organizationId),
      getLabStats(user.organizationId),
      prisma.visit.count({
        where: { organizationId: user.organizationId, registeredAt: { gte: todayStart, lt: now } },
      }),
      prisma.testOrder.findMany({
        where: {
          organizationId: user.organizationId,
          startedAt: { not: null },
          completedAt: { not: null, gte: todayStart, lt: now },
        },
        select: {
          startedAt: true,
          completedAt: true,
          test: { select: { turnaroundMinutes: true } },
        },
      }),
      prisma.testOrder.groupBy({
        by: ["assignedToId"],
        where: {
          organizationId: user.organizationId,
          assignedToId: { not: null },
          completedAt: { gte: todayStart, lt: now },
        },
        _count: { _all: true },
        orderBy: { _count: { assignedToId: "desc" } },
        take: 5,
      }),
    ]);
    const alerts = completedOrders.reduce((acc, order) => {
      if (!order.startedAt || !order.completedAt) return acc;
      const elapsed = Math.floor((order.completedAt.getTime() - order.startedAt.getTime()) / 60000);
      return elapsed > order.test.turnaroundMinutes ? acc + 1 : acc;
    }, 0);

    const staffIds = staffPerformanceRaw
      .map((row) => row.assignedToId)
      .filter((id): id is string => Boolean(id));
    const staff = staffIds.length
      ? await prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, fullName: true } })
      : [];
    const staffMap = new Map(staff.map((s) => [s.id, s.fullName]));

    return NextResponse.json({
      success: true,
      data: {
        todayRevenue: revenueStats.periodRevenue,
        monthRevenue: revenueStats.periodRevenue,
        growth: revenueStats.growth,
        patientsToday,
        patientsWeek: labStats.patientsThisWeek,
        alerts,
        topTests: revenueStats.topTests,
        staffPerformance: staffPerformanceRaw.map((row) => ({
          staffId: row.assignedToId,
          name: row.assignedToId ? staffMap.get(row.assignedToId) ?? "Unknown Staff" : "Unassigned",
          completedTests:
            row._count && typeof row._count === "object" && "_all" in row._count
              ? Number((row._count as { _all?: number })._all ?? 0)
              : 0,
        })),
        busiestDay: labStats.busiestDay,
        quietestDay: labStats.quietestDay,
      },
    });
  } catch (error) {
    console.error("[INSIGHTS_SUMMARY_GET]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
