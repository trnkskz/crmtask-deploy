-- CreateEnum
CREATE TYPE "TaskCreationChannel" AS ENUM ('REQUEST_FLOW', 'MANUAL_TASK_CREATE', 'PROJECT_GENERATED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Task"
ADD COLUMN "creationChannel" "TaskCreationChannel" NOT NULL DEFAULT 'UNKNOWN';
