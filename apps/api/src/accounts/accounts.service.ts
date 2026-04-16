import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'
import { AccountListQueryDto, AccountTargetPreviewDto, CreateAccountDto, SortOption, UpdateAccountDto } from './dto/account.dto'
import { Prisma } from '@prisma/client'
import { normalizeAccountSource } from '../common/source-type'

function buildPrefixTsQuery(input: string) {
  return String(input || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .match(/[\p{L}\p{N}]+/gu)?.map((token) => `${token}:*`).join(' & ') || ''
}

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  private mapAccountListItem(b: any) {
    const latestTask = Array.isArray(b.tasks) ? b.tasks[0] : null
    const hasActiveTask = Array.isArray(b.tasks)
      ? b.tasks.some((task: any) => String(task?.generalStatus || '').toUpperCase() === 'OPEN')
      : false
    return {
      ...b,
      companyName: b.accountName,
      businessStatus: b.status === 'ACTIVE' ? 'Aktif' : 'Pasif',
      sourceType: b.source,
      contactName: b.contactPerson || null,
      contactPhone: b.businessContact || null,
      contactEmail: null,
      latestTaskStatus: latestTask?.status || null,
      latestTaskAssignee: latestTask?.owner?.name || latestTask?.owner?.email || latestTask?.historicalAssignee || (latestTask?.ownerId ? null : 'UNASSIGNED'),
      latestTaskSource: latestTask?.source || null,
      latestTaskCreatedAt: latestTask?.creationDate || latestTask?.createdAt || null,
      hasActiveTask,
    }
  }

  private mapAccountDetailedListItem(b: any) {
    const primary = b.contacts.find((c: any) => c.isPrimary) || b.contacts[0]
    const withEmail = b.contacts.find((c: any) => c.email)
    return {
      ...b,
      companyName: b.accountName,
      businessStatus: b.status === 'ACTIVE' ? 'Aktif' : 'Pasif',
      sourceType: b.source,
      contactName: primary?.name || b.contactPerson || null,
      contactPhone: primary?.phone || b.businessContact || null,
      contactEmail: primary?.email || withEmail?.email || null,
    }
  }

  private importedNameStopwords = new Set([
    'acil', 'adina', 'ait', 'aldi', 'alindi', 'arayin', 'aranacak', 'aranir', 'atti', 'attı', 'bakacak',
    'bakamadi', 'bakamadı', 'bana', 'beni', 'benim', 'bilgi', 'bugun', 'bugün', 'burada', 'burası', 'bu',
    'cevap', 'cevapladi', 'cevapladı', 'daha', 'dahil', 'dedi', 'degil', 'değil', 'diyor', 'donecek', 'dönecek',
    'donus', 'dönüş', 'edecek', 'edildi', 'edin', 'geldi', 'gerekiyor', 'geri', 'gorecek', 'görecek',
    'gorusuldu', 'görüşüldü', 'guncel', 'güncel', 'hala', 'halen', 'hastane', 'hastaneye', 'hastaneymis',
    'hastaneymiş', 'icin', 'için', 'ile', 'iletilecek', 'iletecek', 'ilgili', 'ilgileniyor', 'isim',
    'isteniyor', 'istiyor', 'kendisi', 'kisiye', 'kişiye', 'konusuldu', 'konuşuldu', 'mail', 'numara', 'numarasi', 'numarası',
    'olan', 'olarak', 'oldugu', 'olduğu', 'olumlu', 'olursa', 'olur', 'ordan', 'oraya', 'orasi', 'orası', 'oyle', 'öyle',
    'paylasti', 'paylaştı', 'sekreter', 'sekretere', 'sekreterlik', 'simdi', 'şimdi', 'sonra', 'su', 'şu',
    'tarafina', 'tarafına', 'telefon', 'telefonu', 'teyit', 'ulasilamadi', 'ulaşılamadı', 'ulasildi', 'ulaşıldı',
    'ulasmaya', 'ulaşmaya', 'uzerinden', 'üzerinden', 've', 'veya', 'yakin',
    'yakın', 'yarin', 'yarın', 'yerine', 'yetkili', 'yok', 'yonlendirecek', 'yönlendirecek'
  ])

  private importedNameHonorifics = new Set([
    'bey', 'beyi', 'beyefendi', 'hanim', 'hanım', 'hanimefendi', 'hanımefendi', 'dr', 'doktor', 'doc', 'doç',
    'prof', 'profesor', 'profesör', 'av', 'avukat', 'uzm', 'uzman'
  ])

  private importedBusinessDescriptorTokens = new Set([
    'apart', 'apartman', 'avm', 'bar', 'beach', 'beachclub', 'beach club', 'bistro', 'boutique', 'brasserie',
    'cafe', 'café', 'club', 'clup', 'coffeeshop', 'coffeeshop', 'express', 'guesthouse', 'hotel', 'hotels',
    'hostel', 'house', 'kafe', 'lokanta', 'lounge', 'meyhane', 'otel', 'pansiyon', 'pub', 'restaurant',
    'restoran', 'residence', 'resort', 'roof', 'roofbar', 'spa', 'suites', 'suite', 'suit', 'tesis'
  ])

  private importedBusinessLegalSuffixTokens = new Set([
    'aş', 'as', 'anonim', 'company', 'co', 'corp', 'corporation', 'gmbh', 'holding', 'inc', 'limited', 'llc',
    'ltd', 'ltdsti', 'ltdşti', 'sanayi', 'şirketi', 'sirketi', 'tic', 'ticaret', 'turizm'
  ])

  private normalizeImportToken(token: string) {
    return String(token || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/[^\p{L}]/gu, '')
  }

  private tokenizeImportText(value: string | null | undefined) {
    return String(value || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/[&+]/g, ' ve ')
      .replace(/[^\p{L}\d\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map((token) => this.normalizeImportToken(token))
      .filter(Boolean)
  }

  private isLikelyOperationalContactSegment(segment: string) {
    const tokens = this.tokenizeImportText(segment)
    if (tokens.length === 0) return true

    const stopwordCount = tokens.filter((token) => this.importedNameStopwords.has(token)).length
    const honorificCount = tokens.filter((token) => this.importedNameHonorifics.has(token)).length
    const actionVerbCount = tokens.filter((token) => (
      /(acak|ecek|iyor|iyorlar|miştir|mistir|misti|mıştı|muştu|müştü|ildi|ildi|ildi|meli|malı|sin|siniz)$/iu.test(token)
    )).length
    const longTokenCount = tokens.filter((token) => token.length >= 3).length

    if (honorificCount === 0 && stopwordCount >= Math.max(2, Math.ceil(tokens.length / 2))) return true
    if (honorificCount === 0 && actionVerbCount >= 1 && longTokenCount <= 3) return true
    if (tokens.length >= 2 && tokens.every((token) => this.importedNameStopwords.has(token))) return true
    return false
  }

  private scoreImportedNameChunk(chunk: string[]) {
    const normalizedChunk = chunk.map((token) => this.normalizeImportToken(token))
    const honorificCount = normalizedChunk.filter((token) => this.importedNameHonorifics.has(token)).length
    const stopwordCount = normalizedChunk.filter((token) => this.importedNameStopwords.has(token)).length
    const tokenScore = normalizedChunk.reduce((score, token) => score + (token.length >= 3 ? 2 : 1), 0)
    const preferredLengthBonus = chunk.length >= 2 && chunk.length <= 4 ? 3 : 0
    const stopwordPenalty = stopwordCount * 4
    const overLengthPenalty = Math.max(0, chunk.length - 4)
    return tokenScore + (honorificCount * 4) + preferredLengthBonus - stopwordPenalty - overLengthPenalty
  }

  private normalizeBusinessCoreName(name: string) {
    const rawTokens = String(name || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/[&+]/g, ' ve ')
      .replace(/[^\p{L}\d\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map((token) => String(token || '').trim())
      .filter(Boolean)
    if (rawTokens.length === 0) return ''

    const strippedTokens = rawTokens.filter((token) => {
      const normalizedToken = this.normalizeImportToken(token)
      return (
      !this.importedBusinessDescriptorTokens.has(normalizedToken) &&
      !this.importedBusinessLegalSuffixTokens.has(normalizedToken) &&
      token !== 've' &&
      token !== 'and' &&
      token !== 'amp'
      )
    })

    const preferredTokens = strippedTokens.filter((token) => token.length >= 3 || /\d/.test(token))
    const finalTokens = preferredTokens.length > 0 ? preferredTokens : strippedTokens
    const fallbackTokens = finalTokens.length > 0 ? finalTokens : rawTokens

    return fallbackTokens
      .map((token) => token
        .replace(/[ç]/g, 'c')
        .replace(/[ğ]/g, 'g')
        .replace(/[ıi]/g, 'i')
        .replace(/[ö]/g, 'o')
        .replace(/[ş]/g, 's')
        .replace(/[ü]/g, 'u'))
      .join('')
      .replace(/[^a-z0-9]/g, '')
  }

  private looksLikeImportedNameToken(token: string) {
    const cleaned = String(token || '').trim()
    const normalized = this.normalizeImportToken(cleaned)
    if (!normalized || normalized.length < 2) return false
    if (this.importedNameStopwords.has(normalized)) return false
    if (/^\d+$/.test(cleaned)) return false
    if (/(acak|ecek|miş|mış|muş|müş|yor|di|dı|du|dü|ti|tı|tu|tü|meli|malı)$/iu.test(normalized)) return false
    return /^[\p{L}.'-]+$/u.test(cleaned)
  }

  private extractImportedContactNames(raw: string | null | undefined) {
    if (!raw) return [] as string[]

    const segments = String(raw)
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .split(/[\n,;\/|\\]+/)
      .map((segment) => segment.trim())
      .filter(Boolean)

    const results: string[] = []

    for (const segment of segments) {
      const sanitized = segment
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/\S+@\S+/g, ' ')
        .replace(/\+?\d[\d\s().-]{7,}/g, ' ')
        .replace(/[–—]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (!sanitized) continue
      const normalizedSegment = sanitized
        .toLocaleLowerCase('tr-TR')
        .replace(/[^\p{L}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (!normalizedSegment || this.isLikelyOperationalContactSegment(normalizedSegment)) {
        continue
      }

      const rawTokens = sanitized.split(/\s+/).filter(Boolean)
      const chunks: string[][] = []
      let current: string[] = []

      for (const token of rawTokens) {
        if (this.looksLikeImportedNameToken(token)) {
          current.push(token)
          continue
        }
        if (current.length > 0) {
          chunks.push(current)
          current = []
        }
      }
      if (current.length > 0) chunks.push(current)

      const scored = chunks
        .map((chunk) => {
          return {
            chunk,
            score: this.scoreImportedNameChunk(chunk),
          }
        })
        .filter((item) => item.chunk.length > 0)
        .sort((left, right) => right.score - left.score)

      const best = scored[0]?.chunk
      if (!best) continue
      if (this.scoreImportedNameChunk(best) < 4) continue

      const candidate = this.toTitleCase(best.join(' ').trim())
      if (!candidate) continue
      if (!results.includes(candidate)) results.push(candidate)
    }

    return results
  }

  private splitContactValues(raw: string | null | undefined, type: 'name' | 'phone' | 'email') {
    if (!raw) return [] as string[]
    const values = String(raw)
      .split(/[\n,;\/|\\]+/)
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .map((part) => {
        if (type === 'phone') return this.standardizePhone(part)
        if (type === 'email') return part.toLowerCase()
        return this.toTitleCase(part)
      })
      .filter(Boolean)
    return Array.from(new Set(values))
  }

  private pickAlignedContactValue(values: string[], index: number) {
    if (!values.length) return ''
    if (index < values.length) return values[index]
    return values.length === 1 ? values[0] : ''
  }

  private contactRowKey(row: { name?: string | null; phone?: string | null; email?: string | null }) {
    const name = this.toTitleCase(String(row?.name || '').trim())
    const phone = this.standardizePhone(String(row?.phone || '').trim())
    const email = String(row?.email || '').trim().toLowerCase()
    return `${name}|${phone}|${email}`
  }

  private namesMatch(left?: string | null, right?: string | null) {
    if (!left || !right) return false
    const a = this.fuzzyName(left)
    const b = this.fuzzyName(right)
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

  private parseImportedDateValue(raw: unknown): Date | null {
    if (raw === null || raw === undefined) return null
    const value = String(raw).trim()
    if (!value) return null

    const asNumber = Number(value.replace(',', '.'))
    if (/^\d+(?:[.,]\d+)?$/.test(value) && Number.isFinite(asNumber)) {
      // Excel serial dates commonly arrive as plain numbers like 44658.
      if (asNumber >= 1 && asNumber <= 100000) {
        const excelEpochUtc = Date.UTC(1899, 11, 30)
        const millis = Math.round(asNumber * 24 * 60 * 60 * 1000)
        const excelDate = new Date(excelEpochUtc + millis)
        const year = excelDate.getUTCFullYear()
        if (year >= 2000 && year <= 2100) {
          return new Date(Date.UTC(year, excelDate.getUTCMonth(), excelDate.getUTCDate(), 12, 0, 0, 0))
        }
      }
    }

    const normalized = value.replace(/\s+/g, '')
    const parts = normalized.split(/[./-]/)
    if (parts.length >= 3) {
      const first = parts[0]
      const second = parts[1]
      const third = parts[2]

      if (/^\d{1,4}$/.test(first) && /^\d{1,2}$/.test(second) && /^\d{1,4}$/.test(third)) {
        let day = Number(first)
        let month = Number(second)
        let year = Number(third)

        if (first.length === 4) {
          year = Number(first)
          month = Number(second)
          day = Number(third)
        } else if (third.length === 2) {
          year = 2000 + Number(third)
        }

        if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
          if (
            parsed.getUTCFullYear() === year &&
            parsed.getUTCMonth() === month - 1 &&
            parsed.getUTCDate() === day
          ) {
            return parsed
          }
        }
      }
    }

    const nativeDate = new Date(value)
    if (!Number.isNaN(nativeDate.getTime())) {
      const year = nativeDate.getUTCFullYear()
      if (year >= 2000 && year <= 2100) {
        return nativeDate
      }
    }

    return null
  }

  private importedFallbackDate() {
    return new Date('2000-01-01T12:00:00.000Z')
  }

  private normalizeTargetPreviewSource(value: unknown) {
    if (!String(value || '').trim()) return ''
    return normalizeAccountSource(value)
  }

  private normalizeTargetPreviewMonth(value: unknown) {
    const raw = String(value || '').trim()
    if (!raw) return null
    const numeric = Number(raw)
    if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 12) return numeric

    const monthMap = new Map<string, number>([
      ['ocak', 1],
      ['subat', 2],
      ['şubat', 2],
      ['mart', 3],
      ['nisan', 4],
      ['mayis', 5],
      ['mayıs', 5],
      ['haziran', 6],
      ['temmuz', 7],
      ['agustos', 8],
      ['ağustos', 8],
      ['eylul', 9],
      ['eylül', 9],
      ['ekim', 10],
      ['kasim', 11],
      ['kasım', 11],
      ['aralik', 12],
      ['aralık', 12],
    ])

    return monthMap.get(raw.toLocaleLowerCase('tr-TR')) || null
  }

  private matchesTargetPreviewDate(
    account: { createdAt?: Date | string | null },
    tasks: Array<{ creationDate?: Date | string | null; createdAt?: Date | string | null }>,
    years: number[],
    months: number[],
  ) {
    if (years.length === 0 && months.length === 0) return true

    const dateCandidates: Date[] = []
    for (const task of tasks) {
      const parsed = new Date((task?.creationDate || task?.createdAt || '') as any)
      if (!Number.isNaN(parsed.getTime())) dateCandidates.push(parsed)
    }

    const accountDate = new Date((account?.createdAt || '') as any)
    if (!Number.isNaN(accountDate.getTime())) dateCandidates.push(accountDate)
    if (dateCandidates.length === 0) return false

    return dateCandidates.some((dateObj) => {
      if (years.length > 0 && !years.includes(dateObj.getUTCFullYear())) return false
      if (months.length > 0 && !months.includes(dateObj.getUTCMonth() + 1)) return false
      return true
    })
  }

  private matchesTargetPreviewSource(
    account: { source?: string | null },
    tasks: Array<{ source?: string | null }>,
    selectedSources: string[],
  ) {
    if (selectedSources.length === 0) return true

    const sourceCandidates = new Set<string>()
    const accountSource = this.normalizeTargetPreviewSource(account?.source)
    if (accountSource) sourceCandidates.add(accountSource)
    tasks.forEach((task) => {
      const normalized = this.normalizeTargetPreviewSource(task?.source)
      if (normalized) sourceCandidates.add(normalized)
    })

    return selectedSources.some((value) => sourceCandidates.has(value))
  }

  private matchesTargetPreviewCategory(
    account: { mainCategory?: string | null; subCategory?: string | null },
    tasks: Array<{ mainCategory?: string | null; subCategory?: string | null }>,
    selectedMainCategories: string[],
    selectedSubCategories: string[],
  ) {
    const hasCategoryFilter = selectedMainCategories.length > 0 || selectedSubCategories.length > 0
    if (!hasCategoryFilter) return true

    const historyMatch = tasks.some((task) => {
      const mainMatches = selectedMainCategories.length === 0 || selectedMainCategories.includes(String(task?.mainCategory || '').trim())
      const subMatches = selectedSubCategories.length === 0 || selectedSubCategories.includes(String(task?.subCategory || '').trim())
      return mainMatches && subMatches
    })
    if (historyMatch) return true

    const mainCategory = String(account?.mainCategory || '').trim()
    const subCategory = String(account?.subCategory || '').trim()
    if (!mainCategory && !subCategory) return false

    const mainMatches = selectedMainCategories.length === 0 || selectedMainCategories.includes(mainCategory)
    const subMatches = selectedSubCategories.length === 0 || selectedSubCategories.includes(subCategory)
    return mainMatches && subMatches
  }

  private looksLikeMalformedImportCell(value: unknown) {
    const text = String(value || '').trim()
    if (!text) return false

    const normalized = text.toLocaleLowerCase('tr-TR')
    const newlineCount = (text.match(/\n/g) || []).length
    const suspiciousKeywordCount = [
      'query',
      'old account',
      'fresh account',
      'rakip',
      'lead',
      'instagram.com',
      'http://',
      'https://',
      'daha önce',
      'daha once',
      'görüş',
      'gorus',
    ].filter((token) => normalized.includes(token)).length

    if (newlineCount >= 2 && suspiciousKeywordCount >= 1) return true
    if (text.length > 120 && suspiciousKeywordCount >= 2) return true
    return false
  }

  private detectMalformedImportRow(row: Record<string, unknown>) {
    const suspiciousFields: string[] = []
    const candidateFields = ['companyName', 'sourceType', 'taskTarihi', 'mainCategory', 'subCategory'] as const

    for (const field of candidateFields) {
      if (this.looksLikeMalformedImportCell(row?.[field])) suspiciousFields.push(field)
    }

    if (suspiciousFields.length === 0) return null
    return `Satır kaymış görünüyor; şu alanlar bozuk veri içeriyor: ${suspiciousFields.join(', ')}`
  }

  private inferImportedStatusFromLog(logText: string) {
    const normalized = String(logText || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/\s+/g, ' ')
      .trim()

    if (!normalized) return null

    if (/(deal|anla[sş]|anlaş|anlas|sat[ıi]ş|satildi|satıldı|sat[ıi]ld[ıi]|kapora|ödeme al[ıi]nd[ıi]|odeme alindi)/i.test(normalized)) {
      return 'DEAL'
    }

    return 'COLD'
  }

  private expandContactRows(
    primary: { name?: string | null; phone?: string | null; email?: string | null },
    extras: Array<{ name?: string | null; phone?: string | null; email?: string | null }> = [],
    fallbackName = 'İsimsiz / Genel',
  ) {
    const rows: Array<{ name: string; phone: string | null; email: string | null; isPrimary: boolean }> = []

    const append = (entry: { name?: string | null; phone?: string | null; email?: string | null }, isPrimarySeed = false) => {
      const names = this.splitContactValues(entry?.name, 'name')
      const phones = this.splitContactValues(entry?.phone, 'phone')
      const emails = this.splitContactValues(entry?.email, 'email')
      const max = Math.max(names.length, phones.length, emails.length, 1)

      for (let i = 0; i < max; i += 1) {
        const name = this.pickAlignedContactValue(names, i) || fallbackName
        const phone = this.pickAlignedContactValue(phones, i) || null
        const email = this.pickAlignedContactValue(emails, i) || null
        if (!name && !phone && !email) continue
        rows.push({ name, phone, email, isPrimary: isPrimarySeed && rows.length === 0 })
      }
    }

    append(primary, true)
    extras.forEach((entry) => append(entry, false))

    const deduped: Array<{ name: string; phone: string | null; email: string | null; isPrimary: boolean }> = []
    const seen = new Set<string>()
    for (const row of rows) {
      const key = `${row.name.toLowerCase()}|${row.phone || ''}|${row.email || ''}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(row)
    }
    if (deduped.length > 0 && !deduped.some((row) => row.isPrimary)) deduped[0].isPrimary = true
    return deduped
  }

  private expandExtraContactRows(
    extras: Array<{ name?: string | null; phone?: string | null; email?: string | null }> = [],
    fallbackName = 'İsimsiz / Genel',
  ) {
    const meaningfulExtras = extras.filter((entry) => this.hasMeaningfulContact(entry))
    if (meaningfulExtras.length === 0) return []
    const rows = meaningfulExtras.flatMap((entry) => this.expandContactRows(entry, [], fallbackName))
    const deduped: Array<{ name: string; phone: string | null; email: string | null; isPrimary: boolean }> = []
    const seen = new Set<string>()
    for (const row of rows) {
      const key = this.contactRowKey(row)
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push({ ...row, isPrimary: false })
    }
    return deduped
  }

  private hasMeaningfulContact(row?: { name?: string | null; phone?: string | null; email?: string | null } | null) {
    if (!row) return false
    return Boolean(String(row.name || '').trim() || String(row.phone || '').trim() || String(row.email || '').trim())
  }

  async list(q: AccountListQueryDto) {
    const where: any = {}
    const sourceValues = String(q.sourceType || '')
      .split(',')
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .map((value) => normalizeAccountSource(value))

    if (q.q) {
      where.OR = [
        { accountName: { contains: q.q, mode: 'insensitive' } },
        { businessName: { contains: q.q, mode: 'insensitive' } },
        { contactPerson: { contains: q.q, mode: 'insensitive' } },
        { businessContact: { contains: q.q, mode: 'insensitive' } },
        { contacts: { some: { OR: [
          { name: { contains: q.q, mode: 'insensitive' } },
          { phone: { contains: q.q, mode: 'insensitive' } },
          { email: { contains: q.q, mode: 'insensitive' } },
        ] } } },
      ]
    }
    if (sourceValues.length === 1) where.source = sourceValues[0] as any
    else if (sourceValues.length > 1) where.source = { in: sourceValues as any }
    if (q.businessStatus) {
      const normalizedStatus = String(q.businessStatus).trim().toUpperCase()
      where.status = (normalizedStatus === 'AKTIF' ? 'ACTIVE' : normalizedStatus === 'PASIF' ? 'PASSIVE' : normalizedStatus) as any
    }
    if (q.city) where.city = { contains: q.city, mode: 'insensitive' }
    if (q.district) where.district = { contains: q.district, mode: 'insensitive' }
    if (q.mainCategory) where.mainCategory = { contains: q.mainCategory, mode: 'insensitive' }
    if (q.subCategory) where.subCategory = { contains: q.subCategory, mode: 'insensitive' }
    if (q.assigneeId) {
      where.tasks = { some: { ownerId: q.assigneeId } }
    }
    let orderBy: any = { accountName: 'asc' }
    switch (q.sort) {
      case SortOption.name_desc:
        orderBy = { accountName: 'desc' }
        break
      case SortOption.newest:
        orderBy = { creationDate: 'desc' }
        break
      case SortOption.oldest:
        orderBy = { creationDate: 'asc' }
        break
    }

    const page = Number(q.page || 1)
    const isSummaryView = String(q.view || '').toLowerCase() === 'summary'
    if (!isSummaryView && (q.createdFrom || q.createdTo)) {
      where.creationDate = {}
      if (q.createdFrom) where.creationDate.gte = new Date(q.createdFrom)
      if (q.createdTo) {
        const toDate = new Date(q.createdTo)
        toDate.setHours(23, 59, 59, 999)
        where.creationDate.lte = toDate
      }
    }
    const limitCap = isSummaryView ? 250 : 100
    const limit = Math.min(Number(q.limit || 20), limitCap)
    const skip = (page - 1) * limit

    if (isSummaryView) {
      const rawItems = await this.prisma.account.findMany({
        where,
        orderBy,
        select: {
          id: true,
          accountName: true,
          businessName: true,
          source: true,
          type: true,
          status: true,
          mainCategory: true,
          subCategory: true,
          city: true,
          district: true,
          address: true,
          businessContact: true,
          contactPerson: true,
          notes: true,
          website: true,
          instagram: true,
          campaignUrl: true,
          creationDate: true,
          createdAt: true,
          tasks: {
            select: {
              id: true,
              ownerId: true,
              status: true,
              generalStatus: true,
              source: true,
              historicalAssignee: true,
              creationDate: true,
              createdAt: true,
              owner: { select: { id: true, name: true, email: true, team: true } },
            },
            orderBy: { creationDate: 'desc' },
            take: 5,
          },
        },
      })

      const normalizedAssignee = String(q.assignee || '').trim()
      const normalizedTeam = String(q.team || '').trim()
      const taskScope = String(q.taskScope || 'all').trim().toLowerCase()
      const createdFromMs = q.createdFrom ? new Date(q.createdFrom).getTime() : null
      const createdToMs = q.createdTo ? new Date(`${q.createdTo}T23:59:59.999`).getTime() : null

      const filteredItems = rawItems.filter((account: any) => {
        const latestTask = Array.isArray(account.tasks) ? account.tasks[0] : null
        const hasActiveTask = Array.isArray(account.tasks)
          ? account.tasks.some((task: any) => String(task?.generalStatus || '').toUpperCase() === 'OPEN')
          : false

        if (normalizedTeam) {
          const teamMatch = (account.tasks || []).some((task: any) => String(task?.owner?.team || '').trim() === normalizedTeam)
          if (!teamMatch) return false
        }

        if (normalizedAssignee) {
          if (normalizedAssignee === 'UNASSIGNED') {
            const hasUnassigned = (account.tasks || []).some((task: any) => !task?.ownerId)
            if (!hasUnassigned) return false
          } else {
            const assigneeMatch = (account.tasks || []).some((task: any) => (
              String(task?.ownerId || '').trim() === normalizedAssignee
              || String(task?.owner?.name || '').trim() === normalizedAssignee
              || String(task?.owner?.email || '').trim() === normalizedAssignee
              || String(task?.historicalAssignee || '').trim() === normalizedAssignee
            ))
            if (!assigneeMatch) return false
          }
        }

        if (taskScope === 'open' && !hasActiveTask) return false
        if (taskScope === 'closed' && hasActiveTask) return false

        if (createdFromMs || createdToMs) {
          const effectiveDateRaw = latestTask?.creationDate || latestTask?.createdAt || account.creationDate || account.createdAt
          const effectiveMs = new Date(effectiveDateRaw || 0).getTime()
          if (!Number.isFinite(effectiveMs)) return false
          if (createdFromMs && effectiveMs < createdFromMs) return false
          if (createdToMs && effectiveMs > createdToMs) return false
        }

        return true
      })

      const total = filteredItems.length
      const pagedItems = filteredItems.slice(skip, skip + limit).map((b: any) => this.mapAccountListItem(b))
      return { items: pagedItems, total, page, limit }
    }

    const [rawItems, total] = await this.prisma.$transaction([
      this.prisma.account.findMany({
        where,
        orderBy,
        take: limit,
        skip,
        include: {
          contacts: { take: 10 },
          tasks: {
            select: {
              id: true,
              ownerId: true,
              status: true,
              generalStatus: true,
              creationDate: true,
              owner: { select: { id: true, name: true, email: true } },
            },
            orderBy: { creationDate: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.account.count({ where }),
    ])

    const items = rawItems.map((b: any) => this.mapAccountDetailedListItem(b))
    return { items, total, page, limit }
  }

  async detail(id: string) {
    const business = await this.prisma.account.findUnique({
      where: { id },
      include: {
        history: { orderBy: { createdAt: 'desc' }, take: 20 },
        tasks: {
          select: {
            id: true,
            status: true,
            generalStatus: true,
            closedAt: true,
            assignmentDate: true,
            creationDate: true,
            owner: { select: { id: true, name: true, email: true } },
          },
          take: 5,
          orderBy: { creationDate: 'desc' },
        },
        contacts: { orderBy: { isPrimary: 'desc' } },
        notesRel: { orderBy: { createdAt: 'desc' }, take: 10 },
        deals: { orderBy: { startDate: 'desc' }, take: 5 },
      },
    })
    if (!business) throw new NotFoundException('Business not found')
    
    const openTasks = business.tasks.filter((t: any) => t.generalStatus === 'OPEN').length
    
    const primaryContact = business.contacts.find(c => c.isPrimary) || business.contacts[0] || {} as any;
    const extraContacts = business.contacts
        .filter(c => c.id !== primaryContact.id)
        .map(c => ({ name: c.name || '', phone: c.phone || '', email: c.email || '' }));

    return { 
        ...business,
        companyName: business.accountName,
        businessStatus: business.status === 'ACTIVE' ? 'Aktif' : 'Pasif',
        sourceType: business.source,
        contactName: primaryContact.name || null,
        contactPhone: primaryContact.phone || null,
        contactEmail: primaryContact.email || null,
        extraContacts: extraContacts.length > 0 ? extraContacts : null,
        website: business.website,
        instagram: business.instagram,
        campaignUrl: business.campaignUrl,
        openTasks 
    }
  }

  private mapCreateBody(body: CreateAccountDto) {
    const accountName = (body.companyName || body.businessName || '').trim()
    const businessName = (body.businessName || body.companyName || '').trim()
    const mainCategory = body.mainCategory || null
    const subCategory = body.subCategory || null
    const category = body.category || [mainCategory, subCategory].filter(Boolean).join(' / ') || 'Uncategorized'

    let city = body.city ?? null
    let district = body.district ?? null
    if (city && city.includes('-')) {
      const parts = city.split('-')
      city = parts[0].trim()
      if (!district && parts.slice(1).join('-').trim()) {
        district = parts.slice(1).join('-').trim()
      }
    }

    const mappedSource = normalizeAccountSource(body.sourceType || body.source || 'FRESH')

    const primaryPhones = this.splitContactValues(body.contactPhone || body.businessContact, 'phone')
    const primaryNames = this.splitContactValues(body.contactPerson || body.contactName, 'name')

    return {
      accountName,
      businessName,
      category,
      mainCategory,
      subCategory,
      source: mappedSource as any,
      type: (body.accountType || body.type || 'KEY') as any,
      status: (body.businessStatus || body.status || 'ACTIVE') as any,
      city,
      district,
      address: body.address ?? null,
      businessContact: primaryPhones[0] || null,
      contactPerson: primaryNames[0] || body.contactPerson || body.contactName || null,
      notes: body.notes ?? null,
      website: body.website ?? null,
      instagram: body.instagram ?? null,
      campaignUrl: body.campaignUrl ?? null,
    }
  }

  async create(body: CreateAccountDto) {
    const mapped = this.mapCreateBody(body)
    const isPublicIdConflict = (err: unknown) => {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false
      const target = (err.meta as any)?.target
      if (Array.isArray(target)) return target.some((t) => String(t).includes('accountPublicId'))
      return String(target || '').includes('accountPublicId')
    }

    let lastError: unknown = null
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx: any) => {
          const pubId = await this.generateAccountPublicId(tx)
          const finalPubId = attempt > 0 ? `${pubId}-${Math.random().toString(36).slice(2, 6).toUpperCase()}` : pubId
          const business = await tx.account.create({
            data: { ...mapped, accountPublicId: finalPubId },
          })

          const contactRows = this.expandContactRows(
            {
              name: body.contactPerson || body.contactName || mapped.contactPerson || mapped.businessName,
              phone: body.contactPhone || body.businessContact || mapped.businessContact,
              email: body.email || body.contactEmail || null,
            },
            body.extraContacts || [],
            mapped.contactPerson || mapped.businessName,
          )

          if (contactRows.length > 0) {
            await tx.accountContact.createMany({
              data: contactRows.map((row) => ({
                accountId: business.id,
                type: 'PERSON',
                name: row.name,
                phone: row.phone,
                email: row.email,
                address: row.isPrimary ? (mapped.address || null) : null,
                isPrimary: row.isPrimary,
              })),
            })
          }

          await tx.activityHistory.create({
            data: { accountId: business.id, type: 'PROFILE_UPDATE', summary: `Business created (${business.accountPublicId})` },
          })
          return business
        })
      } catch (err) {
        lastError = err
        if (!isPublicIdConflict(err)) throw err
      }
    }
    throw (lastError as any)
  }

  async update(id: string, body: UpdateAccountDto) {
    const exists = await this.prisma.account.findUnique({ where: { id } })
    if (!exists) throw new NotFoundException('Business not found')

    const mainCategory = body.mainCategory ?? exists.mainCategory
    const subCategory = body.subCategory ?? exists.subCategory

    const data: any = {}
    if (body.companyName !== undefined) {
      data.accountName = body.companyName
      data.businessName = body.companyName
    }
    if (body.businessName !== undefined) data.businessName = body.businessName
    if (body.mainCategory !== undefined) data.mainCategory = body.mainCategory || null
    if (body.subCategory !== undefined) data.subCategory = body.subCategory || null
    if (body.category !== undefined) data.category = body.category
    else if (body.mainCategory !== undefined || body.subCategory !== undefined) {
      data.category = [mainCategory, subCategory].filter(Boolean).join(' / ') || exists.category
    }

    if (body.sourceType !== undefined) data.source = body.sourceType
    else if (body.source !== undefined) data.source = body.source

    if (body.businessStatus !== undefined) data.status = body.businessStatus
    else if (body.status !== undefined) data.status = body.status

    if (body.accountType !== undefined) data.type = body.accountType
    else if (body.type !== undefined) data.type = body.type

    let city = body.city !== undefined ? body.city : undefined
    let district = body.district !== undefined ? body.district : undefined
    if (city && city.includes('-')) {
      const parts = city.split('-')
      city = parts[0].trim()
      if (district === undefined && parts.slice(1).join('-').trim()) {
        district = parts.slice(1).join('-').trim()
      }
    }

    if (city !== undefined) data.city = city
    if (district !== undefined) data.district = district
    if (body.address !== undefined) data.address = body.address

    const requestedPrimaryPhone = body.contactPhone !== undefined ? body.contactPhone : (body.businessContact !== undefined ? body.businessContact : undefined)
    if (requestedPrimaryPhone !== undefined) {
      data.businessContact = this.splitContactValues(requestedPrimaryPhone, 'phone')[0] || null
    }

    const finalContactPerson = body.contactPerson !== undefined ? body.contactPerson : (body.contactName !== undefined ? body.contactName : undefined)
    if (finalContactPerson !== undefined) data.contactPerson = this.splitContactValues(finalContactPerson, 'name')[0] || null
    if (body.notes !== undefined) data.notes = body.notes
    if (body.website !== undefined) data.website = body.website
    if (body.instagram !== undefined) data.instagram = body.instagram
    if (body.campaignUrl !== undefined) data.campaignUrl = body.campaignUrl

    const updated = await this.prisma.account.update({ where: { id }, data })

    const finalContactEmail = body.email !== undefined ? body.email : (body.contactEmail !== undefined ? body.contactEmail : undefined)
    const primary = await this.prisma.accountContact.findFirst({ where: { accountId: id, isPrimary: true } })
    const existingExtras = body.extraContacts !== undefined
      ? await this.prisma.accountContact.findMany({
          where: { accountId: id, isPrimary: false, type: 'PERSON' },
          include: { taskLinks: { select: { id: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : []

    const providedExtraContacts = Array.isArray(body.extraContacts) ? body.extraContacts : []

    let primaryRows = this.expandContactRows(
      {
        name: finalContactPerson !== undefined ? finalContactPerson : (primary?.name || updated.businessName),
        phone: requestedPrimaryPhone !== undefined ? requestedPrimaryPhone : (primary?.phone || ''),
        email: finalContactEmail !== undefined ? finalContactEmail : (primary?.email || ''),
      },
      [],
      updated.businessName,
    )
    const currentPrimaryRow = primaryRows[0] || { name: updated.businessName, phone: null, email: null, isPrimary: true }
    const extraContactsToMergeIntoPrimary = providedExtraContacts.filter((entry) => {
      const normalizedName = this.splitContactValues(entry?.name, 'name')[0] || ''
      const hasPhoneOrEmail = Boolean(String(entry?.phone || '').trim() || String(entry?.email || '').trim())
      return (hasPhoneOrEmail && !normalizedName) || this.namesMatch(normalizedName, currentPrimaryRow.name)
    })
    const promotableExtraContacts = providedExtraContacts.filter((entry) => !extraContactsToMergeIntoPrimary.includes(entry))

    if (extraContactsToMergeIntoPrimary.length > 0) {
      for (const entry of extraContactsToMergeIntoPrimary) {
        const normalizedName = this.splitContactValues(entry?.name, 'name')[0] || ''
        currentPrimaryRow.name = normalizedName || currentPrimaryRow.name || updated.businessName
        currentPrimaryRow.phone = this.mergeContactFieldValues(entry?.phone, currentPrimaryRow.phone, 'phone') || null
        currentPrimaryRow.email = this.mergeContactFieldValues(entry?.email, currentPrimaryRow.email, 'email') || null
      }
      primaryRows = [currentPrimaryRow, ...primaryRows.slice(1)]
    }

    let expandedExtras = body.extraContacts !== undefined
      ? this.expandExtraContactRows(
          [...primaryRows.slice(1).map((row) => ({ name: row.name, phone: row.phone, email: row.email })), ...promotableExtraContacts],
          updated.businessName,
        )
      : []

    if (body.extraContacts !== undefined && expandedExtras.length > 0) {
      const existingExtraKeys = new Set(existingExtras.map((contact) => this.contactRowKey(contact)))
      const currentPrimaryKey = this.contactRowKey(currentPrimaryRow)
      const promotableNewRows = this.expandExtraContactRows(promotableExtraContacts, updated.businessName)
      const promotableNewKeys = new Set(promotableNewRows.map((row) => this.contactRowKey(row)))
      const newlyAddedRows = expandedExtras.filter((row) => {
        const rowKey = this.contactRowKey(row)
        return rowKey !== currentPrimaryKey && !existingExtraKeys.has(rowKey) && promotableNewKeys.has(rowKey)
      })
      const promotedPrimary = newlyAddedRows[newlyAddedRows.length - 1]

      if (promotedPrimary) {
        const promotedKey = this.contactRowKey(promotedPrimary)
        expandedExtras = expandedExtras.filter((row) => this.contactRowKey(row) !== promotedKey)
        if (this.hasMeaningfulContact(currentPrimaryRow) && currentPrimaryKey !== promotedKey) {
          expandedExtras.unshift({
            name: currentPrimaryRow.name,
            phone: currentPrimaryRow.phone,
            email: currentPrimaryRow.email,
            isPrimary: false,
          })
        }
        primaryRows = [{ ...promotedPrimary, isPrimary: true }]
      }
    }

    const emailToCheck =
      finalContactEmail !== undefined ||
      body.contactPhone !== undefined ||
      finalContactPerson !== undefined ||
      body.address !== undefined ||
      body.extraContacts !== undefined
    let primaryContactId = primary?.id || ''
    if (emailToCheck) {
      const firstPrimaryRow = primaryRows[0] || { name: updated.businessName, phone: null, email: null, isPrimary: true }
      if (primary) {
        const updatedPrimary = await this.prisma.accountContact.update({
          where: { id: primary.id },
          data: {
            email: firstPrimaryRow.email,
            phone: firstPrimaryRow.phone,
            name: firstPrimaryRow.name || updated.businessName,
            address: body.address !== undefined ? body.address || null : primary.address,
          },
        })
        primaryContactId = updatedPrimary?.id || primary.id
      } else if (firstPrimaryRow.email || firstPrimaryRow.phone || firstPrimaryRow.name) {
        const createdPrimary = await this.prisma.accountContact.create({
          data: {
            accountId: id,
            type: 'PERSON',
            name: firstPrimaryRow.name || updated.businessName,
            phone: firstPrimaryRow.phone,
            email: firstPrimaryRow.email,
            address: body.address || updated.address || null,
            isPrimary: true,
          },
        })
        primaryContactId = createdPrimary.id
      }
    }

    if (body.extraContacts !== undefined) {
      const unusedExisting = [...existingExtras]
      const consumedExistingIds = new Set<string>()
      const keeperByKey = new Map<string, string>()

      const takeExistingContact = (matcher: (contact: any) => boolean) => {
        const index = unusedExisting.findIndex((contact) => !consumedExistingIds.has(contact.id) && matcher(contact))
        if (index === -1) return null
        const [contact] = unusedExisting.splice(index, 1)
        consumedExistingIds.add(contact.id)
        return contact
      }

      for (const row of expandedExtras) {
        const rowKey = this.contactRowKey(row)
        let target =
          takeExistingContact((contact) => this.contactRowKey(contact) === rowKey) ||
          takeExistingContact(() => true)

        if (target) {
          await this.prisma.accountContact.update({
            where: { id: target.id },
            data: {
              name: row.name,
              phone: row.phone,
              email: row.email,
              isPrimary: false,
            },
          })
          keeperByKey.set(rowKey, target.id)
        } else {
          const created = await this.prisma.accountContact.create({
            data: {
              accountId: id,
              type: 'PERSON',
              name: row.name,
              phone: row.phone,
              email: row.email,
              isPrimary: false,
            },
          })
          keeperByKey.set(rowKey, created.id)
        }
      }

      for (const leftover of unusedExisting) {
        const linkCount = leftover.taskLinks?.length || 0
        const fallbackKey = this.contactRowKey(leftover)
        const keeperId = keeperByKey.get(fallbackKey)

        if (linkCount > 0 && keeperId && keeperId !== leftover.id) {
          await this.prisma.taskContact.updateMany({
            where: { contactId: leftover.id },
            data: { contactId: keeperId },
          })
          await this.prisma.accountContact.delete({ where: { id: leftover.id } })
          continue
        }

        if (linkCount > 0 && primaryContactId && primaryContactId !== leftover.id) {
          await this.prisma.taskContact.updateMany({
            where: { contactId: leftover.id },
            data: { contactId: primaryContactId },
          })
          await this.prisma.accountContact.delete({ where: { id: leftover.id } })
          continue
        }

        await this.prisma.accountContact.delete({ where: { id: leftover.id } })
      }
    }

    await this.prisma.activityHistory.create({ data: { accountId: id, type: 'PROFILE_UPDATE', summary: 'Business updated' } })
    return updated
  }

  async search(q: string, take = 10) {
    const tsQuery = buildPrefixTsQuery(q)
    const safeTake = Math.max(1, Math.min(Number(take) || 10, 25))
    const likeQuery = `%${String(q || '').trim()}%`
    if (tsQuery) {
      try {
        const items = await this.prisma.$queryRaw<Array<{ id: string; label: string }>>(Prisma.sql`
          SELECT
            a.id,
            CONCAT(a."accountName", CASE WHEN COALESCE(a.city, '') <> '' THEN CONCAT(' • ', a.city) ELSE '' END, ' • ', a.id) AS label
          FROM "Account" a
          WHERE
            to_tsvector('simple', concat_ws(' ', COALESCE(a."accountName", ''), COALESCE(a."businessName", ''), COALESCE(a.city, ''), COALESCE(a."mainCategory", ''), COALESCE(a."subCategory", ''), COALESCE(a."contactPerson", ''), COALESCE(a."businessContact", '')))
              @@ to_tsquery('simple', ${tsQuery})
            OR a."accountName" ILIKE ${likeQuery}
            OR a."businessName" ILIKE ${likeQuery}
          ORDER BY a."accountName" ASC
          LIMIT ${safeTake}
        `)
        if (items.length > 0) return items
      } catch {
        // Fallback below keeps tests and non-Postgres tooling safe.
      }
    }

    const where: any = q
      ? {
          OR: [
            { accountName: { contains: q, mode: 'insensitive' } },
            { businessName: { contains: q, mode: 'insensitive' } },
            { city: { contains: q, mode: 'insensitive' } },
            { mainCategory: { contains: q, mode: 'insensitive' } },
            { subCategory: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}

    const items = await this.prisma.account.findMany({ where, orderBy: { accountName: 'asc' }, take: safeTake })
    return items.map((b: any) => ({ id: b.id, label: `${b.accountName}${b.city ? ` • ${b.city}` : ''} • ${b.id}` }))
  }

  async targetPreview(filters: AccountTargetPreviewDto) {
    const mainCategories = (filters?.mainCategories || []).map((value) => String(value || '').trim()).filter(Boolean)
    const subCategories = (filters?.subCategories || []).map((value) => String(value || '').trim()).filter(Boolean)
    const cities = (filters?.cities || []).map((value) => String(value || '').trim()).filter(Boolean)
    const districts = (filters?.districts || []).map((value) => String(value || '').trim()).filter(Boolean)
    const sources = (filters?.sources || []).map((value) => this.normalizeTargetPreviewSource(value)).filter(Boolean)
    const years = (filters?.years || []).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value >= 2000 && value <= 2100)
    const months = (filters?.months || []).map((value) => this.normalizeTargetPreviewMonth(value)).filter((value): value is number => Number.isFinite(value as number))

    const rawItems = await this.prisma.account.findMany({
      where: {
        status: 'ACTIVE' as any,
        ...(cities.length > 0 ? { city: { in: cities } } : {}),
        ...(districts.length > 0 ? { district: { in: districts } } : {}),
      },
      orderBy: { accountName: 'asc' },
      select: {
        id: true,
        accountName: true,
        mainCategory: true,
        subCategory: true,
        source: true,
        city: true,
        district: true,
        status: true,
        createdAt: true,
        tasks: {
          select: {
            id: true,
            source: true,
            mainCategory: true,
            subCategory: true,
            status: true,
            generalStatus: true,
            creationDate: true,
            createdAt: true,
          },
          orderBy: { creationDate: 'desc' },
        },
      },
      take: 10000,
    })

    const matchedItems = rawItems.filter((account: any) => {
      const accountTasks = Array.isArray(account?.tasks) ? account.tasks : []
      if (!filters?.includeActive && accountTasks.some((task: any) => String(task?.generalStatus || '').toUpperCase() === 'OPEN')) {
        return false
      }
      if (!this.matchesTargetPreviewSource(account, accountTasks, sources)) return false
      if (!this.matchesTargetPreviewCategory(account, accountTasks, mainCategories, subCategories)) return false
      if (!this.matchesTargetPreviewDate(account, accountTasks, years, months)) return false
      return true
    })

    const items = matchedItems.map((account: any) => {
      const latestTask = Array.isArray(account.tasks) && account.tasks.length > 0 ? account.tasks[0] : null
      return {
        id: account.id,
        accountName: account.accountName,
        companyName: account.accountName,
        businessName: account.accountName,
        mainCategory: account.mainCategory,
        subCategory: account.subCategory,
        sourceType: account.source,
        source: account.source,
        city: account.city,
        district: account.district,
        businessStatus: 'Aktif',
        latestTask: latestTask
          ? {
              id: latestTask.id,
              sourceType: latestTask.source,
              source: latestTask.source,
              mainCategory: latestTask.mainCategory,
              subCategory: latestTask.subCategory,
              status: latestTask.status,
              creationDate: latestTask.creationDate,
              createdAt: latestTask.createdAt,
            }
          : null,
      }
    })

    return {
      count: items.length,
      ids: items.map((item) => item.id),
      items,
    }
  }

  async targetFilterOptions() {
    const rawItems = await this.prisma.account.findMany({
      where: { status: 'ACTIVE' as any },
      select: {
        createdAt: true,
        tasks: {
          select: {
            creationDate: true,
            createdAt: true,
          },
        },
      },
      take: 10000,
    })

    const years = new Set<string>()
    const months = new Set<number>()
    const addDate = (value?: Date | string | null) => {
      if (!value) return
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return
      years.add(String(date.getFullYear()))
      months.add(date.getMonth() + 1)
    }

    rawItems.forEach((account: any) => {
      addDate(account?.createdAt)
      const tasks = Array.isArray(account?.tasks) ? account.tasks : []
      tasks.forEach((task: any) => addDate(task?.creationDate || task?.createdAt))
    })

    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
    return {
      years: Array.from(years).sort((a, b) => Number(b) - Number(a)),
      months: Array.from(months).sort((a, b) => a - b).map((monthNumber) => monthNames[monthNumber - 1]).filter(Boolean),
    }
  }

  async listContacts(accountId: string) {
    const business = await this.prisma.account.findUnique({ where: { id: accountId }, select: { id: true } })
    if (!business) throw new NotFoundException('Business not found')
    return this.prisma.accountContact.findMany({ where: { accountId }, orderBy: { isPrimary: 'desc' } })
  }

  async createContact(accountId: string, body: { type: 'BUSINESS'|'PERSON'; name: string; phone?: string; email?: string; address?: string; isPrimary?: boolean }) {
    const business = await this.prisma.account.findUnique({ where: { id: accountId }, select: { id: true } })
    if (!business) throw new NotFoundException('Business not found')
    if (body.isPrimary) {
      await this.prisma.accountContact.updateMany({ where: { accountId }, data: { isPrimary: false } })
    }
    return this.prisma.accountContact.create({ data: { accountId, type: body.type as any, name: body.name, phone: body.phone || null, email: body.email || null, address: body.address || null, isPrimary: !!body.isPrimary } })
  }

  async updateContact(accountId: string, contactId: string, body: Partial<{ type: 'BUSINESS'|'PERSON'; name: string; phone?: string; email?: string; address?: string; isPrimary?: boolean }>) {
    const contact = await this.prisma.accountContact.findUnique({ where: { id: contactId } })
    if (!contact || contact.accountId !== accountId) throw new NotFoundException('Contact not found')
    if (body.isPrimary) await this.prisma.accountContact.updateMany({ where: { accountId }, data: { isPrimary: false } })
    return this.prisma.accountContact.update({ where: { id: contactId }, data: { ...(body.type ? { type: body.type as any } : {}), ...(body.name ? { name: body.name } : {}), phone: body.phone ?? contact.phone, email: body.email ?? contact.email, address: body.address ?? contact.address, ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary } : {}) } })
  }

  async deleteContact(accountId: string, contactId: string) {
    const contact = await this.prisma.accountContact.findUnique({ where: { id: contactId } })
    if (!contact || contact.accountId !== accountId) throw new NotFoundException('Contact not found')
    await this.prisma.accountContact.delete({ where: { id: contactId } })
    return { ok: true }
  }

  async listNotes(accountId: string) {
    const business = await this.prisma.account.findUnique({ where: { id: accountId }, select: { id: true } })
    if (!business) throw new NotFoundException('Business not found')
    return this.prisma.accountNote.findMany({ where: { accountId }, orderBy: { createdAt: 'desc' }, take: 50 })
  }

  async createNote(accountId: string, content: string, createdById?: string) {
    const business = await this.prisma.account.findUnique({ where: { id: accountId }, select: { id: true } })
    if (!business) throw new NotFoundException('Business not found')
    return this.prisma.accountNote.create({ data: { accountId, content, createdById: createdById || null } })
  }

  async deleteNote(accountId: string, noteId: string) {
    const note = await this.prisma.accountNote.findUnique({ where: { id: noteId } })
    if (!note || note.accountId !== accountId) throw new NotFoundException('Note not found')
    await this.prisma.accountNote.delete({ where: { id: noteId } })
    return { ok: true }
  }

  async updateNote(accountId: string, noteId: string, content: string) {
    const note = await this.prisma.accountNote.findUnique({ where: { id: noteId } })
    if (!note || note.accountId !== accountId) throw new NotFoundException('Note not found')
    return this.prisma.accountNote.update({ where: { id: noteId }, data: { content } })
  }

  async changeStatus(id: string, status: 'ACTIVE'|'PASSIVE', userId?: string) {
    const business = await this.prisma.account.findUnique({ where: { id }, include: { tasks: { where: { generalStatus: 'OPEN' } } } })
    if (!business) throw new NotFoundException('Business not found')

    return this.prisma.$transaction(async (tx) => {
      if (status === 'PASSIVE' && business.tasks.length > 0) {
        for (const t of business.tasks) {
          await tx.task.update({
            where: { id: t.id },
            data: {
              status: 'COLD',
              generalStatus: 'CLOSED',
              closedAt: new Date(),
            },
          })
          if (userId) {
            await tx.activityLog.create({
              data: {
                taskId: t.id,
                authorId: userId,
                reason: 'YETKILIYE_ULASILDI', // Fallback generic reason
                text: '<span class="manager-note">[Sistem]</span> İşletme pasife (kapalı) çekildiği için bu görev otomatik olarak kapatıldı.',
              }
            })
          }
        }
      }
      const updated = await tx.account.update({ where: { id }, data: { status } as any })
      await tx.activityHistory.create({ data: { accountId: id, type: 'PROFILE_UPDATE', summary: `Status changed to ${status}` } })
      return updated
    })
  }

  accountActivityHistory(id: string) { return this.prisma.activityHistory.findMany({ where: { accountId: id }, orderBy: { createdAt: 'desc' }, take: 100 }) }
  accountDealHistory(id: string) { return this.prisma.dealHistory.findMany({ where: { deal: { accountId: id } }, orderBy: { createdAt: 'desc' }, take: 100 }) }
  accountTaskHistory(id: string) {
    return this.prisma.task.findMany({
      where: { accountId: id },
      orderBy: { creationDate: 'desc' },
      take: 100,
      select: {
        id: true,
        type: true,
        status: true,
        generalStatus: true,
        source: true,
        mainCategory: true,
        subCategory: true,
        creationDate: true,
        closedAt: true,
        closedReason: true,
        historicalAssignee: true,
        owner: { select: { id: true, name: true, email: true } },
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            author: { select: { id: true, name: true, email: true } },
          },
        },
      },
    })
  }

  private async generateAccountPublicId(tx: PrismaService) {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const prefix = `ACC-${y}${m}-`
    const last = await (tx as any).account.findFirst({
      where: { accountPublicId: { startsWith: prefix } },
      orderBy: { accountPublicId: 'desc' },
      select: { accountPublicId: true },
    })
    let seq = 1
    if (last?.accountPublicId) {
      const lastSeq = parseInt(last.accountPublicId.replace(prefix, ''), 10)
      if (!isNaN(lastSeq)) seq = lastSeq + 1
    }
    return prefix + String(seq).padStart(5, '0')
  }

  async remove(id: string) {
    const business = await this.prisma.account.findUnique({ where: { id } })
    if (!business) throw new NotFoundException('Business not found')

    const [tasks, deals] = await this.prisma.$transaction([
      this.prisma.task.findMany({ where: { accountId: id }, select: { id: true } }),
      this.prisma.deal.findMany({ where: { accountId: id }, select: { id: true } }),
    ])

    const taskIds = tasks.map((x: any) => x.id)
    const dealIds = deals.map((x: any) => x.id)

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.lead.updateMany({ where: { linkedAccountId: id }, data: { linkedAccountId: null } }),
    ]

    if (taskIds.length) {
      ops.push(
        this.prisma.deal.updateMany({ where: { taskId: { in: taskIds } }, data: { taskId: null } }),
        this.prisma.taskContact.deleteMany({ where: { taskId: { in: taskIds } } }),
        this.prisma.offer.deleteMany({ where: { taskId: { in: taskIds } } }),
        this.prisma.activityLog.deleteMany({ where: { taskId: { in: taskIds } } }),
        this.prisma.notification.deleteMany({ where: { taskId: { in: taskIds } } }),
        this.prisma.task.deleteMany({ where: { accountId: id } }),
      )
    } else {
      ops.push(this.prisma.task.deleteMany({ where: { accountId: id } }))
    }

    if (dealIds.length) {
      ops.push(this.prisma.dealHistory.deleteMany({ where: { dealId: { in: dealIds } } }))
    }

    ops.push(
      this.prisma.deal.deleteMany({ where: { accountId: id } }),
      this.prisma.accountNote.deleteMany({ where: { accountId: id } }),
      this.prisma.accountContact.deleteMany({ where: { accountId: id } }),
      this.prisma.activityHistory.deleteMany({ where: { accountId: id } }),
      this.prisma.account.delete({ where: { id } }),
    )

    await this.prisma.$transaction(ops)
    return { ok: true }
  }

  async duplicate(id: string, suffix?: string) {
    const business = await this.prisma.account.findUnique({ where: { id } })
    if (!business) throw new NotFoundException('Business not found')

    const sfx = suffix || ''
    const name = `${business.accountName}${sfx}`
    const bname = `${business.businessName}${sfx}`

    const created = await this.prisma.account.create({
      data: {
        accountName: name,
        businessName: bname,
        status: business.status,
        source: business.source,
        category: business.category,
        type: business.type,
        city: (business as any).city || null,
        district: (business as any).district || null,
        address: (business as any).address || null,
        website: (business as any).website || null,
        instagram: (business as any).instagram || null,
        campaignUrl: (business as any).campaignUrl || null,
        businessContact: (business as any).businessContact || null,
        contactPerson: (business as any).contactPerson || null,
        notes: (business as any).notes || null,
        services: (business as any).services || null,
        bestService: (business as any).bestService || null,
      } as any,
    })

    await this.prisma.activityHistory.create({ data: { accountId: created.id, type: 'PROFILE_UPDATE', summary: `Business duplicated from ${business.id}` } })
    return created
  }

  private fuzzyName(name: string) {
    return this.normalizeBusinessCoreName(name)
  }

  private toTitleCase(str: string) {
    if (!str) return '';
    return str.toLocaleLowerCase('tr-TR').replace(/(?:^|\s)\S/g, (a) => a.toLocaleUpperCase('tr-TR'));
  }

  private standardizePhone(phone: string) {
    if (!phone) return '';
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('+90')) cleaned = cleaned.substring(3);
    else if (cleaned.startsWith('90') && cleaned.length === 12) cleaned = cleaned.substring(2);
    if (cleaned.length === 10 && !cleaned.startsWith('0')) cleaned = '0' + cleaned;
    return cleaned;
  }

  private resolveImportedCategories(rawMainCategory: string, rawSubCategory: string, companyName: string) {
    const rawMainCat = rawMainCategory || ''
    const rawSubCat = rawSubCategory || ''
    const textForMatch = `${rawMainCat} ${rawSubCat} ${companyName}`.toLocaleLowerCase('tr-TR')
    const fuzzyMatch = textForMatch
      .replace(/[ç]/g, 'c')
      .replace(/[ğ]/g, 'g')
      .replace(/[ı]/g, 'i')
      .replace(/[ö]/g, 'o')
      .replace(/[ş]/g, 's')
      .replace(/[ü]/g, 'u')

    let actualMainCatKey = rawMainCat || 'Diğer'
    let finalSubCat = rawSubCat || 'Belirtilmemiş'

    if (/masaj|spa|hamam|kese|wellness|refleksoloji|shiatsu/i.test(textForMatch)) {
      actualMainCatKey = 'Masaj - Spa (Core)'
      if (/bali/i.test(textForMatch)) finalSubCat = 'Bali Masajı'
      else if (/thai/i.test(textForMatch)) finalSubCat = 'Thai Masajı'
      else if (/isveç|isvec/i.test(fuzzyMatch)) finalSubCat = 'İsveç Masajı'
      else if (/köpük|kopuk|hamam/i.test(fuzzyMatch)) finalSubCat = 'Hamam'
      else if (/çift|cift/i.test(fuzzyMatch)) finalSubCat = 'Çift Masajı'
      else if (/otel/i.test(textForMatch)) finalSubCat = 'Otel Spa'
      else if (/aroma/i.test(textForMatch)) finalSubCat = 'Aromaterapi Masajı'
      else if (/bebek/i.test(textForMatch)) finalSubCat = 'Bebek Spa'
      else finalSubCat = 'Masaj'
    } else if (/kahvaltı|brunch|kahvalti/i.test(fuzzyMatch)) {
      actualMainCatKey = 'Kahvaltı (Core)'
      if (/serpme/i.test(textForMatch)) finalSubCat = 'Serpme Kahvaltı'
      else if (/açık büfe|acik bufe/i.test(fuzzyMatch)) finalSubCat = 'Açık Büfe Kahvaltı'
      else if (/köy|koy/i.test(fuzzyMatch)) finalSubCat = 'Köy Kahvaltısı'
      else if (/boğaz|bogaz/i.test(fuzzyMatch)) finalSubCat = 'Boğazda Kahvaltı'
      else if (/tekne/i.test(textForMatch)) finalSubCat = 'Teknede Kahvaltı'
      else if (/otel/i.test(textForMatch)) finalSubCat = 'Otelde Kahvaltı'
      else if (/brunch/i.test(textForMatch)) finalSubCat = 'Brunch'
      else finalSubCat = 'Kahvaltı Tabağı'
    } else if (/(iftar|ramazan)/i.test(textForMatch) && !/bayram/i.test(textForMatch)) {
      actualMainCatKey = 'İftar (Core)'
      if (/avrupa/i.test(textForMatch)) finalSubCat = 'Avrupa Yakası İftar'
      else if (/anadolu/i.test(textForMatch)) finalSubCat = 'Anadolu Yakası İftar'
      else if (/açık büfe|acik bufe/i.test(fuzzyMatch)) finalSubCat = 'Açık Büfe İftar'
      else if (/tekne/i.test(textForMatch)) finalSubCat = 'Teknede İftar'
      else if (/otel/i.test(textForMatch)) finalSubCat = 'Otelde İftar'
      else finalSubCat = 'Restoranda İftar'
    } else if (/güzellik|guzellik|epilasyon|lazer|cilt|saç|sac|makyaj|botoks|zayıflama|zayiflama|incelme|pedikür|manikür|oje|nail|protez|biorezonans|solaryum/i.test(fuzzyMatch)) {
      actualMainCatKey = 'Güzellik (Core)'
      if (/epilasyon|lazer|ağda|agda/i.test(fuzzyMatch)) finalSubCat = 'Epilasyon - Ağda'
      else if (/cilt|yüz/i.test(textForMatch)) finalSubCat = 'Cilt Bakımı'
      else if (/saç|sac|makyaj/i.test(fuzzyMatch)) finalSubCat = 'Saç - Makyaj'
      else if (/zayıflama|zayiflama|incelme/i.test(fuzzyMatch)) finalSubCat = 'Zayıflama'
      else if (/manikür|pedikür|tırnak|oje|nail|protez/i.test(fuzzyMatch)) finalSubCat = 'Manikür - Pedikür'
      else if (/biorezonans/i.test(textForMatch)) finalSubCat = 'Biorezonans'
      else if (/botoks|dolgu/i.test(textForMatch)) finalSubCat = 'Botoks - Dolgu'
      else if (/solaryum/i.test(textForMatch)) finalSubCat = 'Solaryum'
      else finalSubCat = 'Cilt Bakımı'
    } else if (/spor|fitness|gym|yoga|pilates|yüzme|yuzme|kurs|eğitim|egitim|dans|gelişim|gelisim|atölye|atolye/i.test(fuzzyMatch)) {
      actualMainCatKey = 'Spor - Eğitim - Kurs (Core)'
      if (/yoga|nefes/i.test(textForMatch)) finalSubCat = 'Yoga - Nefes Terapisi'
      else if (/pilates/i.test(textForMatch)) finalSubCat = 'Pilates'
      else if (/fitness|gym/i.test(textForMatch)) finalSubCat = 'Fitness - Gym'
      else if (/dans|müzik|muzik/i.test(fuzzyMatch)) finalSubCat = 'Dans - Müzik'
      else if (/dil/i.test(textForMatch)) finalSubCat = 'Dil Eğitimi'
      else if (/yüzme|yuzme/i.test(fuzzyMatch)) finalSubCat = 'Yüzme Kursu'
      else if (/anaokulu|çocuk|cocuk/i.test(fuzzyMatch)) finalSubCat = 'Anaokulu - Çocuk'
      else if (/online/i.test(textForMatch)) finalSubCat = 'Online Kurslar'
      else finalSubCat = 'Atölye'
    } else if (/bilet|tiyatro|konser|sinema|sergi|müze|muze|akvaryum/i.test(fuzzyMatch)) {
      actualMainCatKey = 'Bilet - Etkinlik (Core)'
      if (/çocuk|cocuk/i.test(fuzzyMatch) && /tiyatro|oyun/i.test(textForMatch)) finalSubCat = 'Çocuk Tiyatro'
      else if (/tiyatro/i.test(textForMatch)) finalSubCat = 'Tiyatro'
      else if (/konser/i.test(textForMatch)) finalSubCat = 'Konser'
      else if (/sinema/i.test(textForMatch)) finalSubCat = 'Sinema'
      else if (/akvaryum|tema park/i.test(textForMatch)) finalSubCat = 'Akvaryum - Tema Park'
      else if (/sergi|müze|muze/i.test(fuzzyMatch)) finalSubCat = 'Sergi - Müze'
      else if (/parti|festival/i.test(textForMatch)) finalSubCat = 'Parti - Festival'
      else finalSubCat = 'Gösteri - Müzikal'
    } else if (/aktivite|eğlence|eglence|paintball|kaçış|kacis|havuz|su sporları|rafting|yamaç|yamac|binicilik|poligon/i.test(fuzzyMatch)) {
      actualMainCatKey = 'Aktivite - Eğlence (Core)'
      if (/paintball|poligon/i.test(textForMatch)) finalSubCat = 'Poligon - Paintball'
      else if (/kaçış|kacis|sanal|vr/i.test(fuzzyMatch)) finalSubCat = 'Sanal Gerçeklik - Kaçış'
      else if (/havuz|plaj/i.test(textForMatch)) finalSubCat = 'Havuz - Plaj'
      else if (/su sporları|su sporlari/i.test(fuzzyMatch)) finalSubCat = 'Su Sporları'
      else if (/rafting|yamaç|yamac/i.test(fuzzyMatch)) finalSubCat = 'Rafting - Yamaç Paraşütü'
      else if (/binicilik|at |parkur/i.test(textForMatch)) finalSubCat = 'Binicilik - Parkur'
      else finalSubCat = 'Eğlence Merkezi'
    } else if (/hizmet|oto|araç|arac|temizleme|yıkama|yikama|kuru temizleme|sigorta|nakliye|fotoğraf|fotograf|vize/i.test(fuzzyMatch)) {
      actualMainCatKey = 'Hizmet (Core)'
      if (/araç|arac|kiralama|vize/i.test(fuzzyMatch)) finalSubCat = 'Araç Kiralama - Vize'
      else if (/ev hizmetleri/i.test(textForMatch)) finalSubCat = 'Ev Hizmetleri'
      else if (/hayvan|evcil|veteriner/i.test(textForMatch)) finalSubCat = 'Evcil Hayvan Hizmetleri'
      else if (/fotoğraf|fotograf/i.test(fuzzyMatch)) finalSubCat = 'Fotoğrafçılık - Baskı'
      else if (/kuru temizleme/i.test(textForMatch)) finalSubCat = 'Kuru Temizleme'
      else if (/sigorta/i.test(textForMatch)) finalSubCat = 'Sigorta'
      else if (/transfer|nakliye/i.test(textForMatch)) finalSubCat = 'Transfer - Nakliye'
      else finalSubCat = 'Oto Bakım'
    } else if (/yılbaşı|yilbasi|yeniyıl|yeni yil/i.test(fuzzyMatch)) {
      actualMainCatKey = 'Yılbaşı (Core)'
      if (/tatil|otel|konaklama/i.test(textForMatch)) finalSubCat = 'Yılbaşı Tatili'
      else if (/tur/i.test(textForMatch)) finalSubCat = 'Yılbaşı Turları'
      else finalSubCat = 'Yılbaşı Eğlencesi'
    } else if (/sevgililer günü|sevgililer gunu|14 şubat|14 subat/i.test(fuzzyMatch)) {
      actualMainCatKey = 'Sevgililer Günü (Core)'
      if (/konaklama|otel/i.test(textForMatch)) finalSubCat = 'Sevgililer Günü Konaklama'
      else if (/spa|masaj/i.test(textForMatch)) finalSubCat = 'Sevgililer Günü Spa'
      else if (/tur/i.test(textForMatch)) finalSubCat = 'Sevgililer Günü Tur'
      else if (/yemek|restoran/i.test(textForMatch)) finalSubCat = 'Sevgililer Günü Yemek'
      else if (/hediye/i.test(textForMatch)) finalSubCat = 'Sevgililer Günü Hediye'
      else finalSubCat = 'Sevgililer Günü Etkinlik'
    } else if (/bayram/i.test(textForMatch) && /tur|tatil/i.test(textForMatch)) {
      actualMainCatKey = 'Bayram Turları (Travel)'
      if (/kurban/i.test(textForMatch)) finalSubCat = 'Kurban Bayramı Turları'
      else finalSubCat = 'Ramazan Bayramı Turları'
    } else if (/özel günler|ozel gunler|anneler günü|anneler gunu|kadınlar günü|kadinlar gunu|bayram|cuma/i.test(fuzzyMatch) && !/tur/i.test(textForMatch)) {
      actualMainCatKey = 'Özel Günler (Core)'
      if (/anneler/i.test(textForMatch)) finalSubCat = 'Anneler Günü'
      else if (/kadınlar|kadinlar/i.test(fuzzyMatch)) finalSubCat = 'Kadınlar Günü'
      else if (/bayram/i.test(textForMatch)) finalSubCat = 'Bayram'
      else if (/cuma/i.test(textForMatch)) finalSubCat = 'Harika Cuma'
      else finalSubCat = 'Özel Günler (Core)'
    } else if (/tatil otelleri|akdeniz|ege|marmara|karadeniz|iç anadolu|ic anadolu/i.test(fuzzyMatch)) {
      actualMainCatKey = 'Tatil Otelleri (Travel)'
      if (/akdeniz/i.test(textForMatch)) finalSubCat = 'Akdeniz Bölgesi'
      else if (/ege/i.test(textForMatch)) finalSubCat = 'Ege Bölgesi'
      else if (/karadeniz/i.test(textForMatch)) finalSubCat = 'Karadeniz Bölgesi'
      else if (/marmara/i.test(textForMatch)) finalSubCat = 'Marmara Bölgesi'
      else finalSubCat = 'İç Anadolu Bölgesi'
    } else if (/yurt\s?içi otel|yurt\s?ici otel|otel|konaklama/i.test(fuzzyMatch) && !/yurt\s?dışı|yurt\s?disi|kıbrıs|kibris/i.test(fuzzyMatch)) {
      actualMainCatKey = 'Yurtiçi Otel (Travel)'
      if (/istanbul/i.test(textForMatch)) finalSubCat = 'İstanbul Otelleri'
      else if (/ankara/i.test(textForMatch)) finalSubCat = 'Ankara Otelleri'
      else if (/antalya/i.test(textForMatch)) finalSubCat = 'Antalya Otelleri'
      else if (/bursa/i.test(textForMatch)) finalSubCat = 'Bursa Otelleri'
      else if (/izmir/i.test(textForMatch)) finalSubCat = 'İzmir Otelleri'
      else if (/termal/i.test(textForMatch)) finalSubCat = 'Yurtiçi Termal Otel'
      else finalSubCat = 'Diğer Kentler'
    } else if (/yurt\s?içi tur|yurt\s?ici tur|tur/i.test(fuzzyMatch) && !/yurt\s?dışı|yurt\s?disi|kıbrıs|kibris|bayram|yılbaşı|yilbasi/i.test(fuzzyMatch)) {
      actualMainCatKey = 'Yurtiçi Turlar (Travel)'
      if (/günübirlik|gunubirlik/i.test(fuzzyMatch)) finalSubCat = 'Günübirlik Turlar'
      else if (/hafta\s?sonu/i.test(textForMatch)) finalSubCat = 'Haftasonu Turları'
      else if (/kapadokya/i.test(textForMatch)) finalSubCat = 'Kapadokya Turları'
      else if (/karadeniz/i.test(textForMatch)) finalSubCat = 'Karadeniz Turları'
      else if (/kayak|kış|kis/i.test(fuzzyMatch)) finalSubCat = 'Kayak Turları'
      else if (/kültür|kultur/i.test(fuzzyMatch)) finalSubCat = 'Kültür Turları'
      else if (/mavi yolculuk/i.test(textForMatch)) finalSubCat = 'Mavi Yolculuk'
      else finalSubCat = 'Yurtiçi Paket Tur'
    } else if (/yurt\s?dışı|yurt\s?disi|kıbrıs|kibris|vizesiz|afrika|amerika|asya|avrupa|balkanlar|uzak\s?doğu|uzak\s?dogu|italya|fransa|ispanya|paris|roma|mısır|dubai|yunanistan/i.test(fuzzyMatch)) {
      actualMainCatKey = 'Yurtdışı Turlar (Travel)'
      if (/kıbrıs|kibris/i.test(fuzzyMatch)) finalSubCat = 'Kıbrıs Otel'
      else if (/vizesiz avrupa/i.test(textForMatch)) finalSubCat = 'Vizesiz Avrupa'
      else if (/vizesiz balkan/i.test(textForMatch)) finalSubCat = 'Vizesiz Balkanlar'
      else if (/avrupa|italya|fransa|ispanya|paris|roma|yunanistan/i.test(textForMatch)) finalSubCat = 'Avrupa'
      else if (/balkanlar/i.test(textForMatch)) finalSubCat = 'Balkanlar ve Yunanistan'
      else if (/afrika|mısır|misir/i.test(fuzzyMatch)) finalSubCat = 'Afrika'
      else if (/amerika/i.test(textForMatch)) finalSubCat = 'Amerika'
      else if (/asya|dubai/i.test(textForMatch)) finalSubCat = 'Asya'
      else if (/uzak\s?doğu|uzak\s?dogu/i.test(fuzzyMatch)) finalSubCat = 'Uzakdoğu'
      else if (/otel/i.test(textForMatch)) finalSubCat = 'Yurtdışı Otel'
      else finalSubCat = 'Avrupa'
    } else if (/yemek|restoran|pizza|pide|burger|kebap|et |steak|meyhane|suşi|sushi|fast food|tatlı|tatli|kahve|cafe|kafe/i.test(fuzzyMatch)) {
      actualMainCatKey = 'Yemek (Core)'
      if (/fast|burger|pizza|pide/i.test(textForMatch)) finalSubCat = 'Fast Food'
      else if (/mangal|steak|et /i.test(textForMatch)) finalSubCat = 'Mangal - Steakhouse'
      else if (/meyhane|fasıl|fasil/i.test(fuzzyMatch)) finalSubCat = 'Meyhane - Fasıl'
      else if (/tatlı|tatli|kahve|fırın|firin|cafe|kafe/i.test(fuzzyMatch)) finalSubCat = 'Kahve - Fırın - Tatlı'
      else if (/dünya mutfağı|dunya mutfagi|sushi|suşi/i.test(fuzzyMatch)) finalSubCat = 'Dünya Mutfağı'
      else if (/türk mutfağı|turk mutfagi/i.test(fuzzyMatch)) finalSubCat = 'Türk Mutfağı'
      else if (/tekne/i.test(textForMatch)) finalSubCat = 'Tekne'
      else finalSubCat = 'Akşam Yemeği'
    }

    return { actualMainCatKey, finalSubCat }
  }

  async importBulkData(rows: any[], userId: string, defaultAssigneeId?: string) {
    let addedBizCount = 0;
    let addedTaskCount = 0;
    let processedRowCount = 0;
    const errors: Array<{ rowNumber: number | null; companyName: string; message: string }> = [];
    const warnings: Array<{
      rowNumber: number | null
      companyName: string
      field: 'taskTarihi' | 'aranacakTarih'
      originalValue: string
      fallbackValue: string
      message: string
    }> = [];

    const allAccounts = await this.prisma.account.findMany({ select: { id: true, accountName: true } });
    const existingBizMap = new Map<string, string>();
    allAccounts.forEach(acc => {
      if (acc.accountName) existingBizMap.set(this.fuzzyName(acc.accountName), acc.id);
    });

    const allUsers = await this.prisma.user.findMany({ select: { id: true, name: true } });
    const userMap = new Map<string, string>();
    allUsers.forEach(u => {
      if (u.name) userMap.set(u.name.toLowerCase().trim(), u.id);
    });

    let parsedDefaultOwnerId: string | null = null;
    if (defaultAssigneeId && typeof defaultAssigneeId === 'string' && defaultAssigneeId !== 'UNASSIGNED') {
       if (allUsers.some(u => u.id === defaultAssigneeId)) {
           parsedDefaultOwnerId = defaultAssigneeId;
       } else {
           parsedDefaultOwnerId = userMap.get(defaultAssigneeId.toLowerCase().trim()) || null;
       }
    }

    let defaultActiveList = await this.prisma.taskList.findFirst({ where: { isActive: true } });
    if (!defaultActiveList) {
       defaultActiveList = await this.prisma.taskList.create({
         data: { name: 'Genel Havuz', tag: 'GENERAL', isActive: true }
       });
    }

    let archiveList = await this.prisma.taskList.findFirst({ where: { name: 'Geçmiş Kayıtlar (CSV Arşivi)' } });
    if (!archiveList) {
       archiveList = await this.prisma.taskList.create({
         data: { name: 'Geçmiş Kayıtlar (CSV Arşivi)', tag: 'PROJECT', isActive: false, description: 'Sistemden aktarılan tarihi kayıtlar' }
       });
    }

    for (const row of rows) {
      let rawCompanyName = (row.companyName || '').trim();
      if (!rawCompanyName) continue;

      const rowNumber = Number.isFinite(Number(row.rowNumber)) ? Number(row.rowNumber) : null;
      const malformedRowMessage = this.detectMalformedImportRow(row);
      if (malformedRowMessage) {
        errors.push({
          rowNumber,
          companyName: this.toTitleCase(rawCompanyName),
          message: malformedRowMessage,
        });
        continue;
      }

      rawCompanyName = rawCompanyName.replace(/\s*\(\d{1,2}[-./]\d{1,2}[-./]\d{2,4}\)\s*/g, '').replace(/\s*\(Tarihsiz\)\s*/gi, '').trim();
      if (rawCompanyName.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ]/g, '').length < 3) continue;

      const cleanCompanyName = this.toTitleCase(rawCompanyName);
      const normalizedName = this.fuzzyName(cleanCompanyName);

      const { actualMainCatKey, finalSubCat } = this.resolveImportedCategories(row.mainCategory || '', row.subCategory || '', cleanCompanyName)

      const mappedSource = normalizeAccountSource(row.sourceType || 'FRESH');

      let taskCatEnum = 'ISTANBUL_CORE';
      let rawTaskCat = String(row.taskCategory || '').toUpperCase();
      if (rawTaskCat.includes('ANADOLU')) taskCatEnum = 'ANADOLU_CORE';
      else if (rawTaskCat.includes('TRAVEL')) taskCatEnum = 'TRAVEL';

      let accountId = existingBizMap.get(normalizedName);

      const specificContactNameRaw = row.contactName || '';
      const specificContactPhoneRaw = row.contactPhone || '';
      const specificContactEmailRaw = row.contactEmail || '';
      const specificCampaignUrl = (row.campaignUrl || '').trim();
      const specificWebsite = (row.website || '').trim();
      const specificInstagram = (row.instagram || '').trim();

      const contactNames = this.extractImportedContactNames(specificContactNameRaw);
      const contactPhones = specificContactPhoneRaw ? String(specificContactPhoneRaw).split(/[,/]/).map(s => this.standardizePhone(s.trim())).filter(Boolean) : [];
      const contactEmails = specificContactEmailRaw ? String(specificContactEmailRaw).split(/[,/]/).map(s => s.trim().toLowerCase()).filter(Boolean) : [];
      const primaryContactName = contactNames[0] || '';
      const primaryContactPhone = contactPhones[0] || '';

      let rowAddedBizCount = 0;
      let rowAddedTaskCount = 0;

      try {
        await this.prisma.$transaction(async (tx) => {
          let isNewBiz = false;

          if (!accountId) {
            isNewBiz = true;
            rowAddedBizCount++;
          const pubId = await this.generateAccountPublicId(tx as any);
          const finalPubId = `${pubId}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          let parsedCity = this.toTitleCase(row.city || '') || 'İstanbul'
          let parsedDistrict = this.toTitleCase(row.district || '')
          if (parsedCity && parsedCity.includes('-')) {
             const parts = parsedCity.split('-')
             parsedCity = parts[0].trim()
             if (!parsedDistrict && parts.slice(1).join('-').trim()) {
                 parsedDistrict = parts.slice(1).join('-').trim()
             }
          }

          const newAcc = await tx.account.create({
            data: {
              accountPublicId: finalPubId,
              accountName: cleanCompanyName,
              businessName: cleanCompanyName,
              city: parsedCity,
              district: parsedDistrict,
              address: row.address || null,
              source: mappedSource as any, 
              type: 'KEY',
              status: 'ACTIVE',
              mainCategory: actualMainCatKey,
              subCategory: finalSubCat,
              category: `${actualMainCatKey} / ${finalSubCat}`,
               website: specificWebsite || null, 
              instagram: specificInstagram || null,
              campaignUrl: specificCampaignUrl || null,
              businessContact: primaryContactPhone || null,
              contactPerson: primaryContactName || null,
            }
          });
          accountId = newAcc.id;
          existingBizMap.set(normalizedName, accountId);
          } else {
            const existingAccount = await tx.account.findUnique({
              where: { id: accountId },
              select: { website: true, instagram: true, campaignUrl: true }
            });
            const accountPatch = {
              ...(specificWebsite && !existingAccount?.website ? { website: specificWebsite } : {}),
              ...(specificInstagram && !existingAccount?.instagram ? { instagram: specificInstagram } : {}),
              ...(specificCampaignUrl && !existingAccount?.campaignUrl ? { campaignUrl: specificCampaignUrl } : {}),
            };
            if (Object.keys(accountPatch).length > 0) {
              await tx.account.update({
                   where: { id: accountId },
                  data: accountPatch
              });
            }
          }

          const existingContacts = await tx.accountContact.findMany({ where: { accountId }});
          let taskPrimaryContactId: string | null = null;
          const maxContacts = Math.max(contactNames.length, contactPhones.length, contactEmails.length, 1);
          for (let j = 0; j < maxContacts; j++) {
            const cName = contactNames[j] || 'Yetkili';
            const cPhone = contactPhones[j] || null;
            const cEmail = contactEmails[j] || null;

            if (cName !== 'Yetkili' || cPhone || cEmail) {
              const existingMatchedContact = existingContacts.find(c => 
                (cPhone && c.phone === cPhone) ||
                (cName && c.name === cName && cName !== 'Yetkili')
              );
              if (!existingMatchedContact) {
                const isPrimaryContact = existingContacts.length === 0;
                const createdContact = await tx.accountContact.create({
                  data: {
                    accountId: accountId!,
                    type: 'PERSON',
                    name: cName,
                    phone: cPhone,
                    email: cEmail,
                    isPrimary: isPrimaryContact
                  }
                });
                existingContacts.push(createdContact);
                if (!taskPrimaryContactId) taskPrimaryContactId = createdContact.id;
              } else if (cEmail && !existingMatchedContact.email) {
                await tx.accountContact.update({
                  where: { id: existingMatchedContact.id },
                  data: { email: cEmail }
                });
                existingMatchedContact.email = cEmail;
              }
              if (!taskPrimaryContactId) taskPrimaryContactId = existingMatchedContact?.id || taskPrimaryContactId;
            }
          }

          const rawTarih = row.taskTarihi;
          const logText = row.loglama || '';
          let taskCreatedAtISO = new Date();
          const rowDateWarnings: string[] = [];
          if (rawTarih) {
            const parsedTaskDate = this.parseImportedDateValue(rawTarih);
            if (!parsedTaskDate) {
              taskCreatedAtISO = this.importedFallbackDate();
              warnings.push({
                rowNumber,
                companyName: cleanCompanyName,
                field: 'taskTarihi',
                originalValue: String(rawTarih),
                fallbackValue: '2000-01-01T12:00:00.000Z',
                message: `Geçersiz görev tarihi 01.01.2000 olarak kaydedildi: ${rawTarih}`,
              });
              rowDateWarnings.push(`Görev tarihi "${rawTarih}" geçersiz olduğu için 01.01.2000 olarak kaydedildi.`);
            } else {
              taskCreatedAtISO = parsedTaskDate;
            }
          } else {
            taskCreatedAtISO = this.importedFallbackDate();
          }

          let aranacakTarih = row.aranacakTarih || row.aranacak || row.nextcall || null;
          let dueDateISO = null;
          if (aranacakTarih) {
            dueDateISO = this.parseImportedDateValue(aranacakTarih);
            if (!dueDateISO) {
              dueDateISO = this.importedFallbackDate();
              warnings.push({
                rowNumber,
                companyName: cleanCompanyName,
                field: 'aranacakTarih',
                originalValue: String(aranacakTarih),
                fallbackValue: '2000-01-01T12:00:00.000Z',
                message: `Geçersiz aranacak tarih 01.01.2000 olarak kaydedildi: ${aranacakTarih}`,
              });
              rowDateWarnings.push(`Aranacak tarih "${aranacakTarih}" geçersiz olduğu için 01.01.2000 olarak kaydedildi.`);
            }
          }

          let rawStatus = String(row.durum || '').toLowerCase().replace(/[\s_,-]/g, '');
          let finalStatus = 'NEW';
          let generalStatus = 'OPEN';
          let closedAt = null;

          if (rawStatus.includes('deal') || rawStatus.includes('anlas') || rawStatus.includes('satis')) { finalStatus = 'DEAL'; generalStatus = 'CLOSED'; closedAt = taskCreatedAtISO; }
          else if (rawStatus.includes('cold') || rawStatus.includes('iptal') || rawStatus.includes('soguk')) { finalStatus = 'COLD'; generalStatus = 'CLOSED'; closedAt = taskCreatedAtISO; }
          else if (rawStatus.includes('nothot') || rawStatus.includes('ilik')) finalStatus = 'NOT_HOT';
          else if (rawStatus.includes('hot') || rawStatus.includes('sicak')) finalStatus = 'HOT';
          else if (rawStatus.includes('takip') || rawStatus.includes('follow') || rawStatus.includes('yeni') || rawStatus.includes('new')) finalStatus = 'NEW';
          else if (!rawStatus) {
            finalStatus = this.inferImportedStatusFromLog(logText) || 'COLD'
            if (finalStatus === 'DEAL' || finalStatus === 'COLD') {
              generalStatus = 'CLOSED'
              closedAt = taskCreatedAtISO
            }
          }
        
          // Next call date overrides status to FOLLOWUP (Açık - FollowUpDate set edilir)
          if (dueDateISO && finalStatus !== 'DEAL' && finalStatus !== 'COLD') {
             finalStatus = 'FOLLOWUP';
          }

          let rawAssignee = row.sonSatisci ? String(row.sonSatisci).trim() : '';
          let ownerId: string | null = null;
          let historicalAssigneeText: string | null = null;

          const normalizedDefaultAssignee = defaultAssigneeId && typeof defaultAssigneeId === 'string'
            ? defaultAssigneeId.trim()
            : ''
          const isOverride = Boolean(normalizedDefaultAssignee && normalizedDefaultAssignee.toUpperCase() !== 'UNASSIGNED')
          const effectiveAssignee = rawAssignee || (isOverride ? normalizedDefaultAssignee : '');

          if (effectiveAssignee && effectiveAssignee.toUpperCase() !== 'UNASSIGNED') {
           ownerId = isOverride ? parsedDefaultOwnerId : (userMap.get(effectiveAssignee.toLowerCase()) || null);
           if (!ownerId) historicalAssigneeText = this.toTitleCase(effectiveAssignee);
          }

          if (!effectiveAssignee && !historicalAssigneeText && (finalStatus === 'DEAL' || finalStatus === 'COLD')) ownerId = null; 

          const targetTaskListId = (finalStatus === 'DEAL' || finalStatus === 'COLD' || taskCreatedAtISO.getFullYear() < new Date().getFullYear()) 
            ? archiveList.id 
            : defaultActiveList.id;

          const task = await tx.task.create({
          data: {
            accountId: accountId!,
            taskListId: targetTaskListId,
            category: taskCatEnum as any,
            type: 'GENERAL',
            accountType: 'KEY',
            mainCategory: actualMainCatKey,
            subCategory: finalSubCat,
            contact: [primaryContactName, primaryContactPhone].filter(Boolean).join(' / ') || null,
            details: 'CSV Import Verisi',
            ownerId: ownerId, 
            historicalAssignee: historicalAssigneeText,
            status: finalStatus as any,
            generalStatus: generalStatus as any,
            creationDate: taskCreatedAtISO,
            dueDate: dueDateISO,
            closedAt,
            campaignUrl: specificCampaignUrl || null,
            source: mappedSource as any, 
            priority: 'MEDIUM'
          }
          });
          rowAddedTaskCount++;

          if (taskPrimaryContactId) {
            await tx.taskContact.create({
              data: {
                taskId: task.id,
                contactId: taskPrimaryContactId,
                isPrimary: true,
              }
            });
          }

          let contactInfoStr = "";
          if (primaryContactName || primaryContactPhone || specificCampaignUrl) {
           contactInfoStr = ` (Yetkili: ${primaryContactName || '-'} / ${primaryContactPhone || '-'} | Kampanya: ${specificCampaignUrl || '-'})`;
          }

          let legacyWarning = historicalAssigneeText ? `<br><span style="color:#b45309; font-size:11px; font-weight:bold;">Arşivdeki İşlemi Yapan Personel: ${historicalAssigneeText}</span>` : '';

          let finalLogText = '';
          const importWarningHtml = rowDateWarnings.length > 0
            ? `<div style="margin:6px 0 8px 0; padding:8px 10px; border-radius:8px; background:#fff7ed; color:#9a3412; font-size:11px; font-weight:600;">Tarih Uyarısı: ${rowDateWarnings.join(' | ')}</div>`
            : '';
          if (logText) {
            finalLogText = `<span class="manager-note">[Geçmiş Kayıt]</span><span style="color:#64748b; font-size:11px;">${contactInfoStr}</span>${legacyWarning}${importWarningHtml}<br>${logText.replace(/\n/g, '<br>')}`;
          } else if (!isNewBiz) {
            finalLogText = `<span class="manager-note">[Geçmiş Kayıt]</span><span style="color:#64748b; font-size:11px;">${contactInfoStr}</span>${legacyWarning}${importWarningHtml}<br>Bu görev arşivi CSV'den aktarıldı.`;
          } else if (importWarningHtml) {
            finalLogText = `<span class="manager-note">[Geçmiş Kayıt]</span><span style="color:#64748b; font-size:11px;">${contactInfoStr}</span>${legacyWarning}${importWarningHtml}`;
          }

          if (finalLogText) {
            await tx.activityLog.create({
              data: {
                taskId: task.id,
                authorId: userId,
                text: finalLogText,
                reason: dueDateISO ? 'TEKRAR_ARANACAK' : 'YETKILIYE_ULASILDI', 
                createdAt: taskCreatedAtISO,
                followUpDate: dueDateISO,
              }
            });
          }
        });
        addedBizCount += rowAddedBizCount;
        addedTaskCount += rowAddedTaskCount;
        processedRowCount += 1;
      } catch (error: any) {
        errors.push({
          rowNumber: Number.isFinite(Number(row.rowNumber)) ? Number(row.rowNumber) : null,
          companyName: cleanCompanyName,
          message: error?.message || 'Bilinmeyen import hatasi',
        });
      }
    }

    return {
      success: true,
      addedBizCount,
      addedTaskCount,
      processedRowCount,
      failedRowCount: errors.length,
      errors,
      warningCount: warnings.length,
      warnings,
    };
  }
}
