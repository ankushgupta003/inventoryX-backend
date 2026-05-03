-- CreateEnum
CREATE TYPE "QualityIssueType" AS ENUM ('DEFECT', 'TESTING', 'COMPLAINT');

-- CreateEnum
CREATE TYPE "QualityRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'UNDER_TESTING', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "QualityTestResult" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "QualityClosureDecision" AS ENUM ('ACCEPT', 'REJECT');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "qualityRequestSequence" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "QualityRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestNo" TEXT NOT NULL,
    "requestSequence" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "itemName" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "quantity" DECIMAL(18,3),
    "issueType" "QualityIssueType" NOT NULL,
    "description" TEXT NOT NULL,
    "remarks" TEXT,
    "requestedBy" TEXT NOT NULL,
    "status" "QualityRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvalRemarks" TEXT,
    "testParameters" TEXT,
    "observations" TEXT,
    "testResult" "QualityTestResult",
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "closureDecision" "QualityClosureDecision",
    "closureRemarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QualityRequest_companyId_requestNo_key" ON "QualityRequest"("companyId", "requestNo");

-- CreateIndex
CREATE UNIQUE INDEX "QualityRequest_companyId_requestSequence_key" ON "QualityRequest"("companyId", "requestSequence");

-- CreateIndex
CREATE INDEX "QualityRequest_companyId_status_date_idx" ON "QualityRequest"("companyId", "status", "date");

-- CreateIndex
CREATE INDEX "QualityRequest_companyId_batchNo_date_idx" ON "QualityRequest"("companyId", "batchNo", "date");

-- CreateIndex
CREATE INDEX "QualityRequest_companyId_itemName_date_idx" ON "QualityRequest"("companyId", "itemName", "date");

-- AddForeignKey
ALTER TABLE "QualityRequest" ADD CONSTRAINT "QualityRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
