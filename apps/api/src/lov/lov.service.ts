import { Injectable } from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'

@Injectable()
export class LovService {
  constructor(private prisma: PrismaService) {}

  async list(type: string, code?: string) {
    if (!type) return []
    // Special handling for hierarchical DISTRICT by CITY label
    if (type === 'DISTRICT' && code) {
      // 1) Try parent relation (CITY by label)
      const city = await this.prisma.lookup.findFirst({ where: { type: 'CITY', label: code, active: true } })
      if (city) {
        const items = await this.prisma.lookup.findMany({ where: { type: 'DISTRICT', active: true, parentId: city.id }, orderBy: { label: 'asc' }, take: 2000 })
        if (items.length) return items.map((i: any) => ({ code: i.code, label: i.label }))
      }
      // 2) Legacy fallback: code column match (if data seeded with code)
      const legacy = await this.prisma.lookup.findMany({ where: { type: 'DISTRICT', active: true, code }, orderBy: { label: 'asc' }, take: 2000 })
      if (legacy.length) return legacy.map((i: any) => ({ code: i.code, label: i.label }))
      // 3) Final fallback: return all active districts (avoid empty UI)
      const all = await this.prisma.lookup.findMany({ where: { type: 'DISTRICT', active: true }, orderBy: { label: 'asc' }, take: 2000 })
      return all.map((i: any) => ({ code: i.code, label: i.label }))
    }
    // Default (CITY, MAIN/SUB, others)
    const where: any = { type, active: true }
    if (code) where.code = code
    const items = await this.prisma.lookup.findMany({ where, orderBy: { label: 'asc' }, take: 2000 })
    return items.map((i: any) => ({ code: i.code, label: i.label }))
  }

  enums() {
    return {
      TaskCategory: ['ISTANBUL_CORE','ANADOLU_CORE','TRAVEL'],
      TaskType: ['GENERAL','PROJECT'],
      TaskPriority: ['LOW','MEDIUM','HIGH','CRITICAL'],
      AccountType: ['KEY','LONG_TAIL'],
      AccountSource: ['QUERY','FRESH','RAKIP','OLD_RAKIP','REFERANS','OLD'],
      AccountStatus: ['ACTIVE','PASSIVE'],
      TaskStatus: ['NEW','HOT','NOT_HOT','FOLLOWUP','DEAL','COLD'],
      GeneralStatus: ['OPEN','CLOSED']
    }
  }

  async lookups() {
    const [cities, mains, enums] = await Promise.all([
      this.list('CITY'),
      this.listCategories('TREE'),
      Promise.resolve(this.enums()),
    ])
    return { cities, categories: mains, enums }
  }

  async listCategories(mode: 'TREE'|'MAIN'|'SUB' = 'TREE') {
    // Prefer dedicated CategoryMain/Sub tables; fallback to Lookup if not migrated
    try {
      if (mode === 'MAIN') {
        return this.prisma.categoryMain.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { label: 'asc' }] })
      }
      if (mode === 'SUB') {
        return this.prisma.categorySub.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { label: 'asc' }] })
      }
      const mains = await this.prisma.categoryMain.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { label: 'asc' }], include: { subs: { where: { active: true }, orderBy: [{ order: 'asc' }, { label: 'asc' }] } } })
      return mains.map((m: any) => ({ id: m.id, label: m.label, active: m.active, order: m.order, children: (m.subs||[]).map((s: any)=> ({ id: s.id, label: s.label, active: s.active, order: s.order })) }))
    } catch {
      // Fallback to Lookup
      if (mode === 'MAIN') {
        return this.prisma.lookup.findMany({ where: { type: 'MAIN_CATEGORY', active: true }, orderBy: [{ order: 'asc' }, { label: 'asc' }] })
      }
      if (mode === 'SUB') {
        return this.prisma.lookup.findMany({ where: { type: 'SUB_CATEGORY', active: true }, orderBy: [{ order: 'asc' }, { label: 'asc' }] })
      }
      const mains = await this.prisma.lookup.findMany({ where: { type: 'MAIN_CATEGORY', active: true }, orderBy: [{ order: 'asc' }, { label: 'asc' }] })
      const subs = await this.prisma.lookup.findMany({ where: { type: 'SUB_CATEGORY', active: true }, orderBy: [{ order: 'asc' }, { label: 'asc' }] })
      const byParent = (subs as any[]).reduce((acc: Record<string, any[]>, s: any) => { const pid = s.parentId || ''; (acc[pid] ||= []).push(s); return acc }, {} as Record<string, any[]>)
      return mains.map((m: any) => ({ ...m, children: byParent[m.id] || [] }))
    }
  }

  async createCategory(body: { name: string; type: 'MAIN'|'SUB'; parentId?: string; order?: number; active?: boolean }) {
    if (!body?.name) throw new Error('name required')
    if (body.type === 'MAIN') {
      return this.prisma.categoryMain.create({
        data: { label: body.name, active: body.active ?? true, order: body.order ?? 0 },
      })
    }
    if (!body.parentId) throw new Error('parentId required for SUB')
    const parent = await this.prisma.categoryMain.findUnique({ where: { id: body.parentId } })
    if (!parent) throw new Error('parent main category not found')
    return this.prisma.categorySub.create({
      data: { categoryMainId: body.parentId, label: body.name, active: body.active ?? true, order: body.order ?? 0 },
    })
  }

  async updateCategory(id: string, body: Partial<{ name: string; parentId?: string|null; order?: number; active?: boolean }>) {
    const main = await this.prisma.categoryMain.findUnique({ where: { id } })
    if (main) {
      return this.prisma.categoryMain.update({
        where: { id },
        data: {
          label: body.name ?? undefined,
          order: body.order ?? undefined,
          active: body.active ?? undefined,
        },
      })
    }

    const sub = await this.prisma.categorySub.findUnique({ where: { id } })
    if (!sub) throw new Error('category not found')

    if (body.parentId !== undefined && body.parentId !== null) {
      const parent = await this.prisma.categoryMain.findUnique({ where: { id: body.parentId } })
      if (!parent) throw new Error('parent main category not found')
    }

    return this.prisma.categorySub.update({
      where: { id },
      data: {
        label: body.name ?? undefined,
        categoryMainId: body.parentId ?? undefined,
        order: body.order ?? undefined,
        active: body.active ?? undefined,
      },
    })
  }

  async deleteCategory(id: string) {
    const main = await this.prisma.categoryMain.findUnique({ where: { id } })
    if (main) {
      await this.prisma.$transaction([
        this.prisma.categoryMain.update({ where: { id }, data: { active: false } }),
        this.prisma.categorySub.updateMany({ where: { categoryMainId: id }, data: { active: false } }),
      ])
      return { ok: true }
    }
    const sub = await this.prisma.categorySub.findUnique({ where: { id } })
    if (!sub) throw new Error('category not found')
    await this.prisma.categorySub.update({ where: { id }, data: { active: false } })
    return { ok: true }
  }
}
