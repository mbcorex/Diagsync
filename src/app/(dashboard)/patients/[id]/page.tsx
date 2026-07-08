import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPatientTrends } from "@/lib/intelligence/patient-trends";
import { formatPatientAge } from "@/lib/patient-age";

export default async function PatientInsightsPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as any;

  const patient = await prisma.patient.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    select: {
      id: true,
      fullName: true,
      patientId: true,
      age: true,
      sex: true,
    },
  });

  if (!patient) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Patient not found
      </div>
    );
  }

  const trends = await getPatientTrends(patient.id);
  const trendStyle: Record<string, string> = {
    RISING: "bg-red-50 text-red-700 border-red-200",
    FALLING: "bg-amber-50 text-amber-700 border-amber-200",
    STABLE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold text-slate-800">{patient.fullName}</h1>
          <p className="text-xs text-slate-500">
            {patient.patientId} • {formatPatientAge({ age: patient.age })} • {patient.sex}
          </p>
        </div>
        <Link href="/dashboard/receptionist/patients" className="rounded-lg border px-4 py-2 text-xs text-slate-700 hover:bg-slate-100">
          Back to Patients
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Patient Insights</h2>
        <p className="text-xs text-slate-500">Last 3-5 result values by test trend.</p>

        {trends.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No data yet</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <div className="flex min-w-max gap-3">
              {trends.map((trend) => (
                <article key={trend.testName} className="w-72 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-800">{trend.testName}</h3>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        trendStyle[trend.trend] ?? "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      {trend.trend === "RISING" ? "Rising" : trend.trend === "FALLING" ? "Falling" : "Stable"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">Values: {trend.values.join(", ")}</p>
                  <p className="mt-2 text-xs text-slate-500">{trend.message}</p>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}




