import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { assertCanManageInventory } from "@/lib/inventory";
import { z } from "zod";

export const dynamic = "force-dynamic";

const mappingRowSchema = z.object({
  inventoryItemId: z.string().min(1),
  testId: z.string().min(1),
  quantityPerTest: z.coerce.number().positive(),
});

const upsertMappingSchema = z.object({
  mappings: z.array(mappingRowSchema),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;
    const testId = req.nextUrl.searchParams.get("testId");
    const itemId = req.nextUrl.searchParams.get("inventoryItemId");

    const data = await prisma.inventoryConsumptionMapping.findMany({
      where: {
        organizationId: user.organizationId,
        ...(testId ? { testId } : {}),
        ...(itemId ? { inventoryItemId: itemId } : {}),
      },
      include: { inventoryItem: true, test: { select: { id: true, name: true, code: true } } },
      orderBy: { id: "desc" },
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[INVENTORY_MAPPINGS_GET]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;
    assertCanManageInventory(user.role);

    const parsed = upsertMappingSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Invalid payload" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const row of parsed.data.mappings) {
        const upserted = await tx.inventoryConsumptionMapping.upsert({
          where: {
            organizationId_inventoryItemId_testId: {
              organizationId: user.organizationId,
              inventoryItemId: row.inventoryItemId,
              testId: row.testId,
            },
          },
          create: {
            organizationId: user.organizationId,
            inventoryItemId: row.inventoryItemId,
            testId: row.testId,
            quantityPerTest: new Prisma.Decimal(row.quantityPerTest),
          },
          update: {
            quantityPerTest: new Prisma.Decimal(row.quantityPerTest),
          },
        });
        rows.push(upserted);
      }
      return rows;
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[INVENTORY_MAPPINGS_PUT]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
