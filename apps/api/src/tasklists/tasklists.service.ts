import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'
import { CreateTaskListDto, TaskListQueryDto, TaskListTasksQueryDto, UpdateTaskListDto } from './dto/tasklist.dto'

@Injectable()
export class TaskListsService {
  constructor(private prisma: PrismaService) {}

  private async managerHasDirectSales(userId: string) {
    const count = await this.prisma.user.count({
      where: {
        isActive: true,
        role: 'SALESPERSON' as any,
        managerId: userId,
      },
    })
    return count > 0
  }

  private async getActorTeam(userId: string) {
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { team: true },
    })
    return String(actor?.team || '').trim()
  }

  list(q: TaskListQueryDto) {
    const where: any = {}
    if (q.tag) where.tag = q.tag
    if (q.isActive !== undefined) where.isActive = q.isActive
    if (q.pool === 'GENERAL') where.tasks = { some: { ownerId: null } }
    if (q.pool === 'ASSIGNED') where.tasks = { some: { ownerId: { not: null } } }
    if (q.pool === 'TEAM' && q.teamId) {
      where.tasks = {
        some: {
          owner: {
            is: {
              role: 'SALESPERSON',
              OR: [{ managerId: q.teamId }, { team: q.teamId }],
            },
          },
        },
      }
    }
    if (q.teamId && !where.tasks) {
      where.tasks = {
        some: {
          owner: {
            is: {
              role: 'SALESPERSON',
              OR: [{ managerId: q.teamId }, { team: q.teamId }],
            },
          },
        },
      }
    }

    return this.prisma.taskList.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { tasks: true } },
      },
    })
  }

  create(userId: string, dto: CreateTaskListDto) {
    return this.prisma.taskList.create({ data: { name: dto.name, tag: dto.tag, createdBy: userId, createdById: userId, description: dto.description ?? null } })
  }

  async detail(id: string) {
    const item = await this.prisma.taskList.findUnique({ where: { id } })
    if (!item) throw new NotFoundException('TaskList not found')
    return item
  }

  async update(id: string, dto: UpdateTaskListDto) {
    const exists = await this.prisma.taskList.findUnique({ where: { id } })
    if (!exists) throw new NotFoundException('TaskList not found')
    const data: any = {}
    if (dto.name !== undefined) data.name = dto.name
    if (dto.tag !== undefined) data.tag = dto.tag
    if (dto.description !== undefined) data.description = dto.description
    if (dto.isActive !== undefined) data.isActive = dto.isActive
    return this.prisma.taskList.update({ where: { id }, data })
  }

  async remove(id: string) {
    const exists = await this.prisma.taskList.findUnique({ where: { id } })
    if (!exists) throw new NotFoundException('TaskList not found')
    await this.prisma.taskList.delete({ where: { id } })
    return { ok: true }
  }

  async listPoolTasks(q: TaskListTasksQueryDto, user?: { id: string; role: string }) {
    const where: any = {}
    const teamOwnerScope = (teamId: string) =>
      ({
        is: {
          role: 'SALESPERSON',
          OR: [{ managerId: teamId }, { team: teamId }],
        },
      }) as any

    if (q.taskListId) where.taskListId = q.taskListId
    if (q.tag) where.taskList = { tag: q.tag as any }

    // Pool conventions
    if (q.pool === 'GENERAL') where.ownerId = null
    if (q.pool === 'ASSIGNED' && where.ownerId === undefined) where.ownerId = { not: null }
    if (q.pool === 'TEAM' && q.teamId) where.owner = teamOwnerScope(q.teamId)

    // Direct assignee/team filters
    if (q.assigneeId !== undefined) {
      if (q.assigneeId === 'null') where.ownerId = null
      else if (q.assigneeId) where.ownerId = q.assigneeId
    }
    if (q.teamId && q.pool !== 'TEAM' && where.ownerId !== null) where.owner = teamOwnerScope(q.teamId)

    // Status filter (single or comma list)
    if (q.status) {
      const statuses = String(q.status).split(',').map((s) => s.trim()).filter(Boolean)
      if (statuses.length === 1) where.status = statuses[0]
      if (statuses.length > 1) where.status = { in: statuses as any }
    }

    if (q.createdFrom || q.createdTo) {
      where.creationDate = {}
      if (q.createdFrom) where.creationDate.gte = new Date(q.createdFrom)
      if (q.createdTo) {
        const toDate = new Date(q.createdTo)
        toDate.setHours(23, 59, 59, 999)
        where.creationDate.lte = toDate
      }
    }

    // Role-based scope
    if (user) {
      if (user.role === 'SALESPERSON') {
        where.ownerId = user.id
      } else if (user.role === 'MANAGER') {
        const hasDirectSales = await this.managerHasDirectSales(user.id)
        if (!(where.ownerId === null)) {
          where.OR = [
            { owner: { is: hasDirectSales ? { managerId: user.id, role: 'SALESPERSON' } : { role: 'SALESPERSON' } } as any },
            { historicalAssignee: { not: null } },
          ]
        }
      } else if (user.role === 'TEAM_LEADER') {
        const actorTeam = await this.getActorTeam(user.id)
        if (!(where.ownerId === null)) {
          where.OR = actorTeam
            ? [
                { owner: { is: { team: actorTeam, role: 'SALESPERSON' } } as any },
                { historicalAssignee: { not: null } },
              ]
            : [{ historicalAssignee: { not: null } }]
        }
      }
    }

    const page = Number(q.page || 1)
    const limit = Math.min(Number(q.limit || 20), 100)
    const skip = (page - 1) * limit

    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        orderBy: { creationDate: 'desc' },
        take: limit,
        skip,
        include: {
          taskList: { select: { id: true, name: true, tag: true } },
          account: { select: { id: true, accountName: true } },
          owner: { select: { id: true, name: true, email: true, managerId: true, team: true, role: true } },
          logs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { reason: true, followUpDate: true, text: true, createdAt: true },
          },
        },
      }),
      this.prisma.task.count({ where }),
    ])

    return { items, total, page, limit }
  }
}
