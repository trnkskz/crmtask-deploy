import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  private normalizeArchiveAssignee(name: string, activeUsers: string[]) {
    if (!name) return 'Sistem (Arşiv)'
    let clean = name.trim()
    clean = clean.toLocaleLowerCase('tr-TR').replace(/(?:^|\s)\S/g, (a) => a.toLocaleUpperCase('tr-TR'))

    const exact = activeUsers.find((u) => u.toLocaleLowerCase('tr-TR') === clean.toLocaleLowerCase('tr-TR'))
    if (exact) return exact

    const mapTr: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' }
    const noTr = (s: string) =>
      s
        .toLocaleLowerCase('tr-TR')
        .replace(/[çğıiöşü]/g, (m) => mapTr[m] || m)
        .replace(/[^a-z0-9]/g, '')

    const targetNoTr = noTr(clean)
    for (const activeUser of activeUsers) {
      if (noTr(activeUser) === targetNoTr) return activeUser
    }

    const dictionary: Record<string, string> = {
      'esra cali': 'Esra Çalı',
      'fatos madendere': 'Fatoş Madendere',
      'fatma balci': 'Fatma Balcı',
    }
    return dictionary[clean.toLocaleLowerCase('tr-TR')] || clean
  }

  async wipeData() {
    await this.prisma.activityLog.deleteMany();
    await this.prisma.offer.deleteMany();
    await this.prisma.taskContact.deleteMany();
    await this.prisma.task.deleteMany();
    await this.prisma.project.deleteMany();
    await this.prisma.accountNote.deleteMany();
    await this.prisma.accountContact.deleteMany();
    await this.prisma.account.deleteMany();
    return { success: true, message: 'İşletme, Görev ve Proje verileri sıfırlandı.' };
  }

  async factoryReset() {
    await this.wipeData();
    await this.prisma.notification.deleteMany();
    await this.prisma.activityHistory.deleteMany();
    await this.prisma.dealHistory.deleteMany();
    await this.prisma.deal.deleteMany();
    await this.prisma.lead.deleteMany();
    await this.prisma.auditLog.deleteMany();
    await this.prisma.taskList.deleteMany();
    
    // Non-admin kullanıcıları temizle
    await this.prisma.user.deleteMany({
      where: { role: { not: 'ADMIN' } }
    });
    
    return { success: true, message: 'Sistem fabrika ayarlarına döndürüldü.' };
  }

  async fixPastRecordDates() {
    const tasks = await this.prisma.task.findMany({
      include: {
        logs: {
          where: { text: { contains: '[Geçmiş Kayıt]' } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, text: true, createdAt: true },
        },
      },
    })

    const currentYear = new Date().getFullYear()
    let updatedCount = 0

    for (const task of tasks) {
      const archiveLog = task.logs[0]
      if (!archiveLog) continue

      const dateMatch = String(archiveLog.text || '').match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
      let parsedDate: Date | null = null
      if (dateMatch) {
        const d = dateMatch[1].padStart(2, '0')
        const m = dateMatch[2].padStart(2, '0')
        const y = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : (dateMatch[3].length === 4 ? dateMatch[3] : '2024')
        const year = Number(y)
        const month = Number(m)
        const day = Number(d)

        if (year >= 2000 && year <= currentYear && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          const candidate = new Date(`${y}-${m}-${d}T12:00:00.000Z`)
          if (
            !Number.isNaN(candidate.getTime()) &&
            candidate.getUTCFullYear() === year &&
            candidate.getUTCMonth() === month - 1 &&
            candidate.getUTCDate() === day
          ) {
            parsedDate = candidate
          }
        } else {
          parsedDate = new Date('2000-01-01T12:00:00.000Z')
        }
      } else if (task.creationDate.getUTCFullYear() >= currentYear) {
        parsedDate = new Date('2000-01-01T12:00:00.000Z')
      }

      if (!parsedDate || Number.isNaN(parsedDate.getTime())) continue
      if (task.creationDate.getTime() === parsedDate.getTime() && archiveLog.createdAt.getTime() === parsedDate.getTime()) continue

      await this.prisma.$transaction([
        this.prisma.task.update({
          where: { id: task.id },
          data: { creationDate: parsedDate },
        }),
        this.prisma.activityLog.update({
          where: { id: archiveLog.id },
          data: { createdAt: parsedDate },
        }),
      ])
      updatedCount += 1
    }

    return { success: true, updatedCount }
  }

  async cleanArchiveAssignees() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { name: true },
    })
    const activeUsers = users.map((u) => String(u.name || '').trim()).filter(Boolean)
    const tasks = await this.prisma.task.findMany({
      where: { historicalAssignee: { not: null } },
      select: { id: true, historicalAssignee: true },
    })

    let updatedCount = 0
    for (const task of tasks) {
      const current = String(task.historicalAssignee || '').trim()
      if (!current) continue
      const normalized = this.normalizeArchiveAssignee(current, activeUsers)
      if (normalized === current) continue
      await this.prisma.task.update({
        where: { id: task.id },
        data: { historicalAssignee: normalized },
      })
      updatedCount += 1
    }

    return { success: true, updatedCount }
  }

  async deleteAdminTestData() {
    const adminUsers = await this.prisma.user.findMany({
      where: {
        OR: [
          { role: 'ADMIN' as any },
          { email: { contains: 'admin', mode: 'insensitive' } },
          { name: { contains: 'admin', mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    })
    const adminIds = adminUsers.map((u) => u.id)
    if (adminIds.length === 0) return { success: true, updatedTaskCount: 0, deletedLogCount: 0, deletedOfferCount: 0 }

    const [adminLogs, adminOffers, assignedTasks] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        where: {
          authorId: { in: adminIds },
          NOT: { text: { contains: '[Geçmiş Kayıt]' } },
          task: {
            taskList: {
              isActive: true,
            },
          },
        },
        select: { id: true, taskId: true },
      }),
      this.prisma.offer.findMany({
        where: {
          createdById: { in: adminIds },
          task: {
            taskList: {
              isActive: true,
            },
          },
        },
        select: { id: true, taskId: true, activityLogId: true },
      }),
      this.prisma.task.findMany({
        where: {
          ownerId: { in: adminIds },
          taskList: {
            isActive: true,
          },
        },
        select: { id: true },
      }),
    ])

    const impactedTaskIds = Array.from(new Set([
      ...adminLogs.map((log) => log.taskId),
      ...adminOffers.map((offer) => offer.taskId),
      ...assignedTasks.map((task) => task.id),
    ]))

    if (adminLogs.length > 0) {
      await this.prisma.offer.deleteMany({ where: { activityLogId: { in: adminLogs.map((log) => log.id) } } })
      await this.prisma.activityLog.deleteMany({ where: { id: { in: adminLogs.map((log) => log.id) } } })
    }

    const orphanOfferIds = adminOffers
      .filter((offer) => !offer.activityLogId)
      .map((offer) => offer.id)
    if (orphanOfferIds.length > 0) {
      await this.prisma.offer.deleteMany({ where: { id: { in: orphanOfferIds } } })
    }

    if (assignedTasks.length > 0) {
      await this.prisma.task.updateMany({
        where: { id: { in: assignedTasks.map((task) => task.id) } },
        data: {
          ownerId: null,
          durationDays: null,
          assignmentDate: null,
          dueDate: null,
          poolTeam: 'GENERAL' as any,
        },
      })
    }

    if (impactedTaskIds.length > 0) {
      await this.prisma.task.updateMany({
        where: {
          id: { in: impactedTaskIds },
          status: { in: ['DEAL', 'HOT', 'COLD'] as any },
        },
        data: {
          status: 'NOT_HOT' as any,
          generalStatus: 'OPEN' as any,
          closedAt: null,
          closedReason: null,
        },
      })
    }

    return {
      success: true,
      updatedTaskCount: impactedTaskIds.length,
      deletedLogCount: adminLogs.length,
      deletedOfferCount: adminOffers.length,
    }
  }

  // Roles
  listRoles() { return this.prisma.appRole.findMany({ include: { permissions: { include: { permission: true } } } }) }
  async createRole(name: string) { if (!name) throw new BadRequestException('name required'); return this.prisma.appRole.create({ data: { name } }) }

  // Permissions
  listPermissions() { return this.prisma.permission.findMany() }
  async createPermission(body: { name: string; module: string; description?: string }) {
    if (!body?.name) throw new BadRequestException('name required')
    return this.prisma.permission.create({ data: { name: body.name, module: body.module, description: body.description || null } })
  }

  async attachPermission(roleId: string, permissionId: string) {
    const role = await this.prisma.appRole.findUnique({ where: { id: roleId } })
    if (!role) throw new NotFoundException('role not found')
    const perm = await this.prisma.permission.findUnique({ where: { id: permissionId } })
    if (!perm) throw new NotFoundException('permission not found')
    return this.prisma.rolePermission.create({ data: { roleId, permissionId } })
  }

  // Assign role to user
  async assignRoleToUser(userId: string, roleId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('user not found')
    const role = await this.prisma.appRole.findUnique({ where: { id: roleId } })
    if (!role) throw new NotFoundException('role not found')
    return this.prisma.user.update({ where: { id: userId }, data: { appRoleId: roleId } })
  }
}
