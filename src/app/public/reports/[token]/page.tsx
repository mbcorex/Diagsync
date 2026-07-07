import { prisma } from "@/lib/prisma";
import { renderReportHtml } from "@/lib/report-rendering";
import { assertReportTypeMatchesDepartment } from "@/lib/report-workflow-core";
import { canUseCustomLetterhead, shouldShowWatermark } from "@/lib/billing-access";
import { notFound } from "next/navigation";

export default async function PublicReportPage({ params }: { params: { token: string } }) {
  const report = await prisma.diagnosticReport.findFirst({
    where: { publicShareToken: params.token, isReleased: true },
    include: {
      organization: true,
      visit: { include: { patient: true } },
      versions: { where: { isActive: true }, take: 1 },
    },
  });
  if (!report) return notFound();

  const active = report.versions[0] ?? null;
  if (!active) return notFound();
  try {
    assertReportTypeMatchesDepartment(report.reportType, report.department);
  } catch {
    return notFound();
  }

  const html = renderReportHtml({
    organization: {
      name: report.organization.name,
      address: report.organization.address,
      phone: report.organization.phone,
      email: report.organization.email,
      logo: report.organization.logo,
      website: report.organization.website,
      letterheadUrl: report.organization.letterheadUrl,
    },
    department: report.department,
    content: active.content as any,
    comments: active.comments ?? report.comments,
    prescription: active.prescription ?? report.prescription,
    watermarkUrl: shouldShowWatermark(report.organization) ? "/diagsync-watermark.png" : undefined,
    includeLetterhead: canUseCustomLetterhead(report.organization),
  });

  return <iframe title="Public Report" srcDoc={html} className="h-[100dvh] w-full border-0" />;
}
