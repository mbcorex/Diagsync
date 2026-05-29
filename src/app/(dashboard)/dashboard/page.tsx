import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDashboardPath } from "@/lib/utils";
import { getLabStats } from "@/lib/analytics/lab-stats";
import { RevenueStatsCard } from "@/components/insights/revenue-stats-card";
import { MdStaffCallPanel } from "@/components/md/md-staff-call-panel";

export default async function InsightsDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as any;
  if (!["SUPER_ADMIN", "HRM", "MD"].includes(user.role)) {
    redirect(getDashboardPath(user.role));
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [labStats, patientsToday, recentOrders] = await Promise.all([
    getLabStats(user.organizationId),
    prisma.visit.count({
      where: { organizationId: user.organizationId, registeredAt: { gte: todayStart, lt: now } },
    }),
    prisma.testOrder.findMany({
      where: {
        organizationId: user.organizationId,
        startedAt: { not: null },
        completedAt: { not: null, gte: weekStart, lt: now },
      },
      select: {
        assignedToId: true,
        startedAt: true,
        completedAt: true,
        test: { select: { turnaroundMinutes: true } },
      },
    }),
  ]);

  let alerts = 0;
  const staffCountMap = new Map<string, number>();
  for (const order of recentOrders) {
    if (!order.startedAt || !order.completedAt) continue;
    const elapsedMinutes = Math.floor((order.completedAt.getTime() - order.startedAt.getTime()) / 60000);
    if (elapsedMinutes > order.test.turnaroundMinutes) alerts += 1;
    if (order.assignedToId) {
      staffCountMap.set(order.assignedToId, (staffCountMap.get(order.assignedToId) ?? 0) + 1);
    }
  }

  const staffIds = Array.from(staffCountMap.keys());
  const staffRows = staffIds.length
    ? await prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, fullName: true } })
    : [];
  const staffNameMap = new Map(staffRows.map((s) => [s.id, s.fullName]));
  const staffPerformance = staffIds
    .map((id) => ({ id, name: staffNameMap.get(id) ?? "Unknown Staff", completedTests: staffCountMap.get(id) ?? 0 }))
    .sort((a, b) => b.completedTests - a.completedTests)
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <MdStaffCallPanel callerRole={user.role} />
      
      <RevenueStatsCard
        patientsToday={patientsToday}
        labStats={labStats}
        alerts={alerts}
        staffPerformance={staffPerformance}
      />

      <div className="flex justify-end">
        <Link href="/insights/reports" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          View Full Report →
        </Link>
      </div>
    </div>
  );
}
