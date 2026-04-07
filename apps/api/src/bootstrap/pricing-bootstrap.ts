import { PrismaClient } from '@prisma/client'
import { ensureDefaultPricing } from '../pricing/default-pricing-data'

export async function runPricingBootstrap() {
  const prisma = new PrismaClient()

  try {
    const result = await ensureDefaultPricing(prisma)
    if (result.created) {
      console.log('Pricing bootstrap completed')
    } else {
      console.log('Pricing bootstrap skipped: existing pricing data detected')
    }
    return result
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  runPricingBootstrap().catch((err) => {
    console.error('Pricing bootstrap failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
