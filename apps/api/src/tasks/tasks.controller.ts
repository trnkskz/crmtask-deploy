import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common'
import { TasksService } from './tasks.service'
import { AssignTaskDto, CreateTaskDto, SetTaskPoolDto } from './dto/task-create.dto'
import { ActivityLogDto, TaskStatusDto, UpdateActivityLogDto } from './dto/task-activity.dto'
import { TaskFocusContactDto } from './dto/task-focus-contact.dto'
import { UpdateTaskDto } from './dto/task-update.dto'
import { MinRole } from '../security/roles.decorator'
import { RequirePermission } from '../security/permissions.decorator'
// using string union validated by DTO
import { Roles } from '../security/role.types'
import type { Request } from 'express'
import { ApiTags } from '@nestjs/swagger'

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private svc: TasksService) {}

  @Get()
  @MinRole(Roles.SALESPERSON)
  list(@Req() req: Request, @Query() q: any) {
    const user = (req as any).user
    return this.svc.list(q, user)
  }

  @Get('search')
  @MinRole(Roles.SALESPERSON)
  search(@Query('q') q?: string, @Query('take') take?: string) {
    return this.svc.search(q || '', take ? Number(take) : 10)
  }

  @Get(":id")
  @MinRole(Roles.SALESPERSON)
  detail(@Param('id') id: string) {
    return this.svc.detail(id)
  }

  @Post()
  @MinRole(Roles.SALESPERSON)
  create(@Req() req: Request, @Body() body: CreateTaskDto) {
    const user = (req as any).user
    return this.svc.create(user, body)
  }

  @Post('bulk-import')
  @MinRole(Roles.MANAGER)
  bulkImport(@Req() req: Request, @Body() body: { data: any[] }) {
    const user = (req as any).user
    return this.svc.bulkImport(body.data, user)
  }

  @Post(':id/assign')
  @MinRole(Roles.TEAM_LEADER)
  @RequirePermission('reassignTask')
  assign(@Req() req: Request, @Param('id') id: string, @Body() body: AssignTaskDto) {
    const user = (req as any).user
    return this.svc.assign(user, id, body)
  }

  @Post(':id/pool')
  @MinRole(Roles.SALESPERSON)
  setPool(@Req() req: Request, @Param('id') id: string, @Body() body: SetTaskPoolDto) {
    const user = (req as any).user
    return this.svc.setPool(user, id, body.poolTeam as any)
  }

  @Post(':id/activity')
  @MinRole(Roles.SALESPERSON)
  activity(@Req() req: Request, @Param('id') id: string, @Body() body: ActivityLogDto) {
    const user = (req as any).user
    return this.svc.addActivity(user, id, body)
  }

  @Post(':id/focus-contact')
  @MinRole(Roles.SALESPERSON)
  focusContact(@Req() req: Request, @Param('id') id: string, @Body() body: TaskFocusContactDto) {
    const user = (req as any).user
    return this.svc.upsertFocusContact(user, id, body)
  }

  @Delete(':id/activity/:logId')
  @MinRole(Roles.SALESPERSON)
  removeActivity(@Req() req: Request, @Param('id') id: string, @Param('logId') logId: string) {
    const user = (req as any).user
    return this.svc.deleteActivity(user, id, logId)
  }

  @Patch(':id/activity/:logId')
  @MinRole(Roles.SALESPERSON)
  updateActivity(@Req() req: Request, @Param('id') id: string, @Param('logId') logId: string, @Body() body: UpdateActivityLogDto) {
    const user = (req as any).user
    return this.svc.updateActivity(user, id, logId, body)
  }

  @Patch(':id/status')
  @MinRole(Roles.SALESPERSON)
  setStatus(@Req() req: Request, @Param('id') id: string, @Body() body: TaskStatusDto & { close?: boolean; closedReason?: string }) {
    const user = (req as any).user
    return this.svc.setStatus(user, id, body.status as any, body.close, (body as any).closedReason)
  }

  @Patch(':id')
  @MinRole(Roles.SALESPERSON)
  update(@Req() req: Request, @Param('id') id: string, @Body() body: UpdateTaskDto) {
    const user = (req as any).user
    return this.svc.update(user, id, body)
  }

  @Delete(':id')
  @MinRole(Roles.TEAM_LEADER)
  remove(@Param('id') id: string) {
    return this.svc.remove(id)
  }
}
