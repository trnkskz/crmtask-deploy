ALTER TYPE "AccountSource" ADD VALUE IF NOT EXISTS 'OLD_QUERY';
ALTER TYPE "AccountSource" ADD VALUE IF NOT EXISTS 'LEAD';

UPDATE "Account"
SET "source" = 'OLD_QUERY'
WHERE "source" = 'QUERY';

UPDATE "Task"
SET "source" = 'OLD_QUERY'
WHERE "source" = 'QUERY';
