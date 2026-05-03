-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('VENDOR', 'CUSTOMER', 'BOTH');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('RAW', 'FINISHED');

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "partyType" "PartyType" NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "altPhone" TEXT,
    "email" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "gstNumber" TEXT,
    "gstNumberNormalized" TEXT,
    "panNumber" TEXT,
    "panNumberNormalized" TEXT,
    "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "storeNameNormalized" TEXT NOT NULL,
    "tallyName" TEXT NOT NULL,
    "tallyNameNormalized" TEXT NOT NULL,
    "sku" TEXT,
    "skuNormalized" TEXT,
    "itemType" "ItemType" NOT NULL,
    "category" TEXT,
    "baseUnit" TEXT NOT NULL,
    "hsnCode" TEXT,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Party_companyId_nameNormalized_key" ON "Party"("companyId", "nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Party_companyId_gstNumberNormalized_key" ON "Party"("companyId", "gstNumberNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Party_companyId_panNumberNormalized_key" ON "Party"("companyId", "panNumberNormalized");

-- CreateIndex
CREATE INDEX "Party_companyId_isActive_partyType_nameNormalized_idx" ON "Party"("companyId", "isActive", "partyType", "nameNormalized");

-- CreateIndex
CREATE INDEX "Party_companyId_createdAt_idx" ON "Party"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Party_companyId_updatedAt_idx" ON "Party"("companyId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Item_companyId_storeNameNormalized_key" ON "Item"("companyId", "storeNameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Item_companyId_tallyNameNormalized_key" ON "Item"("companyId", "tallyNameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Item_companyId_skuNormalized_key" ON "Item"("companyId", "skuNormalized");

-- CreateIndex
CREATE INDEX "Item_companyId_isActive_itemType_storeNameNormalized_idx" ON "Item"("companyId", "isActive", "itemType", "storeNameNormalized");

-- CreateIndex
CREATE INDEX "Item_companyId_category_idx" ON "Item"("companyId", "category");

-- CreateIndex
CREATE INDEX "Item_companyId_baseUnit_idx" ON "Item"("companyId", "baseUnit");

-- CreateIndex
CREATE INDEX "Item_companyId_createdAt_idx" ON "Item"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Item_companyId_updatedAt_idx" ON "Item"("companyId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
