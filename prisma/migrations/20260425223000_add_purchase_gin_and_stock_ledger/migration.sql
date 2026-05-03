-- AlterTable
ALTER TABLE "Company" ADD COLUMN "purchaseGinSequence" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "StockLedgerEntryType" AS ENUM ('PURCHASE', 'ISSUE', 'PRODUCTION', 'INVOICE', 'RETURN', 'TRANSFER', 'SAMPLING');

-- CreateTable
CREATE TABLE "PurchaseGin" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ginNo" TEXT NOT NULL,
    "ginSequence" INTEGER NOT NULL,
    "vendorId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "challanNo" TEXT NOT NULL,
    "challanDate" DATE NOT NULL,
    "billNo" TEXT NOT NULL,
    "billDate" DATE NOT NULL,
    "gateEntryNo" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "preparedBy" TEXT,
    "sanctionedBy" TEXT,
    "authorizedSignatory" TEXT,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "totalAcceptedQty" DECIMAL(18,3) NOT NULL,
    "totalRejectedQty" DECIMAL(18,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseGin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseGinItem" (
    "id" TEXT NOT NULL,
    "purchaseGinId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemType" "ItemType" NOT NULL,
    "baseUnit" TEXT NOT NULL,
    "ulpQty" DECIMAL(18,3) NOT NULL,
    "billQty" DECIMAL(18,3) NOT NULL,
    "receivedQty" DECIMAL(18,3) NOT NULL,
    "acceptedQty" DECIMAL(18,3) NOT NULL,
    "rejectedQty" DECIMAL(18,3) NOT NULL,
    "batchNo" TEXT NOT NULL,
    "mfgDate" DATE NOT NULL,
    "expiryDate" DATE NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseGinItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLedgerEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseGinId" TEXT,
    "itemId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "type" "StockLedgerEntryType" NOT NULL,
    "particulars" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemCategory" "ItemType" NOT NULL,
    "batchNo" TEXT NOT NULL,
    "mfgDate" DATE NOT NULL,
    "expiryDate" DATE NOT NULL,
    "receiptQty" DECIMAL(18,3) NOT NULL,
    "issueQty" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseGin_companyId_ginNo_key" ON "PurchaseGin"("companyId", "ginNo");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseGin_companyId_ginSequence_key" ON "PurchaseGin"("companyId", "ginSequence");

-- CreateIndex
CREATE INDEX "PurchaseGin_companyId_entryDate_idx" ON "PurchaseGin"("companyId", "entryDate");

-- CreateIndex
CREATE INDEX "PurchaseGin_companyId_vendorId_entryDate_idx" ON "PurchaseGin"("companyId", "vendorId", "entryDate");

-- CreateIndex
CREATE INDEX "PurchaseGin_companyId_createdAt_idx" ON "PurchaseGin"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseGinItem_purchaseGinId_lineNo_key" ON "PurchaseGinItem"("purchaseGinId", "lineNo");

-- CreateIndex
CREATE INDEX "PurchaseGinItem_itemId_idx" ON "PurchaseGinItem"("itemId");

-- CreateIndex
CREATE INDEX "StockLedgerEntry_companyId_date_idx" ON "StockLedgerEntry"("companyId", "date");

-- CreateIndex
CREATE INDEX "StockLedgerEntry_companyId_type_date_idx" ON "StockLedgerEntry"("companyId", "type", "date");

-- CreateIndex
CREATE INDEX "StockLedgerEntry_companyId_itemId_batchNo_date_idx" ON "StockLedgerEntry"("companyId", "itemId", "batchNo", "date");

-- CreateIndex
CREATE INDEX "StockLedgerEntry_companyId_referenceNo_idx" ON "StockLedgerEntry"("companyId", "referenceNo");

-- AddForeignKey
ALTER TABLE "PurchaseGin" ADD CONSTRAINT "PurchaseGin_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseGin" ADD CONSTRAINT "PurchaseGin_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseGinItem" ADD CONSTRAINT "PurchaseGinItem_purchaseGinId_fkey" FOREIGN KEY ("purchaseGinId") REFERENCES "PurchaseGin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseGinItem" ADD CONSTRAINT "PurchaseGinItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_purchaseGinId_fkey" FOREIGN KEY ("purchaseGinId") REFERENCES "PurchaseGin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
