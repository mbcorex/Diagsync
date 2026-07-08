import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMessageSession, staffPreviewSelect, type StaffPreview } from "../_shared";

type ConversationRow = {
  counterpart: StaffPreview;
  lastMessage: {
    id: string;
    body: string;
    createdAt: string;
    isRead: boolean;
    senderId: string;
    recipientId: string;
  };
  unreadCount: number;
};

export async function GET() {
  const session = await getMessageSession();
  if ("error" in session) {
    return NextResponse.json({ success: false, error: session.error!.message }, { status: session.error!.status });
  }

  const messages = await prisma.staffMessage.findMany({
    where: {
      organizationId: session.user.organizationId,
      OR: [{ senderId: session.user.id }, { recipientId: session.user.id }],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      createdAt: true,
      isRead: true,
      senderId: true,
      recipientId: true,
      sender: { select: staffPreviewSelect },
      recipient: { select: staffPreviewSelect },
    },
  });

  const byCounterpart = new Map<string, ConversationRow>();
  for (const message of messages) {
    const isFromCurrentUser = message.senderId === session.user.id;
    const counterpart = isFromCurrentUser ? message.recipient : message.sender;
    const counterpartId = counterpart.id;
    const unreadIncrement = !isFromCurrentUser && !message.isRead ? 1 : 0;
    const nextRow: ConversationRow = {
      counterpart,
      lastMessage: {
        id: message.id,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
        isRead: message.isRead,
        senderId: message.senderId,
        recipientId: message.recipientId,
      },
      unreadCount: unreadIncrement,
    };

    const existing = byCounterpart.get(counterpartId);
    if (existing) {
      existing.lastMessage = nextRow.lastMessage;
      existing.unreadCount += unreadIncrement;
      existing.counterpart = counterpart;
    } else {
      byCounterpart.set(counterpartId, nextRow);
    }
  }

  const items = Array.from(byCounterpart.values()).sort(
    (a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
  );

  return NextResponse.json({ success: true, data: { items } });
}

