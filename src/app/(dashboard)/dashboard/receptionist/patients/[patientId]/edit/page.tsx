import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { EditPatientForm } from "@/components/receptionist/edit-patient-form";
import { getPatientTrends } from "@/lib/intelligence/patient-trends";

export default async function EditReceptionPatientPage({
  params,
}: {
  params: { patientId: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as any;

  if (!["RECEPTIONIST", "SUPER_ADMIN", "HRM"].includes(user.role)) {
    redirect("/dashboard/receptionist/patients");
  }

  const patient = await prisma.patient.findFirst({
    where: { id: params.patientId, organizationId: user.organizationId },
    include: {
      visits: {
        orderBy: { registeredAt: "desc" },
        take: 1,
        include: {
          testOrders: {
            orderBy: { registeredAt: "asc" },
            include: {
              test: {
                include: {
                  category: { select: { name: true } },
                },
              },
            },
          },
          payments: {
            orderBy: { createdAt: "asc" },
            include: { recordedBy: { select: { fullName: true } } },
          },
        },
      },
    },
  });

  if (!patient || patient.visits.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-semibold text-slate-800">Edit Patient</h1>
        <p className="text-sm text-slate-500">Patient or active visit was not found.</p>
        <Link href="/dashboard/receptionist/patients" className="text-xs text-blue-600 hover:underline">
          Back to Patients
        </Link>
      </div>
    );
  }

  const latestVisit = patient.visits[0];
  const trends = await getPatientTrends(patient.id);

  const trendStyle: Record<string, string> = {
    RISING: "bg-amber-50 text-amber-700 border-amber-200",
    FALLING: "bg-blue-50 text-blue-700 border-blue-200",
    STABLE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Edit Patient Visit</h1>
          <p className="text-xs text-slate-500">
            {patient.fullName} · {patient.patientId} · {latestVisit.visitNumber}
          </p>
        </div>
        <Link href="/dashboard/receptionist/patients" className="rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
          Back
        </Link>
      </div>

      <EditPatientForm
        visitId={latestVisit.id}
        patient={{
          id: patient.id,
          patientId: patient.patientId,
          fullName: patient.fullName,
          age: patient.age,
          sex: patient.sex,
          phone: patient.phone,
          email: patient.email,
          address: patient.address,
          dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.toISOString() : null,
          referringDoctor: patient.referringDoctor,
          clinicalNote: patient.clinicalNote,
        }}
        visit={{
          priority: latestVisit.priority,
          amountPaid: Number(latestVisit.amountPaid),
          discount: Number(latestVisit.discount),
          paymentMethod: latestVisit.paymentMethod,
          notes: latestVisit.notes,
        }}
        payments={latestVisit.payments.map((entry) => ({
          id: entry.id,
          amount: Number(entry.amount),
          paymentMethod: entry.paymentMethod,
          paymentType: entry.paymentType,
          notes: entry.notes,
          createdAt: entry.createdAt.toISOString(),
          recordedByName: entry.recordedBy.fullName,
        }))}
        tests={latestVisit.testOrders.map((order) => ({
          orderId: order.id,
          status: order.status,
          id: order.test.id,
          name: order.test.name,
          code: order.test.code,
          type: order.test.type,
          department: order.test.department,
          sampleType: order.test.sampleType,
          category: order.test.category,
          price: Number(order.price),
        }))}
      />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">Patient Insights</h2>
        <p className="mt-1 text-xs text-slate-500">Trend summary from the most recent result history.</p>
        {trends.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">No trend data available yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {trends.map((trend) => (
              <div
                key={trend.testName}
                className="rounded-md border border-slate-200 bg-slate-50/60 p-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">{trend.testName}</span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${
                      trendStyle[trend.trend] ?? "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {trend.trend}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{trend.message}</p>
                <p className="mt-1 text-[11px] text-slate-500">Values: {trend.values.join(", ")}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
