import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    try {
      await this.$connect()
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('Prisma connect skipped:', e?.message || e)
    }
  }

  async enableShutdownHooks(app: INestApplication) {
    ;(this as any).$on('beforeExit', async () => {
      await app.close()
    })
  }
}
