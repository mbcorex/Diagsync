import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { renderReportForPreview } from "@/lib/report-workflow";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { reportId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
    const user = session.user as any;

    const url = new URL(req.url);
    const letterheadParam = url.searchParams.get("letterhead");
    const includeLetterhead = letterheadParam !== "without";
    const letterheadMode =
      letterheadParam === "without" ? "none" : letterheadParam === "custom" || letterheadParam === "auto" ? "auto" : "uploaded";
    const showPrintButton = url.searchParams.get("printButton") === "1";
    const autoPrint = url.searchParams.get("autoPrint") === "1";

    const rendered = await renderReportForPreview(
      { id: user.id, role: user.role, organizationId: user.organizationId },
      params.reportId,
      { includeLetterhead, letterheadMode, showPrintButton, autoPrint, baseUrl: url.origin }
    );

    return new NextResponse(rendered.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "BILLING_LOCKED") return new NextResponse("Billing access required", { status: 403 });
      if (error.message === "FORBIDDEN_ROLE") return new NextResponse("Forbidden", { status: 403 });
      if (error.message === "FORBIDDEN_UNRELEASED_REPORT") return new NextResponse("Forbidden", { status: 403 });
      if (error.message === "REPORT_NOT_FOUND") return new NextResponse("Report not found", { status: 404 });
      if (error.message === "REPORT_TYPE_MISMATCH") return new NextResponse("Invalid report state", { status: 409 });
      if (error.message === "CROSS_DEPARTMENT_CONTENT") return new NextResponse("Invalid report content", { status: 409 });
      if (error.message === "INVALID_VERSION_CHAIN") return new NextResponse("Invalid report version state", { status: 409 });
    }
    console.error("[REPORT_PREVIEW_GET]", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

