import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addStockEntry } from "@/lib/inventory";
import { z } from "zod";

export const dynamic = "force-dynamic";

const addStockSchema = z.object({
  inventoryItemId: z.string().min(1),
  quantityAdded: z.coerce.number().positive(),
  expiryDate: z.string().min(1).optional().nullable(),
  batchNumber: z.string().optional().nullable(),
  supplier: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;

    const parsed = addStockSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Invalid payload" }, { status: 400 });
    }

    const entry = await addStockEntry({
      actor: { id: user.id, role: user.role, organizationId: user.organizationId },
      inventoryItemId: parsed.data.inventoryItemId,
      quantityAdded: parsed.data.quantityAdded,
      expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : undefined,
      batchNumber: parsed.data.batchNumber,
      supplier: parsed.data.supplier,
    });

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN_ROLE") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
      return NextResponse.json({ success: false, error: "Inventory item not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "INVALID_QUANTITY") {
      return NextResponse.json({ success: false, error: "Quantity must be greater than zero" }, { status: 400 });
    }
    console.error("[INVENTORY_STOCK_POST]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
