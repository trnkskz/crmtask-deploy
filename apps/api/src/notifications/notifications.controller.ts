import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req } from '@nestjs/common'
import type { Request } from 'express'
import { MinRole } from '../security/roles.decorator'
import { Roles } from '../security/role.types'
import { NotificationsService } from './notifications.service'
import { ApiTags } from '@nestjs/swagger'
import { CreateNotificationDto, NotificationListQueryDto } from './dto/notification.dto'

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  @Get()
  @MinRole(Roles.ADMIN)
  listAll(@Query() q: NotificationListQueryDto) {
    return this.svc.listAll(q)
  }

  @Get('me')
  @MinRole(Roles.SALESPERSON)
  list(@Req() req: Request, @Query('page') page?: string, @Query('limit') limit?: string) {
    const user = (req as any).user
    return this.svc.listForUser(user.id, page ? Number(page) : 1, limit ? Number(limit) : 50)
  }

  @Get(':id')
  @MinRole(Roles.SALESPERSON)
  async detail(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user
    const item = await this.svc.detail(id)
    if (user.role !== Roles.ADMIN && item.toUserId !== user.id) throw new ForbiddenException('Forbidden')
    return item
  }

  @Post()
  @MinRole(Roles.ADMIN)
  create(@Body() body: CreateNotificationDto) {
    return this.svc.create({ ...body, publish: true })
  }

  @Patch(':id/read')
  @MinRole(Roles.SALESPERSON)
  read(@Param('id') id: string) {
    return this.svc.markRead(id)
  }

  @Patch(':id/unread')
  @MinRole(Roles.ADMIN)
  unread(@Param('id') id: string) {
    return this.svc.markUnread(id)
  }

  @Patch('me/read-all')
  @MinRole(Roles.SALESPERSON)
  readAll(@Req() req: Request) {
    const user = (req as any).user
    return this.svc.markAllReadForUser(user.id)
  }

  @Delete(':id')
  @MinRole(Roles.ADMIN)
  remove(@Param('id') id: string) {
    return this.svc.remove(id)
  }
}
