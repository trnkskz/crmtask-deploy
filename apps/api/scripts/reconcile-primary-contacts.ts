import { PrismaClient } from '@prisma/client'
import { reconcileAccountPrimaryContact } from '../src/common/account-primary-contact'

async function main() {
  const prisma = new PrismaClient()
  let cursor: string | undefined
  let processed = 0
  const batchSize = 100

  try {
    for (;;) {
      const accounts = await prisma.account.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      })

      if (!accounts.length) break

      for (const account of accounts) {
        await reconcileAccountPrimaryContact(prisma, account.id)
        processed += 1
      }

      cursor = accounts[accounts.length - 1]?.id
      // eslint-disable-next-line no-console
      console.log(`[reconcile-primary-contacts] processed=${processed}`)
    }

    // eslint-disable-next-line no-console
    console.log(`[reconcile-primary-contacts] done processed=${processed}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[reconcile-primary-contacts] failed', error)
  process.exitCode = 1
})
