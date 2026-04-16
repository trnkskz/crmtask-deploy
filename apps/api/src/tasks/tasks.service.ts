import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'
import { AssignTaskDto, CreateTaskDto } from './dto/task-create.dto'
import { ActivityLogDto } from './dto/task-activity.dto'
import { TaskFocusContactDto } from './dto/task-focus-contact.dto'
import { GeneralStatus, Prisma, TaskListTag, Reason } from '@prisma/client'
import { NotificationsService } from '../notifications/notifications.service'
import { AuditService } from '../audit/audit.service'
import { normalizeAccountSource } from '../common/source-type'

const AUTO_SYSTEM_NOTE_TEXTS = new Set([
  'satış temsilcisi bu işletmeyi havuzdan kendi üzerine aldı',
  'yeni kayıt oluşturuldu ve satışçı görevi başlattı',
  'yeni işletme oluşturuldu ve görev başlatıldı',
])

const IMMUTABLE_ACTIVITY_REASONS = new Set([
  'TEKLIF_VERILDI',
  'KARSITEKLIF',
  'TEKLIF_KABUL',
  'TEKLIF_RED',
  'ISLETME_KAPANMIS',
])

const IMMUTABLE_ACTIVITY_TEXT_MARKERS = ['[Sistem]', '[Devir]', '[Klonlanmış Kampanya]', '[Deal Sonucu]']

function normalizeComparableText(value: unknown) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[.*?\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function shouldCreateInitialTaskNote(details?: string, systemLogText?: string) {
  const normalizedDetails = normalizeComparableText(details)
  if (!normalizedDetails) return false
  if (!systemLogText || !String(systemLogText).trim()) return true
  return !AUTO_SYSTEM_NOTE_TEXTS.has(normalizedDetails)
}

function extractEditableLogPrefix(text: unknown) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  const htmlWrappedMatch = raw.match(/^((?:<[^>]+>\s*)*\[[^\]]+\](?:\s*<\/[^>]+>)?)\s*/i)
  if (htmlWrappedMatch?.[1]) return htmlWrappedMatch[1].trim()
  const plainMatch = raw.match(/^(\[[^\]]+\])\s*/i)
  return plainMatch?.[1]?.trim() || ''
}

function mergeEditedLogText(originalText: unknown, nextText: unknown) {
  const trimmedNextText = String(nextText || '').trim()
  const originalPrefix = extractEditableLogPrefix(originalText)
  if (!originalPrefix) return trimmedNextText
  const nextPrefix = extractEditableLogPrefix(trimmedNextText)
  if (nextPrefix) return trimmedNextText
  return `${originalPrefix} ${trimmedNextText}`.trim()
}

