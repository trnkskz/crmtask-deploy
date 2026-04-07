-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'PROJECT';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'PRICING';

-- CreateEnum
CREATE TYPE "PricingCategory" AS ENUM ('COMMISSION', 'SERVICE', 'DOPING', 'SOCIAL_MEDIA');

-- CreateEnum
CREATE TYPE "PricingStatus" AS ENUM ('ACTIVE', 'PASSIVE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PricingItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PricingCategory" NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "commissionRate" DOUBLE PRECISION,
    "description" TEXT,
    "status" "PricingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PricingItem_category_status_idx" ON "PricingItem"("category", "status");
CREATE INDEX "PricingItem_createdAt_idx" ON "PricingItem"("createdAt");
CREATE INDEX "Project_status_idx" ON "Project"("status");
CREATE INDEX "Project_createdById_idx" ON "Project"("createdById");
CREATE INDEX "Project_createdAt_idx" ON "Project"("createdAt");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
