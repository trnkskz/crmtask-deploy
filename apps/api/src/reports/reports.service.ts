import { Injectable } from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'

function toCsv(rows: any[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: any) => {
    if (v == null) return ''
    const s = String(v)
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  return [headers.join(','), ...rows.map(r => headers.map(h => esc((r as any)[h])).join(','))].join('\n')
}

function resolveCanonicalCategory(mainCategory: string, subCategory: string, companyName = '') {
  const rawMain = String(mainCategory || '').trim()
  const rawSub = String(subCategory || '').trim()
  const textForMatch = `${rawMain} ${rawSub} ${companyName}`.toLocaleLowerCase('tr-TR')
  const fuzzyMatch = textForMatch
    .replace(/[ç]/g, 'c')
    .replace(/[ğ]/g, 'g')
    .replace(/[ı]/g, 'i')
    .replace(/[ö]/g, 'o')
    .replace(/[ş]/g, 's')
    .replace(/[ü]/g, 'u')

  let resolvedMain = rawMain || 'Diğer'
  let resolvedSub = rawSub || 'Belirtilmemiş'

  if (/masaj|spa|hamam|kese|wellness|refleksoloji|shiatsu/i.test(textForMatch)) {
    resolvedMain = 'Masaj - Spa (Core)'
    if (/bali/i.test(textForMatch)) resolvedSub = 'Bali Masajı'
    else if (/thai/i.test(textForMatch)) resolvedSub = 'Thai Masajı'
    else if (/isveç|isvec/i.test(fuzzyMatch)) resolvedSub = 'İsveç Masajı'
    else if (/köpük|kopuk|hamam/i.test(fuzzyMatch)) resolvedSub = 'Hamam'
    else if (/çift|cift/i.test(fuzzyMatch)) resolvedSub = 'Çift Masajı'
    else if (/otel/i.test(textForMatch)) resolvedSub = 'Otel Spa'
    else if (/aroma/i.test(textForMatch)) resolvedSub = 'Aromaterapi Masajı'
    else if (/bebek/i.test(textForMatch)) resolvedSub = 'Bebek Spa'
    else resolvedSub = 'Masaj'
  } else if (/kahvaltı|brunch|kahvalti/i.test(fuzzyMatch)) {
    resolvedMain = 'Kahvaltı (Core)'
    if (/serpme/i.test(textForMatch)) resolvedSub = 'Serpme Kahvaltı'
    else if (/açık büfe|acik bufe/i.test(fuzzyMatch)) resolvedSub = 'Açık Büfe Kahvaltı'
    else if (/köy|koy/i.test(fuzzyMatch)) resolvedSub = 'Köy Kahvaltısı'
    else if (/boğaz|bogaz/i.test(fuzzyMatch)) resolvedSub = 'Boğazda Kahvaltı'
    else if (/tekne/i.test(textForMatch)) resolvedSub = 'Teknede Kahvaltı'
    else if (/otel/i.test(textForMatch)) resolvedSub = 'Otelde Kahvaltı'
    else if (/brunch/i.test(textForMatch)) resolvedSub = 'Brunch'
    else resolvedSub = 'Kahvaltı Tabağı'
  } else if (/(iftar|ramazan)/i.test(textForMatch) && !/bayram/i.test(textForMatch)) {
    resolvedMain = 'İftar (Core)'
    if (/avrupa/i.test(textForMatch)) resolvedSub = 'Avrupa Yakası İftar'
    else if (/anadolu/i.test(textForMatch)) resolvedSub = 'Anadolu Yakası İftar'
    else if (/açık büfe|acik bufe/i.test(fuzzyMatch)) resolvedSub = 'Açık Büfe İftar'
    else if (/tekne/i.test(textForMatch)) resolvedSub = 'Teknede İftar'
    else if (/otel/i.test(textForMatch)) resolvedSub = 'Otelde İftar'
    else resolvedSub = 'Restoranda İftar'
  }

  return { mainCategory: resolvedMain, subCategory: resolvedSub }
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private async taskScope(user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' }) {
    const taskScope: any = {}
    if (user?.role === 'SALESPERSON') taskScope.ownerId = user.id
    if (user?.role === 'MANAGER') taskScope.owner = { managerId: user.id, role: 'SALESPERSON' } as any
    if (user?.role === 'TEAM_LEADER') {
      const actor = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { team: true },
      })
      const actorTeam = String(actor?.team || '').trim()
      if (actorTeam) taskScope.owner = { team: actorTeam, role: 'SALESPERSON' } as any
      else taskScope.ownerId = '__NO_TEAM_SCOPE__'
    }
    return taskScope
  }

  private dateWhere(field: string, range?: { from?: string; to?: string }) {
    if (!range?.from && !range?.to) return {}
    const where: any = { [field]: {} }
    if (range?.from) where[field].gte = new Date(range.from)
    if (range?.to) {
      const toDate = new Date(range.to)
      toDate.setHours(23, 59, 59, 999)
      where[field].lte = toDate
    }
    return where
  }

  async summary(user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' }, range?: { from?: string; to?: string }) {
    const taskScope = await this.taskScope(user)
    const taskDateWhere = this.dateWhere('creationDate', range)
    const leadDateWhere = this.dateWhere('createdAt', range)
    const accountDateWhere = this.dateWhere('creationDate', range)
    const dealDateWhere = this.dateWhere('createdAt', range)
    const dealScope: any = {}
    if (user?.role === 'SALESPERSON') dealScope.task = { ownerId: user.id }
    if (user?.role === 'MANAGER') dealScope.task = { owner: { managerId: user.id, role: 'SALESPERSON' } }
    if (user?.role === 'TEAM_LEADER') {
      const actor = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { team: true },
      })
      const actorTeam = String(actor?.team || '').trim()
      dealScope.task = actorTeam ? { owner: { team: actorTeam, role: 'SALESPERSON' } } : { ownerId: '__NO_TEAM_SCOPE__' }
    }

    const [leadCount, accountCount, openTasks, closedTasks, byStatus, dealsByStatus, leadsByWorkflow, accountsByStatus] = await this.prisma.$transaction([
      this.prisma.lead.count({ where: { ...leadDateWhere } }),
      this.prisma.account.count({ where: { ...accountDateWhere } }),
      this.prisma.task.count({ where: { ...taskScope, ...taskDateWhere, generalStatus: 'OPEN' } }),
      this.prisma.task.count({ where: { ...taskScope, ...taskDateWhere, generalStatus: 'CLOSED' } }),
      this.prisma.task.groupBy({ by: ['status'], _count: { status: true }, where: { ...taskScope, ...taskDateWhere }, orderBy: { status: 'asc' } as any }),
      this.prisma.deal.groupBy({ by: ['status'], _count: { status: true }, where: { ...dealScope, ...dealDateWhere }, orderBy: { status: 'asc' } }),
      this.prisma.lead.groupBy({ by: ['workflowStatus'], _count: { workflowStatus: true }, where: { ...leadDateWhere }, orderBy: { workflowStatus: 'asc' } }),
      this.prisma.account.groupBy({ by: ['status'], _count: { status: true }, where: { ...accountDateWhere }, orderBy: { status: 'asc' } }),
    ])
    // Build simple per-day trends (leads.createdAt, tasks.creationDate)
    // Determine window: selected range or last 14 days
    const today = new Date()
    // Default trend window: last 7 days (inclusive)
    const startDefault = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()-6))
    const startAt = range?.from ? new Date(range.from) : startDefault
    const endAt = range?.to ? new Date(range.to) : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    // Normalize to 00:00 UTC boundaries
    const startDay = new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate()))
    const endDay = new Date(Date.UTC(endAt.getUTCFullYear(), endAt.getUTCMonth(), endAt.getUTCDate()))
    const leadRows = await this.prisma.lead.findMany({ where: { createdAt: { gte: startDay, lte: new Date(endDay.getTime() + 86400000 - 1) } }, select: { createdAt: true }, take: 50000 })
    const taskRows = await this.prisma.task.findMany({ where: { creationDate: { gte: startDay, lte: new Date(endDay.getTime() + 86400000 - 1) }, ...taskScope }, select: { creationDate: true }, take: 50000 })
    const days: string[] = []
    const leadsPer: Record<string, number> = {}
    const tasksPer: Record<string, number> = {}
    for (let d = new Date(startDay); d <= endDay; d = new Date(d.getTime() + 86400000)) {
      const key = d.toISOString().slice(0,10)
      days.push(key); leadsPer[key] = 0; tasksPer[key] = 0
    }
    for (const r of leadRows) { const key = new Date(r.createdAt).toISOString().slice(0,10); if (key in leadsPer) leadsPer[key]++ }
    for (const r of taskRows) { const key = new Date(r.creationDate).toISOString().slice(0,10); if (key in tasksPer) tasksPer[key]++ }
    // Descending order (latest first)
    const daysAsc = days
    const leadsAsc = daysAsc.map(d=> leadsPer[d]||0)
    const tasksAsc = daysAsc.map(d=> tasksPer[d]||0)
    const daysDesc = [...daysAsc].reverse()
    const leadsDesc = [...leadsAsc].reverse()
    const tasksDesc = [...tasksAsc].reverse()
    const trends = { days: daysDesc, leads: leadsDesc, tasks: tasksDesc }

    return {
      leads: { total: leadCount, byWorkflowStatus: leadsByWorkflow },
      accounts: { total: accountCount, byStatus: accountsByStatus },
      tasks: { open: openTasks, closed: closedTasks, byStatus },
      deals: { byStatus: dealsByStatus },
      trends,
    }
  }

  async performance(user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' }, range?: { from?: string; to?: string }) {
    const taskScope = await this.taskScope(user)
    const taskDateWhere = this.dateWhere('creationDate', range)
    const where = { ...taskScope, ...taskDateWhere }

    const [totalTasks, closedTasks, openTasks, allByOwner, closedByOwner] = await this.prisma.$transaction([
      this.prisma.task.count({ where }),
      this.prisma.task.count({ where: { ...where, generalStatus: 'CLOSED' } }),
      this.prisma.task.count({ where: { ...where, generalStatus: 'OPEN' } }),
      this.prisma.task.groupBy({ by: ['ownerId'], where, _count: { ownerId: true }, orderBy: { ownerId: 'asc' } as any }),
      this.prisma.task.groupBy({ by: ['ownerId'], where: { ...where, generalStatus: 'CLOSED' }, _count: { ownerId: true }, orderBy: { ownerId: 'asc' } as any }),
    ])

    const ownerIds = Array.from(
      new Set(allByOwner.map(r => r.ownerId).filter((id): id is string => Boolean(id))),
    )
    const owners = ownerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : []
    const ownerMap = new Map(owners.map(o => [o.id, o]))
    const closedMap = new Map(
      (closedByOwner as any[]).map(r => [r.ownerId ?? 'UNASSIGNED', r?._count?.ownerId ?? 0]),
    )

    const users = (allByOwner as any[])
      .map(row => {
        const key = row.ownerId ?? 'UNASSIGNED'
        const closed = closedMap.get(key) ?? 0
        const total = row?._count?.ownerId ?? 0
        const profile = row.ownerId ? ownerMap.get(row.ownerId) : undefined
        return {
          ownerId: row.ownerId,
          name: profile ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() || profile.email : 'Unassigned',
          email: profile?.email ?? '',
          totalTasks: total,
          closedTasks: closed,
          openTasks: total - closed,
          conversionRate: total ? Number(((closed / total) * 100).toFixed(2)) : 0,
        }
      })
      .sort((a, b) => b.totalTasks - a.totalTasks)

    return {
      totals: {
        totalTasks,
        openTasks,
        closedTasks,
        conversionRate: totalTasks ? Number(((closedTasks / totalTasks) * 100).toFixed(2)) : 0,
      },
      users,
    }
  }

  async taskStatus(user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' }, range?: { from?: string; to?: string }) {
    const taskScope = await this.taskScope(user)
    const taskDateWhere = this.dateWhere('creationDate', range)
    const where = { ...taskScope, ...taskDateWhere }

    const [byStatus, byGeneralStatus, total] = await this.prisma.$transaction([
      this.prisma.task.groupBy({ by: ['status'], where, _count: { status: true }, orderBy: { status: 'asc' } as any }),
      this.prisma.task.groupBy({ by: ['generalStatus'], where, _count: { generalStatus: true }, orderBy: { generalStatus: 'asc' } as any }),
      this.prisma.task.count({ where }),
    ])
    return { total, byStatus, byGeneralStatus }
  }

  async tasksCsv(q: { ownerId?: string; historicalAssignee?: string; status?: string; generalStatus?: string; source?: string; creationChannel?: string; mainCategory?: string; subCategory?: string; from?: string; to?: string }, user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' }) {
    const where: any = await this.taskScope(user)
    if (q.ownerId) where.ownerId = q.ownerId
    if (q.historicalAssignee) where.historicalAssignee = { contains: q.historicalAssignee, mode: 'insensitive' }
    if (q.status) where.status = q.status as any
    if (q.generalStatus) where.generalStatus = q.generalStatus as any
    if (q.source) where.source = q.source as any
    if (q.creationChannel) where.creationChannel = q.creationChannel as any
    if (q.from || q.to) {
      where.creationDate = {}
      if (q.from) where.creationDate.gte = new Date(q.from)
      if (q.to) { const toDate = new Date(q.to); toDate.setHours(23, 59, 59, 999); where.creationDate.lte = toDate }
    }

    const rows = await this.prisma.task.findMany({
      where,
      include: {
        account: { select: { accountName: true } },
        owner: { select: { email: true, name: true, firstName: true, lastName: true } },
        logs: { select: { reason: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { creationDate: 'desc' },
      take: 1000,
    })
    const filteredRows = rows.filter((r: any) => {
      if (!q.mainCategory && !q.subCategory) return true
      const resolved = resolveCanonicalCategory(r.mainCategory, r.subCategory, r.account?.accountName ?? '')
      if (q.mainCategory && resolved.mainCategory !== q.mainCategory) return false
      if (q.subCategory && resolved.subCategory !== q.subCategory) return false
      return true
    })
    const shaped = filteredRows.map((r: any) => ({
      id: r.id,
      account: r.account?.accountName ?? r.accountId,
      assignee: r.historicalAssignee || r.owner?.name || `${r.owner?.firstName ?? ''} ${r.owner?.lastName ?? ''}`.trim() || r.owner?.email || '',
      ownerEmail: (r as any).owner?.email ?? '',
      historicalAssignee: r.historicalAssignee ?? '',
      status: r.status,
      generalStatus: r.generalStatus,
      source: r.source,
      creationChannel: r.creationChannel,
      type: r.type,
      projectId: r.projectId ?? '',
      mainCategory: r.mainCategory ?? '',
      subCategory: r.subCategory ?? '',
      priority: r.priority,
      ownerId: r.ownerId ?? '',
      lastActivityReason: (r as any).logs?.[0]?.reason || '',
      lastActivityAt: (r as any).logs?.[0]?.createdAt ? new Date((r as any).logs?.[0]?.createdAt).toISOString() : '',
      creationDate: r.creationDate.toISOString(),
      assignmentDate: r.assignmentDate?.toISOString() ?? '',
      dueDate: r.dueDate?.toISOString() ?? '',
      closedAt: (r as any).closedAt ? (r as any).closedAt.toISOString?.() || (r as any).closedAt : '',
      closedReason: (r as any).closedReason || '',
    }))
    return toCsv(shaped)
  }

  async accountsCsv(q: { status?: string; source?: string; type?: string; from?: string; to?: string }, user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' }) {
    // Accounts are not per-owner; scope indirectly by tasks when role != ADMIN
    let where: any = {}
    if (q.status) where.status = q.status as any
    if (q.source) where.source = q.source as any
    if (q.type) where.type = q.type as any
    if (q.from || q.to) {
      where.creationDate = {}
      if (q.from) where.creationDate.gte = new Date(q.from)
      if (q.to) { const toDate = new Date(q.to); toDate.setHours(23, 59, 59, 999); where.creationDate.lte = toDate }
    }
    // When Salesperson/Manager, limit to accounts that have tasks in their scope (latest task owner)
    const include: any = { tasks: { select: { status: true, creationDate: true, ownerId: true, owner: { select: { managerId: true, team: true, role: true } } }, orderBy: { creationDate: 'desc' }, take: 1 } }
    let actorTeam = ''
    if (user?.role === 'TEAM_LEADER') {
      const actor = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { team: true },
      })
      actorTeam = String(actor?.team || '').trim()
    }
    const rows = await this.prisma.account.findMany({ where, orderBy: { creationDate: 'desc' }, take: 1000, include })
    const scoped = rows.filter((r: any) => {
      if (!user || user.role === 'ADMIN') return true
      const t = (r.tasks||[])[0]
      if (!t) return false
      if (user.role === 'SALESPERSON') return t.ownerId === user.id
      if (user.role === 'MANAGER') return t.owner?.managerId === user.id && t.owner?.role === 'SALESPERSON'
      if (user.role === 'TEAM_LEADER') return Boolean(actorTeam) && t.owner?.team === actorTeam && t.owner?.role === 'SALESPERSON'
      return true
    })
    const shaped = scoped.map((r: any) => ({
      id: r.id,
      accountName: r.accountName,
      businessName: r.businessName,
      status: r.status,
      source: r.source,
      type: r.type,
      category: r.category,
      creationDate: r.creationDate.toISOString(),
      lastTaskStatus: (r as any).tasks?.[0]?.status || '',
    }))
    return toCsv(shaped)
  }
}
