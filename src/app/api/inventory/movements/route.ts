import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewInventoryDashboard } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { InventoryActionType } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;
    if (!canViewInventoryDashboard(user.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const itemId = req.nextUrl.searchParams.get("inventoryItemId");
    const actionType = req.nextUrl.searchParams.get("actionType") as InventoryActionType | null;
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");

    const logs = await prisma.inventoryMovementLog.findMany({
      where: {
        organizationId: user.organizationId,
        ...(itemId ? { inventoryItemId: itemId } : {}),
        ...(actionType ? { actionType } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: {
        inventoryItem: { select: { id: true, name: true, unit: true } },
        performedBy: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    console.error("[INVENTORY_MOVEMENTS_GET]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
