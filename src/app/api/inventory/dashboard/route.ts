import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewInventoryDashboard } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;
    if (!canViewInventoryDashboard(user.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const expiryThresholdDays = Number(req.nextUrl.searchParams.get("expiryDays") ?? "30");
    const expiryDateCutoff = new Date();
    expiryDateCutoff.setDate(expiryDateCutoff.getDate() + expiryThresholdDays);

    const items = await prisma.inventoryItem.findMany({
      where: { organizationId: user.organizationId },
      include: {
        balance: true,
        stockEntries: {
          where: { expiryDate: { lte: expiryDateCutoff } },
          orderBy: { expiryDate: "asc" },
          take: 3,
        },
      },
      orderBy: { name: "asc" },
    });

    const data = items.map((item) => {
      const current = Number(item.balance?.currentQuantity ?? 0);
      const minimum = Number(item.minimumStockLevel);
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        currentQuantity: current,
        minimumStockLevel: minimum,
        lowStock: current <= minimum,
        outOfStock: current <= 0,
        expiryAlerts: item.stockEntries.map((entry) => ({
          stockEntryId: entry.id,
          expiryDate: entry.expiryDate,
          batchNumber: entry.batchNumber,
          supplier: entry.supplier,
        })),
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[INVENTORY_DASHBOARD_GET]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
