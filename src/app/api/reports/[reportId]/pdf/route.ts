import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { renderHtmlToPdfBuffer } from "@/lib/report-pdf";
import { renderReportForPreview } from "@/lib/report-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sanitizeForFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function errorJson(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(
  req: Request,
  { params }: { params: { reportId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) return errorJson(401, "Unauthorized");
    const user = session.user as any;
    const url = new URL(req.url);
    const includeLetterhead = url.searchParams.get("letterhead") !== "without";

    const rendered = await renderReportForPreview(
      { id: user.id, role: user.role, organizationId: user.organizationId },
      params.reportId,
      { includeLetterhead, showPrintButton: false, autoPrint: false, baseUrl: url.origin }
    );

    const pdfBuffer = await renderHtmlToPdfBuffer(rendered.html);
    const reportType =
      rendered.report.department === "LABORATORY" ? "lab" : "radiology";
    const patient = sanitizeForFileName(rendered.report.visit.patient.fullName.toLowerCase());
    const visit = sanitizeForFileName(rendered.report.visit.visitNumber.toLowerCase());
    const fileName = `${patient}-${visit}-${reportType}-report.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "BILLING_LOCKED") return errorJson(403, "Billing access required");
      if (error.message === "FORBIDDEN_ROLE") return errorJson(403, "Forbidden");
      if (error.message === "FORBIDDEN_UNRELEASED_REPORT") return errorJson(403, "Forbidden");
      if (error.message === "REPORT_NOT_FOUND") return errorJson(404, "Report not found");
      if (error.message === "REPORT_TYPE_MISMATCH") return errorJson(409, "Invalid report state");
      if (error.message === "CROSS_DEPARTMENT_CONTENT") return errorJson(409, "Invalid report content");
      if (error.message === "INVALID_VERSION_CHAIN") return errorJson(409, "Invalid report version state");
      if (error.message === "PDF_BROWSER_NOT_FOUND") return errorJson(500, "PDF engine unavailable on server");
      if (error.message.startsWith("PDF_BROWSER_LAUNCH_FAILED")) return errorJson(500, "PDF engine failed to start on server");
      if (error.message.startsWith("Protocol error")) return errorJson(500, "PDF rendering failed on server");
      return errorJson(500, `PDF generation failed: ${error.message}`);
    }
    console.error("[REPORT_PDF_GET]", error);
    return errorJson(500, "PDF generation failed on server");
  }
}

