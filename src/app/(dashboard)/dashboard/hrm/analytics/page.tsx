import { auth } from "@/lib/auth";
import { getHrmOverview } from "@/lib/hrm-monitoring";
import { redirect } from "next/navigation";
import { OperationsAnalyticsDashboard } from "@/components/insights/operations-analytics-dashboard";

export default async function HrmAnalyticsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as any;
  if (!["HRM", "SUPER_ADMIN"].includes(user.role)) redirect("/dashboard");

  const overview = await getHrmOverview({
    id: user.id,
    role: user.role,
    organizationId: user.organizationId,
  });

  return (
    <OperationsAnalyticsDashboard
      busyStaff={overview.analytics.busiestStaff}
      tasksPerDepartment={overview.analytics.tasksPerDepartment}
    />
  );
}
