import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'
import {
  CreatePricingDto,
  PricingListQueryDto,
  UpdatePricingDto,
  UpdatePricingRulesDto,
} from './dto/pricing.dto'

const DEFAULT_PRICING_RULES = {
  codeBundles: [
    { name: '50 Kod', priceInc: 1000 },
    { name: '100 Kod', priceInc: 1800 },
    { name: '250 Kod', priceInc: 3750 },
  ],
  discountCoupons: [
    {
      title: 'Cafe-Restoran',
      rules: [
        'Sabit Tutar: 400 TL ve üzeri -> 100 TL indirim',
        'Kademeli: 500 TL ve üzeri 800 TL ve üzeri -> 200 TL indirim',
        'Yüzdelik-Tavanlı: 500 TL ve üzeri -> %25 indirim max 200 TL',
      ],
    },
    {
      title: 'Çiçek-Çikolata-Hediye',
      rules: [
        'Sabit Tutar: 1000 TL ve üzeri -> 250 TL indirim (%25)',
        'Kademeli: 800 TL ve üzeri 1.200 TL ve üzeri -> 350 TL indirim (%29)',
        'Yüzdelik-Tavanlı: 1000 TL ve üzeri -> %25 indirim max 300 TL',
      ],
    },
  ],
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  private getPricingConfigDelegate() {
    return (this.prisma as any).pricingConfig
  }

  async list(q: PricingListQueryDto) {
    const where: any = {}
    if (q.q?.trim()) where.name = { contains: q.q.trim(), mode: 'insensitive' }
    if (q.category) where.category = q.category
    if (q.status) where.status = q.status

    const page = Number(q.page || 1)
    const take = Math.min(Number(q.limit || 20), 100)
    const skip = (page - 1) * take

    const [items, total] = await this.prisma.$transaction([
      this.prisma.pricingItem.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.pricingItem.count({ where }),
    ])

    return { items, total, page, limit: take }
  }

  async detail(id: string) {
    const item = await this.prisma.pricingItem.findUnique({ where: { id } })
    if (!item) throw new NotFoundException('Pricing item not found')
    return item
  }

  create(body: CreatePricingDto) {
    return this.prisma.pricingItem.create({
      data: {
        name: body.name,
        category: body.category as any,
        unitPrice: body.unitPrice,
        commissionRate: body.commissionRate ?? null,
        description: body.description ?? null,
        status: (body.status || 'ACTIVE') as any,
      },
    })
  }

  async update(id: string, body: UpdatePricingDto) {
    await this.detail(id)
    return this.prisma.pricingItem.update({
      where: { id },
      data: {
        name: body.name,
        category: body.category as any,
        unitPrice: body.unitPrice,
        commissionRate: body.commissionRate,
        description: body.description,
        status: body.status as any,
      },
    })
  }

  async remove(id: string) {
    await this.detail(id)
    await this.prisma.pricingItem.delete({ where: { id } })
    return { ok: true }
  }

  async getRules() {
    const pricingConfig = this.getPricingConfigDelegate()
    if (!pricingConfig?.findMany) {
      return {
        codeBundles: this.normalizeCodeBundles(undefined),
        discountCoupons: this.normalizeDiscountCoupons(undefined),
      }
    }

    try {
      const records = await pricingConfig.findMany({
        where: {
          key: {
            in: ['CODE_BUNDLES', 'DISCOUNT_COUPONS'],
          },
        },
      })

      const map = new Map<string, { payload: unknown }>(
        records.map((record: any) => [record.key, { payload: record.payload }]),
      )

      return {
        codeBundles: this.normalizeCodeBundles(map.get('CODE_BUNDLES')?.payload),
        discountCoupons: this.normalizeDiscountCoupons(map.get('DISCOUNT_COUPONS')?.payload),
      }
    } catch {
      return {
        codeBundles: this.normalizeCodeBundles(undefined),
        discountCoupons: this.normalizeDiscountCoupons(undefined),
      }
    }
  }

  async saveRules(body: UpdatePricingRulesDto) {
    const pricingConfig = this.getPricingConfigDelegate()
    const codeBundles = this.normalizeCodeBundles(body.codeBundles)
    const discountCoupons = this.normalizeDiscountCoupons(body.discountCoupons)

    if (!pricingConfig?.upsert) {
      return {
        codeBundles,
        discountCoupons,
      }
    }

    await this.prisma.$transaction([
      pricingConfig.upsert({
        where: { key: 'CODE_BUNDLES' },
        create: {
          key: 'CODE_BUNDLES',
          title: 'Kod Adet Paketleri',
          payload: codeBundles as any,
        },
        update: {
          title: 'Kod Adet Paketleri',
          payload: codeBundles as any,
        },
      }),
      pricingConfig.upsert({
        where: { key: 'DISCOUNT_COUPONS' },
        create: {
          key: 'DISCOUNT_COUPONS',
          title: 'İndirim Çeki Kurguları',
          payload: discountCoupons as any,
        },
        update: {
          title: 'İndirim Çeki Kurguları',
          payload: discountCoupons as any,
        },
      }),
    ])

    return this.getRules()
  }

  private normalizeCodeBundles(value: unknown) {
    const source = Array.isArray(value) ? value : DEFAULT_PRICING_RULES.codeBundles
    return source
      .map((item) => ({
        name: String((item as any)?.name || '').trim(),
        priceInc: Number((item as any)?.priceInc || 0),
      }))
      .filter((item) => item.name)
  }

  private normalizeDiscountCoupons(value: unknown) {
    const source = Array.isArray(value) ? value : DEFAULT_PRICING_RULES.discountCoupons
    return source
      .map((group) => ({
        title: String((group as any)?.title || '').trim(),
        rules: Array.isArray((group as any)?.rules)
          ? (group as any).rules.map((rule: unknown) => String(rule || '').trim()).filter(Boolean)
          : [],
      }))
      .filter((group) => group.title)
  }
}
