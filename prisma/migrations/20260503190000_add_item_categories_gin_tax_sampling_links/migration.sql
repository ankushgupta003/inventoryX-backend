-- CreateEnum
CREATE TYPE "QualityRequestSourceType" AS ENUM ('SAMPLING');

-- CreateTable
CREATE TABLE "ItemCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "itemType" "ItemType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemCategory_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Item"
ADD COLUMN "categoryId" TEXT;

ALTER TABLE "PurchaseGin"
ADD COLUMN "totalTaxableValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "totalCgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "totalSgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "totalIgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "PurchaseGinItem"
ADD COLUMN "taxableValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "cgstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "sgstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "igstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "lineTotalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "QualityRequest"
ADD COLUMN "sourceType" "QualityRequestSourceType",
ADD COLUMN "stockMovementId" TEXT,
ADD COLUMN "stockMovementItemId" TEXT,
ADD COLUMN "itemId" TEXT,
ADD COLUMN "productionBatchId" TEXT;

-- Backfill item categories from existing item strings
INSERT INTO "ItemCategory" (
    "id",
    "companyId",
    "name",
    "nameNormalized",
    "itemType",
    "isActive",
    "createdAt",
    "updatedAt"
)
SELECT
    md5(random()::text || clock_timestamp()::text || src."companyId" || src."category" || src."itemType"::text),
    src."companyId",
    src."category",
    lower(regexp_replace(src."category", '\s+', ' ', 'g')),
    src."itemType",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT
        "companyId",
        "itemType",
        btrim("category") AS "category"
    FROM "Item"
    WHERE "category" IS NOT NULL
      AND btrim("category") <> ''
) AS src;

UPDATE "Item" AS i
SET "categoryId" = ic."id"
FROM "ItemCategory" AS ic
WHERE i."category" IS NOT NULL
  AND btrim(i."category") <> ''
  AND ic."companyId" = i."companyId"
  AND ic."itemType" = i."itemType"
  AND ic."nameNormalized" = lower(regexp_replace(btrim(i."category"), '\s+', ' ', 'g'));

-- Backfill purchase GST/tax fields from legacy amount fields
UPDATE "PurchaseGinItem"
SET
    "taxableValue" = "amount",
    "lineTotalAmount" = "amount";

UPDATE "PurchaseGin"
SET
    "totalTaxableValue" = "totalAmount",
    "totalCgstAmount" = 0,
    "totalSgstAmount" = 0,
    "totalIgstAmount" = 0;

-- Convert operational batch date fields to text, preserving existing values
ALTER TABLE "PurchaseGinItem"
ALTER COLUMN "mfgDate" TYPE TEXT USING TO_CHAR("mfgDate", 'YYYY-MM-DD'),
ALTER COLUMN "expiryDate" TYPE TEXT USING TO_CHAR("expiryDate", 'YYYY-MM-DD'),
ALTER COLUMN "mfgDate" DROP NOT NULL,
ALTER COLUMN "expiryDate" DROP NOT NULL,
ALTER COLUMN "rate" TYPE DECIMAL(18,4);

ALTER TABLE "StockMovementItem"
ALTER COLUMN "mfgDate" TYPE TEXT USING TO_CHAR("mfgDate", 'YYYY-MM-DD'),
ALTER COLUMN "expiryDate" TYPE TEXT USING TO_CHAR("expiryDate", 'YYYY-MM-DD'),
ALTER COLUMN "mfgDate" DROP NOT NULL,
ALTER COLUMN "expiryDate" DROP NOT NULL;

ALTER TABLE "StockLedgerEntry"
ALTER COLUMN "mfgDate" TYPE TEXT USING TO_CHAR("mfgDate", 'YYYY-MM-DD'),
ALTER COLUMN "expiryDate" TYPE TEXT USING TO_CHAR("expiryDate", 'YYYY-MM-DD'),
ALTER COLUMN "mfgDate" DROP NOT NULL,
ALTER COLUMN "expiryDate" DROP NOT NULL,
ALTER COLUMN "rate" TYPE DECIMAL(18,4);

-- Drop legacy inline item category string after backfill
ALTER TABLE "Item"
DROP COLUMN "category";

-- CreateIndex
CREATE UNIQUE INDEX "ItemCategory_companyId_itemType_nameNormalized_key" ON "ItemCategory"("companyId", "itemType", "nameNormalized");

-- CreateIndex
CREATE INDEX "ItemCategory_companyId_itemType_isActive_nameNormalized_idx" ON "ItemCategory"("companyId", "itemType", "isActive", "nameNormalized");

-- CreateIndex
CREATE INDEX "ItemCategory_companyId_createdAt_idx" ON "ItemCategory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ItemCategory_companyId_updatedAt_idx" ON "ItemCategory"("companyId", "updatedAt");

-- CreateIndex
CREATE INDEX "Item_companyId_categoryId_idx" ON "Item"("companyId", "categoryId");

-- CreateIndex
CREATE INDEX "QualityRequest_companyId_sourceType_date_idx" ON "QualityRequest"("companyId", "sourceType", "date");

-- CreateIndex
CREATE INDEX "QualityRequest_companyId_stockMovementId_date_idx" ON "QualityRequest"("companyId", "stockMovementId", "date");

-- CreateIndex
CREATE INDEX "QualityRequest_companyId_productionBatchId_date_idx" ON "QualityRequest"("companyId", "productionBatchId", "date");

-- CreateIndex
CREATE INDEX "QualityRequest_companyId_itemId_date_idx" ON "QualityRequest"("companyId", "itemId", "date");

-- AddForeignKey
ALTER TABLE "ItemCategory" ADD CONSTRAINT "ItemCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ItemCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityRequest" ADD CONSTRAINT "QualityRequest_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityRequest" ADD CONSTRAINT "QualityRequest_stockMovementItemId_fkey" FOREIGN KEY ("stockMovementItemId") REFERENCES "StockMovementItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityRequest" ADD CONSTRAINT "QualityRequest_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityRequest" ADD CONSTRAINT "QualityRequest_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "ProductionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
