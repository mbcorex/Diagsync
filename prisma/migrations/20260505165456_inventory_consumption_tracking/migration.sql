-- CreateEnum
CREATE TYPE "InventoryCategory" AS ENUM ('TEST_KIT', 'REAGENT', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "InventoryActionType" AS ENUM ('STOCK_IN', 'TEST_USAGE', 'MANUAL_ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "InventorySourceType" AS ENUM ('TEST', 'ADMIN', 'SYSTEM');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'INVENTORY_MANAGER';


-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "InventoryCategory" NOT NULL,
    "unit" TEXT NOT NULL,
    "minimumStockLevel" DECIMAL(12,3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_stock_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantityAdded" DECIMAL(12,3) NOT NULL,
    "expiryDate" DATE NOT NULL,
    "batchNumber" TEXT,
    "supplier" TEXT,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_stock_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_consumption_mappings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "quantityPerTest" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "inventory_consumption_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movement_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantityChange" DECIMAL(12,3) NOT NULL,
    "actionType" "InventoryActionType" NOT NULL,
    "sourceType" "InventorySourceType" NOT NULL,
    "sourceId" TEXT,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movement_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "inventoryItemId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "currentQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("inventoryItemId")
);

-- CreateIndex
CREATE INDEX "inventory_items_organizationId_category_createdAt_idx" ON "inventory_items"("organizationId", "category", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_organizationId_name_key" ON "inventory_items"("organizationId", "name");

-- CreateIndex
CREATE INDEX "inventory_stock_entries_organizationId_inventoryItemId_crea_idx" ON "inventory_stock_entries"("organizationId", "inventoryItemId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_stock_entries_organizationId_expiryDate_idx" ON "inventory_stock_entries"("organizationId", "expiryDate");

-- CreateIndex
CREATE INDEX "inventory_consumption_mappings_organizationId_testId_idx" ON "inventory_consumption_mappings"("organizationId", "testId");

-- CreateIndex
CREATE INDEX "inventory_consumption_mappings_organizationId_inventoryItem_idx" ON "inventory_consumption_mappings"("organizationId", "inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_consumption_mappings_organizationId_inventoryItem_key" ON "inventory_consumption_mappings"("organizationId", "inventoryItemId", "testId");

-- CreateIndex
CREATE INDEX "inventory_movement_logs_organizationId_inventoryItemId_crea_idx" ON "inventory_movement_logs"("organizationId", "inventoryItemId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_movement_logs_organizationId_sourceType_sourceId__idx" ON "inventory_movement_logs"("organizationId", "sourceType", "sourceId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_movement_logs_organizationId_actionType_createdAt_idx" ON "inventory_movement_logs"("organizationId", "actionType", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_balances_organizationId_currentQuantity_idx" ON "inventory_balances"("organizationId", "currentQuantity");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock_entries" ADD CONSTRAINT "inventory_stock_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock_entries" ADD CONSTRAINT "inventory_stock_entries_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock_entries" ADD CONSTRAINT "inventory_stock_entries_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_consumption_mappings" ADD CONSTRAINT "inventory_consumption_mappings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_consumption_mappings" ADD CONSTRAINT "inventory_consumption_mappings_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_consumption_mappings" ADD CONSTRAINT "inventory_consumption_mappings_testId_fkey" FOREIGN KEY ("testId") REFERENCES "diagnostic_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement_logs" ADD CONSTRAINT "inventory_movement_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement_logs" ADD CONSTRAINT "inventory_movement_logs_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement_logs" ADD CONSTRAINT "inventory_movement_logs_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

