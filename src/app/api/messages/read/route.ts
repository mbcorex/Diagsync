import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getMessageSession, resolveStaffInOrg } from "../_shared";

const schema = z.object({
  counterpartId: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  const session = await getMessageSession();
  if ("error" in session) {
    return NextResponse.json({ success: false, error: session.error!.message }, { status: session.error!.status });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Invalid payload" }, { status: 400 });
  }

  const counterpart = await resolveStaffInOrg(session.user.organizationId, parsed.data.counterpartId);
  if (!counterpart) {
    return NextResponse.json({ success: false, error: "Staff member not found in this organization" }, { status: 403 });
  }

  await prisma.staffMessage.updateMany({
    where: {
      organizationId: session.user.organizationId,
      senderId: counterpart.id,
      recipientId: session.user.id,
      isRead: false,
    },
    data: { isRead: true, readAt: new Date() },
  });

  return NextResponse.json({ success: true });
}

