import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'
import { NotificationStreamService } from './stream.service'

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService, private stream: NotificationStreamService) {}

  async listForUser(userId: string, page = 1, limit = 50) {
    const take = Math.min(limit, 100)
    const skip = (page - 1) * take
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { toUserId: userId },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.notification.count({ where: { toUserId: userId } }),
    ])
    return { items, total, page, limit: take }
  }

  async listAll(filter: { toUserId?: string; unread?: boolean; page?: number; limit?: number }) {
    const where: any = {}
    if (filter.toUserId) where.toUserId = filter.toUserId
    if (filter.unread === true) where.readAt = null
    if (filter.unread === false) where.readAt = { not: null }

    const page = Number(filter.page || 1)
    const limit = Math.min(Number(filter.limit || 50), 100)
    const skip = (page - 1) * limit

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.notification.count({ where }),
    ])
    return { items, total, page, limit }
  }

  async detail(id: string) {
    const item = await this.prisma.notification.findUnique({ where: { id } })
    if (!item) throw new NotFoundException('Notification not found')
    return item
  }

  async markRead(id: string) {
    await this.detail(id)
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } })
  }

  async markUnread(id: string) {
    await this.detail(id)
    return this.prisma.notification.update({ where: { id }, data: { readAt: null } })
  }

  async markAllReadForUser(userId: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { toUserId: userId },
      data: { readAt: new Date() },
    })
    return { ok: true, updatedCount: updated.count }
  }

  async remove(id: string) {
    await this.detail(id)
    await this.prisma.notification.delete({ where: { id } })
    return { ok: true }
  }

  async create(data: { taskId: string; toUserId: string; message: string; publish?: boolean }) {
    const n = await this.prisma.notification.create({ data: { taskId: data.taskId, toUserId: data.toUserId, message: data.message } })
    if (data.publish !== false) {
      this.stream.publish(data.toUserId, { id: n.id, message: n.message, taskId: n.taskId })
    }
    return n
  }

  async createAndPublish(data: { taskId: string; toUserId: string; message: string }) {
    return this.create({ ...data, publish: true })
  }
}
