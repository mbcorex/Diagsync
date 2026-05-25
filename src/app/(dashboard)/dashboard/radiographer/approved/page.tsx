import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReviewStatus } from "@prisma/client";

function dayKeyToRange(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map((v) => Number(v));
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { start, end };
}

export default async function RadiographerApprovedResultsPage({
  searchParams,
}: {
  searchParams?: { search?: string; date?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as any;
  if (!["RADIOGRAPHER", "SUPER_ADMIN"].includes(user.role)) redirect("/dashboard");

  const search = (searchParams?.search ?? "").trim();
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(searchParams?.date ?? "")
    ? String(searchParams?.date)
    : "";
  const dateRange = selectedDate ? dayKeyToRange(selectedDate) : null;

  const reports = await prisma.radiologyReport.findMany({
    where: {
      organizationId: user.organizationId,
      isSubmitted: true,
      ...(user.role === "RADIOGRAPHER" ? { staffId: user.id } : {}),
      task: {
        review: { is: { status: ReviewStatus.APPROVED } },
        visit: {
          patient: search
            ? {
                OR: [
                  { fullName: { contains: search, mode: "insensitive" } },
                  { patientId: { contains: search, mode: "insensitive" } },
                ],
              }
            : undefined,
        },
      },
      ...(dateRange
        ? {
            submittedAt: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
          }
        : {}),
    },
    include: {
      task: {
        include: {
          visit: { include: { patient: true } },
          imagingFiles: true,
          review: true,
        },
      },
    },
    orderBy: { submittedAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold text-slate-800">Approved Radiology Results</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Only MD-approved radiology reports for your imaging cases are shown here. Use print preview to open the report page.
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

        <Link href="/dashboard/radiographer/approved" className="text-xs text-slate-400 hover:text-slate-600 pb-1">
          Reset
        </Link>

        <span className="w-full text-left text-xs text-slate-400 pb-1 sm:ml-auto sm:w-auto sm:text-right">
          {reports.length} approved report{reports.length !== 1 ? "s" : ""} in view
        </span>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {reports.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-slate-400">No approved radiology reports are available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Patient</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Visit</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Images</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Approved</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.map((report) => (
                  <tr key={report.id} className="hover:bg-slate-50 transition-colors align-top">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-800">{report.task.visit.patient.fullName}</p>
                      <p className="font-mono text-slate-400">{report.task.visit.patient.patientId}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      <p>{report.task.visit.visitNumber}</p>
                      <p>{formatDateTime(report.task.visit.registeredAt)}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {report.task.imagingFiles.length === 0 ? (
                        <span className="text-slate-300">None</span>
                      ) : (
                        <span>{report.task.imagingFiles.length} file{report.task.imagingFiles.length !== 1 ? "s" : ""}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                      {report.task.review?.updatedAt ? formatDateTime(report.task.review.updatedAt) : "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/api/radiology/reports/${report.id}/preview?printButton=1`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          Preview
                        </Link>
                        <Link
                          href={`/api/radiology/reports/${report.id}/preview?printButton=1&autoPrint=1`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                        >
                          Print
                        </Link>
                        <Link
                          href={`/api/radiology/reports/${report.id}/preview?printButton=1&autoPrint=1&watermark=without`}
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
