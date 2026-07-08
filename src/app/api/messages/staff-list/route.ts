import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMessageSession, staffPreviewSelect } from "../_shared";

export async function GET() {
  const session = await getMessageSession();
  if ("error" in session) {
    return NextResponse.json({ success: false, error: session.error!.message }, { status: session.error!.status });
  }

  const items = await prisma.staff.findMany({
    where: {
      organizationId: session.user.organizationId,
      id: { not: session.user.id },
    },
    select: staffPreviewSelect,
    orderBy: { fullName: "asc" },
  });

  return NextResponse.json({ success: true, data: { items } });
}

