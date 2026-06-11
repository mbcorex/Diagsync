import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuditMetaFromRequest } from "@/lib/audit-core";
import { addImagingFile } from "@/lib/radiology-workflow";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;

    const body = await req.json();
    const { fileUrl, fileName, fileType, fileSizeBytes, metadata } = body ?? {};
    if (!fileUrl || !fileName || !fileType || !fileSizeBytes) {
      return NextResponse.json({ success: false, error: "Missing fields" }, { status: 400 });
    }

    const file = await addImagingFile(params.taskId, {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
      auditMeta: getAuditMetaFromRequest(req),
    }, {
      fileUrl,
      fileType,
      fileName,
      fileSizeBytes,
      metadata: metadata ?? undefined,
    });

    return NextResponse.json({ success: true, data: file });
  } catch (error) {
    console.error("[REGISTER_IMAGE]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
