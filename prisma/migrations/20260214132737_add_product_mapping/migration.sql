-- CreateTable
CREATE TABLE "ProductMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "masterSku" TEXT NOT NULL,
    "retailShop" TEXT NOT NULL,
    "retailProductId" TEXT NOT NULL,
    "retailVariantId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductMapping_masterSku_retailShop_key" ON "ProductMapping"("masterSku", "retailShop");
