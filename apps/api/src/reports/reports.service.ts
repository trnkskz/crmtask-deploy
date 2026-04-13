import { Injectable } from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'
import { OperationsRadarQueryDto } from './dto/operations-radar.dto'
import { getAccountSourceLabel, normalizeAccountSource } from '../common/source-type'
import { ReportCacheService } from './report-cache.service'

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

function stripHtml(value: unknown) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractLogTag(text: unknown) {
  const plain = stripHtml(text)
  const match = plain.match(/^\[(.*?)\]/)
  return match ? String(match[1]).trim() : ''
}

function readDealField(text: unknown, label: string) {
  const plain = String(text || '')
  const re = new RegExp(`${label}:\\s*([^|\\n]+)`, 'i')
  const match = plain.match(re)
  return match ? String(match[1]).trim() : ''
}

function toTaskReportSourceLabel(value: unknown) {
  return getAccountSourceLabel(value || '')
}

@Injectable()
export class ReportsService {
  private static readonly ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000

  constructor(private prisma: PrismaService, private reportCache: ReportCacheService = new ReportCacheService()) {}

  private async withResponseCache<T>(key: string, ttlMs: number, builder: () => Promise<T>) {
    return this.reportCache.remember(`reports:${key}`, ttlMs, builder)
  }

  private cacheIdentity(scope: string, user?: { id: string; role: string }, query?: Record<string, unknown> | null) {
    return JSON.stringify({
      scope,
      userId: user?.id || '',
      role: user?.role || '',
      query: query || {},
    })
  }

