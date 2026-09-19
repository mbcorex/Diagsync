import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { renderRadiologyTaskDraftPreview } from "@/lib/report-workflow";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { taskId: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
    const user = session.user as any;

    const url = new URL(req.url);
    const rendered = await renderRadiologyTaskDraftPreview(
      { id: user.id, role: user.role, organizationId: user.organizationId },
      params.taskId,
      { layoutEditor: url.searchParams.get("layoutEditor") === "1", baseUrl: url.origin }
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
      if (error.message === "CROSS_DEPARTMENT_CONTENT" || error.message === "INVALID_REPORT_DEPARTMENT") {
        return new NextResponse("Invalid report type", { status: 409 });
      }
    }
    console.error("[RADIOLOGY_TASK_PREVIEW_GET]", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
