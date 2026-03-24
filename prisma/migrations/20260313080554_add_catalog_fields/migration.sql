-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Inventory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "stockLevel" INTEGER NOT NULL,
    "retailProductId" TEXT,
    "masterStoreId" TEXT,
    "masterCostPrice" REAL,
    "isListed" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Inventory" ("id", "masterCostPrice", "masterStoreId", "productName", "retailProductId", "sku", "stockLevel") SELECT "id", "masterCostPrice", "masterStoreId", "productName", "retailProductId", "sku", "stockLevel" FROM "Inventory";
DROP TABLE "Inventory";
ALTER TABLE "new_Inventory" RENAME TO "Inventory";
CREATE UNIQUE INDEX "Inventory_sku_key" ON "Inventory"("sku");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
