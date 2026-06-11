import { prisma } from "@/lib/prisma";
import {
  InventoryActionType,
  InventorySourceType,
  Prisma,
  Role,
} from "@prisma/client";

type TxClient = Prisma.TransactionClient;

export type InventoryActor = {
  id: string;
  role: string;
  organizationId: string;
};

export type InventoryWarning = {
  inventoryItemId: string;
  itemName: string;
  remaining: string;
  message: string;
};

const STOCK_MANAGER_ROLES = new Set<Role | string>([
  Role.SUPER_ADMIN,
  Role.INVENTORY_MANAGER,
]);

const DASHBOARD_VIEW_ROLES = new Set<Role | string>([
  Role.SUPER_ADMIN,
  Role.INVENTORY_MANAGER,
  Role.MD,
]);

export function canManageInventory(role: string) {
  return STOCK_MANAGER_ROLES.has(role);
}

export function canViewInventoryDashboard(role: string) {
  return DASHBOARD_VIEW_ROLES.has(role);
}

export function assertCanManageInventory(role: string) {
  if (!canManageInventory(role)) {
    throw new Error("FORBIDDEN_ROLE");
  }
}

function asDecimal(value: string | number | Prisma.Decimal) {
  return new Prisma.Decimal(value);
}

export async function applyTestUsageForTaskInTx(params: {
  tx: TxClient;
  organizationId: string;
  taskId: string;
  performedById: string;
}) {
  const { tx, organizationId, taskId, performedById } = params;
  const existingUsage = await tx.inventoryMovementLog.count({
    where: {
      organizationId,
      actionType: InventoryActionType.TEST_USAGE,
      sourceType: InventorySourceType.TEST,
      sourceId: taskId,
    },
  });
  if (existingUsage > 0) {
    return [] as InventoryWarning[];
  }

  const taskOrders = await tx.routingTask.findFirst({
    where: { id: taskId, organizationId },
    select: { testOrderIds: true },
  });
  if (!taskOrders || taskOrders.testOrderIds.length === 0) return [];

  const orders = await tx.testOrder.findMany({
    where: { id: { in: taskOrders.testOrderIds }, organizationId },
    select: { testId: true },
  });
  const testIds = Array.from(new Set(orders.map((order) => order.testId)));
  if (testIds.length === 0) return [];

  const mappings = await tx.inventoryConsumptionMapping.findMany({
    where: { organizationId, testId: { in: testIds } },
    include: {
      inventoryItem: {
        select: { id: true, name: true, minimumStockLevel: true },
      },
    },
  });
  if (mappings.length === 0) return [];

  const testsCount = new Map<string, number>();
  for (const order of orders) {
    testsCount.set(order.testId, (testsCount.get(order.testId) ?? 0) + 1);
  }

  const usageByItem = new Map<string, Prisma.Decimal>();
  const itemMeta = new Map<string, { name: string }>();
  for (const mapping of mappings) {
    const count = testsCount.get(mapping.testId) ?? 0;
    if (count <= 0) continue;
    const addQty = mapping.quantityPerTest.mul(count);
    usageByItem.set(
      mapping.inventoryItemId,
      (usageByItem.get(mapping.inventoryItemId) ?? asDecimal(0)).add(addQty)
    );
    itemMeta.set(mapping.inventoryItemId, { name: mapping.inventoryItem.name });
  }

  const warnings: InventoryWarning[] = [];
  for (const entry of Array.from(usageByItem.entries())) {
    const [inventoryItemId, usedQuantity] = entry;
    if (usedQuantity.lte(0)) continue;

    const balance = await tx.inventoryBalance.upsert({
      where: { inventoryItemId },
      create: {
        inventoryItemId,
        organizationId,
        currentQuantity: asDecimal(0).sub(usedQuantity),
      },
      update: {
        currentQuantity: { decrement: usedQuantity },
      },
    });

    await tx.inventoryMovementLog.create({
      data: {
        organizationId,
        inventoryItemId,
        quantityChange: usedQuantity.neg(),
        actionType: InventoryActionType.TEST_USAGE,
        sourceType: InventorySourceType.TEST,
        sourceId: taskId,
        performedById,
      },
    });

    if (balance.currentQuantity.lte(0)) {
      const meta = itemMeta.get(inventoryItemId);
      warnings.push({
        inventoryItemId,
        itemName: meta?.name ?? "Item",
        remaining: balance.currentQuantity.toString(),
        message: `⚠️ ${meta?.name ?? "Item"} is out of stock (${balance.currentQuantity.toString()} remaining). This test is being recorded without available inventory.`,
      });
    }
  }

  return warnings;
}

export async function reverseTestUsageForTaskInTx(params: {
  tx: TxClient;
  organizationId: string;
  taskId: string;
  performedById: string;
}) {
  const { tx, organizationId, taskId, performedById } = params;
  const usageLogs = await tx.inventoryMovementLog.findMany({
    where: {
      organizationId,
      sourceType: InventorySourceType.TEST,
      sourceId: taskId,
      actionType: InventoryActionType.TEST_USAGE,
    },
    select: { id: true, inventoryItemId: true, quantityChange: true },
  });

  for (const log of usageLogs) {
    const restoreQty = log.quantityChange.abs();
    await tx.inventoryBalance.upsert({
      where: { inventoryItemId: log.inventoryItemId },
      create: {
        inventoryItemId: log.inventoryItemId,
        organizationId,
        currentQuantity: restoreQty,
      },
      update: { currentQuantity: { increment: restoreQty } },
    });

    await tx.inventoryMovementLog.create({
      data: {
        organizationId,
        inventoryItemId: log.inventoryItemId,
        quantityChange: restoreQty,
        actionType: InventoryActionType.REVERSAL,
        sourceType: InventorySourceType.SYSTEM,
        sourceId: taskId,
        performedById,
      },
    });
  }
}

export async function addStockEntry(params: {
  actor: InventoryActor;
  inventoryItemId: string;
  quantityAdded: string | number;
  expiryDate?: Date | null;
  batchNumber?: string | null;
  supplier?: string | null;
}) {
  assertCanManageInventory(params.actor.role);
  const quantityAdded = asDecimal(params.quantityAdded);
  if (quantityAdded.lte(0)) throw new Error("INVALID_QUANTITY");

  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({
      where: { id: params.inventoryItemId, organizationId: params.actor.organizationId },
      select: { id: true },
    });
    if (!item) throw new Error("ITEM_NOT_FOUND");

    const entry = await tx.inventoryStockEntry.create({
      data: {
        organizationId: params.actor.organizationId,
        inventoryItemId: params.inventoryItemId,
        quantityAdded,
        expiryDate: params.expiryDate ?? null,
        batchNumber: params.batchNumber?.trim() || null,
        supplier: params.supplier?.trim() || null,
        addedById: params.actor.id,
      },
    });

    await tx.inventoryBalance.upsert({
      where: { inventoryItemId: params.inventoryItemId },
      create: {
        inventoryItemId: params.inventoryItemId,
        organizationId: params.actor.organizationId,
        currentQuantity: quantityAdded,
      },
      update: { currentQuantity: { increment: quantityAdded } },
    });

    await tx.inventoryMovementLog.create({
      data: {
        organizationId: params.actor.organizationId,
        inventoryItemId: params.inventoryItemId,
        quantityChange: quantityAdded,
        actionType: InventoryActionType.STOCK_IN,
        sourceType: InventorySourceType.ADMIN,
        sourceId: entry.id,
        performedById: params.actor.id,
      },
    });

    return entry;
  });
}
