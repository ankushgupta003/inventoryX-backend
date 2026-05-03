-- CreateEnum
CREATE TYPE "ProformaInvoiceStatus" AS ENUM ('PENDING', 'PARTIAL', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PARTIAL', 'COMPLETED');

-- AlterTable
ALTER TABLE "Company"
ADD COLUMN "proformaInvoiceSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "invoiceSequence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockLedgerEntry"
ADD COLUMN "invoiceId" TEXT;

-- CreateTable
CREATE TABLE "ProformaInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "piNo" TEXT NOT NULL,
    "piSequence" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "status" "ProformaInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "customerName" TEXT NOT NULL,
    "customerContactPerson" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "customerAddress1" TEXT,
    "customerAddress2" TEXT,
    "customerCity" TEXT,
    "customerState" TEXT,
    "customerPincode" TEXT,
    "customerGstNumber" TEXT,
    "customerPanNumber" TEXT,
    "totalQuantity" DECIMAL(18,3) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProformaInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProformaInvoiceItem" (
    "id" TEXT NOT NULL,
    "proformaInvoiceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "invoicedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "rate" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProformaInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "proformaInvoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "invoiceSequence" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PARTIAL',
    "customerName" TEXT NOT NULL,
    "customerContactPerson" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "customerAddress1" TEXT,
    "customerAddress2" TEXT,
    "customerCity" TEXT,
    "customerState" TEXT,
    "customerPincode" TEXT,
    "customerGstNumber" TEXT,
    "customerPanNumber" TEXT,
    "totalQuantity" DECIMAL(18,3) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "proformaInvoiceItemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "taxPercent" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProformaInvoice_companyId_status_date_idx" ON "ProformaInvoice"("companyId", "status", "date");

-- CreateIndex
CREATE INDEX "ProformaInvoice_companyId_customerId_date_idx" ON "ProformaInvoice"("companyId", "customerId", "date");

-- CreateIndex
CREATE INDEX "ProformaInvoice_companyId_createdAt_idx" ON "ProformaInvoice"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProformaInvoice_companyId_piNo_key" ON "ProformaInvoice"("companyId", "piNo");

-- CreateIndex
CREATE UNIQUE INDEX "ProformaInvoice_companyId_piSequence_key" ON "ProformaInvoice"("companyId", "piSequence");

-- CreateIndex
CREATE INDEX "ProformaInvoiceItem_itemId_idx" ON "ProformaInvoiceItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProformaInvoiceItem_proformaInvoiceId_lineNo_key" ON "ProformaInvoiceItem"("proformaInvoiceId", "lineNo");

-- CreateIndex
CREATE INDEX "Invoice_companyId_proformaInvoiceId_date_idx" ON "Invoice"("companyId", "proformaInvoiceId", "date");

-- CreateIndex
CREATE INDEX "Invoice_companyId_customerId_date_idx" ON "Invoice"("companyId", "customerId", "date");

-- CreateIndex
CREATE INDEX "Invoice_companyId_status_date_idx" ON "Invoice"("companyId", "status", "date");

-- CreateIndex
CREATE INDEX "Invoice_companyId_createdAt_idx" ON "Invoice"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_invoiceNo_key" ON "Invoice"("companyId", "invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_invoiceSequence_key" ON "Invoice"("companyId", "invoiceSequence");

-- CreateIndex
CREATE INDEX "InvoiceItem_proformaInvoiceItemId_idx" ON "InvoiceItem"("proformaInvoiceItemId");

-- CreateIndex
CREATE INDEX "InvoiceItem_itemId_idx" ON "InvoiceItem"("itemId");

-- CreateIndex
CREATE INDEX "InvoiceItem_itemId_batchNo_idx" ON "InvoiceItem"("itemId", "batchNo");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceItem_invoiceId_lineNo_key" ON "InvoiceItem"("invoiceId", "lineNo");

-- CreateIndex
CREATE INDEX "StockLedgerEntry_companyId_invoiceId_idx" ON "StockLedgerEntry"("companyId", "invoiceId");

-- AddForeignKey
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaInvoiceItem" ADD CONSTRAINT "ProformaInvoiceItem_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "ProformaInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaInvoiceItem" ADD CONSTRAINT "ProformaInvoiceItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "ProformaInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_proformaInvoiceItemId_fkey" FOREIGN KEY ("proformaInvoiceItemId") REFERENCES "ProformaInvoiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
