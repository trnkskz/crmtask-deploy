-- Performance indexes for dashboard, reports and scoped task/account queries

-- User
CREATE INDEX IF NOT EXISTS "User_managerId_idx" ON "User"("managerId");
CREATE INDEX IF NOT EXISTS "User_role_isActive_idx" ON "User"("role", "isActive");
CREATE INDEX IF NOT EXISTS "User_team_role_isActive_idx" ON "User"("team", "role", "isActive");

-- Account
CREATE INDEX IF NOT EXISTS "Account_creationDate_idx" ON "Account"("creationDate");
CREATE INDEX IF NOT EXISTS "Account_status_idx" ON "Account"("status");
CREATE INDEX IF NOT EXISTS "Account_city_district_idx" ON "Account"("city", "district");
CREATE INDEX IF NOT EXISTS "Account_mainCategory_subCategory_idx" ON "Account"("mainCategory", "subCategory");
CREATE INDEX IF NOT EXISTS "Account_accountName_idx" ON "Account"("accountName");

-- Task
CREATE INDEX IF NOT EXISTS "Task_accountId_idx" ON "Task"("accountId");
CREATE INDEX IF NOT EXISTS "Task_ownerId_generalStatus_idx" ON "Task"("ownerId", "generalStatus");
CREATE INDEX IF NOT EXISTS "Task_ownerId_status_idx" ON "Task"("ownerId", "status");
CREATE INDEX IF NOT EXISTS "Task_createdById_creationDate_idx" ON "Task"("createdById", "creationDate");
CREATE INDEX IF NOT EXISTS "Task_generalStatus_creationDate_idx" ON "Task"("generalStatus", "creationDate");
CREATE INDEX IF NOT EXISTS "Task_status_generalStatus_idx" ON "Task"("status", "generalStatus");
CREATE INDEX IF NOT EXISTS "Task_creationDate_idx" ON "Task"("creationDate");

-- ActivityLog
CREATE INDEX IF NOT EXISTS "ActivityLog_taskId_createdAt_idx" ON "ActivityLog"("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "ActivityLog_authorId_createdAt_idx" ON "ActivityLog"("authorId", "createdAt");

-- Deal
CREATE INDEX IF NOT EXISTS "Deal_taskId_idx" ON "Deal"("taskId");
CREATE INDEX IF NOT EXISTS "Deal_status_createdAt_idx" ON "Deal"("status", "createdAt");
