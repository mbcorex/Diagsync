import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getMessageSession, resolveStaffInOrg, staffPreviewSelect } from "../_shared";

const schema = z.object({
  recipientId: z.string().trim().min(1),
  body: z.string().trim().min(1, "Message cannot be empty").max(4000),
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

  const recipient = await resolveStaffInOrg(session.user.organizationId, parsed.data.recipientId);
  if (!recipient) {
    return NextResponse.json({ success: false, error: "Recipient not found in this organization" }, { status: 403 });
  }

  const message = await prisma.staffMessage.create({
    data: {
      organizationId: session.user.organizationId,
      senderId: session.user.id,
      recipientId: recipient.id,
      body: parsed.data.body.trim(),
    },
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

  return NextResponse.json({ success: true, data: message }, { status: 201 });
}

