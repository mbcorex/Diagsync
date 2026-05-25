import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReviewStatus } from "@prisma/client";

function formatResultData(data: unknown): string {
  if (data === null || data === undefined) return "-";
  if (typeof data !== "object") return String(data);
  const record = data as Record<string, unknown>;
  const pairs = Object.entries(record)
    .filter(([, v]) => v !== null && v !== undefined && `${v}`.trim() !== "")
    .map(([key, value]) => `${key}: ${String(value)}`);
  return pairs.length === 0 ? "-" : pairs.join(" · ");
}

function dayKeyToRange(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map((v) => Number(v));
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { start, end };
}

export default async function LabScientistApprovedResultsPage({
  searchParams,
}: {
  searchParams?: { search?: string; date?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as any;
  if (!["LAB_SCIENTIST", "SUPER_ADMIN"].includes(user.role)) redirect("/dashboard");

  const search = (searchParams?.search ?? "").trim();
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams?.date ?? "")
    ? String(searchParams?.date)
    : "";
  const dateRange = selectedDate ? dayKeyToRange(selectedDate) : null;

  const labResults = await prisma.labResult.findMany({
    where: {
      organizationId: user.organizationId,
      isSubmitted: true,
      ...(user.role === "LAB_SCIENTIST" ? { staffId: user.id } : {}),
      task: {
        review: {
          is: {
            status: ReviewStatus.APPROVED,
            ...(dateRange ? { updatedAt: { gte: dateRange.start, lte: dateRange.end } } : {}),
          },
        },
        visit: search
          ? {
              patient: {
                OR: [
                  { fullName: { contains: search, mode: "insensitive" } },
                  { patientId: { contains: search, mode: "insensitive" } },
                ],
              },
            }
          : undefined,
      },
    },
    include: {
      task: {
        include: {
          staff: { select: { fullName: true } },
          visit: {
            select: {
              id: true,
              visitNumber: true,
              registeredAt: true,
              patient: { select: { fullName: true, age: true, patientId: true } },
            },
          },
          review: true,
        },
      },
      testOrder: {
        select: {
          assignedTo: { select: { fullName: true } },
          test: { select: { name: true } },
        },
      },
    },
    orderBy: { submittedAt: "desc" },
  });

  const groupedMap = new Map<
    string,
    {
      taskId: string;
      patientName: string;
      age: number;
      patientId: string;
      visitNumber: string;
      submittedAt: Date | null;
      approvedAt: Date | null;
      tests: Array<{ testName: string; resultText: string }>;
      startedBy: Set<string>;
      submittedBy: Set<string>;
    }
  >();

  for (const result of labResults) {
    const visit = result.task.visit;
    const patient = visit.patient;
    const key = result.task.id;
    const testItem = {
      testName: result.testOrder.test.name,
      resultText: formatResultData(result.resultData),
    };
    const startedByName = result.testOrder.assignedTo?.fullName?.trim() ?? "";
    const submittedByName = result.task.staff?.fullName?.trim() ?? "";
    const approvedAt = result.task.review?.updatedAt ?? null;
    const existing = groupedMap.get(key);
    if (existing) {
      existing.tests.push(testItem);
      if (startedByName) existing.startedBy.add(startedByName);
      if (submittedByName) existing.submittedBy.add(submittedByName);
      if (result.submittedAt && (!existing.submittedAt || result.submittedAt > existing.submittedAt)) {
        existing.submittedAt = result.submittedAt;
      }
      if (approvedAt && (!existing.approvedAt || approvedAt > existing.approvedAt)) {
        existing.approvedAt = approvedAt;
      }
    } else {
      groupedMap.set(key, {
        taskId: result.task.id,
        patientName: patient.fullName,
        age: patient.age,
        patientId: patient.patientId,
        visitNumber: visit.visitNumber,
        submittedAt: result.submittedAt,
        approvedAt,
        tests: [testItem],
        startedBy: new Set(startedByName ? [startedByName] : []),
        submittedBy: new Set(submittedByName ? [submittedByName] : []),
      });
    }
  }

  const rows = Array.from(groupedMap.values()).map((row) => ({
    ...row,
    startedByText: row.startedBy.size > 0 ? Array.from(row.startedBy).join(", ") : "-",
    submittedByText: row.submittedBy.size > 0 ? Array.from(row.submittedBy).join(", ") : "-",
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold text-slate-800">Approved Lab Results</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Only MD-approved lab results for your tests are shown here.
        </p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="w-full sm:w-auto">
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Search patient</label>
          <input
            name="search"
            defaultValue={search}
            placeholder="Name or patient ID..."
            className="h-8 w-full sm:w-56 rounded border border-slate-200 bg-white px-3 text-xs text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Date approved</label>
          <input
            type="date"
            name="date"
            defaultValue={selectedDate}
            className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
        >
          Apply
        </button>

        <Link href="/dashboard/lab-scientist/approved" className="text-xs text-slate-400 hover:text-slate-600 pb-1">
          Reset
        </Link>

        <span className="w-full text-left text-xs text-slate-400 pb-1 sm:ml-auto sm:w-auto sm:text-right">
          {rows.length} approved task{rows.length !== 1 ? "s" : ""} in view
        </span>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-slate-400">No approved lab results are available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Patient</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Visit</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Tests & Results</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Audit Trail</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Approved</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.taskId} className="hover:bg-slate-50 transition-colors align-top">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-800">{row.patientName}</p>
                      <p className="font-mono text-slate-400">{row.patientId} · {row.age}y</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      <p>{row.visitNumber}</p>
                      <p>{row.submittedAt ? formatDateTime(row.submittedAt) : "-"}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="space-y-1">
                        {row.tests.map((t, idx) => (
                          <p key={`${t.testName}-${idx}`} className="text-slate-600">
                            <span className="font-medium text-slate-800">{t.testName}:</span>{" "}
                            <span className="text-slate-500">{t.resultText}</span>
                          </p>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      <p>Started: {row.startedByText}</p>
                      <p>Submitted: {row.submittedByText}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                      {row.approvedAt ? formatDateTime(row.approvedAt) : "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/api/lab/tasks/${row.taskId}/preview?printButton=1`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          Preview
                        </Link>
                        <Link
                          href={`/api/lab/tasks/${row.taskId}/preview?printButton=1&autoPrint=1`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                        >
                          Print
                        </Link>
                        <Link
                          href={`/api/lab/tasks/${row.taskId}/preview?printButton=1&autoPrint=1&watermark=without`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          Print without watermark
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
