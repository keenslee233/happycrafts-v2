-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN "masterCostPrice" REAL;
ALTER TABLE "Inventory" ADD COLUMN "masterStoreId" TEXT;
ALTER TABLE "Inventory" ADD COLUMN "retailProductId" TEXT;

-- AlterTable
ALTER TABLE "ProductMapping" ADD COLUMN "retailSku" TEXT;

-- CreateTable
CREATE TABLE "PushedOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "retailOrderId" TEXT NOT NULL,
    "masterDraftOrderId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "totalItems" INTEGER NOT NULL,
    "totalAmount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'multiplier',
    "value" REAL NOT NULL DEFAULT 1.0,
    "rounding" TEXT NOT NULL DEFAULT 'none'
);

-- CreateIndex
CREATE UNIQUE INDEX "PushedOrder_retailOrderId_key" ON "PushedOrder"("retailOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_shop_key" ON "PricingRule"("shop");