function buildPrefixTsQuery(input: string) {
  return String(input || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .match(/[\p{L}\p{N}]+/gu)?.map((token) => `${token}:*`).join(' & ') || ''
}

@Injectable()
export class TasksService {
  private readonly mutationResultCache = new Map<string, { promise: Promise<any>; createdAt: number }>()
  private readonly mutationResultTtlMs = 60_000

  constructor(private prisma: PrismaService, @Optional() private notifications?: NotificationsService, @Optional() private audit?: AuditService) {}

  private getMutationCacheKey(userId: string, taskId: string, mutationKey?: string) {
    const normalizedKey = String(mutationKey || '').trim()
    if (!normalizedKey) return ''
    return `${userId}:${taskId}:${normalizedKey}`
  }

  private pruneMutationCache(now = Date.now()) {
    for (const [cacheKey, entry] of this.mutationResultCache.entries()) {
      if ((now - entry.createdAt) > this.mutationResultTtlMs) {
        this.mutationResultCache.delete(cacheKey)
      }
    }
  }

  private runWithMutationCache(userId: string, taskId: string, mutationKey: string | undefined, action: () => Promise<any>) {
    const cacheKey = this.getMutationCacheKey(userId, taskId, mutationKey)
    if (!cacheKey) return action()
    this.pruneMutationCache()
    const cached = this.mutationResultCache.get(cacheKey)
    if (cached) return cached.promise

    const promise = action().catch((error) => {
      this.mutationResultCache.delete(cacheKey)
      throw error
    })
    this.mutationResultCache.set(cacheKey, { promise, createdAt: Date.now() })
    return promise
  }

  private mapTaskListItem(task: any) {
    const companyName = task.account?.accountName || task.account?.businessName || null
    const businessName = task.account?.businessName || task.account?.accountName || null
    return {
      ...task,
      companyName,
      businessName,
      city: task.account?.city || null,
      district: task.account?.district || null,
      specificCampaignUrl: task.campaignUrl,
      ...this.resolveSpecificContact(task),
      nextCallDate: task.logs?.[0]?.followUpDate || null,
    }
  }

  private buildSummaryTaskSelect() {
    return {
      id: true,
      accountId: true,
      projectId: true,
      ownerId: true,
      createdById: true,
      poolTeam: true,
      historicalAssignee: true,
      creationChannel: true,
      status: true,
      source: true,
      mainCategory: true,
      subCategory: true,
      details: true,
      campaignUrl: true,
      creationDate: true,
      createdAt: true,
      updatedAt: true,
      account: { select: { accountName: true, businessName: true, city: true, district: true } },
      owner: { select: { id: true, name: true, email: true } },
      logs: { orderBy: { createdAt: 'desc' }, take: 1, select: { reason: true, followUpDate: true, text: true, createdAt: true } },
    } as const
  }

  private getTaskLastActivityTime(task: any) {
    const latestLogAt = task?.logs?.[0]?.createdAt ? new Date(task.logs[0].createdAt).getTime() : 0
    const createdAt = task?.creationDate
      ? new Date(task.creationDate).getTime()
      : (task?.createdAt ? new Date(task.createdAt).getTime() : 0)
    return latestLogAt || createdAt
  }

  private getHybridOpenTaskSortBucket(task: any, nowMs: number) {
    const status = String(task?.status || '').trim().toUpperCase()
    const nextCallMs = task?.logs?.[0]?.followUpDate ? new Date(task.logs[0].followUpDate).getTime() : 0
    if (status === 'FOLLOWUP' && nextCallMs > 0 && nextCallMs <= nowMs) return 0
    if (status === 'NEW') return 1
    if (status === 'FOLLOWUP') return 3
    return 2
  }

  private sortHybridOpenTasks(items: any[]) {
    const nowMs = Date.now()
    return [...items].sort((left, right) => {
      const leftBucket = this.getHybridOpenTaskSortBucket(left, nowMs)
      const rightBucket = this.getHybridOpenTaskSortBucket(right, nowMs)
      if (leftBucket !== rightBucket) return leftBucket - rightBucket

      const leftNextCallMs = left?.logs?.[0]?.followUpDate ? new Date(left.logs[0].followUpDate).getTime() : 0
      const rightNextCallMs = right?.logs?.[0]?.followUpDate ? new Date(right.logs[0].followUpDate).getTime() : 0
      if (leftBucket === 0 || leftBucket === 3) {
        if (leftNextCallMs !== rightNextCallMs) {
          if (!leftNextCallMs) return 1
          if (!rightNextCallMs) return -1
          return leftNextCallMs - rightNextCallMs
        }
      }

      const leftLastActivity = this.getTaskLastActivityTime(left)
      const rightLastActivity = this.getTaskLastActivityTime(right)
      if (leftLastActivity !== rightLastActivity) return rightLastActivity - leftLastActivity

      const leftCreatedAt = left?.creationDate ? new Date(left.creationDate).getTime() : 0
      const rightCreatedAt = right?.creationDate ? new Date(right.creationDate).getTime() : 0
      return rightCreatedAt - leftCreatedAt
    })
  }

  private sortOldestOpenTasks(items: any[]) {
    return [...items].sort((left, right) => {
      const leftLastActivity = this.getTaskLastActivityTime(left)
      const rightLastActivity = this.getTaskLastActivityTime(right)
      if (leftLastActivity !== rightLastActivity) return leftLastActivity - rightLastActivity

      const leftCreatedAt = left?.creationDate ? new Date(left.creationDate).getTime() : 0
      const rightCreatedAt = right?.creationDate ? new Date(right.creationDate).getTime() : 0
      return leftCreatedAt - rightCreatedAt
    })
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

  private mapTeamToPoolTeam(team: string) {
    const normalized = String(team || '').trim()
    if (normalized === 'Team 1') return 'TEAM_1'
    if (normalized === 'Team 2') return 'TEAM_2'
    return ''
  }

  private async getActorTeam(userId: string) {
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { team: true },
    })
    return String(actor?.team || '').trim()
  }

  private formatDealDuration(value: any) {
    const raw = String(value ?? '').trim()
    if (!raw) return '-'
    if (/\bay\b/i.test(raw)) return raw
    return `${raw} Ay`
  }

  private parseTaskStatus(input: any) {
    const q = String(input || '').toLowerCase().replace(/[\s_-]/g, '')
    if (q.includes('deal') || q.includes('anlas')) return 'DEAL'
    if (q.includes('cold') || q.includes('iptal')) return 'COLD'
    if (q.includes('nothot') || q.includes('ilik')) return 'NOT_HOT'
    if (q.includes('hot') || q.includes('sicak')) return 'HOT'
    if (q.includes('follow') || q.includes('takip')) return 'FOLLOWUP'
    return 'NEW'
  }

  private taskContactInclude() {
    return {
      taskContacts: {
        where: { isPrimary: true },
        take: 1,
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
            },
          },
        },
      },
    } as const
  }

  private accountPrimaryContactInclude() {
    return {
      contacts: {
        where: { type: 'PERSON' as any },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] as any,
        take: 1,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          isPrimary: true,
        },
      },
    } as const
  }

  private resolveSpecificContact(taskLike: any) {
    const taskContact = taskLike?.taskContacts?.[0]?.contact || null
    const accountContact = taskLike?.account?.contacts?.[0] || null
    const chosen = taskContact || accountContact
    return {
      specificContactName: chosen?.name || null,
      specificContactPhone: chosen?.phone || null,
      specificContactEmail: chosen?.email || null,
    }
  }

  private splitContactValues(raw: string | null | undefined, type: 'name' | 'phone' | 'email') {
    if (!raw) return [] as string[]
    const values = String(raw)
      .split(/[\n,;\/|\\]+/)
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .map((part) => {
        if (type === 'phone') {
          let cleaned = part.replace(/[^\d]/g, '')
          if (cleaned.startsWith('90') && cleaned.length > 10) cleaned = cleaned.substring(2)
          if (cleaned.length === 10 && !cleaned.startsWith('0')) cleaned = '0' + cleaned
          return cleaned
        }
        if (type === 'email') return part.toLowerCase()
        return part
      })
      .filter(Boolean)
    return Array.from(new Set(values))
  }

  private pickAlignedContactValue(values: string[], index: number) {
    if (!values.length) return ''
    if (index < values.length) return values[index]
    return values.length === 1 ? values[0] : ''
  }

  private namesMatch(left?: string | null, right?: string | null) {
    if (!left || !right) return false
    const a = fuzzyName(left)
    const b = fuzzyName(right)
    if (!a || !b) return false
    return a.includes(b) || b.includes(a)
  }

  private mergeContactFieldValues(
    incoming: string | null | undefined,
    existing: string | null | undefined,
    type: 'phone' | 'email',
  ) {
    return this.splitContactValues([incoming, existing].filter(Boolean).join(', '), type).join(', ')
  }

  private expandNewContactRows(contact?: { name?: string; phone?: string; email?: string }) {
    if (!contact) return [] as Array<{ name: string; phone: string | null; email: string | null }>
    const names = this.splitContactValues(contact.name, 'name')
    const phones = this.splitContactValues(contact.phone, 'phone')
    const emails = this.splitContactValues(contact.email, 'email')
    const max = Math.max(names.length, phones.length, emails.length, 1)
    const rows: Array<{ name: string; phone: string | null; email: string | null }> = []

    for (let i = 0; i < max; i += 1) {
      const name = this.pickAlignedContactValue(names, i) || 'Yeni İletişim'
      const phone = this.pickAlignedContactValue(phones, i) || null
      const email = this.pickAlignedContactValue(emails, i) || null
      if (!name && !phone && !email) continue
      rows.push({ name, phone, email })
    }

    const seen = new Set<string>()
    return rows.filter((row) => {
      const key = `${row.name.toLowerCase()}|${row.phone || ''}|${row.email || ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  async detail(id: string) {
    const task: any = await this.prisma.task.findUnique({
      where: { id },
      include: {
        account: {
          select: {
            id: true,
            accountName: true,
            businessName: true,
            city: true,
            district: true,
            ...this.accountPrimaryContactInclude(),
          },
        } as any,
        owner: { select: { id: true, name: true, email: true } },
        logs: { include: { author: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'desc' }, take: 100 },
        offers: { orderBy: { createdAt: 'desc' } },
        ...this.taskContactInclude(),
      },
    })
    if (!task) throw new NotFoundException('Task not found')
    const nextCallDate = task.logs?.[0]?.followUpDate || null
    return { ...task, ...this.mapTaskListItem(task), ...this.resolveSpecificContact(task), nextCallDate }
  }

  async create(user: { id: string; role: string }, dto: CreateTaskDto) {
    if (user.role === 'SALESPERSON') {
      // Sales kullanıcı sadece kendisine (veya ownersız) task açabilsin.
      if (dto.ownerId && dto.ownerId !== user.id) {
        throw new ForbiddenException('Sales users can only create tasks for themselves')
      }
      if (!dto.ownerId) dto.ownerId = user.id
    }

    if (dto.externalRef) {
      const existingByExternalRef = await this.prisma.task.findFirst({
        where: { externalRef: dto.externalRef },
      })
      if (existingByExternalRef) return existingByExternalRef
    }

    const parseCategory = (c: any) => {
      const s = String(c).toUpperCase()
      if (s.includes('ANADOLU')) return 'ANADOLU_CORE'
      if (s.includes('TRAVEL')) return 'TRAVEL'
      return 'ISTANBUL_CORE'
    }
    const parseSource = (s: any) => {
      return normalizeAccountSource(s)
    }
    dto.category = parseCategory(dto.category) as any
    dto.source = parseSource(dto.source) as any
    const initialStatus = this.parseTaskStatus(dto.status)
    ;(dto as any).status = initialStatus
    ;(dto as any).generalStatus = (initialStatus === 'DEAL' || initialStatus === 'COLD') ? 'CLOSED' : 'OPEN'

    // Resolve task list early
    let list;
    if (dto.taskListId) {
      list = await this.prisma.taskList.findUnique({ where: { id: dto.taskListId } })
      if (!list) throw new NotFoundException('Task list not found')
    } else {
      // Find default list matching the task type
      const targetTag = dto.type === 'PROJECT' ? 'PROJECT' : 'GENERAL'
      list = await this.prisma.taskList.findFirst({ where: { tag: targetTag, isActive: true } })
      if (!list) throw new NotFoundException(`No active task list found for type: ${dto.type}`)
    }

    const account = await this.prisma.account.findUnique({ where: { id: dto.accountId }, select: { id: true } })
    if (!account) throw new BadRequestException('Account not found for task creation')
    // Enforce type consistency with TaskList tag
    if ((list.tag as any) !== dto.type) {
      throw new BadRequestException('Task type must match the TaskList tag')
    }
    if (dto.ownerId) {
      const owner = await this.prisma.user.findUnique({ where: { id: dto.ownerId } })
      if (!owner || owner.role !== 'SALESPERSON') {
        throw new BadRequestException('Owner must be an active SALESPERSON user')
      }
    }
    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: dto.projectId }, select: { id: true } })
      if (!project) throw new BadRequestException('Project not found for task creation')
    }

    // General rule: if type is GENERAL, there must be no OPEN task for same account (in any list)
    if (dto.type === 'GENERAL') {
      const existingOpen = await this.prisma.task.findFirst({
        where: { accountId: dto.accountId, type: 'GENERAL', generalStatus: 'OPEN' },
      })
      if (existingOpen) throw new BadRequestException('This account already has an OPEN General task')
    }

    const listId = list.id

    const task = await this.prisma.$transaction(async (tx) => {
      const taskCreateData: any = {
          taskListId: listId,
          projectId: dto.projectId ?? null,
          accountId: dto.accountId,
          ownerId: dto.ownerId ?? null,
          createdById: user.id,
          category: dto.category,
          type: dto.type,
          priority: dto.priority,
          accountType: dto.accountType,
          creationChannel: dto.creationChannel ?? 'UNKNOWN',
          source: dto.source,
          mainCategory: dto.mainCategory,
          subCategory: dto.subCategory,
          contact: dto.contact,
          details: dto.details ?? '',
          city: (dto as any).city ?? null,
          district: (dto as any).district ?? null,
          externalRef: dto.externalRef ?? null,
          campaignUrl: dto.campaignUrl ?? null,
          historicalAssignee: dto.historicalAssignee ?? null,
          durationDays: dto.durationDays ?? null,
          assignmentDate: dto.ownerId ? new Date() : null,
          dueDate: dto.ownerId && dto.durationDays ? new Date(Date.now() + dto.durationDays * 86400000) : null,
          status: (dto as any).status ?? 'NEW',
          generalStatus: (dto as any).generalStatus ?? 'OPEN',
          poolTeam: 'GENERAL',
          creationDate: (dto.creationDate && !isNaN(new Date(dto.creationDate).getTime())) ? new Date(dto.creationDate) : new Date(),
      }
      const createdTask = await tx.task.create({
        data: taskCreateData,
      })

      await tx.activityHistory.create({
        data: { accountId: dto.accountId, type: 'TASK_OPEN', summary: `Task ${createdTask.id} opened by ${user.id}` },
      })

      const newContactRows = this.expandNewContactRows(dto.newContact)
      if (newContactRows.length > 0) {
        for (let i = 0; i < newContactRows.length; i += 1) {
          const row = newContactRows[i]
          const createdContact = await tx.accountContact.create({
            data: {
              accountId: dto.accountId,
              type: 'PERSON',
              name: row.name,
              phone: row.phone,
              email: row.email,
              isPrimary: false,
            },
          })

          await tx.taskContact.create({
            data: {
              taskId: createdTask.id,
              contactId: createdContact.id,
              isPrimary: i === 0,
            },
          })
        }
        await tx.activityLog.create({
          data: {
            taskId: createdTask.id,
            authorId: user.id,
            reason: 'TEKRAR_ARANACAK',
            text: `<span class="manager-note">[Sistem]</span> Yeni iletişim bilgisi eklendi: ${newContactRows[0]?.name || '-'} - ${newContactRows[0]?.phone || '-'}`,
          }
        })
      }

      if (shouldCreateInitialTaskNote(dto.details, dto.systemLogText)) {
        await tx.activityLog.create({
          data: {
            taskId: createdTask.id,
            authorId: user.id,
            reason: 'TEKRAR_ARANACAK',
            text: `<span class="manager-note">[Görev Notu]</span> ${dto.details}`,
          }
        })
      }

      if (dto.systemLogText && dto.systemLogText.trim() !== '') {
        await tx.activityLog.create({
          data: {
            taskId: createdTask.id,
            authorId: user.id,
            reason: 'TEKRAR_ARANACAK',
            text: dto.systemLogText.trim(),
          }
        })
      }

      if (dto.offers && dto.offers.length > 0) {
        for (const offer of dto.offers) {
          const offerLog = await tx.activityLog.create({
            data: {
              taskId: createdTask.id,
              authorId: user.id,
              reason: 'TEKLIF_VERILDI',
              text: `<span class="manager-note">[Teklif]</span> Komisyon: ${offer.commission || '-'}, Hizmet Bedeli: ${offer.adFee || '-'}, Joker: ${offer.joker || '-'}`,
            }
          })
          await tx.offer.create({
            data: {
              taskId: createdTask.id,
              activityLogId: offerLog.id,
              adFee: offer.adFee != null ? Number(offer.adFee) : null,
              commission: offer.commission != null ? Number(offer.commission) : null,
              joker: offer.joker != null ? Number(offer.joker) : null,
              type: 'OUR_OFFER',
              status: 'PENDING',
              createdById: user.id,
            }
          })
        }
      }

      if (!dto.systemLogText || dto.systemLogText.trim() === '') {
        let ownerName = 'Havuza Atıldı'
        if (createdTask.ownerId) {
          const owner = await tx.user.findUnique({ where: { id: createdTask.ownerId }, select: { name: true } })
          ownerName = owner?.name || createdTask.ownerId
        }

        await tx.activityLog.create({
          data: {
            taskId: createdTask.id,
            authorId: user.id,
            reason: 'TEKRAR_ARANACAK',
            text: `<span class="manager-note">[Sistem]</span> Görev atandı: Hedef -> ${ownerName}`,
          }
        })
      }

      return createdTask
    })

    await this.audit?.log({ entityType: 'TASK', entityId: task.id, action: 'CREATE', userId: user.id, newData: task })

    // Notify owner if created as assigned
    if (task.ownerId) {
      const due = task.dueDate ? ` (due ${task.dueDate.toISOString().slice(0, 10)})` : ''
      await this.notifications?.createAndPublish({ taskId: task.id, toUserId: task.ownerId, message: `Task assigned to you${due}` })
    }

    return task
  }

  async bulkImport(rows: any[], user: { id: string; role: string }) {
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('No data provided');

    const findHeader = (row: any, ...keys: string[]) => {
      const normalizedRow: any = {}
      for (const [k, v] of Object.entries(row)) {
        const cleanK = String(k).toLowerCase().replace(/[\s\-_]/g, '')
        normalizedRow[cleanK] = v
      }
      for (const k of keys) {
        const cleanK = k.toLowerCase().replace(/[\s\-_]/g, '')
        if (normalizedRow[cleanK] !== undefined && normalizedRow[cleanK] !== null) {
          return normalizedRow[cleanK]
        }
      }
      return ''
    }

    let addedBizCount = 0
    let addedTaskCount = 0

    const listCache = new Map<string, string>()
    const getListId = async (type: 'GENERAL' | 'PROJECT') => {
      if (listCache.has(type)) return listCache.get(type)!
      const lst = await this.prisma.taskList.findFirst({ where: { tag: type } })
      if (lst) {
        listCache.set(type, lst.id)
        return lst.id
      }
      return ''
    }

    const allUsers = await this.prisma.user.findMany({ select: { id: true, name: true, role: true } })
    const taskListId = await getListId('GENERAL')
    if (!taskListId) throw new BadRequestException('GENERAL task list not found')

    const localAccountCache = new Map<string, string>() // fuzzy name -> account id
    const existingAccounts = await this.prisma.account.findMany({ select: { id: true, businessName: true } })
    existingAccounts.forEach(acc => {
      const fuzzy = fuzzyName(acc.businessName)
      if (fuzzy) localAccountCache.set(fuzzy, acc.id)
    })

    const newAccountsToCreate = new Map<string, any>()
    const newContactsToCreate: any[] = []
    const newTasksToCreate: any[] = []
    const newActivityLogsToCreate: any[] = []
    
    // Pass 1: Gather and group
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rawCompanyName = findHeader(row, 'isletme', 'isletmeadi', 'firma', 'sube', 'company', 'companyname', 'business', 'merchant')
        if (!rawCompanyName || rawCompanyName.trim().length < 3) continue

        const companyName = toTitleCase(rawCompanyName.replace(/\s*\(\d{1,2}[-./]\d{1,2}[-./]\d{2,4}\)\s*/g, '').replace(/\s*\(Tarihsiz\)\s*/gi, '').trim())
        const normalizedBizName = fuzzyName(companyName)
        if (!normalizedBizName) continue

        const city = findHeader(row, 'il', 'sehir', 'city') || 'İstanbul'
        const district = findHeader(row, 'ilce', 'district')
        const address = findHeader(row, 'adres', 'address')
        const rawMainCat = findHeader(row, 'anakategori', 'maincategory', 'maincat') || ''
        const rawSubCat = findHeader(row, 'altkategori', 'subcategory', 'subcat') || ''
        
        const rawContactName = findHeader(row, 'yetkili', 'isim', 'adsoyad', 'contact', 'contactname')
        const rawPhone = findHeader(row, 'telefon', 'iletisim', 'phone', 'gsm', 'contactphone')
        const rawEmail = findHeader(row, 'eposta', 'email', 'mail', 'contactemail')
        
        const rawCampaignUrl = findHeader(row, 'kampanyalinki', 'campaign', 'link', 'kampanya', 'campaignurl')
        const rawWebsite = findHeader(row, 'web', 'websitesi', 'internet', 'website')
        const rawInstagram = findHeader(row, 'instagram', 'insta', 'sosyal')
        
        const rawAssignee = findHeader(row, 'satisci', 'sorumlu', 'owner', 'assignee') || row._defaultAssignee || ''
        const rawId = findHeader(row, 'taskid', 'gorevid', 'gorevno', 'id')
        const rawDate = findHeader(row, 'tarih', 'taskyaratma', 'gorevtarihi', 'createdat')
        const rawAranacakTarih = findHeader(row, 'aranacak', 'aranacaktarih', 'nextcall', 'sonrakigorusme', 'takip', 'takiptarihi')
        const notlar = findHeader(row, 'loglama', 'gorusme', 'log', 'not', 'notlar')
        const durum = findHeader(row, 'durum', 'status', 'oncelik')

        const { mainCat, subCat } = matchCategoryRules(companyName, rawMainCat, rawSubCat)

        let accountId = localAccountCache.get(normalizedBizName)
        if (!accountId) {
          accountId = 'tmp_' + normalizedBizName
          localAccountCache.set(normalizedBizName, accountId)
          newAccountsToCreate.set(normalizedBizName, {
             id: accountId,
             accountName: companyName,
             businessName: companyName,
             category: mainCat,
             source: 'OLD',
             type: 'KEY',
             city: city,
             district: district || null,
             address: address || null,
             status: 'ACTIVE',
             website: rawWebsite || null,
             instagram: rawInstagram || null,
             campaignUrl: rawCampaignUrl || null,
          })
        }

        const contactNames = rawContactName ? String(rawContactName).split(/[,/]/).map(s => toTitleCase(s.trim())).filter(Boolean) : [];
        const contactPhones = rawPhone ? String(rawPhone).split(/[,/]/).map(s => s.trim()).filter(Boolean) : [];
        const contactEmails = rawEmail ? String(rawEmail).split(/[,/]/).map(s => s.trim().toLowerCase()).filter(Boolean) : [];
        const primaryContactName = contactNames[0] || '';
        const primaryContactPhone = contactPhones[0] || '';

        let contactStr = undefined
        if (primaryContactName || primaryContactPhone || contactEmails[0]) {
           contactStr = `${primaryContactName || 'Yetkili'}${primaryContactPhone ? ` (${primaryContactPhone})` : ''}`
           
           const maxContacts = Math.max(contactNames.length, contactPhones.length, contactEmails.length, 1);
           for (let j = 0; j < maxContacts; j++) {
               const cName = contactNames[j] || 'Yetkili';
               const cPhone = contactPhones[j] || null;
               const cEmail = contactEmails[j] || null;
               
               if (cName !== 'Yetkili' || cPhone || cEmail) {
                   newContactsToCreate.push({
                       accountId,
                       type: 'PERSON',
                       name: cName,
                       phone: cPhone,
                       email: cEmail,
                       isPrimary: j === 0
                   })
               }
           }
        }

        let taskStatus: any = 'NEW'
        let generalStatus: any = 'OPEN'
        const rawDurum = String(durum).toLowerCase().replace(/[\s_,-]/g, '')
        if (rawDurum.includes('deal') || rawDurum.includes('anlas') || rawDurum.includes('satis')) { taskStatus = 'DEAL'; generalStatus = 'CLOSED' }
        else if (rawDurum.includes('cold') || rawDurum.includes('iptal') || rawDurum.includes('soguk')) { taskStatus = 'COLD'; generalStatus = 'CLOSED' }
        else if (rawDurum.includes('nothot') || rawDurum.includes('ilik')) taskStatus = 'NOT_HOT'
        else if (rawDurum.includes('hot') || rawDurum.includes('sicak')) taskStatus = 'HOT'
        else if (rawDurum.includes('follow') || rawDurum.includes('takip') || rawDurum.includes('yeni') || rawDurum.includes('new')) taskStatus = 'NEW' 

        let assigneeId = null
        let historicalAssigneeName = null
        if (rawAssignee && rawAssignee !== 'UNASSIGNED' && rawAssignee !== 'TARGET_POOL') {
            const fuzzyUser = allUsers.find(u => u.name && typeof u.name === 'string' && u.name.toLowerCase() === rawAssignee.toLowerCase())
            if (fuzzyUser) {
              assigneeId = fuzzyUser.id
            } else {
              historicalAssigneeName = toTitleCase(rawAssignee)
            }
        }

        let creationDate = new Date()
        let isDateFound = false
        if (rawDate) {
            const trDateMatch = String(rawDate).match(/^(\d{1,2})[\.\/-](\d{1,2})[\.\/-](\d{2,4})/)
            if (trDateMatch) {
                const d = Number(trDateMatch[1])
                const m = Number(trDateMatch[2]) - 1
                let y = Number(trDateMatch[3])
                if (y < 100) y += 2000
                creationDate = new Date(y, m, d, 12, 0, 0)
                isDateFound = true
            } else if (!isNaN(new Date(rawDate).getTime())) {
                creationDate = new Date(rawDate)
                isDateFound = true
            }
        }
        
        if (!isDateFound && notlar) {
            const logDateMatch = String(notlar).match(/(\d{1,2})[\.\/-](\d{1,2})[\.\/-](\d{2,4})/)
            if (logDateMatch) {
                const d = Number(logDateMatch[1])
                const m = Number(logDateMatch[2]) - 1
                let y = Number(logDateMatch[3])
                if (y < 100) y += 2000
                creationDate = new Date(y, m, d, 12, 0, 0)
                isDateFound = true
            }
        }

        if (!isDateFound) {
            creationDate = new Date(2000, 0, 1, 12, 0, 0) // 1 Jan 2000 (Archive)
        }

        let dueDate = null
        if (rawAranacakTarih) {
            const aranacakMatch = String(rawAranacakTarih).match(/^(\d{1,2})[\.\/-](\d{1,2})[\.\/-](\d{2,4})/)
            if (aranacakMatch) {
                const d = Number(aranacakMatch[1])
                const m = Number(aranacakMatch[2]) - 1
                let y = Number(aranacakMatch[3])
                if (y < 100) y += 2000
                dueDate = new Date(y, m, d, 12, 0, 0)
                if (taskStatus !== 'DEAL' && taskStatus !== 'COLD') taskStatus = 'FOLLOWUP' 
            } else if (!isNaN(new Date(rawAranacakTarih).getTime())) {
                dueDate = new Date(rawAranacakTarih)
                if (taskStatus !== 'DEAL' && taskStatus !== 'COLD') taskStatus = 'FOLLOWUP'
            }
        }

        const externalRef = rawId ? `CSV_TASK_${rawId}` : `CSV_ROW_${normalizedBizName}_${i}`

        newTasksToCreate.push({
             _tmpAccountId: accountId,
             taskListId,
             ownerId: assigneeId,
             createdById: user.id,
             category: 'ISTANBUL_CORE',
             type: 'GENERAL',
             priority: 'MEDIUM',
             accountType: 'KEY',
             source: 'OLD',
             mainCategory: mainCat.substring(0, 50),
             subCategory: subCat.substring(0, 50),
             contact: contactStr,
             details: notlar || 'CSV\'den aktarıldı',
             historicalAssignee: historicalAssigneeName,
             externalRef,
             status: taskStatus,
             generalStatus,
             creationDate,
             dueDate,
        })
    }

    // Step 2: Insert into DB atomically and map temporary IDs
    await this.prisma.$transaction(async (tx) => {
      // Check existing tasks to prevent duplicates inside transaction for strictness
      const existingRefs = await tx.task.findMany({
         where: { externalRef: { in: newTasksToCreate.map(t => t.externalRef) } },
         select: { externalRef: true }
      })
      const existingRefMap = new Set(existingRefs.map(t => t.externalRef))
      
      const realAccountIdMap = new Map<string, string>()

      // Create missing accounts safely
      for (const [fuzzy, accData] of newAccountsToCreate.entries()) {
         const createdAcc = await tx.account.create({
            data: {
               accountName: accData.accountName,
               businessName: accData.businessName,
               category: accData.category,
               source: accData.source,
               type: accData.type,
               city: accData.city,
               district: accData.district,
               address: accData.address,
               status: accData.status
            }
         })
         realAccountIdMap.set(accData.id, createdAcc.id)
         addedBizCount++
      }

      // Re-map tmp account ids
      for (const contact of newContactsToCreate) {
         if (realAccountIdMap.has(contact.accountId)) {
             contact.accountId = realAccountIdMap.get(contact.accountId)!
         }
      }
      for (const task of newTasksToCreate) {
         if (realAccountIdMap.has(task._tmpAccountId)) {
             task.accountId = realAccountIdMap.get(task._tmpAccountId)!
         } else {
             task.accountId = task._tmpAccountId
         }
      }

      // Create Contacts
      if (newContactsToCreate.length > 0) {
         await tx.accountContact.createMany({
            data: newContactsToCreate,
            skipDuplicates: true
         })
      }

      // Create Tasks
      const tasksToInsert = newTasksToCreate.filter(t => !existingRefMap.has(t.externalRef))
      for (const t of tasksToInsert) {
         const { _tmpAccountId, ...insertData } = t
         const createdTask = await tx.task.create({ data: insertData })
         addedTaskCount++
         
         if (insertData.details && insertData.details !== 'CSV\'den aktarıldı') {
            await tx.activityLog.create({
               data: {
                 taskId: createdTask.id,
                 authorId: user.id,
                 reason: insertData.dueDate ? 'TEKRAR_ARANACAK' : 'YETKILIYE_ULASILAMADI',
                 text: `<span class="manager-note">[Geçmiş Kayıt]</span> ${insertData.details}`,
                 createdAt: insertData.creationDate
               }
            })
         }
      }
    }, { maxWait: 30000, timeout: 120000 })

    return { message: `${addedBizCount} işletme, ${addedTaskCount} görev eklendi!`, addedBizCount, addedTaskCount }
  }

  async list(filter: any, user?: { id: string; role: string }) {
    const where: any = {}
    const mergeOrScope = (clauses: any[]) => {
      const nextClauses = (Array.isArray(clauses) ? clauses : []).filter(Boolean)
      if (!nextClauses.length) return
      const existingOr = Array.isArray(where.OR) ? [...where.OR] : null
      if (existingOr && existingOr.length) {
        delete where.OR
        where.AND = [...(Array.isArray(where.AND) ? where.AND : []), { OR: existingOr }, { OR: nextClauses }]
        return
      }
      where.OR = nextClauses
    }
    if (filter.taskListId) where.taskListId = filter.taskListId
    if (filter.projectId) where.projectId = filter.projectId
    const assignee = filter.assigneeId ?? filter.ownerId
    if (assignee !== undefined) {
      if (assignee === 'null') where.ownerId = null
      else if (assignee) where.ownerId = assignee
    }
    // Pool convention: ownerId null = general pool
    if (filter.pool) {
      const pool = String(filter.pool).toUpperCase()
      if (pool === 'GENERAL') where.ownerId = null
      if (pool === 'ASSIGNED' && where.ownerId === undefined) where.ownerId = { not: null }
    }
    if (filter.poolTeam) {
      where.poolTeam = String(filter.poolTeam).toUpperCase()
    }
    if (filter.priority) where.priority = filter.priority
    if (filter.category) where.category = filter.category
    if (filter.accountType) where.accountType = filter.accountType
    if (filter.source) {
      const sourceValues = String(filter.source)
        .split(',')
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .map((value) => normalizeAccountSource(value))
      if (sourceValues.length === 1) where.source = sourceValues[0]
      else if (sourceValues.length > 1) where.source = { in: sourceValues as any }
    }
    if (filter.historicalAssignee) where.historicalAssignee = { contains: String(filter.historicalAssignee), mode: 'insensitive' }
    if (filter.mainCategory) where.mainCategory = { contains: String(filter.mainCategory), mode: 'insensitive' }
    if (filter.subCategory) where.subCategory = { contains: String(filter.subCategory), mode: 'insensitive' }
    if (filter.status) {
      const raw = (filter.status as any)
      let arr: string[] = []
      if (Array.isArray(raw)) arr = raw as string[]
      else if (typeof raw === 'string') arr = raw.split(',').map((s) => s.trim()).filter(Boolean)
      if (arr.length === 1) where.status = arr[0]
      else if (arr.length > 1) where.status = { in: arr as any }
    }
    if (filter.city) where.city = { contains: String(filter.city), mode: 'insensitive' }
    if (filter.district) where.district = { contains: String(filter.district), mode: 'insensitive' }
    if (filter.generalStatus) where.generalStatus = filter.generalStatus
    if (filter.createdFrom || filter.createdTo) {
      where.creationDate = {}
      if (filter.createdFrom) where.creationDate.gte = new Date(filter.createdFrom)
      if (filter.createdTo) {
        const toDate = new Date(filter.createdTo)
        toDate.setHours(23, 59, 59, 999)
        where.creationDate.lte = toDate
      }
    }
    const teamId = filter.teamId ?? filter.teamLeaderId ?? filter.team
    if (teamId && where.ownerId !== null) {
      where.owner = {
        is: {
          role: 'SALESPERSON',
          OR: [
            { managerId: String(teamId) },
            { team: String(teamId) },
          ],
        },
      } as any
    }
    if (filter.q) {
      const q = String(filter.q)
      where.OR = [
        { id: { contains: q, mode: 'insensitive' } },
        { account: { accountName: { contains: q, mode: 'insensitive' } } },
        { account: { businessContact: { contains: q, mode: 'insensitive' } } },
        { account: { contactPerson: { contains: q, mode: 'insensitive' } } },
        { account: { contacts: { some: { OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ] } } } },
        { details: { contains: q, mode: 'insensitive' } },
      ]
    }
    if (filter.activityReason) {
      where.logs = { some: { reason: String(filter.activityReason) as any } }
    }
    if (filter.noActivity && String(filter.noActivity) !== '0' && String(filter.noActivity).toLowerCase() !== 'false') {
      where.logs = { none: {} }
    }
    // Scope by role
    if (user) {
      if (user.role === 'SALESPERSON') {
        // Sales reps still operate only on their own tasks for write actions,
        // but business/archive/report surfaces need the full task history so
        // the same detail view can be rendered for every role.
      } else if (user.role === 'MANAGER') {
        const hasDirectSales = await this.managerHasDirectSales(user.id)
        // Historical assignee rows are ownerless archive imports; keep them visible for reports/filters.
        if (!(where.ownerId === null)) {
          mergeOrScope([
            { owner: { is: hasDirectSales ? { managerId: user.id, role: 'SALESPERSON' } : { role: 'SALESPERSON' } } as any },
            { historicalAssignee: { not: null } },
          ])
        }
      } else if (user.role === 'TEAM_LEADER') {
        const actorTeam = await this.getActorTeam(user.id)
        const actorPoolTeam = this.mapTeamToPoolTeam(actorTeam)
        if (!(where.ownerId === null)) {
          mergeOrScope(actorTeam
            ? [
                { owner: { is: { team: actorTeam, role: 'SALESPERSON' } } as any },
                ...(actorPoolTeam ? [{ ownerId: null, poolTeam: actorPoolTeam }] : []),
                { historicalAssignee: { not: null } },
              ]
            : [{ historicalAssignee: { not: null } }])
        }
      } else {
        // ADMIN and others: no extra restriction
      }
    }

    const isSummaryView = String(filter.view || '').toLowerCase() === 'summary'
    const page = filter.page ? Number(filter.page) : undefined
    const limitCap = isSummaryView ? 250 : 100
    const limit = filter.limit ? Math.min(Number(filter.limit), limitCap) : undefined
    const sort = String(filter.sort || '').toLowerCase()
    const orderBy: any = sort === 'oldest' ? { creationDate: 'asc' } : { creationDate: 'desc' }
    const useOpenActivitySort = isSummaryView && String(filter.generalStatus || '').toUpperCase() === 'OPEN'
    if (page && limit) {
      const skip = (page - 1) * limit
      if (useOpenActivitySort) {
        const rawItems = await this.prisma.task.findMany({
          where,
          orderBy: { creationDate: 'desc' },
          select: this.buildSummaryTaskSelect(),
        } as any)
        const sortedItems = sort === 'oldest'
          ? this.sortOldestOpenTasks(rawItems)
          : this.sortHybridOpenTasks(rawItems)
        const pagedItems = sortedItems.slice(skip, skip + limit)
        const itemsMapped = pagedItems.map((t: any) => this.mapTaskListItem(t))
        return { items: itemsMapped, total: sortedItems.length, page, limit }
      }
      const pagedQuery: any = isSummaryView
        ? {
            where,
            orderBy,
            take: limit,
            skip,
            select: this.buildSummaryTaskSelect(),
          }
        : {
            where,
            orderBy,
            take: limit,
            skip,
            include: {
              account: { select: { accountName: true, ...this.accountPrimaryContactInclude() } as any },
              owner: { select: { id: true, name: true, email: true } },
              logs: { orderBy: { createdAt: 'desc' }, take: 1, select: { reason: true, followUpDate: true, text: true, createdAt: true } },
              ...this.taskContactInclude(),
            },
          }
      const [items, total] = await this.prisma.$transaction([
        this.prisma.task.findMany(pagedQuery),
        this.prisma.task.count({ where }),
      ])
      const itemsMapped = items.map((t: any) => this.mapTaskListItem(t))
      return { items: itemsMapped, total, page, limit }
    }
    const listQuery: any = isSummaryView
      ? {
          where,
          orderBy,
          take: 50,
          select: this.buildSummaryTaskSelect(),
        }
      : {
          where,
          orderBy,
          take: 50,
          include: {
            account: { select: { accountName: true, ...this.accountPrimaryContactInclude() } as any },
            owner: { select: { id: true, name: true, email: true } },
            logs: { orderBy: { createdAt: 'desc' }, take: 1, select: { reason: true, followUpDate: true, text: true, createdAt: true } },
            ...this.taskContactInclude(),
          },
        }
    const rawItems = await this.prisma.task.findMany(listQuery)
    const finalItems = useOpenActivitySort
      ? (sort === 'oldest' ? this.sortOldestOpenTasks(rawItems) : this.sortHybridOpenTasks(rawItems))
      : rawItems
    return finalItems.map((t: any) => this.mapTaskListItem(t))
  }

  async search(q: string, take = 10) {
    const tsQuery = buildPrefixTsQuery(q)
    const safeTake = Math.max(1, Math.min(Number(take) || 10, 25))
    const likeQuery = `%${String(q || '').trim()}%`
    if (tsQuery) {
      try {
        const items = await this.prisma.$queryRaw<Array<{ id: string; label: string }>>(Prisma.sql`
          SELECT
            t.id,
            CONCAT(COALESCE(a."accountName", t."accountId"), ' • ', COALESCE(t."externalRef", t.id)) AS label
          FROM "Task" t
          JOIN "Account" a ON a.id = t."accountId"
          WHERE
            to_tsvector('simple', concat_ws(' ', COALESCE(t.id, ''), COALESCE(t.details, ''), COALESCE(t.contact, ''), COALESCE(t."externalRef", '')))
              @@ to_tsquery('simple', ${tsQuery})
            OR to_tsvector('simple', concat_ws(' ', COALESCE(a."accountName", ''), COALESCE(a."businessName", ''), COALESCE(a."contactPerson", ''), COALESCE(a."businessContact", '')))
              @@ to_tsquery('simple', ${tsQuery})
            OR t.id ILIKE ${likeQuery}
          ORDER BY t."creationDate" DESC
          LIMIT ${safeTake}
        `)
        if (items.length > 0) return items
      } catch {
        // Prisma fallback below keeps local/test environments working.
      }
    }

    const where: any = q ? {
      OR: [
        { id: { contains: q, mode: 'insensitive' } },
        { details: { contains: q, mode: 'insensitive' } },
        { account: { accountName: { contains: q, mode: 'insensitive' } } },
      ],
    } : {}
    const items = await this.prisma.task.findMany({ where, take: safeTake, orderBy: { creationDate: 'desc' }, include: { account: { select: { accountName: true } } } })
    return items.map((t: any) => ({ id: t.id, label: `${t.account?.accountName || t.accountId} • ${t.externalRef || t.id}` }))
  }

  async assign(user: { id: string; role: string }, id: string, body: AssignTaskDto) {
    const [task, actor, owner] = await Promise.all([
      this.prisma.task.findUnique({ where: { id } }),
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, role: true, team: true, managerId: true, isActive: true, name: true },
      }),
      this.prisma.user.findUnique({
        where: { id: body.ownerId },
        select: { id: true, role: true, team: true, managerId: true, isActive: true, name: true },
      }),
    ])
    if (!task) throw new NotFoundException('Task not found')
    const rawStatus = String(task.status || '').toUpperCase()
    const isLegacyOpenStatus = ['NEW', 'HOT', 'NOT_HOT', 'FOLLOWUP'].includes(rawStatus)
    const isClosedStatus = ['DEAL', 'COLD'].includes(rawStatus)
    if (isClosedStatus || (task.generalStatus === 'CLOSED' && !isLegacyOpenStatus)) {
      throw new BadRequestException('Closed tasks cannot be reassigned')
    }
    if (!actor) throw new ForbiddenException('User not found')
    if (!owner || !owner.isActive || owner.role !== 'SALESPERSON') {
      throw new BadRequestException('Target owner must be an active SALESPERSON user')
    }
    if (user.role === 'TEAM_LEADER') {
      const actorTeam = String(actor.team || '').trim()
      const ownerTeam = String(owner.team || '').trim()
      if (!actorTeam || !ownerTeam || actorTeam !== ownerTeam) {
        throw new ForbiddenException('Team leaders can only assign tasks within their own team')
      }
    }
    if (task.ownerId && task.ownerId === owner.id) {
      throw new BadRequestException('Task is already assigned to this user')
    }

    const assignmentDate = new Date()
    const durationDays = Number(body.durationDays || task.durationDays || 7)
    const dueDate = new Date(assignmentDate.getTime() + durationDays * 86400000)
    const previousOwner = task.ownerId
      ? await this.prisma.user.findUnique({ where: { id: task.ownerId }, select: { id: true, name: true } })
      : null
    const note = String(body.note || '').trim()
    const fromLabel = previousOwner?.name || task.historicalAssignee || 'Havuz'
    const toLabel = owner.name || owner.id
    const summarySuffix = note ? ` | Not: ${note}` : ''
    const updated = await this.prisma.$transaction(async (tx) => {
      const nextTask = await tx.task.update({
        where: { id },
        data: {
          ownerId: body.ownerId,
          durationDays,
          assignmentDate,
          dueDate,
          poolTeam: 'GENERAL',
          ...(isLegacyOpenStatus ? { generalStatus: 'OPEN' as any, closedAt: null, closedReason: null } : {}),
        },
      })
      await tx.activityLog.create({
        data: {
          taskId: id,
          authorId: user.id,
          reason: 'GORUSME',
          text: `<span class="manager-note">[Devir]</span> ${fromLabel} → ${toLabel}${note ? ` | ${note}` : ''}`,
        },
      })
      await tx.activityHistory.create({
        data: { accountId: task.accountId, type: 'PROFILE_UPDATE', summary: `Task ${task.id} reassigned from ${fromLabel} to ${toLabel}${summarySuffix}` },
      })
      return nextTask
    })
    await this.audit?.log({ entityType: 'TASK', entityId: id, action: 'UPDATE', userId: user.id, previousData: task, newData: updated })
    // Notify the new owner
    if (updated.ownerId) {
      const due = updated.dueDate ? ` (due ${updated.dueDate.toISOString().slice(0, 10)})` : ''
      await this.notifications?.createAndPublish({ taskId: updated.id, toUserId: updated.ownerId, message: `Task assigned to you${due}${note ? ` • ${note}` : ''}` })
    }
    return updated
  }

  async setPool(user: { id: string; role: string }, id: string, poolTeam: 'GENERAL' | 'TEAM_1' | 'TEAM_2') {
    const task = await this.prisma.task.findUnique({ where: { id } })
    if (!task) throw new NotFoundException('Task not found')
    if (user.role === 'SALESPERSON') {
      if (task.ownerId !== user.id) {
        throw new ForbiddenException('Only owner can move this task to pool')
      }
      if (poolTeam !== 'GENERAL') {
        throw new ForbiddenException('Sales users can only move tasks to GENERAL pool')
      }
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        poolTeam,
        ownerId: null,
        durationDays: null,
        assignmentDate: null,
        dueDate: null,
      },
    })
    await this.audit?.log({ entityType: 'TASK', entityId: id, action: 'UPDATE', userId: user.id, previousData: task, newData: updated })
    await this.prisma.activityHistory.create({
      data: { accountId: task.accountId, type: 'PROFILE_UPDATE', summary: `Task ${task.id} moved to pool ${poolTeam}` },
    })
    return updated
  }

  private ensureSalespersonOwns(user: { id: string; role: string }, task: { ownerId: string | null }) {
    if (user.role === 'SALESPERSON' && task.ownerId !== user.id) {
      throw new ForbiddenException('Only owner can update this task')
    }
  }

  private ensureActivityAuthorOrPrivileged(user: { id: string; role: string }, log: { authorId: string | null }) {
    if (user.role === 'SALESPERSON' && log.authorId !== user.id) {
      throw new ForbiddenException('Only author can modify this log')
    }
  }

  private isEditableActivityLog(log: { reason?: string | null; text?: string | null }) {
    const reason = String(log?.reason || '').trim().toUpperCase()
    if (IMMUTABLE_ACTIVITY_REASONS.has(reason)) return false
    const text = String(log?.text || '')
    return !IMMUTABLE_ACTIVITY_TEXT_MARKERS.some((marker) => text.includes(marker))
  }

  async upsertFocusContact(user: { id: string; role: string }, id: string, dto: TaskFocusContactDto) {
    const normalizedPhone = dto.phone ? this.splitContactValues(dto.phone, 'phone')[0] || null : null
    const normalizedEmail = dto.email ? this.splitContactValues(dto.email, 'email')[0] || null : null
    const normalizedName = dto.name ? toTitleCase(dto.name.trim()) : ''
    if (!normalizedPhone && !normalizedEmail) {
      throw new BadRequestException('Phone or email is required')
    }

    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        account: {
          include: {
            contacts: {
              where: { type: 'PERSON' as any },
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            },
          },
        },
        taskContacts: {
          include: { contact: true },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    })
    if (!task) throw new NotFoundException('Task not found')
    this.ensureSalespersonOwns(user, task)

    const contacts = Array.isArray(task.account?.contacts) ? task.account.contacts : []
    const currentPrimary = contacts.find((c: any) => c.isPrimary) || contacts[0] || null
    const extraContacts = contacts.filter((c: any) => !currentPrimary || c.id !== currentPrimary.id)

    let chosenContactId: string | null = null

    await this.prisma.$transaction(async (tx) => {
      if (this.namesMatch(normalizedName, currentPrimary?.name) || (!normalizedName && (normalizedPhone || normalizedEmail))) {
        if (currentPrimary) {
          const mergedPhone = normalizedPhone
            ? this.mergeContactFieldValues(normalizedPhone, currentPrimary.phone, 'phone')
            : currentPrimary.phone
          const mergedEmail = normalizedEmail
            ? this.mergeContactFieldValues(normalizedEmail, currentPrimary.email, 'email')
            : currentPrimary.email
          const updatedPrimary = await tx.accountContact.update({
            where: { id: currentPrimary.id },
            data: {
              name: normalizedName || currentPrimary.name || 'İsimsiz / Genel',
              phone: mergedPhone || null,
              email: mergedEmail || null,
              isPrimary: true,
            },
          })
          chosenContactId = updatedPrimary.id
        } else {
          const createdPrimary = await tx.accountContact.create({
            data: {
              accountId: task.accountId,
              type: 'PERSON',
              name: normalizedName || 'İsimsiz / Genel',
              phone: normalizedPhone,
              email: normalizedEmail,
              isPrimary: true,
            },
          })
          chosenContactId = createdPrimary.id
        }
      } else {
        const matchedExtra = extraContacts.find((contact: any) => this.namesMatch(normalizedName, contact.name))
        await tx.accountContact.updateMany({
          where: { accountId: task.accountId, type: 'PERSON' as any },
          data: { isPrimary: false },
        })

        if (matchedExtra) {
          const mergedPhone = normalizedPhone
            ? this.mergeContactFieldValues(normalizedPhone, matchedExtra.phone, 'phone')
            : matchedExtra.phone
          const mergedEmail = normalizedEmail
            ? this.mergeContactFieldValues(normalizedEmail, matchedExtra.email, 'email')
            : matchedExtra.email
          const updatedMatched = await tx.accountContact.update({
            where: { id: matchedExtra.id },
            data: {
              name: matchedExtra.name || normalizedName || 'Yeni Ana Yetkili',
              phone: mergedPhone || null,
              email: mergedEmail || null,
              isPrimary: true,
            },
          })
          chosenContactId = updatedMatched.id
        } else {
          const createdPrimary = await tx.accountContact.create({
            data: {
              accountId: task.accountId,
              type: 'PERSON',
              name: normalizedName || 'Yeni Ana Yetkili',
              phone: normalizedPhone,
              email: normalizedEmail,
              isPrimary: true,
            },
          })
          chosenContactId = createdPrimary.id
        }
      }

      if (!chosenContactId) return

      await tx.taskContact.updateMany({
        where: { taskId: id },
        data: { isPrimary: false },
      })
      const existingTaskContact = await tx.taskContact.findFirst({
        where: { taskId: id, contactId: chosenContactId },
      })
      if (existingTaskContact) {
        await tx.taskContact.update({
          where: { id: existingTaskContact.id },
          data: { isPrimary: true },
        })
      } else {
        await tx.taskContact.create({
          data: { taskId: id, contactId: chosenContactId, isPrimary: true },
        })
      }

      await tx.activityLog.create({
        data: {
          taskId: id,
          authorId: user.id,
          reason: 'GORUSME',
          text: `<span class="manager-note">[Sistem]</span> Görev içinden iletişim bilgisi eklendi/güncellendi: ${normalizedName || ''} ${normalizedPhone || ''} ${normalizedEmail || ''}`.trim(),
        },
      })
    })

    return this.detail(id)
  }

  async addActivity(user: { id: string; role: string }, id: string, dto: ActivityLogDto) {
    const task = await this.prisma.task.findUnique({ where: { id } })
    if (!task) throw new NotFoundException('Task not found')
    this.ensureSalespersonOwns(user, task)

    const log = await this.createActivityEntry(this.prisma as any, user, task, id, dto)
    await this.audit?.log({ entityType: 'TASK', entityId: id, action: 'UPDATE', userId: user.id, newData: { activityLogId: log.id, reason: dto.reason } })
    return log
  }

  private async createActivityEntry(
    tx: any,
    user: { id: string; role: string },
    task: { id: string; accountId: string; ownerId: string | null },
    id: string,
    dto: ActivityLogDto,
  ) {
    // Offer validation for certain reasons
    if ((dto.reason === 'TEKLIF_VERILDI' || dto.reason === 'KARSITEKLIF')) {
      if (dto.adFee == null || dto.commission == null || dto.joker == null) {
        throw new BadRequestException('Offer (adFee, commission, joker) is required for this reason')
      }
    }
    if (dto.reason === 'TEKRAR_ARANACAK' && !dto.followUpDate) {
      throw new BadRequestException('followUpDate is required for TEKRAR_ARANACAK')
    }

    const log = await tx.activityLog.create({
      data: {
        taskId: id,
        authorId: user.id,
        reason: dto.reason as Reason,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : undefined,
        text: dto.text,
      },
    })
    if (dto.reason === 'TEKRAR_ARANACAK') {
      await tx.task.update({
        where: { id },
        data: { status: 'FOLLOWUP' as any, generalStatus: 'OPEN' as any, closedAt: null, closedReason: null },
      })
    }
    
    if (dto.reason === 'ISLETME_KAPANMIS') {
      await tx.task.update({
        where: { id },
        data: { status: 'COLD' as any, generalStatus: 'CLOSED' as any, closedAt: new Date(), closedReason: 'ISLETME_KAPANMIS' },
      })
      await tx.account.update({
        where: { id: task.accountId },
        data: { status: 'PASSIVE' as any },
      })
      await tx.activityHistory.create({
        data: { accountId: task.accountId, type: 'PROFILE_UPDATE', summary: `Account marked PASSIVE because task ${id} logged ISLETME_KAPANMIS` }
      })
    }

    if (dto.adFee != null || dto.commission != null || dto.joker != null) {
      const type = dto.reason === 'TEKLIF_VERILDI' ? 'OUR_OFFER' : (dto.reason === 'KARSITEKLIF' ? 'COUNTER_OFFER' : null)
      await tx.offer.create({ data: { taskId: id, activityLogId: log.id, adFee: dto.adFee ?? null, commission: dto.commission ?? null, joker: dto.joker ?? null, type: (type as any) || null, status: 'PENDING' as any, createdById: user.id } })
    }
    // Update offer status when accepted/rejected
    if (dto.reason === 'TEKLIF_KABUL') {
      await tx.offer.updateMany({ where: { taskId: id }, data: { status: 'ACCEPTED' as any } })
    }
    if (dto.reason === 'TEKLIF_RED') {
      await tx.offer.updateMany({ where: { taskId: id }, data: { status: 'REJECTED' as any } })
    }
    return log
  }

  async setStatus(user: { id: string; role: string }, id: string, status: any, close?: boolean, closedReason?: string) {
    const task = await this.prisma.task.findUnique({ where: { id } })
    if (!task) throw new NotFoundException('Task not found')
    this.ensureSalespersonOwns(user, task)

    let generalStatus: GeneralStatus | undefined
    if (close) {
      if (!(status === 'DEAL' || status === 'COLD')) {
        throw new BadRequestException('Only DEAL or COLD tasks can be closed manually')
      }
      generalStatus = 'CLOSED'
    }

    const updated = await this.prisma.task.update({ where: { id }, data: { status, ...(generalStatus ? { generalStatus, closedAt: new Date(), closedReason: closedReason || null } : {}) } })
    await this.audit?.log({ entityType: 'TASK', entityId: id, action: 'UPDATE', userId: user.id, previousData: task, newData: updated })
    if (generalStatus === 'CLOSED') {
      await this.prisma.activityHistory.create({ data: { accountId: task.accountId, type: 'TASK_CLOSE', summary: `Task ${id} closed with status ${status}` } })
      // Notify owner on manual close
      if (task.ownerId) {
        await this.notifications?.createAndPublish({ taskId: id, toUserId: task.ownerId, message: `Task closed as ${status}` })
      }
    }
    return updated
  }

  async update(user: { id: string; role: string }, id: string, body: any) {
    return this.runWithMutationCache(user.id, id, body?.mutationKey, async () => {
      const task = await this.prisma.task.findUnique({ where: { id } })
      if (!task) throw new NotFoundException('Task not found')
      this.ensureSalespersonOwns(user, task)
      const list = await this.prisma.taskList.findUnique({ where: { id: task.taskListId } })
      // If type change is requested, it must match the parent TaskList tag
      if (body.type !== undefined) {
        if (list && (list.tag as any) !== body.type) {
          throw new BadRequestException('Task type must match the TaskList tag')
        }
        // If switching to GENERAL and task is OPEN, enforce uniqueness across account
        if (body.type === 'GENERAL' && task.generalStatus === ('OPEN' as any)) {
          const existingOpen = await this.prisma.task.findFirst({ where: { accountId: task.accountId, type: 'GENERAL', generalStatus: 'OPEN', NOT: { id } } })
          if (existingOpen) throw new BadRequestException('This account already has an OPEN General task')
        }
      }
      const data: any = {}
      if (body.projectId !== undefined) {
        if (body.projectId) {
          const project = await this.prisma.project.findUnique({ where: { id: body.projectId }, select: { id: true } })
          if (!project) throw new BadRequestException('Project not found for task update')
          data.projectId = body.projectId
        } else {
          data.projectId = null
        }
      }
      if (body.taskListId !== undefined) data.taskListId = body.taskListId
      if (body.campaignUrl !== undefined) data.campaignUrl = body.campaignUrl

      const parseCategory = (c: any) => {
        const s = String(c).toUpperCase()
        if (s.includes('ANADOLU')) return 'ANADOLU_CORE'
        if (s.includes('TRAVEL')) return 'TRAVEL'
        return 'ISTANBUL_CORE'
      }
      const parseSource = (s: any) => {
        return normalizeAccountSource(s)
      }

      const fields = ['category','type','priority','accountType','source','mainCategory','subCategory','city','district','contact','details']
      for (const k of fields) {
        if (body[k] !== undefined) {
          if (k === 'category') data[k] = parseCategory(body[k])
          else if (k === 'source') data[k] = parseSource(body[k])
          else data[k] = body[k]
        }
      }
      if (body.status !== undefined) {
        const rawStatus = this.parseTaskStatus(body.status)
        data.status = rawStatus
        if (rawStatus === 'DEAL' || rawStatus === 'COLD') {
          data.generalStatus = 'CLOSED'
          data.closedAt = new Date()
        } else {
          data.generalStatus = 'OPEN'
          data.closedAt = null
          data.closedReason = null
        }
      }

      const expectedUpdatedAt = body.expectedUpdatedAt ? new Date(body.expectedUpdatedAt) : null
      if (expectedUpdatedAt && Number.isNaN(expectedUpdatedAt.getTime())) {
        throw new BadRequestException('expectedUpdatedAt must be a valid ISO datetime')
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        let updatedTask: any
        if (expectedUpdatedAt) {
          const updateData = Object.keys(data).length > 0 ? data : { updatedAt: new Date() }
          const updateResult = await tx.task.updateMany({
            where: { id, updatedAt: expectedUpdatedAt },
            data: updateData,
          })
          if (updateResult.count === 0) {
            throw new ConflictException('Bu görev siz kaydetmeden hemen önce güncellendi. En güncel hali ekrana yüklendi; lütfen notunuzu tekrar kontrol edip yeniden kaydedin.')
          }
          updatedTask = await tx.task.findUnique({ where: { id } })
        } else {
          updatedTask = await tx.task.update({ where: { id }, data })
        }
        if (!updatedTask) throw new NotFoundException('Task not found')

        if (body.nextCallDate && body.activity?.reason !== 'TEKRAR_ARANACAK') {
          const latestFollowupLog = await tx.activityLog.findFirst({
            where: { taskId: id, reason: 'TEKRAR_ARANACAK' },
            orderBy: { createdAt: 'desc' },
          })
          if (latestFollowupLog) {
            await tx.activityLog.update({
              where: { id: latestFollowupLog.id },
              data: { followUpDate: new Date(body.nextCallDate) },
            })
          }
        }

        if (body.dealDetails) {
          const details = body.dealDetails || {}
          const commission = details.commission != null && details.commission !== '' ? Number(details.commission) : null
          const adFee = details.fee != null && String(details.fee).trim() !== '' && String(details.fee).toLowerCase() !== 'yok'
            ? Number(details.fee)
            : null
          const joker = details.joker != null && String(details.joker).trim() !== '' && String(details.joker).toLowerCase() !== 'yok'
            ? Number(details.joker)
            : null

          const dealLog = await tx.activityLog.create({
            data: {
              taskId: id,
              authorId: user.id,
              reason: 'GORUSME',
              text: `[Deal Sonucu] Komisyon: ${details.commission || '-'} | Süre: ${this.formatDealDuration(details.duration)} | Yayın Bedeli: ${details.fee || 'Yok'} | Joker: ${details.joker || 'Yok'} | Kampanya: ${details.campCount || '-'}`,
            },
          })

          if (commission != null || adFee != null || joker != null) {
            await tx.offer.create({
              data: {
                taskId: id,
                activityLogId: dealLog.id,
                adFee,
                commission,
                joker,
                type: 'OUR_OFFER',
                status: 'ACCEPTED',
                createdById: user.id,
              },
            })
          }
        }

        if (body.offers && body.offers.length > 0) {
          const userIds = [task.ownerId, task.createdById].filter(Boolean)
          const actionUser = userIds.length > 0 ? userIds[0] : null
          if (actionUser) {
            for (const offer of body.offers) {
              const offerLog = await tx.activityLog.create({
                data: {
                  taskId: updatedTask.id,
                  authorId: actionUser,
                  reason: 'TEKLIF_VERILDI',
                  text: `<span class="manager-note">[Teklif]</span> Komisyon: ${offer.commission || '-'}, Hizmet Bedeli: ${offer.adFee || '-'}, Joker: ${offer.joker || '-'}`,
                }
              })
              await tx.offer.create({
                data: {
                  taskId: updatedTask.id,
                  activityLogId: offerLog.id,
                  adFee: offer.adFee != null ? Number(offer.adFee) : null,
                  commission: offer.commission != null ? Number(offer.commission) : null,
                  joker: offer.joker != null ? Number(offer.joker) : null,
                  type: 'OUR_OFFER',
                  status: 'PENDING',
                  createdById: actionUser,
                }
              })
            }
          }
        }

        if (body.activity) {
          await this.createActivityEntry(tx, user, task, id, body.activity)
        }

        return updatedTask
      })

      await this.audit?.log({ entityType: 'TASK', entityId: id, action: 'UPDATE', userId: user.id, previousData: task, newData: updated })
      return updated
    })
  }

  async deleteActivity(user: { id: string; role: string }, taskId: string, logId: string) {
    const log = await this.prisma.activityLog.findUnique({ where: { id: logId } })
    if (!log || log.taskId !== taskId) throw new NotFoundException('Activity log not found')
    this.ensureActivityAuthorOrPrivileged(user, log)
    await this.prisma.$transaction([
      this.prisma.offer.deleteMany({ where: { activityLogId: logId } }),
      this.prisma.activityLog.delete({ where: { id: logId } }),
    ])
    await this.audit?.log({ entityType: 'TASK', entityId: taskId, action: 'UPDATE', userId: user.id, previousData: { deletedActivityLogId: logId } })
    return { ok: true }
  }

  async updateActivity(
    user: { id: string; role: string },
    taskId: string,
    logId: string,
    body: { text?: string; followUpDate?: string },
  ) {
    const log = await this.prisma.activityLog.findUnique({ where: { id: logId } })
    if (!log || log.taskId !== taskId) throw new NotFoundException('Activity log not found')
    this.ensureActivityAuthorOrPrivileged(user, log)
    if (!this.isEditableActivityLog(log)) {
      throw new BadRequestException('This activity log cannot be edited')
    }

    const data: Record<string, any> = {}
    if (body.text !== undefined) {
      const trimmedText = String(body.text || '').trim()
      if (!trimmedText) throw new BadRequestException('text is required')
      data.text = mergeEditedLogText(log.text, trimmedText)
    }
    if (body.followUpDate !== undefined) {
      if (String(log.reason || '').toUpperCase() !== 'TEKRAR_ARANACAK') {
        throw new BadRequestException('followUpDate can only be changed for TEKRAR_ARANACAK logs')
      }
      data.followUpDate = body.followUpDate ? new Date(body.followUpDate) : null
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No editable fields were provided')
    }

    const updated = await this.prisma.activityLog.update({
      where: { id: logId },
      data,
      include: { author: { select: { id: true, name: true, role: true } } },
    })
    await this.audit?.log({
      entityType: 'TASK',
      entityId: taskId,
      action: 'UPDATE',
      userId: user.id,
      previousData: { activityLogId: logId, text: log.text, followUpDate: log.followUpDate },
      newData: { activityLogId: logId, text: updated.text, followUpDate: updated.followUpDate },
    })
    return updated
  }

  async remove(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } })
    if (!task) throw new NotFoundException('Task not found')
    await this.prisma.$transaction([
      this.prisma.taskContact.deleteMany({ where: { taskId: id } }),
      this.prisma.offer.deleteMany({ where: { taskId: id } }),
      this.prisma.activityLog.deleteMany({ where: { taskId: id } }),
      this.prisma.notification.deleteMany({ where: { taskId: id } }),
      this.prisma.task.delete({ where: { id } }),
    ])
    await this.audit?.log({ entityType: 'TASK', entityId: id, action: 'DELETE', userId: undefined, previousData: task })
    return { ok: true }
  }
}

function fuzzyName(name: string): string {
  return (name || '').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9ğüşıöç]/g, '')
}

function toTitleCase(str: string): string {
  if (!str) return ''
  return str.toLocaleLowerCase('tr-TR').replace(/(?:^|\s)\S/g, (a) => a.toLocaleUpperCase('tr-TR'))
}

function matchCategoryRules(cleanCompanyName: string, rawMainCat: string, rawSubCat: string) {
  const textForMatch = (rawMainCat + " " + rawSubCat + " " + cleanCompanyName).toLocaleLowerCase('tr-TR')
  let actualMainCatKey = "Diğer"
  let finalSubCat = rawSubCat || "Belirtilmemiş"

  const fuzzyMatch = textForMatch.replace(/[ç]/g, 'c').replace(/[ğ]/g, 'g').replace(/[ı]/g, 'i').replace(/[ö]/g, 'o').replace(/[ş]/g, 's').replace(/[ü]/g, 'u')

  if (/masaj|spa|hamam|kese|wellness|refleksoloji|shiatsu/i.test(textForMatch)) {
    actualMainCatKey = "Masaj - Spa (Core)"
    if (/bali/i.test(textForMatch)) finalSubCat = "Bali Masajı"
    else if (/thai/i.test(textForMatch)) finalSubCat = "Thai Masajı"
    else if (/isveç|isvec/i.test(fuzzyMatch)) finalSubCat = "İsveç Masajı"
    else if (/köpük|kopuk|hamam/i.test(fuzzyMatch)) finalSubCat = "Hamam"
    else if (/çift|cift/i.test(fuzzyMatch)) finalSubCat = "Çift Masajı"
    else if (/otel/i.test(textForMatch)) finalSubCat = "Otel Spa"
    else if (/aroma/i.test(textForMatch)) finalSubCat = "Aromaterapi Masajı"
    else if (/bebek/i.test(textForMatch)) finalSubCat = "Bebek Spa"
    else finalSubCat = "Masaj"
  }
  else if (/kahvaltı|brunch|kahvalti/i.test(fuzzyMatch)) {
    actualMainCatKey = "Kahvaltı (Core)"
    if (/serpme/i.test(textForMatch)) finalSubCat = "Serpme Kahvaltı"
    else if (/açık büfe|acik bufe/i.test(fuzzyMatch)) finalSubCat = "Açık Büfe Kahvaltı"
    else if (/köy|koy/i.test(fuzzyMatch)) finalSubCat = "Köy Kahvaltısı"
    else if (/boğaz|bogaz/i.test(fuzzyMatch)) finalSubCat = "Boğazda Kahvaltı"
    else if (/tekne/i.test(textForMatch)) finalSubCat = "Teknede Kahvaltı"
    else if (/otel/i.test(textForMatch)) finalSubCat = "Otelde Kahvaltı"
    else if (/brunch/i.test(textForMatch)) finalSubCat = "Brunch"
    else finalSubCat = "Kahvaltı Tabağı"
  }
  else if (/(iftar|ramazan)/i.test(textForMatch) && !/bayram/i.test(textForMatch)) {
    actualMainCatKey = "İftar (Core)"
    if (/avrupa/i.test(textForMatch)) finalSubCat = "Avrupa Yakası İftar"
    else if (/anadolu/i.test(textForMatch)) finalSubCat = "Anadolu Yakası İftar"
    else if (/açık büfe|acik bufe/i.test(fuzzyMatch)) finalSubCat = "Açık Büfe İftar"
    else if (/tekne/i.test(textForMatch)) finalSubCat = "Teknede İftar"
    else if (/otel/i.test(textForMatch)) finalSubCat = "Otelde İftar"
    else finalSubCat = "Restoranda İftar"
  }
  else if (/güzellik|guzellik|epilasyon|lazer|cilt|saç|sac|makyaj|botoks|zayıflama|zayiflama|incelme|pedikür|manikür|oje|nail|protez|biorezonans|solaryum/i.test(fuzzyMatch)) {
    actualMainCatKey = "Güzellik (Core)"
    if (/epilasyon|lazer|ağda|agda/i.test(fuzzyMatch)) finalSubCat = "Epilasyon - Ağda"
    else if (/cilt|yüz/i.test(textForMatch)) finalSubCat = "Cilt Bakımı"
    else if (/saç|sac|makyaj/i.test(fuzzyMatch)) finalSubCat = "Saç - Makyaj"
    else if (/zayıflama|zayiflama|incelme/i.test(fuzzyMatch)) finalSubCat = "Zayıflama"
    else if (/manikür|pedikür|tırnak|oje|nail|protez/i.test(fuzzyMatch)) finalSubCat = "Manikür - Pedikür"
    else if (/biorezonans/i.test(textForMatch)) finalSubCat = "Biorezonans"
    else if (/botoks|dolgu/i.test(textForMatch)) finalSubCat = "Botoks - Dolgu"
    else if (/solaryum/i.test(textForMatch)) finalSubCat = "Solaryum"
    else finalSubCat = "Cilt Bakımı"
  }
  else if (/spor|fitness|gym|yoga|pilates|yüzme|yuzme|kurs|eğitim|egitim|dans|gelişim|gelisim|atölye|atolye/i.test(fuzzyMatch)) {
    actualMainCatKey = "Spor - Eğitim - Kurs (Core)"
    if (/yoga|nefes/i.test(textForMatch)) finalSubCat = "Yoga - Nefes Terapisi"
    else if (/pilates/i.test(textForMatch)) finalSubCat = "Pilates"
    else if (/fitness|gym/i.test(textForMatch)) finalSubCat = "Fitness - Gym"
    else if (/dans|müzik|muzik/i.test(fuzzyMatch)) finalSubCat = "Dans - Müzik"
    else if (/dil/i.test(textForMatch)) finalSubCat = "Dil Eğitimi"
    else if (/yüzme|yuzme/i.test(fuzzyMatch)) finalSubCat = "Yüzme Kursu"
    else if (/anaokulu|çocuk|cocuk/i.test(fuzzyMatch)) finalSubCat = "Anaokulu - Çocuk"
    else if (/online/i.test(textForMatch)) finalSubCat = "Online Kurslar"
    else finalSubCat = "Atölye"
  }
  else if (/bilet|tiyatro|konser|sinema|sergi|müze|muze|akvaryum/i.test(fuzzyMatch)) {
    actualMainCatKey = "Bilet - Etkinlik (Core)"
    if (/çocuk|cocuk/i.test(fuzzyMatch) && /tiyatro|oyun/i.test(textForMatch)) finalSubCat = "Çocuk Tiyatro"
    else if (/tiyatro/i.test(textForMatch)) finalSubCat = "Tiyatro"
    else if (/konser/i.test(textForMatch)) finalSubCat = "Konser"
    else if (/sinema/i.test(textForMatch)) finalSubCat = "Sinema"
    else if (/akvaryum|tema park/i.test(textForMatch)) finalSubCat = "Akvaryum - Tema Park"
    else if (/sergi|müze|muze/i.test(fuzzyMatch)) finalSubCat = "Sergi - Müze"
    else if (/parti|festival/i.test(textForMatch)) finalSubCat = "Parti - Festival"
    else finalSubCat = "Gösteri - Müzikal"
  }
  else if (/aktivite|eğlence|eglence|paintball|kaçış|kacis|havuz|su sporları|rafting|yamaç|yamac|binicilik|poligon/i.test(fuzzyMatch)) {
    actualMainCatKey = "Aktivite - Eğlence (Core)"
    if (/paintball|poligon/i.test(textForMatch)) finalSubCat = "Poligon - Paintball"
    else if (/kaçış|kacis|sanal|vr/i.test(fuzzyMatch)) finalSubCat = "Sanal Gerçeklik - Kaçış"
    else if (/havuz|plaj/i.test(textForMatch)) finalSubCat = "Havuz - Plaj"
    else if (/su sporları|su sporlari/i.test(fuzzyMatch)) finalSubCat = "Su Sporları"
    else if (/rafting|yamaç|yamac/i.test(fuzzyMatch)) finalSubCat = "Rafting - Yamaç Paraşütü"
    else if (/binicilik|at |parkur/i.test(textForMatch)) finalSubCat = "Binicilik - Parkur"
    else finalSubCat = "Eğlence Merkezi"
  }
  else if (/hizmet|oto|araç|arac|temizleme|yıkama|yikama|kuru temizleme|sigorta|nakliye|fotoğraf|fotograf|vize/i.test(fuzzyMatch)) {
    actualMainCatKey = "Hizmet (Core)"
    if (/araç|arac|kiralama|vize/i.test(fuzzyMatch)) finalSubCat = "Araç Kiralama - Vize"
    else if (/ev hizmetleri/i.test(textForMatch)) finalSubCat = "Ev Hizmetleri"
    else if (/hayvan|evcil|veteriner/i.test(textForMatch)) finalSubCat = "Evcil Hayvan Hizmetleri"
    else if (/fotoğraf|fotograf/i.test(fuzzyMatch)) finalSubCat = "Fotoğrafçılık - Baskı"
    else if (/kuru temizleme/i.test(textForMatch)) finalSubCat = "Kuru Temizleme"
    else if (/sigorta/i.test(textForMatch)) finalSubCat = "Sigorta"
    else if (/transfer|nakliye/i.test(textForMatch)) finalSubCat = "Transfer - Nakliye"
    else finalSubCat = "Oto Bakım"
  }
  else if (/yılbaşı|yilbasi|yeniyıl|yeni yil/i.test(fuzzyMatch)) {
    actualMainCatKey = "Yılbaşı (Core)"
    if (/tatil|otel|konaklama/i.test(textForMatch)) finalSubCat = "Yılbaşı Tatili"
    else if (/tur/i.test(textForMatch)) finalSubCat = "Yılbaşı Turları"
    else finalSubCat = "Yılbaşı Eğlencesi"
  }
  else if (/sevgililer günü|sevgililer gunu|14 şubat|14 subat/i.test(fuzzyMatch)) {
    actualMainCatKey = "Sevgililer Günü (Core)"
    if (/konaklama|otel/i.test(textForMatch)) finalSubCat = "Sevgililer Günü Konaklama"
    else if (/spa|masaj/i.test(textForMatch)) finalSubCat = "Sevgililer Günü Spa"
    else if (/tur/i.test(textForMatch)) finalSubCat = "Sevgililer Günü Tur"
    else if (/yemek|restoran/i.test(textForMatch)) finalSubCat = "Sevgililer Günü Yemek"
    else if (/hediye/i.test(textForMatch)) finalSubCat = "Sevgililer Günü Hediye"
    else finalSubCat = "Sevgililer Günü Etkinlik"
  }
  else if (/bayram/i.test(textForMatch) && /tur|tatil/i.test(textForMatch)) {
    actualMainCatKey = "Bayram Turları (Travel)"
    if (/kurban/i.test(textForMatch)) finalSubCat = "Kurban Bayramı Turları"
    else finalSubCat = "Ramazan Bayramı Turları"
  }
  else if (/özel günler|ozel gunler|anneler günü|anneler gunu|kadınlar günü|kadinlar gunu|bayram|cuma/i.test(fuzzyMatch) && !/tur/i.test(textForMatch)) {
    actualMainCatKey = "Özel Günler (Core)"
    if (/anneler/i.test(textForMatch)) finalSubCat = "Anneler Günü"
    else if (/kadınlar|kadinlar/i.test(fuzzyMatch)) finalSubCat = "Kadınlar Günü"
    else if (/bayram/i.test(textForMatch)) finalSubCat = "Bayram"
    else if (/cuma/i.test(textForMatch)) finalSubCat = "Harika Cuma"
    else finalSubCat = "Özel Günler (Core)"
  }
  else if (/tatil otelleri|akdeniz|ege|marmara|karadeniz|iç anadolu|ic anadolu/i.test(fuzzyMatch)) {
    actualMainCatKey = "Tatil Otelleri (Travel)"
    if (/akdeniz/i.test(textForMatch)) finalSubCat = "Akdeniz Bölgesi"
    else if (/ege/i.test(textForMatch)) finalSubCat = "Ege Bölgesi"
    else if (/karadeniz/i.test(textForMatch)) finalSubCat = "Karadeniz Bölgesi"
    else if (/marmara/i.test(textForMatch)) finalSubCat = "Marmara Bölgesi"
    else finalSubCat = "İç Anadolu Bölgesi"
  }
  else if (/yurt\s?içi otel|yurt\s?ici otel|otel|konaklama/i.test(fuzzyMatch) && !/yurt\s?dışı|yurt\s?disi|kıbrıs|kibris/i.test(fuzzyMatch)) {
    actualMainCatKey = "Yurtiçi Otel (Travel)"
    if (/istanbul/i.test(textForMatch)) finalSubCat = "İstanbul Otelleri"
    else if (/ankara/i.test(textForMatch)) finalSubCat = "Ankara Otelleri"
    else if (/antalya/i.test(textForMatch)) finalSubCat = "Antalya Otelleri"
    else if (/bursa/i.test(textForMatch)) finalSubCat = "Bursa Otelleri"
    else if (/izmir/i.test(textForMatch)) finalSubCat = "İzmir Otelleri"
    else if (/termal/i.test(textForMatch)) finalSubCat = "Yurtiçi Termal Otel"
    else finalSubCat = "Diğer Kentler"
  }
  else if (/yurt\s?içi tur|yurt\s?ici tur|tur/i.test(fuzzyMatch) && !/yurt\s?dışı|yurt\s?disi|kıbrıs|kibris|bayram|yılbaşı|yilbasi/i.test(fuzzyMatch)) {
    actualMainCatKey = "Yurtiçi Turlar (Travel)"
    if (/günübirlik|gunubirlik/i.test(fuzzyMatch)) finalSubCat = "Günübirlik Turlar"
    else if (/hafta\s?sonu/i.test(textForMatch)) finalSubCat = "Haftasonu Turları"
    else if (/kapadokya/i.test(textForMatch)) finalSubCat = "Kapadokya Turları"
    else if (/karadeniz/i.test(textForMatch)) finalSubCat = "Karadeniz Turları"
    else if (/kayak|kış|kis/i.test(fuzzyMatch)) finalSubCat = "Kayak Turları"
    else if (/kültür|kultur/i.test(fuzzyMatch)) finalSubCat = "Kültür Turları"
    else if (/mavi yolculuk/i.test(textForMatch)) finalSubCat = "Mavi Yolculuk"
    else finalSubCat = "Yurtiçi Paket Tur"
  }
  else if (/yurt\s?dışı|yurt\s?disi|kıbrıs|kibris|vizesiz|afrika|amerika|asya|avrupa|balkanlar|uzak\s?doğu|uzak\s?dogu|italya|fransa|ispanya|paris|roma|mısır|dubai|yunanistan/i.test(fuzzyMatch)) {
    actualMainCatKey = "Yurtdışı Turlar (Travel)"
    if (/kıbrıs|kibris/i.test(fuzzyMatch)) finalSubCat = "Kıbrıs Otel"
    else if (/vizesiz avrupa/i.test(textForMatch)) finalSubCat = "Vizesiz Avrupa"
    else if (/vizesiz balkan/i.test(textForMatch)) finalSubCat = "Vizesiz Balkanlar"
    else if (/avrupa|italya|fransa|ispanya|paris|roma|yunanistan/i.test(textForMatch)) finalSubCat = "Avrupa"
    else if (/balkanlar/i.test(textForMatch)) finalSubCat = "Balkanlar ve Yunanistan"
    else if (/afrika|mısır|misir/i.test(fuzzyMatch)) finalSubCat = "Afrika"
    else if (/amerika/i.test(textForMatch)) finalSubCat = "Amerika"
    else if (/asya|dubai/i.test(textForMatch)) finalSubCat = "Asya"
    else if (/uzak\s?doğu|uzak\s?dogu/i.test(fuzzyMatch)) finalSubCat = "Uzakdoğu"
    else if (/otel/i.test(textForMatch)) finalSubCat = "Yurtdışı Otel"
    else finalSubCat = "Avrupa"
  }
  else if (/yemek|restoran|pizza|pide|burger|kebap|et |steak|meyhane|suşi|sushi|fast food|tatlı|tatli|kahve|cafe|kafe/i.test(fuzzyMatch)) {
    actualMainCatKey = "Yemek (Core)"
    if (/fast|burger|pizza|pide/i.test(textForMatch)) finalSubCat = "Fast Food"
    else if (/mangal|steak|et /i.test(textForMatch)) finalSubCat = "Mangal - Steakhouse"
    else if (/meyhane|fasıl|fasil/i.test(fuzzyMatch)) finalSubCat = "Meyhane - Fasıl"
    else if (/tatlı|tatli|kahve|fırın|firin|cafe|kafe/i.test(fuzzyMatch)) finalSubCat = "Kahve - Fırın - Tatlı"
    else if (/dünya mutfağı|dunya mutfagi|sushi|suşi/i.test(fuzzyMatch)) finalSubCat = "Dünya Mutfağı"
    else if (/türk mutfağı|turk mutfagi/i.test(fuzzyMatch)) finalSubCat = "Türk Mutfağı"
    else if (/tekne/i.test(textForMatch)) finalSubCat = "Tekne"
    else finalSubCat = "Akşam Yemeği"
  }

  return { mainCat: actualMainCatKey, subCat: finalSubCat }
}
