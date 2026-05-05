import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InventoryCategory, Prisma } from "@prisma/client";
import { z } from "zod";
import { assertCanManageInventory, canViewInventoryDashboard } from "@/lib/inventory";

export const dynamic = "force-dynamic";

const createItemSchema = z.object({
  name: z.string().min(1),
  category: z.nativeEnum(InventoryCategory),
  unit: z.string().min(1),
  minimumStockLevel: z.coerce.number().nonnegative(),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;
    if (!canViewInventoryDashboard(user.role) && user.role !== "LAB_SCIENTIST") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const items = await prisma.inventoryItem.findMany({
      where: { organizationId: user.organizationId },
      include: { balance: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("[INVENTORY_ITEMS_GET]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;
    assertCanManageInventory(user.role);

    const parsed = createItemSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Invalid payload" }, { status: 400 });
    }

    const item = await prisma.inventoryItem.create({
      data: {
        organizationId: user.organizationId,
        name: parsed.data.name.trim(),
        category: parsed.data.category,
        unit: parsed.data.unit.trim(),
        minimumStockLevel: new Prisma.Decimal(parsed.data.minimumStockLevel),
        createdById: user.id,
      },
    });
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ success: false, error: "Item name already exists" }, { status: 409 });
    }
    console.error("[INVENTORY_ITEMS_POST]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
