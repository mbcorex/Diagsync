import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMessageSession, resolveStaffInOrg, staffPreviewSelect } from "../../_shared";

export async function GET(_req: NextRequest, { params }: { params: { staffId: string } }) {
  const session = await getMessageSession();
  if ("error" in session) {
    return NextResponse.json({ success: false, error: session.error!.message }, { status: session.error!.status });
  }

  const counterpart = await resolveStaffInOrg(session.user.organizationId, params.staffId);
  if (!counterpart) {
    return NextResponse.json({ success: false, error: "Staff member not found in this organization" }, { status: 403 });
  }

  const items = await prisma.staffMessage.findMany({
    where: {
      organizationId: session.user.organizationId,
      OR: [
        { senderId: session.user.id, recipientId: params.staffId },
        { senderId: params.staffId, recipientId: session.user.id },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      isRead: true,
      readAt: true,
      createdAt: true,
      senderId: true,
      recipientId: true,
      sender: { select: staffPreviewSelect },
      recipient: { select: staffPreviewSelect },
    },
  });

  return NextResponse.json({ success: true, data: { counterpart, items } });
}

