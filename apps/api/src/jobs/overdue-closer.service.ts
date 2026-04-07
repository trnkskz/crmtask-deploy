import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../infrastructure/prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'

@Injectable()
export class OverdueCloserService {
  private readonly logger = new Logger(OverdueCloserService.name)

  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  // Runs every minute in dev; you can change to DAILY at 01:00 later
  @Cron(CronExpression.EVERY_MINUTE)
  async closeOverdue() {
    const now = new Date()
    const overdue = await this.prisma.task.findMany({
      where: { generalStatus: 'OPEN', dueDate: { lt: now } },
      select: { id: true, accountId: true, ownerId: true },
      take: 100,
    })
    if (!overdue.length) return

    this.logger.log(`Auto-closing ${overdue.length} overdue tasks`)
    for (const t of overdue) {
      await this.prisma.$transaction([
        this.prisma.task.update({ where: { id: t.id }, data: { generalStatus: 'CLOSED' } }),
        this.prisma.activityHistory.create({
          data: { accountId: t.accountId, type: 'DUE_DATE_PASSED', summary: `Task ${t.id} auto-closed (due date passed)` },
        }),
      ])
      if (t.ownerId) {
        await this.notifications.createAndPublish({ taskId: t.id, toUserId: t.ownerId, message: 'Task due date passed and auto-closed' })
      }
    }
  }
}
