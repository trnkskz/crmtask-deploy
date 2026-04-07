-- CreateEnum
CREATE TYPE "PoolTeam" AS ENUM ('GENERAL', 'TEAM_1', 'TEAM_2');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "poolTeam" "PoolTeam" NOT NULL DEFAULT 'GENERAL';

-- CreateIndex
CREATE INDEX "Task_poolTeam_idx" ON "Task"("poolTeam");
