UPDATE "Account"
SET "source" = 'OLD_QUERY'
WHERE "source" = 'QUERY';

UPDATE "Task"
SET "source" = 'OLD_QUERY'
WHERE "source" = 'QUERY';
