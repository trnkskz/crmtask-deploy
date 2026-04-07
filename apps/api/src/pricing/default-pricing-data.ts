import { PrismaClient, PricingCategory } from '@prisma/client'

type PricingSeedItem = {
  name: string
  category: PricingCategory
  unitPrice: number
  commissionRate?: number | null
  description?: string | null
}

type PricingRuleGroup = {
  title: string
  rules: string[]
}

export const DEFAULT_PRICING_ITEMS: PricingSeedItem[] = [
  { name: 'Masaj - SPA', category: 'COMMISSION', unitPrice: 0, commissionRate: 20 },
  { name: 'Güzellik', category: 'COMMISSION', unitPrice: 0, commissionRate: 22.5 },
  { name: 'Aktivite - Eğlence', category: 'COMMISSION', unitPrice: 0, commissionRate: 16 },
  { name: 'İftar', category: 'COMMISSION', unitPrice: 0, commissionRate: 15.5 },
  { name: 'Kahvaltı', category: 'COMMISSION', unitPrice: 0, commissionRate: 15.5 },
  { name: 'Yemek', category: 'COMMISSION', unitPrice: 0, commissionRate: 15.5 },
  { name: 'Bilet - Etkinlik', category: 'COMMISSION', unitPrice: 0, commissionRate: 16 },
  { name: 'Hizmet', category: 'COMMISSION', unitPrice: 0, commissionRate: 19.5 },
  { name: 'Spor - Eğitim - Kurs', category: 'COMMISSION', unitPrice: 0, commissionRate: 19.5 },
  { name: 'Yılbaşı', category: 'COMMISSION', unitPrice: 0, commissionRate: 15.5 },

  { name: 'Kampanya Sayfası (Komisyonlu Model) - 1 Ay', category: 'SERVICE', unitPrice: 2500 },
  { name: 'Kampanya Sayfası (Komisyonlu Model) - 3 Ay', category: 'SERVICE', unitPrice: 5000 },
  { name: 'Tanıtım Sayfası (Komisyonsuz Model) - 1 Ay', category: 'SERVICE', unitPrice: 4500 },
  { name: 'Tanıtım Sayfası (Komisyonsuz Model) - 3 Ay', category: 'SERVICE', unitPrice: 10000 },

  { name: 'Kategori Banner - 5 Gün', category: 'DOPING', unitPrice: 3000 },
  { name: 'Kategori Banner - 7 Gün', category: 'DOPING', unitPrice: 4166.7 },
  { name: 'Kategori Vitrini (Top 5) - 3 Gün', category: 'DOPING', unitPrice: 2083 },
  { name: 'Kategori Vitrini (Top 5) - 5 Gün', category: 'DOPING', unitPrice: 3333 },
  { name: 'Instagram', category: 'DOPING', unitPrice: 1500 },
  { name: 'Mailing Banner', category: 'DOPING', unitPrice: 3750 },
  { name: 'Segment Maili', category: 'DOPING', unitPrice: 7500 },
  { name: 'Anasayfa Günün Fırsatı Banner Alanı - Maks. 2 Gün', category: 'DOPING', unitPrice: 5000 },
  { name: 'Anasayfa Listeleme - 1 Ay', category: 'DOPING', unitPrice: 20833 },
  { name: 'Anasayfa Listeleme - 1 Hafta', category: 'DOPING', unitPrice: 6250 },

  { name: "Sosyal Medya Paketleri 3'lü Paket", category: 'SOCIAL_MEDIA', unitPrice: 41666.67 },
  { name: 'AI Reels', category: 'SOCIAL_MEDIA', unitPrice: 16666.67 },
  { name: 'Mikro Influencer Paylaşımı', category: 'SOCIAL_MEDIA', unitPrice: 20833 },
  { name: 'Anlatımlı Reels', category: 'SOCIAL_MEDIA', unitPrice: 20833 },
]

export const DEFAULT_CODE_BUNDLES = [
  { name: '50 Kod', priceInc: 1000 },
  { name: '100 Kod', priceInc: 1800 },
  { name: '250 Kod', priceInc: 3750 },
]

export const DEFAULT_DISCOUNT_COUPONS: PricingRuleGroup[] = [
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
]

export async function ensureDefaultPricing(prisma: PrismaClient) {
  const [itemCount, configKeys] = await prisma.$transaction([
    prisma.pricingItem.count(),
    prisma.pricingConfig.findMany({
      where: {
        key: {
          in: ['CODE_BUNDLES', 'DISCOUNT_COUPONS'],
        },
      },
      select: {
        key: true,
      },
    }),
  ])

  const ops: any[] = []
  const existingConfigKeys = new Set(configKeys.map((item) => item.key))

  if (itemCount === 0) {
    ops.push(
      prisma.pricingItem.createMany({
        data: DEFAULT_PRICING_ITEMS.map((item) => ({
          name: item.name,
          category: item.category,
          unitPrice: item.unitPrice,
          commissionRate: item.commissionRate ?? null,
          description: item.description ?? null,
          status: 'ACTIVE',
        })),
      }),
    )
  }

  if (!existingConfigKeys.has('CODE_BUNDLES')) {
    ops.push(
      prisma.pricingConfig.upsert({
        where: { key: 'CODE_BUNDLES' },
        create: {
          key: 'CODE_BUNDLES',
          title: 'Kod Adet Paketleri',
          payload: DEFAULT_CODE_BUNDLES as any,
        },
        update: {
          title: 'Kod Adet Paketleri',
          payload: DEFAULT_CODE_BUNDLES as any,
        },
      }),
    )
  }

  if (!existingConfigKeys.has('DISCOUNT_COUPONS')) {
    ops.push(
      prisma.pricingConfig.upsert({
        where: { key: 'DISCOUNT_COUPONS' },
        create: {
          key: 'DISCOUNT_COUPONS',
          title: 'İndirim Çeki Kurguları',
          payload: DEFAULT_DISCOUNT_COUPONS as any,
        },
        update: {
          title: 'İndirim Çeki Kurguları',
          payload: DEFAULT_DISCOUNT_COUPONS as any,
        },
      }),
    )
  }

  if (ops.length === 0) {
    return { created: false }
  }

  await prisma.$transaction(ops)

  return { created: true }
}
