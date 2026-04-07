import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'
import { hashPassword } from '../security/token.util'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private hasLegacyProfileFieldError(error: any) {
    const msg = String(error?.message || '')
    return /User\.(team|phone|settings)/i.test(msg) || /Unknown (argument|field).*(team|phone|settings)/i.test(msg)
  }

  private normalizeLegacyUser(user: any) {
    if (!user) return user
    return {
      ...user,
      team: user.team ?? null,
      phone: user.phone ?? null,
      settings: user.settings ?? null,
    }
  }

  private async listUsersWithFallback(where: any) {
    try {
      return await this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          managerId: true,
          twoFactorEnabled: true,
          team: true,
          phone: true,
          settings: true,
        },
        take: 200,
      })
    } catch (e: any) {
      if (!this.hasLegacyProfileFieldError(e)) throw e
      const users = await this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          managerId: true,
          twoFactorEnabled: true,
        },
        take: 200,
      })
      return users.map((user) => this.normalizeLegacyUser(user))
    }
  }

  private async createUserWithFallback(data: any) {
    try {
      return await this.prisma.user.create({
        data,
        select: { id: true, email: true, role: true, name: true, managerId: true, team: true, phone: true, settings: true, isActive: true },
      })
    } catch (e: any) {
      if (!this.hasLegacyProfileFieldError(e)) throw e
      const fallbackData = { ...data }
      delete fallbackData.team
      delete fallbackData.phone
      delete fallbackData.settings
      const user = await this.prisma.user.create({
        data: fallbackData,
        select: { id: true, email: true, role: true, name: true, managerId: true, isActive: true },
      })
      return this.normalizeLegacyUser(user)
    }
  }

  private async updateUserWithFallback(id: string, data: any) {
    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        select: { id: true, email: true, role: true, name: true, managerId: true, team: true, phone: true, settings: true, isActive: true },
      })
    } catch (e: any) {
      if (!this.hasLegacyProfileFieldError(e)) throw e
      const fallbackData = { ...data }
      delete fallbackData.team
      delete fallbackData.phone
      delete fallbackData.settings
      const user = await this.prisma.user.update({
        where: { id },
        data: fallbackData,
        select: { id: true, email: true, role: true, name: true, managerId: true, isActive: true },
      })
      return this.normalizeLegacyUser(user)
    }
  }

  async list(includeInactive = false, current?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' }) {
    const base = includeInactive
      ? {
          NOT: [
            { id: 'dev-user' },
            { email: 'dev@example.com' },
          ],
        }
      : {
          isActive: true,
          NOT: [
            { id: 'dev-user' },
            { email: 'dev@example.com' },
          ],
        }
    let where: any = base
    if (current?.role === 'MANAGER') {
      // Manager sees only self and own salespersons
      where = { ...base, OR: [ { id: current.id }, { role: 'SALESPERSON', managerId: current.id } ] }
    }
    if (current?.role === 'TEAM_LEADER') {
      const actor = await this.prisma.user.findUnique({
        where: { id: current.id },
        select: { team: true },
      })
      const actorTeam = String(actor?.team || '').trim()
      where = actorTeam
        ? { ...base, OR: [ { id: current.id }, { role: 'SALESPERSON', team: actorTeam } ] }
        : { ...base, id: current.id }
    }
    return this.listUsersWithFallback(where)
  }

  async create(body: { email: string; name?: string; role?: string; password?: string; managerId?: string; team?: string; phone?: string; settings?: Record<string, any> }) {
    if (!body.email) throw new BadRequestException('email required')
    const existing = await this.prisma.user.findUnique({ where: { email: body.email } })
    if (existing) throw new BadRequestException('email already exists')
    const password = body.password ? await hashPassword(body.password) : null
    if ((body.role as any) === 'SALESPERSON' && !body.managerId) throw new BadRequestException('managerId required for SALESPERSON')
    try {
      const data: any = {
        email: body.email,
        name: body.name || null,
        role: (body.role as any) || 'SALESPERSON',
        password,
        team: body.team || null,
        phone: body.phone || null,
        settings: body.settings ?? null,
      }
      // Include managerId only if provided to avoid schema mismatch before migration
      if (body.managerId !== undefined) data.managerId = body.managerId
      return await this.createUserWithFallback(data)
    } catch (e:any) {
      const msg = String(e?.message || '')
      if (/Unknown (argument|field).*managerId/i.test(msg)) {
        throw new BadRequestException('User hierarchy is not migrated. Please run Prisma migrate to add managerId.')
      }
      throw e
    }
  }

  async update(id: string, body: any) {
    const u = await this.prisma.user.findUnique({ where: { id } })
    if (!u) throw new NotFoundException('user not found')
    const data: any = {}
    const fields = ['name','firstName','lastName','isActive','phone','team']
    for (const f of fields) if (body[f] !== undefined) data[f] = body[f]
    if (body.settings !== undefined) data.settings = body.settings
    if (body.role !== undefined) data.role = body.role as any
    if (body.managerId !== undefined) data.managerId = body.managerId || null
    if (body.email !== undefined) data.email = body.email
    return this.updateUserWithFallback(id, data)
  }

  async changeRole(id: string, role: string, managerId?: string) {
    const u = await this.prisma.user.findUnique({ where: { id } })
    if (!u) throw new NotFoundException('user not found')
    if ((role as any) === 'SALESPERSON' && !(u as any).managerId && !managerId) throw new BadRequestException('managerId required for SALESPERSON')
    try {
      return await this.updateUserWithFallback(id, { role: role as any, ...(managerId !== undefined ? { managerId } : {}) })
    } catch (e:any) {
      const msg = String(e?.message || '')
      if (/Unknown (argument|field).*managerId/i.test(msg)) {
        throw new BadRequestException('User hierarchy is not migrated. Please run Prisma migrate to add managerId.')
      }
      throw e
    }
  }

  async deactivate(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } })
    if (!u) throw new NotFoundException('user not found')
    return this.updateUserWithFallback(id, { isActive: false })
  }

  async remove(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } })
    if (!u) throw new NotFoundException('user not found')

    await this.prisma.refreshToken.deleteMany({ where: { userId: id } })
    return this.prisma.user.delete({
      where: { id },
      select: { id: true, email: true, role: true, name: true },
    })
  }

  async transferAndDeactivate(id: string, targetOwnerId: string, isDelete: boolean = false) {
    const u = await this.prisma.user.findUnique({ where: { id } })
    if (!u) throw new NotFoundException('Source user not found')
    
    const target = await this.prisma.user.findUnique({ where: { id: targetOwnerId } })
    if (!target) throw new NotFoundException('Target user not found')

    return this.prisma.$transaction(async (tx) => {
      // Transfer tasks (only open ones, or all?) Normally we should transfer all active ones
      // Since it's a structural clean, let's transfer ALL to ensure no orphaned tasks!
      const transferredCount = await tx.task.updateMany({
        where: { ownerId: id },
        data: { ownerId: targetOwnerId }
      });

      let userResult;
      if (isDelete) {
        await tx.refreshToken.deleteMany({ where: { userId: id } });
        userResult = await tx.user.delete({ where: { id } });
      } else {
        userResult = await tx.user.update({
          where: { id },
          data: { isActive: false }
        });
      }

      return { transferredCount: transferredCount.count, user: userResult };
    });
  }

  async setPassword(id: string, password: string) {
    const u = await this.prisma.user.findUnique({ where: { id } })
    if (!u) throw new NotFoundException('user not found')
    const hashed = await hashPassword(password)
    await this.prisma.user.update({ where: { id }, data: { password: hashed } as any })
    return { ok: true }
  }
}
