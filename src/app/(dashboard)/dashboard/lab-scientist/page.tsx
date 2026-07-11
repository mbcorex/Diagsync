import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LabTaskBoard } from "@/components/lab/lab-task-board";

export default async function LabScientistDashboard() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as any;
  if (user.role !== "LAB_SCIENTIST" && user.role !== "SUPER_ADMIN") redirect("/dashboard");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold text-slate-800">Lab Dashboard</h1>
        <p className="text-xs text-slate-400 mt-0.5">Assigned tasks from sample collection to result submission.</p>
      </div>
      <LabTaskBoard organizationId={user.organizationId} />
    </div>
  );
}
