import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canViewInventoryDashboard } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { InventoryActionType, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;
    if (!canViewInventoryDashboard(user.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const discrepancyThreshold = Number(req.nextUrl.searchParams.get("threshold") ?? "0");
    const fromParam = req.nextUrl.searchParams.get("from");
    const toParam = req.nextUrl.searchParams.get("to");
    const fromDate =
      fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)
        ? new Date(`${fromParam}T00:00:00.000Z`)
        : null;
    const toDate =
      toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam)
        ? new Date(`${toParam}T23:59:59.999Z`)
        : null;
    const taskIds = await prisma.routingTask.findMany({
      where: { organizationId: user.organizationId, department: "LABORATORY", status: "COMPLETED" },
      select: { id: true, testOrderIds: true },
    });

    const testOrderIds = Array.from(new Set(taskIds.flatMap((task) => task.testOrderIds)));
    const completedOrders = testOrderIds.length
      ? await prisma.testOrder.findMany({
          where: {
            organizationId: user.organizationId,
            id: { in: testOrderIds },
            submittedAt: {
              not: null,
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          },
          select: { testId: true, submittedAt: true },
        })
      : [];
    const ordersByTest = new Map<string, Date[]>();
    for (const row of completedOrders) {
      if (!row.submittedAt) continue;
      const existing = ordersByTest.get(row.testId) ?? [];
      existing.push(row.submittedAt);
      ordersByTest.set(row.testId, existing);
    }

    const mappings = await prisma.inventoryConsumptionMapping.findMany({
      where: { organizationId: user.organizationId },
      include: {
        inventoryItem: { select: { id: true, createdAt: true } },
      },
    });

    const expectedByItem = new Map<string, Prisma.Decimal>();
    for (const mapping of mappings) {
      // Prevent historical overcounting for inventory items created after older tests were submitted.
      // If the item did not exist yet, those earlier tests are not counted as expected usage for this item.
      const tests = (ordersByTest.get(mapping.testId) ?? []).filter(
        (submittedAt) => submittedAt >= mapping.inventoryItem.createdAt
      ).length;
      if (tests === 0) continue;
      expectedByItem.set(
        mapping.inventoryItemId,
        (expectedByItem.get(mapping.inventoryItemId) ?? new Prisma.Decimal(0)).add(
          mapping.quantityPerTest.mul(tests)
        )
      );
    }

    const actualUsage = await prisma.inventoryMovementLog.groupBy({
      by: ["inventoryItemId"],
      where: {
        organizationId: user.organizationId,
        actionType: InventoryActionType.TEST_USAGE,
        ...(fromDate || toDate
          ? {
              createdAt: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      _sum: { quantityChange: true },
    });
    const actualByItem = new Map(
      actualUsage.map((row) => [row.inventoryItemId, new Prisma.Decimal(row._sum.quantityChange ?? 0).abs()])
    );

    const allItemIds = new Set<string>(Array.from(expectedByItem.keys()).concat(Array.from(actualByItem.keys())));
    const itemLookup = await prisma.inventoryItem.findMany({
      where: { organizationId: user.organizationId, id: { in: Array.from(allItemIds) } },
      select: { id: true, name: true, unit: true },
    });
    const itemMap = new Map(itemLookup.map((item) => [item.id, item]));

    const rows = Array.from(allItemIds).map((itemId) => {
      const expected = expectedByItem.get(itemId) ?? new Prisma.Decimal(0);
      const actual = actualByItem.get(itemId) ?? new Prisma.Decimal(0);
      const discrepancy = actual.sub(expected);
      return {
        inventoryItemId: itemId,
        itemName: itemMap.get(itemId)?.name ?? "Unknown Item",
        unit: itemMap.get(itemId)?.unit ?? "",
        expectedUsage: expected.toString(),
        actualUsage: actual.toString(),
        discrepancy: discrepancy.toString(),
        flagged: discrepancy.abs().gt(discrepancyThreshold),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        totalTestsPerformed: completedOrders.length,
        discrepancies: rows,
        hasFlaggedDiscrepancy: rows.some((row) => row.flagged),
      },
    });
  } catch (error) {
    console.error("[INVENTORY_ANALYTICS_GET]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
