import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { renderLabTaskReportForPreview } from "@/lib/report-workflow";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { taskId: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
    const user = session.user as any;

    const url = new URL(req.url);
    const includeLetterhead = url.searchParams.get("letterhead") !== "without";
    const showPrintButton = url.searchParams.get("printButton") === "1";
    const autoPrint = url.searchParams.get("autoPrint") === "1";
    const hideWatermark = url.searchParams.get("watermark") === "without";

    const rendered = await renderLabTaskReportForPreview(
      { id: user.id, role: user.role, organizationId: user.organizationId },
      params.taskId,
      { includeLetterhead, showPrintButton, autoPrint, hideWatermark, baseUrl: url.origin }
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
      if (error.message === "TASK_NOT_FOUND") return new NextResponse("Task not found", { status: 404 });
      if (error.message === "ORGANIZATION_NOT_FOUND") return new NextResponse("Organization not found", { status: 404 });
      if (error.message === "INVALID_REPORT_DEPARTMENT") return new NextResponse("Invalid report type", { status: 409 });
    }
    console.error("[LAB_TASK_REPORT_PREVIEW_GET]", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
