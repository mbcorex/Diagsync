import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InventoryCategory, Prisma } from "@prisma/client";
import { z } from "zod";
import { assertCanManageInventory } from "@/lib/inventory";

export const dynamic = "force-dynamic";

const updateItemSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.nativeEnum(InventoryCategory).optional(),
  unit: z.string().min(1).optional(),
  minimumStockLevel: z.coerce.number().nonnegative().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { itemId: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;
    assertCanManageInventory(user.role);

    const parsed = updateItemSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Invalid payload" }, { status: 400 });
    }

    const data = parsed.data;
    if (!data.name && !data.category && !data.unit && data.minimumStockLevel === undefined) {
      return NextResponse.json({ success: false, error: "No changes provided" }, { status: 400 });
    }

    const existing = await prisma.inventoryItem.findFirst({
      where: { id: params.itemId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
    }

    const updated = await prisma.inventoryItem.update({
      where: { id: params.itemId },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.category ? { category: data.category } : {}),
        ...(data.unit ? { unit: data.unit.trim() } : {}),
        ...(data.minimumStockLevel !== undefined
          ? { minimumStockLevel: new Prisma.Decimal(data.minimumStockLevel) }
          : {}),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ success: false, error: "Item name already exists" }, { status: 409 });
    }
    console.error("[INVENTORY_ITEM_PATCH]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { itemId: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;
    assertCanManageInventory(user.role);

    const existing = await prisma.inventoryItem.findFirst({
      where: { id: params.itemId, organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
    }

    const movementCount = await prisma.inventoryMovementLog.count({
      where: {
        organizationId: user.organizationId,
        inventoryItemId: params.itemId,
      },
    });
    if (movementCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot delete this item because movement history exists. Edit the item instead.",
        },
        { status: 409 }
      );
    }

    await prisma.inventoryItem.delete({
      where: { id: params.itemId },
    });

    return NextResponse.json({ success: true, message: `${existing.name} deleted` });
  } catch (error) {
    console.error("[INVENTORY_ITEM_DELETE]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
