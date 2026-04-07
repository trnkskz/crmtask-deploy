import { Injectable } from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: { entityType: 'USER'|'LEAD'|'ACCOUNT'|'TASK'|'DEAL'|'TASKLIST'|'LOOKUP'; entityId: string; action: 'CREATE'|'UPDATE'|'DELETE'|'VIEW'; userId?: string|null; previousData?: any; newData?: any; ipAddress?: string|null; userAgent?: string|null }) {
    const { entityType, entityId, action, userId, previousData, newData, ipAddress, userAgent } = params
    return this.prisma.auditLog.create({ data: { entityType: entityType as any, entityId, action: action as any, userId: userId || null, previousData: previousData ?? null, newData: newData ?? null, ipAddress: ipAddress || null, userAgent: userAgent || null } })
  }

  async list(filter: { entityType?: string; entityId?: string; userId?: string; from?: string; to?: string; page?: number; limit?: number }) {
    const where: any = {}
    if (filter.entityType) where.entityType = filter.entityType as any
    if (filter.entityId) where.entityId = filter.entityId
    if (filter.userId) where.userId = filter.userId
    if (filter.from || filter.to) {
      where.createdAt = {}
      if (filter.from) where.createdAt.gte = new Date(filter.from)
      if (filter.to) where.createdAt.lte = new Date(filter.to)
    }
    const page = Number(filter.page || 1)
    const limit = Math.min(Number(filter.limit || 20), 100)
    const skip = (page - 1) * limit
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip }),
      this.prisma.auditLog.count({ where }),
    ])
    return { items, total, page, limit }
  }
}

