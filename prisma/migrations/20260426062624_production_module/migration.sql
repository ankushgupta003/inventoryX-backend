-- CreateEnum
CREATE TYPE "ProductionBatchStatus" AS ENUM ('DRAFT', 'IN_PROCESS', 'QA_PENDING', 'RELEASED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ProductionBmrStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "MaterialRequisitionStatus" AS ENUM ('PENDING', 'APPROVED', 'ISSUED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ISSUE', 'SAMPLING', 'TRANSFER');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "mrsSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "productionSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stockMovementSequence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockLedgerEntry" ADD COLUMN     "productionBatchId" TEXT,
ADD COLUMN     "stockMovementId" TEXT;

-- CreateTable
CREATE TABLE "ProductionBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "productionNo" TEXT NOT NULL,
    "productionSequence" INTEGER NOT NULL,
    "batchNo" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "batchSize" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "mfgDate" DATE NOT NULL,
    "expDate" DATE NOT NULL,
    "status" "ProductionBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "expectedQty" DECIMAL(18,3),
    "actualQty" DECIMAL(18,3),
    "rejectedQty" DECIMAL(18,3),
    "qaApprovedBy" TEXT,
    "qaRemarks" TEXT,
    "qaDecidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionBmr" (
    "id" TEXT NOT NULL,
    "productionBatchId" TEXT NOT NULL,
    "status" "ProductionBmrStatus" NOT NULL DEFAULT 'DRAFT',
    "payload" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionBmr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRequisition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productionBatchId" TEXT NOT NULL,
    "mrsNo" TEXT NOT NULL,
    "mrsSequence" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "department" TEXT NOT NULL,
    "requisitionBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "status" "MaterialRequisitionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRequisitionItem" (
    "id" TEXT NOT NULL,
    "materialRequisitionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qtyRequested" DECIMAL(18,3) NOT NULL,
    "qtyIssued" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialRequisitionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productionBatchId" TEXT,
    "materialRequisitionId" TEXT,
    "movementNo" TEXT NOT NULL,
    "movementSequence" INTEGER NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "date" DATE NOT NULL,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "issuedBy" TEXT,
    "sampleDrawnBy" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovementItem" (
    "id" TEXT NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "availableQty" DECIMAL(18,3) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "mfgDate" DATE NOT NULL,
    "expiryDate" DATE NOT NULL,
    "requestedQty" DECIMAL(18,3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovementItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionBatch_companyId_status_createdAt_idx" ON "ProductionBatch"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductionBatch_companyId_itemId_status_idx" ON "ProductionBatch"("companyId", "itemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_companyId_productionNo_key" ON "ProductionBatch"("companyId", "productionNo");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_companyId_productionSequence_key" ON "ProductionBatch"("companyId", "productionSequence");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_companyId_batchNo_key" ON "ProductionBatch"("companyId", "batchNo");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBmr_productionBatchId_key" ON "ProductionBmr"("productionBatchId");

-- CreateIndex
CREATE INDEX "MaterialRequisition_companyId_productionBatchId_createdAt_idx" ON "MaterialRequisition"("companyId", "productionBatchId", "createdAt");

-- CreateIndex
CREATE INDEX "MaterialRequisition_companyId_status_createdAt_idx" ON "MaterialRequisition"("companyId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRequisition_companyId_mrsNo_key" ON "MaterialRequisition"("companyId", "mrsNo");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRequisition_companyId_mrsSequence_key" ON "MaterialRequisition"("companyId", "mrsSequence");

-- CreateIndex
CREATE INDEX "MaterialRequisitionItem_itemId_idx" ON "MaterialRequisitionItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRequisitionItem_materialRequisitionId_lineNo_key" ON "MaterialRequisitionItem"("materialRequisitionId", "lineNo");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_type_createdAt_idx" ON "StockMovement"("companyId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_productionBatchId_createdAt_idx" ON "StockMovement"("companyId", "productionBatchId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_materialRequisitionId_createdAt_idx" ON "StockMovement"("companyId", "materialRequisitionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_companyId_movementNo_key" ON "StockMovement"("companyId", "movementNo");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_companyId_movementSequence_key" ON "StockMovement"("companyId", "movementSequence");

-- CreateIndex
CREATE INDEX "StockMovementItem_itemId_idx" ON "StockMovementItem"("itemId");

-- CreateIndex
CREATE INDEX "StockMovementItem_itemId_batchNo_idx" ON "StockMovementItem"("itemId", "batchNo");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovementItem_stockMovementId_lineNo_key" ON "StockMovementItem"("stockMovementId", "lineNo");

-- CreateIndex
CREATE INDEX "StockLedgerEntry_companyId_productionBatchId_idx" ON "StockLedgerEntry"("companyId", "productionBatchId");

-- CreateIndex
CREATE INDEX "StockLedgerEntry_companyId_stockMovementId_idx" ON "StockLedgerEntry"("companyId", "stockMovementId");

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "ProductionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBmr" ADD CONSTRAINT "ProductionBmr_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "ProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequisition" ADD CONSTRAINT "MaterialRequisition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequisition" ADD CONSTRAINT "MaterialRequisition_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "ProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequisitionItem" ADD CONSTRAINT "MaterialRequisitionItem_materialRequisitionId_fkey" FOREIGN KEY ("materialRequisitionId") REFERENCES "MaterialRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequisitionItem" ADD CONSTRAINT "MaterialRequisitionItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "ProductionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_materialRequisitionId_fkey" FOREIGN KEY ("materialRequisitionId") REFERENCES "MaterialRequisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementItem" ADD CONSTRAINT "StockMovementItem_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovementItem" ADD CONSTRAINT "StockMovementItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
