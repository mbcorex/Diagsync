import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuditMetaFromRequest } from "@/lib/audit-core";
import { saveLabResults, submitLabTask } from "@/lib/lab-workflow";
import { z } from "zod";
import type { SaveResultInput } from "@/lib/lab-workflow";
import { validateResultDataPayload } from "@/lib/custom-fields-core";
import { beginApiMetric, endApiMetric } from "@/lib/api-observability";

export const dynamic = "force-dynamic";

const resultItemSchema = z.object({
  testOrderId: z.string().min(1),
  resultData: z.unknown().refine((v) => v !== undefined, { message: "resultData is required" }),
  notes: z.string().max(1000).optional(),
});

const saveResultsSchema = z.object({
  results: z.array(resultItemSchema).min(1),
  submit: z.boolean().default(false),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const metric = beginApiMetric("POST /api/lab/tasks/[taskId]/results");
  try {
    const session = await auth();
    if (!session?.user) {
      endApiMetric(metric, { ok: false, status: 401, note: "unauthorized" });
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = saveResultsSchema.safeParse(await req.json());
    if (!parsed.success) {
      endApiMetric(metric, { ok: false, status: 400, note: "invalid_payload" });
      return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
    }
    for (const row of parsed.data.results) {
      const resultDataCheck = validateResultDataPayload(row.resultData);
      if (!resultDataCheck.ok) {
        endApiMetric(metric, { ok: false, status: 400, note: "invalid_result_data" });
        return NextResponse.json({ success: false, error: resultDataCheck.error }, { status: 400 });
      }
    }

    const user = session.user as any;
    const actor = {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
      auditMeta: getAuditMetaFromRequest(req),
    };

    try {
      await saveLabResults(params.taskId, actor, parsed.data.results as SaveResultInput[]);
    } catch (error) {
      if (parsed.data.submit && error instanceof Error && error.message === "TASK_ALREADY_COMPLETED") {
        endApiMetric(metric, { ok: true, status: 200, note: "idempotent_submit" });
        return NextResponse.json({ success: true, message: "Task already submitted" });
      }
      throw error;
    }
    if (parsed.data.submit) {
      const submission = await submitLabTask(params.taskId, actor);
      endApiMetric(metric, { ok: true, status: 200, note: "submitted" });
      return NextResponse.json({
        success: true,
        message: "Results submitted for review",
        warnings: submission.inventoryWarnings,
      });
    }

    endApiMetric(metric, { ok: true, status: 200, note: "draft_saved" });
    return NextResponse.json({ success: true, message: "Draft results saved" });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "FORBIDDEN_ROLE" || error.message === "FORBIDDEN_TASK") {
        endApiMetric(metric, { ok: false, status: 403, note: "forbidden" });
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }
      if (error.message === "BILLING_LOCKED") {
        endApiMetric(metric, { ok: false, status: 403, note: "billing_locked" });
        return NextResponse.json(
          { success: false, error: "Billing access required. Please choose or renew a plan." },
          { status: 403 }
        );
      }
      if (error.message === "TASK_NOT_FOUND") {
        endApiMetric(metric, { ok: false, status: 404, note: "task_not_found" });
        return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
      }
      if (error.message === "INVALID_TEST_ORDER") {
        endApiMetric(metric, { ok: false, status: 400, note: "invalid_test_order" });
        return NextResponse.json({ success: false, error: "Invalid test order for this task" }, { status: 400 });
      }
      if (error.message.startsWith("MISSING_RESULTS")) {
        const detail = error.message.split(":").slice(1).join(":").trim();
        endApiMetric(metric, { ok: false, status: 400, note: "missing_results" });
        return NextResponse.json(
          {
            success: false,
            error:
              detail.length > 0
                ? `Cannot submit. Missing result(s) for: ${detail}`
                : "Please enter results for all tests before submission",
          },
          { status: 400 }
        );
      }
      if (error.message === "TASK_ALREADY_COMPLETED") {
        endApiMetric(metric, { ok: false, status: 409, note: "task_already_submitted" });
        return NextResponse.json({ success: false, error: "Task already submitted" }, { status: 409 });
      }
    }

    console.error("[LAB_TASK_RESULTS]", error);
    endApiMetric(metric, { ok: false, status: 500, note: "internal_error" });
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