  private toPositiveInt(value: unknown, fallback: number, max = 200) {
    const parsed = Number.parseInt(String(value ?? ''), 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return Math.min(parsed, max)
  }

  private isTaskReportOpenStatus(statusKey: unknown) {
    const raw = String(statusKey || '').toLowerCase()
    return raw === 'new' || raw === 'hot' || raw === 'nothot' || raw === 'followup'
  }

  private isTaskReportClosedStatus(statusKey: unknown) {
    const raw = String(statusKey || '').toLowerCase()
    return raw === 'deal' || raw === 'cold'
  }

  private isIdleTaskReportRow(row: any) {
    if (!this.isTaskReportOpenStatus(row?.statusKey)) return false
    const followUpTime = row?.followUpDate ? new Date(row.followUpDate).getTime() : 0
    if (String(row?.statusKey || '').toLowerCase() === 'followup' && followUpTime > Date.now()) return false
    const lastActionTime = row?.lastActionDate ? new Date(row.lastActionDate).getTime() : 0
    return lastActionTime > 0 && lastActionTime < (Date.now() - (5 * 24 * 60 * 60 * 1000))
  }

  private buildTaskReportStats(rows: any[]) {
    const safeRows = Array.isArray(rows) ? rows : []
    return safeRows.reduce(
      (acc, row) => {
        acc.total += 1
        if (this.isTaskReportOpenStatus(row?.statusKey)) acc.open += 1
        if (this.isTaskReportClosedStatus(row?.statusKey)) acc.closed += 1
        if (String(row?.statusKey || '').toLowerCase() === 'deal') acc.deal += 1
        if (String(row?.statusKey || '').toLowerCase() === 'cold') acc.cold += 1
        if (this.isIdleTaskReportRow(row)) acc.idle += 1
        return acc
      },
      { total: 0, open: 0, closed: 0, deal: 0, cold: 0, idle: 0 },
    )
  }

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

  private getIstanbulRangeStarts(now = new Date()) {
    const offsetMs = ReportsService.ISTANBUL_OFFSET_MS
    const shiftedNow = new Date(now.getTime() + offsetMs)
    const dailyMs = Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate()) - offsetMs
    const weeklyBase = new Date(dailyMs + offsetMs)
    const weeklyDayIndex = weeklyBase.getUTCDay()
    const mondayOffset = weeklyDayIndex === 0 ? -6 : 1 - weeklyDayIndex
    const weeklyMs = Date.UTC(
      weeklyBase.getUTCFullYear(),
      weeklyBase.getUTCMonth(),
      weeklyBase.getUTCDate() + mondayOffset,
    ) - offsetMs
    const monthlyMs = Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), 1) - offsetMs

    return {
      daily: dailyMs,
      weekly: weeklyMs,
      monthly: monthlyMs,
    }
  }

  private formatIstanbulDate(value?: Date | null) {
    if (!value) return '-'
    return value.toLocaleString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  private normalizeTaskStatusKey(value: unknown) {
    const raw = String(value || '').trim().toUpperCase()
    if (raw === 'NOT_HOT') return 'nothot'
    return raw.toLocaleLowerCase('tr-TR')
  }

  private isOpenWorkflowStatus(value: unknown) {
    const raw = String(value || '').trim().toUpperCase()
    const normalized = raw === 'NOTHOT' ? 'NOT_HOT' : raw
    return ['NEW', 'HOT', 'NOT_HOT', 'FOLLOWUP', 'DEAL', 'COLD'].includes(normalized)
  }

  private isDealStatus(value: unknown) {
    return String(value || '').trim().toUpperCase() === 'DEAL'
  }

  private isColdStatus(value: unknown) {
    return String(value || '').trim().toUpperCase() === 'COLD'
  }

  private isPulseSystemText(value: unknown) {
    const text = String(value || '')
    return text.includes('[Geçmiş Kayıt]')
      || text.includes('[Sistem]')
      || text.includes('[Devir]')
      || text.includes('[Klonlanmış Kampanya]')
  }

  private async scopedSalesUsers(
    user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' },
    opts?: { team?: string; userId?: string },
  ) {
    const where: any = {
      role: 'SALESPERSON',
      isActive: true,
    }

    if (user?.role === 'SALESPERSON') {
      where.id = user.id
    } else if (user?.role === 'MANAGER') {
      if (opts?.team?.trim()) where.team = opts.team.trim()
    } else if (user?.role === 'TEAM_LEADER') {
      const actor = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { team: true },
      })
      const actorTeam = String(actor?.team || '').trim()
      where.team = actorTeam || '__NO_TEAM_SCOPE__'
    } else if (opts?.team?.trim()) {
      where.team = opts.team.trim()
    }

    if (opts?.userId?.trim()) {
      where.id = opts.userId.trim()
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        team: true,
      },
      orderBy: { name: 'asc' },
    })
  }

  private startOfDay(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  }

  private endOfDay(date: Date) {
    const start = this.startOfDay(date)
    return new Date(start.getTime() + 86400000 - 1)
  }

  private resolveRadarDateRange(query?: OperationsRadarQueryDto) {
    const now = new Date()
    const todayStart = this.startOfDay(now)

    const mode = query?.mode || 'today'
    if (mode === 'last30') {
      return {
        from: new Date(todayStart.getTime() - (29 * 86400000)),
        to: this.endOfDay(now),
      }
    }
    if (mode === 'last7') {
      return {
        from: new Date(todayStart.getTime() - (6 * 86400000)),
        to: this.endOfDay(now),
      }
    }
    if (mode === 'day') {
      const selected = query?.date ? new Date(query.date) : now
      const safe = Number.isNaN(selected.getTime()) ? now : selected
      return {
        from: this.startOfDay(safe),
        to: this.endOfDay(safe),
      }
    }
    return {
      from: todayStart,
      to: this.endOfDay(now),
    }
  }

  private async scopedRadarUsers(
    user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' },
    query?: OperationsRadarQueryDto,
  ) {
    return this.scopedSalesUsers(user, {
      team: query?.team,
      userId: query?.userId,
    })
  }

  private async taskScope(user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' }) {
    const taskScope: any = {}
    if (user?.role === 'SALESPERSON') taskScope.ownerId = user.id
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

  private resolveTaskAssignee(task: any) {
    return task?.historicalAssignee
      || task?.owner?.name
      || task?.owner?.email
      || 'Atanmamış'
  }

  private normalizeTaskStatusFilter(value: unknown) {
    const raw = String(value || '').trim().toUpperCase()
    if (!raw) return ''
    if (raw === 'NOTHOT') return 'NOT_HOT'
    if (raw === 'FOLLOWUP') return 'FOLLOWUP'
    return raw
  }

  private isClosedTaskQuery(q: { status?: string; generalStatus?: string } | undefined) {
    const normalizedStatus = this.normalizeTaskStatusFilter(q?.status)
    const normalizedGeneralStatus = String(q?.generalStatus || '').trim().toUpperCase()
    return normalizedGeneralStatus === 'CLOSED' || normalizedStatus === 'DEAL' || normalizedStatus === 'COLD'
  }

  private normalizeReportSource(value: unknown) {
    if (!String(value || '').trim()) return ''
    return normalizeAccountSource(value)
  }

  private getCurrentMonthRange() {
    const { monthly } = this.getIstanbulRangeStarts()
    return {
      from: new Date(monthly).toISOString(),
      to: new Date().toISOString(),
    }
  }

  private applyTaskDateFilter(
    where: any,
    q: { status?: string; from?: string; to?: string },
  ) {
    if (!(q.from || q.to)) return

    const normalizedStatus = this.normalizeTaskStatusFilter(q.status)
    const dateField = normalizedStatus === 'DEAL' || normalizedStatus === 'COLD'
      ? 'closedAt'
      : 'creationDate'

    where[dateField] = {}
    if (q.from) where[dateField].gte = new Date(q.from)
    if (q.to) {
      const toDate = new Date(q.to)
      toDate.setHours(23, 59, 59, 999)
      where[dateField].lte = toDate
    }
  }

  private requiresLegacyTaskReportProcessing(q: {
    mainCategory?: string
    subCategory?: string
    logType?: string
    dealFee?: string
  }) {
    return Boolean(
      q?.mainCategory
      || q?.subCategory
      || q?.logType
      || q?.dealFee,
    )
  }

  private async buildTaskReportWhere(
    q: {
      q?: string
      businessId?: string
      projectId?: string
      creationChannel?: string
      type?: string
      ownerId?: string
      historicalAssignee?: string
      team?: string
      status?: string
      generalStatus?: string
      source?: string
      city?: string
      district?: string
      from?: string
      to?: string
    },
    user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' },
  ) {
    const where: any = await this.taskScope(user)
    const isSalesperson = user?.role === 'SALESPERSON'
    if (isSalesperson && this.isClosedTaskQuery(q)) {
      const requestedOwnerId = String(q.ownerId || '').trim()
      if (!requestedOwnerId) {
        delete where.ownerId
      } else {
        where.ownerId = user.id
      }
    }
    if (q.businessId) where.accountId = q.businessId
    if (q.projectId) where.projectId = q.projectId
    if (q.q) {
      where.account = {
        ...(where.account || {}),
        OR: [
          { accountName: { contains: q.q, mode: 'insensitive' } },
          { businessName: { contains: q.q, mode: 'insensitive' } },
          { city: { contains: q.q, mode: 'insensitive' } },
          { district: { contains: q.q, mode: 'insensitive' } },
        ],
      }
    }
    if (q.ownerId && !isSalesperson) where.ownerId = q.ownerId
    if (q.historicalAssignee) where.historicalAssignee = { contains: q.historicalAssignee, mode: 'insensitive' }
    if (q.team && !isSalesperson) where.owner = { ...(where.owner || {}), team: q.team, role: 'SALESPERSON' } as any
    if (q.status) where.status = this.normalizeTaskStatusFilter(q.status) as any
    if (q.generalStatus) where.generalStatus = String(q.generalStatus).toUpperCase() as any
    if (q.source) where.source = normalizeAccountSource(q.source) as any
    if (q.city) where.account = { ...(where.account || {}), city: { contains: q.city, mode: 'insensitive' } }
    if (q.district) where.account = { ...(where.account || {}), district: { contains: q.district, mode: 'insensitive' } }
    this.applyTaskDateFilter(where, q)

    if (!q.projectId && q.type === 'PROJECT') {
      where.AND = [...(Array.isArray(where.AND) ? where.AND : []), {
        NOT: [{ projectId: null }, { projectId: '' }],
      }]
    }
    if (!q.projectId && q.type === 'GENERAL') {
      where.AND = [...(Array.isArray(where.AND) ? where.AND : []), {
        OR: [{ projectId: null }, { projectId: '' }],
      }]
    }

    return where
  }

  private taskReportFindManyArgs(where: any, options: { skip?: number; take?: number } = {}) {
    const args: any = {
      where,
      include: {
        account: {
          select: {
            id: true,
            accountName: true,
            businessName: true,
            city: true,
            district: true,
            source: true,
            mainCategory: true,
            subCategory: true,
          },
        },
        owner: { select: { id: true, email: true, name: true, team: true } },
        creator: { select: { id: true, email: true, name: true } },
        logs: {
          select: { text: true, createdAt: true, reason: true, followUpDate: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { logs: true } },
      },
      orderBy: { creationDate: 'desc' },
    }

    if (Number.isFinite(options.skip as number)) args.skip = options.skip
    if (Number.isFinite(options.take as number)) args.take = options.take
    return args
  }

  private mapTaskReportRow(task: any) {
    const latestLog = task.logs?.[0] || null
    const latestLogText = String(latestLog?.text || '').trim()
    const latestLogLabel = extractLogTag(latestLogText) || (latestLog?.reason || '')
    const resolvedCategory = resolveCanonicalCategory(task.mainCategory, task.subCategory, task.account?.accountName || '')
    const normalizedSource = this.normalizeReportSource(task.source || task.account?.source || '')
    const publishedFeeText = readDealField(latestLogText, 'Yayın Bedeli') || '-'
    const jokerText = readDealField(latestLogText, 'Joker') || ''
    return {
      id: task.id,
      businessId: task.accountId,
      ownerId: task.ownerId || '',
      businessName: task.account?.accountName || task.account?.businessName || '-',
      city: task.account?.city || '-',
      district: task.account?.district || '-',
      assignee: this.resolveTaskAssignee(task),
      assigneeTeam: task.owner?.team || '',
      projectId: task.projectId || '',
      creationChannel: task.creationChannel || '',
      createdById: task.createdById || '',
      createdByName: task.creator?.name || task.creator?.email || '',
      statusKey: String(task.status || '').toLowerCase(),
      statusLabel: String(task.status || ''),
      sourceKey: normalizedSource,
      sourceLabel: toTaskReportSourceLabel(normalizedSource),
      mainCategory: resolvedCategory.mainCategory || '-',
      subCategory: resolvedCategory.subCategory || '-',
      publishedFeeText,
      jokerText,
      latestLogLabel: latestLogLabel || '-',
      conversationHistoryCount: Number(task?._count?.logs || 0),
      conversationHistoryLabel: `${Number(task?._count?.logs || 0)} kayıt`,
      logContent: stripHtml(latestLogText) || '-',
      createdAt: task.creationDate?.toISOString?.() || task.creationDate,
      lastActionDate: latestLog?.createdAt?.toISOString?.() || task.creationDate?.toISOString?.() || '',
      followUpDate: latestLog?.followUpDate?.toISOString?.() || '',
    }
  }

  private applyDerivedTaskReportFilters(
    rows: any[],
    q: {
      creationChannel?: string
      type?: string
      team?: string
      mainCategory?: string
      subCategory?: string
      logType?: string
      dealFee?: string
    },
  ) {
    return rows.filter((row) => {
      if (q.creationChannel && String(row.creationChannel || '').toUpperCase() !== String(q.creationChannel).toUpperCase()) return false
      if (q.type === 'PROJECT' && !row.projectId) return false
      if (q.type === 'GENERAL' && row.projectId) return false
      if (q.team && row.assigneeTeam !== q.team) return false
      if (q.mainCategory && row.mainCategory !== q.mainCategory) return false
      if (q.subCategory && row.subCategory !== q.subCategory) return false
      if (q.logType && row.latestLogLabel !== q.logType && !String(row.logContent || '').includes(q.logType)) return false
      if (q.dealFee) {
        if (row.statusKey !== 'deal') return false
        const feeVal = String(row.publishedFeeText || '').trim().toLocaleLowerCase('tr-TR')
        const jokerVal = String(row.jokerText || '').trim().toLocaleLowerCase('tr-TR')
        if (q.dealFee === 'bedelsiz') return ['-', 'yok', '0', '0 tl', 'bedelsiz'].includes(feeVal)
        if (q.dealFee === 'ucretli') return !['-', 'yok', '0', '0 tl', 'bedelsiz'].includes(feeVal)
        if (q.dealFee === 'joker') return !['', '0', 'yok', '-'].includes(jokerVal)
      }
      return true
    })
  }

  private async buildTaskReportRows(
    q: {
      q?: string
      businessId?: string
      projectId?: string
      creationChannel?: string
      type?: string
      ownerId?: string
      historicalAssignee?: string
      team?: string
      status?: string
      generalStatus?: string
      source?: string
      mainCategory?: string
      subCategory?: string
      city?: string
      district?: string
      logType?: string
      dealFee?: string
      from?: string
      to?: string
    },
    user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' },
  ) {
    const where = await this.buildTaskReportWhere(q, user)
    const rows = await this.prisma.task.findMany({
      ...this.taskReportFindManyArgs(where),
    })

    return this.applyDerivedTaskReportFilters(
      rows
        .map((task: any) => this.mapTaskReportRow(task))
        .map((row) => ({
          ...row,
          isIdle: this.isIdleTaskReportRow(row),
        })),
      q,
    )
  }

  async dashboardSnapshot(
    user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' },
    options?: { cacheToken?: string },
  ) {
    const cacheContext = options?.cacheToken ? { cacheToken: options.cacheToken } : {}
    const cacheKey = this.cacheIdentity('dashboardSnapshot', user, cacheContext)
    return this.withResponseCache(cacheKey, 12000, async () => {
      const monthRange = this.getCurrentMonthRange()
      const [taskStatus, performance] = await Promise.all([
        this.taskStatus(user, undefined, options),
        this.performance(user, monthRange, options),
      ])

      const generalStatusRows = Array.isArray(taskStatus?.byGeneralStatus) ? taskStatus.byGeneralStatus as any[] : []
      const statusRows = Array.isArray(taskStatus?.byStatus) ? taskStatus.byStatus as any[] : []
      const closedCount = Number(
        generalStatusRows.find((row) => String(row?.generalStatus || '').toUpperCase() === 'CLOSED')?._count?.generalStatus || 0,
      )
      const totalOpen = Math.max(0, Number(taskStatus?.total || 0) - closedCount)
      const openStatusCounts = statusRows.reduce(
        (acc, row) => {
          const key = String(row?.status || '').toUpperCase()
          const count = Number(row?._count?.status || 0)
          if (key === 'NEW') acc.new = count
          if (key === 'HOT') acc.hot = count
          if (key === 'NOT_HOT') acc.nothot = count
          if (key === 'FOLLOWUP') acc.followup = count
          return acc
        },
        { new: 0, hot: 0, nothot: 0, followup: 0 },
      )

      if (user?.role === 'SALESPERSON') {
        const ownedOpenTasks = await this.prisma.task.findMany({
          where: {
            ownerId: user.id,
            generalStatus: 'OPEN' as any,
          },
          select: {
            id: true,
            accountId: true,
            status: true,
            source: true,
            mainCategory: true,
            subCategory: true,
            creationDate: true,
            logs: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                createdAt: true,
                followUpDate: true,
              },
            },
            account: {
              select: {
                accountName: true,
                businessName: true,
                city: true,
              },
            },
          },
          orderBy: { creationDate: 'desc' },
          take: 5000,
        })

        const ownMonthlySummary = await this.buildMonthlyContactedOutcomeSummary([user.id])
        const now = Date.now()
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const nextWeek = new Date(today)
        nextWeek.setDate(nextWeek.getDate() + 7)
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000

        const delayedTasks = ownedOpenTasks.filter((task) => {
          const latestActivityMs = new Date(task.logs?.[0]?.createdAt || task.creationDate || 0).getTime()
          if (!latestActivityMs) return false
          if (String(task.status || '').toUpperCase() === 'FOLLOWUP' && task.logs?.[0]?.followUpDate) return false
          return now - latestActivityMs > threeDaysMs
        })

        const upcomingFollowups = ownedOpenTasks
          .filter((task) => {
            if (String(task.status || '').toUpperCase() !== 'FOLLOWUP') return false
            const nextCall = new Date(task.logs?.[0]?.followUpDate || 0)
            return !Number.isNaN(nextCall.getTime()) && nextCall >= today && nextCall <= nextWeek
          })
          .sort((a, b) => new Date(a.logs?.[0]?.followUpDate || 0).getTime() - new Date(b.logs?.[0]?.followUpDate || 0).getTime())
          .map((task) => ({
            taskId: task.id,
            businessId: task.accountId,
            businessName: task.account?.accountName || task.account?.businessName || 'Bilinmeyen İşletme',
            city: task.account?.city || '-',
            status: this.normalizeTaskStatusKey(task.status),
            sourceType: String(task.source || ''),
            mainCategory: String(task.mainCategory || ''),
            subCategory: String(task.subCategory || ''),
            nextCallDate: task.logs?.[0]?.followUpDate?.toISOString?.() || null,
          }))

        const dueFollowupCount = upcomingFollowups.filter((item) => {
          const nextCall = new Date(item.nextCallDate || 0)
          return !Number.isNaN(nextCall.getTime()) && nextCall < new Date(today.getTime() + 86400000)
        }).length

        const focusItems: Array<{ text: string; action: string; icon: string }> = []
        if (dueFollowupCount > 0) {
          focusItems.push({
            text: `Bugün gerçekleştirmeniz gereken planlanmış ${dueFollowupCount} aramanız (followup) bulunuyor.`,
            action: "switchPage('page-my-tasks')",
            icon: '📅',
          })
        } else if (delayedTasks.length > 0) {
          focusItems.push({
            text: `Dikkat: Üzerinde 3 günden uzun süredir işlem yapmadığınız ${delayedTasks.length} görev var!`,
            action: "switchPage('page-my-tasks')",
            icon: '⚠️',
          })
        } else if (totalOpen > 0) {
          focusItems.push({
            text: `Üzerinizde aktif olarak bekleyen toplam ${totalOpen} açık görev bulunuyor.`,
            action: "switchPage('page-my-tasks')",
            icon: '📋',
          })
        } else {
          focusItems.push({
            text: 'Harika! Bugün için acil bir işlem görünmüyor.',
            action: "switchPage('page-my-tasks')",
            icon: '🎉',
          })
        }

        return {
          scope: 'user',
          user: {
            openTasks: totalOpen,
            monthlyDeal: ownMonthlySummary.deal,
            monthlyCold: ownMonthlySummary.cold,
            openStatusCounts,
            upcomingFollowups,
            focusItems,
          },
        }
      }

      const scopedUsers = await this.scopedSalesUsers(user)
      const userSummaries = Array.isArray(performance?.users) ? performance.users : []
      const usersById = new Map(
        userSummaries
          .filter((item) => item?.ownerId)
          .map((item) => [String(item.ownerId), item]),
      )

      const unassignedOpenCount = user?.role === 'MANAGER'
        ? await this.prisma.task.count({
            where: {
              ownerId: null,
              generalStatus: 'OPEN' as any,
            },
          })
        : 0

      const focusItems: Array<{ text: string; action: string; icon: string }> = []
      if (user?.role === 'MANAGER' && unassignedOpenCount > 0) {
        focusItems.push({
          text: `Havuzda bekleyen ${unassignedOpenCount} aktif kayıt var.`,
          action: "switchPage('page-task-list')",
          icon: '⚡',
        })
      }

      const monthlyContactedOutcomeSummary = await this.buildMonthlyContactedOutcomeSummary(scopedUsers.map((item) => item.id))
      const monthlyDeal = monthlyContactedOutcomeSummary.deal
      if (monthlyDeal > 0) {
        focusItems.push({
          text: `Bu ay ${monthlyDeal} kapanış yapıldı.`,
          action: "openSummaryModal('deal')",
          icon: '✅',
        })
      }

      scopedUsers.forEach((scopedUser) => {
        const summary = usersById.get(String(scopedUser.id || ''))
        const openCount = Number(summary?.openTasks || 0)
        if (openCount > 50) {
          focusItems.push({
            text: `${scopedUser.name} üzerinde çok fazla (${openCount}) açık görev birikmiş durumda.`,
            action: "switchPage('page-all-tasks')",
            icon: '📊',
          })
        }
        if (openCount < 5) {
          focusItems.push({
            text: `${scopedUser.name} üzerinde iş kalmadı (${openCount} açık görev). Yeni atama yapın.`,
            action: user?.role === 'TEAM_LEADER' ? "switchPage('page-all-tasks')" : "switchPage('page-task-list')",
            icon: '⚡',
          })
        }
      })

      if (!focusItems.length) {
        focusItems.push({
          text: 'Ekibinizin tüm metrikleri normal.',
          action: "switchPage('page-all-tasks')",
          icon: '🎯',
        })
      }

      const successBase = totalOpen + monthlyContactedOutcomeSummary.deal + monthlyContactedOutcomeSummary.cold

      return {
        scope: 'manager',
        manager: {
          totalOpen,
          monthlyDeal,
          monthlyCold: monthlyContactedOutcomeSummary.cold,
          dealRatio: successBase > 0 ? Number(((monthlyContactedOutcomeSummary.deal / successBase) * 100).toFixed(2)) : 0,
          openStatusCounts,
          focusItems,
          radarUsers: scopedUsers.map((item) => ({
            id: item.id,
            name: item.name || '-',
            team: item.team || '',
          })),
        },
      }
    })
  }

  async summary(user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' }, range?: { from?: string; to?: string }) {
    const cacheKey = this.cacheIdentity('summary', user, range || {})
    return this.withResponseCache(cacheKey, 15000, async () => {
      const taskScope = await this.taskScope(user)
      const taskDateWhere = this.dateWhere('creationDate', range)
      const leadDateWhere = this.dateWhere('createdAt', range)
      const accountDateWhere = this.dateWhere('creationDate', range)
      const dealDateWhere = this.dateWhere('createdAt', range)
      const dealScope: any = {}
      if (user?.role === 'SALESPERSON') dealScope.task = { ownerId: user.id }
      if (user?.role === 'MANAGER') {
        const hasDirectSales = await this.managerHasDirectSales(user.id)
        dealScope.task = { owner: hasDirectSales ? { managerId: user.id, role: 'SALESPERSON' } : { role: 'SALESPERSON' } }
      }
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
      const today = new Date()
      const startDefault = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()-6))
      const startAt = range?.from ? new Date(range.from) : startDefault
      const endAt = range?.to ? new Date(range.to) : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
      const startDay = new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate()))
      const endDay = new Date(Date.UTC(endAt.getUTCFullYear(), endAt.getUTCMonth(), endAt.getUTCDate()))
      const leadRows = await this.prisma.lead.findMany({ where: { createdAt: { gte: startDay, lte: new Date(endDay.getTime() + 86400000 - 1) } }, select: { createdAt: true } })
      const taskRows = await this.prisma.task.findMany({ where: { creationDate: { gte: startDay, lte: new Date(endDay.getTime() + 86400000 - 1) }, ...taskScope }, select: { creationDate: true } })
      const days: string[] = []
      const leadsPer: Record<string, number> = {}
      const tasksPer: Record<string, number> = {}
      for (let d = new Date(startDay); d <= endDay; d = new Date(d.getTime() + 86400000)) {
        const key = d.toISOString().slice(0,10)
        days.push(key); leadsPer[key] = 0; tasksPer[key] = 0
      }
      for (const r of leadRows) { const key = new Date(r.createdAt).toISOString().slice(0,10); if (key in leadsPer) leadsPer[key]++ }
      for (const r of taskRows) { const key = new Date(r.creationDate).toISOString().slice(0,10); if (key in tasksPer) tasksPer[key]++ }
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
    })
  }

  async performance(
    user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' },
    range?: { from?: string; to?: string },
    options?: { cacheToken?: string },
  ) {
    const cacheKey = this.cacheIdentity('performance', user, { ...(range || {}), ...(options?.cacheToken ? { cacheToken: options.cacheToken } : {}) })
    return this.withResponseCache(cacheKey, 15000, async () => {
      const taskScope = await this.taskScope(user)
      const taskDateWhere = this.dateWhere('creationDate', range)
      const where = { ...taskScope, ...taskDateWhere }
      const openWhere = { ...taskScope, generalStatus: 'OPEN' as any }

      const [periodTotalTasks, periodClosedTasks, totalOpenTasks, periodAllByOwner, periodDealByOwner, periodColdByOwner, openByOwner] = await this.prisma.$transaction([
        this.prisma.task.count({ where }),
        this.prisma.task.count({ where: { ...where, generalStatus: 'CLOSED' } }),
        this.prisma.task.count({ where: openWhere }),
        this.prisma.task.groupBy({ by: ['ownerId'], where, _count: { ownerId: true }, orderBy: { ownerId: 'asc' } as any }),
        this.prisma.task.groupBy({ by: ['ownerId'], where: { ...where, status: 'DEAL' as any }, _count: { ownerId: true }, orderBy: { ownerId: 'asc' } as any }),
        this.prisma.task.groupBy({ by: ['ownerId'], where: { ...where, status: 'COLD' as any }, _count: { ownerId: true }, orderBy: { ownerId: 'asc' } as any }),
        this.prisma.task.groupBy({ by: ['ownerId'], where: openWhere, _count: { ownerId: true }, orderBy: { ownerId: 'asc' } as any }),
      ])

      const ownerIds = Array.from(
        new Set([
          ...periodAllByOwner.map(r => r.ownerId),
          ...openByOwner.map(r => r.ownerId),
        ].filter((id): id is string => Boolean(id))),
      )
      const owners = ownerIds.length
        ? await this.prisma.user.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, name: true, firstName: true, lastName: true, email: true, team: true },
          })
        : []
      const ownerMap = new Map(owners.map(o => [o.id, o]))
      const dealMap = new Map(
        (periodDealByOwner as any[]).map(r => [r.ownerId ?? 'UNASSIGNED', r?._count?.ownerId ?? 0]),
      )
      const coldMap = new Map(
        (periodColdByOwner as any[]).map(r => [r.ownerId ?? 'UNASSIGNED', r?._count?.ownerId ?? 0]),
      )
      const openMap = new Map(
        (openByOwner as any[]).map(r => [r.ownerId ?? 'UNASSIGNED', r?._count?.ownerId ?? 0]),
      )

      const users = (periodAllByOwner as any[])
        .map(row => {
          const key = row.ownerId ?? 'UNASSIGNED'
          const deal = dealMap.get(key) ?? 0
          const cold = coldMap.get(key) ?? 0
          const total = row?._count?.ownerId ?? 0
          const open = openMap.get(key) ?? 0
          const profile = row.ownerId ? ownerMap.get(row.ownerId) : undefined
          return {
            ownerId: row.ownerId,
            name: profile ? String(profile.name || `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() || profile.email || '').trim() : 'Unassigned',
            email: profile?.email ?? '',
            team: profile?.team ?? '',
            totalTasks: total,
            dealTasks: deal,
            coldTasks: cold,
            openTasks: open,
            conversionRate: total ? Number(((deal / total) * 100).toFixed(2)) : 0,
          }
        })
        .sort((a, b) => b.openTasks - a.openTasks || b.totalTasks - a.totalTasks)

      return {
        totals: {
          totalTasks: periodTotalTasks,
          openTasks: totalOpenTasks,
          closedTasks: periodClosedTasks,
          conversionRate: periodTotalTasks ? Number((((users.reduce((sum, item) => sum + item.dealTasks, 0)) / periodTotalTasks) * 100).toFixed(2)) : 0,
        },
        users,
      }
    })
  }

  async teamPulse(user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' }) {
    const cacheKey = this.cacheIdentity('teamPulse', user, {})
    return this.withResponseCache(cacheKey, 12000, async () => {
      const scopedUsers = await this.scopedSalesUsers(user)
      const scopedUserIds = scopedUsers.map((item) => item.id)

      if (!scopedUserIds.length) {
        return { records: [] }
      }

      const rangeStarts = this.getIstanbulRangeStarts()
      const monthStart = new Date(rangeStarts.monthly)
      const [tasks, activityLogs] = await this.prisma.$transaction([
        this.prisma.task.findMany({
          where: {
            ownerId: { in: scopedUserIds },
          },
          select: {
            id: true,
            accountId: true,
            ownerId: true,
            createdById: true,
            status: true,
            creationDate: true,
            logs: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                createdAt: true,
                followUpDate: true,
              },
            },
            account: {
              select: {
                accountName: true,
                businessName: true,
                city: true,
              },
            },
          },
        }),
        this.prisma.activityLog.findMany({
          where: {
            authorId: { in: scopedUserIds },
            createdAt: { gte: monthStart },
            task: {
              ownerId: { in: scopedUserIds },
            },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            authorId: true,
            createdAt: true,
            text: true,
            task: {
              select: {
                id: true,
                accountId: true,
                status: true,
                account: {
                  select: {
                    accountName: true,
                    businessName: true,
                    city: true,
                  },
                },
              },
            },
          },
        }),
      ])

      const tasksByOwnerId = new Map<string, any[]>()
      tasks.forEach((task) => {
        const ownerId = String(task.ownerId || '')
        if (!ownerId) return
        const bucket = tasksByOwnerId.get(ownerId) || []
        bucket.push(task)
        tasksByOwnerId.set(ownerId, bucket)
      })

      const logsByAuthorId = new Map<string, any[]>()
      activityLogs.forEach((log) => {
        if (this.isPulseSystemText(log.text)) return
        const authorId = String(log.authorId || '')
        if (!authorId) return
        const bucket = logsByAuthorId.get(authorId) || []
        bucket.push(log)
        logsByAuthorId.set(authorId, bucket)
      })

      const periods: Array<'daily'|'weekly'|'monthly'> = ['daily', 'weekly', 'monthly']
      const records = scopedUsers
        .map((userRow) => {
          const ownerId = String(userRow.id || '')
          const ownedTasks = tasksByOwnerId.get(ownerId) || []
          const authoredLogs = logsByAuthorId.get(ownerId) || []

          const activeTaskItems = ownedTasks
            .filter((task) => ['NEW', 'HOT', 'NOT_HOT', 'FOLLOWUP'].includes(String(task.status || '').toUpperCase()))
            .map((task) => ({
              taskId: task.id,
              businessId: task.accountId,
              businessName: task.account?.accountName || task.account?.businessName || 'Bilinmeyen İşletme',
              city: task.account?.city || '-',
              status: this.normalizeTaskStatusKey(task.status),
              latestActivityAt: task.logs?.[0]?.createdAt || task.creationDate,
              plannedFollowupAt: task.logs?.[0]?.followUpDate || null,
            }))

          const metrics = periods.reduce((acc, period) => {
            const rangeStartMs = rangeStarts[period]
            const contactedMap = new Map<string, any>()

            authoredLogs.forEach((log) => {
              const createdAtMs = new Date(log.createdAt || 0).getTime()
              if (!createdAtMs || createdAtMs < rangeStartMs) return
              const taskId = String(log.task?.id || '')
              if (!taskId) return
              const current = contactedMap.get(taskId)
              if (current && new Date(current.createdAt || 0).getTime() >= createdAtMs) return
              contactedMap.set(taskId, {
                createdAt: log.createdAt,
                taskId: log.task?.id,
                businessName: log.task?.account?.accountName || log.task?.account?.businessName || 'Bilinmeyen İşletme',
                city: log.task?.account?.city || '-',
                status: this.normalizeTaskStatusKey(log.task?.status),
                meta: this.formatIstanbulDate(log.createdAt),
              })
            })

            const contactedItems = Array.from(contactedMap.values())
              .filter((item) => this.isOpenWorkflowStatus(item.status))
              .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
              .map(({ createdAt, ...item }) => item)

            const idleItems = activeTaskItems
              .filter((item) => {
                const latestActivityMs = new Date(item.latestActivityAt || 0).getTime()
                if (!latestActivityMs || latestActivityMs >= rangeStartMs) return false
                if (item.status === 'followup' && item.plannedFollowupAt) return false
                return true
              })
              .sort((a, b) => new Date(a.latestActivityAt || 0).getTime() - new Date(b.latestActivityAt || 0).getTime())
              .map((item) => ({
                taskId: item.taskId,
                businessName: item.businessName,
                city: item.city,
                status: item.status,
                meta: `Son islem ${this.formatIstanbulDate(item.latestActivityAt)}`,
              }))

            const openedItems = ownedTasks
              .filter((task) => String(task.createdById || '') === ownerId && new Date(task.creationDate || 0).getTime() >= rangeStartMs)
              .sort((a, b) => new Date(b.creationDate || 0).getTime() - new Date(a.creationDate || 0).getTime())
              .map((task) => ({
                taskId: task.id,
                businessName: task.account?.accountName || task.account?.businessName || 'Bilinmeyen İşletme',
                city: task.account?.city || '-',
                status: this.normalizeTaskStatusKey(task.status),
                meta: `Olusturma ${this.formatIstanbulDate(task.creationDate)}`,
              }))

            const openItems = activeTaskItems
              .slice()
              .sort((a, b) => new Date(b.latestActivityAt || 0).getTime() - new Date(a.latestActivityAt || 0).getTime())
              .map((item) => ({
                taskId: item.taskId,
                businessName: item.businessName,
                city: item.city,
                status: item.status,
                meta: `Durum ${item.status}`,
              }))

            const dealItems = contactedItems.filter((item) => this.isDealStatus(item.status))
            const coldItems = contactedItems.filter((item) => this.isColdStatus(item.status))

            acc[period] = {
              contacted: {
                count: contactedItems.length,
                items: contactedItems,
              },
              idle: {
                count: idleItems.length,
                items: idleItems,
              },
              opened: {
                count: openedItems.length,
                items: openedItems,
              },
              open: {
                count: openItems.length,
                items: openItems,
              },
              deal: {
                count: dealItems.length,
                items: dealItems,
              },
              cold: {
                count: coldItems.length,
                items: coldItems,
              },
            }
            return acc
          }, {} as Record<string, any>)

          const successBase = (metrics.monthly?.open?.count || 0) + (metrics.monthly?.deal?.count || 0) + (metrics.monthly?.cold?.count || 0)

          return {
            user: {
              id: ownerId,
              name: userRow.name || '-',
              team: userRow.team || 'Takım atanmadı',
            },
            key: encodeURIComponent(ownerId),
            metrics,
            dealRatio: successBase > 0
              ? Number((((metrics.monthly?.deal?.count || 0) / successBase) * 100).toFixed(2))
              : 0,
            totalOpen: metrics.monthly?.open?.count || 0,
            totalContacted: metrics.monthly?.contacted?.count || 0,
            totalIdle: metrics.monthly?.idle?.count || 0,
            totalDeal: metrics.monthly?.deal?.count || 0,
            totalCold: metrics.monthly?.cold?.count || 0,
            totalOpened: metrics.monthly?.opened?.count || 0,
          }
        })
        .filter((record) =>
          record.totalOpen > 0
          || record.totalContacted > 0
          || record.totalIdle > 0
          || record.totalDeal > 0
          || record.totalCold > 0
          || record.totalOpened > 0,
        )
        .sort((a, b) => {
          if (b.totalIdle !== a.totalIdle) return b.totalIdle - a.totalIdle
          if (b.totalOpen !== a.totalOpen) return b.totalOpen - a.totalOpen
          return String(a.user?.name || '').localeCompare(String(b.user?.name || ''), 'tr')
        })

      return { records }
    })
  }

  private async buildMonthlyContactedOutcomeSummary(scopedUserIds: string[]) {
    if (!scopedUserIds.length) {
      return { contacted: 0, deal: 0, cold: 0 }
    }

    const monthStart = new Date(this.getIstanbulRangeStarts().monthly)
    const [activityLogs] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        where: {
          authorId: { in: scopedUserIds },
          createdAt: { gte: monthStart },
          task: {
            ownerId: { in: scopedUserIds },
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          text: true,
          task: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      }),
    ])

    const contactedMap = new Map<string, string>()
    activityLogs.forEach((log) => {
      if (this.isPulseSystemText(log.text)) return
      const taskId = String(log.task?.id || '')
      if (!taskId || contactedMap.has(taskId)) return
      const normalizedStatus = String(log.task?.status || '').trim().toUpperCase()
      if (!this.isOpenWorkflowStatus(normalizedStatus)) return
      contactedMap.set(taskId, normalizedStatus)
    })

    let deal = 0
    let cold = 0
    for (const status of contactedMap.values()) {
      if (this.isDealStatus(status)) deal += 1
      if (this.isColdStatus(status)) cold += 1
    }

    return {
      contacted: contactedMap.size,
      deal,
      cold,
    }
  }

  async taskStatus(
    user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' },
    range?: { from?: string; to?: string },
    options?: { cacheToken?: string },
  ) {
    const cacheKey = this.cacheIdentity('taskStatus', user, { ...(range || {}), ...(options?.cacheToken ? { cacheToken: options.cacheToken } : {}) })
    return this.withResponseCache(cacheKey, 15000, async () => {
      const taskScope = await this.taskScope(user)
      const taskDateWhere = this.dateWhere('creationDate', range)
      const where = { ...taskScope, ...taskDateWhere }
      const openWhere = { ...where, generalStatus: 'OPEN' as any }

      const [byStatus, byGeneralStatus, total] = await this.prisma.$transaction([
        this.prisma.task.groupBy({ by: ['status'], where: openWhere, _count: { status: true }, orderBy: { status: 'asc' } as any }),
        this.prisma.task.groupBy({ by: ['generalStatus'], where, _count: { generalStatus: true }, orderBy: { generalStatus: 'asc' } as any }),
        this.prisma.task.count({ where }),
      ])
      return { total, byStatus, byGeneralStatus }
    })
  }

  async operationsRadar(
    user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' },
    query?: OperationsRadarQueryDto,
  ) {
    const cacheKey = this.cacheIdentity('operationsRadar', user, (query || {}) as Record<string, unknown>)
    return this.withResponseCache(cacheKey, 12000, async () => {
      const { from, to } = this.resolveRadarDateRange(query)
      const scopedUsers = await this.scopedRadarUsers(user, query)
      const scopedUserIds = scopedUsers.map((item) => item.id)
      if (scopedUserIds.length === 0) {
        return {
          mode: query?.mode || 'today',
          from: from.toISOString(),
          to: to.toISOString(),
          groups: [],
          users: [],
        }
      }

      const scopedUserNames = new Set(scopedUsers.map((item) => String(item.name || '').trim()).filter(Boolean))

      const [activityLogs, fallbackTasks] = await this.prisma.$transaction([
        this.prisma.activityLog.findMany({
          where: {
            createdAt: { gte: from, lte: to },
            task: {
              ownerId: { in: scopedUserIds },
            },
          },
          select: {
            id: true,
            text: true,
            createdAt: true,
            author: { select: { name: true } },
            task: {
              select: {
                id: true,
                status: true,
                details: true,
                createdAt: true,
                owner: { select: { id: true, name: true, team: true } },
                account: { select: { accountName: true, businessName: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 5000,
        }),
        this.prisma.task.findMany({
          where: {
            ownerId: { in: scopedUserIds },
            creationDate: { gte: from, lte: to },
            logs: { none: {} },
          },
          select: {
            id: true,
            status: true,
            details: true,
            createdAt: true,
            owner: { select: { id: true, name: true, team: true } },
            account: { select: { accountName: true, businessName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 1000,
        }),
      ])

      const statusLabels: Record<string, string> = {
        NEW: 'Yeni',
        HOT: 'Hot',
        NOT_HOT: 'Not Hot',
        FOLLOWUP: 'Takip',
        DEAL: 'Deal',
        COLD: 'Cold',
      }

      const buildFallbackText = (task: any) => {
        const label = statusLabels[String(task?.status || '').toUpperCase()] || String(task?.status || 'İşlem')
        if (task?.details) return `[${label}] ${String(task.details).trim()}`
        return `[${label}] Güncel görev hareketi`
      }

      const items = activityLogs.map((log) => {
        const ownerName = String(log.task?.owner?.name || '').trim()
        const actorName = String(log.author?.name || '').trim()
        const effectiveActor = actorName && !actorName.toLocaleLowerCase('tr-TR').includes('sistem')
          ? actorName
          : ownerName
        return {
          id: log.id,
          taskId: log.task.id,
          timestamp: log.createdAt.toISOString(),
          actorName: effectiveActor,
          team: String(log.task?.owner?.team || '').trim(),
          businessName: log.task?.account?.accountName || log.task?.account?.businessName || 'Bilinmeyen İşletme',
          text: String(log.text || '').trim() || buildFallbackText(log.task),
          status: String(log.task?.status || '').toLowerCase(),
        }
      }).filter((item) => item.actorName && scopedUserNames.has(item.actorName))

      fallbackTasks.forEach((task) => {
        const ownerName = String(task.owner?.name || '').trim()
        if (!ownerName || !scopedUserNames.has(ownerName)) return
        items.push({
          id: `task:${task.id}`,
          taskId: task.id,
          timestamp: task.createdAt.toISOString(),
          actorName: ownerName,
          team: String(task.owner?.team || '').trim(),
          businessName: task.account?.accountName || task.account?.businessName || 'Bilinmeyen İşletme',
          text: buildFallbackText(task),
          status: String(task.status || '').toLowerCase(),
        })
      })

      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      const groupsMap = new Map<string, typeof items>()
      items.forEach((item) => {
        const key = item.timestamp.slice(0, 10)
        const arr = groupsMap.get(key) || []
        arr.push(item)
        groupsMap.set(key, arr)
      })

      const groups = Array.from(groupsMap.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, events]) => ({ date, events }))

      return {
        mode: query?.mode || 'today',
        from: from.toISOString(),
        to: to.toISOString(),
        groups,
        users: scopedUsers.map((item) => ({
          id: item.id,
          name: item.name,
          team: item.team || '',
        })),
      }
    })
  }

  async tasksCsv(q: { ownerId?: string; historicalAssignee?: string; status?: string; generalStatus?: string; source?: string; creationChannel?: string; mainCategory?: string; subCategory?: string; from?: string; to?: string }, user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' }) {
    const where: any = await this.taskScope(user)
    if (q.ownerId) where.ownerId = q.ownerId
    if (q.historicalAssignee) where.historicalAssignee = { contains: q.historicalAssignee, mode: 'insensitive' }
    if (q.status) where.status = q.status as any
    if (q.generalStatus) where.generalStatus = q.generalStatus as any
    if (q.source) where.source = normalizeAccountSource(q.source) as any
    if (q.creationChannel) where.creationChannel = q.creationChannel as any
    this.applyTaskDateFilter(where, q)

    const rows = await this.prisma.task.findMany({
      where,
      include: {
        account: { select: { accountName: true } },
        owner: { select: { email: true, name: true, firstName: true, lastName: true } },
        logs: { select: { reason: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { creationDate: 'desc' },
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

  async tasksReport(q: any, user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' }) {
    const baseQuery = { ...(q || {}) }
    delete (baseQuery as any).page
    delete (baseQuery as any).limit

    const wantsPaging = q?.page != null || q?.limit != null
    const needsLegacyProcessing = this.requiresLegacyTaskReportProcessing(baseQuery)
    if (!wantsPaging || needsLegacyProcessing) {
      const cacheKey = this.cacheIdentity('tasksReportRows', user, baseQuery)
      const rows = await this.withResponseCache(cacheKey, 12000, async () => this.buildTaskReportRows(baseQuery, user))
      if (!wantsPaging) return rows

      const page = this.toPositiveInt(q?.page, 1, 10000)
      const limit = this.toPositiveInt(q?.limit, 25, 200)
      const total = rows.length
      const offset = (page - 1) * limit
      const items = rows.slice(offset, offset + limit)
      return {
        items,
        total,
        page,
        limit,
        stats: this.buildTaskReportStats(rows),
      }
    }

    const page = this.toPositiveInt(q?.page, 1, 10000)
    const limit = this.toPositiveInt(q?.limit, 25, 200)
    const offset = (page - 1) * limit
    const pagedCacheKey = this.cacheIdentity('tasksReportPaged', user, { ...baseQuery, page, limit })
    return this.withResponseCache(pagedCacheKey, 12000, async () => {
      const where = await this.buildTaskReportWhere(baseQuery, user)
      const openStatusWhere = { ...where, status: { in: ['NEW', 'HOT', 'NOT_HOT', 'FOLLOWUP'] } }
      const [total, open, closed, deal, cold, itemRows, idleCandidates] = await Promise.all([
        this.prisma.task.count({ where }),
        this.prisma.task.count({ where: openStatusWhere }),
        this.prisma.task.count({ where: { ...where, status: { in: ['DEAL', 'COLD'] } } }),
        this.prisma.task.count({ where: { ...where, status: 'DEAL' } }),
        this.prisma.task.count({ where: { ...where, status: 'COLD' } }),
        this.prisma.task.findMany({
          ...this.taskReportFindManyArgs(where, { skip: offset, take: limit }),
        }),
        this.prisma.task.findMany({
          where: openStatusWhere,
          select: {
            status: true,
            creationDate: true,
            logs: {
              select: { createdAt: true, followUpDate: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          orderBy: { creationDate: 'desc' },
        }),
      ])

      const items = itemRows.map((task: any) => {
        const row = this.mapTaskReportRow(task)
        return {
          ...row,
          isIdle: this.isIdleTaskReportRow(row),
        }
      })
      const idle = idleCandidates.reduce((acc: number, task: any) => {
        const row = {
          statusKey: String(task.status || '').toLowerCase(),
          lastActionDate: task.logs?.[0]?.createdAt?.toISOString?.() || task.creationDate?.toISOString?.() || '',
          followUpDate: task.logs?.[0]?.followUpDate?.toISOString?.() || '',
        }
        return acc + (this.isIdleTaskReportRow(row) ? 1 : 0)
      }, 0)

      return {
        items,
        total,
        page,
        limit,
        stats: {
          total,
          open,
          closed,
          deal,
          cold,
          idle,
        },
      }
    })
  }

  async accountsCsv(q: { status?: string; source?: string; type?: string; from?: string; to?: string }, user?: { id: string; role: 'ADMIN'|'MANAGER'|'TEAM_LEADER'|'SALESPERSON' }) {
    // Accounts are not per-owner; scope indirectly by tasks when role != ADMIN
    let where: any = {}
    if (q.status) where.status = q.status as any
    if (q.source) where.source = normalizeAccountSource(q.source) as any
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
    const rows = await this.prisma.account.findMany({ where, orderBy: { creationDate: 'desc' }, include })
    const scoped = rows.filter((r: any) => {
      if (!user || user.role === 'ADMIN' || user.role === 'MANAGER') return true
      const t = (r.tasks||[])[0]
      if (!t) return false
      if (user.role === 'SALESPERSON') return t.ownerId === user.id
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
