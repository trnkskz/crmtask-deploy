import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common'
import type { Request } from 'express'
import { MinRole } from '../security/roles.decorator'
import { Roles } from '../security/role.types'
import { ApiTags } from '@nestjs/swagger'
import { UsersService } from './users.service'
import { CreateUserDto, UpdateUserDto, ChangeRoleDto, TransferAndDeactivateDto, SetPasswordDto } from './dto/user.dto'
import { RequirePermission } from '../security/permissions.decorator'

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  @MinRole(Roles.SALESPERSON)
  me(@Req() req: Request) {
    const user = (req as any).user ?? null
    return { user }
  }

  @Get()
  @MinRole(Roles.TEAM_LEADER)
  list(@Req() req: Request, @Query('includeInactive') includeInactive?: string) {
    const user = (req as any).user
    return this.users.list(includeInactive === '1' || includeInactive === 'true', user)
  }

  @Post()
  @MinRole(Roles.MANAGER)
  @RequirePermission('manageUsers')
  create(@Body() body: CreateUserDto) {
    return this.users.create(body)
  }

  @Patch(':id')
  @MinRole(Roles.MANAGER)
  @RequirePermission('manageUsers')
  update(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.users.update(id, body)
  }

  @Patch(':id/role')
  @MinRole(Roles.MANAGER)
  @RequirePermission('manageRoles')
  changeRole(@Param('id') id: string, @Body() body: ChangeRoleDto) {
    return this.users.changeRole(id, body.role, body.managerId)
  }

  @Patch(':id/deactivate')
  @MinRole(Roles.MANAGER)
  @RequirePermission('manageUsers')
  deactivate(@Param('id') id: string) { return this.users.deactivate(id) }

  @Delete(':id')
  @MinRole(Roles.MANAGER)
  @RequirePermission('manageUsers')
  remove(@Param('id') id: string) { return this.users.remove(id) }

  @Post(':id/transfer-and-deactivate')
  @MinRole(Roles.MANAGER)
  @RequirePermission('manageUsers')
  transferAndDeactivate(@Param('id') id: string, @Body() body: TransferAndDeactivateDto) {
    return this.users.transferAndDeactivate(id, body.targetOwnerId, body.isDelete)
  }

  @Patch(':id/password')
  @MinRole(Roles.MANAGER)
  @RequirePermission('manageUsers')
  setPassword(@Param('id') id: string, @Body() body: SetPasswordDto) { return this.users.setPassword(id, body.password) }
}
