import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { DayRolloverRefresh } from "@/components/receptionist/day-rollover-refresh";
import { DeletePatientButton } from "@/components/receptionist/delete-patient-button";
import { formatPatientAge } from "@/lib/patient-age";
import {
  PAYMENT_METHOD_BREAKDOWN_KEYS,
  PAYMENT_METHOD_LABELS,
  collectedByPaymentMethod,
  normalizePaymentMethodKey,
  paymentMethodLabel,
} from "@/lib/payment-methods";

type DaySummary = {
  key: string;
  rows: Array<{
    id: string;
    fullName: string;
    patientId: string;
    age: number;
    dateOfBirth?: Date | null;
    sex: string;
    createdAt: Date;
    registeredById: string;
    registeredBy: { fullName: string };
    latestVisit:
      | {
          id: string;
          priority: string;
          paymentStatus: string;
          paymentMethod: string | null;
          paymentMethodSummary: string;
          totalAmount: number;
          amountPaid: number;
          testOrders: Array<{ id: string; test: { name: string } }>;
        }
      | null;
  }>;
  totalBilled: number;
  totalPaid: number;
  totalTests: number;
  collectedByMethod: Record<string, number>;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function todayDayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function shiftDayKey(dayKey: string, delta: number) {
  const [y, m, d] = dayKey.split("-").map((v) => Number(v));
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + delta);
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

function dayKeyToRangeUtc(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map((v) => Number(v));
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { start, end };
}

function toDayKey(date: Date | string) {
  const value = new Date(date);
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

function formatDayLabel(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map((v) => Number(v));
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  return date.toLocaleDateString("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "Cash", or "Cash + Transfer" when a visit was settled with more than one method. */
function summarizeMethodsForRow(perMethod: Record<string, number>, visitMethod?: string | null) {
  const used = Object.entries(perMethod)
    .filter(([, amount]) => Math.abs(amount) > 0.0001)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => PAYMENT_METHOD_LABELS[key] ?? PAYMENT_METHOD_LABELS.UNKNOWN);
  if (used.length === 0) return paymentMethodLabel(visitMethod);
  return used.join(" + ");
}

export default async function PatientsListPage({
  searchParams,
}: {
  searchParams: { search?: string; date?: string; days?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as any;

  if (!["RECEPTIONIST", "SUPER_ADMIN", "HRM", "MD"].includes(user.role)) {
    redirect("/dashboard/hrm");
  }

  const search = (searchParams.search ?? "").trim();
  const selectedDate =
    /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? "") ? (searchParams.date as string) : todayDayKey();
  const requestedDays = Number.parseInt(searchParams.days ?? "14", 10);
  const daysWindow = Number.isNaN(requestedDays) ? 14 : Math.max(1, Math.min(90, requestedDays));

  const startDayKey = shiftDayKey(selectedDate, -(daysWindow - 1));
  const endDayKey = selectedDate;
  const { start: rangeStart, end: rangeEnd } = dayKeyToRangeUtc(endDayKey);
  const { start: absoluteStart } = dayKeyToRangeUtc(startDayKey);

  const where: any = {
    organizationId: user.organizationId,
    createdAt: { gte: absoluteStart, lte: rangeEnd },
    ...(search && {
      OR: [
        { fullName: { contains: search, mode: "insensitive" } },
        { patientId: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [patients, olderCount] = await prisma.$transaction([
    prisma.patient.findMany({
      where,
      include: {
        registeredBy: { select: { id: true, fullName: true } },
        visits: {
          orderBy: { registeredAt: "desc" },
          take: 1,
          include: {
            testOrders: { select: { id: true, test: { select: { name: true } } } },
            payments: {
              select: { amount: true, paymentMethod: true, paymentType: true },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.patient.count({
      where: {
        organizationId: user.organizationId,
        createdAt: { lt: absoluteStart },
        ...(search && {
          OR: [
            { fullName: { contains: search, mode: "insensitive" } },
            { patientId: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
          ],
        }),
      },
    }),
  ]);

  const dayKeys = Array.from({ length: daysWindow }, (_, idx) => shiftDayKey(selectedDate, -idx));
  const grouped = new Map<string, DaySummary>();
  for (const key of dayKeys) {
    grouped.set(key, {
      key,
      rows: [],
      totalBilled: 0,
      totalPaid: 0,
      totalTests: 0,
      collectedByMethod: Object.fromEntries(PAYMENT_METHOD_BREAKDOWN_KEYS.map((method) => [method, 0])),
    });
  }

  for (const patient of patients) {
    const key = toDayKey(patient.createdAt);
    const bucket = grouped.get(key);
    if (!bucket) continue;
    const visit = patient.visits[0];
    if (!visit) continue;
    const billed = Number(visit.totalAmount);
    const paid = Number(visit.amountPaid);
    const testCount = visit?.testOrders.length ?? 0;
    const perMethod = collectedByPaymentMethod(
      visit.payments.map((row) => ({
        amount: Number(row.amount),
        paymentMethod: row.paymentMethod,
        paymentType: row.paymentType,
      })),
      { amountPaid: paid, paymentMethod: visit.paymentMethod }
    );
    bucket.totalBilled += billed;
    bucket.totalPaid += paid;
    bucket.totalTests += testCount;
    for (const [methodKey, methodAmount] of Object.entries(perMethod)) {
      bucket.collectedByMethod[methodKey] = (bucket.collectedByMethod[methodKey] ?? 0) + methodAmount;
    }
    bucket.rows.push({
      id: patient.id,
      fullName: patient.fullName,
      patientId: patient.patientId,
      age: patient.age,
      dateOfBirth: patient.dateOfBirth,
      sex: patient.sex,
      createdAt: patient.createdAt,
      registeredById: patient.registeredById,
      registeredBy: { fullName: patient.registeredBy.fullName },
      latestVisit: {
        id: visit.id,
        priority: visit.priority,
        paymentStatus: visit.paymentStatus,
        paymentMethod: visit.paymentMethod ?? null,
        paymentMethodSummary: summarizeMethodsForRow(perMethod, visit.paymentMethod),
        totalAmount: Number(visit.totalAmount),
        amountPaid: Number(visit.amountPaid),
        testOrders: visit.testOrders,
      },
    });
  }

  const sections = dayKeys.map((key) => grouped.get(key)!);
  const visibleRows = sections.reduce((acc, s) => acc + s.rows.length, 0);
  const canCreatePatient = ["RECEPTIONIST", "SUPER_ADMIN"].includes(user.role);
  const canEditPatient = ["RECEPTIONIST", "SUPER_ADMIN", "HRM"].includes(user.role);
  const canDeletePatient = ["RECEPTIONIST", "SUPER_ADMIN", "HRM"].includes(user.role);

  const priorityStyle: Record<string, string> = {
    EMERGENCY: "bg-red-50 text-red-600",
    URGENT: "bg-amber-50 text-amber-700",
    ROUTINE: "bg-slate-100 text-slate-600",
  };
  const paymentStyle: Record<string, string> = {
    PAID: "bg-green-50 text-green-700",
    PARTIAL: "bg-amber-50 text-amber-700",
    PENDING: "bg-red-50 text-red-600",
    WAIVED: "bg-slate-100 text-slate-600",
  };
  const paymentMethodStyle: Record<string, string> = {
    CASH: "bg-emerald-50 text-emerald-700",
    TRANSFER: "bg-blue-50 text-blue-700",
    POS: "bg-purple-50 text-purple-700",
    HMO: "bg-cyan-50 text-cyan-700",
    OTHER: "bg-slate-100 text-slate-700",
    UNKNOWN: "bg-slate-100 text-slate-500",
  };

  return (
    <div className="space-y-4">
      <DayRolloverRefresh />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-800">Daily Patient Tables</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Window: {daysWindow} day{daysWindow > 1 ? "s" : ""} ending {formatDayLabel(selectedDate)}
          </p>
        </div>
        {canCreatePatient ? (
          <Link
            href="/dashboard/receptionist/new-patient"
            className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            New Patient
          </Link>
        ) : null}
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="w-full sm:w-auto">
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Search patient</label>
          <input
            name="search"
            defaultValue={search}
            placeholder="Name, ID, phone..."
            className="h-8 w-full sm:w-56 rounded border border-slate-200 bg-white px-3 text-xs text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Go to date</label>
          <input
            type="date"
            name="date"
            defaultValue={selectedDate}
            className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Days to show</label>
          <select
            name="days"
            defaultValue={String(daysWindow)}
            className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
        >
          Apply
        </button>
        <Link href="/dashboard/receptionist/patients" className="text-xs text-slate-400 hover:text-slate-600 pb-1">
          Reset
        </Link>
        <span className="w-full text-left text-xs text-slate-400 pb-1 sm:ml-auto sm:w-auto sm:text-right">
          {visibleRows} patient row{visibleRows !== 1 ? "s" : ""} in view
        </span>
      </form>

      <div className="space-y-4">
        {sections.map((section) => (
          <section id={`day-${section.key}`} key={section.key} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-700">{formatDayLabel(section.key)}</span>
                {section.key === todayDayKey() ? <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">Today</span> : null}
                <span className="text-slate-400">{section.rows.length} patient{section.rows.length !== 1 ? "s" : ""}</span>
              </div>
            </div>

            {section.rows.length === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-400">No patients registered on this date.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1360px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-2.5 text-left font-medium text-slate-400">Patient</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-400">ID</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-400">Age/Sex</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-400">Tests</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-400">Total Bill</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-400">Paid</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-400">Priority</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-400">Payment</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-400">Method</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-400">Registered By</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-400">Registered</th>
                      {canEditPatient || canDeletePatient ? <th className="px-4 py-2.5 text-left font-medium text-slate-400">Action</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {section.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-slate-800">{row.fullName}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-400">{row.patientId}</td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {formatPatientAge({ age: row.age, dateOfBirth: row.dateOfBirth })} - {row.sex}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {row.latestVisit?.testOrders.slice(0, 2).map((order) => (
                              <span key={order.id} className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                                {order.test.name}
                              </span>
                            ))}
                            {(row.latestVisit?.testOrders.length ?? 0) > 2 ? (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                                +{(row.latestVisit?.testOrders.length ?? 0) - 2}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-700">
                          {row.latestVisit ? formatCurrency(row.latestVisit.totalAmount) : "-"}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-700">
                          {row.latestVisit ? formatCurrency(row.latestVisit.amountPaid) : "-"}
                        </td>
                        <td className="px-4 py-2.5">
                          {row.latestVisit ? (
                            <span className={`rounded px-1.5 py-0.5 font-medium ${priorityStyle[row.latestVisit.priority] ?? "bg-slate-100 text-slate-500"}`}>
                              {row.latestVisit.priority}
                            </span>
                          ) : "-"}
                        </td>
                        <td className="px-4 py-2.5">
                          {row.latestVisit ? (
                            <span className={`rounded px-1.5 py-0.5 font-medium ${paymentStyle[row.latestVisit.paymentStatus] ?? "bg-slate-100 text-slate-500"}`}>
                              {row.latestVisit.paymentStatus}
                            </span>
                          ) : "-"}
                        </td>
                        <td className="px-4 py-2.5">
                          {row.latestVisit ? (
                            <span
                              className={`rounded px-1.5 py-0.5 font-medium ${
                                paymentMethodStyle[normalizePaymentMethodKey(row.latestVisit.paymentMethod)] ??
                                "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {row.latestVisit.paymentMethodSummary}
                            </span>
                          ) : "-"}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                          {row.registeredById === user.id ? (
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 font-medium">You</span>
                          ) : (
                            row.registeredBy.fullName
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                        {canEditPatient || canDeletePatient ? (
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              {canEditPatient && row.latestVisit ? (
                                <Link
                                  href={`/dashboard/receptionist/patients/${row.id}/edit`}
                                  className="rounded border border-blue-200 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50"
                                >
                                  Edit Patient
                                </Link>
                              ) : null}
                              <Link
                                href={`/patients/${row.id}`}
                                className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                              >
                                Insights
                              </Link>
                              {canDeletePatient ? (
                                row.latestVisit ? (
                                  <DeletePatientButton
                                    visitId={row.latestVisit.id}
                                    patientId={row.id}
                                    patientName={row.fullName}
                                  />
                                ) : null
                              ) : null}
                              {!canDeletePatient && !(canEditPatient && row.latestVisit) ? "—" : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td colSpan={4} className="px-4 py-2.5 font-semibold text-slate-700">Daily Summary</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">{formatCurrency(section.totalBilled)}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">{formatCurrency(section.totalPaid)}</td>
                      <td colSpan={canEditPatient || canDeletePatient ? 6 : 5} className="px-4 py-2.5 text-slate-500">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{section.totalTests} test{section.totalTests !== 1 ? "s" : ""} registered</span>
                          {PAYMENT_METHOD_BREAKDOWN_KEYS.map((method) =>
                            Math.abs(section.collectedByMethod[method] ?? 0) > 0.0001 ? (
                              <span key={`${section.key}-${method}`} className="rounded bg-white px-2 py-0.5 text-slate-600 border border-slate-200">
                                {PAYMENT_METHOD_LABELS[method]}: {formatCurrency(section.collectedByMethod[method])}
                              </span>
                            ) : null
                          )}
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>

      {olderCount > 0 ? (
        <div className="rounded border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
          <span>{olderCount} older patient row{olderCount !== 1 ? "s" : ""} not in this window.</span>
          <Link
            href={`?search=${encodeURIComponent(search)}&date=${encodeURIComponent(startDayKey)}&days=${daysWindow}`}
            className="ml-2 inline-block rounded border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Load older tables
          </Link>
        </div>
      ) : null}
    </div>
  );
}

