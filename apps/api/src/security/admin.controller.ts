import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import { AdminService } from './admin.service'
import { MinRole } from './roles.decorator'
import { Roles } from './role.types'
import { ApiTags } from '@nestjs/swagger'
import { RequirePermission } from './permissions.decorator'

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private svc: AdminService) {}

  @Post('system/wipe')
  @MinRole(Roles.ADMIN)
  @RequirePermission('manageSettings')
  wipeData() { return this.svc.wipeData() }

  @Post('system/factory-reset')
  @MinRole(Roles.ADMIN)
  @RequirePermission('manageSettings')
  factoryReset() { return this.svc.factoryReset() }

  @Post('maintenance/fix-past-record-dates')
  @MinRole(Roles.ADMIN)
  @RequirePermission('manageSettings')
  fixPastRecordDates() { return this.svc.fixPastRecordDates() }

  @Post('maintenance/clean-archive-assignees')
  @MinRole(Roles.ADMIN)
  @RequirePermission('manageSettings')
  cleanArchiveAssignees() { return this.svc.cleanArchiveAssignees() }

  @Post('maintenance/delete-admin-test-data')
  @MinRole(Roles.ADMIN)
  @RequirePermission('manageSettings')
  deleteAdminTestData() { return this.svc.deleteAdminTestData() }

  @Post('maintenance/migrate-grupanya-categories')
  @MinRole(Roles.ADMIN)
  @RequirePermission('manageSettings')
  migrateGrupanyaCategories() { return this.svc.migrateGrupanyaCategories() }

  @Post('maintenance/category-usage')
  @MinRole(Roles.MANAGER)
  categoryUsagePost(@Body() body: { type: 'main'|'sub'; oldMain: string; oldSub?: string | null }) {
    return this.svc.categoryUsage(body)
  }

  @Post('maintenance/transfer-category')
  @MinRole(Roles.MANAGER)
  transferCategory(@Body() body: { type: 'main'|'sub'; oldMain: string; oldSub?: string | null; newMain: string; newSub?: string | null; index?: number | null; categories?: Record<string, string[]> }) {
    return this.svc.transferCategory(body)
  }

  @Get('roles')
  @MinRole(Roles.ADMIN)
  @RequirePermission('manageRoles')
  roles() { return this.svc.listRoles() }

  @Post('roles')
  @MinRole(Roles.ADMIN)
  @RequirePermission('manageRoles')
  createRole(@Body() body: { name: string }) { return this.svc.createRole(body.name) }

  @Get('permissions')
  @MinRole(Roles.ADMIN)
  @RequirePermission('manageRoles')
  perms() { return this.svc.listPermissions() }

  @Post('permissions')
  @MinRole(Roles.ADMIN)
  @RequirePermission('manageRoles')
  createPerm(@Body() body: { name: string; module: string; description?: string }) { return this.svc.createPermission(body) }

  @Post('roles/:roleId/permissions')
  @MinRole(Roles.ADMIN)
  @RequirePermission('manageRoles')
  attach(@Param('roleId') roleId: string, @Body() body: { permissionId: string }) { return this.svc.attachPermission(roleId, body.permissionId) }

  @Patch('users/:userId/appRole')
  @MinRole(Roles.ADMIN)
  @RequirePermission('manageRoles')
  assignRole(@Param('userId') userId: string, @Body() body: { roleId: string }) { return this.svc.assignRoleToUser(userId, body.roleId) }
}
