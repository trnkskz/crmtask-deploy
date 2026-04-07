import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common'
import { TaskListsService } from './tasklists.service'
import { CreateTaskListDto, TaskListQueryDto, TaskListTasksQueryDto, UpdateTaskListDto } from './dto/tasklist.dto'
import { MinRole } from '../security/roles.decorator'
import { Roles } from '../security/role.types'
import type { Request } from 'express'
import { ApiTags } from '@nestjs/swagger'

@ApiTags('tasklists')
@Controller('tasklists')
export class TaskListsController {
  constructor(private svc: TaskListsService) {}

  @Get()
  @MinRole(Roles.SALESPERSON)
  list(@Query() q: TaskListQueryDto) {
    return this.svc.list(q)
  }

  @Get('pool/tasks')
  @MinRole(Roles.SALESPERSON)
  listPoolTasks(@Req() req: Request, @Query() q: TaskListTasksQueryDto) {
    const user = (req as any).user
    return this.svc.listPoolTasks(q, user)
  }

  @Get(':id/tasks')
  @MinRole(Roles.SALESPERSON)
  listByTaskList(@Req() req: Request, @Param('id') id: string, @Query() q: TaskListTasksQueryDto) {
    const user = (req as any).user
    return this.svc.listPoolTasks({ ...q, taskListId: id }, user)
  }

  @Get(':id')
  @MinRole(Roles.SALESPERSON)
  async detail(@Param('id') id: string) {
    return this.svc.detail(id)
  }

  @Post()
  @MinRole(Roles.TEAM_LEADER)
  create(@Req() req: Request, @Body() body: CreateTaskListDto) {
    const user = (req as any).user!
    return this.svc.create(user.id, body)
  }

  @Patch(':id')
  @MinRole(Roles.TEAM_LEADER)
  update(@Param('id') id: string, @Body() body: UpdateTaskListDto) {
    return this.svc.update(id, body)
  }

  @Delete(':id')
  @MinRole(Roles.TEAM_LEADER)
  remove(@Param('id') id: string) {
    return this.svc.remove(id)
  }
}
